/**
 * @/types — Kaseya Resolution Center domain backbone.
 *
 * Single barrel re-exporting every enum, entity interface, and view type used
 * across the front-end mock. Derived from docs/05-domain-model.md (§3–§10),
 * docs/00-vision-and-scope.md (Issue / fix-classification model), and the
 * BUILD-CONTRACT (§5). Front-end mock only — all timestamps are ISO strings.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 0. Primitive aliases
// ─────────────────────────────────────────────────────────────────────────────

/** ISO-8601 timestamp string, e.g. "2026-06-22T14:00:00Z". Never a Date object. */
export type ISODateTime = string;
/** ISO-8601 date string (no time), e.g. "2027-03-01". */
export type ISODate = string;

// Branded-ish id aliases (kept as plain string for ergonomic mock data).
export type OrgId = string;
export type ClientId = string;
export type SiteId = string;
export type ApplianceId = string;
export type StoragePoolId = string;
export type OffsiteSyncId = string;
export type AssetId = string;
export type BackupJobId = string;
export type BackupRunId = string;
export type RecoveryPointId = string;
export type ScreenshotVerifId = string;
export type AlertId = string;
export type IncidentId = string;
export type FailureModeId = string;
export type RemediationActionId = string;
export type ActionRunId = string;
export type ChainRunId = string;
export type PlaybookId = string;
export type AutomationPolicyId = string;
export type ApprovalRequestId = string;
export type AuditLogEntryId = string;
export type UserId = string;
export type SavedViewId = string;
export type IssueId = string;

/** A typed pointer to any entity, for alert subjects / action targets / audit subjects. */
export interface EntityRef {
  kind:
    | "asset"
    | "run"
    | "recovery-point"
    | "storage-pool"
    | "offsite-sync"
    | "appliance"
    | "alert"
    | "incident"
    | "client"
    | "playbook"
    | "policy"
    | "action-run";
  id: string;
  label?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Core enums (BUILD-CONTRACT §5 — names are load-bearing)
// ─────────────────────────────────────────────────────────────────────────────

/** Visible health badge on every asset/rollup. Never rendered color-only. */
export type AssetStatus =
  | "protected"
  | "warning"
  | "failed"
  | "paused"
  | "syncing"
  | "offline";

/** Alert/issue severity. Alerts use critical/warning; info/success exist for completeness. */
export type Severity = "critical" | "warning" | "info" | "success";

/** Fix classification (docs/00 §3). full=End-to-end, partial=Guided, rest=Insights only. */
export type FixType = "full" | "partial" | "external" | "manual" | "unknown";

/** The six surfaced product types. */
export type ProductType =
  | "bcdr"
  | "endpoint-v1"
  | "endpoint-v2"
  | "saas-protect"
  | "spanning";

/** Coarse product bucket used by the three top-level product filters. */
export type ProductBucket = "saas" | "bcdr" | "endpoint";

/** ProtectedAsset discriminator. */
export type AssetKind =
  | "agent"
  | "agentless"
  | "endpoint"
  | "saas-seat"
  | "salesforce-org"
  | "share";

/** BackupRun lifecycle / outcome. */
export type RunState =
  | "queued"
  | "running"
  | "success"
  | "success-crash-consistent"
  | "failed"
  | "skipped"
  | "cancelled"
  | "stuck";

/** Image-chain (ZFS Inverse Chain) condition. */
export type ChainState =
  | "ok"
  | "needs-diff-merge"
  | "rebuilding"
  | "corrupt"
  | "verifying";

/** The verb a RemediationAction performs. */
export type ActionType =
  | "run-now"
  | "repair"
  | "reconfigure"
  | "restart-service"
  | "re-pair-auth"
  | "reauthorize-oauth"
  | "force-merge"
  | "force-retention"
  | "resume-sync"
  | "throttle-adjust"
  | "unseal-decrypt"
  | "restore"
  | "virtualize"
  | "suppress-alert"
  | "assemble-support-ticket"
  | "guidance-runbook";

/** The once → all → always spine. */
export type ActionScope = "once" | "all-matching" | "always";

/** ActionRun lifecycle. */
export type ActionRunState =
  | "queued"
  | "awaiting-approval"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "rolled-back"
  | "skipped";

/** Cloud-product OAuth / consent state. */
export type AuthStatus =
  | "authorized"
  | "consent-required"
  | "token-revoked"
  | "reauth-required"
  | "expired";

/** When an action/policy fire requires human approval. */
export type ApprovalRule = "never" | "over-threshold" | "always";

/**
 * Raw severity as it appears in the research failure-catalog, before mapping to
 * the design-system `Severity` token. Carried on `FailureMode.catalogSeverity`
 * so the catalog stays traceable to its source (docs/06 §2 `CatalogSeverity`).
 */
export type CatalogSeverity = "critical" | "high" | "medium" | "low";

/** Failure taxonomy (docs/05 §8 — from the research). */
export type FailureCategory =
  | "Storage/ZFS"
  | "Backup Chain"
  | "Agent Communication"
  | "Screenshot/Local Verification"
  | "Cloud Sync"
  | "Diff-Merge/Chain Rebuild"
  | "Local Virtualization"
  | "BMR"
  | "File Restore"
  | "Networking"
  | "Ransomware Detection"
  | "OAuth/Auth"
  | "API Throttling"
  | "Licensing/Seats"
  | "Reporting";

// Secondary enums referenced by entity fields.
export type DeviceStatus = "online" | "offline" | "degraded";
export type DattoRegion = string;
export type SaasSeatType =
  | "exchange"
  | "onedrive"
  | "sharepoint"
  | "teams"
  | "gmail"
  | "gdrive";
/** Where Recovery Launchpad runs a recovery/test. Not a product. */
export type RecoveryTarget = "local-device" | "datto-cloud";
export type AuditVerb =
  | "ran-action"
  | "approved"
  | "rejected"
  | "created-playbook"
  | "enabled-policy"
  | "suppressed-alert"
  | "overrode"
  | "rolled-back";

// ─────────────────────────────────────────────────────────────────────────────
// 2. Bucket mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Map a fine-grained ProductType to its coarse top-level bucket. */
export function productTypeToBucket(p: ProductType): ProductBucket {
  switch (p) {
    case "saas-protect":
    case "spanning":
      return "saas";
    case "endpoint-v1":
    case "endpoint-v2":
      return "endpoint";
    case "bcdr":
    default:
      return "bcdr";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Shared value objects
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeWindow {
  /** "22:00" */ start: string;
  /** "06:00" */ end: string;
  days?: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
}

export interface RetentionPolicy {
  localDays?: number;
  cloudDays?: number;
  /** Decoupled local/cloud retention for DEB v2 (90d..7y). */
  intelligentRetention?: boolean;
}

export interface ThrottleProfile {
  transmitLimitMbps?: number;
  /** The throttle=0 deadlock guard. */
  unlimited?: boolean;
}

/** Compact summary of a recent run for the dot-strip. */
export interface BackupRunSummary {
  runId: BackupRunId;
  state: RunState;
  at: ISODateTime;
  isCosmetic?: boolean;
}

/** Rollup health for a client/site/appliance. */
export interface StatusRollup {
  status: AssetStatus;
  protected: number;
  warning: number;
  failed: number;
  paused: number;
  syncing: number;
  offline: number;
  total: number;
}

/** Outcome of a local-verify / screenshot test attached to a recovery point. */
export interface VerificationResult {
  outcome: "passed" | "failed" | "not-run";
  classification:
    | "verified"
    | "cosmetic-failure"
    | "real-boot-failure"
    | "indeterminate";
  signal?: string;
  ranAt?: ISODateTime;
}

/** Error/string signals a FailureMode matches against to classify an alert. */
export interface MatchSignal {
  field: "errorCode" | "errorMessage" | "signal" | "state";
  /** Verbatim, mono in UI: "0x0000007B", "AADSTS500014", "429". */
  contains: string;
}

export interface ActionParamSpec {
  key: string;
  label: string;
  type: "number" | "string" | "boolean" | "select" | "duration-sec" | "mbps";
  required?: boolean;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  unit?: string;
}

export interface SortSpec {
  field: string;
  dir: "asc" | "desc";
}

/** Reusable filter over the fleet table. */
export interface AssetFilter {
  productBuckets?: ProductBucket[];
  productTypes?: ProductType[];
  kinds?: AssetKind[];
  statuses?: AssetStatus[];
  clientIds?: ClientId[];
  siteIds?: SiteId[];
  tags?: string[];
  search?: string;
  realOnly?: boolean; // exclude cosmetic warnings
}

/** Reusable filter over the alert queue. */
export interface AlertFilter {
  productBuckets?: ProductBucket[];
  severities?: Severity[];
  categories?: FailureCategory[];
  states?: Alert["state"][];
  clientIds?: ClientId[];
  cosmetic?: boolean;
  search?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tenancy & inventory (docs/05 §2)
// ─────────────────────────────────────────────────────────────────────────────

export interface Organization {
  id: OrgId;
  name: string;
  partnerPortalId: string;
  region: DattoRegion;
  contract: {
    tier: "Datto365" | "Standalone" | "Legacy";
    renewalDate: ISODate;
    seatEntitlement: number;
    storageEntitlementTB: number;
  };
  branding: { showPoweredByKaseya: boolean };
}

export interface Client {
  id: ClientId;
  orgId: OrgId;
  name: string;
  externalRef: string;
  products: ProductType[];
  healthRollup: StatusRollup;
  saasTenant?: {
    m365TenantId?: string;
    googleDomain?: string;
    authStatus: AuthStatus;
  };
}

export interface Site {
  id: SiteId;
  clientId: ClientId;
  name: string;
  timezone: string;
  applianceIds: ApplianceId[];
}

export interface Appliance {
  id: ApplianceId;
  siteId: SiteId;
  model: "SIRIS" | "ALTO" | "NAS";
  hardwareModel: string;
  serial: string;
  imageVersion: string;
  status: DeviceStatus;
  lastCheckIn: ISODateTime;
  storagePoolId: StoragePoolId;
  rebootedAt?: ISODateTime;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ProtectedAsset supertype + variants (docs/05 §3)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProtectedAssetBase {
  id: AssetId;
  kind: AssetKind;
  productType: ProductType;
  clientId: ClientId;
  siteId?: SiteId;
  applianceId?: ApplianceId;
  displayName: string;
  status: AssetStatus;
  lastGoodBackupAt?: ISODateTime;
  protectionEnabled: boolean;
  recentRuns: BackupRunSummary[];
  openAlertIds: AlertId[];
  tags: string[];
}

export interface AgentAsset extends ProtectedAssetBase {
  kind: "agent";
  os: { family: "windows" | "linux"; version: string };
  agentVersion: string;
  driverStatus: "loaded" | "pending-reboot" | "blocked-by-av";
  vssStatus: "healthy" | "writer-failed" | "dbd-fallback";
  encrypted: boolean;
  sealed: boolean;
  pairingStatus: "paired" | "401-unauthorized" | "cert-expired" | "port-blocked";
  backupChainState: ChainState;
}

export interface AgentlessAsset extends ProtectedAssetBase {
  kind: "agentless";
  hypervisor: "vmware" | "hyperv";
  cbtStatus: "enabled" | "reset-required" | "disabled";
  vmwareToolsState: "running" | "not-installed" | "out-of-date";
  stalledSnapshots: number;
  backupChainState: ChainState;
}

export interface EndpointAsset extends ProtectedAssetBase {
  kind: "endpoint";
  agentGen: "v1" | "v2";
  consoleSurface: "partner-portal" | "uniview";
  cbtFilterStatus: "healthy" | "needs-reinstall" | "pending-reboot";
  meteredPaused: boolean;
  supportabilityFlags: string[];
  backupChainState: ChainState;
}

export interface SaasSeatAsset extends ProtectedAssetBase {
  kind: "saas-seat";
  seatType: SaasSeatType;
  upn: string;
  licensed: boolean;
  archived: boolean;
  billedWhileArchived: boolean;
  authStatus: AuthStatus;
  lastBackupRunPerService?: Record<string, ISODateTime>;
}

export interface SalesforceOrgAsset extends ProtectedAssetBase {
  kind: "salesforce-org";
  sfOrgType: "production" | "sandbox";
  apiCallCapPct: number;
  apiUsage: number;
  metadataBackup: boolean;
  authStatus: AuthStatus;
  seatType?: SaasSeatType;
}

export interface ShareAsset extends ProtectedAssetBase {
  kind: "share";
  protocol: "smb" | "nfs";
  sharePath: string;
  credentialStatus: "valid" | "expired" | "access-denied";
}

export type ProtectedAsset =
  | AgentAsset
  | AgentlessAsset
  | EndpointAsset
  | SaasSeatAsset
  | SalesforceOrgAsset
  | ShareAsset;

// ─────────────────────────────────────────────────────────────────────────────
// 6. Backup execution (docs/05 §4)
// ─────────────────────────────────────────────────────────────────────────────

export interface BackupJob {
  id: BackupJobId;
  assetId: AssetId;
  schedule: {
    cadence: "continuous" | "hourly" | "daily" | "weekly";
    windows?: TimeWindow[];
  };
  retention: RetentionPolicy;
  throttle?: ThrottleProfile;
  scope?: { includes: string[]; excludes: string[] };
  pauseWhileMetered?: boolean;
}

export interface BackupRun {
  id: BackupRunId;
  jobId: BackupJobId;
  assetId: AssetId;
  startedAt: ISODateTime;
  finishedAt?: ISODateTime;
  state: RunState;
  mode: "full" | "incremental" | "differential-merge" | "saas-sync";
  consistency?: "application" | "crash-consistent-dbd";
  bytesTransferred?: number;
  recoveryPointId?: RecoveryPointId;
  errorCode?: string;
  errorMessage?: string;
  failureModeId?: FailureModeId;
}

export interface RecoveryPoint {
  id: RecoveryPointId;
  assetId: AssetId;
  takenAt: ISODateTime;
  pointKind: "image-chain" | "saas-set";
  bootable?: boolean;
  chainState?: ChainState;
  localStored: boolean;
  cloudStored: boolean;
  verification?: VerificationResult;
  locked?: boolean;
  expiresAt?: ISODateTime;
  deletedButRecoverable?: boolean;
}

export interface ScreenshotVerification {
  id: ScreenshotVerifId;
  recoveryPointId: RecoveryPointId;
  ranAt: ISODateTime;
  outcome: "passed" | "failed" | "not-run";
  imageUrl?: string;
  classification:
    | "verified"
    | "cosmetic-failure"
    | "real-boot-failure"
    | "indeterminate";
  signal?: string;
  waitTimeSec?: number;
}

export interface StoragePool {
  id: StoragePoolId;
  applianceId?: ApplianceId;
  kind: "zfs-local" | "cloud-consumption";
  capacityBytes: number;
  usedBytes: number;
  freeBytes: number;
  health: "online" | "degraded" | "faulted";
  topConsumers?: { assetId: AssetId; bytes: number }[];
}

export interface OffsiteSync {
  id: OffsiteSyncId;
  applianceId?: ApplianceId;
  assetId?: AssetId;
  state: "current" | "behind" | "paused" | "seeding" | "roundtrip-pending";
  backlogBytes: number;
  oldestUnsyncedPointAt?: ISODateTime;
  transmitLimitMbps?: number;
  etaToCurrent?: ISODateTime;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Failure & alerting (docs/05 §5)
// ─────────────────────────────────────────────────────────────────────────────

export interface Alert {
  id: AlertId;
  clientId: ClientId;
  assetId?: AssetId;
  source: "backup-run" | "verification" | "comms" | "storage" | "sync" | "auth" | "platform";
  subjectRef: EntityRef;
  severity: Severity;
  category: FailureCategory;
  title: string;
  rawError?: string;
  failureModeId?: FailureModeId;
  state: "open" | "acknowledged" | "suppressed" | "resolved" | "auto-resolved";
  isCosmetic: boolean;
  firstSeenAt: ISODateTime;
  lastSeenAt: ISODateTime;
  occurrenceCount: number;
  incidentId?: IncidentId;
}

export interface Incident {
  id: IncidentId;
  kind:
    | "platform-outage"
    | "pod-throttling"
    | "appliance-reboot"
    | "sync-backlog"
    | "mass-reauth";
  scope: "fleet" | "pod" | "appliance" | "tenant";
  alertIds: AlertId[];
  status: "active" | "monitoring" | "resolved";
  vendorStatusRef?: string;
  bannerText?: string;
  openedAt: ISODateTime;
  resolvedAt?: ISODateTime;
}

export interface FailureMode {
  id: FailureModeId;
  productType: ProductType;
  category: FailureCategory;
  title: string;
  description: string;
  defaultSeverity: Severity;
  /** Raw catalog severity (critical/high/medium/low) before mapping to a token. */
  catalogSeverity?: CatalogSeverity;
  frequency: "very-common" | "common" | "occasional" | "rare";
  cosmeticByDefault: boolean;
  vendorAutoHeals: boolean;
  selfServiceable: boolean;
  matchSignals: MatchSignal[];
  remediationActionIds: RemediationActionId[];
  runbookRef?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Remediation & automation (docs/05 §6)
// ─────────────────────────────────────────────────────────────────────────────

export interface RemediationAction {
  id: RemediationActionId;
  label: string;
  actionType: ActionType;
  appliesToKinds: AssetKind[];
  productTypes: ProductType[];
  params: ActionParamSpec[];
  reversible: boolean;
  destructive: boolean;
  requiresApproval: ApprovalRule;
  supportsDryRun: boolean;
  outcome: "self-heal" | "guidance-only" | "opens-ticket";
  estDurationSec?: number;
}

export interface ActionRun {
  id: ActionRunId;
  actionId: RemediationActionId;
  triggeredBy: { kind: "user" | "playbook" | "policy" | "ai"; refId: string };
  scope: ActionScope;
  targetRefs: EntityRef[];
  paramsUsed: Record<string, unknown>;
  state: ActionRunState;
  dryRun: boolean;
  approvalRequestId?: ApprovalRequestId;
  chainRunId?: ChainRunId;
  startedAt?: ISODateTime;
  finishedAt?: ISODateTime;
  resultSummary?: string;
  auditLogEntryIds: AuditLogEntryId[];
}

export interface PlaybookStep {
  actionId: RemediationActionId;
  params: Record<string, unknown>;
  runIf?: "always" | "prev-succeeded" | "prev-failed";
  haltOnFailure: boolean;
}

export interface Playbook {
  id: PlaybookId;
  orgId: OrgId;
  name: string;
  description: string;
  forFailureModeIds?: FailureModeId[];
  steps: PlaybookStep[];
  defaultScope: ActionScope;
  createdBy: UserId;
  lastRunAt?: ISODateTime;
}

export interface AutomationPolicy {
  id: AutomationPolicyId;
  orgId: OrgId;
  name: string;
  /**
   * What arms the policy. A `failure-mode` trigger fires for one specific failure
   * mode; a `category` trigger fires for every failure in a product category.
   * Modeled as a discriminated union so a category-wide rule carries the category
   * explicitly — never an empty-string `failureModeId` sentinel (which would name
   * a non-existent mode and fail seed integrity).
   */
  trigger:
    | { kind: "failure-mode"; failureModeId: FailureModeId; matchFilter?: AssetFilter }
    | { kind: "category"; category: string };
  appliesTo: AssetFilter;
  action: {
    kind: "action" | "playbook";
    refId: string;
    params: Record<string, unknown>;
  };
  approvalRule: ApprovalRule;
  enabled: boolean;
  dryRunFirst: boolean;
  stats: { triggered: number; succeeded: number; lastFiredAt?: ISODateTime };
}

export interface ApprovalRequest {
  id: ApprovalRequestId;
  requestedFor: { kind: "action-run" | "policy-fire"; refId: string };
  requestedBy: UserId;
  reason: "destructive" | "irreversible" | "over-threshold" | "policy-default";
  blastRadius: { assetCount: number; preview: string };
  state: "pending" | "approved" | "rejected" | "expired";
  decidedBy?: UserId;
  decidedAt?: ISODateTime;
  note?: string;
}

export interface AuditLogEntry {
  id: AuditLogEntryId;
  at: ISODateTime;
  actor: { kind: "user" | "policy" | "system" | "ai"; refId: string };
  verb: AuditVerb;
  subjectRef: EntityRef;
  scope?: ActionScope;
  before?: unknown;
  after?: unknown;
  outcome?: "succeeded" | "failed" | "partial";
  detail: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Cross-cutting (docs/05 §7)
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id: UserId;
  orgId: OrgId;
  name: string;
  email: string;
  role: "tech" | "noc-analyst" | "service-manager" | "junior" | "admin";
  canApprove: boolean;
  prefs: { density: "comfortable" | "dense"; theme: "light" | "dark" | "system" };
}

export interface SavedView {
  id: SavedViewId;
  ownerId: UserId;
  scope: "private" | "org";
  surface: "fleet" | "alerts" | "incidents" | "playbooks" | "audit";
  name: string;
  filter: AssetFilter | AlertFilter;
  sort: SortSpec[];
  columns?: string[];
  pinned: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Issue — the product-model view type (docs/00 §3)
// ─────────────────────────────────────────────────────────────────────────────

/** A single runbook step, attributed to the automation ("We") or the human ("You"). */
export interface RunbookStep {
  /** "We" = automated by the Resolution Center; "You" = manual / human-in-the-loop. */
  actor: "we" | "you";
  text: string;
  /** Optional bound action that backs a "We" step. */
  actionId?: RemediationActionId;
}

/** Split runbook: We (automated) vs You (manual). */
export interface IssueRunbook {
  weSteps: RunbookStep[];
  youSteps: RunbookStep[];
  /** For Guided fixes: how many "We" steps run automatically. */
  stepsAuto?: number;
}

/** Purple AI-assist surface attached to an issue. */
export interface AiInsight {
  rootCause: string;
  recommendation: string;
  confidencePct: number;
  /** Why the issue is classified as its fix type. */
  classificationRationale?: string;
}

/**
 * Issue — the home/Resolution-Center unit. Groups Alerts that share a FailureMode
 * and presents them as one fixable thing with a fix classification, We/You runbook,
 * and an AI insight. A view/aggregate, not a stored entity.
 */
export interface Issue {
  id: IssueId;
  title: string;
  detail: string;
  productBucket: ProductBucket;
  category: FailureCategory;
  severity: Severity;
  fixType: FixType;
  occurrenceCount: number;
  impactedAssetIds: AssetId[];
  /** Plain-language statement of what is wrong. */
  problem: string;
  runbook: IssueRunbook;
  aiInsight: AiInsight;
  /** The catalog failure this issue is grouped under. */
  failureModeId?: FailureModeId;
  /** Source alerts collapsed into this issue. */
  alertIds: AlertId[];
  /** Active outage correlation, if any. */
  incidentId?: IncidentId;
  isCosmetic?: boolean;
  firstSeenAt: ISODateTime;
  lastSeenAt: ISODateTime;
}
