/**
 * Fleet adapter — the engine's view of the app's seeded fleet (single source of
 * truth). Reads the cached DB + reference catalogs directly (no lucide/React).
 */
import { DB } from "@/mock/fixtures";
import { buildIssues } from "@/mock/issues";
import {
  FAILURE_MODE_BY_ID,
  ACTION_BY_ID,
  ACTION_CATALOG,
} from "@/mock/reference";
import { NOW_MS } from "@/mock/seed";
import type {
  AssetId,
  ProtectedAsset,
  Issue,
  FailureMode,
  RemediationAction,
} from "../domain";

let _issues: Issue[] | null = null;
function allIssues(): Issue[] {
  return (_issues ??= buildIssues(DB));
}

export function getAsset(id: AssetId): ProtectedAsset | undefined {
  return DB.assets.find((a) => a.id === id);
}

export function getIssue(id: string): Issue | undefined {
  return allIssues().find((i) => i.id === id);
}

export function getIssuesForAsset(id: AssetId): Issue[] {
  return allIssues().filter((i) => i.impactedAssetIds.includes(id));
}

export function primaryIssueForAsset(id: AssetId): Issue | undefined {
  return getIssuesForAsset(id)[0];
}

export function getFailureMode(id: string): FailureMode | undefined {
  return FAILURE_MODE_BY_ID[id];
}

// ─────────────────────────────────────────────────────────────────────────────
// applyHeal — mutate the shared in-memory asset toward health after a SUCCESSFUL
// remediation, so the follow-up diagnostic in the verify phase reads "healthy"
// and the troubleshoot → fix → verify loop closes visibly.
//
// The backends + diagnostics never mutate the DB (they are pure simulators); the
// tool/loop owns the heal. We apply the remediation's projected StateDiff.after,
// but ONLY the keys that are real, writable asset facets (whitelist) — never raw
// transcript noise. We also flip `status` toward health and refresh
// lastGoodBackupAt. Fixtures rebuild from seed each process, so a fresh process
// always starts from the failing state again (reset-on-rerun).
// ─────────────────────────────────────────────────────────────────────────────

/** Facet keys a heal may write onto an asset (union across all asset variants). */
const HEALABLE_FACETS = new Set<string>([
  // base
  "status",
  "protectionEnabled",
  "lastGoodBackupAt",
  // agent
  "vssStatus",
  "pairingStatus",
  "driverStatus",
  "sealed",
  "backupChainState",
  // agentless
  "cbtStatus",
  "stalledSnapshots",
  "vmwareToolsState",
  // endpoint
  "cbtFilterStatus",
  "meteredPaused",
  "supportabilityFlags",
  // saas-seat
  "authStatus",
  "archived",
  "billedWhileArchived",
  "licensed",
  // salesforce-org
  "apiCallCapPct",
  "apiUsage",
  // share
  "credentialStatus",
]);

/** A reversible record of what a single applyHeal() changed, for safety. */
export interface HealRecord {
  assetId: AssetId;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/**
 * Apply a successful remediation's projected `after` facet values onto the live
 * shared asset, returning the before/after so the caller can reverse it. Only
 * known facet keys are written; `status` is only allowed to improve (failed →
 * warning → protected, never the reverse) so a partial fix can't regress health.
 * `lastGoodBackupAt` is refreshed deterministically from the seeded clock when a
 * remediation healed (nowIso defaults to the frozen NOW).
 */
export function applyHeal(
  assetId: AssetId,
  after: Record<string, unknown>,
  nowIso: string = new Date(NOW_MS).toISOString(),
): HealRecord | undefined {
  const asset = DB.assets.find((a) => a.id === assetId);
  if (!asset) return undefined;
  const target = asset as unknown as Record<string, unknown>;

  const rank: Record<string, number> = { failed: 0, warning: 1, syncing: 2, protected: 3 };
  const before: Record<string, unknown> = {};
  const applied: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(after)) {
    if (!HEALABLE_FACETS.has(key)) continue;
    if (!(key in target)) continue; // facet not on this variant
    if (value === undefined) continue;
    if (key === "status") {
      const cur = String(target.status);
      const next = String(value);
      // Only move status toward health; never regress.
      if ((rank[next] ?? -1) <= (rank[cur] ?? -1)) continue;
    }
    if (target[key] === value) continue; // already there — idempotent
    before[key] = target[key];
    target[key] = value;
    applied[key] = value;
  }

  // A genuine heal earns a fresh good-backup timestamp + protection on.
  if (target.status === "protected") {
    if (target.lastGoodBackupAt !== nowIso) {
      before.lastGoodBackupAt ??= target.lastGoodBackupAt;
      target.lastGoodBackupAt = nowIso;
      applied.lastGoodBackupAt = nowIso;
    }
    if (target.protectionEnabled !== true) {
      before.protectionEnabled ??= target.protectionEnabled;
      target.protectionEnabled = true;
      applied.protectionEnabled = true;
    }
  }

  if (Object.keys(applied).length === 0) return undefined;
  return { assetId, before, after: applied };
}

/** Reverse a HealRecord — restores the prior facet values (test/rollback aid). */
export function revertHeal(record: HealRecord): void {
  const asset = DB.assets.find((a) => a.id === record.assetId);
  if (!asset) return;
  const target = asset as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(record.before)) {
    target[key] = value;
  }
}

// Snapshot every asset's healable facets at module import — BEFORE any test runs
// a heal — so the seeded failing state can be restored between tests. applyHeal
// only ever REPLACES a facet's reference (never mutates in place), so retaining
// the original reference and reassigning it is a faithful restore.
const _seedFacets: ReadonlyMap<AssetId, Record<string, unknown>> = new Map(
  DB.assets.map((a) => {
    const rec = a as unknown as Record<string, unknown>;
    const snap: Record<string, unknown> = {};
    for (const k of HEALABLE_FACETS) if (k in rec) snap[k] = rec[k];
    return [a.id, snap] as const;
  }),
);

/**
 * Restore every asset's healable facets to the seeded values. Call in an
 * `afterEach` so a heal-mutating test (applyHeal writes the shared module-level
 * DB) can't leak healed state into a later test — making the suite order- and
 * shuffle-independent (finding #7).
 */
export function resetFleet(): void {
  for (const a of DB.assets) {
    const snap = _seedFacets.get(a.id);
    if (!snap) continue;
    const rec = a as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(snap)) rec[k] = v;
  }
}

export function getAction(id: string): RemediationAction | undefined {
  return ACTION_BY_ID[id];
}

export { DB, ACTION_CATALOG, FAILURE_MODE_BY_ID, ACTION_BY_ID };
