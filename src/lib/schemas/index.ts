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

// Inferred convenience types (subset checks; not the canonical @/types).
export type AssetInput = z.infer<typeof assetSchema>;
export type AlertInput = z.infer<typeof alertSchema>;
export type BackupRunInput = z.infer<typeof backupRunSchema>;
