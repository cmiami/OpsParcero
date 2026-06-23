# 08 — Feature Specs

Feature-by-feature specifications for every major capability of the Kaseya Resolution Center — what each does, who it serves, where it lives, how it behaves, and how we know it's done.
Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

---

## 0. How to read this doc

This is the **buildable** middle layer between the [information architecture](04-information-architecture.md) (route map, nav, URL state), the [domain model](05-domain-model.md) (entities), the [automation engine](07-troubleshooting-and-automation-engine.md) (the action/chain/scope/policy/approval mechanics), and the [page specs](09-page-specs.md) (wireframe-level layout). Where IA says *where a thing routes* and page specs say *how the screen is laid out*, this doc says *what the feature must do and when it is correct.*

### 0.1 Spec template (every feature follows it)

| Field | Meaning |
|---|---|
| **Purpose** | One sentence: the job this feature does. |
| **Persona / JTBD** | Who needs it and the job-to-be-done (from [personas-and-jobs](01-personas-and-jobs.md): tech, NOC analyst, service manager/lead, junior). |
| **Lives in** | Route(s) + nav location ([IA §4](04-information-architecture.md)). |
| **Primary entities** | The [domain entities](05-domain-model.md) it operates on. |
| **User stories** | "As a … I want … so that …" — the load-bearing ones. |
| **Surfaces & interactions** | UI components, controls, gestures. ASCII wireframes where layout is load-bearing. |
| **States** | empty / loading / error / partial / success — the ones a builder must implement. |
| **Data dependencies** | Mock stores, derived fields, cross-feature reads. |
| **Edge cases** | The cases that break a naive implementation. |
| **Acceptance criteria** | Checklist a reviewer verifies. Each is testable. |

### 0.2 Conventions that apply to every feature

- **Tokens only.** Status renders dot + icon + label using status tokens (`--status-protected`, `--status-warning`, `--status-failed`, `--status-paused`, `--status-syncing`, `--status-offline`); never color-only. Primary actions/selection/focus use `--primary`. App shell uses `--sidebar` (nav shell). Kaseya purple is corporate-accent only. Per the [design system](03-design-system.md) and the **impeccable** skill bans (no nested cards, side-stripe borders, gradient text, decorative glassmorphism, hero-metric template, identical card grids, per-section uppercase eyebrows).
- **State lives in the URL** for anything that defines *what you're looking at* ([IA §6](04-information-architecture.md), nuqs); transient personal UI (cart contents, density, theme) lives in Zustand/localStorage.
- **Severity sort is law:** `Failed > Warning > Offline > Syncing > Paused > Protected`; fleet rollup = worst **real** child state (cosmetic/paused never dominate).
- **No dead-end reds.** Every failure surface offers a one-click path to context, cause, and a fix.
- **Front-end mock.** All "execution" is the simulated runner ([engine §8](07-troubleshooting-and-automation-engine.md)); all state persists to `localStorage`.
- **Every component has a story** (100% Storybook coverage), including each state below.

### 0.3 Feature index

| # | Feature | Route | Engine link |
|---|---|---|---|
| 1 | [Fleet Overview / Health](#1-fleet-overview--health) | `/overview` | rollup reads |
| 2 | [Triage Queue](#2-triage-queue) | `/triage` | suggestion surface |
| 3 | [Asset Detail](#3-asset-detail-timeline--evidence--inline-remediation) | `/assets/[assetId]` | suggested-fix surface |
| 4 | [Remediation Actions](#4-remediation-actions) | global | [§2](07-troubleshooting-and-automation-engine.md) |
| 5 | [Action Chain / Cart](#5-action-chain--cart) | global Sheet | [§3](07-troubleshooting-and-automation-engine.md) |
| 6 | [Scope (once / all / always)](#6-scope--once--all-matching--always) | Execute modal | [§4](07-troubleshooting-and-automation-engine.md) |
| 7 | [Playbook Library](#7-playbook-library) | `/automation` | [§5](07-troubleshooting-and-automation-engine.md) |
| 8 | [Automation Policies (apply-always)](#8-automation-policies-apply-always) | `/automation/policies/[id]` | [§4.2](07-troubleshooting-and-automation-engine.md) |
| 9 | [Approvals](#9-approvals) | notif center | [§6](07-troubleshooting-and-automation-engine.md) |
| 10 | [Run History & Audit](#10-run-history--audit) | `/automation/runs` | [§9](07-troubleshooting-and-automation-engine.md) |
| 11 | [Reports / SLA-RPO](#11-reports--slarpo) | `/reports` | — |
| 12 | [Saved Views & Filtering](#12-saved-views--filtering) | cross-cutting | [IA §7](04-information-architecture.md) |
| 13 | [Global Search & Command Palette](#13-global-search--command-palette) | top bar | — |
| 14 | [Per-product Views](#14-per-product-views) | `/products/[product]` | [IA §8](04-information-architecture.md) |
| 15 | [Notifications](#15-notifications) | top bar | approval/run feeds |
| 16 | [Assets & Protection (workhorse table)](#16-assets--protection-the-workhorse-table) | `/assets` | bulk → cart |

> Feature 16 (the workhorse table) is foundational — features 1, 2, 12, 14 all re-scope it. It is specified last so the cross-cutting features that depend on it read in order.

---

## 1. Fleet Overview / Health

**Purpose.** A lean, read-only fleet health roll-up — the deliberate "command center" you reach when you want posture, not the wall of red. Every segment links into a filtered list.

**Persona / JTBD.** Service manager / lead: *"In one glance, is the fleet healthy, where is it degrading, and what is trending worse — so I can staff and report."* Secondary: NOC analyst starting a shift.

**Lives in.** `/overview` (nav: WORK › Overview). **Not** the default landing — `/` redirects to `/triage` per the triage-first mandate ([IA §0](04-information-architecture.md)).

**Primary entities.** Derived fleet `StatusRollup`, `Incident`, `Client`, `ProtectedAsset` aggregates, `Run` stats, SLA/RPO aggregates.

**User stories.**
- As a lead, I want a worst-real-child health rollup across all 6 products so I see true posture, not an average that hides reds.
- As a lead, I want to click "19 Failing" and land on exactly those 19 assets, pre-filtered.
- As a NOC analyst, I want the active-incident preview so I know if a single root cause is behind a spike before I triage 40 alerts.
- As a lead, I want recency-at-risk (assets with no good backup in N hours) because last-good recency is the metric the console leads with.

**Surfaces & interactions.** A composed, non-uniform layout — explicitly **not** an identical-card grid or a hero-metric template (impeccable bans). Suggested regions:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Fleet health           Protected 812 · Warning 47 · Failed 19 · Offline 11   │  ← status-bar rollup
│  [████████████████░░░░] worst-real-child; each segment → /assets?status=…      │     (clickable segments)
├───────────────────────────────┬──────────────────────────────────────────────┤
│  Active incidents (2)         │  Recency at risk                              │
│  ◉ Pod-EU3 throttling · 7t   │  No good backup in 24h: 14   → /assets?…       │
│  ◉ Appliance reboot · 1 site │  48h: 5 · 7d: 2                                 │
│  [View incident ↗]            │  (sparkline of stale count, last 7d)           │
├───────────────────────────────┼──────────────────────────────────────────────┤
│  SLA / RPO posture            │  Automation this week                         │
│  Within RPO: 96.2%            │  Runs 142 · auto-healed 38 · approvals 6      │
│  RPO breaches: 8 → list ↗     │  Top playbook: VSS Reset (22 runs)            │
└───────────────────────────────┴──────────────────────────────────────────────┘
```

- The status-bar rollup is **the** primary control: each segment is a `<Link>` to `/assets?status=<segment>` ([IA §5](04-information-architecture.md) drill-down).
- Per-product mini-rollups link to `/products/[product]`.
- No control mutates state — Overview is read-only by contract.

**States.**
- **Empty (fresh tenant, no assets):** "No protected assets yet" with a link to Setup/Connections; no fake zeros painted red.
- **Loading:** `loading.tsx` skeleton — bar shimmer + region skeletons; never a layout shift on hydrate.
- **Error (mock query fails):** inline retry card per region (regions fail independently; one failing region doesn't blank the page).
- **All-healthy:** rollup is all `--status-protected`; incident/recency regions show calm empty states ("All clear — no active incidents"), not absence.

**Data dependencies.** Reads derived aggregates from the asset store, `Incident` store, `Run`/audit stores, and SLA/RPO computation (shared with [Reports](#11-reports--slarpo)). Rollup logic = worst real child; cosmetic warnings and intentional-pause are excluded from the "failing" count.

**Edge cases.**
- A fleet-wide `Incident` suppresses its member alerts — Overview must show the *incident* count, not the inflated per-asset alert count.
- A client with only cosmetic screenshot warnings must roll up to Warning, never Failed.
- Tenant switch re-scopes every number to that client (or "All clients" aggregate).

**Acceptance criteria.**
- [ ] Every numeric/segment in the rollup is a link that lands on the correct pre-filtered list, with URL params matching the displayed cohort.
- [ ] Worst-real-child rollup verified against fixtures: a client with 1 real Failed + 5 cosmetic Warnings shows Failed at fleet level; intentional-pause never raises severity.
- [ ] No card grid is identical/repeated; layout is intentionally varied (impeccable).
- [ ] Read-only: no button on this page mutates asset/automation state.
- [ ] Renders correct empty, loading, error, all-healthy states; regions degrade independently.
- [ ] Default landing remains `/triage`; reaching Overview is deliberate.

---

## 2. Triage Queue

**Purpose.** The default landing surface — grouped, deduped, severity-ordered incidents answering "what needs me now," with bulk and per-incident remediation in reach.

**Persona / JTBD.** NOC analyst / tech: *"At 2 a.m. a wall of red appears. Show me the few root causes behind it, ordered by severity, so I fix causes not symptoms."*

**Lives in.** `/triage` (default landing; `/` → `/triage`). Detail at `/triage/[incidentId]`. Nav: WORK › Triage Queue, with a live open-incident count badge (worst-severity color).

**Primary entities.** `Incident` (grouped `Alert`s), `Alert`, `FailureMode` (classification), `ProtectedAsset`, suggested `Playbook`/`RemediationAction`.

**User stories.**
- As an analyst, I want alerts grouped into incidents by shared root cause so 14 identical failures collapse to one row with a count.
- As an analyst, I want severity-first ordering (P0→P3) so the worst thing is always on top.
- As a tech, I want each incident to name its likely cause and a "what changed" timeline so I diagnose without leaving the queue.
- As a tech, I want to select an incident's cohort and run a suggested playbook in bulk.
- As an analyst, I want to acknowledge/snooze an incident so it leaves my active queue without being "resolved."

### 2.1 Grouping, dedup & severity (the core)

The queue is **incident-first**, not alert-first. Grouping rules (mock, deterministic):

| Mechanism | Rule | Source |
|---|---|---|
| **Dedup** | Repeated identical alerts on the same `subjectRef` collapse into one `Alert` with `occurrenceCount++` and updated `lastSeenAt`. | [domain §5.1](05-domain-model.md) |
| **Correlation grouping** | Alerts sharing a root cause group under one `Incident` (`kind`: platform-outage, pod-throttling, appliance-reboot, sync-backlog, mass-reauth). | [domain §5.2](05-domain-model.md) |
| **Classification** | Each alert is matched to a `FailureMode` via `matchSignals` (error codes/strings). Drives the suggested fix + category. | [catalog §8/§10](02-failure-catalog.md) |
| **Severity sort** | `P0 > P1 > P2 > P3`, then occurrence count, then recency. Severity outranks status sort. | [IA §7.1](04-information-architecture.md) |
| **Cosmetic demotion** | `isCosmetic` alerts (screenshot timing, transient throttle) sort below real failures and render Warning/info, not Failed. | [catalog §0.2 / open #2](02-failure-catalog.md) |

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Triage  [Sev: P0,P1 ✕][Product: BCDR ✕]  ⌕ q…        [View: My triage ▾]      │
├──────────────────────────────────────────────────────────────────────────────┤
│ ● P1  Backup failing — SQL Tier-1            14 assets · 3 clients   12m ago   │
│        likely: agent 7.4.2 regression · Grouping Now ⟳        [Investigate ↗]  │
│ ▲ P2  Off-site sync behind — Globex SIRIS     3 appliances          1h ago     │
│        likely: transmit limit too low                        [Investigate ↗]  │
│ ● P1  OAuth consent expired — 7 M365 tenants  7 tenants             past due   │
│        EWS→Graph reauth (deadline 2026-05-30)                [Investigate ↗]  │
│ ◻ P3  Screenshot cosmetic — TERMINALSRV01     1 asset  (known limit) desat.    │
├──────────────────────────────────────────────────────────────────────────────┤
│ ☑ 1 selected   Bulk: [Run playbook ▾] [Add to cart] [Acknowledge] [Snooze 4h] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Incident detail (`/triage/[incidentId]`)

Shows: **why grouped** (the shared `FailureMode`/cause), the shared **"what changed" timeline** (e.g. agent updated 18 min before first failure), the **affected cohort** (link to `/assets?incident=<id>`), and **suggested playbooks** ranked by confidence. Primary CTAs: Investigate cohort, Run suggested playbook, Add cohort to cart, Acknowledge/Snooze, Open ticket.

**Surfaces & interactions.**
- Each incident row is expandable (inline cohort preview) and links to detail.
- Bulk toolbar appears on selection; operates on the incident's cohort and feeds the [action cart](#5-action-chain--cart).
- "Grouping Now ⟳" badge indicates an actively-expanding incident (count still rising); shown as `--status-syncing`.
- Filters/sort/search/saved-view all in the URL (`sev`, `product`, `category`, `q`, `view`).

**States.**
- **Empty (clean fleet):** a genuine "Inbox zero" calm state — "Nothing needs you right now," not a blank table. Offers a link to Overview.
- **Loading:** skeleton rows with severity-dot placeholders.
- **Error:** retry banner; preserves filter chips.
- **Partial (some alerts still classifying):** unclassified alerts appear at the bottom as "Needs classification" with a generic category; never hidden.

**Data dependencies.** `Incident`/`Alert`/`FailureMode` stores; suggestion engine ([engine §10](07-troubleshooting-and-automation-engine.md)); cohort resolution to `/assets`. Tenant scope from `?client`.

**Edge cases.**
- A single asset in two incidents (e.g. offline *and* OAuth-expired) appears under both; dedup is per `subjectRef`+cause, not per asset.
- Snooze must survive reload (persisted) and auto-expire; a snoozed incident that gains new alerts re-surfaces.
- Auto-resolved incidents (platform outage clears) move to a "Recently resolved" collapsed section, not vanish, so reconciliation is possible.
- Cosmetic-only incidents never inflate the sidebar P0/P1 badge.

**Acceptance criteria.**
- [ ] Identical alerts dedup to one row with an accurate `occurrenceCount`; the count updates live as the mock raises duplicates.
- [ ] Alerts correlate into incidents per the 5 incident kinds; the incident shows its member count and "why grouped."
- [ ] Severity sort is strictly `P0>P1>P2>P3`; cosmetic items sort below real failures regardless of nominal severity.
- [ ] Each incident exposes likely cause, "what changed" timeline, cohort link, and ≥1 suggested fix (no dead-end reds).
- [ ] Bulk select → cart/playbook scoped to the incident cohort works end to end.
- [ ] Acknowledge/Snooze persist, re-scope the queue, and auto-expire; re-firing un-snoozes.
- [ ] All queue state (filters, sort, search, view, selected incident) is URL-encoded and deep-linkable.

---

## 3. Asset Detail (timeline + evidence + inline remediation)

**Purpose.** The single-page troubleshooting surface for one protected entity: *"Why is this red? What changed? Show me the evidence — and let me fix it inline."* This is the convergence point where all six products share one skeleton.

**Persona / JTBD.** Tech: *"I have one failing asset open. Tell me the cause with evidence, suggest the fix, and let me dry-run and apply it without leaving this screen."*

**Lives in.** `/assets/[assetId]`, tabbed (`?tab=overview|timeline|points|alerts|runs|actions`). Reached from any list/triage/search. A lightweight `?peek=<assetId>` Sheet offers the same summary without leaving a list.

**Primary entities.** `ProtectedAsset` (discriminated by `kind`), `BackupRun`, `RecoveryPoint`, `ScreenshotVerification`, `Alert`, `FailureMode`, `OffsiteSync`/`StoragePool` (BCDR), suggested `RemediationAction`/`Playbook`, `Run` history for this asset.

**User stories.**
- As a tech, I want a "Why is this red?" panel that names the classified `FailureMode` with the verbatim error string (mono) so I trust the diagnosis.
- As a tech, I want a "What changed" timeline (agent update, reboot, config change, retention change) correlated to the first failure.
- As a tech, I want the last-10-backups dot-strip and a full backup timeline with per-run evidence.
- As a tech, I want recovery points with verification status and restore/lock actions.
- As a tech, I want suggested fixes inline with Dry-run / Apply once / Apply always / Save as playbook.
- As a junior, I want the same skeleton on a SaaS seat as on a BCDR agent so the mental model never changes.

### 3.1 Layout & tabs

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀ Assets / ACME-DC01            ● Failed   AST-WIN-DC01 · Acme · BCDR agent    │
│  [Overview] [Timeline] [Recovery points] [Alerts] [Runs] [Actions]            │
├──────────────────────────────────────────────────────────────────────────────┤
│  WHY IS THIS RED?                              SUGGESTED FIX                    │
│  VSS writer failure → crash-consistent only    💡 Reset VSS Writers + Retry    │
│  Evidence: "VSS failed to prepare snapshots"    Risk: low · ~1 min · reversible │
│  code BKP1410 · last 4 runs crash-consistent    Confidence: high (code match)  │
│  Classified: bcdr.vss-writer-snapshot-failure   [Dry-run][Apply once][Always…] │
├──────────────────────────────────────────────────────────────────────────────┤
│  WHAT CHANGED (last 72h)        BACKUPS (last 10)  ●●●○●●●●●●                   │
│  • 06-21 02:14 Windows update   ┌ timeline ───────────────────────────────┐   │
│  • 06-21 02:31 first VSS fail   │ run rows w/ mode, consistency, evidence  │   │
│                                 └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Overview tab:** Why-red + Suggested fix + What-changed + dot-strip + key facets (product-specific: BCDR shows chain/ZFS/sync; SaaS shows OAuth grant + seat license; Spanning shows API cap %).
- **Timeline tab:** full `BackupRun` history; each run expands to evidence (error code mono, consistency, bytes, mode).
- **Recovery points tab:** `RecoveryPoint` list with verification badge, local/cloud stored, expiry warning, lock toggle, restore/virtualize actions. SaaS/Spanning show `saas-set` points (no boot test).
- **Alerts tab:** open/acknowledged/suppressed alerts for this asset, each with its `FailureMode` and suggested fix.
- **Runs tab:** automation `Run`s that targeted this asset (links to `/automation/runs/[runId]`).
- **Actions tab:** the full product-scoped action catalog applicable to this asset's `kind` (see [Remediation Actions](#4-remediation-actions)).

### 3.2 Inline remediation

The Suggested Fix card ([engine §10.2](07-troubleshooting-and-automation-engine.md)) is the primary in-context action surface: Name · Rationale (grounded in detected condition) · Risk/Duration/Reversibility · Confidence · four buttons (Dry-run, Apply once, Apply always, Save as playbook). "Apply once" defaults scope to `once-this-asset`; "Apply always" pre-fills a Policy with the firing trigger.

**States.**
- **Healthy asset:** Why-red panel becomes "Protected — last good backup 41 min ago"; no fix suggested; timeline shows all-green dot-strip.
- **Empty (no runs yet, just onboarded):** "No backups yet — initial seed in progress" with seed ETA; not an error.
- **Loading:** skeleton header + tab skeletons; dot-strip placeholders.
- **Error (asset not found / store miss):** 404-style card with link back to `/assets`.
- **Partial (classification pending):** Why-red shows "Diagnosing…" with the raw error visible; suggested fix appears once classified.
- **Cosmetic failure:** Why-red is desaturated/info-toned ("Known limitation — verified via local virtualization"), with a "Mark verified" action rather than alarm.

**Data dependencies.** Asset store (by `kind`), run/point/verification stores, alert+failure-mode classification, suggestion engine, this-asset run history, BCDR-only `StoragePool`/`OffsiteSync`. Active automation `Run`s flip the header badge to `Syncing` ([engine §8.3](07-troubleshooting-and-automation-engine.md)).

**Edge cases.**
- SaaS seat / Salesforce org: no screenshot tab content — replace "Recovery points" verification with "last successful sync"; hide boot-test concepts entirely (don't render empty boot UI).
- Encrypted BCDR agent re-sealed after appliance reboot: Why-red shows `bk005`, suggested fix = Unseal (high-risk, gated), and the "What changed" timeline shows the appliance reboot.
- An asset under an active fleet `Incident`: Why-red links up to the incident ("part of Pod-EU3 throttling — 7 tenants affected") rather than implying an isolated fix.
- Multiple open alerts: rank suggested fixes by severity; show the top one inline, the rest under Alerts tab.

**Acceptance criteria.**
- [ ] Why-red names the classified `FailureMode` and shows the verbatim error string in mono.
- [ ] "What changed" correlates config/update/reboot events to the first failure timestamp.
- [ ] Last-10 dot-strip renders with correct status tokens; full timeline expands per-run evidence.
- [ ] The same tab skeleton renders for agent, agentless, endpoint, saas-seat, salesforce-org, and share kinds, with product-appropriate facets and no empty/irrelevant UI.
- [ ] Inline Suggested Fix offers Dry-run / Apply once / Apply always / Save as playbook, wired to the engine.
- [ ] Cosmetic failures render desaturated with a verify action, not red alarm.
- [ ] All tab/peek state is URL-encoded; `?peek=` Sheet and full route show consistent data.

---

## 4. Remediation Actions

**Purpose.** The atomic verbs of the product — parameterized, typed, reversible-where-possible fixes (Reset VSS Writers, Run Force Retention, Repair Agent Comms, Launch OAuth Consent, Force Diff-Merge) that can be run alone or chained.

**Persona / JTBD.** Tech: *"Give me a one-click, previewable fix for this exact failure — and tell me what it'll change and how to undo it before I commit."*

**Lives in.** Three surfaces: inline on [Asset Detail](#3-asset-detail-timeline--evidence--inline-remediation) (Actions tab + suggested-fix), the [action cart](#5-action-chain--cart) palette, and the catalog tab of [`/automation`](#7-playbook-library). Single-action execution flows through the Execute modal ([engine §7.2](07-troubleshooting-and-automation-engine.md)).

**Primary entities.** `RemediationAction` (catalog definition, [domain §6.1](05-domain-model.md) / [engine §2](07-troubleshooting-and-automation-engine.md)), `ActionRun` (one execution), `CompensatingAction`, `ApprovalRequest`.

**User stories.**
- As a tech, I want every action to declare risk, reversibility, duration, and a dry-run so I act with confidence.
- As a tech, I want only product-appropriate actions offered on an asset (no "Run diff-merge" on a SaaS seat).
- As a tech, I want a before/after diff in dry-run so I see exactly what will change.
- As a tech, I want destructive/irreversible actions to declare their rollback (or flag none) up front.

**Surfaces & interactions.**
- **Action category coloring of behavior** ([engine §2.2](07-troubleshooting-and-automation-engine.md)): `diagnostic` (read-only, runs in dry-run), `remediation` (mutating, renders payload in dry-run), `notification` (renders, doesn't send), `control-flow` (cart only).
- **Action card** shows: name, one-line description, target kinds, params (typed inputs), risk badge, reversibility, est. duration, and `nativeAutomation` note where Datto already auto-heals ("Datto auto-diff-merges after 5 screenshot failures").
- **Execute modal** (single action): scope → run-mode (dry-run default) → runtime params → confirm. For `once-this-asset` low-risk reversible actions, compressed to a 2-click inline confirm.
- **Param sources** ([engine §2.1](07-troubleshooting-and-automation-engine.md)): `literal`, `context` (auto from asset), `upstream-ref` (chain), `runtime-prompt` (asked at run). Sensitive params masked; dry-run uses test values.

**Curated library (seed).** Ships pre-built per [engine §2.4](07-troubleshooting-and-automation-engine.md) and the consolidated action list in [catalog §8](02-failure-catalog.md), spanning all six products (BCDR force-retention/VSS-reset/diff-merge/repair-comms/unseal; DEB restart-services/AV-exclusions/throttle/metered; SaaS OAuth-consent/seat-rediscovery/reschedule; Spanning reauth/raise-API-cap/disable-dup-rules). MSPs can author and share actions within the org.

**States.**
- **Empty (asset has no applicable actions):** "No automated actions for this asset type" with the Support-escalation action (the universal human-in-loop exit) always available.
- **Loading:** action cards skeleton.
- **Dry-run result:** before/after diff table per asset; "no API calls sent" confirmation; pre-change snapshot captured.
- **Awaiting approval:** action paused with approval card sent; status `awaiting-approval`.
- **Error / failed:** error code + message (mono); retry offered only for transient failures; permanent failures (invalid creds, asset not found) skip retry.
- **Rolled-back:** shows the compensating run linkage.

**Data dependencies.** Action library store; asset `kind` → applicable actions filter; precondition evaluation against live asset context; mock runner for dry-run/execute; approval store; audit append on every state change.

**Edge cases.**
- Precondition false → action **skipped** (not failed), with a clear "did not run: condition not met" note.
- Irreversible action (e.g. `bulk-unseat` triggers retention clock; `failback`) — confirmation must surface "non-reversible" prominently and gate per risk rules.
- `outcome: 'opens-ticket'` / `guidance-only` actions don't self-heal — they assemble a Support package or render a runbook; the UI must not imply a fix occurred.
- An action whose target is offline (asset not checking in) should pre-flight and warn rather than silently queue.

**Acceptance criteria.**
- [ ] Every action declares category, risk, reversibility, duration, dry-run support, and (if mutating) a compensating action or explicit "non-reversible" flag.
- [ ] Only actions whose `appliesToKinds`/`productTypes` match the target are offered.
- [ ] Dry-run produces a per-asset before/after diff and sends zero mutations (verified by the mock runner intercept).
- [ ] Default gate rules by risk ([engine §2.3](07-troubleshooting-and-automation-engine.md)) are enforced; `apply-always` auto-escalates gating.
- [ ] Sensitive params are masked and use test values in dry-run.
- [ ] Precondition-false yields a skipped (not failed) outcome with an explanatory note.
- [ ] Every execution writes an `ActionRun` + audit entries.

---

## 5. Action Chain / Cart

**Purpose.** The spine of the engine — a route-independent cart where a tech assembles actions (+ control-flow) into an ordered chain, sets scope, dry-runs, and commits. Chains can be saved as playbooks.

**Persona / JTBD.** Tech: *"This failure needs three steps in order, conditional on the first. Let me stage them, preview, and run them as one unit — then save it so I never rebuild it."*

**Lives in.** A global slide-in `Sheet` (right), openable from anywhere; badge count in sidebar (`🛒 Action cart ⟨3⟩`) and top bar. **Not a route** — Zustand `cart-store` + `persist` ([IA §1, §6.2](04-information-architecture.md)). The fuller chain builder opens from the cart for branching/editing.

**Primary entities.** `ActionChain` / `ChainStep` (action, if, switch, for-each, wait, stop, sub-playbook, approval-gate), `CartState`, `RunRecord`.

**User stories.**
- As a tech, I want to add suggested fixes and catalog actions to a cart and reorder them.
- As a tech, I want conditional steps ("run diff-merge only if VSS reset failed") and a for-each over a cohort.
- As a tech, I want one scope + one dry-run + one approval for the whole chain, not per step.
- As a tech, I want my cart to survive reloads and route changes (it's in-progress work).
- As a tech, I want to save the assembled chain as a reusable playbook.

**Surfaces & interactions.**
- **Cart Sheet:** ordered step list (drag to reorder), per-step params, per-step `onFailure` (fail-chain / skip / try-compensate / continue) and retry config, scope picker, run-mode toggle, total est. duration, blast-radius summary.
- **Step picker** (two-bucket: Actions | Control-flow per [engine §3.4](07-troubleshooting-and-automation-engine.md)).
- **Branch groups** are collapsible (the recommended linear-list-with-branch-groups model, not a full canvas — see [open decision](#17-open-decisions--flags) and [engine §13.1](07-troubleshooting-and-automation-engine.md)).
- **Dry-run** runs the whole chain side-effect-free, producing per-step `dryRunDiff`. **Apply** flips deliberately; the apply button restates scope count.
- **Save as playbook** captures the chain + scope defaults + approval config → [Playbook Library](#7-playbook-library).

**States.**
- **Empty cart:** "No actions staged — add a suggested fix or pick from the catalog"; the badge hides at 0.
- **Building (dirty):** autosaves every 10s; "unsaved" indicator.
- **Dry-run preview:** step tiles show would-change diffs; nothing committed.
- **Running:** drawer shows step tiles transitioning pending→running (`--primary` pulse)→succeeded/failed; per-step countdown; Sonner toast on terminal state.
- **Needs-approval:** chain pauses at gate; approval card dispatched; resumes/aborts on decision.
- **Partial failure:** "12 succeeded, 2 failed"; "Retry failed only" excludes the already-succeeded.

**Data dependencies.** `cart-store` (persisted), action library, mock runner ([engine §8](07-troubleshooting-and-automation-engine.md)), scope resolution ([§6](#6-scope--once--all-matching--always)), approval store, run+audit stores. Affected assets show `Syncing` in the fleet table during the run.

**Edge cases.**
- Two `if` steps to fake three outcomes — guide the user to `switch` instead (the engine documents this; the UI should nudge).
- A chain mixing products (BCDR + SaaS) — each step still validated against its target kind; invalid combos flagged before run.
- Scope change after a dry-run invalidates the prior preview (must re-dry-run before apply).
- Cart with an irreversible step shows the rollback-impossibility before apply; auto-inserts an approval gate.
- Cart persists across tenant switch but warns if staged assets fall outside the new tenant scope.

**Acceptance criteria.**
- [ ] Actions and control-flow steps can be added, reordered, and removed; cart persists across reload and route change.
- [ ] One scope, one dry-run, one approval gate apply to the whole chain.
- [ ] Conditional (`if`/`switch`), `for-each`, `wait`, `stop`, `sub-playbook`, and `approval-gate` steps function per [engine §3.2](07-troubleshooting-and-automation-engine.md).
- [ ] Dry-run produces per-step diffs with zero mutations; switching to Apply is a deliberate toggle that restates scope count.
- [ ] Per-step `onFailure` and retry behavior are honored by the runner; partial failure offers retry-failed-only.
- [ ] "Save as playbook" produces a valid `Playbook` with scope defaults and approval config.

---

## 6. Scope — once / all-matching / always

**Purpose.** Make "which assets, and for how long going forward?" a first-class, deliberate decision with four explicit modes — not an afterthought.

**Persona / JTBD.** Tech/lead: *"This fix should run on just this asset / on every asset matching a filter right now / automatically forever. Let me choose, preview the blast radius, and gate the risky ones."*

**Lives in.** The scope picker component in the Execute modal and the chain builder ([engine §4.3](07-troubleshooting-and-automation-engine.md)). "Apply always" graduates into an [Automation Policy](#8-automation-policies-apply-always).

**Primary entities.** `ScopeConfig` (`mode`, `filter`, `policy`), `AssetFilter`, `PolicyConfig`.

**The four modes** ([engine §4.2](07-troubleshooting-and-automation-engine.md), [domain §8 ActionScope](05-domain-model.md)):

| Mode | What | Confirmation | Auto-gate |
|---|---|---|---|
| `once-this-asset` | The single open asset. Default for inline fixes. | Inline confirm | per action risk |
| `once-selected` | A static multiselect of 2–N assets (snapshotted at submit). | "X on N assets across M clients" banner | per action risk |
| `once-all-matching` | A filter evaluated at run time; one batch. Live preview count. | Resolved-list modal (paginated, client breakdown) | gate if risk≥high or >50 assets |
| `always-matching` | Forward-going Policy; dynamic membership re-evaluated per trigger. | Policy config panel | **always gated on publish** |

**Surfaces & interactions.**
- Segmented control: `● This asset ○ Selected (3) ○ All matching ○ Always`.
- `all-matching`/`always` expand a filter builder (product/status/client/category/tags/last-backup-age/storage%) with a **debounced live preview** ("14 assets across 7 clients · View list ↗").
- `always` adds a Policy config panel (trigger type, count/cron, suppression window, name).
- A persistent info line: "Affects N assets · Risk: <level> · Reversible/Non-reversible."

**States.**
- **Preview resolving:** spinner on the count while the mock filter query runs (debounced 300ms).
- **Zero matches:** "No assets match this filter" — Apply disabled.
- **Over-threshold (>50):** auto-inserts an approval gate; banner explains why.
- **Policy draft:** saved unpublished; must be published (gated) to go live.

**Data dependencies.** In-memory asset store for filter evaluation; resolved list snapshotted into the `RunRecord`; `PolicyConfig` written to `policy-store` on "always." Scope is serialized into every run record for audit.

**Edge cases.**
- Filter that resolves differently between dry-run and apply (asset states changed) — re-resolve at apply and show a delta if the count changed.
- `once-selected` where an asset changed state after selection — the static list is honored; per-asset precondition may still skip it.
- `always-matching` membership: newly onboarded assets matching the filter inherit the policy automatically; suppression prevents churn loops.
- Cross-tenant scope for an MSP — scope tags + RBAC ([open decision](#17-open-decisions--flags); [engine §13.3](07-troubleshooting-and-automation-engine.md)).

**Acceptance criteria.**
- [ ] All four modes are selectable and distinct; `once-this-asset` is the inline default.
- [ ] `all-matching`/`always` show a live, debounced preview count with a viewable resolved list.
- [ ] `once-all-matching` with risk≥high or >50 assets auto-inserts an approval gate.
- [ ] `always-matching` creates a persisted `PolicyConfig` (draft → publish), always gated on publish.
- [ ] Resolved asset list is snapshotted into the run record; apply re-resolves and flags count deltas.
- [ ] Blast-radius/risk/reversibility line is always visible before commit.

---

## 7. Playbook Library

**Purpose.** Save, version, browse, and reuse named action chains — "fix once, then fix forever, step one." Includes a curated seed library of common MSP playbooks.

**Persona / JTBD.** Lead/tech: *"The fix I built last week should be a named, versioned, shareable playbook I can run on the next occurrence or nest inside a bigger one."*

**Lives in.** `/automation` (Playbooks tab; siblings: Actions catalog, Policies). Detail/editor at `/automation/playbooks/[playbookId]`. Nav: AUTOMATE › Actions & Playbooks.

**Primary entities.** `Playbook` (extends `ActionChain`, [engine §5.3](07-troubleshooting-and-automation-engine.md)), `PlaybookStep`, version metadata, `templateParams`, `boundPolicyIds`.

**User stories.**
- As a lead, I want to save an assembled chain as a named playbook with scope defaults and approval config.
- As a lead, I want version/change-control: published playbooks are read-only; editing creates a draft.
- As a tech, I want to load a playbook into the cart and run it on a new scope.
- As a tech, I want to nest a playbook as a sub-step (sub-playbook).
- As a junior, I want a curated template library so I'm not starting from scratch.

**Surfaces & interactions.**
- **Library list:** name, products, trigger pattern, version, success rate, last run, source (curated vs MSP-authored). Search/filter by product, failure mode, source.
- **Three save tiers** ([engine §5.1](07-troubleshooting-and-automation-engine.md)): Saved Action (single action, pre-filled), Playbook (full chain, versioned, callable), Template (parameterized, cross-org curated).
- **Editor** (`/automation/playbooks/[playbookId]`): step sequence, params, scope defaults, approval gates, trigger mode, run history, version diff. "Load into cart" + "Run now."
- **Change control** ([engine §5.2](07-troubleshooting-and-automation-engine.md)): published = read-only; edit → draft at `version+1`; promote requires self-approval (low risk) or named approver; one-click rollback to prior published version; policies pin a version until migrated.
- **Curated seed** ([engine §5.4](07-troubleshooting-and-automation-engine.md)): 10 templates (BCDR screenshot auto-merge, VSS reset, agent-comms repair, storage force-retention, off-site resume, SaaS OAuth bulk-reauth, Spanning reauth+seat-audit, Salesforce API cap, AV/EDR cbtfilter exclusion, DEB agent-down restart). Templates duplicate before edit; originals immutable.

**States.**
- **Empty (no authored playbooks):** the curated template library still populates the list; an empty "My playbooks" section invites "Save your first from the cart."
- **Loading:** library skeleton.
- **Draft:** editable, badged "Draft v3"; test runs allowed without affecting live policies.
- **Published:** read-only; "Edit (creates draft)" CTA.
- **Bound to policy:** shows which policies pin which version; warns before edits that policies won't auto-migrate.

**Data dependencies.** `playbook-store` (versioned, persisted), action library, run history (success-rate stat), policy store (binding), approval store (publish gate), audit (`playbook.created/edited/published/rolled-back`).

**Edge cases.**
- Editing a published playbook that 3 policies pin — drafts don't affect them; migration is explicit per policy.
- A curated template referencing an action the MSP later disabled — flag the missing action on load.
- Rolling back to a prior version that used a since-changed action schema — version compatibility check.
- Sub-playbook recursion (A calls B calls A) — detect and block cycles.

**Acceptance criteria.**
- [ ] A cart chain saves as a `Playbook` with scope defaults + approval config; appears in the library.
- [ ] Published playbooks are read-only; editing forks a draft at `version+1`; promoting is gated per risk.
- [ ] One-click rollback restores a prior published version; previous versions are retained.
- [ ] Playbooks can be loaded into the cart and nested as sub-playbooks (cycles blocked).
- [ ] The 10 curated templates seed read-only and duplicate-before-edit.
- [ ] Policy bindings pin a specific version; editing warns that policies won't auto-migrate.
- [ ] All lifecycle events write audit entries.

---

## 8. Automation Policies (apply-always)

**Purpose.** The top of the fix-once-then-forever ladder — standing automation that runs an action/playbook automatically when a matching failure is detected on in-scope assets, optionally gated.

**Persona / JTBD.** Lead: *"I never want to hand-fix this recurring failure again. When it matches, run the playbook on whatever assets match — and keep a kill-switch and an audit trail."*

**Lives in.** `/automation` (Policies tab). Detail at `/automation/policies/[policyId]`. Nav: AUTOMATE › Actions & Playbooks.

**Primary entities.** `AutomationPolicy` / `PolicyConfig` ([domain §6.4](05-domain-model.md), [engine §4.2](07-troubleshooting-and-automation-engine.md)), bound `Playbook`/`RemediationAction`, `RunRecord` (per fire), `ApprovalRequest`.

**User stories.**
- As a lead, I want to define a trigger (N consecutive failures of a failure mode / event / cron) + a dynamic filter + the playbook to run.
- As a lead, I want a draft → publish flow with a mandatory approval on first publish (open-ended blast radius).
- As a lead, I want a dry-run-first / observe-only mode before going live.
- As a lead, I want a kill-switch (pause), suppression window, and recent-fires log.
- As a lead, I want newly onboarded matching assets to inherit the policy automatically.

**Surfaces & interactions.**
- **Policy editor:** trigger type (`consecutive-failures` + count, `event-type`, `cron`), dynamic `AssetFilter`, bound chain (pinned version), `requiresApproval` (auto-run vs gate each fire), `suppressWithinHours`, `dryRunFirst`, scope tags.
- **Canonical example** ([engine §4.2](07-troubleshooting-and-automation-engine.md)): "Auto Diff-Merge after 5 Consecutive Screenshot Failures (BCDR)" — mirrors Datto's native behavior.
- **Policy detail:** match conditions, bound action/version, scope, gates, kill-switch toggle, stats (`triggered/succeeded/lastFiredAt`), recent fires (each → its `RunRecord`).
- **Lifecycle** ([engine §4.2](07-troubleshooting-and-automation-engine.md)): draft → publish (always gated) → enabled; each fire re-evaluates membership, respects suppression, creates a run record; edit forks a draft; delete retains run records.
- **Seed:** 3 pre-built policies — auto-diff-merge (enabled), SaaS OAuth reauth (disabled, pending approval), DEB v2 AV-exclusion (draft) ([engine §12.4](07-troubleshooting-and-automation-engine.md)).

**States.**
- **Empty:** "No policies yet — graduate a working fix into a policy" with a link from a suggested-fix "Apply always."
- **Draft:** not firing; "Publish (requires approval)" CTA.
- **Observe-only (dryRunFirst):** fires as dry-run, logs "would have affected N" without mutating — the free-dry-run detection model ([engine §1.2](07-troubleshooting-and-automation-engine.md)).
- **Enabled:** live; recent fires populate.
- **Paused (kill-switch):** stops firing immediately; retains config and history.
- **Pending approval:** awaiting publish sign-off.

**Data dependencies.** `policy-store` (persisted), failure-mode classification (trigger matching), asset filter evaluation (dynamic membership), bound playbook version, mock event/trigger simulation ([open decision](#17-open-decisions--flags); [engine §13.2](07-troubleshooting-and-automation-engine.md)), run+audit+approval stores.

**Edge cases.**
- Suppression prevents re-firing on asset X within the window even if it fails again — must be visible ("suppressed until …").
- A policy whose bound playbook gets a new version keeps running the pinned version until the owner migrates.
- Membership churn: an asset that drops out of the filter mid-window isn't re-evaluated until next trigger.
- Cross-tenant policies and who can see/edit them — RBAC via scope tags ([open decision](#17-open-decisions--flags)).
- Observe-only that would have affected 200 assets — surface the count prominently before the owner enables live.

**Acceptance criteria.**
- [ ] A policy can be created with a trigger (consecutive-failures/event/cron) + dynamic filter + bound playbook (pinned version).
- [ ] Draft → publish always requires approval; published policies fire on trigger.
- [ ] Observe-only mode fires as dry-run and logs "would have affected N" with zero mutation.
- [ ] Each fire re-evaluates membership, respects `suppressWithinHours`, and creates a distinct run record tied to the policy.
- [ ] Kill-switch pauses firing immediately while retaining config + history.
- [ ] Newly onboarded matching assets inherit the policy without manual edits.
- [ ] The 3 seed policies load in their correct states.

---

## 9. Approvals

**Purpose.** Risk-tiered human-in-the-loop gates — high-blast-radius or irreversible actions pause for a named human; low-risk reversible single-asset actions never gate (avoiding approval fatigue).

**Persona / JTBD.** Approver (senior tech / service manager): *"Before this risky fix runs on 14 assets, show me what changes, the rollback plan, and let me approve, reject, or escalate — with my decision recorded."* Requester: *"Gate only what's actually risky."*

**Lives in.** Approval cards render in the [notification center](#15-notifications) (top bar) and optionally post to Slack/Teams (mock: logged). Gates are inserted into chains/policies ([engine §6](07-troubleshooting-and-automation-engine.md)). Approval **policy config** lives at `/setup/approvals`.

**Primary entities.** `ApprovalGateConfig`, `ApprovalRequest` / `PendingApproval` ([domain §6.5](05-domain-model.md)), `ApprovalDecision` (approved/rejected/escalated).

**User stories.**
- As an approver, I want a card showing what will change, dry-run diff, risk, and rollback plan.
- As an approver, I want to approve/reject/escalate, with a timeout default and an on-timeout behavior.
- As a requester, I want low-risk single-asset reversible actions to skip gating entirely.
- As an approver, I want my decision (name, time, comment) recorded immutably.
- As a lead, I want a trust window so re-running the same playbook on the same scope doesn't re-gate within 24h.

**Surfaces & interactions.**
- **Auto-gate injection** ([engine §6.2](07-troubleshooting-and-automation-engine.md)): `always-matching` policy publish; `once-all-matching` >50 assets; any `critical` risk step; any `irreversible` step; any OAuth-consent/tenant-reauth action.
- **Approval card** ([engine §6.3](07-troubleshooting-and-automation-engine.md)): requester + age, "what will change" + asset/client counts, dry-run diff (top N + "view full"), risk + reversibility, rollback plan (always shown if a compensating action exists), `[Approve][Reject][Escalate]`, auto-reject countdown.
- **Config** (`ApprovalGateConfig`): required role / specific approvers, channels, timeout + on-timeout (auto-reject/escalate/approve), escalateTo, which context fields to show.
- **Fatigue mitigation** ([engine §6.4](07-troubleshooting-and-automation-engine.md)): never gate low-risk single-asset reversible; 24h trust window per playbook+scope (resets on scope or version change); full-identity decision capture.

**States.**
- **Pending:** card live with countdown; chain status `needs-approval`.
- **Approved:** chain resumes; decision recorded.
- **Rejected:** chain enters `rejected`; nothing mutated; reason captured.
- **Escalated:** routed to `escalateTo`; new pending entry.
- **Timed-out:** `onTimeout` behavior applied; logged.
- **Empty (no pending approvals):** notification center shows "No approvals waiting on you."

**Data dependencies.** `approval-store` (queue, persisted), run store (the paused run), audit (`approval.requested/granted/rejected/escalated`), user store (roles, `canApprove`), trust-window state.

**Edge cases.**
- Approver is the requester — disallow self-approval where a named approver/role is required; allow only the documented self-approval for low-risk playbook publish.
- Timeout fires while the approver is mid-decision — last-write-wins with a clear "already timed out" message.
- Two approvers act simultaneously — first decision wins; the second sees the resolved state.
- A gated action whose dry-run diff is empty (no-op) — surface "no changes detected" so the approver isn't approving a phantom.
- Trust window must reset on any scope change or playbook version bump (verify it doesn't leak approval across different scopes).

**Acceptance criteria.**
- [ ] Auto-gate injection fires for all five documented conditions.
- [ ] Approval cards show what-changes, dry-run diff, risk, reversibility, and rollback plan (rollback always shown when a compensating action exists).
- [ ] Approve/Reject/Escalate work; the paused run resumes/aborts/routes accordingly.
- [ ] Timeout applies the configured `onTimeout` behavior and is logged.
- [ ] Low-risk single-asset reversible actions never gate; the 24h trust window suppresses re-gating and resets on scope/version change.
- [ ] Every decision is captured with full identity (name, timestamp, decision, comment) and audited.

---

## 10. Run History & Audit

**Purpose.** Two complementary records: **Run History** (every execution, including dry-runs, for "what did this do?") and the **Audit Trail** (immutable, append-only log of every engine event, for compliance and client deliverables).

**Persona / JTBD.** Tech investigating: *"What did this playbook do last time, on which assets, with what outcome?"* Lead/auditor: *"Give me an immutable who-did-what-when I can export for a client report or SIEM."*

**Lives in.** `/automation/runs` (Run History & Audit). Run detail at `/automation/runs/[runId]`. Nav: AUTOMATE › Run History & Audit.

**Primary entities.** `RunRecord` ([engine §9.1](07-troubleshooting-and-automation-engine.md)), `StepOutput`, `AuditEvent` ([engine §9.2](07-troubleshooting-and-automation-engine.md)), `AuditLogEntry`.

**User stories.**
- As a tech, I want a run list filterable by product/client/playbook/tech/status/date and dry-run-vs-apply.
- As a tech, I want a run detail with per-step inputs/outputs/errors/diffs, the resolved asset list, params, and approval chain.
- As a tech, I want per-asset fan-out outcomes on multi-asset runs, with "retry failed only."
- As a tech, I want "Revert this run" where every mutating step declared a compensating action.
- As an auditor, I want an immutable, append-only audit feed exportable to CSV (SIEM) and PDF (client report).
- As a tech, I want a run to link back to the incident/asset that triggered it.

**Surfaces & interactions.**
- **Run History list** ([engine §9.2](07-troubleshooting-and-automation-engine.md)): Run name · Triggered by · Date · Scope summary · Assets targeted · Outcome · Duration · Dry-run? · Actions. Filters: Product, Client, Playbook, Tech, Status, Date range, Dry-run/Apply.
- **Run detail (slide-over or route):** step timeline with each `StepOutput` (inputs, outputs, errors, diffs, retry attempts), resolved asset list, params used, approval decision chain, per-asset breakdown, "Revert this run" (when all mutating steps are reversible), back-links to triggering incident/asset.
- **Audit Trail:** immutable chronological event log (run/approval/playbook/policy/action verbs). Filters: Event type, Actor, Client, Target type, Playbook, Policy, Date range. Append-only — no edit/delete in the mock.
- **Export:** CSV (all fields, SIEM) + PDF (formatted client deliverable), filtered to current view.

**States.**
- **Empty:** "No runs yet" (history) / "No audited events yet" (audit) — but seed data provides 20 runs + 40 audit events on first load ([engine §12.4](07-troubleshooting-and-automation-engine.md)), so the empty state is rare.
- **Loading:** list + detail skeletons.
- **Partial-failure run:** outcome chip "12✓ / 2✕"; per-asset breakdown lists failures with errors + "Retry failed only."
- **Rolled-back run:** linked to its compensating run; shows `rolled-back` status and the reverse-order step chain.
- **Dry-run:** clearly badged "Dry-run"; diffs shown but no mutations.
- **In-progress:** live-updating step tiles ([engine §8.3](07-troubleshooting-and-automation-engine.md)).

**Data dependencies.** `run-store` (capped ~500, persisted), `audit-store` (append-only, never pruned in mock, throws on overwrite-by-id), playbook/policy/asset stores for back-links, export serializers.

**Edge cases.**
- Audit append-only invariant: any attempt to overwrite an existing event by id must throw ([engine §12.3](07-troubleshooting-and-automation-engine.md)) — the UI never offers edit/delete.
- A run whose playbook was later edited — the run record stores the name/version at run time, not the live one.
- Partial rollback failure: "steps 1–3 reverted; step 4 could not complete — manual intervention required" ([engine §8.6](07-troubleshooting-and-automation-engine.md)).
- Reverting a run whose assets changed state since — re-resolve and flag deltas.
- Export of a filtered view must include exactly the filtered rows (no leakage).

**Acceptance criteria.**
- [ ] Run History lists every execution incl. dry-runs, filterable by all documented dimensions, deep-linkable via URL.
- [ ] Run detail shows per-step `StepOutput` (inputs/outputs/errors/diffs/retries), resolved assets, params, and approval chain.
- [ ] Multi-asset runs show per-asset outcomes; "Retry failed only" re-runs just the failures.
- [ ] "Revert this run" appears only when all mutating steps declared a compensating action; rollback runs in reverse order and re-verifies via diagnostics.
- [ ] Audit Trail is append-only (overwrite-by-id throws); no edit/delete UI exists.
- [ ] CSV + PDF export honor the current filter and include the documented fields.
- [ ] Runs link back to the triggering incident/asset and forward to compensating runs.

---

## 11. Reports / SLA-RPO

**Purpose.** Recurring-failure trends, SLA/RPO compliance over time, alert-volume, and automation coverage/ROI — the analytical, deliverable-oriented surface.

**Persona / JTBD.** Service manager / lead: *"Show me which failures recur, whether we're meeting RPO, how alert volume trends, and what automation is saving — so I can report to clients and improve."*

**Lives in.** `/reports` (index) + `/reports/[reportId]` (single report with chart + drill-through). Nav: ANALYZE › Reports.

**Primary entities.** Aggregates over `BackupRun`, `RecoveryPoint` (last-good recency → RPO), `Alert`/`FailureMode` (recurring-failure trends), `RunRecord` (automation ROI), `Client` (per-tenant SLA).

**User stories.**
- As a lead, I want SLA/RPO posture over a time window with breach drill-through.
- As a lead, I want recurring-failure trends (which failure modes spike, by product/client).
- As a lead, I want alert-volume trend and automation coverage (auto-healed vs manual).
- As a lead, I want every chart segment to drill into the underlying assets/runs.

**Surfaces & interactions.**
- Recharts/Tremor KPI tiles + charts. **Not** an identical-card grid; vary chart types and sizes (impeccable).
- **RPO compliance:** % within RPO over time; breaches list → `/assets?…` (the breaching assets).
- **Recurring failures:** top failure modes by count over the window, by product/client; each → filtered triage/asset list.
- **Alert volume:** trend with incident overlays (a spike annotated to a platform incident).
- **Automation ROI:** runs, auto-healed count, approvals, top playbooks, est. time saved.
- Time window via `range` URL param; tenant via `client`. Drill-through preserves filter context ([IA §5](04-information-architecture.md)).

**States.**
- **Empty (insufficient history):** "Not enough data yet for this window" with a wider-window suggestion; no misleading flat-zero charts.
- **Loading:** chart skeletons.
- **Error:** per-report retry; one failing report doesn't blank the index.
- **No breaches / all-healthy:** explicit "100% within RPO this window" calm state.

**Data dependencies.** Shared SLA/RPO computation (also used by [Overview](#1-fleet-overview--health)), failure-mode classification, run/audit aggregates, time-window + tenant scoping. Deterministic seed so charts are reproducible in Storybook.

**Edge cases.**
- RPO definition varies by asset/`BackupJob` retention — compute per-asset target, aggregate correctly (don't apply one global RPO).
- A platform `Incident` window should annotate (not distort) the alert-volume trend.
- Cosmetic failures excluded from "real failure" trends but available as a toggle.
- Per-tenant report must reflect only that client's assets when `?client` is set.

**Acceptance criteria.**
- [ ] SLA/RPO compliance is computed per-asset against its retention target and aggregated; breaches drill through to the exact assets.
- [ ] Recurring-failure, alert-volume, and automation-ROI reports render with correct windowed/tenant-scoped data.
- [ ] Every chart segment is a drill-through link preserving filter context in the URL.
- [ ] Charts are varied (not an identical grid); empty/loading/error states render.
- [ ] Time window and tenant are URL-encoded; reports are reproducible from seed.

---

## 12. Saved Views & Filtering

**Purpose.** The cross-cutting filter vocabulary + named, shareable filter states (the saved-views model) that re-scope one workhorse list rather than cloning pages.

**Persona / JTBD.** NOC analyst: *"My morning triage is a specific filter set. Let me name it, pin it, share it as a URL, and have it survive reloads."*

**Lives in.** The shared filter bar on every list/triage surface ([Assets](#16-assets--protection-the-workhorse-table), Triage, product lenses) + the user menu ("My saved views"). Definitions in `views-store` (localStorage); the URL carries only the `view` id ([IA §6–7](04-information-architecture.md)).

**Primary entities.** `SavedView` ([IA §7.3 / domain §7.2](05-domain-model.md)), the six filter dimensions (Product, Client/Site, Status, Severity, Category, Time).

**User stories.**
- As an analyst, I want faceted filter chips across the six dimensions with live counts.
- As an analyst, I want to save the current filter set as a named view, pin it, and share it via deep link.
- As an analyst, I want a "modified" indicator when I diverge from a saved view, with Update / Save-as / Reset.
- As a lead, I want views scoped (global vs product-specific) so a BCDR view only offers in the BCDR lens.

**Surfaces & interactions** ([IA §7.2](04-information-architecture.md)):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [View: MSP-East • ▾]  [Product: BCDR ✕][Status: Failing ✕][Site: Denver ✕]    │
│ + Add filter            ⌕ q…                  [Update view][Save as…][Reset]   │
│ Showing 19 of 904       ☑ Bulk: [Retry][Run playbook ▾][Add to cart][Ticket]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Active filters are removable chips; the chip set **is** the view definition.
- "+ Add filter" opens a faceted `Popover`+`Command` with live counts across the six dimensions.
- The `•` modified indicator signals divergence from the saved view.
- Selecting a view writes `?view=<id>` and applies its filters; explicit URL params override stored filters ([IA §6.3](04-information-architecture.md)).
- Seeded views: "Failing — all products," "SaaS consent expiring (7d)," "BCDR offsite sync stalled," "My snoozed."

**States.**
- **No saved views (pre-seed):** seeded with 3–4 so the dropdown is never empty.
- **Modified:** `•` badge + Update/Save-as/Reset controls.
- **Zero results for a filter set:** "No assets match these filters" with a "Clear filters" affordance — not a blank table.
- **Shared view (read by a teammate via URL):** lands in the exact same scope/filters/sort.

**Data dependencies.** `views-store` (persisted), the asset/alert stores for live counts, nuqs URL parsers (`parseAsArrayOf`, deterministic comma-join), TanStack Table state wired to nuqs via `use-data-table`.

**Edge cases.**
- A `view` id pointing at a deleted view — fall back to defaults gracefully with a toast.
- Explicit param + view conflict — explicit params win and trigger "modified."
- A product-scoped view selected in the wrong lens — hidden from that dropdown.
- Multi-value filters must serialize deterministically (sorted) so two people building the same filter get the same URL (cacheable/shareable).

**Acceptance criteria.**
- [ ] All six filter dimensions render as faceted chips with live counts and are URL-encoded.
- [ ] A filter set saves as a named `SavedView`; pinning surfaces it; sharing is a deep link that reproduces the exact view.
- [ ] Modified indicator + Update/Save-as/Reset behave per precedence rules; explicit params override stored filters.
- [ ] View scope (global vs `product:<id>`) controls where a view is offered.
- [ ] Zero-result and deleted-view states degrade gracefully.
- [ ] Multi-value filters serialize deterministically.

---

## 13. Global Search & Command Palette

**Purpose.** Two distinct keyboard-first entry points — **omni-search** finds *things* (assets, incidents, clients, playbooks, error codes, IPs); the **command palette** runs *commands* (run playbook, go to client, retry backup, switch tenant).

**Persona / JTBD.** Keyboard-first tech/analyst: *"I know the hostname / error code / client — get me there in two keystrokes. Or: run this command without hunting through menus."*

**Lives in.** Top bar. Omni-search focused with `f`; command palette with `⌘K` / `Ctrl K` ([IA §3](04-information-architecture.md)).

**Primary entities.** Search index over `ProtectedAsset`, `Incident`, `Client`, `Playbook`, `RemediationAction`, error strings, IPs/IDs; command registry derived from `config/nav.ts` + action catalog.

**User stories.**
- As a tech, I want `f` to search assets/incidents/clients/playbooks/actions/error-codes/IPs with grouped type-ahead results.
- As a tech, I want `⌘K` to run commands ("Run playbook…", "Go to client…", "Retry backup on…", "Switch tenant", "Toggle dark mode").
- As a tech, I want navigation surfaced as commands too ("Go to Run History").

**Surfaces & interactions.**
- **Omni-search:** grouped type-ahead (Assets / Incidents / Clients / Playbooks / Error codes). Selecting navigates to the entity. `f` focuses from anywhere except while typing in a field.
- **Command palette:** action-oriented fuzzy list; categories for Run, Navigate, Switch, Toggle. Commands carry through to the relevant flow (e.g. "Run playbook…" opens the playbook picker → cart).
- Distinct surfaces, distinct shortcuts; both built on `Command` (Radix/shadcn).
- Mono rendering for IDs/IPs/error codes in results.

**States.**
- **Empty query:** recent items + suggested commands.
- **No results:** "No matches for '…'" with a hint (try an error code or hostname).
- **Loading (debounced index):** subtle inline spinner; never blocks typing.
- **Scoped:** respects current `?client` tenant scope (searching within a client narrows results), with an "all clients" toggle.

**Data dependencies.** In-memory search index over the mock stores; command registry; `config/nav.ts`; tenant scope. Keyboard handler that respects focus context (don't hijack `f` in inputs).

**Edge cases.**
- An error code matches many assets — group and show count, link to the filtered list.
- Search must find verbatim error strings/codes (`0x0000007B`, `AADSTS500014`, `Code 9999`) and ports/hosts (`3262`, `mothership.dtc.datto.com`).
- Command palette command targeting a specific asset ("Retry backup on…") needs an asset picker sub-step.
- Reduced-motion: no flashy open animation when `prefers-reduced-motion`.

**Acceptance criteria.**
- [ ] `f` opens omni-search (not while typing in a field); `⌘K`/`Ctrl K` opens the command palette; they are distinct surfaces.
- [ ] Omni-search returns grouped results across assets/incidents/clients/playbooks/actions/error-codes/IPs and navigates correctly.
- [ ] Command palette runs Run/Navigate/Switch/Toggle commands, including nav-as-commands.
- [ ] Verbatim error codes, ports, and hostnames are findable; IDs render mono.
- [ ] Both respect tenant scope and reduced-motion.

---

## 14. Per-product Views

**Purpose.** Specialized lenses of the same workhorse table for each of the six products — adding product-specific columns and detail tabs only where the domain genuinely diverges, while preserving one mental model.

**Persona / JTBD.** Tech working a product-specific problem: *"I need ZFS pool %, last screenshot, and offsite recency for BCDR — or OAuth/seat/throttle state for SaaS — without leaving the table model I already know."*

**Lives in.** `/products/bcdr`, `/products/endpoint-backup`, `/products/datto-cloud`, `/products/saas-protect`, `/products/spanning` (+ specialized child routes per [IA §8.2](04-information-architecture.md)). Nav: BY PRODUCT section, each with a worst-state dot + count.

**Primary entities.** Per product: `Appliance`/`ProtectedMachine`/`StoragePool`/`OffsiteSync` (BCDR), `EndpointAgent` (DEB v1/v2), `CloudDRWorkload` (Cloud), `SaaSTenant`/`SaaSSeat` (SaaS), `SpanningConnection`/`SpanningSeat` (Spanning).

**User stories.**
- As a tech, I want a product lens = the generic list with `product=<id>` pre-applied + that product's column preset + detail tabs.
- As a BCDR tech, I want an appliance roll-up and `/products/bcdr/appliances/[id]` for device health (ZFS, inverse chain, virtualization, offsite sync).
- As an endpoint tech, I want the v1-vs-v2 split and migration status.
- As a SaaS tech, I want per-service coverage (Exchange/SharePoint/OneDrive/Teams), OAuth/consent health, seat/license sync.
- As a junior, I want `/assets/[assetId]` to converge — same skeleton, product-appropriate facts.

**Surfaces & interactions** ([IA §8.2](04-information-architecture.md)):

| Product | Lens adds | Child routes |
|---|---|---|
| BCDR | Appliance roll-up, ZFS pool %, inverse-chain state, last screenshot/boot-test, offsite-sync recency, local-virt readiness | `/products/bcdr/appliances/[id]` |
| Endpoint Backup | DEB v1 vs v2 split, migration status, direct-to-cloud job health (no appliance) | — |
| Datto Cloud DR | Test-failover readiness, cloud-virt state, VPN/IPsec status, retention posture | — |
| SaaS Protect | Per-service coverage, OAuth/consent health, seat/license sync, Graph/Google throttle | `/products/saas-protect/tenants/[id]` |
| Spanning | Salesforce + M365 + Google connections, metadata backup, API rate-limit state, sandbox-seeding | `/products/spanning/connections/[id]` |

- The product filter is the seam — pre-applied on the lens, present on every cross-product surface.
- Actions are product-scoped in the catalog but invoked through the same cart/playbook machinery ([IA §8.3](04-information-architecture.md)).

**States.**
- **Empty (client doesn't use this product):** "No <product> assets for this tenant" with a connections link.
- **Loading / error / partial:** same as the workhorse table.
- **Migration lens (Endpoint):** v1 sunset countdown; dual-portal (Partner Portal vs UniView) note.

**Data dependencies.** Same asset store filtered by product; product-specific facet fields ([domain §3.1](05-domain-model.md)); appliance/tenant/connection sub-entities; shared `/assets/[assetId]` detail with product preset.

**Edge cases.**
- Endpoint v1 and v2 coexist for one client — the split must be explicit (different consoles, retention sunset).
- SaaS seat with tenant-level consent failure — show the tenant auth state on the seat row (inherited), not a misleading per-seat-only state.
- Appliance offline cascades to all its protected machines — the lens must show the appliance as the root cause, not N separate agent failures.
- Convergence: a SaaS seat and a BCDR agent resolve through the same `/assets/[assetId]` skeleton ([IA §8.2 open decision](04-information-architecture.md)).

**Acceptance criteria.**
- [ ] Each lens = the workhorse table with `product` pre-applied + the documented column preset.
- [ ] Product-specific facets render per `kind`; irrelevant concepts (e.g. boot tests for SaaS) are absent, not empty.
- [ ] Specialized child routes (appliance/tenant/connection detail) exist and link from the lens.
- [ ] `/assets/[assetId]` converges across products with product-appropriate content.
- [ ] Product-scoped actions are offered only on matching assets but run through the shared cart/playbook engine.
- [ ] The `product` filter is pre-applied on lenses and present on all cross-product surfaces.

---

## 15. Notifications

**Purpose.** A single feed of things needing the tech's attention — new incidents, completed/failed runs awaiting review, approvals pending *my* sign-off, overnight auto-remediation actions — each linking to its detail.

**Persona / JTBD.** Tech/approver: *"Tell me what happened while I was away and what needs my decision now — with one click to the detail."*

**Lives in.** Top-bar notifications dropdown (`◔` with worst-severity count badge), [IA §3](04-information-architecture.md). Channel routing config at `/setup/notifications`.

**Primary entities.** Notification feed items derived from `Incident`, `RunRecord` (terminal states), `PendingApproval`, `AutomationPolicy` fires, plus `NotificationRule` (routing config).

**User stories.**
- As a tech, I want new incidents, completed/failed runs, pending-my-approval items, and overnight auto-remediations in one feed.
- As an approver, I want pending approvals surfaced here (and to act on them inline — see [Approvals](#9-approvals)).
- As a tech, I want each notification to deep-link to the relevant detail.
- As a lead, I want to configure routing of incidents/run outcomes to channels (in-app/Slack/Teams/email — mock).

**Surfaces & interactions.**
- Dropdown feed grouped by type (Incidents / Runs / Approvals / Auto-remediations), severity-colored, with relative timestamps.
- Approval items render the actionable approval card inline.
- Each item links to its detail (incident, run, asset, policy fire).
- Worst-severity count badge; unread state; mark-as-read.
- `/setup/notifications`: `NotificationRule` routing (which event types → which channels). Mock channels log to the in-app center.

**States.**
- **Empty:** "You're all caught up."
- **Unread:** count badge + bold items.
- **Pending approval present:** approval section pinned to top (it's time-sensitive with a countdown).
- **Loading:** feed skeleton.

**Data dependencies.** Derives from incident/run/approval/policy stores + `NotificationRule` config. Sonner toasts fire on terminal run states ([engine §8.3](07-troubleshooting-and-automation-engine.md)) independently of this feed; the feed is the durable record.

**Edge cases.**
- A fleet incident must produce one notification, not N (respect incident grouping).
- An auto-remediation that ran overnight under a policy must appear as a single "policy fired: N assets healed" item with a link to the run.
- A pending approval that times out while unread updates in place (no stale "approve" button).
- Reduced-motion: no animated badge pulse.

**Acceptance criteria.**
- [ ] The feed aggregates incidents, terminal runs, pending approvals, and policy fires, grouped and severity-ordered.
- [ ] Pending approvals are actionable inline and pinned with a countdown.
- [ ] Every item deep-links to its detail; fleet incidents produce a single item.
- [ ] Worst-severity count badge and unread/mark-read work.
- [ ] `/setup/notifications` routing config persists and (mock) routes to the in-app center.
- [ ] Sonner toasts and the durable feed are consistent for run terminal states.

---

## 16. Assets & Protection (the workhorse table)

**Purpose.** The one re-scoped table every protected entity flows through — dense, sticky, with a last-10 dot-strip, faceted filters, saved views, and a bulk toolbar feeding the action cart. The foundation features 1/2/12/14 re-scope.

**Persona / JTBD.** Tech/analyst: *"Show me every protected asset across all products in one table I already understand; let me filter to the failing cohort, select it, and remediate in bulk."*

**Lives in.** `/assets` (cross-product) and, re-scoped, in every product lens and cohort drill ([IA §1, §8](04-information-architecture.md)). Asset rows link to [Asset Detail](#3-asset-detail-timeline--evidence--inline-remediation). Nav: WORK › Assets & Protection, with a failing count.

**Primary entities.** `ProtectedAsset` (all kinds), `BackupRunSummary` (dot-strip), `Alert` (status), `SavedView`.

**User stories.**
- As a tech, I want one table model across all six products with `product` as a column/filter.
- As a tech, I want the last-10-backups dot-strip per row for at-a-glance recency.
- As a tech, I want faceted filters + saved views + URL state so the view is shareable.
- As a tech, I want checkbox multiselect + a bulk toolbar (Retry, Run playbook, Add to cart, Ticket) that operates on the selected cohort.
- As a tech, I want a quick-peek Sheet (`?peek=`) to inspect without leaving the list.

**Surfaces & interactions** (TanStack Table; dense; sticky header/first column):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☐ │ Status   │ Asset (host/UPN/org) │ Client │ Product │ Last good │ Last 10  │
│ ☐ │ ● Failed │ ACME-DC01            │ Acme   │ BCDR    │ 6h ago    │ ●●●○●●●●●●│
│ ☐ │ ▲ Warn   │ jdoe@acme            │ Acme   │ SaaS    │ 2h ago    │ ●●●●●●●●●●│
│ ☑ │ ◷ Sync   │ NWND-SQL02           │ Northw │ BCDR    │ running   │ ●●●●●●●●●◷│
└──────────────────────────────────────────────────────────────────────────────┘
  ☑ 1 selected   Bulk: [Retry][Run playbook ▾][Add to cart][Open ticket]
```

- Status column = dot + icon + label (never color-only); columns adapt per product preset in lenses.
- Dot-strip = last-10 `BackupRunSummary` with status tokens; a `Syncing` dot animates during active runs.
- Bulk toolbar appears on selection; operates on the arrived-with cohort; feeds the [cart](#5-action-chain--cart)/playbook with `once-selected` scope.
- Sort/filter/page/peek/view all in the URL via nuqs + `use-data-table`.

**States.**
- **Empty (no assets / filtered to none):** distinct messages for "no assets" vs "no matches for filters" (with Clear).
- **Loading:** row skeletons; sticky header stays.
- **Error:** retry banner; preserves filters + selection where safe.
- **Partial (assets mid-classification):** status shows "Diagnosing"; not blank.
- **Selection active:** bulk toolbar; selection count; "select all matching" (across pages) vs "select page."

**Data dependencies.** Asset store (filtered/sorted/paged via mock query), run summaries, alert→status derivation (worst real child), saved-view + nuqs state, cart store (bulk add). Tenant scope from `?client`.

**Edge cases.**
- "Select all matching" across pages must snapshot the resolved set for `once-selected`, not just the visible page.
- A row whose asset is part of a fleet incident — surface the incident rather than implying isolated remediation.
- Mixed-product selection feeding a bulk playbook — validate each asset against the playbook's target kinds before run.
- Dot-strip for a just-onboarded asset (fewer than 10 runs) — render partial strip, not fake placeholders.
- Cosmetic warning rows sort below real failures and render desaturated.

**Acceptance criteria.**
- [ ] One table component renders at fleet, client, product, and cohort scope with a consistent model.
- [ ] Status renders dot+icon+label; dot-strip shows last-10 with correct tokens and handles <10 runs.
- [ ] Faceted filters, saved views, sort, pagination, peek are URL-encoded and shareable.
- [ ] Multiselect + bulk toolbar feed the cart/playbook with `once-selected` scope; "select all matching" snapshots the full set.
- [ ] Empty/loading/error/partial/selection states render correctly.
- [ ] Rows link to `/assets/[assetId]`; `?peek=` opens the summary Sheet without navigation.

---

## 17. Open decisions / flags

These surface decisions raised by the grounding docs that affect multiple features here; resolve before/while building.

1. **Chain builder: linear list vs canvas.** This spec assumes the recommended **linear step list with collapsible branch groups** ([engine §13.1](07-troubleshooting-and-automation-engine.md)), with a canvas as a later phase. The cart/chain feature (#5) is specified to that model. Confirm the phase-1 scope.
2. **Reactive policy triggers.** Automation Policies (#8) support `consecutive-failures` and `cron`; truly reactive (within-seconds) triggers need a mock event bus ([engine §13.2](07-troubleshooting-and-automation-engine.md), flagged for [11-tech-architecture](11-tech-architecture.md)). Phase-1 may simulate triggers on a timer.
3. **Cross-tenant policy/view RBAC.** Scope (#6), Policies (#8), and Saved Views (#12) reference `scopeTags`/`shared` but the MSP RBAC enforcement model (who sees/edits which clients' policies/views) is undefined ([engine §13.3](07-troubleshooting-and-automation-engine.md); [personas-and-jobs](01-personas-and-jobs.md)). Default assumption: org-wide visibility, `canApprove` gates decisions.
4. **Cosmetic-failure sub-state.** Triage (#2), Asset Detail (#3), and the table (#16) all depend on a derived "cosmetic/known-limitation" sub-state that renders Warning/info, not Failed ([catalog open #2](02-failure-catalog.md)). Confirm with design how it tokenizes (desaturated Warning).
5. **Per-product detail convergence.** Per-product Views (#14) and Asset Detail (#3) assume product child-detail routes redirect into the unified `/assets/[assetId]` with a product preset ([IA §8.2 / §9 open decision](04-information-architecture.md)). Confirm whether appliances/tenants are first-class assets or parents-of-assets before finalizing the detail skeleton.
6. **EWS→Graph deadline (2026-05-30) is past** relative to `currentDate` 2026-06-22. Triage (#2), Asset Detail (#3), and the SaaS lens (#14) should model both pre- and post-deadline states (some tenants reauthorized, some Exchange backups now stopped) so the bulk-reauth queue demo is realistic ([catalog open #4](02-failure-catalog.md)).
