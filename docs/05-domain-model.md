# Domain Model

The conceptual entities and relationships that span all six products — the shared mental model the mock data ([data-model-and-mock-data](06-data-model-and-mock-data.md)) and every UI surface are built on.
Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

---

## 0. How to read this doc

This is the **conceptual / logical** model: entity meanings, attributes, relationships, and enums — product-agnostic where possible, with product-specific notes called out. It deliberately stops short of the wire-level TypeScript schemas, store shapes, ID generators, and seed counts — those live in [data-model-and-mock-data](06-data-model-and-mock-data.md). The remediation/automation half of the model (Action → Chain → Playbook → Policy → Approval → Audit) is summarized here as entities and detailed as behavior in [troubleshooting-and-automation-engine](07-troubleshooting-and-automation-engine.md). Failure semantics come from [failure-catalog](02-failure-catalog.md) (grounded in [research/00-failure-catalog-digest.md](research/00-failure-catalog-digest.md)).

The interface sketches below are **illustrative TypeScript-ish** — naming and shape guidance, not the final source of truth. Where a field is product-specific it is marked `// BCDR only`, `// SaaS only`, etc.

Two design tensions this model resolves:

1. **Six products, one console.** BCDR is appliance + agents + a local ZFS pool; Endpoint Backup is direct-to-cloud with no appliance; SaaS Protect and Spanning are cloud-to-cloud seats with no agent and no recovery point in the BCDR sense. The model uses a **`ProtectedAsset` supertype with a `kind` discriminator** so the fleet table, severity rollup, and action cart are uniform, while product-specific facets hang off variant sub-shapes.
2. **Health is a substrate for remediation, not the product.** Every health entity (asset, job run, recovery point, alert) exists so a `FailureMode` can be matched and a `RemediationAction` offered. The model is intentionally biased toward "what failed, why, and what fixes it."

---

## 1. Entity map (the big picture)

```
                         ┌──────────────────┐
                         │  Organization    │  (the MSP — single tenant of this console)
                         │  (MSP)           │
                         └────────┬─────────┘
                                  │ 1
                          ┌───────┴────────┐ N
                          ▼                ▼
                   ┌────────────┐   ┌──────────────┐
                   │  User      │   │  Client      │  (end customer / managed tenant)
                   │ (tech/lead)│   │  (Tenant)    │
                   └────────────┘   └──────┬───────┘
                                           │ 1..N
                                           ▼
                                      ┌──────────┐
                                      │  Site    │  (physical/logical location; optional for SaaS)
                                      └────┬─────┘
                                           │ 0..N
                       ┌───────────────────┼────────────────────────────┐
                       ▼                   ▼                             ▼
                ┌─────────────┐     ┌──────────────────────────────────────────┐
                │  Appliance  │     │            ProtectedAsset                 │
                │ (SIRIS/ALTO)│ 1   │  kind: agent | agentless | endpoint |     │
                │             ├────►│        saas-seat | salesforce-org | share │
                │  StoragePool│ N   └───────────────┬──────────────────────────┘
                └──────┬──────┘                     │ 1
                       │ 1                           │
                       ▼ N                           ▼ N
                ┌─────────────┐              ┌──────────────┐
                │ OffsiteSync │              │  BackupJob   │ (the schedule/policy)
                │ /Replication│              └──────┬───────┘
                └─────────────┘                     │ 1..N
                                                    ▼
                                             ┌──────────────┐
                                             │  BackupRun   │ (one execution attempt)
                                             └──────┬───────┘
                                          produces  │ 0..1
                                                    ▼
                                             ┌──────────────────┐      ┌─────────────────────┐
                                             │  RecoveryPoint   │ 1──N │ ScreenshotVerif.    │
                                             │  (Snapshot)      │◄─────┤ (boot test)         │
                                             └──────────────────┘      └─────────────────────┘

   ── failure & remediation plane ──────────────────────────────────────────────────────────

   BackupRun / Asset / RecoveryPoint / ScreenshotVerif  ──raise──►  Alert ──groups──►  Incident
                                                  │                   │
                                          matched │                   │ classified-as
                                                  ▼                   ▼
                                           ┌──────────────┐    ┌──────────────┐
                                           │ FailureMode  │◄───┤ (catalog)    │
                                           └──────┬───────┘    └──────────────┘
                                                  │ offers (1..N)
                                                  ▼
                                           ┌──────────────────┐
                                           │ RemediationAction│ (catalog definition)
                                           └──────┬───────────┘
                                  instantiated as │                composed into
                                                  ▼                      ▼
                                           ┌──────────────┐       ┌──────────────┐      ┌──────────────┐
                                           │  ActionRun   │       │  Playbook    │ 1──N │ AutomationPol│
                                           └──────┬───────┘       └──────────────┘      │ (apply-always)│
                                       may require │                                     └──────────────┘
                                                   ▼
                                           ┌──────────────┐       ┌──────────────┐
                                           │ApprovalRequest│      │ AuditLogEntry│ ◄── every state change
                                           └──────────────┘       └──────────────┘

   ── cross-cutting ──  User · SavedView (per-user filter/scope) · FailureMode (shared catalog)
```

Read it in two planes: the **health plane** (top — what is being protected and how it's doing) and the **remediation plane** (bottom — what's wrong and what fixes it). The two meet at `Alert`/`FailureMode`.

---

## 2. Tenancy & inventory entities

### 2.1 Organization (the MSP)

The console is single-tenant: it belongs to **one MSP**. `Organization` is the root scope for users, clients, saved views, playbooks, policies, and audit. In the mock there is exactly one and most code can assume it implicitly; it exists so multi-tenant concepts (entitlements, contract dates, the post-Kaseya licensing pain) have a home.

```ts
interface Organization {
  id: OrgId;
  name: string;                 // "Northwind Managed IT"
  partnerPortalId: string;      // mono: "DAT-PRT-00481"
  region: DattoRegion;          // pod/region the MSP's tenants live on
  contract: {
    tier: "Datto365" | "Standalone" | "Legacy";
    renewalDate: ISODate;       // surfaces the multi-year lock-in / price-hike pain
    seatEntitlement: number;    // total purchased SaaS/Spanning seats
    storageEntitlementTB: number;
  };
  branding: { showPoweredByKaseya: boolean };  // gates the --kaseya-purple upsell accent
}
```

### 2.2 Client (Tenant)

An **end customer** of the MSP. Everything protected belongs to a client. A client may span multiple products at once (a BCDR appliance on-prem *and* M365 SaaS Protect seats *and* Spanning Salesforce) — this is the normal MSP case and drives the cross-product rollup on the client detail page.

```ts
interface Client {
  id: ClientId;
  orgId: OrgId;
  name: string;                 // "Acme Dental Group"
  externalRef: string;          // PSA/IT Glue id, mono
  products: ProductType[];      // which of the 6 this client uses
  healthRollup: StatusRollup;   // worst real child state across all assets
  saasTenant?: {                // present if SaaS Protect / Spanning M365/Google
    m365TenantId?: string;      // guid, mono
    googleDomain?: string;      // "acmedental.com"
    authStatus: AuthStatus;     // surfaces OAuth/consent failures at the tenant level
  };
}
```

### 2.3 Site

A physical or logical **location** within a client (HQ, branch, datacenter). Appliances and agentful/agentless assets live at a site. **Optional / often null** for purely cloud products (endpoint, SaaS, Spanning) where there is no premises — those assets attach directly to the client. Keeping `siteId` nullable avoids forcing a fake site onto cloud assets.

```ts
interface Site {
  id: SiteId;
  clientId: ClientId;
  name: string;                 // "Acme — Dallas HQ"
  timezone: string;             // backup-window math, "America/Chicago"
  applianceIds: ApplianceId[];
}
```

### 2.4 Appliance (SIRIS / ALTO) — **BCDR / Cloud DR only**

The on-prem box. Owns the local ZFS `StoragePool`, hosts agentful/agentless assets, performs local virtualization and screenshot verification, and runs `OffsiteSync` to the Datto Cloud. Endpoint Backup, SaaS Protect, and Spanning have **no appliance** — this entity is null/absent for them.

```ts
interface Appliance {
  id: ApplianceId;
  siteId: SiteId;
  model: "SIRIS" | "ALTO" | "NAS";
  hardwareModel: string;        // "S5-4", mono
  serial: string;               // mono
  imageVersion: string;         // appliance OS build, mono
  status: DeviceStatus;         // online | offline | degraded
  lastCheckIn: ISODateTime;
  storagePoolId: StoragePoolId;
  rebootedAt?: ISODateTime;     // drives "encrypted agents re-sealed after reboot" detection
}
```

---

## 3. The ProtectedAsset supertype (the spine)

`ProtectedAsset` is the **one entity the fleet table, severity rollup, action cart, and saved views operate on**, regardless of product. A discriminated `kind` selects the variant. Common fields are shared; product-specific facets live on the variant.

```ts
type ProtectedAsset =
  | AgentAsset            // BCDR agent-based (Windows/Linux image backup)
  | AgentlessAsset        // BCDR VMware/Hyper-V hypervisor-integrated
  | EndpointAsset         // DEB v1 / v2 direct-to-cloud
  | SaasSeatAsset         // SaaS Protect mailbox/OneDrive/SharePoint/Teams/Google seat
  | SalesforceOrgAsset    // Spanning Salesforce org (also M365/Google seats via Spanning)
  | ShareAsset;           // BCDR NAS / network-share protection

interface ProtectedAssetBase {
  id: AssetId;
  kind: AssetKind;              // discriminator
  productType: ProductType;     // which of the 6 owns it
  clientId: ClientId;
  siteId?: SiteId;              // null for cloud-only kinds
  applianceId?: ApplianceId;    // null for endpoint/SaaS/Spanning
  displayName: string;          // hostname / mailbox / org name
  status: AssetStatus;          // computed: worst of recent runs + comms + verification
  lastGoodBackupAt?: ISODateTime;  // the "last-good recency" metric the console leads with
  protectionEnabled: boolean;   // false = intentionally paused (desaturated, not red)
  recentRuns: BackupRunSummary[];  // last 10 → the dot-strip
  openAlertIds: AlertId[];
  tags: string[];
}
```

### 3.1 Per-`kind` variants — how the products differ

| `kind` | Products | Has appliance? | Backup unit | Recovery point? | Screenshot verif? | Distinctive facet fields |
|---|---|---|---|---|---|---|
| `agent` | BCDR | Yes | image (block) | Yes (local + cloud) | Yes | `os`, `agentVersion`, `driverStatus`, `vssStatus`, `encrypted`, `sealed`, `pairingStatus`, `backupChainState` |
| `agentless` | BCDR | Yes | image via hypervisor | Yes | Yes | `hypervisor: vmware\|hyperv`, `cbtStatus`, `vmwareToolsState`, `stalledSnapshots` |
| `endpoint` | DEB v1 / v2 | **No** (direct-to-cloud) | image (block) | Yes (cloud) | Yes (cloud) | `agentGen: v1\|v2`, `consoleSurface: partner-portal\|uniview`, `cbtFilterStatus`, `meteredPaused`, `supportabilityFlags[]` |
| `saas-seat` | SaaS Protect | No | per-seat sync (Graph/Google API) | **No** (point-in-time set, not bootable snapshot) | **No** | `seatType: exchange\|onedrive\|sharepoint\|teams\|gmail\|gdrive`, `licensed`, `archived`, `billedWhileArchived`, `lastBackupRunPerService` |
| `salesforce-org` | Spanning | No | metadata + data via SF API | **No** (daily backup set) | **No** | `sfOrgType: production\|sandbox`, `apiCallCapPct`, `apiUsage`, `metadataBackup`, `seatType?` (Spanning also covers M365/Google) |
| `share` | BCDR (NAS) | Yes | share snapshot | Yes | No | `protocol: smb\|nfs`, `sharePath`, `credentialStatus` |

**Key product divergences the model must hold:**

- **Recovery point is not universal.** `agent`/`agentless`/`endpoint`/`share` produce bootable, chainable `RecoveryPoint`s on a ZFS Inverse Chain. `saas-seat` and `salesforce-org` instead produce **point-in-time backup sets** (a logical snapshot of mailbox/site/org state) — modeled as `RecoveryPoint` with `pointKind: "saas-set"` so the timeline UI is uniform, but with no `bootable`, no `chainState`, no screenshot.
- **Screenshot verification only applies to image backups** (`agent`/`agentless`/`endpoint`). For SaaS/Spanning, "verification" is a successful API sync, not a boot test.
- **Appliance & StoragePool only exist for BCDR.** Endpoint's storage is a cloud pool (consumption billing); SaaS/Spanning have no exposed pool.
- **Identity differs:** BCDR/endpoint assets are keyed by **hostname**; SaaS seats by **UPN / email**; Salesforce by **org id**. See §10.
- **Auth/consent is an asset/tenant concern for cloud products** (OAuth grant, Global Admin consent, revoked token) and an **agent-pairing concern for BCDR/endpoint** (secure pairing cert, port reachability). Both surface through the same `FailureMode` plane.

```ts
interface AgentAsset extends ProtectedAssetBase {
  kind: "agent";
  os: { family: "windows" | "linux"; version: string };
  agentVersion: string;            // mono
  driverStatus: "loaded" | "pending-reboot" | "blocked-by-av";  // diff-merge cause
  vssStatus: "healthy" | "writer-failed" | "dbd-fallback";
  encrypted: boolean;
  sealed: boolean;                 // true after appliance reboot until passphrase re-entered
  pairingStatus: "paired" | "401-unauthorized" | "cert-expired" | "port-blocked";
  backupChainState: ChainState;
}

interface SaasSeatAsset extends ProtectedAssetBase {
  kind: "saas-seat";
  seatType: SaasSeatType;          // exchange | onedrive | sharepoint | teams | gmail | gdrive
  upn: string;                     // user@tenant.onmicrosoft.com
  licensed: boolean;
  archived: boolean;               // offboarded
  billedWhileArchived: boolean;    // the "archived seats still billed" pain
  authStatus: AuthStatus;          // inherits/overrides tenant consent state
}
```

---

## 4. Backup execution entities

### 4.1 BackupJob (the schedule / policy)

The **definition** of protection for an asset: schedule, retention, scope, throttle. Not an execution. One asset usually has one `BackupJob`; SaaS seats may have one per service (mail vs OneDrive). Retention and throttle here are the levers many remediation actions tune (e.g. *Apply suggested retention*, *Raise transmit limit*, *Toggle pause-while-metered*).

```ts
interface BackupJob {
  id: BackupJobId;
  assetId: AssetId;
  schedule: { cadence: "continuous" | "hourly" | "daily" | "weekly"; windows?: TimeWindow[] };
  retention: RetentionPolicy;      // local + cloud; decoupled for DEB v2 (90d..7y)
  throttle?: ThrottleProfile;      // bandwidth; throttle=0 deadlock bug lives here
  scope?: { includes: string[]; excludes: string[] };  // selective backup / wildcards
  pauseWhileMetered?: boolean;     // DEB networking pain
}
```

### 4.2 BackupRun (one execution attempt)

A single attempt to run a `BackupJob`. The **primary unit of the dot-strip** ("last 10 backups") and the most common thing an `Alert` points at. Carries the raw error string and classified `FailureMode` so "why did it fail" is one hop away.

```ts
interface BackupRun {
  id: BackupRunId;
  jobId: BackupJobId;
  assetId: AssetId;
  startedAt: ISODateTime;
  finishedAt?: ISODateTime;
  state: RunState;                 // see enum §8
  mode: "full" | "incremental" | "differential-merge" | "saas-sync";
  consistency?: "application" | "crash-consistent-dbd";  // VSS outcome (image kinds)
  bytesTransferred?: number;       // mono in UI
  recoveryPointId?: RecoveryPointId;  // produced on success
  errorCode?: string;              // mono: "0x7B", "AADSTS500014", "Code 9999", "429"
  errorMessage?: string;           // the actual string shown as evidence
  failureModeId?: FailureModeId;   // classification → unlocks remediation
}
```

### 4.3 RecoveryPoint (Snapshot)

A restorable point in time. For image kinds it is a **node on the ZFS Inverse Chain** (independently bootable); for SaaS/Spanning it is a logical **backup set**. Drives the recovery timeline, restore actions, retention-expiry warnings, and Cloud Deletion Defense.

```ts
interface RecoveryPoint {
  id: RecoveryPointId;
  assetId: AssetId;
  takenAt: ISODateTime;
  pointKind: "image-chain" | "saas-set";
  // image-chain only:
  bootable?: boolean;
  chainState?: ChainState;         // ok | needs-diff-merge | rebuilding | corrupt
  localStored: boolean;
  cloudStored: boolean;            // off-site replicated yet?
  verification?: VerificationResult;  // screenshot/local verify outcome
  locked?: boolean;                // "preserve this point" guard
  expiresAt?: ISODateTime;         // retention; warns before a needed point expires
  deletedButRecoverable?: boolean; // within Cloud Deletion Defense window
}
```

### 4.4 ScreenshotVerification (boot test) — **image kinds only**

Datto's automated boot test of a recovery point. Central to the **cosmetic-vs-real** distinction the whole product is built around: a screenshot "failure" (Getting Devices Ready, long hostname, NIC-required boot, blank screen) is frequently *not* a DR failure. The model captures the classification so the UI can desaturate cosmetic failures instead of crying wolf.

```ts
interface ScreenshotVerification {
  id: ScreenshotVerifId;
  recoveryPointId: RecoveryPointId;
  ranAt: ISODateTime;
  outcome: "passed" | "failed" | "not-run";
  imageUrl?: string;               // the captured boot screenshot (mock asset)
  classification: "verified" | "cosmetic-failure" | "real-boot-failure" | "indeterminate";
  signal?: string;                 // "0x7B INACCESSIBLE_BOOT_DEVICE", "sysprep", "hostname>15"
  waitTimeSec?: number;            // tunable; "Increase Additional Wait Time" action
}
```

### 4.5 StoragePool (ZFS) — **BCDR appliance only**

The local ZFS pool on an appliance. Source of the #1 BCDR pain (pool fills → backups skipped → new agents blocked) and the critical pool-degraded/faulted-drive case. Endpoint's cloud consumption pool reuses this shape with `kind: "cloud-consumption"`.

```ts
interface StoragePool {
  id: StoragePoolId;
  applianceId?: ApplianceId;       // null for cloud-consumption
  kind: "zfs-local" | "cloud-consumption";
  capacityBytes: number;
  usedBytes: number;
  freeBytes: number;               // drives "days until full" forecast
  health: "online" | "degraded" | "faulted";  // drive/checksum errors
  topConsumers?: { assetId: AssetId; bytes: number }[];
}
```

### 4.6 OffsiteSync / Replication — **BCDR / Cloud DR; analog for endpoint**

The off-site replication stream from appliance (or endpoint agent) to Datto Cloud. Owns the very-common "sync falling behind" pain, RoundTrip seed requests, throttle/transmit-limit levers, and the retention-stall-from-sync-backlog cascade.

```ts
interface OffsiteSync {
  id: OffsiteSyncId;
  applianceId?: ApplianceId;       // or endpoint asset
  assetId?: AssetId;
  state: "current" | "behind" | "paused" | "seeding" | "roundtrip-pending";
  backlogBytes: number;
  oldestUnsyncedPointAt?: ISODateTime;  // staleness of cloud DR points
  transmitLimitMbps?: number;      // the throttle the remediation action raises
  etaToCurrent?: ISODateTime;
}
```

---

## 5. Failure & alerting entities

### 5.1 Alert

A surfaced condition needing triage. Points at the asset/run/point/verification that triggered it, carries severity, and (when classified) links to a `FailureMode`. Alerts are **deduped and grouped** so a fleet of identical failures (the 2 a.m. wall of red) collapses sanely.

```ts
interface Alert {
  id: AlertId;
  clientId: ClientId;
  assetId?: AssetId;
  source: "backup-run" | "verification" | "comms" | "storage" | "sync" | "auth" | "platform";
  subjectRef: EntityRef;           // run / point / pool / sync / asset
  severity: Severity;              // failed | warning | offline ...
  category: FailureCategory;       // see enum §8
  title: string;
  rawError?: string;               // mono evidence
  failureModeId?: FailureModeId;   // classification result
  state: "open" | "acknowledged" | "suppressed" | "resolved" | "auto-resolved";
  isCosmetic: boolean;             // screenshot timing etc. → desaturated, not red
  firstSeenAt: ISODateTime;
  lastSeenAt: ISODateTime;
  occurrenceCount: number;         // dedupe rollup
  incidentId?: IncidentId;
}
```

### 5.2 Incident

A **correlation grouping** above alerts: a single root cause hitting many assets at once — a pod-level Microsoft throttling event, the v2 mass-offline platform outage, an appliance reboot re-sealing every encrypted agent, an off-site sync backlog stalling retention fleet-wide. Lets the UI post one banner + ETA instead of N duplicate alerts, and supports post-incident reconciliation.

```ts
interface Incident {
  id: IncidentId;
  kind: "platform-outage" | "pod-throttling" | "appliance-reboot" | "sync-backlog" | "mass-reauth";
  scope: "fleet" | "pod" | "appliance" | "tenant";
  alertIds: AlertId[];
  status: "active" | "monitoring" | "resolved";
  vendorStatusRef?: string;        // correlated Datto/Microsoft status incident
  bannerText?: string;
  openedAt: ISODateTime;
  resolvedAt?: ISODateTime;
}
```

### 5.3 FailureMode (shared catalog — the hinge)

The **catalog definition** of a known failure, drawn from the research ([research/00-failure-catalog-digest.md](research/00-failure-catalog-digest.md), `failure-catalog.json`). This is **reference data, not per-tenant state**: ~130 failure modes across the six products. It is the hinge between health and remediation — an `Alert`/`BackupRun` is *classified as* a `FailureMode`, which *offers* a set of `RemediationAction`s. Carries the cosmetic-vs-real default and whether Datto already auto-heals it.

```ts
interface FailureMode {
  id: FailureModeId;               // "bcdr.zfs-pool-full", "saas.ews-graph-reauth"
  productType: ProductType;
  category: FailureCategory;
  title: string;
  description: string;
  defaultSeverity: Severity;
  frequency: "very-common" | "common" | "occasional" | "rare";
  cosmeticByDefault: boolean;      // screenshot-timing class
  vendorAutoHeals: boolean;        // Datto auto diff-merge / auto-skip etc. (auto:true in research)
  selfServiceable: boolean;        // can a tech fix it here vs must-ticket
  matchSignals: MatchSignal[];     // error codes / strings used to classify an alert
  remediationActionIds: RemediationActionId[];  // ordered, primary-first
  runbookRef?: string;             // → content-strategy runbook copy
}
```

---

## 6. Remediation & automation entities

These are the heart of the product; full behavior in [troubleshooting-and-automation-engine](07-troubleshooting-and-automation-engine.md). Here are the entities and how they relate.

### 6.1 RemediationAction (catalog definition)

A **parameterized, reusable fix** — the atomic verb of the product ("Run Force Retention now", "Repair Agent Communications", "Launch Global Admin consent flow", "Force differential merge"). This is a *definition*; an *execution* is an `ActionRun`. Actions declare their target kind, parameters, reversibility, approval requirement, and a **dry-run/preview** capability.

```ts
interface RemediationAction {
  id: RemediationActionId;         // "force-retention", "repair-agent-comms"
  label: string;
  actionType: ActionType;          // see enum §8
  appliesToKinds: AssetKind[];     // which ProtectedAsset variants it can target
  productTypes: ProductType[];
  params: ActionParamSpec[];       // typed inputs (retention days, wait-time, throttle Mbps)
  reversible: boolean;             // failback/unseat-delete are irreversible
  destructive: boolean;            // gates confirmation + approval
  requiresApproval: ApprovalRule;  // never | over-threshold | always
  supportsDryRun: boolean;         // preview impact before commit
  outcome: "self-heal" | "guidance-only" | "opens-ticket";  // some only assemble a Support package
  estDurationSec?: number;         // for chain ETA
}
```

### 6.2 ActionRun (one execution)

A single execution of a `RemediationAction` against a concrete target (one asset, or a batch). The audited unit. Holds scope, params used, result, and any approval that gated it.

```ts
interface ActionRun {
  id: ActionRunId;
  actionId: RemediationActionId;
  triggeredBy: { kind: "user" | "playbook" | "policy"; refId: string };
  scope: ActionScope;              // once | all-matching | always (see enum §8)
  targetRefs: EntityRef[];         // resolved assets/points
  paramsUsed: Record<string, unknown>;
  state: ActionRunState;           // queued | awaiting-approval | running | succeeded | failed | rolled-back | skipped
  dryRun: boolean;
  approvalRequestId?: ApprovalRequestId;
  chainRunId?: ChainRunId;         // if part of a chain
  startedAt?: ISODateTime;
  finishedAt?: ISODateTime;
  resultSummary?: string;          // "Freed 1.2 TB on pool", "Re-paired 7 of 7 agents"
  auditLogEntryIds: AuditLogEntryId[];
}
```

### 6.3 Playbook (saved chain)

A **named, ordered sequence** of `RemediationAction`s saved for reuse — "fix once, then fix forever, step one." Steps can be conditional (run B only if A failed) and carry per-step params. A `ChainRun` is one execution of a playbook (or an ad-hoc chain assembled in the action cart).

```ts
interface Playbook {
  id: PlaybookId;
  orgId: OrgId;
  name: string;                    // "Wedged Windows agent recovery"
  description: string;
  forFailureModeIds?: FailureModeId[];  // suggested when these failures match
  steps: PlaybookStep[];           // ordered; each = action + params + condition
  defaultScope: ActionScope;
  createdBy: UserId;
  lastRunAt?: ISODateTime;
}

interface PlaybookStep {
  actionId: RemediationActionId;
  params: Record<string, unknown>;
  runIf?: "always" | "prev-succeeded" | "prev-failed";
  haltOnFailure: boolean;
}
```

### 6.4 AutomationPolicy (apply-always)

The **"always going forward" scope** crystallized into standing automation: when a matching `FailureMode` is detected on assets in scope, run this action/playbook automatically (optionally gated by approval). This is the top of the fix-once-then-forever ladder. It is what converts a manual button into self-healing.

```ts
interface AutomationPolicy {
  id: AutomationPolicyId;
  orgId: OrgId;
  name: string;
  trigger: { failureModeId: FailureModeId; matchFilter?: AssetFilter };
  appliesTo: AssetFilter;          // client/site/tag/product scope
  action: { kind: "action" | "playbook"; refId: string; params: Record<string, unknown> };
  approvalRule: ApprovalRule;      // auto-run vs require approval each time
  enabled: boolean;
  dryRunFirst: boolean;            // observe-only mode before going live
  stats: { triggered: number; succeeded: number; lastFiredAt?: ISODateTime };
}
```

### 6.5 ApprovalRequest

A **gate** on a destructive/irreversible/over-threshold action or policy firing. Holds the requested action, requester, scope/blast-radius preview, and the approver's decision. Realizes "human in the loop by choice, not friction" — only the risky stuff is gated.

```ts
interface ApprovalRequest {
  id: ApprovalRequestId;
  requestedFor: { kind: "action-run" | "policy-fire"; refId: string };
  requestedBy: UserId;
  reason: "destructive" | "irreversible" | "over-threshold" | "policy-default";
  blastRadius: { assetCount: number; preview: string };  // dry-run summary
  state: "pending" | "approved" | "rejected" | "expired";
  decidedBy?: UserId;
  decidedAt?: ISODateTime;
  note?: string;
}
```

### 6.6 AuditLogEntry

Immutable record of **every meaningful state change** — action runs, approvals, policy edits, scope escalations, suppressions, manual overrides. Append-only; the compliance and "who fixed what when" surface.

```ts
interface AuditLogEntry {
  id: AuditLogEntryId;
  at: ISODateTime;
  actor: { kind: "user" | "policy" | "system"; refId: string };
  verb: AuditVerb;                 // ran-action | approved | rejected | created-playbook | enabled-policy | suppressed-alert | overrode | rolled-back
  subjectRef: EntityRef;
  scope?: ActionScope;
  before?: unknown;                // diff for config changes
  after?: unknown;
  outcome?: "succeeded" | "failed" | "partial";
  detail: string;                  // human-readable line
}
```

---

## 7. Cross-cutting entities

### 7.1 User

A member of the MSP using the console. Drives RBAC (who can approve), authorship of playbooks/policies, and the assignee on incidents. Maps to the personas in [personas-and-jobs](01-personas-and-jobs.md): tech, NOC analyst, service manager/lead, junior/onboarding.

```ts
interface User {
  id: UserId;
  orgId: OrgId;
  name: string;
  email: string;                   // e.g. nimda_sys@hotmail.com style mock addresses
  role: "tech" | "noc-analyst" | "service-manager" | "junior" | "admin";
  canApprove: boolean;             // gates ApprovalRequest decisions
  prefs: { density: "comfortable" | "dense"; theme: "light" | "dark" | "system" };
}
```

### 7.2 SavedView

A **persisted filter + scope + column/sort config** over the fleet table or alert queue — the NOC analyst's "my morning triage" view. Backed by URL state (nuqs) and localStorage; shareable within the org.

```ts
interface SavedView {
  id: SavedViewId;
  ownerId: UserId;
  scope: "private" | "org";
  surface: "fleet" | "alerts" | "incidents" | "playbooks" | "audit";
  name: string;                    // "Failed (real) — last 24h"
  filter: AssetFilter | AlertFilter;
  sort: SortSpec[];
  columns?: string[];
  pinned: boolean;
}
```

---

## 8. Key enums

Status, severity, and category are **shared vocabulary across all six products** so the table/badge/rollup logic is uniform. Status tokens map 1:1 to the design-system status tokens in [design-system](03-design-system.md) — never color-only, always dot + icon + label.

### AssetStatus / DeviceStatus (the visible health badge)
| value | meaning | token | notes |
|---|---|---|---|
| `protected` | last backup good, comms healthy | success | "Protected" |
| `warning` | imperfect but not data-loss (cosmetic screenshot, behind sync) | warning | amber |
| `failed` | real backup/protection failure | failed | red, reserved for real |
| `paused` | intentionally disabled | paused | **desaturated**, not red |
| `syncing` | replicating / seeding / running | primary-blue | spinner |
| `offline` | agent/appliance not checking in | offline | cold |

### Severity & sort order
`failed > warning > offline > syncing > paused > protected`. **Fleet rollup = worst real child state** (not an average; intentional-paused does not dominate; cosmetic warnings sort below real failures via `isCosmetic`).

### FailureCategory (from the research taxonomy)
`Storage/ZFS` · `Backup Chain` · `Agent Communication` · `Screenshot/Local Verification` · `Cloud Sync` · `Diff-Merge/Chain Rebuild` · `Local Virtualization` · `BMR` · `File Restore` · `Networking` · `Ransomware Detection` · `OAuth/Auth` · `API Throttling` · `Licensing/Seats` · `Reporting`

### ProductType
`bcdr` · `endpoint-v1` · `endpoint-v2` · `datto-cloud` · `saas-protect` · `spanning`

### AssetKind
`agent` · `agentless` · `endpoint` · `saas-seat` · `salesforce-org` · `share`

### RunState (BackupRun)
`queued` · `running` · `success` · `success-crash-consistent` · `failed` · `skipped` · `cancelled` · `stuck` *(e.g. stuck-at-99% / zero-throughput)*

### ChainState (image kinds)
`ok` · `needs-diff-merge` · `rebuilding` · `corrupt` · `verifying`

### ActionType
`run-now` · `repair` · `reconfigure` · `restart-service` · `re-pair-auth` · `reauthorize-oauth` · `force-merge` · `force-retention` · `resume-sync` · `throttle-adjust` · `unseal-decrypt` · `restore` · `virtualize` · `suppress-alert` · `assemble-support-ticket` · `guidance-runbook`

### ActionScope (the spine: once → all → always)
`once` *(this asset)* · `all-matching` *(every asset matching a filter, now)* · `always` *(standing AutomationPolicy going forward)*

### ActionRunState
`queued` · `awaiting-approval` · `running` · `succeeded` · `partial` · `failed` · `rolled-back` · `skipped`

### AuthStatus (cloud products)
`authorized` · `consent-required` · `token-revoked` · `reauth-required` · `expired` *(e.g. EWS→Graph deadline)*

### ApprovalRule
`never` · `over-threshold` *(blast radius > N assets)* · `always`

---

## 9. Relationships & cardinality (reference)

| From | Rel | To | Card | Notes |
|---|---|---|---|---|
| Organization | has | User | 1→N | single MSP tenant |
| Organization | has | Client | 1→N | |
| Client | has | Site | 1→0..N | optional for cloud-only clients |
| Client | uses | ProductType | N↔N | a client can span all 6 |
| Site | hosts | Appliance | 1→0..N | BCDR only |
| Appliance | owns | StoragePool | 1→1 | ZFS |
| Appliance | runs | OffsiteSync | 1→0..N | |
| Appliance \| Site \| Client | protects | ProtectedAsset | 1→N | parent depends on `kind` |
| ProtectedAsset | has | BackupJob | 1→1..N | per-service for SaaS |
| BackupJob | spawns | BackupRun | 1→N | last 10 = dot-strip |
| BackupRun | produces | RecoveryPoint | 1→0..1 | none on failure |
| RecoveryPoint | has | ScreenshotVerification | 1→0..N | image kinds only |
| BackupRun \| Asset \| Point | raises | Alert | 1→N | |
| Alert | groups under | Incident | N→0..1 | correlation |
| Alert | classified as | FailureMode | N→0..1 | the hinge |
| FailureMode | offers | RemediationAction | 1→1..N | ordered, primary-first |
| RemediationAction | executed as | ActionRun | 1→N | |
| RemediationAction | composed into | PlaybookStep | N↔N | |
| Playbook | composed of | PlaybookStep | 1→N | ordered |
| AutomationPolicy | triggers | RemediationAction \| Playbook | N→1 | apply-always |
| ActionRun \| PolicyFire | may require | ApprovalRequest | 1→0..1 | gated by rule |
| (any state change) | writes | AuditLogEntry | 1→N | append-only |
| User | owns | SavedView | 1→N | private or org-shared |
| User | authors | Playbook \| AutomationPolicy | 1→N | |
| User | decides | ApprovalRequest | 1→N | requires `canApprove` |

---

## 10. Identity & naming conventions (mock realism)

IDs are **mono-rendered** in the UI (per design system). Use stable, human-legible, prefixed, deterministic IDs so screenshots and stories are reproducible (the seed plan is in [data-model-and-mock-data](06-data-model-and-mock-data.md)).

| Entity | ID prefix | Example | Display identity (what techs recognize) |
|---|---|---|---|
| Organization | `ORG-` | `ORG-NWND` | MSP name |
| Client | `CLI-` | `CLI-ACME` | "Acme Dental Group" |
| Site | `SITE-` | `SITE-ACME-DAL` | "Acme — Dallas HQ" |
| Appliance | `APP-` | `APP-7F3A21` (+ serial `S5-4 / DAT-S5-9X2K`) | model + hostname |
| Asset (agent/endpoint) | `AST-` | `AST-WIN-DC01` | **hostname** `ACME-DC01` |
| Asset (agentless) | `AST-` | `AST-VM-SQL02` | VM name |
| Asset (saas-seat) | `SEAT-` | `SEAT-jdoe@acme` | **UPN / email** |
| Asset (salesforce-org) | `SFO-` | `SFO-00D5x000001` | SF org id |
| BackupRun | `RUN-` | `RUN-20260622-031` | timestamp |
| RecoveryPoint | `RP-` | `RP-1718000000` | epoch/timestamp |
| FailureMode | dotted | `bcdr.zfs-pool-full` | title |
| RemediationAction | kebab | `force-retention` | label |
| Playbook | `PB-` | `PB-WEDGED-AGENT` | name |
| AutomationPolicy | `POL-` | `POL-AUTO-MERGE` | name |
| ActionRun | `ACT-` | `ACT-9F2C` | — |
| Alert / Incident | `ALR-` / `INC-` | `ALR-44210` / `INC-POD-EU3` | title |

**Naming realism cues that should appear in mock data** (so failures feel authentic to the audience):
- Hostnames like `ACME-DC01`, `NWND-SQL02`, `CONTOSO-FS1`; the **>15-char hostname** case (e.g. `ACME-TERMINALSRV01`) deliberately seeded to drive the cosmetic-screenshot failure.
- Error codes verbatim and mono: `0x0000007B`, `Code 9999`, `AADSTS500014`, `AADSTS90002`, `429`, `503`, `ErrorAccessDenied`, `ErrorInvalidSyncStateData`, `error 14022`.
- M365 UPNs and `*.onmicrosoft.com` tenants; Salesforce `00D` org ids; Google `*.com` domains.
- Datto-specific ports surfaced in comms failures: `25568`, `3260`, `3262`, `443`, and the host `mothership.dtc.datto.com`.
- Realistic sizes/throughput in mono: pool `8.0 TB`, free `412 GB`, backlog `1.2 TB`, transmit `25 Mbps`.

---

## 11. Open decisions flagged for downstream docs

- **RecoveryPoint polymorphism vs split type.** This doc models SaaS/Spanning backup sets as `RecoveryPoint{ pointKind:"saas-set" }` for a uniform timeline. [data-model-and-mock-data](06-data-model-and-mock-data.md) should confirm whether the wire schema keeps one type with optional fields or splits `ImageRecoveryPoint` / `SaasBackupSet`. Recommendation: one type, discriminated, to keep the timeline component generic.
- **Chain vs Playbook overlap.** An ad-hoc action-cart chain and a saved `Playbook` share the `PlaybookStep` shape; [troubleshooting-and-automation-engine](07-troubleshooting-and-automation-engine.md) owns whether an un-saved chain is a transient `Playbook` or a distinct `ChainRun` envelope. Recommendation: ad-hoc chain = unnamed transient playbook + `ChainRun`.
- **Where AuthStatus lives** (tenant `Client.saasTenant` vs per-`SaasSeatAsset`). Both are referenced above because Microsoft consent is tenant-wide but a single seat can fail auth independently. Treat tenant as the default and let the seat override.
