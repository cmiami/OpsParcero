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
import { getUsers, getOrg } from "@/mock/query";
import type {
  ActionRun,
  AuditLogEntry,
  ActionScope,
  ActionRunState,
  EntityRef,
  AssetId,
  AssetStatus,
  AutomationPolicy,
  AutomationPolicyId,
  FailureModeId,
  ProductBucket,
} from "@/types";
import type { RunnerOutcome } from "@/mock/runner";

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
 * Build + persist the records for one simulated apply, optionally healing the
 * targeted assets' health. Returns the created ActionRun.
 */
export function recordSimulatedRun(
  input: BuildRecordsInput & {
    heal?: { assetIds: AssetId[]; status: AssetStatus };
  },
): ActionRun {
  const { run, audit } = buildActivityRecords(input);
  useActivity.getState().record({ runs: [run], audit: [audit], heal: input.heal });
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
      ? { failureModeId: input.failureModeId as FailureModeId }
      : { failureModeId: "" as FailureModeId },
    appliesTo: input.productBucket ? { productBuckets: [input.productBucket] } : {},
    action: { kind: "action", refId: input.actionId, params: {} },
    approvalRule: "over-threshold",
    enabled: true,
    dryRunFirst: true,
    stats: { triggered: 0, succeeded: 0 },
  };
}
