/**
 * @/lib/schemas — light zod schemas for the most-rendered entities.
 *
 * Best-effort runtime guards for mock fixtures (Asset / Alert / BackupRun) — not
 * exhaustive. They mirror the enums in @/types so seed data fails loudly if it
 * drifts. Kept intentionally minimal (BUILD-CONTRACT §6).
 */

import { z } from "zod";

// ── Shared enum schemas ──────────────────────────────────────────────────────

export const assetStatusSchema = z.enum([
  "protected",
  "warning",
  "failed",
  "paused",
  "syncing",
  "offline",
]);

export const severitySchema = z.enum(["critical", "warning", "info", "success"]);

export const assetKindSchema = z.enum([
  "agent",
  "agentless",
  "endpoint",
  "saas-seat",
  "salesforce-org",
  "share",
]);

export const productTypeSchema = z.enum([
  "bcdr",
  "endpoint-v1",
  "endpoint-v2",
  "saas-protect",
  "spanning",
]);

export const runStateSchema = z.enum([
  "queued",
  "running",
  "success",
  "success-crash-consistent",
  "failed",
  "skipped",
  "cancelled",
  "stuck",
]);

export const failureCategorySchema = z.enum([
  "Storage/ZFS",
  "Backup Chain",
  "Agent Communication",
  "Screenshot/Local Verification",
  "Cloud Sync",
  "Diff-Merge/Chain Rebuild",
  "Local Virtualization",
  "BMR",
  "File Restore",
  "Networking",
  "Ransomware Detection",
  "OAuth/Auth",
  "API Throttling",
  "Licensing/Seats",
  "Reporting",
]);

const isoDateTime = z.string().min(1);

const backupRunSummarySchema = z.object({
  runId: z.string(),
  state: runStateSchema,
  at: isoDateTime,
  isCosmetic: z.boolean().optional(),
});

// ── Entity schemas (minimal: common fields only) ─────────────────────────────

/** Validates the shared ProtectedAssetBase shape; variant facets pass through. */
export const assetSchema = z
  .object({
    id: z.string(),
    kind: assetKindSchema,
    productType: productTypeSchema,
    clientId: z.string(),
    siteId: z.string().optional(),
    applianceId: z.string().optional(),
    displayName: z.string().min(1),
    status: assetStatusSchema,
    lastGoodBackupAt: isoDateTime.optional(),
    protectionEnabled: z.boolean(),
    recentRuns: z.array(backupRunSummarySchema),
    openAlertIds: z.array(z.string()),
    tags: z.array(z.string()),
  })
  .loose();

export const alertSchema = z
  .object({
    id: z.string(),
    clientId: z.string(),
    assetId: z.string().optional(),
    source: z.enum([
      "backup-run",
      "verification",
      "comms",
      "storage",
      "sync",
      "auth",
      "platform",
    ]),
    severity: severitySchema,
    category: failureCategorySchema,
    title: z.string().min(1),
    rawError: z.string().optional(),
    failureModeId: z.string().optional(),
    state: z.enum([
      "open",
      "acknowledged",
      "suppressed",
      "resolved",
      "auto-resolved",
    ]),
    isCosmetic: z.boolean(),
    firstSeenAt: isoDateTime,
    lastSeenAt: isoDateTime,
    occurrenceCount: z.number().int().nonnegative(),
    incidentId: z.string().optional(),
  })
  .loose();

export const backupRunSchema = z
  .object({
    id: z.string(),
    jobId: z.string(),
    assetId: z.string(),
    startedAt: isoDateTime,
    finishedAt: isoDateTime.optional(),
    state: runStateSchema,
    mode: z.enum([
      "full",
      "incremental",
      "differential-merge",
      "saas-sync",
    ]),
    consistency: z.enum(["application", "crash-consistent-dbd"]).optional(),
    bytesTransferred: z.number().nonnegative().optional(),
    recoveryPointId: z.string().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    failureModeId: z.string().optional(),
  })
  .loose();

// Shared building blocks for the persisted schemas below (also reused by the
// other-store schemas further down). Defined here so the activity-store entries
// can validate the nested refs/scope their consumers dereference.
export const actionScopeSchema = z.enum(["once", "all-matching", "always"]);

const entityRefSchema = z.object({ kind: z.string(), id: z.string() }).loose();

// ── Activity-store entries (persisted to localStorage; validated on merge) ────
// These guard rehydrated runtime activity (P2-5/P3-6): each persisted entry is
// safeParse'd on merge so a malformed/garbage payload is dropped rather than
// trusted. Loose so legitimately-richer entries survive — but STRICT on every
// field the Run-history / Audit tables dereference, so a partial entry can never
// reach the table and crash on `undefined.kind` / `undefined.length` (#5). The
// nested shapes mirror the exact consumer contract (run-history-table.tsx,
// audit-log.tsx).

export const actionRunEntrySchema = z
  .object({
    id: z.string().min(1),
    actionId: z.string(),
    // run-history-table derefs triggeredBy.kind/.refId → TRIGGER_META[kind].
    triggeredBy: z
      .object({
        kind: z.enum(["user", "playbook", "policy", "ai"]),
        refId: z.string(),
      })
      .loose(),
    // …r.targetRefs.length and …SCOPE_LABEL[r.scope].
    targetRefs: z.array(entityRefSchema),
    scope: actionScopeSchema,
    state: z.string().min(1),
    startedAt: isoDateTime,
  })
  .loose();

export const auditLogEntrySchema = z
  .object({
    id: z.string().min(1),
    at: isoDateTime,
    // audit-log derefs actor.kind → ACTOR_KIND_META[kind], and VERB_META[verb];
    // an unknown verb/kind would index a meta map to undefined and crash.
    actor: z
      .object({
        kind: z.enum(["user", "policy", "system", "ai"]),
        refId: z.string(),
      })
      .loose(),
    verb: z.enum([
      "ran-action",
      "approved",
      "rejected",
      "created-playbook",
      "enabled-policy",
      "suppressed-alert",
      "overrode",
      "rolled-back",
    ]),
    // …entry.subjectRef.id / .label.
    subjectRef: entityRefSchema,
    detail: z.string(),
  })
  .loose();

export const assetOverrideSchema = z.object({
  status: assetStatusSchema,
  resolvedAt: isoDateTime,
});

export const alertOverrideSchema = z.object({
  state: z.literal("resolved"),
  resolvedAt: isoDateTime,
});

// ── Persisted zustand-store entries (#12) ────────────────────────────────────
// Schemas for the OTHER persisted stores (approvals / policies / playbooks /
// saved-views / action-cart), so their merge() can drop malformed-or-spoofed
// localStorage instead of trusting raw JSON. Highest-value: approvalPayload,
// which feeds resumeApprovedRun on approve — a spoofed payload could execute.
// (actionScopeSchema + entityRefSchema are defined above with the activity entries.)

export const approvalPayloadSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("action"),
      actionId: z.string().min(1),
      targetRefs: z.array(entityRefSchema),
      scope: actionScopeSchema,
      params: z.record(z.string(), z.unknown()),
    })
    .loose(),
  z
    .object({
      kind: z.literal("chain"),
      steps: z.array(
        z
          .object({
            actionId: z.string().min(1),
            scope: actionScopeSchema,
            params: z.record(z.string(), z.unknown()),
          })
          .loose(),
      ),
      targetRefs: z.array(entityRefSchema),
      scope: actionScopeSchema,
    })
    .loose(),
]);

export const approvalRequestSchema = z
  .object({
    id: z.string().min(1),
    requestedFor: z
      .object({
        kind: z.enum(["action-run", "policy-fire"]),
        refId: z.string(),
      })
      .loose(),
    requestedBy: z.string(),
    reason: z.enum([
      "destructive",
      "irreversible",
      "over-threshold",
      "policy-default",
    ]),
    blastRadius: z
      .object({ assetCount: z.number(), preview: z.string() })
      .loose(),
    state: z.enum(["pending", "approved", "rejected", "expired"]),
    payload: approvalPayloadSchema.optional(),
  })
  .loose();

const policyTriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("failure-mode"), failureModeId: z.string() }).loose(),
  z.object({ kind: z.literal("category"), category: z.string() }).loose(),
]);

export const automationPolicySchema = z
  .object({
    id: z.string().min(1),
    orgId: z.string(),
    name: z.string().min(1),
    trigger: policyTriggerSchema,
    action: z
      .object({
        kind: z.enum(["action", "playbook"]),
        refId: z.string(),
        params: z.record(z.string(), z.unknown()),
      })
      .loose(),
    enabled: z.boolean(),
  })
  .loose();

export const playbookSchema = z
  .object({
    id: z.string().min(1),
    orgId: z.string(),
    name: z.string().min(1),
    steps: z.array(z.object({ actionId: z.string().min(1) }).loose()),
    defaultScope: actionScopeSchema,
  })
  .loose();

export const savedViewSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    surface: z.enum(["fleet", "alerts", "incidents", "playbooks", "audit"]),
  })
  .loose();

export const cartStepSchema = z
  .object({
    uid: z.string().min(1),
    actionId: z.string().min(1),
    params: z.record(z.string(), z.unknown()),
    scope: actionScopeSchema,
  })
  .loose();

/**
 * Filter an unknown (rehydrated) value to the array entries that pass `schema` —
 * the shared "don't trust localStorage" primitive for every persisted store's
 * merge(). Non-arrays yield []. Cap keeps a corrupt payload from growing memory.
 */
export function keepValid<T>(
  value: unknown,
  schema: { safeParse: (v: unknown) => { success: boolean } },
  cap = 500,
): T[] {
  return Array.isArray(value)
    ? (value.filter((x) => schema.safeParse(x).success) as T[]).slice(0, cap)
    : [];
}

// Inferred convenience types (subset checks; not the canonical @/types).
export type AssetInput = z.infer<typeof assetSchema>;
export type AlertInput = z.infer<typeof alertSchema>;
export type BackupRunInput = z.infer<typeof backupRunSchema>;
