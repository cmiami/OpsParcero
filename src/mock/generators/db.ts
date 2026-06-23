/**
 * @/mock/generators/db — the in-memory database shape the DAG assembles.
 *
 * Every generator returns its slice; `fixtures.ts` threads them together into one
 * frozen `MockDB` at module load. The DB is the single source the swappable read
 * API (`@/mock/query`) and the Issue builder (`@/mock/issues`) draw from. No
 * randomness or clock access lives here — only the typed container + a couple of
 * pure index helpers shared across generators.
 */

import type {
  Organization,
  User,
  Client,
  Site,
  Appliance,
  StoragePool,
  OffsiteSync,
  ProtectedAsset,
  BackupJob,
  BackupRun,
  RecoveryPoint,
  ScreenshotVerification,
  Alert,
  Incident,
  Playbook,
  AutomationPolicy,
  ActionRun,
  ApprovalRequest,
  AuditLogEntry,
  AssetId,
} from "@/types";

/**
 * The whole generated fleet, post-DAG. Arrays are the canonical collections;
 * the `*ById` maps are convenience indexes the query layer rebuilds once.
 */
export interface MockDB {
  org: Organization;
  users: User[];
  clients: Client[];
  sites: Site[];
  appliances: Appliance[];
  storagePools: StoragePool[];
  offsiteSyncs: OffsiteSync[];
  assets: ProtectedAsset[];
  jobs: BackupJob[];
  /** Full run history, but only for the ~30 "focus" assets (deep drill-down). */
  runs: BackupRun[];
  recoveryPoints: RecoveryPoint[];
  screenshotVerifications: ScreenshotVerification[];
  alerts: Alert[];
  incidents: Incident[];
  playbooks: Playbook[];
  policies: AutomationPolicy[];
  actionRuns: ActionRun[];
  approvals: ApprovalRequest[];
  auditLog: AuditLogEntry[];
  /** The subset of asset ids that carry a full BackupRun[] history. */
  focusAssetIds: Set<AssetId>;
}

/** Build a fast id index over any entity carrying a string `id`. */
export function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) m.set(r.id, r);
  return m;
}

/** Group rows by a derived key. Deterministic given a deterministic input. */
export function groupBy<T, K extends string>(
  rows: T[],
  keyOf: (row: T) => K | undefined,
): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k === undefined) continue;
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}
