# Content Strategy

Rich, relevant content for every product — runbook copy, failure explanations, microcopy, and empty/error/loading states that make the Kaseya Resolution Center read like an expert sitting beside the tech.
Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

---

## 0. Why this doc exists

The Care Center is a *troubleshooting-first* console, not a dashboard. Its value is in the **words**: a tech lands on a failed agent and the screen must explain — in plain language — what broke, why, whether it's even real, and what to click. Every component in the [component inventory](10-component-inventory.md) consumes content from a small set of templates defined here. Mock content must be **consistent, deterministic, and grounded in real failure modes** (see [failure catalog](02-failure-catalog.md) and the [research digest](research/00-failure-catalog-digest.md)) so the product feels lived-in, not lorem-ipsum.

This doc defines:
- **Voice & tone** rules that gate all copy.
- The **content surfaces** per product (failure explanations, why-panels, runbooks, what-to-check lists, KB cards).
- **Action microcopy** (labels, confirms, dry-run previews, toasts, approval cards).
- **Status/severity language** — especially cosmetic-warning vs real-failure phrasing.
- **Empty / loading / error / zero-result** states.
- **Reusable content templates** the components render from.
- **Worked examples** for 6 representative failures across the products.

> **Companion docs:** action mechanics live in the [troubleshooting & automation engine](07-troubleshooting-and-automation-engine.md); token/status visuals live in the [design system](03-design-system.md); where copy appears on each screen is in the [page specs](09-page-specs.md).

---

## 1. Voice & tone

The Care Center speaks like a **senior NOC engineer who has seen this failure a thousand times**: calm, precise, evidence-led, never alarmist. The reader is a stressed MSP tech triaging at 2 a.m.; our job is to lower their cortisol, not raise it.

### 1.1 Voice pillars

| Pillar | Means | Looks like | Never |
|---|---|---|---|
| **Calm** | State facts; don't catastrophize. Reserve red language for real data risk. | "Screenshot verification failed. The backup data is intact — this is a boot-test timing issue." | "CRITICAL FAILURE! Your backups are broken!" |
| **Precise** | Name the exact writer, port, error code, agent, recovery point. Use mono for IDs. | "VSS writer `SqlServerWriter` is in a failed state on `SRV-SQL01`." | "Something went wrong with the snapshot." |
| **Expert** | Explain mechanism, not just symptom. Show you know *why*. | "Inverse Chain keeps each point bootable, so an older point is still safe to restore from." | Vague reassurance with no mechanism. |
| **Evidence-first** | Every claim links to the signal that proves it. Show the log line, the count, the timestamp. | "Last 3 backups fell back to crash-consistent (DBD) — see export error at 02:14." | Conclusions with no shown evidence. |
| **Actionable** | End every explanation with the next click. Don't describe a problem you won't help fix. | "Recommended: Restart VSS writers, then retry backup." | A wall of diagnosis and no button. |

### 1.2 The "never cry wolf" rule

This is the single most important content rule in the product. Datto's own boot tests are notorious for cosmetic failures (timing, drivers, pending updates) that *look* catastrophic but mean nothing for recoverability. If we paint every yellow as a fire, techs stop trusting the console — exactly the trust erosion the [research digest](research/00-failure-catalog-digest.md) documents.

Rules:
1. **Distinguish cosmetic from real, explicitly, in the first sentence.** A cosmetic screenshot failure must read as *low severity* and say "your data is fine" before anything else.
2. **Never use `Failed`/red for a state where data is recoverable.** Cosmetic boot-test issues are `Warning` (amber) at most, often a neutral "Needs review" badge — see [§5](#5-statusseverity-language).
3. **Show recoverability up front.** When a real recovery point still exists, say so: "Last verified-good recovery point: 6 h ago."
4. **Quantify, don't qualify.** "Stuck at 99% for 47 min" beats "taking a long time."
5. **Suppress noise during known incidents.** During a pod/platform incident, copy must say "this is a known Datto incident, not your config" and offer to silence per-asset alerts.

### 1.3 Mechanics

- **Person & tense:** Second person, present tense, active voice. "We" only for actions the system performs ("We'll retry the backup after reboot."). Address the *machine/agent* by name, the *tech* by implication.
- **Sentence length:** Short. One idea per sentence. Diagnosis sentence → mechanism sentence → recommendation sentence.
- **Capitalization:** Sentence case everywhere — buttons, headings, toasts. Product/feature names keep their proper case (Inverse Chain, ShadowSnap, Cloud Deletion Defense, ZFS). **No per-section uppercase eyebrows** (impeccable ban).
- **Numbers & units:** Numerals always (`3 agents`, `47 min`, `512 GB`). Space before unit. Sizes/durations/IPs/error codes in **mono** (`--font-mono`).
- **Error codes:** Always mono, always paired with a plain-language gloss the first time: `0x0000007B` (Inaccessible Boot Device).
- **No jargon without a gloss.** First use of an acronym expands it: "bare metal restore (BMR)", "change block tracking (CBT)". Subsequent uses may abbreviate.
- **No marketing.** No "seamless", "powerful", "effortless", "world-class". No exclamation marks except in genuine success toasts (sparingly).
- **No blame.** Never "you forgot to". Prefer "this agent hasn't rebooted since the last Windows update."
- **i18n-ready:** No string concatenation in code; all copy is parameterized templates (see [§7](#7-content-templates)). Pluralization handled by template, not `+ "s"`.

### 1.4 Terminology lexicon (use these, not synonyms)

| Use | Not |
|---|---|
| recovery point | restore point (except where Datto UI literally says "restore point"), snapshot copy |
| backup chain | backup history |
| protected machine / agent | endpoint (except DEB context), client machine |
| appliance | device, box (SIRIS/ALTO only) |
| off-site sync | cloud replication (use "off-site sync" in UI; "replication" only in technical explanations) |
| screenshot verification | boot test (gloss it once: "screenshot verification (automated boot test)") |
| cosmetic | false positive (reserve "false positive" for ransomware detection) |
| seat | license (M365/Google/SaaS context); "license" is the entitlement, "seat" is the protected user |
| tenant / organization | customer (use "client" only in MSP-facing rollups) |
| Datto Cloud | the cloud |

---

## 2. Content surfaces — what rich content appears, and where

The same content *types* recur across all six products; the data behind them differs. Components render these surfaces; this section defines the surface, [§7](#7-content-templates) defines its schema.

| Surface | Where it appears | What it contains | Component |
|---|---|---|---|
| **Status line** | Tables, asset header | dot + icon + label + age ("Failed · 4 h ago") | `StatusBadge` |
| **Failure headline** | Asset detail, triage queue row | One-sentence plain-language summary of the failure | `FailureHeadline` |
| **"Why did this fail?" panel** | Asset detail, expandable | Cause, mechanism explanation, evidence list, recoverability statement, severity classification | `WhyPanel` |
| **What-to-check list** | Inside Why panel / KB card | Ordered checklist of things a tech should verify, each with a one-click diagnostic | `CheckList` |
| **Remediation runbook** | Suggested-fix card, playbook view | Ordered steps, each = a typed action with label, what-it-does, dry-run, gate | `Runbook` |
| **Suggested-fix card** | Inline at point of pain | Fix name, what changes, blast radius, confidence, recoverability, action buttons | `SuggestedFix` |
| **KB-style guidance** | Side panel, "Learn more" | Short explainer of the subsystem (ZFS, Inverse Chain, OAuth consent) | `KbCard` |
| **Evidence row** | Inside Why panel | timestamp + signal + value (log line, port probe, writer state) | `EvidenceRow` |
| **Empty / loading / error states** | Any data surface | see [§6](#6-empty-loading-error--zero-result-states) | `EmptyState`, `Skeleton`, `ErrorState` |

### 2.1 Per-product content focus

Each product surfaces the same *types* of content, but the **substance** is product-specific. Below: for each product, the failure-explanation themes, the runbook style, and the what-to-check emphasis. All grounded in the [research digest](research/00-failure-catalog-digest.md).

#### 2.1.1 Datto BCDR (SIRIS / ALTO)

- **Failure explanation themes:** storage/ZFS pressure ("pool 94% full"), VSS/ShadowSnap snapshot state, **cosmetic vs real boot-test** (the flagship "don't cry wolf" surface), agent pairing/cert (port `25568`/`3260`/`3262`, 401), off-site sync backlog, diff-merge/chain rebuild, encrypted-agent re-seal after reboot.
- **Runbook style:** Diagnostic-heavy. Most BCDR runbooks open with a *non-mutating probe* (query VSS writers, probe ports, show pool consumers) before any mutating step. Heavy use of "classify cosmetic vs real" as an explicit step.
- **What-to-check emphasis:** Is there a verified-good recovery point? Is the appliance pool trending toward full? Did Windows just update (driver pending reboot)? Is off-site sync the real bottleneck behind retention?
- **Signature KB cards:** "How Inverse Chain keeps every point bootable", "What ZFS pool capacity actually means", "Why screenshot tests fail cosmetically".

#### 2.1.2 Datto Endpoint Backup v1 (DEB v1)

- **Failure explanation themes:** backup **stuck at 99%** (hash-cache reupload), VSS writer failure, agent service stopped/offline, metered-connection pause, slow cloud seeding, the known **agent bugs** (NTFS corruption on diff-merge-as-first-backup, throttle-zero deadlock, destructive uninstaller) — these get explicit version-gating language.
- **Runbook style:** Reinstall-and-reupload heavy ("clean reinstall with `CLEAN_INSTALL=1`"), with strong **version-gate warnings** ("Do not uninstall below v3.0.25.0 — the uninstaller deletes the entire Datto directory"). RMM-driven reboot steps.
- **What-to-check emphasis:** Agent version vs known-bad list. Is the connection marked metered? Is throttle set to `0`? Did the post-install reboot happen?
- **Signature KB cards:** "Why backups stick at 99% (hash cache validation)", "DEB v1 → v2 migration: what to expect".

#### 2.1.3 Datto Endpoint Backup v2 (UniView)

- **Failure explanation themes:** "VSS failed to prepare snapshots", **AV/EDR blocking the `cbtfilter` driver** (forces slow diff-merges), "Agent not checking in" (port `443` / `mothership.dtc.datto.com` / DNS), generic "unable to back up agent" (needs log auto-classification), **unsupported-config silent breakage** (no volume expansion after first full, NTFS/APFS only, single active partition), v1→v2 **dual-portal** migration + v1 retention sunset, consumption/storage-pool billing.
- **Runbook style:** Auto-classify-first (a generic alert must run a log-classification diagnostic before showing a fix), AV-exclusion + RMM-reboot pattern, supportability/config scan as a recurring step.
- **What-to-check emphasis:** Does EDR have the `cbtfilter` exclusion? Was a volume expanded after the first full? Is the asset still v1-only (sunset countdown)? Is the storage pool near entitlement?
- **Signature KB cards:** "Why your EDR is making every backup slow (cbtfilter)", "v2 supportability limits that silently break backups", "Your v1 backups sunset in N days".

#### 2.1.4 Datto Cloud Continuity / DR

- **Failure explanation themes:** off-site replication backlog (→ RoundTrip seed), cloud-virtualization/screenshot **BSOD `0x0000007B`** (storage-controller driver), screenshot false-failures, **IPsec/networking** (Phase 1/2 mismatch, FIPS cipher removal, reserved-subnet/RFC1918 conflicts, 1-public-IP limit), virtualized-DC trust-relationship failure, 1-Click DR replay gaps (boot order, passphrases, VPN, IP overlap), Cloud Deletion Defense window, retention expiry of a needed point.
- **Runbook style:** DR-readiness oriented. Many runbooks are **pre-flight checks** ("Run pre-DR readiness check") rather than fixes. Networking runbooks generate config snippets and validate tunnels. Several steps are honestly "Open pre-filled Support request" (CDD recovery, resource increase beyond 8 vCPU/16 GB, failback scoping) — copy must be candid that this needs Datto.
- **What-to-check emphasis:** Is there a fresh point in the cloud, or did sync stall? Is the boot failure a controller-driver issue (cycle SATA/SCSI/IDE)? Will the DC authenticate on failover? Is the CDD window still open?
- **Signature KB cards:** "What `0x7B` means on a cloud boot and how to fix it", "Cloud Deletion Defense: your recycle-bin window", "Why your IPsec tunnel won't come up".

#### 2.1.5 Datto SaaS Protect (M365 + Google Workspace)

- **Failure explanation themes:** **Microsoft Graph/SharePoint/Teams throttling** (429/503 loops), the **EWS→Graph reauthorization** deadline (Global Admin consent or Exchange backups stop), seats mass-archived by AADSTS errors (decode the code), archived-but-billed seats, uninitialized mailbox (`ErrorAccessDenied`), OneDrive not provisioned, PST-export limitations, large-zip extraction failures (path too long / `0x80010135`), pod-level degradation.
- **Runbook style:** Consent/authorization-heavy ("Launch Global Admin consent flow"), scope-reduction and reschedule for throttling, AADSTS-decode → remediation-card pattern, "send the user a 'log in once' email" for uninitialized mailboxes.
- **What-to-check emphasis:** Is the tenant authorized (and before the deadline)? Is this a Microsoft throttle (their fault) or our config? Is Auto-Add on? Are archived seats still billing?
- **Signature KB cards:** "The EWS→Graph deadline and what happens if you miss it", "Reading an AADSTS error code", "Why SharePoint backups stall (Microsoft throttling)".

#### 2.1.6 Spanning (Salesforce + M365 + Google Workspace)

- **Failure explanation themes:** **opaque "errors that never stop"** (must classify self-healing *Temporary Errors* vs action-required *Attention Needed*), OAuth re-authorization (new permissions, token revoked after password change), **Salesforce restore blockers** (storage limit reached, inactive owner, duplicate rule, insufficient access rights, Request Entity Too Large, >5-level lookups), Salesforce **API-cap** stalling initial backup (default 15%), seat/license sync lag (24h), purge-after-unassign countdown (30d Google / 60d M365), Salesforce "appears stalled" (still running), the support-driven **re-index**.
- **Runbook style:** Error-triage-first (collapse transient noise, surface only Attention-Needed with one-click fix each), Salesforce-side guided fixes (temporarily disable duplicate rules → restore → auto re-enable; reassign inactive owners), license-grace-window warnings with countdowns.
- **What-to-check emphasis:** Is this error transient (self-healing) or action-required? Is the Salesforce API cap too low for the org? Is a license about to purge data? Is the "stall" actually normal long-run?
- **Signature KB cards:** "Temporary Errors vs Attention Needed", "Salesforce restore blockers and how to clear them", "Your data purges in N days (license unassigned)".

---

## 3. Remediation action microcopy

Every action in the [automation engine](07-troubleshooting-and-automation-engine.md) carries a consistent copy set. This is the most reused content in the product; get it right once.

### 3.1 Button labels

Rules:
- **Verb + object.** "Restart VSS writers", "Resume off-site sync", "Force backup now". Never bare verbs ("Run", "Fix").
- **Honest about side effects.** Mutating action labels name what changes. Diagnostic labels start with a probe verb (Show, Query, Probe, Check, Detect, Forecast).
- **Destructive/irreversible actions** are explicit and never the default styling: "Delete orphaned datasets", "Unseat archived seats", "Take new full backup (re-seeds chain)".
- **"Open Support request" is honest**, not disguised as a self-serve fix. Label it so the tech knows it leaves the self-serve loop: "Open pre-filled Datto Support request".
- Max ~3 words where possible; never a sentence. Sentence case.

| Category | Label pattern | Examples |
|---|---|---|
| Diagnostic (read-only) | `Show/Query/Probe/Check {target}` | Query VSS writer status · Probe ports 25568/3260/3262 · Show top storage consumers · Forecast days until full |
| Remediation (mutating) | `{Verb} {object}` | Restart VSS writers · Resume off-site sync · Force differential merge · Repair agent communications |
| Remediation (with reboot) | `{Verb} + reboot` | Schedule reboot + retry backup |
| Authorization | `Launch {consent}` | Launch Global Admin consent · Reconnect Google account |
| Destructive | plain, side-effect named | Delete orphaned datasets · Take new full backup (re-seeds) |
| Escalation | `Open … Support request` | Open pre-filled Datto Support request · Escalate Code 9999 |
| Scope verbs (on the card) | — | Dry-run · Apply once · Apply to all matching · Apply always · Save as playbook |

### 3.2 Confirm dialogs

Shown only for **mutating, high-blast-radius, or irreversible** actions (low-risk single-device reversible actions skip the dialog — over-confirming breeds reflexive clicking, per the [automation research](research/02-automation-ux-research.md)). The dialog answers four questions in this order:

```
┌─ Confirm: Force differential merge ──────────────────────────┐
│                                                              │
│  What this does                                              │
│  Rebuilds the backup chain for SRV-SQL01 by merging the      │
│  differential into a new consolidated point.                 │
│                                                              │
│  Scope          1 agent · SRV-SQL01 · this appliance         │
│  Impact         Storage-intensive; may run 40–90 min.        │
│                 Backups for this agent pause until complete. │
│  Reversible?    No — but no recovery points are deleted.     │
│  Last good      Verified-good point 6 h ago is unaffected.   │
│                                                              │
│  [ Cancel ]                      [ Run dry-run ] [ Apply ]   │
└──────────────────────────────────────────────────────────────┘
```

Copy rules for confirms:
- **Title** = the exact button label, prefixed "Confirm:".
- **What this does** = one sentence, plain language, the mechanism.
- **Scope** = resolved count + named asset(s) + tenant. Always show the affected-count ("3 agents across 2 clients").
- **Impact** = duration estimate, what pauses, resource cost.
- **Reversible?** = Yes (with the inverse named) / No (with reassurance about what's *not* lost).
- For **scope = all matching / always**, the dialog must restate the dynamic nature: "This will also apply to agents that match in future."
- Two paths out plus Cancel: offer **Run dry-run** alongside **Apply** wherever a dry-run exists.

### 3.3 Dry-run previews

A dry-run is **side-effect-free** and the default for anything mutating (per the [automation research](research/02-automation-ux-research.md)). The preview renders what *would* happen.

```
Dry-run · Restart VSS writers on SRV-SQL01
─────────────────────────────────────────────
Would run (no changes made):
  1. vssadmin list writers              → reads writer state
  2. net stop VSS                        → would stop service
  3. net start VSS                       → would restart service
  4. Re-stabilize SqlServerWriter        → would clear FAILED state

Predicted result
  SqlServerWriter: FAILED → STABLE
  Next backup mode: crash-consistent (DBD) → application-consistent

Affected: 1 agent · no recovery points touched · ~30 sec
This was a dry-run. Nothing changed.            [ Apply for real ]
```

Copy rules:
- Header always reads `Dry-run · {action} on {target}`.
- "Would run (no changes made)" precedes the step list; each step shows the literal command/API call and what it reads/would change.
- A **predicted diff**: `from → to` for each value the action would change. Use the arrow `→`.
- Footer always closes the loop: **"This was a dry-run. Nothing changed."** plus an **Apply for real** affordance.
- If a precondition/detection determined the action is unnecessary: "Dry-run found nothing to fix — VSS writers are already stable. No action recommended."

### 3.4 Toasts (Sonner)

Toasts are terse, factual, and carry a follow-through affordance. Four variants map to status tokens.

| Variant | Token | Use | Template |
|---|---|---|---|
| Success | success | action applied, change confirmed | `{Action} done — {result}.` |
| Info / queued | primary | action queued or running | `{Action} started on {target}. We'll update you when it finishes.` |
| Warning | warning | applied but partial / caveat | `{Action} applied to {n} of {m} {unit}. {n2} need attention.` |
| Error | failed | action failed | `{Action} failed: {reason}. {next step}.` |

Examples:
- **Success:** `VSS writers restarted — SqlServerWriter is stable. Next backup will be application-consistent.` · Action: `Retry backup now`.
- **Info:** `Force backup started on SRV-SQL01. We'll notify you when it completes (~12 min).` · Action: `View progress`.
- **Warning:** `Resumed off-site sync for 8 of 9 agents. SRV-DC01 is still paused (encrypted, needs passphrase).` · Action: `Unseal SRV-DC01`.
- **Error:** `Repair agent communications failed: port 3262 unreachable from appliance. Check the firewall, then retry.` · Action: `Probe ports` / `Open Support request`.

Rules:
- Always name the **target**. Never "Action completed."
- Success toasts state the *result*, not just completion ("— SqlServerWriter is stable").
- Error toasts state the *reason* and the *next step*. Never a bare "Something went wrong."
- Toasts for long-running jobs are **info/queued**, not success — success fires on completion via the run history.
- Every toast offers exactly one primary follow-through action where one exists.
- Bulk actions report `n of m` and link to the failures.

### 3.5 Approval request cards

When an action is gated (scope = all/always, or blast radius over threshold), the run pauses and an approval card is pushed (Slack/Teams/in-app). Per the [automation research](research/02-automation-ux-research.md), the approver must see **full context before deciding** — evidence, blast radius, the diff, confidence, and the rollback plan, on one screen.

```
┌─ Approval needed: Apply retention change to 14 agents ────────┐
│  Requested by  jdoe@msp.com · 22 Jun 2026, 02:41             │
│  Playbook      "Reclaim pool space" · scope: all matching     │
│                                                              │
│  Why            Appliance pool is 94% full; backups will       │
│                 start skipping within ~2 days.                 │
│  Will change    Retention 90 → 45 days on 14 heaviest agents  │
│  Blast radius   14 agents · 1 client (Acme Corp) · 1 appliance│
│  Evidence       pool 94% (3.7 TB / 3.9 TB); top consumer       │
│                 SRV-FILE01 at 612 GB — view details            │
│  Reversible?    Yes — restores prior retention per agent      │
│  Confidence     High (deterministic capacity math)            │
│                                                              │
│  [ Reject ]            [ Escalate ]            [ Approve ]    │
│  Auto-escalates to senior tech in 30 min if no response.     │
└──────────────────────────────────────────────────────────────┘
```

Copy rules:
- **Title** = the action + resolved scope count.
- Required fields, in order: requester+time, playbook+scope, **Why** (the triggering evidence), **Will change** (the diff), **Blast radius** (assets/clients/appliances), **Evidence** (linked), **Reversible?** (+ inverse), **Confidence**.
- Three decisions, never two: **Approve / Reject / Escalate** (per research — binary breeds rubber-stamping).
- A **timeout line** at the bottom: "Auto-escalates … in {N} {unit} if no response."
- The rollback/reversibility line is mandatory — approvers must see the exit before saying yes.

### 3.6 Run-result language (history)

Outcomes use exactly three words, consistently, across every action and the [audit log](07-troubleshooting-and-automation-engine.md):

| Outcome | Meaning | Phrasing |
|---|---|---|
| **Changed** | action mutated state | "Restarted VSS writers — SqlServerWriter now stable." |
| **No change needed** | precondition found nothing to do | "VSS writers already stable. No action taken." |
| **Failed** | action could not complete | "Could not reach port 3262. Repair aborted." |

---

## 4. Status & severity language

Status is **never color-only** (design-system law): always dot + icon + label. The *label words* are fixed; the *explanation* varies. This is where the "never cry wolf" rule is operationalized in copy.

### 4.1 Canonical status labels

| State | Token | Label | Icon meaning | When |
|---|---|---|---|---|
| Protected | success | `Protected` | check | last backup good, verified |
| Warning | warning | `Warning` | triangle | degraded but recoverable; cosmetic boot-test; nearing a limit |
| Failed | failed | `Failed` | x-octagon | real data risk: no recent point, chain broken, backups skipped |
| Paused | paused | `Paused` | pause | intentionally or system-paused (sync, metered, sealed) |
| Syncing | primary | `Syncing` | spinner | off-site sync / backup in progress |
| Offline | offline | `Offline` | unplug | agent/appliance not checking in |
| Needs review | warning | `Needs review` | eye | ambiguous: requires a human to classify cosmetic vs real |

Severity sort (worst-first), used in every queue and fleet rollup: **Failed > Warning > Offline > Syncing > Paused > Protected**. Fleet rollup shows the **worst real child state** — but a fleet whose only red is a *cosmetic* screenshot issue must roll up as **Warning**, not Failed (see §4.3).

### 4.2 Cosmetic-warning vs real-failure phrasing

This table is the heart of the doc. The same underlying event can be cosmetic or real; copy must classify it and lead with recoverability.

| Event | If COSMETIC (token: warning / "Needs review") | If REAL (token: failed) |
|---|---|---|
| Screenshot verification failed | "Boot test couldn't capture a clean screenshot — your backup data is intact. Likely a timing/driver issue (`Getting Devices Ready`, pending updates). Last verified-good point: {age}." | "Boot test failed with `0x0000007B` (Inaccessible Boot Device) — this point may not be restorable. The storage-controller driver is missing. Older points are still bootable (Inverse Chain)." |
| VSS snapshot issue | "Backup completed crash-consistent (DBD) instead of application-consistent. Data is captured; app-level consistency (e.g. SQL) isn't guaranteed for this point." | "VSS failed and the backup did not complete. No recovery point was created in this run. Last good point: {age}." |
| Ransomware detection | "Ransomware detection flagged unusual change — likely a false positive from {app}. Backups are unaffected. Review and dismiss if expected." | "Ransomware detection flagged {agent}. Change rate spiked {x}× with screenshot anomalies. Investigate before trusting recent points." |
| Backup "stalled" | "Backup is at {n}% and still moving (+{rate}/min) — this is a normal long initial seed, not a stall." | "Backup has been at 99% with zero throughput for {n} min — it's stuck (hash-cache reupload). A clean reinstall is recommended." |
| Off-site sync behind | "Off-site sync is {n} points behind but catching up (ETA {time}). Local backups are current." | "Off-site sync stalled {age} ago and is blocking nightly retention — cloud DR points are now stale by {age}." |

Phrasing discipline:
- **Cosmetic copy always opens with reassurance** ("your backup data is intact") and **always cites the last verified-good point**.
- **Real-failure copy states the data consequence** ("no recovery point was created") and, when true, the consoling fact ("older points are still bootable").
- When the system **can't yet tell**, use `Needs review` and offer the disambiguating diagnostic: "We can't tell if this is cosmetic. Run local virtualization to confirm the machine actually boots."

### 4.3 Rollup & noise copy

- **Cosmetic-only fleet:** "12 agents protected · 1 cosmetic boot-test warning. No data at risk." (rolls up Warning, not Failed.)
- **Known incident:** "This is a known Datto incident (pod {x}), not your configuration. {N} tenants affected. We've suppressed per-asset alerts." with `Snooze alerts until incident clears`.
- **Stale-but-protected:** Never call a paused-by-design agent "Failed". "Paused — encrypted dataset re-sealed after appliance reboot. Backups resume after you re-enter the passphrase."

---

## 5. Microcopy patterns (small, high-frequency strings)

| Context | Pattern | Examples |
|---|---|---|
| Age / freshness | `{relative time} ago`, absolute on hover | "4 h ago" (hover: "22 Jun 2026, 02:14 EDT") |
| Counts | numeral + unit, pluralized by template | "3 agents", "1 seat", "0 failures" |
| Recoverability stamp | `Last verified-good: {age}` | "Last verified-good recovery point: 6 h ago" |
| Confidence | High / Medium / Low + one-word reason | "High (deterministic)" · "Medium (heuristic)" |
| Blast radius | `{n} {asset} · {m} client(s) · {k} appliance(s)` | "14 agents · 1 client · 1 appliance" |
| ETA | `~{duration}` or `ETA {time}` | "~12 min" · "ETA 03:40" |
| Tooltips | answer "what is this?" in ≤12 words | "Crash-consistent: captured without app coordination; SQL/Exchange may need replay." |
| Field help | imperative, one line | "Raise to the recommended 25% so the initial backup can finish." |
| Disabled-action reason | always explain *why* disabled | "Apply always is unavailable — this action isn't reversible." |
| Deadline / countdown | urgency without panic | "Reauthorize before 30 May 2026 — {N} days left. After that, Exchange backups stop." |

---

## 6. Empty, loading, error & zero-result states

States must **teach the interface**, not just say "nothing here." Every empty state names *why* it's empty and *what to do next*. No decorative illustrations beyond a single small line icon (no glassmorphism, no hero graphics — impeccable bans).

### 6.1 Empty states (teach the interface)

| Surface | When | Copy | Primary action |
|---|---|---|---|
| Triage queue | no open failures | "All clear. No failures across {n} agents and {m} tenants. We'll surface anything that needs you here." | (none — link "View all assets") |
| Action cart | nothing staged | "Your action cart is empty. Stage fixes from any asset, then review and apply them together." | "Browse assets" |
| Playbooks | none saved | "No playbooks yet. Turn a fix you repeat into a reusable playbook — run it once, save the chain, scope it later." | "Create from a recent fix" |
| Run history | never ran | "No runs yet. Once you apply a fix or dry-run, every step shows up here with its inputs, outputs, and outcome." | (none) |
| Approvals | none pending | "No approvals waiting. Gated actions (broad scope or high blast radius) will appear here for sign-off." | (none) |
| A new tenant | onboarded, no data yet | "We're discovering seats for {tenant}. First backup status appears within ~{time}." | "Check authorization" |
| Saved views | none | "Save a filtered view (e.g. 'Failed BCDR agents at Acme') to jump back to it from the sidebar." | "Save current view" |

Empty-state copy rules: one calm sentence of *why empty* + one sentence of *what this surface is for*. Never "No data." or "Nothing to show."

### 6.2 Loading / skeleton guidance

- **Use skeletons, not spinners,** for any surface with known structure (tables, asset header, cards). The skeleton mirrors the real layout (same column count, same card shape) so the page doesn't reflow.
- **Tables:** sticky header renders immediately; 8–10 skeleton rows with shimmer; the "last 10 backups" dot-strip skeletons as 10 muted dots.
- **Spinners only** for indeterminate inline actions (button working state) and the `Syncing` status itself.
- **Progressive copy for genuinely slow loads** (>~3 s): replace nothing visually, but if a fetch exceeds a threshold show a quiet line: "Still loading {n} agents…". Never a fake progress bar.
- **Action-in-flight button state:** label changes to present continuous + spinner: "Restarting VSS writers…" (disabled). On settle, toast fires and label reverts.
- **Skeleton never shows fake numbers** — only neutral shimmer blocks, so a tech never misreads a placeholder as data.

### 6.3 Error states

Distinguish three error origins; copy differs:

| Origin | Example | Copy pattern | Actions |
|---|---|---|---|
| **Our mock/app error** | data failed to load | "Couldn't load {thing}. This is a display issue — your backups aren't affected." | "Retry" |
| **Action failure** | remediation failed | see toast §3.4 + inline: reason + next step | "Retry" / "Open Support request" |
| **Upstream/known incident** | pod/platform down | "Datto reports an incident affecting {scope}. This isn't your configuration." + link to status | "Snooze alerts" / "View incident" |

Error-state rules:
- **Never blame the tech.** Never "invalid input" without saying what valid looks like.
- **Always separate display failure from data risk.** A failed *fetch* must reassure that *backups* are fine.
- **Always offer a way forward** — Retry, an alternative path, or honest escalation.
- **Reason then remedy.** "Port `3262` unreachable" (reason) → "Check the firewall, then retry" (remedy).

### 6.4 Zero-result (filtered) states

Different from empty — the data exists but the filter excluded it.

- "No assets match these filters. {summary of active filters}." with a one-click **Clear filters**.
- Suggest a relaxation when obvious: "No Failed BCDR agents at Acme. There are 3 Warnings — show those?"
- Never the same copy as a true empty state; the user's mental model is "I filtered too hard," not "there's nothing."

---

## 7. Content templates (what components consume)

So mock content stays consistent, components render from typed content objects, not free strings. These are TypeScript-ish sketches; the canonical types live with the [data model](06-data-model-and-mock-data.md). Every string field is a template key (i18n-ready), not a baked sentence.

### 7.1 Failure explanation

```ts
type Recoverability = 'recoverable' | 'at-risk' | 'lost' | 'unknown';
type FailureClass   = 'cosmetic' | 'real' | 'needs-review';

interface FailureExplanation {
  failureModeId: string;        // FK → failure catalog (02-failure-catalog.md)
  product: ProductId;           // bcdr | deb-v1 | deb-v2 | datto-cloud | saas-protect | spanning
  headline: string;             // one-sentence plain-language summary
  classification: FailureClass; // drives cosmetic-vs-real copy & token (§4.2)
  severity: 'low' | 'medium' | 'high' | 'critical';
  mechanism: string;            // the "why": how the subsystem actually broke
  recoverability: Recoverability;
  lastVerifiedGood?: ISODate;   // ALWAYS populated when a good point exists
  evidence: Evidence[];         // shown in the Why panel
  whatToCheck: CheckItem[];     // ordered diagnostics
  suggestedFix?: SuggestedFixRef;
  kbCardId?: string;            // optional "learn more"
}

interface Evidence {
  at: ISODate;
  signal: string;               // "VSS writer SqlServerWriter"
  value: string;                // "FAILED" — mono-rendered if code/ID/size
  kind: 'log' | 'probe' | 'metric' | 'state';
}

interface CheckItem {
  label: string;                // "Is there a verified-good recovery point?"
  diagnosticActionId?: string;  // one-click probe
  answer?: 'pass' | 'fail' | 'unknown';
}
```

### 7.2 Remediation action (copy fields)

Mechanics in the [automation engine](07-troubleshooting-and-automation-engine.md); the **copy** an action must carry:

```ts
interface ActionCopy {
  id: string;
  label: string;                 // §3.1 — verb + object
  kind: 'diagnostic' | 'remediation' | 'authorize' | 'escalate' | 'control';
  mutating: boolean;
  reversible: boolean;
  inverseLabel?: string;         // "Restore prior retention"
  whatItDoes: string;            // one sentence for confirm/dry-run
  impact?: string;               // duration, what pauses, resource cost
  confirmRequired: boolean;      // §3.2 — only mutating/high-blast/irreversible
  dryRunSupported: boolean;
  toasts: {
    queued: string;              // §3.4 templates with {target}
    success: string;
    failure: string;
  };
  confidence?: 'high' | 'medium' | 'low';
  confidenceReason?: string;
}
```

### 7.3 Suggested-fix card

```ts
interface SuggestedFix {
  forFailureModeId: string;
  title: string;                 // "Restart VSS writers"
  willChange: string;            // human diff: "FAILED → STABLE; next backup app-consistent"
  blastRadius: { assets: number; clients: number; appliances?: number };
  confidence: 'high' | 'medium' | 'low';
  recoverabilityNote?: string;   // "No recovery points are touched."
  runbookId: string;             // the chain it runs
  offers: ('dry-run' | 'apply-once' | 'apply-matching' | 'apply-always' | 'save-playbook')[];
}
```

### 7.4 State copy (empty/error/zero) registry

```ts
interface StateCopy {
  surface: string;               // 'triage-queue' | 'action-cart' | ...
  variant: 'empty' | 'zero-result' | 'error-app' | 'error-action' | 'error-incident' | 'loading';
  title?: string;
  body: string;                  // calm reason + what-this-is-for
  primaryAction?: { label: string; href?: string; actionId?: string };
  reassurance?: string;          // "Your backups aren't affected."
}
```

### 7.5 Status copy resolver

```ts
// Resolves the variable explanation; labels themselves are fixed (§4.1).
function statusExplanation(s: StatusState, ctx: AssetContext): string;
// e.g. Paused + sealed-encrypted → "Paused — encrypted dataset re-sealed after reboot…"
```

These five templates cover every content surface in [§2](#2-content-surfaces--what-rich-content-appears-and-where). The mock-data plan ([06](06-data-model-and-mock-data.md)) seeds instances of them deterministically per failure mode so the demo is reproducible.

---

## 8. Worked examples — 6 representative failures

Each example shows the full content stack a tech sees: status → headline → why-panel (mechanism + evidence + recoverability) → what-to-check → suggested fix → action microcopy. Drawn from the [failure catalog](02-failure-catalog.md) / [research digest](research/00-failure-catalog-digest.md).

### 8.1 BCDR — cosmetic screenshot failure (the flagship "don't cry wolf")

- **Status:** `Needs review` (warning token) — *not* Failed.
- **Headline:** "Boot test couldn't capture a clean screenshot on `SRV-APP02` — your backup data is intact."
- **Why panel — mechanism:** "Screenshot verification spins up the recovery point and photographs the login screen. It timed out on `Getting Devices Ready` — Windows was still applying pending updates inside the test VM. This is a timing issue, not a boot failure."
- **Recoverability:** `recoverable` · "Last verified-good recovery point: 5 h ago."
- **Evidence:** `02:14 · screenshot state · "Getting Devices Ready" (timeout 120s)` · `02:14 · source · 3 pending Windows updates`.
- **What to check:** Does the machine actually boot? (→ Launch local virtualization) · Are there pending updates on the source? (→ Show pending updates) · Has the wait time ever been enough? (→ Show screenshot history).
- **Suggested fix:** "Increase additional wait time +5 min and re-run" · confidence **High** · "No recovery points are touched."
- **Microcopy:**
  - Button: `Increase wait time +5 min` · `Re-run screenshot` · `Launch local virtualization to confirm boot`.
  - Toast (success): "Screenshot re-run queued for `SRV-APP02` with +5 min wait. We'll update the result here."
  - Classification action: `Classify as cosmetic` → moves it to Warning and records the reason in [audit](07-troubleshooting-and-automation-engine.md).

### 8.2 BCDR — ZFS pool nearly full (real, high severity)

- **Status:** `Warning` trending `Failed` — "Pool 94% full".
- **Headline:** "Appliance `SIRIS-ATL-01` pool is 94% full — backups will start skipping within ~2 days."
- **Mechanism:** "New recovery points need free ZFS space. At the current 18 GB/day change rate and 90-day retention, free space runs out in ~2 days. Off-site sync is current, so this is local retention pressure, not a sync backlog."
- **Recoverability:** `recoverable` (no data lost yet) · "All agents currently protected."
- **Evidence:** `pool 3.7 TB / 3.9 TB (94%)` · `top consumer SRV-FILE01 612 GB` · `forecast: full in ~2 days`.
- **What to check:** Which agents are heaviest? (→ Show top consumers) · Is retention looser than the RPO needs? (→ Compare retention vs RPO) · Are there orphaned datasets? (→ List orphaned/archived).
- **Suggested fix:** "Apply suggested retention (90 → 45 days) to the 14 heaviest agents" · **reversible** · blast radius "14 agents · 1 client" → **gated by approval** (broad scope). See the approval card in [§3.5](#35-approval-request-cards).
- **Microcopy:**
  - Buttons: `Run force retention now` · `Apply suggested retention` · `Delete orphaned datasets` (destructive styling) · `Forecast days until full`.
  - Confirm (force retention): scope = appliance; impact "Frees ~280 GB; deletes points older than the new retention"; reversible **No** — "Deleted points cannot be recovered."

### 8.3 DEB v2 — AV/EDR blocking the cbtfilter driver (slow diff-merges)

- **Status:** `Warning` — "Every backup running slow (diff-merge)".
- **Headline:** "Your EDR is blocking the `cbtfilter` change-tracking driver on `WS-FINANCE-07` — every backup is running as a slow full-scan diff-merge."
- **Mechanism:** "Change Block Tracking (CBT) lets the agent copy only changed blocks. The `cbtfilter` driver is blocked by your endpoint security product, so the agent falls back to scanning the whole disk every run. Backups still succeed — they're just slow and heavy."
- **Recoverability:** `recoverable` · "Backups are completing; last point 1 h ago."
- **Evidence:** `cbtfilter driver state: blocked` · `last 5 backups: diff-merge mode` · `EDR: <vendor> — no Datto exclusion found`.
- **What to check:** Is the `cbtfilter` exclusion in the EDR policy? (→ Check exclusions) · Is the agent actually stuck in diff-merge? (→ Check backup mode) · Did the machine reboot after the last policy change?
- **Suggested fix:** "Apply the Datto AV/EDR exclusion set, then reboot via RMM" · confidence **High**.
- **Microcopy:**
  - Buttons: `Apply AV/EDR exclusion set` · `Verify cbtfilter driver` · `Reboot via RMM`.
  - Dry-run: "Would add 4 path/process exclusions to the EDR policy and queue a reboot. No backup is interrupted." (predicted: `cbtfilter: blocked → loaded`).
  - Toast (queued): "Exclusion set applied to `WS-FINANCE-07`. Reboot scheduled — CBT resumes after restart."

### 8.4 Datto Cloud — cloud virtualization BSOD 0x7B (real)

- **Status:** `Failed` (for *this* point) — "Cloud boot failed: `0x0000007B`".
- **Headline:** "Cloud virtualization of `SRV-DB01` bluescreened with `0x0000007B` (Inaccessible Boot Device) — the virtual storage controller doesn't match."
- **Mechanism:** "The recovery point booted into a VM whose virtual disk controller (SCSI) doesn't match what the OS expects (was SATA). Windows can't find the boot disk. The *data* is fine — this is a controller-driver mismatch, and Inverse Chain keeps older points independently bootable."
- **Recoverability:** `at-risk` for this point / `recoverable` overall · "Last successfully virtualized point: 26 h ago."
- **Evidence:** `boot stop code 0x0000007B` · `controller: SCSI (source was SATA)` · `GPO Device Installation Restrictions: present on source`.
- **What to check:** Does another controller boot? (→ Cycle SATA/SCSI/IDE) · Is the chain healthy? (→ Run integrity check) · Is a GPO blocking driver install on the source?
- **Suggested fix:** "Cycle the storage controller (SATA → SCSI → IDE) and retry virtualization" · confidence **High** (well-known fix).
- **Microcopy:**
  - Buttons: `Cycle storage controller & retry` · `Force differential merge` · `Take fresh backup & re-screenshot`.
  - KB link: `What 0x7B means on a cloud boot` ([§2.1.4](#2014-datto-cloud-continuity--dr)).
  - Toast (info): "Retrying cloud virtualization of `SRV-DB01` on the SCSI controller. ~3 min."

### 8.5 SaaS Protect — EWS→Graph reauthorization deadline (critical, time-boxed)

- **Status:** `Warning` with **deadline countdown** (escalates to `Failed` at the deadline).
- **Headline:** "Exchange backups for `Acme Corp` will stop after 30 May 2026 unless a Global Admin reauthorizes — {N} days left."
- **Mechanism:** "Microsoft is retiring EWS; SaaS Protect now backs up Exchange via Microsoft Graph, which needs fresh Global Admin consent. Until the tenant reauthorizes, Exchange backups continue — but the moment the deadline passes, they stop with no recovery."
- **Recoverability:** `recoverable` now / `at-risk` after deadline · "Mail backups current as of 3 h ago."
- **Evidence:** `authorization: EWS (legacy)` · `Graph consent: not granted` · `deadline 30 May 2026` · `tenants in your account still unauthorized: 7`.
- **What to check:** Has a Global Admin consented? (→ Check authorization status) · Is the right admin role available? (→ Validate Global Admin) · Which other tenants are still legacy? (→ Show bulk reauth queue).
- **Suggested fix:** "Launch Global Admin consent for `Acme Corp`" · then "Verify a post-reauth Exchange backup succeeds."
- **Microcopy:**
  - Buttons: `Launch Global Admin consent` · `Re-check authorization` · `Send reauth reminder` · `Open bulk reauth queue`.
  - Countdown microcopy: "Reauthorize before 30 May 2026 — {N} days left. After that, Exchange backups stop." (urgency, not panic.)
  - Toast (success): "Reauthorization complete for `Acme Corp`. We'll confirm the next Exchange backup and clear this warning."

### 8.6 Spanning — Salesforce restore blocked by a duplicate rule (real, fixable Salesforce-side)

- **Status:** `Failed` (restore job) — "Restore blocked: duplicate rule".
- **Headline:** "Restore to `Acme Salesforce` stopped — {n} records were blocked by a Duplicate Management rule ('You're creating a duplicate record')."
- **Mechanism:** "Salesforce's Duplicate Management rejected records that match existing ones. Spanning isn't failing — Salesforce is enforcing a dedupe rule. We can temporarily disable the matching rules, restore, then re-enable them automatically so your dedupe policy stays intact."
- **Recoverability:** `recoverable` · "Backup data is intact; this is a write-side block, not a data-loss issue."
- **Evidence:** `blocked records: 142` · `active rule: "Account Dedupe (Standard)"` · `error class: Attention Needed (action required)` — *not* a self-healing Temporary Error.
- **What to check:** Which rules are matching? (→ List active duplicate rules) · Which records were blocked? (→ Report blocked records) · Will disabling rules affect anything else live? (warn before disable).
- **Suggested fix:** "Temporarily disable matching duplicate rules → restore the {n} blocked records → auto re-enable rules" · **reversible** · confidence **High**.
- **Microcopy:**
  - Buttons: `Temporarily disable duplicate rules` · `Re-run blocked records only` · `Auto re-enable rules after restore`.
  - Confirm: "This disables 1 active duplicate rule on `Acme Salesforce` for the duration of the restore. We re-enable it automatically when the restore finishes. Reversible: **Yes**."
  - Toast (success): "Restored 142 records to `Acme Salesforce`. Duplicate rule 'Account Dedupe' re-enabled."

---

## 9. Content QA checklist (gate before any string ships)

- [ ] Cosmetic events lead with reassurance and a last-verified-good point; never red/Failed.
- [ ] Real failures state the data consequence and any consoling fact (older points bootable).
- [ ] Every failure explanation ends in a recommended action (no diagnosis without a button).
- [ ] No color-only status; label + icon + dot always present.
- [ ] Action labels are verb+object; destructive labels name the side effect.
- [ ] Confirms exist only for mutating/high-blast/irreversible actions; each answers what/scope/impact/reversible.
- [ ] Dry-run previews show literal commands + a `from → to` diff + "Nothing changed."
- [ ] Toasts name the target, the result (success), the reason+next-step (failure).
- [ ] Approval cards carry evidence, blast radius, diff, confidence, reversibility, timeout, and 3 choices.
- [ ] Empty states teach the surface; error states separate display failure from data risk.
- [ ] IDs/IPs/sizes/codes in mono; error codes glossed on first use.
- [ ] No marketing words, no uppercase eyebrows, no blame, sentence case throughout.
- [ ] Every string is a parameterized template (i18n-ready), seeded deterministically per [mock-data plan](06-data-model-and-mock-data.md).

---

*Next: see [feature specs](08-feature-specs.md) for where each surface lives, [page specs](09-page-specs.md) for layout, and the [automation engine](07-troubleshooting-and-automation-engine.md) for action mechanics this copy wraps.*
