# Datto SaaS Protect — Product Deep Dive

Diagnose-and-fix reference for Datto SaaS Protect (M365 + Google Workspace cloud-to-cloud backup): entities, health semantics, failure modes, and the remediation surface the Care Center exposes. Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md).

> Grounded in [`research/failure-catalog.json`](../research/failure-catalog.json) (product 4) and the [failure-catalog digest](../research/00-failure-catalog-digest.md). Cross-links: [failure catalog](../02-failure-catalog.md) · [domain model](../05-domain-model.md) · [troubleshooting & automation engine](../07-troubleshooting-and-automation-engine.md) · [content strategy](../12-content-strategy.md). Sibling product: [Spanning](spanning.md) (the closest cousin — read both before designing shared SaaS surfaces).

---

## 1. Product overview & suite fit

Datto SaaS Protect (formerly Backupify; still uses the **"Backupify" Azure enterprise app** for OAuth) is a **cloud-to-cloud SaaS backup** service for:

- **Microsoft 365** — Exchange Online (mailboxes), SharePoint (sites/lists/libraries), OneDrive (personal sites), Teams (chats/channels).
- **Google Workspace** — Gmail, Drive, Calendar, Contacts, Shared Drives.

It is sold **almost exclusively to MSPs** and managed from the **Datto Partner Portal**. There is **no agent and no appliance** — it authenticates to the customer tenant via **OAuth 2** (delegated + app permissions) and pulls data through **Microsoft Graph / EWS** and **Google APIs**, storing backups in Datto's multi-tenant cloud **pods** (e.g. `des1-saas-p0`, `des1-saas-p1`).

**Where it sits in the suite.** SaaS Protect is the only fully cloud-native, source-is-someone-else's-cloud product in the stack. Unlike [BCDR](bcdr.md), [Endpoint Backup](endpoint-backup.md), and [Datto Cloud DR](datto-cloud.md) — where Datto controls the agent/appliance and the failure is usually local (VSS, drivers, ports) — **SaaS Protect's failures are dominated by the upstream SaaS vendor**: Microsoft Graph/Google API **throttling**, **OAuth consent** lifecycle, and **license/seat** state. Datto cannot fix Microsoft's throttle or click consent for a Global Admin; the Care Center's job here is **orchestration, triage, reauth queueing, and license reclamation**, not low-level remediation.

**Closest cousin: [Spanning](spanning.md).** Both back up M365 + Google Workspace cloud-to-cloud. Differences the Care Center must respect:
- SaaS Protect does **not** cover Salesforce; Spanning does (and Spanning is the only one with Salesforce restore failures).
- SaaS Protect's seat model is **archive-retains-but-still-bills**; Spanning **purges** data after a grace window (30d Google / 60d M365). Do not share license-reclamation copy verbatim between them.
- The **EWS→Graph reauthorization wave** (deadline-driven) is a SaaS Protect concept; do not surface it for Spanning.

---

## 2. Protected-asset model & backup lifecycle

### 2.1 Entity hierarchy

```
Partner (MSP)
└── Organization (one M365 or Google tenant)        ← billing + authorization boundary
    ├── Authorization grant(s)  (Backupify app consent: Exchange/Graph, Site Manager, Teams)
    ├── Seat   (a protected principal)
    │   ├── seatType: Exchange | OneDrive | SharePoint | Teams | GoogleMail | GoogleDrive | ...
    │   ├── status:   Active | Paused | Archived | Unprotected | Inactive
    │   └── Backup runs → Snapshots (point-in-time recovery points, 1–3×/day)
    ├── Site   (SharePoint site / Teams team — managed via Site Manager)
    └── Pod    (the multi-tenant storage cell the org lives on)   ← shared-fate blast radius
```

A **Seat** is the unit of licensing **and** the unit of protection. One human can hold several seats (e.g. an M365 user = an Exchange seat + a OneDrive seat). The **Organization** is the unit of OAuth authorization and of billing.

### 2.2 Type sketch (see [data model](../06-data-model-and-mock-data.md) for the canonical schema)

```ts
type SeatType =
  | 'exchange' | 'onedrive' | 'sharepoint' | 'teams'
  | 'google-mail' | 'google-drive' | 'google-calendar' | 'google-contacts' | 'shared-drive';

type SeatStatus =
  | 'active'       // protected, backing up
  | 'paused'       // protection deliberately suspended (no new points, retained)
  | 'archived'     // source principal gone; data retained but STILL BILLED
  | 'unprotected'  // discovered but never protected (Auto-Add off / not Protect-All'd)
  | 'inactive';    // service unreachable (e.g. OneDrive not provisioned, license removed)

interface Seat {
  id: string;
  orgId: string;
  type: SeatType;
  displayName: string;          // mailbox / site / team name
  upn?: string;                  // user principal name (mono)
  status: SeatStatus;
  billed: boolean;               // archived seats are billed:true
  autoAdd: boolean;              // per seat-type policy at org level
  lastSuccessfulBackup?: string; // ISO; drives RPO drift
  lastRunStatus: 'success' | 'partial' | 'failure' | 'throttled' | 'skipped';
  consecutiveFailures: number;
  retentionDaysRemaining?: number;
}

interface Organization {
  id: string;
  provider: 'm365' | 'google';
  podId: string;                 // e.g. 'des1-saas-p1'
  authStatus: 'authorized' | 'unauthorized' | 'partial'; // partial = some grants missing
  grants: {
    exchangeGraph: boolean;
    siteManager: boolean;
    teams: boolean;
  };
  reauthDeadline?: string;       // EWS→Graph: 2026-05-30
  protectedSeats: number;
  discoveredSeats: number;       // discoveredSeats > protectedSeats ⇒ coverage gap
  billableSeats: number;
}
```

### 2.3 Lifecycle

1. **Authorize** — A Global Admin consents the Backupify app for the tenant (Exchange/Graph + optionally Site Manager + Teams). This is the **gate**: no consent ⇒ no discovery ⇒ no backup.
2. **Seat discovery** (`RemoteSeatUpdate`) — Datto enumerates tenant principals via Graph/Google Directory. Runs on a schedule; can be force-triggered. **If discovery cannot read the tenant, it conservatively archives seats** (see Failure 3).
3. **Auto-Add + Protect All** — newly discovered eligible seats are protected automatically **only if Auto-Add is on for that seat type**; `Protect All` activates the existing unprotected backlog.
4. **Scheduled backup** — **1–3× per day** (frequency may be silently reduced by Datto R&D on an overloaded pod — see Failure 19). Incrementals use a stored **sync state / historyId cursor** (Exchange `SyncState`, Gmail `startHistoryId`, Teams Graph sync token).
5. **Snapshots** — each successful run produces a point-in-time recovery point. Verification is **lightweight** (item-level success/partial/failure) — there is **no boot test or screenshot verification** here (that is a BCDR/Endpoint concept; do not surface it for SaaS Protect).
6. **Restore / export** — **in-place restore** (back into the live tenant) or **export** (PST for mail/contacts; file/zip for Drive/SharePoint/OneDrive). Restore lands in a **named subfolder under the restoring user's Inbox** for mail (not the exact original folder — see Failure 21).
7. **Offboard** — when a source principal disappears, the seat goes **Archived**: data is retained but **the license is still consumed/billed** until a human types `delete my data` (see Failure 4).

> **No screenshot/boot verification, no local virtualization, no BMR, no ZFS-pool-on-prem, no agent comms.** Those are appliance/endpoint concepts. The Care Center's SaaS Protect surface must NOT borrow that vocabulary.

---

## 3. Status & health semantics (product-specific)

Map to the canonical status tokens from the [design system](../03-design-system.md) — **never color-only; always dot + icon + label.** SaaS Protect overloads the standard set with two product-specific dimensions: **authorization** and **license/billing**.

| State | Token | Meaning in SaaS Protect | Drives |
|---|---|---|---|
| Protected | `success` (#28A745) | Seat Active, last run success, within RPO | green dot-strip |
| Warning | `warning` (#FFC107) | Partial Success, throttled run, RPO drift, reauth-needed-but-not-yet-broken | sort up |
| Failed | `failed` (#DC3545) | Backup failure, **Unauthorized** org (Exchange stops), seat unexpectedly Archived | sort top |
| Throttled | `syncing` (primary blue, spin) | Active but stalled on 429/503; **distinct visual** = "working, just slow" not "broken" | informational |
| Paused | `paused` (desaturated #6C757D) | Protection deliberately suspended | bottom |
| Inactive | `offline` (cold #343A40) | Service unreachable (OneDrive not provisioned, license removed, ResourceDisabled) | sort mid |

Product-specific overlays (render as **badges**, not status dots, so they compose with the dot):
- **Auth badge** — `Authorized` / `Reauth needed (Nx)` / `Unauthorized` with a **deadline countdown** when `reauthDeadline` is set. Reauth-needed is a Warning until the deadline lapses, then Failed.
- **Billing badge** — `Archived · still billed`, `Coverage gap (N unprotected)`, `Reclaimable (N seats)`. These are **cost** signals, not health — color them with status tokens but label them explicitly as billing.

**Severity sort** (org/fleet rollup = worst real child state): `Unauthorized/Failed > Warning > Inactive > Throttled > Paused > Protected`. A **pod incident** outranks per-seat states for triage but is suppressed-not-promoted on individual seats (see Failure 19).

**RPO drift** is the canonical SaaS Protect health metric: `now − lastSuccessfulBackup`. Because cadence is 1–3×/day and can be silently dropped on busy pods, surface **"hours behind RPO"** prominently — it is the earliest honest signal of a throttling loop the per-run status hides.

---

## 4. Failure modes & Care Center remediation

All 22 failures from the research, grouped by what the Care Center can actually do about them. Each row notes **self-serve vs human-in-loop (HITL)** and **auto-remediation** eligibility per the [automation engine](../07-troubleshooting-and-automation-engine.md). `[id]` is the catalog id.

**Hard ceiling to respect everywhere:** Datto **cannot** lift Microsoft/Google throttling and **cannot** click interactive Global Admin consent. For those, "auto-remediate" means *orchestrate the queue, schedule, detect, verify* — never *fix the root cause*. Mark every consent/throttle action's scope so it can be chained and audited but never run silently against the SaaS vendor.

### 4.1 Authorization & consent (OAuth/Auth) — HITL gate, auto-orchestrated

| # | Failure | Freq/Sev | Symptoms / error strings | Self-serve vs HITL | Care Center actions |
|---|---|---|---|---|---|
| 2 | **EWS→Graph reauth wave** `[ews-graph-reauthorization-deadline]` | very common / **critical** | Org in "Unauthorized Organizations" dialog; "Check Authorization" link; Exchange + Teams backups stop; still unauthorized until reload. Deadline **2026-05-30** (EWS deprecated 2026-10-01). | **HITL** — interactive Global Admin Accept is mandatory per tenant, cannot be scripted. Tracking *which* of dozens/hundreds of tenants remain is the burden. | `Launch Global Admin consent flow`, `Re-check authorization status`, **`Bulk reauth queue w/ deadline countdown`**, `Send reauth reminder digest`, `Verify post-reauth Exchange backup succeeds`. **Auto: orchestrate queue + reminders + post-consent re-check; never the click.** |
| 8 | **Site Manager / Teams not reauthorized** `[sharepoint-site-manager-reauth]` | occasional / medium | New SharePoint sites not auto-added; can't pause/remove sites; Teams unavailable until reauth. | **HITL** consent; orchestration automatable. | `Launch Site Manager activation consent`, `Launch Teams reauthorization`, `Re-check site/Teams auth`, `Add to reauth queue`. Feed into the **same reauth dashboard** as #2. |

**Design implication:** a single **Reauthorization Center** (org-list view, deadline countdown, deep-link-per-tenant, auto re-check on focus return, daily "X tenants still need reauth" digest) is the highest-value SaaS Protect surface. Model the **consent click as an external HITL action node** in a chain: the chain pauses at it, deep-links out, and resumes on verified success.

### 4.2 License & seat lifecycle (Licensing/Seats) — billing decisions, guarded auto

| # | Failure | Freq/Sev | Symptoms / error strings | Self-serve vs HITL | Care Center actions |
|---|---|---|---|---|---|
| 3 | **Mass seat archive from tenant/license/consent errors** `[seats-archived-tenant-api-errors]` | occasional / high | All/most seats flip Archived; whole org stops. Errors: `AADSTS500014` (Tenant Resource Disabled), `AADSTS90002` (Tenant Not Found), `AADSTS500011` (Resource Principal Not Found), "Doesn't Have a Valid License". | **HITL** to fix the Microsoft side (renew/re-enable/re-consent) + judgement on legit-vs-false-alarm; **auto** re-discovery. | **`Decode AADSTS error → remediation card`**, `Launch reauthorization`, `Force seat re-discovery (RemoteSeatUpdate)`, `Protect All eligible`, **`Mass-archive early-warning alert`** (before billing impact). |
| 4 | **Archived seats still billed** `[archived-seat-still-billed]` | common / medium | Billable count > active users; departed staff still counted; can't reassign license. By design: archive retains data, keeps billing. | **HITL** — permanent deletion is deliberate, irreversible (type `delete my data`, case-sensitive); judgement on retention. | `List archived-but-billed seats`, **`Bulk unseat eligible (guarded)`**, `Recommend reclaimable licenses`, `Show retention vs data-age per seat`. **Never auto-delete** — destructive; always explicit confirm. |
| 5 | **New users not protected (Auto-Add off)** `[new-user-not-protected-autoadd]` | common / medium | New users have no backups; seats discovered but Unprotected; onboarding coverage gap. | **Self-serve** mechanics; **HITL** billing/policy decision (pay per seat). | `Enable Auto-Add per seat type`, `Protect All eligible`, **`Coverage-gap alert (users vs protected)`**, **`Cost preview before protecting`**. |
| 14 | **Google seat status out of sync** `[google-seat-archived-mismatch]` | occasional / low | User archived/suspended in Google Admin still shows Active in Datto; stale billing/coverage. | **Self-serve** reconcile; **HITL** to confirm departure + unseat. | `Reconcile Google vs Datto seat status`, `Flag stale Active seats`, `Unseat departed Google users`, `Force seat re-sync`. |
| 22 | **Org not mapped in Partner Portal** `[unmapped-org-partner-portal]` | occasional / medium *(confidence: low)* | Org missing/unmapped between SaaS Protection ↔ Partner Portal; billing discrepancies; not reflected in reporting. | **Partly self-serve** mapping; billing corrections need Kaseya support. | `Detect unmapped organizations`, `Reconcile billable vs protected seats`, `Request billing review`, `Validate Commitment/Retention settings`. |

**Design implication:** a **License Reclamation** report (archived-but-billed + reclaimable recommendation + retention-vs-data-age) is the second-highest-value surface — it directly returns money to the MSP. The destructive unseat is the canonical **"guarded action"** for the [automation engine](../07-troubleshooting-and-automation-engine.md): it can be **chained and previewed** but its scope is permanently capped at **"apply once, explicit confirm"** — never "always / auto-remediate."

### 4.3 API throttling & pod incidents (API Throttling, Storage/ZFS) — Datto/Microsoft-side, orchestrate only

| # | Failure | Freq/Sev | Symptoms / error strings | Self-serve vs HITL | Care Center actions |
|---|---|---|---|---|---|
| 1 | **SharePoint/Teams throttling loop** `[graph-sharepoint-teams-throttling-loop]` | **very common** / high | Backup runs hours, never 100% / perpetual "in progress" or "partial"; cadence silently drops (3×→2×); large-repo timestamp falls behind; pod shows "backup performance degradation". Errors: `429 Too Many Requests`, `503 Service Unavailable`, `AskTimeoutException`, `SocketTimeoutException: 200000 MILLISECONDS`. | **HITL** to re-architect SharePoint data + engage Microsoft Support (Datto can't lift the throttle); accepting reduced cadence is a human call. | `Reschedule backup to low-throttle window`, `Reduce scope / split repository`, `Open pod incident status`, `Generate Microsoft throttling support ticket`, **`Throttle-loop watchdog (escalate after N stalls)`**. |
| 19 | **Pod-level degradation / ZFS export errors** `[pod-performance-degradation-storage]` | common / high | Many tenants on one pod slow at once; status page "backup performance degradation" on `desX-saas-pY`; export failures / "Abrupt termination exception"; "degraded zpool status". | **No MSP fix** — Datto-side; MSP only monitors + communicates to clients. | `Subscribe to pod status feed`, **`Suppress tenant alerts during pod incident`**, `Show active pod incident banner`, `Post-incident missed-backup reconciliation`. |

**Design implication:** Throttling must render as **`syncing`/Throttled (blue), not `failed` (red)** — it is "working, just slow," and red here trains techs to chase un-fixable Microsoft limits. A **pod-incident banner** (subscribe to the per-pod status feed) is essential: when a matching pod incident is active, **auto-suppress per-tenant alerts** and show one banner so techs don't open 40 tickets for one Microsoft throttle spike. The **throttle-loop watchdog** (N consecutive throttled runs → escalate) is the one safe automation here.

### 4.4 Per-service backup-chain failures — mostly self-healing + classify

| # | Failure | Freq/Sev | Symptoms / error strings | Self-serve vs HITL | Care Center actions |
|---|---|---|---|---|---|
| 6 | **Exchange first backup ErrorAccessDenied (mailbox never logged in)** `[exchange-first-backup-access-denied]` | occasional / medium | First-ever Exchange backup for a new user fails; one mailbox fails while others succeed. Errors: `ErrorAccessDenied`, `ExchangeItemUnknownError: ... ErrorAccessDenied`, `InvalidUserPrincipalName`. | **HITL** — user must sign into the mailbox once (Datto can't); re-run is auto. | **`Classify as uninitialized-mailbox`**, **`Send 'log in once' email to user`**, `Retry backup after first login`, `Flag mailboxes with zero successful backups`. |
| 7 | **Teams/SharePoint FolderEnumeration Access Denied (unlicensed/old owner)** `[teams-folderenumeration-access-denied]` | occasional / medium | Specific team/group fails repeatedly; "Access is denied" tied to a team; others succeed. Error: `FolderEnumerationUnknownError - Access is denied. Check credentials and try again`. | **HITL** ownership change (M365 admin); re-run auto. | `Identify affected team/group`, **`Flag unlicensed/departed owners via Graph`**, `Retry backup after ownership fix`, `Link to group ownership admin page`. |
| 9 | **Corrupt/oversized/unsupported items → "unknown error"** `[corrupt-item-unknown-error-skip]` | common / low | Recurring "unknown error" / partial; same item fails every run; vague, no description. Errors: `ErrorCorruptData`, `ErrorInternalServerError`, `ErrorMessageSizeExceeded`, `invalid GlobalObjectId`, `ErrorUnsupportedPropertyDefinition`, `DeserializationException: Object is missing required member`. | **Auto** — Datto already auto-skips confirmed non-actionable items; occasional support review of misclassification. | **`Show auto-skipped non-actionable items`**, **`Separate fixable vs non-actionable errors`**, `Re-run after item skip`, `Open event log for item detail`. |
| 10 | **Exchange ErrorInvalidSyncStateData (re-sync loop)** `[exchange-invalidsyncstate-retry]` | occasional / medium | Incrementals fail; repeated/inconsistent sync cycles; never settles. Errors: `ErrorInvalidSyncStateData`, `FolderHierarchySyncUnknownError`. | **Auto** — Datto resets sync state + retries; persistent → support. | `Reset sync state / full re-sync`, **`Auto-escalate non-converging mailbox`**, `Show sync-state reset history`. |
| 11 | **OneDrive NotProvisioned / 423 Locked / ResourceDisabled** `[onedrive-not-provisioned-locked]` | occasional / medium | OneDrive shows failing/"Inactive"; `423 Locked`; intermittent `OneDriveNotProvisioned` despite license. Errors: `OneDriveNotProvisioned`, `423 Locked`, `ResourceDisabledError`, `EmptyUrl`, `NotProvisioned`, `UnknownHostException`. | **HITL** to provision (user opens OneDrive) / re-enable license; auto re-detect + retry. | **`Classify OneDrive failure cause`** (provisioning vs license vs geo-URL), `Send 'open OneDrive once' email`, `Refresh multi-geo URL and retry`, `Re-run OneDrive backup`. |
| 12 | **SharePoint 403 / lookup-column threshold / read-only DB** `[sharepoint-403-lookup-threshold]` | occasional / medium | List/library 403 or 500; "lookup column threshold" 500 on large lists; "Database Is Read Only" 403. Errors: `...ForbiddenError: 403 FORBIDDEN`, `500 ... lookup column threshold`, `403 FORBIDDEN: Database Is Read Only`, `400 Bad Request - Item does not exist`, `SharepointExceedsMaxUrlLengthError`, `HttpNotFoundError: 404 Not Found`. | **HITL** SharePoint-admin restructure/permissions; re-run auto; some deleted-item cases auto-skipped. | **`Map SharePoint error → remediation card`**, `Link to SharePoint admin setting`, `Re-run SharePoint backup`, `Skip persistently broken list item`. |
| 13 | **Google Mail invalid startHistoryId (404) → rate-limit cascade** `[google-mail-invalid-historyid]` | occasional / medium | Repeated Google Mail failures; `404 Requested entity was not found` on history; cascading `429`/`503`. Errors: `invalid startHistoryId`, `404`, `429`, `503`. | **Auto** — Datto discards invalid historyId + reschedules; persistent → check Google quota. | **`Show historyId reset status`**, `Reschedule Google Mail backup`, **`Alert on reschedule loop`**, `Check Google API quota`. |
| 20 | **Teams expired sync token / 400 after Graph migration** `[teams-sync-token-expired]` | occasional / medium | Teams chat/channel backup fails; "400 Bad Request: Sync token expired"; `FolderHierarchySyncUnknown` 404 when service has no Teams. Errors: `400 Bad Request: Sync token expired`, `FolderHierarchySyncUnknown`, `HttpNotFoundError (404)`, `400 Bad Request - Item does not exist`. | **Auto** resync; **HITL** Teams reauth + confirm Teams still exists. | `Reset Teams sync token / resync`, `Queue Teams reauthorization`, `Confirm Teams presence for service`, `Re-run Teams backup`. |

**Design implication:** failures 9/10/13/20 are **already self-healing on Datto's side** — the Care Center's job is to **show the auto-action that happened** ("historyId reset, run rescheduled"; "non-actionable items skipped") so techs **stop chasing them**, and to **route the small persistent tail** to escalation. Build a **fixable-vs-non-actionable splitter** as the core triage primitive.

### 4.5 Restore & export (File Restore, Reporting)

| # | Failure | Freq/Sev | Symptoms / error strings | Self-serve vs HITL | Care Center actions |
|---|---|---|---|---|---|
| 15 | **PST export fails/disappears / partial content** `[pst-export-unavailable-unsupported-items]` | occasional / medium | PST export disappears on start; "The Export service is currently unavailable"; fails when snapshot has non-mail/contact items (PST = mail+contacts only). Errors: `The Export service is currently unavailable`, `Uncaught PHP Exception`, `noSuchItemException`. | **HITL** format choice + content validation; auto-retry transient. | **`Pre-flight export content check`**, **`Recommend restore vs PST export`**, `Auto-retry failed export`, `Notify on export completion`. |
| 16 | **Exported zip won't extract (path too long / 0x80010135), huge download times out** `[export-zip-extract-path-too-long]` | common / low | Explorer can't extract; "Error 0x80010135: File path too long"; 100GB+ download fails mid-transfer. | **HITL** local tooling (7-Zip, short path, resumable download). | **`Warn on large/deep export`**, **`Offer segmented/chunked export`**, `Link 7-Zip extraction guide`, `Provide resumable download link`. |
| 17 | **Slow/imprecise search & restore; Recovery tabs time out** `[slow-search-restore-large-dataset]` | common / medium | Search/restore slow on large mailboxes/sites; Exports/Restores tabs fail to load. Error: `AskTimeoutException`. | **HITL** scope/batch decision; no one-click fix beyond narrowing. | **`Suggest scoped/batched restore`**, `Show restore progress/ETA`, **`Restore-stall watchdog`**, `Schedule restore off-peak`. |
| 21 | **Restore loses sharing perms / lands in unexpected location** `[restore-permissions-not-preserved]` | occasional / medium | Post-restore shared links/permissions missing; mail restored into a **named subfolder under the restoring user's Inbox**, not original folder. | **HITL** re-apply permissions + validate location. | **`Preview restore destination`**, **`Post-restore validation checklist`**, `Flag unrestored permissions`, `Offer export alternative for exact-location fidelity`. |
| 18 | **Opaque error reporting forces manual report-digging** `[opaque-error-reporting]` | common / medium | Failed/partial with no inline cause; details live in Admin > Reporting custom report + View Event Log. Strings: `unknown error`, `Failure`, `Partial Success`. | **HITL** interpret + choose fix. | **`Auto-aggregate failures into triage queue`**, **`Group failures by error class`**, **`Auto-link error to remediation playbook`**, `Generate failure report on demand`. |

**Design implication:** Failure 18 is the meta-failure that justifies this whole product surface. The Care Center's flagship SaaS Protect deliverable is the **cross-org triage queue** that replaces "Admin > Reporting → filter Failure/Partial → View Event Log" — auto-aggregate every org's failures, **group by error class**, and pre-link each class to its remediation playbook from §4.1–4.5.

---

## 5. Auto-remediation eligibility summary

What can be a **standing auto-remediation** (scope = "always / going forward") vs **assist-only**, per the [automation engine](../07-troubleshooting-and-automation-engine.md) scope model (apply once / to all matching / always):

| Eligible for unattended auto-remediation | Assist-only (require human click / approval — never silent) |
|---|---|
| Throttle-loop watchdog → escalate after N stalls (#1) | Any **Global Admin consent / reauthorization** (#2, #3, #8, #20) — interactive, can't script |
| Mass-archive early-warning alert (#3) | Any **destructive unseat / delete-backups** (#4) — `delete my data` confirm |
| Coverage-gap alert + cost preview (#5) | **Protect All / Enable Auto-Add** when it incurs new billing (#5) — needs cost approval |
| Reconcile Google↔Datto seat status, flag stale (#14) | **Microsoft/Google Support tickets** (#1) — outbound, human-reviewed |
| Suppress per-tenant alerts during a matching pod incident (#19) | **SharePoint/Teams admin fixes** (#7, #12) — customer-side Microsoft admin |
| Auto-classify + skip non-actionable items, surface them (#9) | **Local restore tooling** (7-Zip, resumable download) (#16) — on the tech's machine |
| Sync-state / historyId reset surfacing + non-converge escalation (#10, #13, #20) | **Format/scope/permission restore decisions** (#15, #17, #21) — judgement |
| Detect unmapped orgs / billable-count mismatch → reconciliation report (#22) | Deciding to accept reduced backup cadence (#1) — human acceptance |

**Rule of thumb encoded for the engine:** for SaaS Protect, *detection, classification, queueing, scheduling, alerting, and verification* auto-remediate; *consent, deletion, new billing, and the SaaS-vendor root cause* never do. Tag each action node with `requiresHumanClick: boolean` and `incursBilling: boolean` so the scope picker hides the "always" option where they are true.

---

## 6. Product-specific Care Center views

Beyond the shared fleet table/triage surfaces, SaaS Protect needs these dedicated screens (wireframe-level specs land in [page specs](../09-page-specs.md); these are the SaaS-specific requirements):

### 6.1 Reauthorization Center (the #1 SaaS surface)
Org-list table of every org with `authStatus ≠ authorized`, columns: Org · Provider · **Deadline countdown** (EWS→Graph `2026-05-30`) · Missing grants (Exchange/Graph · Site Manager · Teams) · Last consent attempt. Bulk select → queue. Each row deep-links the Global Admin consent flow in a new tab and **auto re-checks on focus return**. Daily digest action. The consent click is an **external HITL node** in any chain that touches it.

```
┌ Reauthorization Center ─────────────────────────────────────────────┐
│ ⚠ 14 orgs need reauthorization · 8 days to EWS→Graph deadline        │
│ [Authorize all eligible]  [Send reminder digest]  [Re-check all]     │
├──────────────┬─────────┬───────────┬──────────────────┬─────────────┤
│ Org          │ Provider│ Countdown │ Missing grants   │ Action      │
├──────────────┼─────────┼───────────┼──────────────────┼─────────────┤
│ ● Contoso    │ M365    │  8d ⚠     │ Exchange/Graph   │ [Authorize] │
│ ● Fabrikam   │ M365    │  8d ⚠     │ Teams, Sites     │ [Authorize] │
│ ◐ Northwind  │ M365    │  —        │ Site Manager     │ [Authorize] │
└──────────────┴─────────┴───────────┴──────────────────┴─────────────┘
```

### 6.2 License Reclamation report (#2 SaaS surface)
Archived-but-billed seats with **retention-vs-data-age** per seat and a **"safe to reclaim (N seats / $X)"** recommendation. Bulk unseat is **guarded** (preview list → explicit `delete my data` confirm, irreversible warning). Also surfaces **coverage gaps** (discovered > protected) with a **cost preview** before Protect All.

### 6.3 Throttling & Pod Status board
Per-pod health (subscribe to the Datto SaaS Protection status feed). Active pod incident → **banner + auto-suppress per-tenant alerts** + post-incident missed-backup reconciliation. Throttled seats shown in **blue/Throttled**, never red. Throttle-loop watchdog counter per seat.

### 6.4 Failure Triage Queue (replaces Admin > Reporting digging)
Cross-org aggregation **grouped by error class** (AADSTS · throttling · access-denied · sync-state · OneDrive-provisioning · SharePoint-403 · export). Each group header carries a count, a sparkline of trend, and a **"Run remediation playbook"** button. Drill-in shows the raw `errorString` and event-log link. This is where most of §4 surfaces.

### 6.5 Restore Console (SaaS-flavored)
Restore-vs-export chooser with **format pre-flight** (PST = mail+contacts only → recommend restore when snapshot has other types), **restore-destination preview** (warn about the named-Inbox-subfolder behavior and unrestored permissions), large/deep-export warning with **segmented export** + 7-Zip guidance, and a **restore-stall watchdog** with progress/ETA.

---

## 7. Product-specific content & vocabulary

For [content strategy](../12-content-strategy.md). Use **Microsoft/Google's own error vocabulary** — techs search by it.

- **Terms to use natively:** Backupify app / enterprise app · Global Admin consent · `RemoteSeatUpdate` (seat discovery) · seat / archived seat / `delete my data` · Site Manager · Auto-Add / Protect All · pod (`des1-saas-p1`) · EWS→Graph migration · sync state / `startHistoryId` / sync token · in-place restore vs PST/zip export · partial success · RPO drift.
- **Decode-and-explain copy** for raw errors (don't just echo them): `AADSTS500014/90002/500011`, `ErrorAccessDenied`, `ErrorInvalidSyncStateData`, `OneDriveNotProvisioned`/`423 Locked`, `403 FORBIDDEN` + lookup-column threshold, `429`/`503` throttling, `0x80010135` path-too-long, `FolderEnumerationUnknownError`, `invalid startHistoryId`. Render IDs/codes/UPNs/pod-names in **mono** per the design system.
- **Tone for un-fixable failures:** throttling and pod incidents must read as *"Microsoft is rate-limiting / Datto is working it"* — not "your backup is broken." This is the single biggest trust lever; getting it wrong trains MSPs to distrust the console.
- **Deadline-driven urgency** for the EWS→Graph wave: countdown chips, daily digests, and a clear "Exchange backups stop on 2026-05-30 if not reauthorized" warning — but never alarmist red on orgs that are merely *pending* (Warning until lapsed).

---

## 8. Open decisions / flags

- **Mock data deadline date.** "Today" in the env context is **2026-06-22**, which is *after* both the May 30 reauth deadline and the June 30 Graph cutover. Decide whether mock orgs are seeded **pre-deadline** (countdown still meaningful — recommended for demoing the Reauthorization Center) or set the mock "now" to ~April 2026. Flag for [mock-data](../06-data-model-and-mock-data.md).
- **Throttled as a first-class status token?** §3 maps Throttled onto the `syncing` token. Confirm with the [design system](../03-design-system.md) whether Throttled deserves its own labeled variant (distinct icon, same blue) rather than reusing Syncing, since the semantics differ ("stalled-but-retrying" vs "actively copying").
- **Shared vs forked SaaS surfaces with Spanning.** The Reauthorization Center, License Reclamation, and Triage Queue are conceptually shared with [Spanning](spanning.md) but differ on retention/purge semantics and Salesforce coverage. Decide in [IA](../04-information-architecture.md) whether these are one product-filtered surface or two — recommend one surface, product-scoped, with per-product copy/policy variants.
