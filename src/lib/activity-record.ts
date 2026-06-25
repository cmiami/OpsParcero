/**
 * activity-record — turn a simulated apply (RunnerOutcome) into the durable
 * ActionRun + AuditLogEntry that the Run history / Audit surfaces read, and
 * persist them to the {@link useActivity} store.
 *
 * Called only from event handlers (a confirm onClick, a stream "done") so the
 * timestamps/ids are minted at runtime — never at module scope or render.
 */
"use client";

import { makeUid } from "@/stores/uid";
import { useActivity } from "@/stores/activity";
import { getUsers, getOrg, getAsset } from "@/mock/query";
import { ACTION_BY_ID } from "@/mock/reference";
import type {
  ActionRun,
  AuditLogEntry,
  ActionScope,
  ActionRunState,
  ApprovalPayload,
  AlertId,
  EntityRef,
  AssetId,
  AssetStatus,
  AutomationPolicy,
  AutomationPolicyId,
  FailureModeId,
  ProductBucket,
} from "@/types";
import { simulateRun, runChain, type RunnerOutcome, type ChainStepInput } from "@/mock/runner";

export type TriggeredBy = {
  kind: "user" | "playbook" | "policy" | "ai";
  refId: string;
};

function currentUserRef(): string {
  return getUsers()[0]?.id ?? "usr-self";
}

function auditOutcome(
  state: ActionRunState,
): "succeeded" | "failed" | "partial" | undefined {
  if (state === "succeeded") return "succeeded";
  if (state === "failed") return "failed";
  if (state === "partial") return "partial";
  return undefined;
}

export interface BuildRecordsInput {
  actionId: string;
  actionLabel: string;
  targets: EntityRef[];
  scope: ActionScope;
  params?: Record<string, unknown>;
  outcome: RunnerOutcome;
  by?: TriggeredBy;
}

/** Build the ActionRun + AuditLogEntry for one simulated apply (no persistence). */
export function buildActivityRecords(input: BuildRecordsInput): {
  run: ActionRun;
  audit: AuditLogEntry;
} {
  const by = input.by ?? { kind: "user", refId: currentUserRef() };
  const now = new Date().toISOString();
  const auditId = makeUid("aud") as AuditLogEntry["id"];
  const subject: EntityRef =
    input.targets[0] ?? ({ kind: "asset", id: "unknown" } as EntityRef);

  const run: ActionRun = {
    id: makeUid("run") as ActionRun["id"],
    actionId: input.actionId as ActionRun["actionId"],
    triggeredBy: { kind: by.kind, refId: by.refId },
    scope: input.scope,
    targetRefs: input.targets,
    paramsUsed: input.params ?? {},
    state: input.outcome.state,
    dryRun: Boolean(input.outcome.preview),
    startedAt: now,
    finishedAt: now,
    resultSummary: input.outcome.resultSummary,
    auditLogEntryIds: [auditId],
  };

  const audit: AuditLogEntry = {
    id: auditId,
    at: now,
    actor: {
      kind: by.kind === "playbook" ? "user" : by.kind,
      refId: by.refId,
    },
    verb: "ran-action",
    subjectRef: subject,
    scope: input.scope,
    outcome: auditOutcome(input.outcome.state),
    detail: `${input.actionLabel} — ${input.outcome.resultSummary}`,
  };

  return { run, audit };
}

/**
 * The asset ids a run actually HEALED — only the per-target results that
 * succeeded. A `partial` outcome heals some targets and leaves others failed
 * ("still failing — escalate"); healing the whole target list would flip those
 * failed assets to protected and make fleet state lie. Callers pass this to the
 * heal channel instead of the raw target list.
 */
export function healedAssetIds(outcome: RunnerOutcome): AssetId[] {
  return outcome.perTarget
    .filter((t) => t.state === "succeeded" && t.ref.kind === "asset")
    .map((t) => t.ref.id as AssetId);
}

/**
 * Build + persist the records for one simulated apply, optionally healing the
 * targeted assets' health. Returns the created ActionRun.
 */
export function recordSimulatedRun(
  input: BuildRecordsInput & {
    heal?: { assetIds: AssetId[]; status: AssetStatus };
  },
): ActionRun {
  const { run, audit } = buildActivityRecords(input);
  // A heal also closes the healed assets' open alerts (P2-4) — so a fix that
  // turns an asset green doesn't leave that asset's alerts sitting open on the
  // Alerts page / asset-detail Alerts tab.
  const resolveAlertIds = input.heal
    ? input.heal.assetIds.flatMap((id) => getAsset(id)?.openAlertIds ?? [])
    : undefined;
  useActivity
    .getState()
    .record({ runs: [run], audit: [audit], heal: input.heal, resolveAlertIds });
  return run;
}

/**
 * Record a terminal agent (Guided / AI) fix run against a single asset, healing
 * it on success — so the consoles' "recorded in Run history and Audit" copy is
 * true. Synthesizes a RunnerOutcome from the session's terminal state.
 */
export function recordAgentRun(input: {
  assetId: AssetId;
  actionId?: string;
  actionLabel: string;
  scope: ActionScope;
  state: ActionRunState;
  summary: string;
  by?: TriggeredBy;
  heal?: { status: AssetStatus };
}): ActionRun {
  const targets: EntityRef[] = [{ kind: "asset", id: input.assetId } as EntityRef];
  const outcome: RunnerOutcome = {
    state: input.state,
    resultSummary: input.summary,
    perTarget: [],
    healsAsset: Boolean(input.heal),
    healedStatus: input.heal?.status,
  };
  return recordSimulatedRun({
    actionId: input.actionId ?? "agent-fix",
    actionLabel: input.actionLabel,
    targets,
    scope: input.scope,
    outcome,
    by: input.by,
    heal: input.heal
      ? { assetIds: [input.assetId], status: input.heal.status }
      : undefined,
  });
}

/**
 * Build a standing auto-remediation policy from an "always"-scoped apply, so the
 * Policies page shows the rule the user just created (runtime — ids minted here).
 *
 * A policy is created **paused** (`enabled: false`): standing automation that
 * fires unattended on future failures is opt-in, not armed by one modal click —
 * the same draft-then-publish model the AutomationPolicyEditor uses. Breadth
 * decides the trigger: a `failureModeId` yields a single-mode trigger; its
 * absence yields a `category`-wide trigger (no empty-string sentinel).
 */
export function buildAutomationPolicy(input: {
  failureModeId?: string;
  category: string;
  actionId: string;
  productBucket?: ProductBucket;
}): AutomationPolicy {
  return {
    id: makeUid("pol") as AutomationPolicyId,
    orgId: getOrg().id,
    name: `Auto-fix: ${input.category}`,
    trigger: input.failureModeId
      ? { kind: "failure-mode", failureModeId: input.failureModeId as FailureModeId }
      : { kind: "category", category: input.category },
    appliesTo: input.productBucket ? { productBuckets: [input.productBucket] } : {},
    action: { kind: "action", refId: input.actionId, params: {} },
    approvalRule: "over-threshold",
    enabled: false,
    dryRunFirst: true,
    stats: { triggered: 0, succeeded: 0 },
  };
}

/**
 * Record an audit entry for a standing policy the user just created (P1-6) — so
 * arming auto-remediation always leaves a trail, never a silent one-click. The
 * policy is created paused; this entry records that creation.
 */
export function recordPolicyCreated(input: {
  policyId: string;
  policyName: string;
}): void {
  const now = new Date().toISOString();
  useActivity.getState().record({
    runs: [],
    audit: [
      {
        id: makeUid("aud") as AuditLogEntry["id"],
        at: now,
        actor: { kind: "user", refId: currentUserRef() },
        verb: "enabled-policy",
        subjectRef: { kind: "policy", id: input.policyId },
        detail: `Created standing policy "${input.policyName}" — paused pending approval.`,
      },
    ],
  });
}

/**
 * Record a manual alert-triage decision (P3-7) so real-semantic verbs leave a
 * durable trail like the fix path — not just a toast. "resolved" also closes the
 * alert everywhere (alertOverrides); "acknowledged" only audits (acknowledged
 * alerts stay in the queue). snooze / assign stay toast-only (no modeled state).
 */
export function recordAlertTriage(input: {
  alertId: AlertId;
  alertTitle: string;
  assetId?: AssetId;
  verb: "resolved" | "acknowledged";
}): void {
  const now = new Date().toISOString();
  const resolves = input.verb === "resolved";
  useActivity.getState().record({
    runs: [],
    audit: [
      {
        id: makeUid("aud") as AuditLogEntry["id"],
        at: now,
        actor: { kind: "user", refId: currentUserRef() },
        verb: resolves ? "suppressed-alert" : "overrode",
        subjectRef: input.assetId
          ? { kind: "asset", id: input.assetId }
          : { kind: "alert", id: input.alertId },
        outcome: "succeeded",
        detail: `${resolves ? "Resolved" : "Acknowledged"} alert: ${input.alertTitle}`,
      },
    ],
    resolveAlertIds: resolves ? [input.alertId] : undefined,
  });
}

/**
 * Resume an approval-gated dispatch once it is APPROVED (P1-3): run the held
 * action/chain for real (approved:true) and persist the run(s) + heal, so
 * approving in the queue actually executes — not merely flips the card state.
 * Reuses simulateRun / runChain + recordSimulatedRun; no new run path.
 */
export function resumeApprovedRun(payload: ApprovalPayload): void {
  if (payload.kind === "action") {
    const action = ACTION_BY_ID[payload.actionId];
    if (!action) return;
    const outcome = simulateRun(
      action,
      payload.targetRefs,
      payload.scope,
      payload.params,
      { approved: true },
    );
    const healed = healedAssetIds(outcome);
    recordSimulatedRun({
      actionId: action.id,
      actionLabel: action.label,
      targets: payload.targetRefs,
      scope: payload.scope,
      params: payload.params,
      outcome,
      heal:
        outcome.healsAsset && healed.length
          ? { assetIds: healed, status: outcome.healedStatus ?? "protected" }
          : undefined,
    });
    return;
  }

  // chain
  const resolved: ChainStepInput[] = payload.steps.flatMap((s) => {
    const action = ACTION_BY_ID[s.actionId];
    return action ? [{ action, params: s.params, scope: s.scope }] : [];
  });
  const chain = runChain(resolved, payload.targetRefs, payload.scope, {
    approved: true,
  });
  chain.steps.forEach((stepResult, i) => {
    const step = resolved[i];
    if (!stepResult.ran || !step) return;
    const healed = healedAssetIds(stepResult.outcome);
    recordSimulatedRun({
      actionId: step.action.id,
      actionLabel: step.action.label,
      targets: payload.targetRefs,
      scope: step.scope ?? payload.scope,
      params: step.params,
      outcome: stepResult.outcome,
      heal:
        stepResult.outcome.healsAsset && healed.length
          ? {
              assetIds: healed,
              status: stepResult.outcome.healedStatus ?? "protected",
            }
          : undefined,
    });
  });
}

/**
 * Record a REJECTED approval decision (P1-3) as an audit entry — so a refusal is
 * trailed too, and the held dispatch is provably not executed.
 */
export function recordApprovalRejected(
  payload: ApprovalPayload,
  note?: string,
): void {
  const actionId =
    payload.kind === "action"
      ? payload.actionId
      : (payload.steps[0]?.actionId ?? "chain");
  const action = ACTION_BY_ID[actionId];
  const subject: EntityRef = payload.targetRefs[0] ?? {
    kind: "asset",
    id: "unknown",
  };
  const now = new Date().toISOString();
  useActivity.getState().record({
    runs: [],
    audit: [
      {
        id: makeUid("aud") as AuditLogEntry["id"],
        at: now,
        actor: { kind: "user", refId: currentUserRef() },
        verb: "rejected",
        subjectRef: subject,
        scope: payload.scope,
        outcome: "failed",
        detail: `Rejected ${action?.label ?? actionId}${note ? ` — ${note}` : ""}. Not executed.`,
      },
    ],
  });
}
