/**
 * @/mock/generators/automation — step 15 of the generation DAG (docs/06 §9.7).
 *
 * Seeded automation surface: 5 Playbooks, 3 AutomationPolicies (demonstrating the
 * once → all → always spine), ~80 historical ActionRuns, ~10 ApprovalRequests
 * (mix pending/approved/rejected), and ~250 AuditLogEntries. Run/audit history is
 * attributed to the seeded users + policies so the activity feed reads real.
 *
 * Deterministic — `automation` PRNG stream. References only real action / mode ids
 * (referential integrity asserted in fixtures).
 */

import type {
  Playbook,
  AutomationPolicy,
  ActionRun,
  ApprovalRequest,
  AuditLogEntry,
  User,
  ProtectedAsset,
  Alert,
  ActionRunState,
  AuditVerb,
  EntityRef,
} from "@/types";
import { rng, pick, int, weighted, type Rng } from "../prng";
import { NOW_MS } from "../seed";
import { ACTION_BY_ID } from "../reference/action-catalog";
import { ORG_ID, defaultApprover, techByIndex } from "./org-users";

function minToIso(min: number): string {
  return new Date(NOW_MS - min * 60_000).toISOString();
}

// ── Seeded playbooks (docs/06 §9.2: 5) ──────────────────────────────────────

const PLAYBOOK_SPECS: Array<Omit<Playbook, "orgId" | "createdBy" | "lastRunAt">> = [
  {
    id: "PB-WEDGED-AGENT",
    name: "Wedged agent recovery",
    description:
      "Restart the agent service, repair communications, then run a backup to confirm the agent is healthy again.",
    forFailureModeIds: ["agent-secure-comms-401", "agent-not-checking-in", "agent-service-stopped"],
    defaultScope: "all-matching",
    steps: [
      { actionId: "restart-agent-service", params: { verifyAfter: true }, runIf: "always", haltOnFailure: false },
      { actionId: "repair-agent-comms", params: { verifyAfter: true }, runIf: "prev-failed", haltOnFailure: false },
      { actionId: "run-backup-now", params: { verifyAfter: true }, runIf: "prev-succeeded", haltOnFailure: true },
    ],
  },
  {
    id: "PB-VSS-REPAIR",
    name: "VSS writer repair",
    description:
      "Query VSS writer state, restart the affected writers, clear stale shadow copies, and re-run the backup.",
    forFailureModeIds: ["vss-writer-snapshot-failure", "vss-snapshot-prepare-failure"],
    defaultScope: "all-matching",
    steps: [
      { actionId: "query-vss-writer-status", params: {}, runIf: "always", haltOnFailure: false },
      { actionId: "repair-vss-writers", params: { verifyAfter: true }, runIf: "always", haltOnFailure: false },
      { actionId: "clear-stale-shadow-copies", params: { verifyAfter: true }, runIf: "prev-failed", haltOnFailure: false },
      { actionId: "run-backup-now", params: { verifyAfter: true }, runIf: "prev-succeeded", haltOnFailure: true },
    ],
  },
  {
    id: "PB-COSMETIC-SCREENSHOT",
    name: "Screenshot timing tune-up",
    description:
      "Classify the screenshot failure, increase the additional wait time for false-failures, then re-run verification.",
    forFailureModeIds: ["screenshot-getting-devices-ready-timing", "screenshot-blank-black-timing"],
    defaultScope: "all-matching",
    steps: [
      { actionId: "classify-screenshot-failure", params: {}, runIf: "always", haltOnFailure: false },
      { actionId: "increase-wait-time", params: { additionalWaitSec: 600, verifyAfter: true }, runIf: "always", haltOnFailure: false },
      { actionId: "rerun-screenshot", params: {}, runIf: "always", haltOnFailure: false },
    ],
  },
  {
    id: "PB-MASS-REAUTH",
    name: "Tenant mass reauthorization",
    description:
      "Re-check authorization status, queue a bulk Global Admin consent, and send the reauth reminder digest for outstanding seats.",
    forFailureModeIds: ["ews-graph-reauthorization-deadline", "sharepoint-site-manager-reauth"],
    defaultScope: "all-matching",
    steps: [
      { actionId: "recheck-authorization-status", params: {}, runIf: "always", haltOnFailure: false },
      { actionId: "bulk-reauth-queue", params: { dryRun: false }, runIf: "always", haltOnFailure: false },
      { actionId: "send-reauth-reminder-digest", params: {}, runIf: "always", haltOnFailure: false },
    ],
  },
  {
    id: "PB-POOL-RELIEF",
    name: "Storage pool relief",
    description:
      "Show the top consumers, apply the suggested retention to the heaviest agents, and forecast days-until-full after the merge.",
    forFailureModeIds: ["storage-pool-full-backups-skipped"],
    defaultScope: "all-matching",
    steps: [
      { actionId: "show-top-storage-consumers", params: {}, runIf: "always", haltOnFailure: false },
      { actionId: "apply-suggested-retention", params: { localRetentionDays: 21, dryRun: false }, runIf: "always", haltOnFailure: false },
      { actionId: "forecast-days-until-full", params: {}, runIf: "always", haltOnFailure: false },
    ],
  },
];

export function generatePlaybooks(users: User[]): Playbook[] {
  const r = rng("automation");
  return PLAYBOOK_SPECS.map((spec, i) => ({
    ...spec,
    orgId: ORG_ID,
    createdBy: techByIndex(users, i).id,
    lastRunAt: minToIso(int(r, 60, 60 * 24 * 14)),
  }));
}

// ── Seeded policies (3 — the "always" spine) ────────────────────────────────

export function generatePolicies(): AutomationPolicy[] {
  const r = rng("automation-pol");
  return [
    {
      id: "POL-AUTO-COMMS",
      orgId: ORG_ID,
      name: "Auto-repair agent comms (VIP clients)",
      trigger: { failureModeId: "agent-secure-comms-401" },
      appliesTo: { tags: ["vip-client"], productBuckets: ["bcdr"] },
      action: { kind: "action", refId: "repair-agent-comms", params: { verifyAfter: true } },
      approvalRule: "never",
      enabled: true,
      dryRunFirst: false,
      stats: { triggered: int(r, 18, 40), succeeded: int(r, 14, 34), lastFiredAt: minToIso(int(r, 30, 600)) },
    },
    {
      id: "POL-AUTO-SCREENSHOT",
      orgId: ORG_ID,
      name: "Tune wait-time on cosmetic screenshot failures",
      trigger: { failureModeId: "screenshot-getting-devices-ready-timing" },
      appliesTo: { productBuckets: ["bcdr"] },
      action: { kind: "playbook", refId: "PB-COSMETIC-SCREENSHOT", params: {} },
      approvalRule: "never",
      enabled: true,
      dryRunFirst: true,
      stats: { triggered: int(r, 30, 70), succeeded: int(r, 28, 66), lastFiredAt: minToIso(int(r, 60, 900)) },
    },
    {
      id: "POL-AUTO-MERGE",
      orgId: ORG_ID,
      name: "Force diff-merge after 5 failed screenshots",
      trigger: { failureModeId: "diff-merge-chain-rebuild-long" },
      appliesTo: { productBuckets: ["bcdr", "endpoint"] },
      action: { kind: "action", refId: "force-merge", params: { verifyAfter: true } },
      approvalRule: "over-threshold",
      enabled: false,
      dryRunFirst: true,
      stats: { triggered: int(r, 5, 18), succeeded: int(r, 4, 16), lastFiredAt: minToIso(int(r, 600, 60 * 24 * 5)) },
    },
  ];
}

// ── Historical action runs + approvals + audit ──────────────────────────────

const RUN_STATE_WEIGHTS: Record<ActionRunState, number> = {
  succeeded: 64,
  partial: 10,
  failed: 8,
  "rolled-back": 3,
  skipped: 3,
  "awaiting-approval": 6,
  queued: 3,
  running: 3,
};

/** Build a result summary line for an action run. */
function summarize(r: Rng, actionId: string, state: ActionRunState, count: number): string {
  const action = ACTION_BY_ID[actionId];
  const label = action?.label ?? actionId;
  if (state === "partial") return `${label}: succeeded on ${count - int(r, 1, 2)} of ${count} targets`;
  if (state === "failed") return `${label} failed on ${count} target${count > 1 ? "s" : ""}`;
  if (state === "rolled-back") return `${label} rolled back after verification regression`;
  if (action?.outcome === "opens-ticket") return `Assembled support package; opened DAT-TKT-${int(r, 80000, 89999)}`;
  if (action?.outcome === "guidance-only") return `${label}: checklist completed`;
  return `${label} succeeded on ${count} target${count > 1 ? "s" : ""}`;
}

export interface AutomationHistory {
  actionRuns: ActionRun[];
  approvals: ApprovalRequest[];
  auditLog: AuditLogEntry[];
}

/**
 * Build ~80 ActionRuns, ~10 ApprovalRequests, ~250 AuditLogEntries, attributed to
 * the seeded staff + policies and targeting real (preferably alerting) assets.
 */
export function generateAutomationHistory(
  users: User[],
  assets: ProtectedAsset[],
  alerts: Alert[],
): AutomationHistory {
  const r = rng("automation-hist");
  const actionRuns: ActionRun[] = [];
  const approvals: ApprovalRequest[] = [];
  const auditLog: AuditLogEntry[] = [];

  const approver = defaultApprover(users);
  const alertingAssetIds = Array.from(new Set(alerts.map((a) => a.assetId).filter(Boolean))) as string[];
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const actionIds = Object.keys(ACTION_BY_ID);

  let auditSeq = 90000;
  const audit = (entry: Omit<AuditLogEntry, "id">) => {
    auditLog.push({ id: `AUD-${auditSeq}`, ...entry });
    auditSeq += int(r, 1, 3);
  };

  // 80 historical action runs.
  for (let i = 0; i < 80; i += 1) {
    const actionId = pick(r, actionIds);
    const action = ACTION_BY_ID[actionId];
    const triggerKind = weighted(r, { user: 60, policy: 28, playbook: 12 }) as
      | "user"
      | "policy"
      | "playbook";
    const refId =
      triggerKind === "user"
        ? techByIndex(users, i).id
        : triggerKind === "policy"
          ? pick(r, ["POL-AUTO-COMMS", "POL-AUTO-SCREENSHOT", "POL-AUTO-MERGE"])
          : pick(r, ["PB-WEDGED-AGENT", "PB-VSS-REPAIR", "PB-MASS-REAUTH"]);

    const scope = weighted(r, { once: 50, "all-matching": 38, always: 12 }) as
      | "once"
      | "all-matching"
      | "always";
    const targetCount = scope === "once" ? 1 : int(r, 2, 9);
    const targetRefs: EntityRef[] = [];
    for (let t = 0; t < targetCount; t += 1) {
      const aid = alertingAssetIds.length
        ? pick(r, alertingAssetIds)
        : pick(r, assets).id;
      const asset = assetById.get(aid);
      targetRefs.push({ kind: "asset", id: aid, label: asset?.displayName ?? aid });
    }

    let state = weighted(r, RUN_STATE_WEIGHTS) as ActionRunState;
    // Destructive/over-threshold actions that aren't done yet sit awaiting approval.
    const needsApproval = action?.requiresApproval !== "never";
    if (needsApproval && r() < 0.4) state = "awaiting-approval";

    const startedMin = int(r, 30, 60 * 24 * 21);
    const finished = state !== "queued" && state !== "running" && state !== "awaiting-approval";
    const auditId = `AUD-${auditSeq}`;
    const run: ActionRun = {
      id: `ACT-${(i + 1).toString(16).toUpperCase().padStart(4, "0")}`,
      actionId,
      triggeredBy: { kind: triggerKind, refId },
      scope,
      targetRefs,
      paramsUsed: {},
      state,
      dryRun: action?.supportsDryRun ? r() < 0.18 : false,
      startedAt: minToIso(startedMin),
      finishedAt: finished ? minToIso(startedMin - int(r, 1, 30)) : undefined,
      resultSummary: finished ? summarize(r, actionId, state, targetCount) : undefined,
      auditLogEntryIds: [auditId],
    };

    // Approval request for awaiting-approval runs.
    if (state === "awaiting-approval") {
      const apId = `APR-${(approvals.length + 1).toString().padStart(3, "0")}`;
      run.approvalRequestId = apId;
      const decisionDraw = weighted(r, { pending: 50, approved: 35, rejected: 15 }) as
        | "pending"
        | "approved"
        | "rejected";
      approvals.push({
        id: apId,
        requestedFor: { kind: "action-run", refId: run.id },
        requestedBy: techByIndex(users, i).id,
        reason: action?.destructive ? "destructive" : action?.reversible ? "over-threshold" : "irreversible",
        blastRadius: {
          assetCount: targetCount,
          preview: `${action?.label ?? actionId} across ${targetCount} asset${targetCount > 1 ? "s" : ""}`,
        },
        state: decisionDraw,
        decidedBy: decisionDraw === "pending" ? undefined : approver.id,
        decidedAt: decisionDraw === "pending" ? undefined : minToIso(startedMin - int(r, 5, 60)),
        note:
          decisionDraw === "rejected"
            ? "Blast radius too large during business hours — reschedule to the maintenance window."
            : undefined,
      });
    }

    actionRuns.push(run);

    // Audit entry for the run.
    audit({
      at: run.startedAt ?? minToIso(startedMin),
      actor: { kind: triggerKind === "playbook" ? "user" : triggerKind, refId },
      verb: "ran-action",
      subjectRef: targetRefs[0],
      scope,
      outcome:
        state === "succeeded" ? "succeeded" : state === "partial" ? "partial" : state === "failed" ? "failed" : undefined,
      detail: run.resultSummary ?? `${action?.label ?? actionId} dispatched (${state})`,
    });
  }

  // Top up approvals to ~10 with a couple of standalone policy-fire approvals.
  while (approvals.length < 10) {
    const i = approvals.length;
    const decisionDraw = weighted(r, { pending: 50, approved: 30, rejected: 20 }) as
      | "pending"
      | "approved"
      | "rejected";
    const count = int(r, 4, 24);
    approvals.push({
      id: `APR-${(i + 1).toString().padStart(3, "0")}`,
      requestedFor: { kind: "policy-fire", refId: "POL-AUTO-MERGE" },
      requestedBy: techByIndex(users, i).id,
      reason: "over-threshold",
      blastRadius: { assetCount: count, preview: `Force Diff Merge across ${count} agents (over threshold)` },
      state: decisionDraw,
      decidedBy: decisionDraw === "pending" ? undefined : approver.id,
      decidedAt: decisionDraw === "pending" ? undefined : minToIso(int(r, 30, 600)),
    });
  }

  // Sprinkle additional audit entries (policy enables, approvals, suppressions).
  const extraVerbs: AuditVerb[] = ["approved", "rejected", "enabled-policy", "suppressed-alert", "created-playbook", "overrode"];
  while (auditLog.length < 250) {
    const verb = pick(r, extraVerbs);
    const actor = techByIndex(users, auditLog.length);
    audit({
      at: minToIso(int(r, 30, 60 * 24 * 30)),
      actor: { kind: "user", refId: actor.id },
      verb,
      subjectRef:
        verb === "enabled-policy"
          ? { kind: "policy", id: pick(r, ["POL-AUTO-COMMS", "POL-AUTO-SCREENSHOT", "POL-AUTO-MERGE"]) }
          : verb === "created-playbook"
            ? { kind: "playbook", id: pick(r, ["PB-WEDGED-AGENT", "PB-VSS-REPAIR"]) }
            : verb === "suppressed-alert" && alerts.length
              ? { kind: "alert", id: pick(r, alerts).id }
              : { kind: "asset", id: pick(r, assets).id },
      outcome: verb === "approved" ? "succeeded" : undefined,
      detail:
        verb === "approved"
          ? `${actor.name} approved a pending over-threshold action`
          : verb === "rejected"
            ? `${actor.name} rejected a pending action (blast radius)`
            : verb === "enabled-policy"
              ? `${actor.name} toggled an automation policy`
              : verb === "suppressed-alert"
                ? `${actor.name} suppressed a known-limitation alert`
                : verb === "created-playbook"
                  ? `${actor.name} edited a playbook`
                  : `${actor.name} overrode a default scope`,
    });
  }

  return { actionRuns, approvals, auditLog };
}
