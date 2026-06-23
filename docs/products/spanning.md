# Spanning Backup — Product Deep Dive

> What Spanning Backup is, its entities & states, its failure modes & remediations, and what the Kaseya Resolution Center surfaces for it.
> Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md).

Grounded in [`research/failure-catalog.json`](../research/failure-catalog.json) (product `Spanning Backup (Kaseya)`, 25 failure modes) and the [failure-catalog digest](../research/00-failure-catalog-digest.md). Cross-links: [domain model](../05-domain-model.md) · [failure catalog](../02-failure-catalog.md) · [automation engine](../07-troubleshooting-and-automation-engine.md) · [content strategy](../12-content-strategy.md) · [page specs](../09-page-specs.md).

---

## 1. Product overview & how it fits the suite

**Spanning Backup** (Kaseya, formerly Datto/Unitrends, originally the Backupify lineage on the Salesforce side) is a **cloud-to-cloud SaaS backup platform** protecting three workloads:

- **Salesforce** — data **and metadata**, point-in-time restore, **metadata restore**, **sandbox seeding**, cross-org/cross-user restore & export. *This is Spanning's differentiator versus SaaS Protect.*
- **Microsoft 365** — Exchange, SharePoint, OneDrive, Teams.
- **Google Workspace** — Gmail, Drive, Calendar, Contacts.

It authenticates via **OAuth 2.0** (no stored credentials), runs **automated daily backups** of data + metadata, and integrates with **Kaseya VSA / UniView / IT Complete** and **IT Glue** for MSP management. Reputation is mixed-to-positive (G2 4.4 / Capterra 4.6 / TrustRadius 3.8): praised for "set and forget," dinged for login/authorization friction, opaque never-ending error noise, slow support, billing problems, and a notable 2023 backend incident (US Google Workspace backups slipping from daily to weekly + a support-only re-index requirement).

### Where Spanning sits relative to SaaS Protect

Spanning and **Datto SaaS Protect** overlap heavily on M365 + Google Workspace. The Care Center treats them as **distinct products with distinct vocabularies** (see [domain model](../05-domain-model.md)), not interchangeable:

| Dimension | Spanning | [SaaS Protect](saas-protect.md) |
|---|---|---|
| **Salesforce** | ✅ first-class (data + metadata + sandbox seed) | ❌ |
| Lineage / app identity | Backupify/Kaseya; OAuth 2.0, no creds | "Backupify" Azure enterprise app |
| Unit of protection | **License/seat** (assigned to a user) | **Seat** |
| Reauth wave | M365 permission expansions, Google password-change token revocation | EWS→Graph reauth (May 30 2026 deadline) |
| Management plane | VSA / UniView / IT Complete / IT Glue | Datto Partner Portal |
| Retention-on-unassign | 30d Google / 60d M365 purge clock; **Archived License** option | seat archive flow |

> **Build implication:** the Care Center must never reuse a SaaS Protect remediation component for a Spanning failure without re-grounding the copy and error strings — the auth model, license lifecycle, and Salesforce surface differ. Shared *atoms* (status pill, action card) are fine; shared *runbook content* is not.

---

## 2. Protected-asset model & backup lifecycle

Spanning has **no appliance, no agent, no local recovery point, no off-site sync** in the BCDR sense. Everything is cloud-to-cloud: source SaaS API → Spanning backend index/store. The lifecycle is therefore **OAuth authorization → seat licensing → directory sync → daily API-driven backup → point-in-time restore/export**.

### 2.1 Entity model (TypeScript sketch)

These types feed [domain model](../05-domain-model.md) and the mock-data plan in [`06`](../06-data-model-and-mock-data.md). Statuses use **semantic status tokens**, never raw color (see [design-system](../03-design-system.md)).

```ts
type SpanningWorkload = 'salesforce' | 'm365' | 'google-workspace';

// An MSP-managed customer org/tenant under Spanning
interface SpanningOrg {
  id: string;
  name: string;
  workload: SpanningWorkload;
  externalId: string;            // Azure tenantId / Google domain / SF orgId (mono font in UI)
  authState: AuthState;
  itCompleteEnabled: boolean;    // VSA/UniView managed flag (M365 gating)
  lastDirectorySyncAt: string | null;  // up to 24h stale by design
  podRegion: string;             // e.g. "US" — for cadence/incident correlation
  health: HealthRollup;          // worst real child state
}

type AuthState =
  | { kind: 'authorized' }
  | { kind: 'needs-tenant-consent' }          // "Authorize Spanning Backup on this tenant"
  | { kind: 'needs-new-permissions'; missingScopes: string[] }
  | { kind: 'token-revoked'; provider: 'google'; reason: 'password-change' }
  | { kind: 'sf-connected-app-misconfig'; missing: SfPrereq[] }
  | { kind: 'post-deploy-sync'; etaHours: number };  // up to 24h initial sync

// A licensed user = the unit of protection
interface SpanningSeat {
  id: string;
  orgId: string;
  userPrincipal: string;         // mono in UI
  license: 'active' | 'archived' | 'unassigned';
  purgeClock?: { unassignedAt: string; purgeAt: string; provider: 'google' | 'm365' };
  protectedServices: SpanningService[];  // per-workload sub-targets
  lastSuccessfulBackupAt: string | null;
  rpoDriftDays: number;          // detects daily→weekly slip
  status: AssetStatus;
}

// Per-service backup target under a seat (Mail, Drive, SharePoint site, SF object set)
interface SpanningService {
  kind: 'sf-data' | 'sf-metadata' | 'exchange' | 'sharepoint' | 'onedrive'
      | 'teams-files' | 'teams-conversations' | 'gmail' | 'gdrive'
      | 'gcalendar' | 'gcontacts';
  status: AssetStatus;
  lastBackupAt: string | null;
  recoveryPoints: number;        // # of point-in-time snapshots retained
  errors: SpanningError[];       // classified Attention-Needed vs Temporary
  // Salesforce-only
  apiLimitPct?: number;          // default 15
  initialBackupProgress?: ObjectTypeProgress[];
  // Teams-conversations-only
  conversationBackupEnabled?: boolean;  // off by default, 30d purge on disable
}

interface SpanningError {
  code: string;                  // e.g. "14022", "INACTIVE_OWNER_OR_USER"
  class: 'attention-needed' | 'temporary';   // CRITICAL triage axis
  failureId: string;             // maps to a catalog id below
  raw: string;                   // verbatim error string, mono in UI
  firstSeen: string; lastSeen: string; occurrences: number;
}
```

### 2.2 Lifecycle stages (and where they break)

```
 ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
 │ 1. AUTHORIZE│→ │ 2. LICENSE │→ │ 3. DIR SYNC│→ │ 4. BACKUP  │→ │ 5. RESTORE │
 │  OAuth      │  │  seats      │  │  ≤24h delay│  │  daily/API │  │  /export   │
 └────────────┘   └────────────┘   └────────────┘   └────────────┘   └────────────┘
   tenant consent   no seat = no    new users miss   API throttling   SF storage/dupe/
   token revoked    backup; purge   License Manager  partial errors   owner/access
   SF conn. app     clock on        (24h)            re-index loss    blocks; relationship
   stale bookmark   unassign                         cadence drift    depth >5
```

- **Recovery points** = per-service point-in-time snapshots from daily backups. There is no chain/inverse-chain concept; restore is "pick a date." Salesforce additionally supports **metadata restore** and **sandbox seeding**.
- **No verification surface** equivalent to BCDR screenshot/boot tests — Spanning's "did it work?" signal is the **backup status percentage** + the **Attention-Needed / Temporary** error split. The Care Center's job is to make that signal legible (see §4, §5).
- **No off-site/cloud sync** to manage — the data already lives in Datto/Kaseya cloud. The "sync" risks are upstream **API throttling** and the **directory sync delay**, not bandwidth.

---

## 3. Status & health semantics (Spanning-specific)

Spanning reuses the global status system from [design-system](../03-design-system.md) — **never color-only; always dot + icon + label** — but the *meaning* of each state is product-specific:

| Care Center status | Token | Spanning meaning | Example trigger |
|---|---|---|---|
| **Protected** | `--status-success` | Last daily backup succeeded; RPO within 1 day; auth valid | normal steady state |
| **Warning** | `--status-warning` | Backups completing but with **Attention-Needed** errors, RPO drift, or near seat exhaustion | partial SharePoint error 14022; cadence slipping; 1 seat left |
| **Failed** | `--status-failed` | No usable recent backup: auth blocked, no license, restore halted | tenant not authorized; user unlicensed; restore storage-limit |
| **Syncing** | `--primary` (spin) | Initial post-deploy sync, directory sync, or initial backup in progress | `post-deploy-sync` ETA; SF initial backup running |
| **Paused** | `--status-paused` (desaturated) | **Archived License** (retain, no new backups); intentionally not backing up | offboarded user on Archived License |
| **Offline** | `--status-offline` (cold) | Vendor/pod incident — backend re-index, regional cadence outage | 2023 weekly-not-daily; re-index data-access loss |

**The Spanning-specific triage axis is the error *class*, not just status.** Two failed-looking services can be completely different:

- **Attention Needed** → human/admin action required (re-authorize, assign license, fix Salesforce permission). Drives Care Center **actions**.
- **Temporary** → self-healing upstream throttle/transient; should be **collapsed/suppressed** for 1–2 backup cycles before alarming.

> A backup status tile reading "92% — multiple errors" is the canonical Spanning pain ("errors on backups that never stop", failure [23]). The Care Center's first duty is to **split that 8% into Attention-Needed vs Temporary** and surface only the actionable slice.

**Severity sort & rollup** follow the global rule (Failed > Warning > Offline > Syncing > Paused > Protected; org/fleet rollup = worst *real* child state). A Paused (Archived License) seat must **not** drag an org to a worse state — it is intentional.

---

## 4. Failure modes → remediations

All 25 catalog failures, grouped by lifecycle stage. **Self-serve** = Care Center can fix it with mock actions; **Human-in-loop** = needs an admin decision or interactive consent; **Auto** = candidate for "always / auto-remediation" scope (see [automation engine](../07-troubleshooting-and-automation-engine.md)). Action names map to `candidateActions` in the research JSON — they become the **Action cart / chain / playbook** vocabulary.

### 4.1 Authorization & login (OAuth/Auth)

| ID | Failure | Freq / Sev | Auto | Key error string |
|---|---|---|---|---|
| `m365-tenant-not-authorized` | "You need to Authorize Spanning Backup on this tenant to proceed" | common / high | ✅ | *You need to Authorize Spanning Backup on this tenant to proceed* |
| `m365-reauthorize-new-permissions` | M365 needs re-consent for expanded Graph scopes | common / med | ✅ | — |
| `google-oauth-revoked-password-change` | Google backups stop after user password change revokes token | common / high | ✅ | — |
| `login-stale-bookmark-loop` | Repeated login prompts from stale bookmark / wrong entry point | common / low | ✅ | — |

- **`m365-tenant-not-authorized`** — *Symptoms:* admin can't access console for a tenant; new VSA/UniView clients show the auth error; backups not visible. *Causes:* consent never granted; **stale bookmark**; **IT Complete not enabled** for the client; or the **≤24h post-deploy sync** still running (access blocked until it finishes — captures tenant id, account name, user count).
  - **Actions:** `Re-authorize tenant (OAuth consent deep link)` · `Check & enable IT Complete for client` · `Show post-deployment sync status / ETA` · `Validate Global Admin role before retry`.
  - **Self-serve vs human:** the *detection*, the IT-Complete toggle, and the sync-ETA countdown are self-serve/auto; the **actual OAuth consent must be completed interactively by a Global Admin in a browser** (human-in-loop) and the 24h sync **cannot be skipped**. The big win: a sync **countdown** so techs stop opening premature tickets.

- **`m365-reauthorize-new-permissions`** — Spanning extends Graph scopes for new app coverage; original consent predates them. **Actions:** `Grant new Microsoft permissions (consent deep link)` · `Notify Global Admin to re-consent` · `Compare granted vs required scopes`. Auto-detect *granted < required* scopes and surface **proactively before** backups break; consent itself is human-in-loop.

- **`google-oauth-revoked-password-change`** — Google revokes OAuth tokens on password reset; that user's daily backup silently goes stale. **Actions:** `Reconnect Google account (re-auth link)` · `Bulk email re-auth links to stale accounts` · `Flag accounts with revoked tokens`. Care Center auto-detects revoked-token accounts (auth failure on backup) and offers per-user + **bulk** re-auth email; the end-user (or admin acting for them) must complete the re-auth — cannot be forced server-side.

- **`login-stale-bookmark-loop`** — "constant login issues" from a deep/stale URL or wrong provider. **Actions:** `Redirect to canonical login URL` (`https://spanning.com/login/`) · `Provider-selection helper` · `Clear stale session/cookies`. Fully self-serve; trivial but worth a "fix my bookmark" helper because it generates ticket noise.

### 4.2 Licensing & seat lifecycle (Licensing/Seats)

| ID | Failure | Freq / Sev | Auto |
|---|---|---|---|
| `license-not-assigned-no-backup` | Users silently unprotected — no paid seat assigned | common / high | ✅ |
| `new-users-not-in-license-manager` | New users absent from License Manager (≤24h sync) | common / med | ✅ |
| `license-unassign-data-purge` | Data purged after unassign (30d Google / 60d M365) | occasional / **critical** | ✅ |
| `support-billing-friction` | Slow support; billing/duplicate-charge problems | common / med | ❌ |

- **`license-not-assigned-no-backup`** — by design any user without a paid seat is **not backed up**; gap usually discovered only at restore time. **Actions:** `Assign seats to unprotected users` · `Enable auto-license new users` · `Alert on seat pool exhaustion` · `Report all unlicensed/active users`. Detection + one-click bulk assign + auto-license toggle are self-serve; **which** users to license and **buying** seats is a human/commercial call.

- **`new-users-not-in-license-manager`** — directory syncs once daily; new hires can take ≤24h to appear. **Actions:** `Force directory sync now` · `Show last directory sync time` · `List directory users missing from Spanning`. Largely self-serve; if a forced sync still doesn't surface the user → support.

- **`license-unassign-data-purge` (CRITICAL)** — unassigning purges data: **30 days (Google) / 60 days (M365)**. **Actions:** `Apply Archived License (retain, no new backups)` · `Warn before unassign / show purge countdown` · `Reapply license within grace window` · `Alert N days before permanent purge`. This is the highest-stakes Spanning seat action and **must be approval-gated** (see [automation engine](../07-troubleshooting-and-automation-engine.md)). Care Center surfaces a **live purge countdown** per unassigned seat and offers **Archived License** as the retain-without-backup alternative at unassign time. Post-window loss is **irreversible** — never auto-remediate an unassign.

- **`support-billing-friction`** — *not technically remediable.* **Actions:** `Generate billing-dispute escalation package` · `Route to assigned account manager` · `Capture cancellation confirmation records`. Care Center's only value is a structured escalation template + evidence capture (cancellation confirmations, invoice IDs).

### 4.3 Salesforce backup & restore (the friction hotspot)

Salesforce is where Spanning's manual intervention concentrates. **Backup** can choke on API limits; **restore** can be blocked by org-side rules (storage, owners, duplicates, access, relationship depth). The console UI itself can fail to render.

| ID | Failure | Freq / Sev | Auto | Key error string |
|---|---|---|---|---|
| `sf-initial-backup-api-limit` | Initial backup never finishes — 15% API cap | common / high | ✅ | — |
| `sf-backup-appears-stalled` | Progress bar "stuck" but still running | common / low | ✅ | — |
| `sf-render-error-connected-app` | "error loading rendering Spanning Backup" in SF | occasional / high | ✅ | *error loading (rendering) Spanning Backup for Salesforce* · *refused to connect* |
| `sf-restore-storage-limit` | Restore halts: "Salesforce storage limit has been reached" | occasional / high | ✅ | *Salesforce storage limit has been reached* |
| `sf-restore-inactive-owner` | Restore fails: record owner deactivated | occasional / med | ✅ | *operation performed with inactive user … as owner* · *INACTIVE_OWNER_OR_USER* |
| `sf-restore-duplicate-rule` | Restore blocked by Duplicate Management rule | occasional / med | ✅ | *You're creating a duplicate record…* |
| `sf-restore-insufficient-access` | Record rejected: "Insufficient Access Rights" | occasional / med | ✅ | *Insufficient Access Rights* |
| `sf-request-entity-too-large` | "Request Entity Too Large" on a wide object | occasional / med | ✅ | *Request Entity Too Large: Head* |
| `sf-restore-relationship-depth` | Lookup restore fails > 5 levels / circular refs | occasional / med | ✅ | — |

- **`sf-initial-backup-api-limit`** — Spanning defaults to **15%** of the org's daily API allocation (~1 call / 2000 objects + 1 / attachment); medium/large orgs starve and the initial backup runs for days <100%. **Actions:** `Raise API limit to recommended %` · `Estimate API calls needed for org` · `Show Salesforce API usage vs allocation` · `Schedule backup outside business hours`. Care Center **auto-recommends** a % from observed object/attachment counts and offers one-click raise (toward 10–20%); choosing a % that doesn't starve other integrations is the human judgment.

- **`sf-backup-appears-stalled`** — *false alarm.* The progress bar only advances per **object-type completion**, so attachment-heavy types make it look hung. **Actions:** `Show per-object-type progress detail` · `Classify true stall vs normal long-run` · `Display current object + records processed`. Pure reassurance/triage — replace the misleading bar with granular per-object progress.

- **`sf-render-error-connected-app`** — the Spanning tab in Salesforce errors/blanks. *Causes:* `SpanningBackup`/`SpanningOauth` connected apps not enabled; VisualForce page access not granted to System Administrator; `SpanningOauth` Permitted-Users policy ≠ "Admin approved users are pre-authorized"; firewall block / unsupported edition (Professional). **Actions:** `Run Salesforce config validator` · `Enable SpanningBackup/SpanningOauth connected apps` · `Grant VisualForce page access` · `Set OAuth Permitted Users policy` · `Check edition/firewall compatibility`. The **config validator** is the hero action: it checks each prerequisite via the SF API and reports *exactly which one is missing* with a deep link — turning a multi-step KB into a checklist. Applying SF settings is a human admin action.

- **Restore blockers** — each needs a different org-side fix, which is why a generic "retry" fails:
  - **`sf-restore-storage-limit`** → `Pre-flight restore storage estimate` · `Check org storage usage` · `Resume failed records after freeing space` · `Warn before exceeding storage limit`. **Pre-flight the storage impact** before starting; resume only the failed records once space is freed. Freeing/buying storage is human.
  - **`sf-restore-inactive-owner`** → `Bulk reassign owner to active user` · `Detect inactive-owner records pre-restore` · `Temporarily reactivate original owner` · `Re-run restore for skipped records`. Detect inactive-owner records **before** restore, offer a one-click reassign to a picked active user.
  - **`sf-restore-duplicate-rule`** → `Temporarily disable duplicate rules for restore` · `Auto re-enable rules after restore` · `List active matching/duplicate rules` · `Report records blocked as duplicates`. Classic **chained, scoped, reversible** action: disable → restore → **auto re-enable** (a perfect Care Center *playbook*, see §5). Admin must accept disabling dup protection for the window.
  - **`sf-restore-insufficient-access`** → `Export per-record restore error log` · `Re-run failed records only` · `Run restore as System Administrator` · `Diagnose missing object/record access`. Parse the restore log, bucket by cause, recommend the specific permission fix.
  - **`sf-request-entity-too-large`** → `Self-service field-exclusion for object` · `Auto-suggest excludable fields` · `Open pre-filled support request for exclusions`. Today requires a support ticket; the Care Center's improvement is a **self-service per-object field-exclusion UI**.
  - **`sf-restore-relationship-depth`** → `Analyze restore relationship graph` · `Staged multi-level restore plan` · `Export ID-mapping + error log` · `Flag circular relationship records`. Restore caps at **5 nested lookup levels** and can't do **circular** refs; Care Center pre-analyzes the graph and sequences a **staged** restore.

### 4.4 M365 & Google backup health (Cloud Sync / API Throttling / Backup Chain)

| ID | Failure | Freq / Sev | Auto | Key error string |
|---|---|---|---|---|
| `m365-sharepoint-graph-500` | SharePoint/OneDrive partial fail — Graph generalException (500 / 14022) | occasional / high | ✅ | *Status code [500]* · *"code":"generalException"* · *partial error code 14022* |
| `m365-graph-throttling` | M365 SharePoint/OneDrive/Teams throttled — restart loops | common / med | ✅ | *429 Too Many Requests* · *User rate limit exceeded* |
| `google-workspace-throttling` | Gmail/Drive incomplete — API rate limiting | occasional / med | ✅ | *403 User rate limit exceeded* · *429 Too many requests* · *ETHROTTLE* |
| `google-suspended-user-not-backed-up` | Suspended Google user can't be backed up (no initial backup) | occasional / med | ✅ | — |
| `teams-conversation-30day-purge` | Teams channel convos: manual enable + 30-day purge on disable | occasional / med | ✅ | *all Teams Conversation backups are removed permanently 30 days…* |

- **`m365-sharepoint-graph-500`** — one site fails (others succeed), recurring **partial error 14022**, status <100%. Root cause is **Microsoft-side** (Graph generalException on delta queries) — *not* a Spanning defect. **Actions:** `Force re-backup affected site` · `Generate pre-filled Microsoft Graph support case` · `Extract request/client IDs from error` · `Track partial-error 14022 across runs`. Care Center auto-extracts the request-id/client-request-id + site URL into a pre-filled **Microsoft** Graph case (`aka.ms/askGraph`) and tracks whether 14022 self-clears.

- **`m365-graph-throttling` / `google-workspace-throttling`** — upstream **429/403** quota loops; large repos never catch up. **M365 actions:** `Enable adaptive backoff / off-hours scheduling` · `Identify high-churn sites driving throttling` · `Generate Microsoft quota-increase request` · `Flag oversized files (>300MB)`. **Google actions:** `Apply exponential backoff` · `Classify transient vs persistent throttle` · `Stagger large-account scheduling` · `Escalate persistent quota issues to Google`. These are mostly **Temporary** errors → apply backoff and **suppress noise** until catch-up fails across multiple runs; only then escalate to Microsoft/Google support (human). Surfacing the **high-churn sites / Power-Automate-driven files** is the actionable insight.

- **`google-suspended-user-not-backed-up`** — suspended users are inaccessible; if suspended before an initial backup, there's nothing to restore. **Actions:** `Guided reactivate/backup/re-suspend workflow` · `Flag suspended users with no backup` · `Verify license stays assigned for retention`. The guided **reactivate → backup → re-suspend** flow is self-serve orchestration, but the reactivation is a directory-admin action with security implications (human-in-loop).

- **`teams-conversation-30day-purge`** — Teams **channel conversation** backup is **off by default**, Global-Admin-enabled, ~1h Azure permission delay, and **permanently purged 30 days after disable**. **Actions:** `Enable Teams conversation backup (Global Admin)` · `Warn before disable (30-day purge)` · `Track permission-apply status` · `Flag tenants with conversation backup off`. Detect tenants with it off (a silent coverage gap); **loudly warn + countdown** before any disable.

### 4.5 Backend / vendor-side & error-noise (rare-but-severe + the noise problem)

| ID | Failure | Freq / Sev | Auto | Key error string |
|---|---|---|---|---|
| `backend-reindex-data-access-loss` | Spanning loses access to data; needs support re-index | rare / high | ❌ | — |
| `backend-backups-weekly-not-daily` | Backups slip to weekly (2023 backend long-running issue) | rare / high | ✅ | *intermittent issue with long-running backups* |
| `error-noise-attention-vs-temporary` | "Errors on backups that never stop" — opaque triage | common / med | ✅ | *Attention Needed* · *Temporary Errors* |

- **`backend-reindex-data-access-loss`** — data temporarily un-restorable until a **support-driven re-index** rebuilds the backend index. **Actions:** `Open re-index support ticket (pre-categorized)` · `Surface index/data-access health status` · `Track re-index progress`. **Not self-triggerable** (support-only); Care Center surfaces index-health status and auto-opens a categorized ticket. Show this org as **Offline** (vendor incident), not Failed.

- **`backend-backups-weekly-not-daily`** — RPO drift to multi-day; regional (US Google Workspace) backend condition. **Actions:** `Monitor backup cadence / RPO drift` · `Alert when daily backups slip` · `Correlate with vendor status page` · `Report cadence regression to support`. The MSP can only **detect + report + verify** — fix is vendor-side. The valuable automation is **per-tenant RPO/cadence monitoring** that fires when daily slips to multi-day and **correlates with the Kaseya/Spanning status feed** to distinguish vendor incidents from local throttling.

- **`error-noise-attention-vs-temporary`** — *the* signature Spanning UX problem. **Actions:** `Auto-classify errors by remediation type` · `Collapse/suppress transient error noise` · `One-click fix per Attention-Needed item` · `Webhook/API error ingestion to PSA`. Spanning's native **Error-Only Email is capped at 5/day**; the Care Center replaces it with full **API/webhook ingestion**, auto-classifies every error into Attention-Needed (→ action) vs Temporary (→ collapse), and presents a prioritized one-click action list. This failure is effectively the **organizing principle of the whole Spanning surface** (§5).

### 4.6 Self-serve vs human-in-loop vs auto — at a glance

```
 AUTO-REMEDIATE (safe "always" scope)        HUMAN-IN-LOOP (approval / interactive)
 ─────────────────────────────────────       ──────────────────────────────────────
 • Adaptive backoff on 429/403 throttle      • OAuth consent (tenant / new scopes)  ← browser, Global Admin
 • Suppress Temporary-error noise 1–2 cycles  • Google re-auth after password change ← end-user/admin
 • Force directory sync now                   • Unassign license (30/60d purge)      ← APPROVAL-GATED, irreversible
 • Auto re-enable SF duplicate rules post-    • Buy/assign seats (commercial)
   restore                                    • Free/buy Salesforce storage
 • Per-object SF progress (replace bad bar)   • Salesforce admin settings (conn app,
 • RPO/cadence drift monitoring + alerts        VisualForce, OAuth policy, owner pick)
 • Re-auth status detection & deep-link prep  • Reactivate suspended Google user
 • Pre-filled MS/Google/Spanning tickets      • Re-index (support-only, not self-serve)
                                              • Billing dispute (account manager)
```

---

## 5. Care Center views & product-specific content

The Spanning surface is built from shared atoms/molecules ([component inventory](../10-component-inventory.md)) but composes **product-specific organisms**. All UI obeys the **impeccable** mandates: tokens-only, no nested cards, no side-stripe borders, no gradient text, no decorative glassmorphism, no hero-metric template, no identical card grids, no per-section uppercase eyebrows; WCAG 2.2 AA; dense **tables as the core surface**.

### 5.1 Spanning Org list (the entry surface)

Dense TanStack table, sticky header/first column, severity-sorted, with a **last-10-backups dot-strip** per row and the **error-class split** front and center.

```
┌─ Spanning · Organizations ───────────────────────────────[ Bulk ▾ ] [ Filters ] ─┐
│ ▢ Org / Tenant        Workload   Health    Attn / Temp   Seats     Last backup   │
│ ───────────────────────────────────────────────────────────────────────────────│
│ ▢ ● Acme Corp         M365       ⛔ Failed   3 / 12       48/50     — not auth'd  │  ← needs-tenant-consent
│ ▢ ● Globex SF         Salesforce ⚠ Warning  1 / 0        12/12     init 41% ⟳    │  ← API-limit stall
│ ▢ ● Initech GWS       Google     ⚠ Warning  0 / 5        88/90     6d ago ⚠      │  ← cadence drift / throttle
│ ▢ ● Umbra M365        M365       ◐ Syncing   — / —        —         post-deploy 7h│  ← ≤24h sync countdown
│ ▢ ● Wayne GWS         Google     ✅ Protected 0 / 0        120/120   3h ago        │
│ ───────────────────────────────────────────────────────────────────────────────│
│   ▣▣▣▣▣▢▣▣▣▣  ← last-10-backups dot-strip (success / fail / paused), mono tooltip │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **`Attn / Temp` column** is Spanning-unique: it pre-splits the error noise so a tech sees *actionable count* vs *self-healing count* without opening anything.
- IDs/tenant IDs/error codes render **mono** (`--font-mono`). Status is dot+icon+label, color from status tokens only.
- Bulk toolbar exposes fleet actions: *Bulk re-auth stale Google accounts*, *Force directory sync*, *Assign seats to all unprotected*, *Apply adaptive backoff*.

### 5.2 Triage queue (organizing the never-ending errors)

Built directly on `error-noise-attention-vs-temporary`. The default Spanning landing organism: **one prioritized action list**, Attention-Needed only, Temporary collapsed behind a count chip.

```
┌─ Spanning · Triage ──────────────────────────────────────────────────────────────┐
│  ATTENTION NEEDED (4)                              Temporary (17) ⌄  collapsed     │
│  ────────────────────────────────────────────────────────────────────────────────│
│  ⛔ Acme Corp · M365 not authorized on tenant                                       │
│     "You need to Authorize Spanning Backup on this tenant…"  [ Re-authorize ▸ ]    │
│  🟥 22 unlicensed active users · Initech GWS                  [ Assign seats ▸ ]    │
│  ⚠ Globex · SF restore blocked by 3 duplicate rules          [ Disable→restore ▸ ] │
│  ⚠ 5 Google accounts revoked (password change)               [ Bulk re-auth ▸ ]    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Each row's action ▸ opens the **action panel** (one-shot scope) or drops into the **Action cart** for chaining (see [automation engine](../07-troubleshooting-and-automation-engine.md)). Error classification, collapse, and webhook ingestion are the core engine here.

### 5.3 Salesforce restore workbench (product-specific organism)

Salesforce is the one workload that earns a bespoke restore surface, because restores fail in many distinct, org-side ways. A **pre-flight panel** runs storage/owner/duplicate/relationship checks *before* the restore so failures are caught up front, and a **per-object-type progress** view replaces the misleading bar.

```
┌─ Restore · Globex (Salesforce) · point-in-time 2026-06-20 ───────────────────────┐
│  PRE-FLIGHT                                                                        │
│   ✓ Storage headroom        12.4 GB free / 8.1 GB needed                           │
│   ⚠ Inactive owners         37 records → [ Reassign to active user ▾ ]             │
│   ⚠ Duplicate rules active  3 rules     → [ Disable for restore (auto re-enable) ] │
│   ✓ Access rights           running as System Administrator                       │
│   ⚠ Relationship depth      2 chains > 5 levels → [ Staged restore plan ]          │
│  ────────────────────────────────────────────────────────────────────────────────│
│  PROGRESS (per object type — not a single bar)                                     │
│   Accounts        ▣▣▣▣▣▣▣▣▣▣ done                                                  │
│   Attachments     ▣▣▣▣▣▢▢▢▢▢ 12,403 / 24,991 records ⟳                              │
│   Opportunities   ▢▢▢▢▢▢▢▢▢▢ queued                                                │
│                                          [ Re-run failed records only ]            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

This composes the **disable-duplicate-rules → restore → auto-re-enable** reversible chain as a **saved Playbook** ("SF Restore — clean room"), gated by an approval if the org is production.

### 5.4 Seat / License Manager (with purge guardrails)

```
┌─ Spanning · Licenses · Initech GWS ──────────────────────────────────────────────┐
│  Seats 88 / 90 assigned · 2 free · Auto-license new users: [ Off → On ]            │
│  ────────────────────────────────────────────────────────────────────────────────│
│  ▢ User                  License      Last backup   Note                           │
│  ▢ jsmith@initech.com    ● Active     3h ago                                       │
│  ▢ exhire@initech.com    ◐ Unassigned  —            ⏳ purges in 14d  [ Archive ]   │  ← purge countdown
│  ▢ contractor@…          ◷ Archived    (retained)   no new backups                 │
│  ▢ newhire@initech.com   ✕ none        —            not in License Manager [ Sync ]│  ← 24h dir-sync
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Unassign is approval-gated** and always offers **Apply Archived License** as the retain-without-backup alternative; the **purge countdown** (30d Google / 60d M365) is a live timer, with alerts N days out.
- "Not in License Manager" rows expose **Force directory sync now** + last-sync timestamp so techs don't wait the full 24h blind.

### 5.5 Product-specific content the Care Center must carry

For [content strategy](../12-content-strategy.md) and runbook copy — Spanning-specific microcopy, grounded in the verbatim error strings:

- **Error-string dictionary** (mono, copyable): map each `errorStrings` entry (`14022`, `INACTIVE_OWNER_OR_USER`, `Request Entity Too Large: Head`, `429/403 User rate limit exceeded`, `You need to Authorize Spanning Backup on this tenant…`, `Salesforce storage limit has been reached`) → its `failureId` → its remediation action set.
- **"Is this a real failure?" reassurance cards** for the two false-alarm modes (`sf-backup-appears-stalled`, `login-stale-bookmark-loop`) so techs don't escalate normal behavior.
- **"Temporary vs Attention Needed" explainer** — the single most important Spanning concept; should appear as inline help wherever the error count is shown.
- **Purge-clock warnings** — explicit 30d/60d copy, with the Archived-License path, on every unassign affordance.
- **Vendor-incident banners** — for `backend-reindex-data-access-loss` and `backend-backups-weekly-not-daily`, an Offline-state banner correlated to the Kaseya/Spanning status feed, distinguishing "their problem" from "your throttling."
- **Pre-filled escalation packages** — Microsoft Graph (`aka.ms/askGraph` with request/client IDs), Google quota, Spanning re-index, and billing-dispute templates, since several Spanning failures are *only* resolvable upstream.

---

## 6. Open decisions / flags

- **Salesforce mock fidelity.** The SF restore workbench (§5.3) is by far the richest Spanning organism (pre-flight + per-object progress + staged relationship restore). Decision for [page specs](../09-page-specs.md): build it as a full template, or ship a simpler restore panel in phase 1 and defer staged-relationship restore? Recommendation: full pre-flight panel phase 1 (it prevents the most failures); staged-relationship restore can be a later iteration.
- **Auto-remediation scope for re-auth.** OAuth consent is inherently human-in-loop, so "always" auto-remediation can only go as far as *detect + notify + prep deep link + send bulk re-auth emails* — never auto-complete consent. Confirm this boundary is reflected in the [automation engine](../07-troubleshooting-and-automation-engine.md) scope model so no Spanning auth action is ever marked fully autonomous.
- **Shared vs forked components with SaaS Protect.** M365/Google throttling, seat lifecycle, and Graph errors overlap with [SaaS Protect](saas-protect.md). Flag for [component inventory](../10-component-inventory.md): share the *triage queue* and *seat manager* organisms across both products via a product-config prop, but keep error dictionaries and the Salesforce workbench Spanning-only.
