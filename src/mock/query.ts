/**
 * @/mock/query — the swappable read API over the cached mock DB.
 *
 * The whole UI reads through these pure, deterministic functions (filter / sort /
 * paginate over `DB`); swapping the mock for a real backend later means swapping
 * this module, not the components. No mutation, no randomness, no wall clock —
 * everything derives from `@/mock/fixtures.DB` + reference data.
 */

import type {
  ProtectedAsset,
  Client,
  Site,
  Appliance,
  StoragePool,
  OffsiteSync,
  Alert,
  Incident,
  BackupRun,
  RecoveryPoint,
  ScreenshotVerification,
  Playbook,
  AutomationPolicy,
  ActionRun,
  ApprovalRequest,
  AuditLogEntry,
  User,
  Organization,
  RemediationAction,
  FailureMode,
  Issue,
  AssetFilter,
  AlertFilter,
  SortSpec,
  AssetId,
  ClientId,
  AlertId,
  FailureModeId,
  ProductBucket,
  Severity,
} from "@/types";
import { productTypeToBucket } from "@/types";
import { compareStatus } from "@/lib/status";
import { relativeTime } from "@/lib/format";
import { DB } from "./fixtures";
import { buildIssues, groupIssuesByCategory, type IssueCategoryGroup } from "./issues";
import { ACTION_CATALOG, ACTION_BY_ID } from "./reference/action-catalog";
import { FAILURE_MODES, FAILURE_MODE_BY_ID } from "./reference/failure-modes";

// ── small helpers ───────────────────────────────────────────────────────────

/** Cached issue list (built once from the frozen DB). */
const ISSUES: Issue[] = buildIssues(DB);
const ISSUE_CATEGORIES: IssueCategoryGroup[] = groupIssuesByCategory(ISSUES);

function lc(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

/** Generic field comparator for the sort layer. */
function compareField(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

function paginate<T>(rows: T[], page = 0, pageSize = 50): Page<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

// ── Assets ──────────────────────────────────────────────────────────────────

/** Does an asset pass the filter? */
function assetMatches(a: ProtectedAsset, f: AssetFilter): boolean {
  if (f.productBuckets?.length && !f.productBuckets.includes(productTypeToBucket(a.productType)))
    return false;
  if (f.productTypes?.length && !f.productTypes.includes(a.productType)) return false;
  if (f.kinds?.length && !f.kinds.includes(a.kind)) return false;
  if (f.statuses?.length && !f.statuses.includes(a.status)) return false;
  if (f.clientIds?.length && !f.clientIds.includes(a.clientId)) return false;
  if (f.siteIds?.length && (!a.siteId || !f.siteIds.includes(a.siteId))) return false;
  if (f.tags?.length && !f.tags.some((t) => a.tags.includes(t))) return false;
  if (f.realOnly) {
    // Exclude assets whose open alerts are all cosmetic warnings.
    const open = DB.alerts.filter((al) => a.openAlertIds.includes(al.id));
    if (open.length > 0 && open.every((al) => al.isCosmetic)) return false;
  }
  if (f.search) {
    const q = lc(f.search);
    const hay = `${lc(a.displayName)} ${lc(a.id)} ${a.tags.join(" ")}`;
    if (!hay.includes(q)) return false;
  }
  return true;
}

function sortAssets(rows: ProtectedAsset[], sort?: SortSpec): ProtectedAsset[] {
  if (!sort) {
    // Default: worst status first, then most-recent failure.
    return [...rows].sort(
      (a, b) =>
        compareStatus(a.status, b.status) ||
        compareField(b.lastGoodBackupAt, a.lastGoodBackupAt),
    );
  }
  const dir = sort.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (sort.field === "status") return compareStatus(a.status, b.status) * dir;
    const av = (a as unknown as Record<string, unknown>)[sort.field];
    const bv = (b as unknown as Record<string, unknown>)[sort.field];
    return compareField(av, bv) * dir;
  });
}

/** Filtered, sorted, paginated assets. */
export function getAssets(
  filter: AssetFilter = {},
  sort?: SortSpec,
  page = 0,
  pageSize = 50,
): Page<ProtectedAsset> {
  const filtered = DB.assets.filter((a) => assetMatches(a, filter));
  return paginate(sortAssets(filtered, sort), page, pageSize);
}

/** Single asset by id. */
export function getAsset(id: AssetId): ProtectedAsset | undefined {
  return DB.assets.find((a) => a.id === id);
}

/** All assets for a client (unpaginated, sorted worst-first). */
export function getAssetsForClient(clientId: ClientId): ProtectedAsset[] {
  return sortAssets(DB.assets.filter((a) => a.clientId === clientId));
}

// ── Clients / inventory ───────────────────────────────────────────────────────

export function getClients(): Client[] {
  return [...DB.clients].sort((a, b) =>
    compareStatus(a.healthRollup.status, b.healthRollup.status),
  );
}

export function getClient(id: ClientId): Client | undefined {
  return DB.clients.find((c) => c.id === id);
}

export function getSites(clientId?: ClientId): Site[] {
  return clientId ? DB.sites.filter((s) => s.clientId === clientId) : DB.sites;
}

export function getAppliances(clientId?: ClientId): Appliance[] {
  if (!clientId) return DB.appliances;
  const siteIds = new Set(DB.sites.filter((s) => s.clientId === clientId).map((s) => s.id));
  return DB.appliances.filter((a) => siteIds.has(a.siteId));
}

export function getAppliance(id: string): Appliance | undefined {
  return DB.appliances.find((a) => a.id === id);
}

export function getStoragePool(id: string): StoragePool | undefined {
  return DB.storagePools.find((p) => p.id === id);
}

export function getStoragePools(): StoragePool[] {
  return DB.storagePools;
}

/** Used percentage for a pool (derived, since the entity stores raw bytes). */
export function poolUsedPct(pool: StoragePool): number {
  if (pool.capacityBytes <= 0) return 0;
  return pool.usedBytes / pool.capacityBytes;
}

export function getOffsiteSyncs(): OffsiteSync[] {
  return DB.offsiteSyncs;
}

export function getOffsiteSyncForAppliance(applianceId: string): OffsiteSync | undefined {
  return DB.offsiteSyncs.find((s) => s.applianceId === applianceId);
}

// ── Alerts ────────────────────────────────────────────────────────────────────

function alertMatches(a: Alert, f: AlertFilter): boolean {
  if (f.productBuckets?.length) {
    const asset = a.assetId ? getAsset(a.assetId) : undefined;
    const bucket = asset ? productTypeToBucket(asset.productType) : undefined;
    if (!bucket || !f.productBuckets.includes(bucket)) return false;
  }
  if (f.severities?.length && !f.severities.includes(a.severity)) return false;
  if (f.categories?.length && !f.categories.includes(a.category)) return false;
  if (f.states?.length && !f.states.includes(a.state)) return false;
  if (f.clientIds?.length && !f.clientIds.includes(a.clientId)) return false;
  if (f.cosmetic !== undefined && a.isCosmetic !== f.cosmetic) return false;
  if (f.search) {
    const q = lc(f.search);
    const hay = `${lc(a.title)} ${lc(a.rawError)} ${lc(a.id)} ${lc(a.category)}`;
    if (!hay.includes(q)) return false;
  }
  return true;
}

function alertSeverityRank(s: Severity): number {
  return s === "critical" ? 0 : s === "warning" ? 1 : s === "info" ? 2 : 3;
}

/** Filtered alerts, worst-severity + most-recent first. */
export function getAlerts(filter: AlertFilter = {}): Alert[] {
  return DB.alerts
    .filter((a) => alertMatches(a, filter))
    .sort(
      (a, b) =>
        alertSeverityRank(a.severity) - alertSeverityRank(b.severity) ||
        compareField(b.lastSeenAt, a.lastSeenAt),
    );
}

/** Only the open / actionable alerts (excludes resolved). */
export function getOpenAlerts(filter: AlertFilter = {}): Alert[] {
  return getAlerts(filter).filter(
    (a) => a.state === "open" || a.state === "acknowledged",
  );
}

export function getAlert(id: AlertId): Alert | undefined {
  return DB.alerts.find((a) => a.id === id);
}

export function getAlertsForAsset(assetId: AssetId): Alert[] {
  return DB.alerts.filter((a) => a.assetId === assetId);
}

// ── Issues (product model) ─────────────────────────────────────────────────────

export interface IssueFilter {
  productBuckets?: ProductBucket[];
  fixTypes?: Issue["fixType"][];
  categories?: Issue["category"][];
  severities?: Severity[];
  /** Tenant scope: keep only issues impacting one of these clients' assets. */
  clientIds?: ClientId[];
  realOnly?: boolean;
  search?: string;
}

/** Filtered issue list (already worst-first from the builder). */
export function getIssues(filter: IssueFilter = {}): Issue[] {
  // Build the tenant's asset-id set once when scoping by client.
  const clientAssetIds =
    filter.clientIds?.length
      ? new Set(
          DB.assets
            .filter((a) => filter.clientIds!.includes(a.clientId))
            .map((a) => a.id),
        )
      : null;
  return ISSUES.filter((i) => {
    if (filter.productBuckets?.length && !filter.productBuckets.includes(i.productBucket))
      return false;
    if (filter.fixTypes?.length && !filter.fixTypes.includes(i.fixType)) return false;
    if (filter.categories?.length && !filter.categories.includes(i.category)) return false;
    if (filter.severities?.length && !filter.severities.includes(i.severity)) return false;
    if (
      clientAssetIds &&
      !i.impactedAssetIds.some((id) => clientAssetIds.has(id))
    )
      return false;
    if (filter.realOnly && i.isCosmetic) return false;
    if (filter.search) {
      const q = lc(filter.search);
      const hay = `${lc(i.title)} ${lc(i.detail)} ${lc(i.category)} ${lc(i.problem)}`;
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function getIssue(id: string): Issue | undefined {
  return ISSUES.find((i) => i.id === id);
}

/** The category-grouped view for the Resolution Center home. */
export function getIssueCategories(clientId?: ClientId): IssueCategoryGroup[] {
  // Unscoped → the precomputed worst-first groups. Scoped → regroup just this
  // tenant's issues so the category list matches the scoped KPIs.
  if (!clientId) return ISSUE_CATEGORIES;
  return groupIssuesByCategory(getIssues({ clientIds: [clientId] }));
}

// ── Runs / recovery points ─────────────────────────────────────────────────────

/** Full BackupRun history for a focus asset (newest first). */
export function getBackupRuns(assetId: AssetId): BackupRun[] {
  return DB.runs
    .filter((r) => r.assetId === assetId)
    .sort((a, b) => compareField(b.startedAt, a.startedAt));
}

export function getRecoveryPoints(assetId: AssetId): RecoveryPoint[] {
  return DB.recoveryPoints
    .filter((p) => p.assetId === assetId)
    .sort((a, b) => compareField(b.takenAt, a.takenAt));
}

export function getScreenshotVerifications(assetId: AssetId): ScreenshotVerification[] {
  const rpIds = new Set(getRecoveryPoints(assetId).map((p) => p.id));
  return DB.screenshotVerifications.filter((v) => rpIds.has(v.recoveryPointId));
}

// ── Remediation actions / failure modes ─────────────────────────────────────────

export function getAllActions(): RemediationAction[] {
  return ACTION_CATALOG;
}

export function getAction(id: string): RemediationAction | undefined {
  return ACTION_BY_ID[id];
}

/** The ordered (primary-first) actions a failure mode offers. */
export function getActionsForFailureMode(modeId: FailureModeId): RemediationAction[] {
  const mode = FAILURE_MODE_BY_ID[modeId];
  if (!mode) return [];
  return mode.remediationActionIds
    .map((id) => ACTION_BY_ID[id])
    .filter((a): a is RemediationAction => Boolean(a));
}

export function getFailureModes(): FailureMode[] {
  return FAILURE_MODES;
}

export function getFailureMode(id: FailureModeId): FailureMode | undefined {
  return FAILURE_MODE_BY_ID[id];
}

// ── Automation surface ──────────────────────────────────────────────────────────

export function getPlaybooks(): Playbook[] {
  return DB.playbooks;
}

export function getPlaybook(id: string): Playbook | undefined {
  return DB.playbooks.find((p) => p.id === id);
}

export function getPolicies(): AutomationPolicy[] {
  return DB.policies;
}

export function getPolicy(id: string): AutomationPolicy | undefined {
  return DB.policies.find((p) => p.id === id);
}

export function getActionRuns(): ActionRun[] {
  return [...DB.actionRuns].sort((a, b) =>
    compareField(b.startedAt ?? "", a.startedAt ?? ""),
  );
}

export function getApprovals(): ApprovalRequest[] {
  return DB.approvals;
}

/** Pending approvals only — the approver inbox. */
export function getPendingApprovals(): ApprovalRequest[] {
  return DB.approvals.filter((a) => a.state === "pending");
}

export function getAuditLog(): AuditLogEntry[] {
  return [...DB.auditLog].sort((a, b) => compareField(b.at, a.at));
}

// ── Incidents / outage ──────────────────────────────────────────────────────────

export function getIncidents(): Incident[] {
  return DB.incidents;
}

export function getIncident(id: string): Incident | undefined {
  return DB.incidents.find((i) => i.id === id);
}

/** The single active outage to surface as a banner, if any (worst scope first). */
export function getActiveOutage(): Incident | undefined {
  const active = DB.incidents.filter((i) => i.status === "active");
  const scopeRank: Record<Incident["scope"], number> = {
    fleet: 0,
    pod: 1,
    appliance: 2,
    tenant: 3,
  };
  return active.sort((a, b) => scopeRank[a.scope] - scopeRank[b.scope])[0];
}

// ── People / org ────────────────────────────────────────────────────────────────

export function getOrg(): Organization {
  return DB.org;
}

export function getUsers(): User[] {
  return DB.users;
}

export function getUser(id: string): User | undefined {
  return DB.users.find((u) => u.id === id);
}

// ── Fleet KPI rollups ─────────────────────────────────────────────────────────

export interface ProductKpi {
  bucket: ProductBucket;
  openIssues: number;
  criticalIssues: number;
  endToEndFixable: number;
  affectedAssets: number;
}

export interface FleetStats {
  totalAssets: number;
  protectedAssets: number;
  failedAssets: number;
  warningAssets: number;
  openIssues: number;
  criticalIssues: number;
  endToEndFixable: number;
  guidedFixable: number;
  insightsOnly: number;
  resolvedToday: number;
  openAlerts: number;
  cosmeticAlerts: number;
  pendingApprovals: number;
  activeIncidents: number;
  perProduct: ProductKpi[];
  /** Most-recent resolved-today timestamp, human relative (or undefined). */
  lastResolvedRelative?: string;
}

/** KPI rollups for the Resolution Center home + product tiles. */
export function getFleetStats(clientId?: ClientId): FleetStats {
  // Tenant scope: when a client is active, every KPI counts only that client's
  // assets / issues / alerts (issues belong to a client via their impacted assets).
  const assets = clientId
    ? DB.assets.filter((a) => a.clientId === clientId)
    : DB.assets;
  const assetIds = clientId ? new Set(assets.map((a) => a.id)) : null;
  const issues = assetIds
    ? ISSUES.filter((i) => i.impactedAssetIds.some((id) => assetIds.has(id)))
    : ISSUES;
  const alerts = clientId
    ? DB.alerts.filter((a) => a.clientId === clientId)
    : DB.alerts;

  const protectedAssets = assets.filter((a) => a.status === "protected").length;
  const failedAssets = assets.filter((a) => a.status === "failed").length;
  const warningAssets = assets.filter((a) => a.status === "warning").length;

  const resolvedToday = alerts.filter(
    (a) =>
      (a.state === "resolved" || a.state === "auto-resolved") &&
      relativeTime(a.lastSeenAt).includes("h ago"),
  ).length;
  const lastResolved = alerts
    .filter((a) => a.state === "resolved" || a.state === "auto-resolved")
    .map((a) => a.lastSeenAt)
    .sort()
    .slice(-1)[0];

  const perBucket = (bucket: ProductBucket): ProductKpi => {
    const bucketIssues = issues.filter((i) => i.productBucket === bucket);
    const affected = new Set<string>();
    // A cross-tenant issue can impact assets in other tenants; when scoped, only
    // count this tenant's affected assets so the KPI doesn't leak across tenants.
    bucketIssues.forEach((i) =>
      i.impactedAssetIds.forEach((id) => {
        if (!assetIds || assetIds.has(id)) affected.add(id);
      }),
    );
    return {
      bucket,
      openIssues: bucketIssues.length,
      criticalIssues: bucketIssues.filter((i) => i.severity === "critical").length,
      endToEndFixable: bucketIssues.filter((i) => i.fixType === "full").length,
      affectedAssets: affected.size,
    };
  };

  return {
    totalAssets: assets.length,
    protectedAssets,
    failedAssets,
    warningAssets,
    openIssues: issues.length,
    criticalIssues: issues.filter((i) => i.severity === "critical").length,
    endToEndFixable: issues.filter((i) => i.fixType === "full").length,
    guidedFixable: issues.filter((i) => i.fixType === "partial").length,
    insightsOnly: issues.filter(
      (i) => i.fixType === "external" || i.fixType === "manual" || i.fixType === "unknown",
    ).length,
    resolvedToday,
    openAlerts: alerts.filter((a) => a.state === "open").length,
    cosmeticAlerts: alerts.filter((a) => a.isCosmetic && a.state === "open").length,
    pendingApprovals: DB.approvals.filter((a) => a.state === "pending").length,
    activeIncidents: DB.incidents.filter((i) => i.status === "active").length,
    perProduct: [perBucket("bcdr"), perBucket("saas"), perBucket("endpoint")],
    lastResolvedRelative: lastResolved ? relativeTime(lastResolved) : undefined,
  };
}
