# Data Model & Mock Data

Concrete TypeScript schemas for every domain entity plus a deterministic, seeded mock-data generation plan that populates the whole console at fleet scale.
Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

---

## 0. How to read this doc

This is the **wire-level / source-of-truth schema** layer. The [domain model](05-domain-model.md) defines what entities *mean*; this doc defines their exact TypeScript shapes, the enums they draw from, the **ID/value conventions**, and the **seeded generator** that builds a believable fleet from the [failure catalog](02-failure-catalog.md). It resolves the three open decisions flagged in [§11 of the domain model](05-domain-model.md#11-open-decisions-flagged-for-downstream-docs) (one discriminated `RecoveryPoint` type; ad-hoc chain = transient playbook + `ChainRun`; `AuthStatus` defaults at tenant, overridable per seat).

The generator and store shapes follow the architecture brief in [research/04-architecture-research.md](research/04-architecture-research.md): **seeded PRNG only at build/SSR**, runtime `Math.random` allowed only inside effects/handlers, Zustand `persist` for the action cart / playbooks / rules / UI. Everything here is **front-end mock** — no backend, no network.

**Rules this doc obeys (and code must too):**

- **No build-time `Math.random()` / `Date.now()`.** All fixtures come from a seeded PRNG (`xmur3`→`mulberry32`) and a fixed `NOW` epoch constant. Same `SEED` → byte-identical dataset forever (stable screenshots + Storybook snapshots).
- **Dates are ISO strings, never `Date` objects** in any persisted/serialized shape (hydration-safe).
- **IDs are stable, prefixed, human-legible, mono-rendered** (per [domain model §10](05-domain-model.md#10-identity--naming-conventions-mock-realism)).
- **Zod is the source of truth**: every interface below has a parallel `zod` schema in `lib/schemas/`; types are `z.infer<…>`; `parse()` runs over every generated record in dev so fixtures can never drift from the model.

Conventions in the type listings: `ISODateTime = string` (RFC 3339), `ISODate = string` (`YYYY-MM-DD`), branded ID aliases (`type AssetId = string & { __brand: 'AssetId' }`) for compile-time safety; shown unbranded below for readability.

---

## 1. Branded IDs & scalar aliases

```ts
// lib/schemas/ids.ts — branded string aliases (compile-time only; runtime = string)
type Brand<K extends string> = string & { readonly __brand: K };

export type OrgId            = Brand<'OrgId'>;            // "ORG-NWND"
export type ClientId         = Brand<'ClientId'>;        // "CLI-ACME"
export type SiteId           = Brand<'SiteId'>;          // "SITE-ACME-DAL"
export type ApplianceId      = Brand<'ApplianceId'>;     // "APP-7F3A21"
export type StoragePoolId    = Brand<'StoragePoolId'>;   // "POOL-7F3A21"
export type OffsiteSyncId    = Brand<'OffsiteSyncId'>;   // "OSS-7F3A21-DC01"
export type AssetId          = Brand<'AssetId'>;         // "AST-WIN-DC01" | "SEAT-…" | "SFO-…"
export type BackupJobId      = Brand<'BackupJobId'>;     // "JOB-ACME-DC01"
export type BackupRunId      = Brand<'BackupRunId'>;     // "RUN-20260622-0312"
export type RecoveryPointId  = Brand<'RecoveryPointId'>; // "RP-1750000000"
export type ScreenshotVerifId= Brand<'ScreenshotVerifId'>;
export type AlertId          = Brand<'AlertId'>;         // "ALR-44210"
export type IncidentId       = Brand<'IncidentId'>;      // "INC-POD-EU3"
export type FailureModeId    = Brand<'FailureModeId'>;   // "storage-pool-full-backups-skipped"
export type RemediationActionId = Brand<'RemediationActionId'>; // "force-retention"
export type ActionRunId      = Brand<'ActionRunId'>;     // "ACT-9F2C"
export type ChainRunId       = Brand<'ChainRunId'>;      // "CHN-3A10"
export type PlaybookId       = Brand<'PlaybookId'>;      // "PB-WEDGED-AGENT"
export type AutomationPolicyId = Brand<'AutomationPolicyId'>; // "POL-AUTO-MERGE"
export type ApprovalRequestId= Brand<'ApprovalRequestId'>;
export type AuditLogEntryId  = Brand<'AuditLogEntryId'>;
export type UserId           = Brand<'UserId'>;          // "USR-jdoe"
export type SavedViewId      = Brand<'SavedViewId'>;

export type ISODateTime = string;  // "2026-06-22T03:12:04Z"
export type ISODate     = string;  // "2026-06-22"

// Polymorphic reference used by alerts/audit/action targets.
export interface EntityRef {
  type: 'asset' | 'run' | 'point' | 'pool' | 'sync' | 'appliance' | 'client' | 'alert' | 'incident';
  id: string;
  label?: string;       // denormalized display label, mono where it's an ID
}
```

---

## 2. Enums (single source of vocabulary)

All enums are `as const` string-union tuples so they double as `zod` `z.enum(...)` inputs and as filter facets. They map 1:1 to the design-system status tokens (never color-only). Severity / status semantics are the [domain model §8](05-domain-model.md#8-key-enums) contract.

```ts
export const ProductType = ['bcdr','endpoint-v1','endpoint-v2','datto-cloud','saas-protect','spanning'] as const;
export type ProductType = typeof ProductType[number];

export const AssetKind = ['agent','agentless','endpoint','saas-seat','salesforce-org','share'] as const;
export type AssetKind = typeof AssetKind[number];

// Visible health badge — maps to status tokens: protected→success, warning→warning,
// failed→failed, paused→desaturated, syncing→primary-blue(spin), offline→cold.
export const AssetStatus = ['protected','warning','failed','paused','syncing','offline'] as const;
export type AssetStatus = typeof AssetStatus[number];
export const DeviceStatus = ['online','offline','degraded'] as const;
export type DeviceStatus = typeof DeviceStatus[number];

// Severity sort order is fixed: failed > warning > offline > syncing > paused > protected.
export const Severity = ['failed','warning','offline','syncing','paused','protected'] as const;
export type Severity = typeof Severity[number];
export const SEVERITY_RANK: Record<Severity, number> =
  { failed:0, warning:1, offline:2, syncing:3, paused:4, protected:5 };

// Catalog severity (from failure-catalog) before mapping to a status token.
export const CatalogSeverity = ['critical','high','medium','low'] as const;
export type CatalogSeverity = typeof CatalogSeverity[number];

export const FailureCategory = [
  'Storage/ZFS','Backup Chain','Agent Communication','Screenshot/Local Verification',
  'Cloud Sync','Diff-Merge/Chain Rebuild','Local Virtualization','BMR','File Restore',
  'Networking','Ransomware Detection','OAuth/Auth','API Throttling','Licensing/Seats','Reporting',
] as const;
export type FailureCategory = typeof FailureCategory[number];

export const Frequency = ['very-common','common','occasional','rare'] as const;
export type Frequency = typeof Frequency[number];

export const RunState = [
  'queued','running','success','success-crash-consistent','failed','skipped','cancelled','stuck',
] as const;
export type RunState = typeof RunState[number];

export const BackupMode = ['full','incremental','differential-merge','saas-sync'] as const;
export type BackupMode = typeof BackupMode[number];

export const ChainState = ['ok','needs-diff-merge','rebuilding','corrupt','verifying'] as const;
export type ChainState = typeof ChainState[number];

export const ActionType = [
  'run-now','repair','reconfigure','restart-service','re-pair-auth','reauthorize-oauth',
  'force-merge','force-retention','resume-sync','throttle-adjust','unseal-decrypt','restore',
  'virtualize','suppress-alert','assemble-support-ticket','guidance-runbook',
] as const;
export type ActionType = typeof ActionType[number];

export const ActionScope = ['once','all-matching','always'] as const;   // the spine
export type ActionScope = typeof ActionScope[number];

export const ActionRunState = [
  'queued','awaiting-approval','running','succeeded','partial','failed','rolled-back','skipped',
] as const;
export type ActionRunState = typeof ActionRunState[number];

export const ActionOutcome = ['self-heal','guidance-only','opens-ticket'] as const;
export type ActionOutcome = typeof ActionOutcome[number];

export const AuthStatus = ['authorized','consent-required','token-revoked','reauth-required','expired'] as const;
export type AuthStatus = typeof AuthStatus[number];

export const ApprovalRule = ['never','over-threshold','always'] as const;
export type ApprovalRule = typeof ApprovalRule[number];

export const SaasSeatType = ['exchange','onedrive','sharepoint','teams','gmail','gdrive'] as const;
export type SaasSeatType = typeof SaasSeatType[number];

export const IncidentKind =
  ['platform-outage','pod-throttling','appliance-reboot','sync-backlog','mass-reauth'] as const;
export type IncidentKind = typeof IncidentKind[number];

export const AuditVerb = [
  'ran-action','approved','rejected','created-playbook','enabled-policy',
  'suppressed-alert','overrode','rolled-back','scoped-escalation','edited-config',
] as const;
export type AuditVerb = typeof AuditVerb[number];

// CatalogSeverity → AssetStatus/Severity token (failure-catalog §0.2).
export const CATALOG_SEVERITY_TO_STATUS: Record<CatalogSeverity, AssetStatus> =
  { critical:'failed', high:'failed', medium:'warning', low:'warning' };
```

---

## 3. Tenancy & inventory schemas

### 3.1 Organization

```ts
export interface Organization {
  id: OrgId;
  name: string;                    // "Northwind Managed IT"
  partnerPortalId: string;         // mono: "DAT-PRT-00481"
  region: DattoRegion;             // 'us-east' | 'us-west' | 'eu-3' | 'apac-syd' | …
  contract: {
    tier: 'Datto365' | 'Standalone' | 'Legacy';
    renewalDate: ISODate;
    seatEntitlement: number;
    storageEntitlementTB: number;
  };
  branding: { showPoweredByKaseya: boolean };  // gates --kaseya-purple upsell accent
}
export type DattoRegion = 'us-east' | 'us-west' | 'eu-3' | 'apac-syd';
```

### 3.2 Client (Tenant)

```ts
export interface Client {
  id: ClientId;
  orgId: OrgId;
  name: string;                    // "Acme Dental Group"
  externalRef: string;             // PSA/IT Glue id, mono: "ITG-00231"
  products: ProductType[];
  healthRollup: AssetStatus;       // worst REAL child state across all assets
  siteIds: SiteId[];
  saasTenant?: {
    m365TenantId?: string;         // guid, mono
    googleDomain?: string;         // "acmedental.com"
    authStatus: AuthStatus;        // tenant-level default (seat may override)
  };
  counts: { assets: number; openAlerts: number; failedAssets: number };  // denormalized rollups
}
```

### 3.3 Site

```ts
export interface Site {
  id: SiteId;
  clientId: ClientId;
  name: string;                    // "Acme — Dallas HQ"
  timezone: string;                // "America/Chicago"
  applianceIds: ApplianceId[];
}
```

### 3.4 Appliance (BCDR / Cloud DR only)

```ts
export interface Appliance {
  id: ApplianceId;
  siteId: SiteId;
  clientId: ClientId;              // denormalized for table joins
  model: 'SIRIS' | 'ALTO' | 'NAS';
  hardwareModel: string;           // "S5-4", mono
  serial: string;                  // "DAT-S5-9X2K", mono
  imageVersion: string;            // "IRIS 4.7.2", mono
  status: DeviceStatus;
  lastCheckIn: ISODateTime;
  storagePoolId: StoragePoolId;
  rebootedAt?: ISODateTime;        // drives "encrypted agents re-sealed after reboot"
}
```

---

## 4. ProtectedAsset supertype (discriminated union)

`ProtectedAsset` is the spine the fleet table, severity rollup, action cart, and saved views all operate on. The `kind` discriminator selects the variant; common fields are shared via `ProtectedAssetBase`.

```ts
export type ProtectedAsset =
  | AgentAsset | AgentlessAsset | EndpointAsset
  | SaasSeatAsset | SalesforceOrgAsset | ShareAsset;

export interface ProtectedAssetBase {
  id: AssetId;
  kind: AssetKind;                 // discriminator
  productType: ProductType;
  clientId: ClientId;
  siteId?: SiteId;                 // null for cloud-only kinds
  applianceId?: ApplianceId;       // null for endpoint/SaaS/Spanning
  displayName: string;             // hostname / UPN / org name
  status: AssetStatus;             // computed: worst of recent runs + comms + verification
  lastGoodBackupAt?: ISODateTime;  // the "last-good recency" metric the console leads with
  protectionEnabled: boolean;      // false = intentionally paused (desaturated, not red)
  recentRuns: BackupRunSummary[];  // last 10 → the dot-strip (ordered oldest→newest)
  openAlertIds: AlertId[];
  primaryFailureModeId?: FailureModeId;  // the dominant open failure (drives "Fix" CTA)
  tags: string[];                  // ['prod','sql','dc','vip-client', …]
}

// Compact run row embedded on the asset for the "last 10" strip (avoids a join).
export interface BackupRunSummary {
  runId: BackupRunId;
  at: ISODateTime;
  state: RunState;
  isCosmetic: boolean;             // failed-but-cosmetic dots desaturate, not red
}
```

### 4.1 Variant shapes

```ts
export interface AgentAsset extends ProtectedAssetBase {
  kind: 'agent';
  productType: 'bcdr';
  os: { family: 'windows' | 'linux'; version: string };  // "Windows Server 2022"
  agentVersion: string;            // "ShadowSnap 4.6.1" | "Datto Linux Agent 1.9", mono
  driverStatus: 'loaded' | 'pending-reboot' | 'blocked-by-av';
  vssStatus: 'healthy' | 'writer-failed' | 'dbd-fallback';
  encrypted: boolean;
  sealed: boolean;                 // true after appliance reboot until passphrase re-entered
  pairingStatus: 'paired' | '401-unauthorized' | 'cert-expired' | 'port-blocked';
  backupChainState: ChainState;
  hostnameLength: number;          // ≥50 trips the cosmetic screenshot-hostname failure
}

export interface AgentlessAsset extends ProtectedAssetBase {
  kind: 'agentless';
  productType: 'bcdr';
  hypervisor: 'vmware' | 'hyperv';
  cbtStatus: 'ok' | 'reset-needed' | 'silent-fail';
  vmwareToolsState: 'current' | 'out-of-date' | 'not-installed';
  stalledSnapshots: number;        // count of un-consolidated vSphere snapshots
  backupChainState: ChainState;
}

export interface EndpointAsset extends ProtectedAssetBase {
  kind: 'endpoint';
  productType: 'endpoint-v1' | 'endpoint-v2';
  os: { family: 'windows' | 'macos'; version: string };
  agentGen: 'v1' | 'v2';
  consoleSurface: 'partner-portal' | 'uniview';
  agentVersion: string;            // "3.0.41", mono — gates known-bad-version logic
  cbtFilterStatus: 'ok' | 'blocked-by-av' | 'not-loaded';
  vssStatus: 'healthy' | 'writer-failed' | 'dbd-fallback';
  throttleMbps: number;            // 0 trips the throttle-zero deadlock
  meteredPaused: boolean;          // "pause while metered" engaged
  poolConsumptionGB: number;       // cloud consumption billing
  supportabilityFlags: string[];   // ['volume-expanded-after-full','refs-volume','external-drive']
  backupChainState: ChainState;
}

export interface SaasSeatAsset extends ProtectedAssetBase {
  kind: 'saas-seat';
  productType: 'saas-protect' | 'spanning';
  seatType: SaasSeatType;
  upn: string;                     // "jdoe@acme.onmicrosoft.com" | "jdoe@acmedental.com"
  licensed: boolean;
  archived: boolean;               // offboarded
  billedWhileArchived: boolean;    // the "archived seats still billed" pain
  autoAddEnabled: boolean;
  authStatus: AuthStatus;          // overrides tenant default when it diverges
  lastSyncByService?: Partial<Record<SaasSeatType, ISODateTime>>;
}

export interface SalesforceOrgAsset extends ProtectedAssetBase {
  kind: 'salesforce-org';
  productType: 'spanning';
  sfOrgId: string;                 // "00D5x000001AbCdEAF", mono
  sfOrgType: 'production' | 'sandbox';
  apiCallCapPct: number;           // default 15 — too low for large orgs
  apiUsagePct: number;             // current consumption vs daily allocation
  metadataBackup: boolean;
  connectedAppsOk: boolean;        // SpanningBackup/SpanningOauth enabled
  authStatus: AuthStatus;
}

export interface ShareAsset extends ProtectedAssetBase {
  kind: 'share';
  productType: 'bcdr';
  protocol: 'smb' | 'nfs';
  sharePath: string;               // "\\NWND-NAS01\finance", mono
  credentialStatus: 'valid' | 'changed' | 'unreachable';
  backupChainState: ChainState;
}
```

> **Type-narrowing pattern:** UI components switch on `asset.kind`. Generic fleet rows read only `ProtectedAssetBase`; the detail page widens to the variant. The fleet table never branches on `productType` for layout — only `kind` for facet fields.

---

## 5. Backup execution schemas

```ts
export interface BackupJob {
  id: BackupJobId;
  assetId: AssetId;
  service?: SaasSeatType;          // SaaS seats may have one job per service
  schedule: { cadence: 'continuous' | 'hourly' | 'daily' | 'weekly'; windows?: TimeWindow[] };
  retention: RetentionPolicy;
  throttle?: { transmitLimitMbps: number };  // throttle=0 deadlock lives here (endpoint)
  scope?: { includes: string[]; excludes: string[] };
  pauseWhileMetered?: boolean;
  enabled: boolean;
}
export interface TimeWindow { startLocal: string; endLocal: string; days: number[] }  // "02:00" 24h
export interface RetentionPolicy {
  localDays?: number;              // BCDR local pool
  cloudDays: number;               // off-site / cloud
  intradayHours?: number;
  archiveYears?: number;           // DEB v2 decoupled 90d..7y
}

export interface BackupRun {
  id: BackupRunId;
  jobId: BackupJobId;
  assetId: AssetId;
  clientId: ClientId;              // denormalized for the runs feed
  startedAt: ISODateTime;
  finishedAt?: ISODateTime;
  state: RunState;
  mode: BackupMode;
  consistency?: 'application' | 'crash-consistent-dbd';
  bytesTransferred?: number;       // mono in UI
  durationSec?: number;
  recoveryPointId?: RecoveryPointId;
  errorCode?: string;              // mono: "0x0000007B", "AADSTS500014", "Code 9999", "429"
  errorMessage?: string;           // the actual evidence string
  failureModeId?: FailureModeId;   // classification → unlocks remediation
}

// One discriminated RecoveryPoint type (resolves domain-model open decision).
export interface RecoveryPoint {
  id: RecoveryPointId;
  assetId: AssetId;
  takenAt: ISODateTime;
  pointKind: 'image-chain' | 'saas-set';
  // image-chain only:
  bootable?: boolean;
  chainState?: ChainState;
  localStored?: boolean;
  cloudStored: boolean;
  verificationId?: ScreenshotVerifId;
  // shared lifecycle:
  locked?: boolean;
  expiresAt?: ISODateTime;
  deletedButRecoverable?: boolean; // within Cloud Deletion Defense window
}

export interface ScreenshotVerification {
  id: ScreenshotVerifId;
  recoveryPointId: RecoveryPointId;
  assetId: AssetId;
  ranAt: ISODateTime;
  outcome: 'passed' | 'failed' | 'not-run';
  imageUrl?: string;               // mock asset path: "/mock/screenshots/win-login.png"
  classification: 'verified' | 'cosmetic-failure' | 'real-boot-failure' | 'indeterminate';
  signal?: string;                 // "0x7B INACCESSIBLE_BOOT_DEVICE", "Getting Devices Ready", "hostname>50"
  waitTimeSec?: number;            // tunable; "Increase Additional Wait Time" action
}

export interface StoragePool {
  id: StoragePoolId;
  applianceId?: ApplianceId;       // null for cloud-consumption
  kind: 'zfs-local' | 'cloud-consumption';
  capacityBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPct: number;                 // denormalized; drives "days until full" + pool-full failure
  health: 'online' | 'degraded' | 'faulted';
  daysUntilFull?: number;          // forecast (null if stable/shrinking)
  topConsumers?: { assetId: AssetId; bytes: number }[];
}

export interface OffsiteSync {
  id: OffsiteSyncId;
  applianceId?: ApplianceId;
  assetId?: AssetId;               // endpoint-level sync
  clientId: ClientId;
  state: 'current' | 'behind' | 'paused' | 'seeding' | 'roundtrip-pending';
  backlogBytes: number;
  daysBehind: number;              // >10 ⇒ RoundTrip suggested
  oldestUnsyncedPointAt?: ISODateTime;
  transmitLimitMbps?: number;
  etaToCurrent?: ISODateTime;
}
```

---

## 6. Failure & alerting schemas

```ts
export interface Alert {
  id: AlertId;
  clientId: ClientId;
  assetId?: AssetId;
  source: 'backup-run' | 'verification' | 'comms' | 'storage' | 'sync' | 'auth' | 'platform';
  subjectRef: EntityRef;
  severity: Severity;
  category: FailureCategory;
  title: string;                   // human, e.g. "Off-site replication 14 days behind"
  rawError?: string;               // mono evidence
  failureModeId?: FailureModeId;   // classification result (the hinge)
  state: 'open' | 'acknowledged' | 'suppressed' | 'resolved' | 'auto-resolved';
  isCosmetic: boolean;             // screenshot-timing etc. → desaturated, not red
  firstSeenAt: ISODateTime;
  lastSeenAt: ISODateTime;
  occurrenceCount: number;         // dedupe rollup
  incidentId?: IncidentId;
  assigneeId?: UserId;
}

export interface Incident {
  id: IncidentId;
  kind: IncidentKind;
  scope: 'fleet' | 'pod' | 'appliance' | 'tenant';
  scopeRef?: EntityRef;            // the appliance/tenant/pod the incident is anchored to
  alertIds: AlertId[];
  affectedAssetCount: number;
  status: 'active' | 'monitoring' | 'resolved';
  vendorStatusRef?: string;        // "DAT-INC-20260530-EWS" | "MS Advisory MO812345"
  bannerText?: string;
  openedAt: ISODateTime;
  resolvedAt?: ISODateTime;
}

// REFERENCE DATA — not per-tenant state. ~135 modes, hand-mapped from failure-catalog.json.
export interface FailureMode {
  id: FailureModeId;               // slug from the catalog, e.g. "storage-pool-full-backups-skipped"
  productType: ProductType;
  category: FailureCategory;
  title: string;
  description: string;
  defaultSeverity: CatalogSeverity;
  frequency: Frequency;
  cosmeticByDefault: boolean;      // screenshot-timing class
  vendorAutoHeals: boolean;        // Datto already auto-fixes (auto:true in research)
  selfServiceable: boolean;        // automatable === can fix here vs must-ticket
  matchSignals: MatchSignal[];     // error codes/strings used to classify an alert
  remediationActionIds: RemediationActionId[];  // ordered, primary-first
  runbookRef?: string;             // → content-strategy runbook id
}
export interface MatchSignal { kind: 'error-code' | 'error-substring' | 'state'; value: string }
```

---

## 7. Remediation & automation schemas

```ts
// REFERENCE DATA — the action library (~70 distinct actions consolidated from the catalog).
export interface RemediationAction {
  id: RemediationActionId;         // "force-retention", "repair-agent-comms"
  label: string;
  actionType: ActionType;
  description: string;
  appliesToKinds: AssetKind[];
  productTypes: ProductType[];
  params: ActionParamSpec[];
  reversible: boolean;
  destructive: boolean;
  requiresApproval: ApprovalRule;
  supportsDryRun: boolean;
  outcome: ActionOutcome;          // self-heal | guidance-only | opens-ticket
  estDurationSec?: number;
  icon: string;                    // lucide name
}
export interface ActionParamSpec {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'enum' | 'duration-min' | 'bandwidth-mbps';
  default?: unknown;
  options?: string[];              // for 'enum'
  min?: number; max?: number;
  required: boolean;
}

export interface ActionRun {
  id: ActionRunId;
  actionId: RemediationActionId;
  triggeredBy: { kind: 'user' | 'playbook' | 'policy'; refId: string };
  scope: ActionScope;
  targetRefs: EntityRef[];         // resolved assets/points
  paramsUsed: Record<string, unknown>;
  state: ActionRunState;
  dryRun: boolean;
  approvalRequestId?: ApprovalRequestId;
  chainRunId?: ChainRunId;
  startedAt?: ISODateTime;
  finishedAt?: ISODateTime;
  resultSummary?: string;          // "Freed 1.2 TB on pool", "Re-paired 7 of 7 agents"
  perTargetResults?: { ref: EntityRef; state: ActionRunState; note?: string }[];  // batch detail
  auditLogEntryIds: AuditLogEntryId[];
}

// Ad-hoc cart chain and saved Playbook share PlaybookStep (resolves open decision):
// an un-saved chain is a transient Playbook (no id persisted) wrapped in a ChainRun.
export interface Playbook {
  id: PlaybookId;
  orgId: OrgId;
  name: string;
  description: string;
  forFailureModeIds?: FailureModeId[];
  steps: PlaybookStep[];
  defaultScope: ActionScope;
  createdBy: UserId;
  seeded?: boolean;                // shipped vs user-authored
  lastRunAt?: ISODateTime;
}
export interface PlaybookStep {
  order: number;
  actionId: RemediationActionId;
  params: Record<string, unknown>;
  runIf: 'always' | 'prev-succeeded' | 'prev-failed';
  haltOnFailure: boolean;
}
export interface ChainRun {
  id: ChainRunId;
  playbookId?: PlaybookId;         // null for ad-hoc cart chains
  transientSteps?: PlaybookStep[]; // present for ad-hoc
  targetRefs: EntityRef[];
  scope: ActionScope;
  actionRunIds: ActionRunId[];
  state: ActionRunState;
  startedAt: ISODateTime;
  finishedAt?: ISODateTime;
}

export interface AutomationPolicy {
  id: AutomationPolicyId;
  orgId: OrgId;
  name: string;
  trigger: { failureModeId: FailureModeId; matchFilter?: AssetFilter };
  appliesTo: AssetFilter;
  action: { kind: 'action' | 'playbook'; refId: string; params: Record<string, unknown> };
  approvalRule: ApprovalRule;
  enabled: boolean;
  dryRunFirst: boolean;
  stats: { triggered: number; succeeded: number; lastFiredAt?: ISODateTime };
  createdBy: UserId;
}

export interface ApprovalRequest {
  id: ApprovalRequestId;
  requestedFor: { kind: 'action-run' | 'policy-fire'; refId: string };
  requestedBy: UserId;
  reason: 'destructive' | 'irreversible' | 'over-threshold' | 'policy-default';
  blastRadius: { assetCount: number; preview: string };
  state: 'pending' | 'approved' | 'rejected' | 'expired';
  decidedBy?: UserId;
  decidedAt?: ISODateTime;
  note?: string;
  requestedAt: ISODateTime;
}

export interface AuditLogEntry {
  id: AuditLogEntryId;
  at: ISODateTime;
  actor: { kind: 'user' | 'policy' | 'system'; refId: string };
  verb: AuditVerb;
  subjectRef: EntityRef;
  scope?: ActionScope;
  before?: unknown;
  after?: unknown;
  outcome?: 'succeeded' | 'failed' | 'partial';
  detail: string;                  // human-readable line
}
```

---

## 8. Cross-cutting schemas + filter shapes

```ts
export interface User {
  id: UserId;
  orgId: OrgId;
  name: string;
  email: string;                   // mock addresses, e.g. nimda_sys@hotmail.com style
  role: 'tech' | 'noc-analyst' | 'service-manager' | 'junior' | 'admin';
  canApprove: boolean;
  prefs: { density: 'comfortable' | 'dense'; theme: 'light' | 'dark' | 'system' };
}

export interface SavedView {
  id: SavedViewId;
  ownerId: UserId;
  scope: 'private' | 'org';
  surface: 'fleet' | 'alerts' | 'incidents' | 'playbooks' | 'audit';
  name: string;                    // "Failed (real) — last 24h"
  filter: AssetFilter | AlertFilter;
  sort: SortSpec[];
  columns?: string[];
  pinned: boolean;
}

// Filters double as nuqs URL state and as AutomationPolicy scope.
export interface AssetFilter {
  clientIds?: ClientId[];
  siteIds?: SiteId[];
  productTypes?: ProductType[];
  kinds?: AssetKind[];
  statuses?: AssetStatus[];
  failureModeIds?: FailureModeId[];
  tags?: string[];
  search?: string;
  includeCosmetic?: boolean;       // default false: cosmetic warnings hidden from "real" views
}
export interface AlertFilter {
  clientIds?: ClientId[];
  categories?: FailureCategory[];
  severities?: Severity[];
  states?: Alert['state'][];
  isCosmetic?: boolean;
  incidentId?: IncidentId;
  search?: string;
}
export interface SortSpec { field: string; dir: 'asc' | 'desc' }
```

---

## 9. Mock-data generation plan

### 9.1 Determinism contract

A single `SEED` constant drives the entire dataset through namespaced PRNG streams (per [research/04](research/04-architecture-research.md#3b-seeded-deterministic-prng-libmockprngts)). A frozen `NOW` epoch replaces `Date.now()` so "2h ago" / "14 days behind" are reproducible.

```ts
// lib/mock/seed.ts
export const SEED = 'datto-care-center-v1';
export const NOW = Date.parse('2026-06-22T09:00:00Z');   // frozen "now" for all relative dates

// lib/mock/prng.ts  (xmur3 → mulberry32; pure Math.imul/bit-ops, build-safe)
export function rng(namespace: string): () => number;     // mulberry32(xmur3(`${SEED}:${ns}`)())
```

Each entity stream uses its own namespace (`rng('assets')`, `rng('runs')`, `rng('alerts')`, …) so adding records to one stream never reshuffles another — referential integrity and screenshots stay stable across edits.

Helper primitives every generator shares:

```ts
const pick   = <T>(r:()=>number, a:T[]) => a[Math.floor(r()*a.length)];
const weighted= <K extends string>(r:()=>number, w:Record<K,number>) => …;  // normalized buckets
const isoAgo = (r:()=>number, minMin:number, maxMin:number) =>
  new Date(NOW - (minMin + r()*(maxMin-minMin))*60_000).toISOString();
const bytes  = (gb:number) => Math.round(gb*1024**3);
```

### 9.2 Scale targets

Sized for a dense, believable mid-size MSP that still renders instantly in-memory (grids virtualized via `@tanstack/react-virtual`).

| Entity | Count | Notes |
|---|---|---|
| Organization | 1 | the MSP (`ORG-NWND`) |
| User | 8 | 1 admin, 1 service-manager (can-approve), 3 techs, 2 noc-analysts, 1 junior |
| Client | 6 | each spans 1–4 of the 6 products; names: Acme, Contoso, Northwind, Globex, Initech, Umbra |
| Site | ~40 | 4–9 per client; cloud-only clients have 0–1 |
| Appliance | ~22 | SIRIS/ALTO/NAS across BCDR sites; 1 StoragePool each |
| StoragePool | ~30 | 22 zfs-local + ~8 cloud-consumption (endpoint) |
| OffsiteSync | ~60 | per appliance + per endpoint with DR |
| **ProtectedAsset** | **~600** | split below; the spine |
| BackupJob | ~720 | ~1 per asset; SaaS seats get 1 per active service |
| **BackupRun** | **~9,000** | last ~15 runs per asset (last 10 surfaced in the dot-strip) |
| RecoveryPoint | ~6,500 | one per successful run; chain-linked for image kinds |
| ScreenshotVerification | ~3,800 | image kinds only, ~1 per recent point |
| **Alert** | **~480** | open + recently-resolved; deduped/grouped |
| Incident | 5 | one per `IncidentKind` (see §9.6) |
| FailureMode | 135 | reference data, imported 1:1 from `failure-catalog.json` |
| RemediationAction | ~70 | reference data, consolidated from catalog candidate actions |
| Playbook | 5 seeded | + user-authored at runtime |
| AutomationPolicy | 3 seeded | demonstrate "always" scope |
| ActionRun / ChainRun | ~120 / ~20 | historical run feed |
| ApprovalRequest | ~12 | mix pending/approved/rejected |
| AuditLogEntry | ~400 | append-only history |

**Asset mix (~600), tuned so every product surface is populated:**

| Kind | Product | Count | Rationale |
|---|---|---|---|
| `agent` | bcdr | 180 | the densest BCDR surface |
| `agentless` | bcdr | 70 | VMware/Hyper-V |
| `share` | bcdr | 20 | NAS |
| `endpoint` | endpoint-v1 | 60 | legacy, partner-portal |
| `endpoint` | endpoint-v2 | 90 | next-gen, uniview |
| `saas-seat` | saas-protect | 110 | M365 + Google seats |
| `saas-seat` | spanning | 40 | M365/Google via Spanning |
| `salesforce-org` | spanning | 10 | SF orgs (prod + sandbox) |
| (datto-cloud assets reuse the BCDR `agent`/`agentless` records that have `OffsiteSync`+cloud points — Datto Cloud is a *facet* of BCDR assets, not a separate asset kind.) | | | |

### 9.3 Health distribution (mostly healthy, believable failing tail)

Status is **not** uniform random — it is drawn from a weighted distribution then *forced* to match injected failures (§9.5). Baseline weights:

```
protected  82%   warning  9%   failed  4%   syncing 2%   paused 2%   offline 1%
```

This yields ~24 failed + ~54 warning assets out of 600 — a credible "wall" without crying wolf. Of the warnings, ~40% carry `isCosmetic` (screenshot-timing class) so the "real failures only" saved view collapses to ~24 + ~32 = a focused queue. Per the fleet rollup rule, **client `healthRollup` = worst *real* child state**; a client whose only red is cosmetic rolls up to `warning`, and an all-paused client never rolls up to `failed`.

### 9.4 Correlated, not random (what sells realism)

Fields are derived from each other so records are internally consistent:

- A `failed` asset has ≥1 open alert, a recent `BackupRun{state:'failed'}` with a real `errorCode`/`failureModeId`, and a stale `lastGoodBackupAt` (hours–days old).
- An `offline` asset's appliance/agent `lastCheckIn` is days ago and its recent runs are `skipped`/`stuck`.
- A `paused` asset has `protectionEnabled:false` and desaturated dots — never red.
- The **dot-strip** (`recentRuns`) trends toward the asset's current status: a currently-failing agent shows a tail of green then 2–4 red/amber; a flapping agent alternates.
- Pool-full appliances (`StoragePool.usedPct > 92`) force their hosted agents' recent runs to include `skipped` ("not enough free space") and set a `storage-pool-full-backups-skipped` alert.
- `OffsiteSync.daysBehind > 10` flags the appliance for a RoundTrip suggestion and (if it also stalls retention) bloats the linked pool.
- SaaS tenants with `authStatus:'expired'` cascade: every Exchange seat under them flips to `failed` with the EWS→Graph reauth failure mode.

### 9.5 Failure injection (every catalog mode represented)

**Goal: each of the 135 failure modes in [02-failure-catalog](02-failure-catalog.md) is realized by at least one real-looking asset + classified alert,** so every remediation action has a live target and every runbook a live example.

Algorithm (`lib/mock/generators/inject-failures.ts`, namespace `rng('failures')`):

1. Load all 135 `FailureMode` records (reference data).
2. For each mode, compute an **injection count** from its `frequency`: `very-common → 6–14`, `common → 3–6`, `occasional → 1–3`, `rare → 1`. (Rare modes still get exactly one instance so they're demonstrable.)
3. For each instance, select an eligible asset (matching `productType` + applicable `kind`) that is still `protected` in the baseline draw, and **flip it** to the mode:
   - Set asset facet fields to the failing state (e.g. `pairingStatus:'401-unauthorized'`, `vssStatus:'writer-failed'`, `cbtFilterStatus:'blocked-by-av'`, `apiUsagePct:100`, `authStatus:'expired'`).
   - Recompute `status` from the mode's `defaultSeverity` via `CATALOG_SEVERITY_TO_STATUS` (cosmetic-class modes → `warning` + `isCosmetic:true`).
   - Append a failing `BackupRun` (or `ScreenshotVerification`) carrying a **verbatim `errorCode`/`errorMessage`** from the mode's `matchSignals`.
   - Emit one `Alert` with `failureModeId` set, `isCosmetic` from `cosmeticByDefault`, `category` from the mode, and a deduped `occurrenceCount`.
   - Set the asset's `primaryFailureModeId` (highest-severity open mode wins).
4. Multi-asset modes that share a root cause (mass-reauth, pod-throttling, platform-outage, appliance-reboot re-seal, sync-backlog) are grouped under a single `Incident` (§9.6) so the UI posts one banner instead of N alerts.

**Error-string realism** (mono, drawn from catalog §10 and the digest): `0x0000007B`, `c000021a`, `Code 9999`, `BKP3031`, `AGT0900`, `bk005`, `ZFS4150`, `SNS003/005/006/020`, `AADSTS500014`, `AADSTS90002`, `AADSTS500011`, `429`, `503`, `ErrorAccessDenied`, `ErrorInvalidSyncStateData`, `OneDriveNotProvisioned`, `423 Locked`, `FolderEnumerationUnknownError`, `error 14022`, `0x80010135`, `0x80042315`, `Request Entity Too Large`, `Operation Performed with Inactive User`. Hostnames seed the cosmetic case deliberately: `ACME-TERMINALSRV01` (>15) and an `agent` with `hostnameLength ≥ 50` for the libvirt screenshot-hostname failure. Ports surface in comms failures: `25568`, `3260`, `3262`, `443`; host `mothership.dtc.datto.com`.

### 9.6 The five seeded incidents

| Incident | Kind | Scope | What it groups |
|---|---|---|---|
| `INC-EWS-2026` | mass-reauth | fleet | EWS→Graph reauth — ~18 Exchange seats across 3 tenants flip `failed`; banner counts down to **May 30 2026** (already passed relative to `NOW`, so shown as overdue) |
| `INC-POD-EU3` | pod-throttling | pod | SharePoint/Teams 429/503 loop — ~12 SaaS seats on the EU-3 pod |
| `INC-APP-RESEAL` | appliance-reboot | appliance | one SIRIS rebooted; ~9 encrypted agents `sealed:true` paused (`bk005`) |
| `INC-SYNC-BACKLOG` | sync-backlog | appliance | off-site backlog stalls retention on one appliance → pool bloat cascade |
| `INC-V2-OFFLINE` | platform-outage | fleet | resolved DEB v2 mass-offline — ~14 endpoints, `status:'resolved'`, post-incident reconciliation demo |

### 9.7 Generation order (dependency DAG)

```
reference data (static):  FailureMode[135]  RemediationAction[~70]  ActionCatalog seeds
        │
1. Organization → 2. User[8] → 3. Client[6] → 4. Site[~40] → 5. Appliance[~22] + StoragePool
        │
6. ProtectedAsset[~600]   (assigned to client/site/appliance by kind)
        │
7. BackupJob (per asset/service) → 8. BackupRun[~9k] → 9. RecoveryPoint → 10. ScreenshotVerification
        │
11. OffsiteSync (per appliance/endpoint)
        │
12. inject-failures  → mutates assets/runs, emits Alert[~480]
13. Incident[5]      → re-parents grouped alerts
        │
14. recompute rollups: asset.status, client.healthRollup, pool.usedPct/daysUntilFull
15. seed Playbook[5] / AutomationPolicy[3] / ActionRun history / ApprovalRequest / AuditLogEntry
```

Steps 1–15 run once at module load inside `lib/mock/fixtures.ts`, are cached in a module-level `DB` object, and validated with `zod` in dev (`SCHEMA.parse(record)` over each array). The `lib/mock/query.ts` "API" reads from `DB` with filter/sort/paginate (optionally wrapping an `await delay(rng('latency')()*300)` — runtime randomness, safe).

---

## 10. Fixture file organization

```
lib/mock/
├── seed.ts                 # SEED, NOW constants
├── prng.ts                 # xmur3, mulberry32, rng(namespace), pick/weighted/isoAgo helpers
├── pools.ts                # curated value pools: CLIENT_NAMES, SITE_CODES, ROLE_CODES, OS_LIST,
│                           #   ERROR_STRINGS, PORTS, HOSTNAME_SPECIALS, UPN/Google domains, SF org ids
├── reference/
│   ├── failure-modes.ts    # FailureMode[135] — imported/derived from research/failure-catalog.json
│   ├── action-catalog.ts   # RemediationAction[~70] — consolidated catalog §8 actions
│   └── action-params.ts    # ActionParamSpec presets reused across actions
├── generators/
│   ├── org-users.ts        # Organization + User[]
│   ├── clients-sites.ts    # Client[] + Site[]
│   ├── appliances.ts       # Appliance[] + StoragePool[]
│   ├── assets.ts           # ProtectedAsset[] (per-kind builders) + BackupJob[]
│   ├── runs.ts             # BackupRun[] + RecoveryPoint[] + ScreenshotVerification[] + dot-strips
│   ├── offsite-sync.ts     # OffsiteSync[]
│   ├── inject-failures.ts  # the §9.5 algorithm → Alert[]
│   ├── incidents.ts        # Incident[5] + alert re-parenting
│   ├── automation.ts       # seeded Playbook[] / AutomationPolicy[] / ActionRun / Approval / Audit
│   └── rollups.ts          # recompute asset.status, client.healthRollup, pool forecasts
├── fixtures.ts             # runs the DAG once, caches DB, dev-time zod validation
└── query.ts                # getAssets/getAlerts/getRuns/… filter+sort+paginate (the swappable seam)
```

`types/` holds the `z.infer` types; `lib/schemas/` holds the zod schemas (also reused to validate the playbook-editor form). `config/` holds `nav.ts` and `status-token.ts` maps. Mock screenshot images live under `public/mock/screenshots/`.

---

## 11. Simulated action-runner outcome model

Actions never touch a backend. Dispatching from the cart (or firing a policy) produces `ActionRun`/`ChainRun` records whose outcomes are **deterministically derived** from the targeted failure mode + a per-run PRNG draw, so demos are repeatable yet not all-success.

```ts
// lib/mock/runner.ts
export interface RunnerOutcome {
  state: ActionRunState;           // succeeded | partial | failed | rolled-back | awaiting-approval
  resultSummary: string;           // mono-rich, e.g. "Freed 1.2 TB on POOL-7F3A21 (94% → 71%)"
  perTarget: { ref: EntityRef; state: ActionRunState; note?: string }[];
  healsAsset: boolean;             // if true, mutate the target back toward 'protected'
  opensTicketRef?: string;         // for outcome:'opens-ticket' actions, e.g. "DAT-TKT-88213"
}
```

Outcome rules:

- **`outcome:'self-heal'` actions** → mostly `succeeded` (e.g. `repair-agent-comms`, `force-retention`, `resume-sync`, `reauthorize-oauth`). A seeded ~10% draw yields `partial` (batch: "Re-paired 7 of 9 agents — 2 still offline") to exercise partial-state UI. On success the runner flips the target asset's facet + `status` back toward `protected` and `auto-resolved`s the originating alert (closing the troubleshoot→fix loop visibly).
- **`outcome:'opens-ticket'` actions** (faulted ZFS drive, BMR Code 9999, IPsec, re-index, billing) → state `succeeded` but `resultSummary` = "Assembled support package; opened **DAT-TKT-88213**" and the asset stays in its failed state (we assisted, didn't auto-fix).
- **`outcome:'guidance-only'` actions** (runbooks, hostname rename, chkdsk guidance) → `succeeded` with a checklist summary; no asset mutation.
- **Destructive / over-threshold** actions short-circuit to `awaiting-approval` and emit an `ApprovalRequest` with a `blastRadius` preview before any outcome is computed.
- **Dry-run** returns the `blastRadius`/preview only (no mutation, no audit `outcome`), so "preview impact" always works.
- Every dispatch writes `AuditLogEntry` records and fires a Sonner toast ("Re-paired 7 of 9 agents (mock)").

A runtime `setInterval` ticker (in `useEffect`, build-safe) may fabricate a matching alert and show an enabled `AutomationPolicy` auto-firing — creating an `ActionRun{triggeredBy:{kind:'policy'}}` — to *demonstrate* "always" scope live.

---

## 12. localStorage persistence shapes

Four namespaced Zustand `persist` stores (per [research/04 §5d](research/04-architecture-research.md#5d-mock-persistence-summary)). Each carries a `version` + `migrate` so a demoer's saved state survives schema evolution. Generated fixtures are **not** persisted (they rebuild from `SEED` each load) — only user-created/mutated state is.

| Store | localStorage key | Persisted shape (`partialize`d) |
|---|---|---|
| cart-store | `dcc-action-cart` | `{ targets: AssetId[]; steps: CartStep[]; defaultScope: ActionScope }` |
| playbook-store | `dcc-playbooks` | `{ userPlaybooks: Playbook[] }` (seeded ones live in fixtures) |
| rules-store | `dcc-auto-rules` | `{ policies: AutomationPolicy[] }` ("always" standing rules) |
| ui-store | `dcc-ui` | `{ sidebarCollapsed: boolean; density; theme; lastClientId?; savedViews: SavedView[] }` |

```ts
interface CartStep {                 // an action instanced into the cart/chain
  uid: string;                       // nanoid — an action can appear twice
  actionId: RemediationActionId;
  params: Record<string, unknown>;
  scope: ActionScope;                // per-step override of cart default
}
// Stored shape header for every store:
interface PersistedEnvelope<T> { state: T; version: number }  // zustand persist format
```

A **"Reset demo state"** settings action clears the four keys and forces a fixtures rebuild, so the mock is always presentable. Because the cart reads localStorage, cart-dependent UI (the badge count) gates behind a `useHasHydrated()` flag to avoid hydration mismatch.

---

## 13. Sample generated records

### 13.1 `AgentAsset` (a real, failing BCDR agent — VSS writer failure)

```json
{
  "id": "AST-WIN-DC01",
  "kind": "agent",
  "productType": "bcdr",
  "clientId": "CLI-ACME",
  "siteId": "SITE-ACME-DAL",
  "applianceId": "APP-7F3A21",
  "displayName": "ACME-DC01",
  "status": "failed",
  "lastGoodBackupAt": "2026-06-21T22:00:11Z",
  "protectionEnabled": true,
  "os": { "family": "windows", "version": "Windows Server 2022" },
  "agentVersion": "ShadowSnap 4.6.1",
  "driverStatus": "loaded",
  "vssStatus": "writer-failed",
  "encrypted": true,
  "sealed": false,
  "pairingStatus": "paired",
  "backupChainState": "ok",
  "hostnameLength": 9,
  "primaryFailureModeId": "vss-writer-snapshot-failure",
  "recentRuns": [
    { "runId": "RUN-20260620-0200", "at": "2026-06-20T02:00:04Z", "state": "success", "isCosmetic": false },
    { "runId": "RUN-20260621-0200", "at": "2026-06-21T02:00:07Z", "state": "success-crash-consistent", "isCosmetic": false },
    { "runId": "RUN-20260622-0200", "at": "2026-06-22T02:00:02Z", "state": "failed", "isCosmetic": false }
  ],
  "openAlertIds": ["ALR-44210"],
  "tags": ["prod", "dc", "windows"]
}
```

### 13.2 `BackupRun` (the failing run that classified to a mode)

```json
{
  "id": "RUN-20260622-0200",
  "jobId": "JOB-ACME-DC01",
  "assetId": "AST-WIN-DC01",
  "clientId": "CLI-ACME",
  "startedAt": "2026-06-22T02:00:02Z",
  "finishedAt": "2026-06-22T02:04:48Z",
  "state": "failed",
  "mode": "incremental",
  "consistency": "crash-consistent-dbd",
  "bytesTransferred": 0,
  "durationSec": 286,
  "errorCode": "0x80042315",
  "errorMessage": "VSS failed to prepare snapshots for backup. Writer 'SqlServerWriter' is in a failed state.",
  "failureModeId": "vss-writer-snapshot-failure"
}
```

### 13.3 `Alert` (deduped, classified, links to remediation via FailureMode)

```json
{
  "id": "ALR-44210",
  "clientId": "CLI-ACME",
  "assetId": "AST-WIN-DC01",
  "source": "backup-run",
  "subjectRef": { "type": "run", "id": "RUN-20260622-0200", "label": "RUN-20260622-0200" },
  "severity": "failed",
  "category": "Backup Chain",
  "title": "VSS writer failure on ACME-DC01 — backups crash-consistent",
  "rawError": "0x80042315 — SqlServerWriter failed",
  "failureModeId": "vss-writer-snapshot-failure",
  "state": "open",
  "isCosmetic": false,
  "firstSeenAt": "2026-06-22T02:04:48Z",
  "lastSeenAt": "2026-06-22T02:04:48Z",
  "occurrenceCount": 3,
  "incidentId": null,
  "assigneeId": "USR-jdoe"
}
```

### 13.4 `SaasSeatAsset` (cosmetic-free, real EWS→Graph reauth failure under an incident)

```json
{
  "id": "SEAT-mhayes@contoso",
  "kind": "saas-seat",
  "productType": "saas-protect",
  "clientId": "CLI-CONTOSO",
  "displayName": "mhayes@contoso.onmicrosoft.com",
  "status": "failed",
  "lastGoodBackupAt": "2026-05-29T11:14:00Z",
  "protectionEnabled": true,
  "seatType": "exchange",
  "upn": "mhayes@contoso.onmicrosoft.com",
  "licensed": true,
  "archived": false,
  "billedWhileArchived": false,
  "autoAddEnabled": true,
  "authStatus": "expired",
  "lastSyncByService": { "exchange": "2026-05-29T11:14:00Z" },
  "primaryFailureModeId": "saasp-ews-to-graph-reauth",
  "recentRuns": [
    { "runId": "RUN-20260529-EX01", "at": "2026-05-29T11:14:00Z", "state": "success", "isCosmetic": false },
    { "runId": "RUN-20260531-EX01", "at": "2026-05-31T11:00:00Z", "state": "failed", "isCosmetic": false }
  ],
  "openAlertIds": ["ALR-51002"],
  "tags": ["m365", "exchange", "vip-client"]
}
```

### 13.5 `RemediationAction` (catalog definition the alert above offers)

```json
{
  "id": "reauthorize-oauth",
  "label": "Launch Global Admin consent",
  "actionType": "reauthorize-oauth",
  "description": "Open the per-tenant Global Admin consent flow to re-grant Microsoft Graph permissions, then verify the next Exchange backup succeeds.",
  "appliesToKinds": ["saas-seat"],
  "productTypes": ["saas-protect", "spanning"],
  "params": [
    { "key": "tenantId", "label": "Tenant", "type": "string", "required": true },
    { "key": "verifyAfter", "label": "Verify backup after consent", "type": "boolean", "default": true, "required": false }
  ],
  "reversible": true,
  "destructive": false,
  "requiresApproval": "never",
  "supportsDryRun": false,
  "outcome": "self-heal",
  "estDurationSec": 90,
  "icon": "shield-check"
}
```

---

## 14. Open decisions / notes for downstream docs

- **FailureMode import path.** This doc treats the 135-mode `FailureMode[]` as reference data derived from [`research/failure-catalog.json`](research/failure-catalog.json). The build step that transforms the research JSON → typed `failure-modes.ts` (field renames: `auto`→`vendorAutoHeals`, `automatable`→`selfServiceable`, severity strings → `CatalogSeverity`) should be owned by [tech-architecture](11-tech-architecture.md). Recommendation: a one-time `scripts/build-failure-modes.ts` codegen so the catalog stays single-source.
- **RemediationAction consolidation.** The catalog lists ~600 candidate-action strings; many collapse to the same parameterized action (every "Force differential merge" is one `force-merge`). The ~70-action library is the de-duplicated set; the exact mapping table belongs in [troubleshooting-and-automation-engine](07-troubleshooting-and-automation-engine.md) §action-library. Flagged so two docs don't define competing action ids.
- **Datto Cloud as facet vs kind.** Resolved here as a *facet* of BCDR `agent`/`agentless` assets (those with `OffsiteSync` + `cloudStored` points), not a 7th `AssetKind`. If [page-specs](09-page-specs.md) needs a standalone "Cloud DR" surface, it filters on that facet rather than a new entity.
- **Run-history depth vs memory.** ~9k `BackupRun` records keep the runs feed believable; if Storybook snapshot size becomes a problem, reduce embedded `recentRuns` to last-10 only and lazy-generate older runs per-asset on demand in `query.ts`.
