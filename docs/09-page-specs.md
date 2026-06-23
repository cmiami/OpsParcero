# 09 — Page Specs

Page-by-page, wireframe-level layout specs for every screen in the Kaseya Resolution Center — app-shell composition, organisms/molecules each page assembles, data shown, actions, filters/saved-views, states, responsive behavior, and a11y.
Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

---

## 0. How to read this doc

This is the **layout** layer. Where [information architecture](04-information-architecture.md) says *where a thing routes* and [feature specs](08-feature-specs.md) say *what a feature must do and when it is correct*, this doc says *how each screen is laid out, which components fill which region, and what the wireframe is*. Build a page by:

1. Reading its **route + persona + journey** (this doc, top of each section).
2. Wrapping it in the **template** it composes (`AppShell` / `ListPageTemplate` / `DetailPageTemplate` / `TriageTemplate` — [component inventory §5](10-component-inventory.md)).
3. Filling the named **regions** with the organisms/molecules listed (every one already specced in the [component inventory](10-component-inventory.md)).
4. Wiring **URL state** via nuqs per [IA §6](04-information-architecture.md) and **transient state** via Zustand per [IA §6.2](04-information-architecture.md).
5. Implementing all five **states** (empty / loading / error / partial / success).

### 0.1 Conventions for every wireframe below

- ASCII wireframes show **only the routed content** unless the shell is load-bearing; the persistent shell (sidebar + top bar + cart) is specified once in [§1](#1-the-app-shell-every-page) and assumed thereafter.
- Component names in `CamelCase` reference the [component inventory](10-component-inventory.md) (e.g. `DataTable`, `RemediationPanel`, `FleetRollup`). Token names (`--primary`, `bg-card`, `--status-failed`) reference the [design system](03-design-system.md). **Never** hardcode hex in page code.
- Every list/triage page inherits the **shared filter bar** ([§2](#2-shared-filter-bar-cross-cutting)) and the **bulk toolbar** ([component inventory §4.2](10-component-inventory.md)); they are specced once and referenced.
- States are mandatory: a page is not shippable until empty / loading (`loading.tsx` skeleton, never a center spinner — impeccable ban) / error (region-local retry) / partial / success all render.
- **Severity sort is law** everywhere: `Failed > Warning > Offline > Syncing > Paused > Protected`; fleet rollups show the worst **real** child state ([design system §8](03-design-system.md)).
- **No dead-end reds:** every failure surface on every page offers a one-click path to context → cause → fix.

### 0.2 Page index

| # | Page | Route | Template | Default landing? |
|---|---|---|---|---|
| 3 | [Triage Queue](#3-triage-queue) | `/triage` | TriageTemplate | **Yes** (`/` → `/triage`) |
| 4 | [Incident Detail](#4-incident-detail) | `/triage/[incidentId]` | DetailPageTemplate | — |
| 5 | [Overview / Fleet Health](#5-overview--fleet-health) | `/overview` | AppShell (custom regions) | — |
| 6 | [Assets & Protection](#6-assets--protection-the-workhorse-list) | `/assets` | ListPageTemplate | — |
| 7 | [Asset Detail](#7-asset-detail) | `/assets/[assetId]` | DetailPageTemplate | — |
| 8 | [Per-product lenses](#8-per-product-lenses) | `/products/[product]` | ListPageTemplate | — |
| 8a | [Appliance / Tenant / Connection detail](#8a-specialized-child-detail-pages) | `/products/.../[id]` | DetailPageTemplate | — |
| 9 | [Automation & Playbook Library](#9-automation--playbook-library) | `/automation` | ListPageTemplate (tabbed) | — |
| 10 | [Playbook Detail / Editor](#10-playbook-detail--editor) | `/automation/playbooks/[id]` | DetailPageTemplate | — |
| 11 | [Automation Policy Editor](#11-automation-policy-editor) | `/automation/policies/[id]` | DetailPageTemplate | — |
| 12 | [Run History & Audit](#12-run-history--audit) | `/automation/runs` | ListPageTemplate (tabbed) | — |
| 13 | [Run Detail](#13-run-detail) | `/automation/runs/[id]` | DetailPageTemplate / Sheet | — |
| 14 | [Reports](#14-reports) | `/reports` + `/reports/[id]` | AppShell (custom regions) | — |
| 15 | [Setup](#15-setup) | `/setup/*` | ListPageTemplate (tabbed) | — |
| 16 | [Global Search results](#16-global-search-results) | top-bar overlay | (overlay) | — |
| 17 | [Command Palette](#17-command-palette) | `⌘K` overlay | (overlay) | — |
| 18 | [Action Cart](#18-action-cart-global-overlay) | global Sheet | (overlay) | — |
| 19 | [Asset Quick-Peek](#19-asset-quick-peek-global-overlay) | `?peek=` Sheet | (overlay) | — |

> The **signature troubleshooting flow** (red status → evidence → inline remediation → scope → apply) is shown concretely on [Triage](#3-triage-queue) → [Incident detail](#4-incident-detail) → [Asset detail §7.4](#74-the-signature-troubleshooting-flow-concrete) → [Scope/Execute](#74-the-signature-troubleshooting-flow-concrete) → [Run detail](#13-run-detail). Read those four in order to see it end-to-end.

---

## 1. The app shell (every page)

Every authenticated route renders inside the `(console)/layout.tsx` persistent shell (`AppShell` template, [component inventory §5](10-component-inventory.md)). It **never re-mounts on navigation**, so sidebar counts, tenant context, and the action-cart badge survive route changes. Specced once here; assumed by every page below.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ TopBar  [≡] Kaseya Resolution Center · Triage / SQL Tier-1   [⌕ Search  f]   ◔3  ⌘K  ◑  ⏷│  h-14 bg-card border-b
├──────────────┬───────────────────────────────────────────────────────────────────┤
│ AppSidebar   │  ROUTED CONTENT (this doc specs each page's content region)         │
│ (white nav) │                                                                     │
│ [Tenant ▾]   │   ┌─ FilterBar / page header (per template) ──────────────────────┐ │
│ WORK         │   │ …                                                             │ │
│  ⌂ Overview  │   └───────────────────────────────────────────────────────────────┘ │
│  ◎ Triage ⟨14⟩│   ┌─ primary surface (table / detail / timeline / charts) ───────┐ │
│  ▦ Assets    │   │ …                                                             │ │
│ BY PRODUCT   │   │                                                               │ │
│  ▣ BCDR  ●19 │   │                                                               │ │
│  ▣ Endpoint  │   └───────────────────────────────────────────────────────────────┘ │
│  …           │                                                                     │
│ AUTOMATE …   │                                                              [Cart▸]│
│ ANALYZE …    │                                                                     │
│ ─────        │                                                                     │
│ 🛒 Cart ⟨3⟩  │                                                                     │
└──────────────┴───────────────────────────────────────────────────────────────────┘
```

| Region | Component | Token / behavior |
|---|---|---|
| Sidebar | `AppSidebar` | `bg-sidebar` (nav shell, **never** flips in dark mode), `w-60` expanded / `w-16` collapsed; nav from `config/nav.ts`; live badges = worst-state dot + count. |
| Tenant switcher | (part of `AppSidebar`) | `Popover`+`Command` combobox; writes `?client=<id>`; re-scopes whole app ([IA §2.4](04-information-architecture.md)). |
| Top bar | `TopBar` | `Breadcrumb` (left, from `nav.ts` + route), `SearchField` (center, `f`), notifications bell + `Avatar` (right). `bg-card`, hairline bottom border, no shadow. |
| Cart entry | (sidebar bottom + top bar badge) | opens [Action Cart](#18-action-cart-global-overlay) Sheet; badge hidden at 0. |
| Toaster | `<Toaster>` (Sonner) | bottom-right; 4px left status stripe; errors `duration={Infinity}`. |

**Responsive:** ≥1280px = sidebar expanded. 768–1279px = sidebar auto-collapses to icon rail (state in `ui-store`). <768px = sidebar becomes an off-canvas `Sheet` opened by `[≡]`; top-bar search collapses to an icon that opens a full-width search overlay.

**a11y:** `<nav aria-label="Main navigation">`; skip-to-content link as first focusable; tenant switcher and cart are keyboard reachable; theme respects `prefers-color-scheme` until overridden.

---

## 2. Shared filter bar (cross-cutting)

Every list/triage/lens page mounts the same filter bar (the [saved-views feature](08-feature-specs.md#12-saved-views--filtering) / [IA §7.2](04-information-architecture.md)). Specced once; referenced by pages [3](#3-triage-queue), [6](#6-assets--protection-the-workhorse-list), [8](#8-per-product-lenses), [12](#12-run-history--audit).

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [View: MSP-East • ▾]  [Product: BCDR ✕] [Status: Failing ✕] [Site: Denver ✕]      │  ← FilterChip row
│ + Add filter           ⌕ q…                       [Update view] [Save as…] [Reset] │  ← SearchField + view ctrls
│ Showing 19 of 904      ☑ Bulk: [Retry] [Run playbook ▾] [Add to cart] [Open ticket]│  ← count + BulkToolbar
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Element | Component | Notes |
|---|---|---|
| Saved-view selector | (custom, in filter bar) | `View: <name> [•] ▾`; `•` = modified-from-saved badge; lists global + product-scoped + team-shared views. Writes `?view=<id>`. |
| Active filters | `FilterChip` (dismissible) | One chip per active dimension; the chip set **is** the view definition. `✕` removes; removal updates URL + count. |
| Add filter | `Popover` + `Command` | Faceted picker across the six dimensions (Product · Client/Site · Status · Severity · Category · Time) with **live counts** from fixtures. |
| In-table search | `SearchField` | `q` param, debounced; matches host/UPN/org/error-code/IP. |
| View controls | `Button` (outline/ghost) | `Update view` (write back) · `Save as…` · `Reset`. Disabled when not modified. |
| Result count | text | `Showing N of M` — `text-muted-foreground`, mono numerals. |
| Bulk toolbar | `DataTableBulkToolbar` | appears on selection only; inverted-primary (`bg-primary text-primary-foreground`); feeds [cart](#18-action-cart-global-overlay) with `once-selected` scope. |

**States:** never-empty view dropdown (3–4 seeded views); zero-result → "No assets match these filters" + `Clear filters`; deleted-view id → fall back to defaults + toast.
**a11y:** filter chips are buttons with `aria-label="Remove filter: Product BCDR"`; bulk toolbar is `role="toolbar" aria-label="bulk actions"`; result count is an `aria-live="polite"` region so screen readers hear count changes.

---

## 3. Triage Queue

**Route:** `/triage` (default landing; `/` redirects here). **Template:** `TriageTemplate`.
**Persona / journey:** NOC analyst / tech at 2 a.m. — *"a wall of red appeared; show me the few root causes, severity-ordered, and let me fix causes not symptoms."* This is the home surface ([IA §0](04-information-architecture.md)).
**Primary entities:** `Incident` (grouped `Alert`s), `Alert`, `FailureMode`, suggested `Playbook`/`RemediationAction`.

### 3.1 Layout (split: queue left, diagnosis right)

`TriageTemplate` is a two-pane split — `AlertTriageList` (left, the incident queue) + `RemediationPanel`/diagnosis preview (right, populated when an incident is focused). On <1024px the right pane collapses and selecting an incident routes to [Incident Detail](#4-incident-detail).

```
┌─ FilterBar (§2: Sev, Product, Category, q, View) ────────────────────────────────┐
├──────────────────────────────────────────────┬───────────────────────────────────┤
│ AlertTriageList                               │ RemediationPanel (preview rail)   │
│ ● P1 Backup failing — SQL Tier-1   14 · 3 cl  │ ▸ SQL Tier-1 — agent 7.4.2        │
│    likely: agent 7.4.2 regression  Grouping ⟳ │   regression                      │
│    [Investigate ↗]                            │  WHY: 14 agents crash-consistent  │
│ ▲ P2 Off-site sync behind — Globex  3 appls   │   since 7.4.2 push (02:14)         │
│    likely: transmit limit too low             │  EVIDENCE "VSS failed to prepare"  │
│ ● P1 OAuth consent expired — 7 M365 7 tenants │   code BKP1410 (mono)             │
│    EWS→Graph reauth · past due                │  SUGGESTED FIX                    │
│ ◻ P3 Screenshot cosmetic — TERMSRV  1 (known) │   💡 Rollback agent → 7.4.1       │
│ ─────────────────────────────────────────────│   risk low · ~3 min · reversible  │
│ ☑ 1 selected                                  │   ApplyScopeControl: ● 14 cohort  │
│ Bulk:[Run playbook▾][Add to cart][Ack][Snooze]│   [Dry-run] [Apply] [Save as…]   │
└──────────────────────────────────────────────┴───────────────────────────────────┘
```

### 3.2 Regions & components

| Region | Component(s) | Data shown |
|---|---|---|
| Filter bar | shared [§2](#2-shared-filter-bar-cross-cutting) | `sev`, `product`, `category`, `q`, `view` chips; live counts. |
| Queue list | `AlertTriageList` of `AlertTriageRow` | per incident: `SeverityChip` (P0–P3), title, affected count (`14 assets · 3 clients`), likely cause, age, `Grouping Now ⟳` (`--status-syncing`) if count rising, `[Investigate ↗]`. Rows expandable for inline cohort preview. |
| Diagnosis rail | `RemediationPanel` | on focus: why-grouped, shared "what changed" timeline excerpt, verbatim error (`MonoLabel`), top suggested `Playbook` with `ApplyScopeControl` defaulted to the incident cohort + Dry-run/Apply/Save. |
| Bulk toolbar | `DataTableBulkToolbar` | on selection: `Run playbook ▾`, `Add to cart`, `Acknowledge`, `Snooze 4h` — scoped to the incident cohort. |

**Grouping/sort (the core):** incident-first, severity-sorted `P0>P1>P2>P3`, then occurrence count, then recency; `isCosmetic` alerts sort below real failures and render desaturated Warning/info, never red ([feature spec §2.1](08-feature-specs.md#21-grouping-dedup--severity-the-core)). The sidebar Triage badge counts open incidents needing me at worst-severity color; cosmetic-only incidents never inflate it.

**Actions:** Investigate (→ [Incident Detail](#4-incident-detail)) · Run suggested playbook (→ cart, cohort-scoped) · Add cohort to cart · Acknowledge · Snooze 4h · (per-row) Open ticket.

**Filters / saved-views:** `sev`, `product`, `category`, `q`, `view` in URL. Seeded views include "Failing — all products," "SaaS consent expiring (7d)," "My snoozed."

**States:**
- **Empty (clean fleet):** calm "Inbox zero — nothing needs you right now" with a link to [Overview](#5-overview--fleet-health); not a blank table.
- **Loading:** `loading.tsx` skeleton rows with `SeverityDot` placeholders; rail shows skeleton.
- **Error:** retry banner; preserves filter chips.
- **Partial:** unclassified alerts pinned at bottom as "Needs classification" (generic category), never hidden.
- **Recently resolved:** auto-resolved incidents move to a collapsed "Recently resolved" section, not vanish.

**Responsive:** ≥1024px split view. <1024px = list-only; tapping a row routes to `/triage/[incidentId]`; bulk toolbar becomes a sticky bottom bar.

**a11y:** queue is an ordered list with severity in text + dot + icon (`SeverityChip`), never color-only; `aria-live="polite"` on the `Grouping Now` count and the queue-length change; rail focus moves to the suggested-fix heading on incident select.

---

## 4. Incident Detail

**Route:** `/triage/[incidentId]`. **Template:** `DetailPageTemplate`.
**Persona / journey:** tech who clicked **Investigate** — *"why are these grouped, what changed, who's affected, and what's the fix to run in bulk?"*
**Primary entities:** `Incident`, member `Alert`s, `FailureMode`, affected cohort, suggested `Playbook`s.

```
◀ Triage / Backup failing — SQL Tier-1            ● P1  inc_8821 · Acme +2 clients
┌─ Health header ──────────────────────────────────────────────────────────────────┐
│ ● P1 Backup failing — SQL Tier-1   14 assets · 3 clients · first seen 12m · Grouping⟳│
│ [Investigate cohort ↗] [Run suggested playbook] [Add cohort to cart] [Ack][Snooze] │
├──────────────────────────────────┬───────────────────────────────────────────────┤
│ WHY GROUPED                       │ SUGGESTED PLAYBOOKS (ranked by confidence)     │
│ Shared FailureMode:               │ 1 Rollback agent 7.4.2→7.4.1  conf: high      │
│  bcdr.agent-version-regression    │   risk low · ~3 min · reversible  [Run ▸]     │
│ All 14 first failed within 6 min  │ 2 Reset VSS + Retry          conf: medium     │
│ of the 7.4.2 push.                │   [Run ▸]                                      │
├──────────────────────────────────┤ ─────────────────────────────────────────────│
│ WHAT CHANGED (shared timeline)    │ AFFECTED COHORT (14)            [View all ↗]  │
│ • 02:14 agent 7.4.2 pushed (RMM)  │  ● ACME-DC01   ● ACME-SQL02  ▲ NWND-SQL01 …  │
│ • 02:20 first VSS failure         │  (mini AssetTable preview, link to            │
│ • 02:31 grouped into incident     │   /assets?incident=inc_8821)                  │
└──────────────────────────────────┴───────────────────────────────────────────────┘
```

| Region | Component | Data |
|---|---|---|
| Health header | `DetailPageTemplate` header + `SeverityChip` | severity, title, cohort counts, first-seen, `Grouping Now`; primary CTAs. |
| Why grouped | `Card` + `MonoLabel` | shared `FailureMode` id, correlation reason ("all within 6 min of push"). |
| What changed | `AssetTimeline` (shared) | correlated config/update/reboot events vs first failure. |
| Suggested playbooks | `PlaybookCard` list (compact) | ranked by confidence; each `Run ▸` opens cart cohort-scoped. |
| Affected cohort | mini `AssetTable` | preview of members; `View all ↗` → `/assets?incident=inc_8821`. |

**Actions:** Investigate cohort (→ [`/assets?incident=`](#6-assets--protection-the-workhorse-list)) · Run suggested playbook (cohort-scoped, → cart) · Add cohort to cart · Acknowledge · Snooze · Open ticket.

**States:** loading (header + region skeletons); auto-resolved incident shows a resolved banner + reconciliation link; snoozed shows "snoozed until …"; an asset in two incidents appears under both.
**a11y:** ordered timeline with real timestamps; `Run` buttons name the playbook + scope count; resolved/snoozed states announced via `role="status"`.

---

## 5. Overview / Fleet Health

**Route:** `/overview`. **Template:** `AppShell` with custom, deliberately **non-uniform** regions (impeccable bans the identical-card grid and the hero-metric template).
**Persona / journey:** service manager / lead (and shift-starting NOC analyst) — *"in one glance, is the fleet healthy, where is it degrading, and what's trending worse?"* Read-only by contract; reached deliberately (not the landing).
**Primary entities:** derived `StatusRollup`, `Incident`, `Client`/`ProtectedAsset` aggregates, `Run` stats, SLA/RPO aggregates.

```
┌─ Fleet health rollup (clickable segments) ───────────────────────────────────────┐
│ Fleet health   Protected 812 · Warning 47 · Failed 19 · Offline 11                │  FleetRollup (donut + SeverityChips)
│ [████████████████░░░░]  worst-real-child; each segment → /assets?status=…          │
├──────────────────────────────────┬───────────────────────────────────────────────┤
│ Active incidents (2)              │ Recency at risk                               │
│ ◉ Pod-EU3 throttling · 7 tenants  │ No good backup in 24h: 14  → /assets?…        │
│ ◉ Appliance reboot · 1 site       │ 48h: 5 · 7d: 2   (sparkline, stale count 7d)  │
│ [View incident ↗]                 │                                               │
├──────────────────────────────────┼───────────────────────────────────────────────┤
│ SLA / RPO posture                 │ Automation this week                          │
│ Within RPO 96.2%   breaches 8 ↗   │ Runs 142 · auto-healed 38 · approvals 6       │
│ (KpiTile + small bar)             │ Top playbook: VSS Reset (22 runs)             │
└──────────────────────────────────┴───────────────────────────────────────────────┘
```

| Region | Component | Data / link target |
|---|---|---|
| Fleet rollup | `FleetRollup` (donut + `SeverityChip` row) | worst-real-child counts; **each segment is a `<Link>`** to `/assets?status=<segment>`. The primary control. |
| Active incidents | `Card` + incident rows | up to N active `Incident`s; row → `/triage/[incidentId]`. Shows the *incident* count, not inflated per-asset alerts. |
| Recency at risk | `Card` + `KpiTile` + sparkline | assets with no good backup in 24h/48h/7d; each → `/assets?lastGoodOlderThan=…`. |
| SLA / RPO posture | `KpiTile` + small bar | % within RPO; breaches → `/assets?rpoBreached=true` (shared computation with [Reports](#14-reports)). |
| Automation this week | `KpiTile` row | runs / auto-healed / approvals / top playbook → `/automation/runs`. |
| Per-product mini-rollups (optional strip) | `SeverityChip` per product | each → `/products/[product]`. |

**Actions:** none mutating — Overview is read-only by contract. Every number/segment is a drill link carrying URL params matching the displayed cohort.

**States:**
- **Empty (fresh tenant):** "No protected assets yet" → Setup/Connections; no fake zeros painted red.
- **Loading:** `loading.tsx` per-region skeleton; bar shimmer; no layout shift on hydrate.
- **Error:** **per-region** inline retry card — one failing region never blanks the page.
- **All-healthy:** rollup all `--status-protected`; incident/recency regions show calm "All clear — no active incidents," not absence.

**Responsive:** 2-col region grid ≥1024px → single column stacked below; donut shrinks; sparklines hide on <480px. KPI groups go 4-up → 2-up → 1-up.
**a11y:** donut pairs every segment with a legend label + count text and a data-table fallback (`aria-describedby`); segment links have `aria-label="19 failed assets, view list"`; read-only page has no actionable controls beyond links.

---

## 6. Assets & Protection (the workhorse list)

**Route:** `/assets` (and re-scoped in every product lens and cohort drill). **Template:** `ListPageTemplate`.
**Persona / journey:** tech/analyst — *"show me every protected asset across all products in one table I already know; filter to the failing cohort, select it, remediate in bulk."* This is the **one re-scoped table** features 1/2/8 reuse ([feature spec §16](08-feature-specs.md#16-assets--protection-the-workhorse-table)).
**Primary entities:** `ProtectedAsset` (all kinds), `BackupRunSummary` (dot-strip), `Alert` (status), `SavedView`.

```
┌─ Page header: "Assets & Protection"   KpiTile row: Failed 19 · Warning 47 · …  ──┐
├─ FilterBar (§2) ─────────────────────────────────────────────────────────────────┤
├──────────────────────────────────────────────────────────────────────────────────┤
│ AssetTable (TanStack; sticky header + sticky first col)                           │
│ ☐│Status   │Asset (host/UPN/org)│Client │Product│Last good│Last 10    │Actions    │
│ ☐│● Failed │ACME-DC01 (mono)    │Acme   │BCDR   │6h ago   │●●●○●●●●●● │⋯          │
│ ☐│▲ Warn   │jdoe@acme (mono)    │Acme   │SaaS   │2h ago   │●●●●●●●●●● │⋯          │
│ ☑│◷ Syncing│NWND-SQL02 (mono)   │Northw │BCDR   │running  │●●●●●●●●●◷ │⋯          │
│ ☐│◻ Cosm.  │TERMSRV01 (desat.)  │Globex │BCDR   │1h ago   │●●●●●●●●●● │⋯          │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ☑ 1 selected   Bulk:[Retry][Run playbook▾][Add to cart][Open ticket]   Pagination │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Column | Cell component | Notes |
|---|---|---|
| select | `Checkbox` | sticky-left with name; "select page" vs "select all matching." |
| Status | `StatusBadge` | dot + icon + label, never color-only; cosmetic = desaturated Warning. |
| Asset | `MonoLabel` + name | host / UPN / org per kind; sticky-left; links to [Asset Detail](#7-asset-detail). |
| Client / Site | text + `building-2` | tenant scope; absent column when `?client` is pinned. |
| Product | `ProductBadge` | icon, never per-product color. |
| Last good | relative time (mono) | `lastGoodAt`; "running" when syncing; "never" if unseeded. |
| Last 10 | `Last10DotStrip` | last-10 `BackupRunSummary`; live `Syncing` dot animates during runs; partial strip if <10. |
| Actions | `DropdownMenu` (ghost ⋯) | per-row: Open detail, Peek (`?peek=`), Retry, Run playbook, Add to cart, Open ticket. |

**Column presets:** the generic list shows the columns above; product lenses ([§8](#8-per-product-lenses)) swap in product-specific columns via the same `AssetTable` with a column preset. Column picker popover persists `columnVisibility` to `localStorage`.

**Actions:** bulk `Retry` / `Run playbook ▾` / `Add to cart` / `Open ticket` (feed cart with `once-selected`); per-row `⋯`; row click → detail; `?peek=` → [Quick-Peek](#19-asset-quick-peek-global-overlay).

**Filters / saved-views:** all six dimensions + `sort`, `page`, `pageSize`, `peek`, `view`, cohort linkage (`incident`/`policy`) in URL ([IA §6.1](04-information-architecture.md)). Arriving via `?incident=inc_8821` pre-filters to that cohort and shows a context chip ("From incident: SQL Tier-1 ✕").

**States:**
- **Empty — no assets:** "No protected assets" + Connections link.
- **Empty — no matches:** "No assets match these filters" + `Clear filters` (distinct copy from no-assets).
- **Loading:** row skeletons; sticky header stays.
- **Error:** retry banner; preserves filters + safe selection.
- **Partial:** mid-classification rows show "Diagnosing" status, not blank.
- **Selection active:** bulk toolbar; "select all matching" snapshots the **resolved** set (across pages), not just the visible page.

**Edge cases:** a row in a fleet incident surfaces the incident (link up) rather than implying isolated remediation; mixed-product bulk playbook validates each asset against the playbook's target kinds before run; cosmetic rows sort below real failures.

**Responsive:** ≥1024px full columns. 768–1023px = hide Client/Site + collapse Actions into `⋯`. <768px = card-row layout (`Status` + name + `Last10DotStrip` + last-good stacked); bulk toolbar sticky-bottom.
**a11y:** `<caption>` for SR context; `aria-sort` on sortable `<th>`; `Last10DotStrip` exposes a visually-hidden "7 of 10 backups succeeded" summary; selected rows get `bg-primary/8` + 2px left primary border (not color-only — also reflected in checkbox state + a row `aria-selected`).

---

## 7. Asset Detail

**Route:** `/assets/[assetId]` tabbed (`?tab=overview|timeline|points|alerts|runs|actions`). **Template:** `DetailPageTemplate` (health header + tabs + `RemediationPanel` rail).
**Persona / journey:** tech with one failing asset open — *"why is this red, what changed, show evidence, and let me dry-run and apply the fix without leaving."* The **convergence point**: all six products share one skeleton ([IA §8.2](04-information-architecture.md)).
**Primary entities:** `ProtectedAsset` (discriminated by `kind`), `BackupRun`, `RecoveryPoint`, `ScreenshotVerification`, `Alert`, `FailureMode`, BCDR `StoragePool`/`OffsiteSync`, suggested `RemediationAction`/`Playbook`, this-asset `Run` history.

### 7.1 Layout & tabs

```
◀ Assets / ACME-DC01      ● Failed   AST-WIN-DC01 (mono) · Acme · BCDR agent · appl SIRIS-3
[ Overview ][ Timeline ][ Recovery points ][ Alerts ][ Runs ][ Actions ]
┌──────────────────────────────────────────────┬───────────────────────────────────┐
│ OVERVIEW TAB                                  │ RemediationPanel (rail)           │
│ ┌ WHY IS THIS RED? ─────────────────────────┐ │ SUGGESTED FIX                     │
│ │ VSS writer failure → crash-consistent only│ │ 💡 Reset VSS Writers + Retry     │
│ │ Evidence: "VSS failed to prepare snapshots"│ │ risk low · ~1 min · reversible    │
│ │   code BKP1410 (mono) · last 4 crash-only │ │ confidence high (code match)      │
│ │ Classified: bcdr.vss-writer-snapshot-fail │ │ ApplyScopeControl:                │
│ └───────────────────────────────────────────┘ │  ● This asset  ○ Selected         │
│ ┌ WHAT CHANGED (72h) ─┐ ┌ BACKUPS (last 10) ┐ │  ○ All matching ○ Always          │
│ │ • 06-21 02:14 Win upd│ │ ●●●○●●●●●●         │ │ [Dry-run] [Apply once] [Always…] │
│ │ • 06-21 02:31 VSS fail│ │ (Last10DotStrip)  │ │ [Save as playbook]               │
│ └──────────────────────┘ └───────────────────┘ │                                   │
│ Facets (product-specific): chain OK · ZFS 71% │                                   │
│  · offsite 41m ago · local-virt ready         │                                   │
└──────────────────────────────────────────────┴───────────────────────────────────┘
```

### 7.2 Per-tab content

| Tab | Component(s) | Data |
|---|---|---|
| Overview | `RemediationPanel` (why-red + suggested fix), `AssetTimeline` (what-changed), `Last10DotStrip`, facet `Card` | why-red `FailureMode` + verbatim error (`MonoLabel`); product facets: BCDR = chain/ZFS%/offsite/local-virt; SaaS = OAuth grant + seat license; Spanning = API cap %. |
| Timeline | `AssetTimeline` + `RunHistoryTable` | full `BackupRun` history; each run expands to evidence (error code mono, consistency, bytes, mode). |
| Recovery points | `DataTable` preset | `RecoveryPoint` list: verification badge, local/cloud, expiry warning, lock toggle, restore/virtualize. SaaS/Spanning show `saas-set` points (no boot test). |
| Alerts | `AlertTriageRow` list | open/acknowledged/suppressed alerts, each with `FailureMode` + suggested fix. |
| Runs | `RunHistoryTable` | automation `Run`s targeting this asset → `/automation/runs/[runId]`. |
| Actions | catalog grid + `RemediationPanel` | full product-scoped action catalog for this `kind`. |

### 7.3 Product convergence (same skeleton, different facts)

The **same** header + tab skeleton renders for `agent`, `agentless`, `endpoint`, `saas-seat`, `salesforce-org`, and `share` kinds. Irrelevant concepts are **absent, not empty**: a SaaS seat hides the boot-test/Recovery-points-verification UI and replaces it with "last successful sync"; an endpoint agent has no ZFS facet. An asset under a fleet `Incident` shows the why-red linking **up** ("part of Pod-EU3 throttling — 7 tenants affected") instead of implying an isolated fix.

### 7.4 The signature troubleshooting flow (concrete)

This is the red → evidence → remediation → scope → apply path, on one screen:

1. **Red status** — header shows `● Failed`; Overview tab's **Why is this red?** names `bcdr.vss-writer-snapshot-failure` with verbatim `"VSS failed to prepare snapshots"` + code `BKP1410` (`MonoLabel`).
2. **Evidence** — last-4-runs crash-consistent shown in the dot-strip; **What changed** correlates `06-21 02:14 Windows update` to `02:31 first VSS fail`.
3. **Inline remediation** — `RemediationPanel` rail offers **💡 Reset VSS Writers + Retry** (risk low · ~1 min · reversible · confidence high).
4. **Scope** — `ApplyScopeControl`: `● This asset` (default for inline) → `○ Selected` → `○ All matching` (live debounced count: "14 assets · 7 clients · View list ↗") → `○ Always` (pre-fills a [Policy](#11-automation-policy-editor) with the firing trigger).
5. **Apply** — `[Dry-run]` produces a before/after diff (zero mutations); `[Apply once]` runs it; `[Always…]` graduates to a policy; `[Save as playbook]` captures the chain. Risk≥high or >50 assets auto-inserts an approval gate ([Approvals](08-feature-specs.md#9-approvals)); the apply button restates the scope count.

→ result lands in [Run Detail](#13-run-detail); "Apply always" lands in the [Policy editor](#11-automation-policy-editor).

**States:**
- **Healthy:** why-red → "Protected — last good backup 41 min ago"; no fix; all-green dot-strip.
- **Empty (just onboarded):** "No backups yet — initial seed in progress" + seed ETA; not an error.
- **Loading:** header + tab skeletons; dot-strip placeholders.
- **Error (not found):** 404-style `Card` → back to `/assets`.
- **Partial (classifying):** why-red "Diagnosing…" with raw error visible; fix appears once classified.
- **Cosmetic failure:** why-red desaturated/info-toned ("Known limitation — verified via local virtualization") + a **Mark verified** action, not red alarm.
- **Active run:** header badge flips to `Syncing` while an automation `Run` targets this asset.

**Responsive:** ≥1280px = tabs + rail side-by-side. <1280px = `RemediationPanel` rail moves **below** the active tab content (still inline, not a separate route). `?peek=` Sheet ([§19](#19-asset-quick-peek-global-overlay)) shows the same Overview summary without navigation.
**a11y:** tabs are Radix `Tabs` with `aria-controls`; verbatim errors in `MonoLabel` (copyable); why-red panel is `role="region" aria-label="Failure diagnosis"`; scope changes announce the new blast-radius count via `aria-live`.

---

## 8. Per-product lenses

**Routes:** `/products/bcdr` · `/products/endpoint-backup` · `/products/datto-cloud` · `/products/saas-protect` · `/products/spanning`. **Template:** `ListPageTemplate`.
**Persona / journey:** tech working a product-specific problem — *"I need ZFS pool %, last screenshot, offsite recency for BCDR — or OAuth/seat/throttle for SaaS — without leaving the table model I know."*
**The mechanic:** a lens = `AssetTable` with `product=<id>` pre-applied **plus** that product's column preset + (for BCDR/SaaS/Spanning) a roll-up strip + specialized child routes. The `product` filter is the seam; everything else is the [§6 workhorse list](#6-assets--protection-the-workhorse-list).

```
┌─ "BCDR" header  +  Appliance roll-up strip (BCDR only) ───────────────────────────┐
│ SIRIS-3 ● Failed (2 machines)  ·  ALTO-1 ▲ Warn  ·  SIRIS-7 ● Protected   [→ appls]│
├─ FilterBar (§2, product=bcdr pre-applied as a locked chip) ───────────────────────┤
├──────────────────────────────────────────────────────────────────────────────────┤
│ AssetTable — BCDR column preset                                                    │
│ ☐│Status │Machine     │Appliance│Chain │ZFS% │Last screenshot│Offsite │Last 10     │
│ ☐│●Failed│ACME-DC01   │SIRIS-3  │OK    │71%  │✓ 41m (boot)   │41m ago │●●●○●●●●●●  │
│ ☐│▲Warn  │ACME-FILE02 │SIRIS-3  │rebuild│89% │△ stale 9h     │2h ago  │●●●●●▲●●●●  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 8.1 Column presets per product

| Product | Lens adds (columns / roll-up) | Child route |
|---|---|---|
| **BCDR** | Appliance roll-up strip; cols: Appliance · inverse-chain state · ZFS pool % · last screenshot/boot-test · offsite-sync recency · local-virt readiness | `/products/bcdr/appliances/[id]` |
| **Endpoint Backup** | DEB **v1 vs v2** split (segmented tabs or a `Version` col); migration status col; direct-to-cloud job health (no appliance col) | — |
| **Datto Cloud DR** | Test-failover readiness · cloud-virt state · VPN/IPsec status · retention posture | — |
| **SaaS Protect** | Per-service coverage (Exchange/SharePoint/OneDrive/Teams chips) · OAuth/consent health · seat/license sync · Graph/Google throttle state | `/products/saas-protect/tenants/[id]` |
| **Spanning** | Salesforce + M365 + Google connection · metadata backup · API rate-limit state · sandbox-seeding job | `/products/spanning/connections/[id]` |

**Saved-views scope:** a `product:bcdr`-scoped `SavedView` only offers in the BCDR lens; `global` views appear everywhere.

**States:**
- **Empty (tenant doesn't use this product):** "No BCDR assets for this tenant" + Connections link.
- **Migration lens (Endpoint):** v1 sunset countdown banner; dual-portal (Partner Portal vs UniView) note; v1 and v2 coexist explicitly.
- **SaaS post-deadline (EWS→Graph 2026-05-30 is past):** model both states — reauthorized tenants healthy, un-reauthorized tenants show Exchange backups stopped; the lens surfaces a "Bulk re-authorize (N tenants)" CTA.
- loading / error / partial = same as [§6](#6-assets--protection-the-workhorse-list).

**Edge cases:** appliance offline cascades — the BCDR lens shows the **appliance** as root cause (one row in the roll-up), not N separate agent failures; a SaaS seat inherits tenant-level consent failure (shown on the seat row), not a misleading per-seat-only state.
**Responsive / a11y:** identical to [§6](#6-assets--protection-the-workhorse-list); the roll-up strip wraps to a horizontal scroll on narrow widths; per-service coverage chips carry text labels, not color-only.

### 8a. Specialized child detail pages

**Routes:** `/products/bcdr/appliances/[id]` · `/products/saas-protect/tenants/[id]` · `/products/spanning/connections/[id]`. **Template:** `DetailPageTemplate`.
These are **parent-of-asset** detail pages (device/tenant/connection health) that list and link to their child `/assets/[assetId]` detail. Per the [IA open decision](04-information-architecture.md#9-open-decisions-flagged), individual protected entities converge on `/assets/[assetId]`; these parent pages add the device/tenant-level facts that don't belong on a single asset.

```
◀ BCDR / Appliances / SIRIS-3        ● Failed   APPL-SIRIS-3 (mono) · Acme · firmware 9.x
[ Overview ][ Storage (ZFS) ][ Protected machines ][ Offsite sync ][ Local virtualization ]
┌──────────────────────────────────┬───────────────────────────────────────────────┐
│ DEVICE HEALTH                     │ RemediationPanel (rail)                       │
│ ZFS pool 71% · inverse chain OK   │ 💡 Resume offsite sync (transmit cap)         │
│ offsite sync 41m · local-virt RDY │ risk low · reversible  ApplyScopeControl …    │
├──────────────────────────────────┴───────────────────────────────────────────────┤
│ PROTECTED MACHINES (AssetTable, scoped to this appliance) → /assets/[assetId]      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Child page | Tabs | Roll-up / cascade |
|---|---|---|
| Appliance | Overview · Storage (ZFS pool gauge) · Protected machines · Offsite sync · Local virtualization | offline appliance = root cause for all its machines. |
| SaaS tenant | Overview · Per-service coverage · OAuth/consent · Seats & licensing · Restores/exports | tenant consent failure cascades to seats. |
| Spanning connection | Overview · Metadata backup · API rate-limit · Seats · Sandbox seeding | connection auth failure cascades. |

States/responsive/a11y mirror [§7 Asset Detail](#7-asset-detail), with the protected-machines/seats `AssetTable` linking down to `/assets/[assetId]`.

---

## 9. Automation & Playbook Library

**Route:** `/automation` (three tabs: **Actions** catalog · **Playbooks** · **Policies**). **Template:** `ListPageTemplate` (tabbed).
**Persona / journey:** lead/tech — *"the fix I built should be a named, versioned, shareable playbook; the recurring fix should be a standing policy; and I need the atomic action catalog to build from."*
**Primary entities:** `RemediationAction` (catalog), `Playbook`, `AutomationPolicy`.

```
┌─ "Actions & Playbooks"   [ Actions ][ Playbooks ][ Policies ] ───────────────────┐
├─ FilterBar: product · failure-mode · source (curated/MSP)   ⌕ q ─────────────────┤
│ PLAYBOOKS TAB (PlaybookList of PlaybookCard)                                       │
│ ┌ Rollback agent 7.4.2→7.4.1 ──────┐ ┌ VSS Reset + Retry ───────────────┐         │
│ │ BCDR · trigger: manual            │ │ BCDR · auto-merge eligible        │        │
│ │ v3 · success 94% · last run 2h    │ │ v1 · success 88% · curated        │        │
│ │ [Load into cart] [Run now] [⋯]    │ │ [Load into cart] [Run now] [⋯]    │        │
│ └───────────────────────────────────┘ └───────────────────────────────────┘        │
│ MY PLAYBOOKS (authored)            CURATED TEMPLATES (10, read-only, duplicate-to-edit)│
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 9.1 Tabs

| Tab | Component | Content |
|---|---|---|
| **Actions** | catalog grid of action `Card`s | atomic `RemediationAction`s grouped by category (diagnostic / remediation / notification / control-flow); each card: name, target kinds, params, risk badge, reversibility, duration, `nativeAutomation` note ("Datto auto-diff-merges after 5 screenshot failures"). |
| **Playbooks** | `PlaybookList` of `PlaybookCard` | name, products, trigger pattern, version, success rate, last run, source (curated vs MSP). Split: "My playbooks" + "Curated templates" (10, read-only, duplicate-before-edit). |
| **Policies** | `PolicyCard` list (uses `PlaybookCard` org with policy meta) | standing automation: trigger, bound playbook+version, scope, gates, kill-switch toggle, recent-fire count. Seed: 3 policies (auto-diff-merge enabled, SaaS OAuth reauth disabled-pending-approval, DEB v2 AV-exclusion draft). |

**Actions:** Playbook `Load into cart` / `Run now` / `⋯` (Edit→draft, Duplicate, Rollback version, Delete). Policy kill-switch toggle. `New playbook` (from cart) / `New policy`.

**Filters / saved-views:** `product`, `failureMode`, `source`, `q`, plus `tab`. URL-encoded.

**States:** empty "My playbooks" still shows curated templates ("Save your first from the cart"); loading skeleton; bound-to-policy playbooks badge which policies pin which version.
**Responsive:** card grid 3-up → 2-up → 1-up; tabs become a `Select` on <640px.
**a11y:** tabs Radix; cards are `<article>` with a heading; risk badges carry text + icon; version/source are text not color.

---

## 10. Playbook Detail / Editor

**Route:** `/automation/playbooks/[playbookId]`. **Template:** `DetailPageTemplate` with the `ChainBuilder` as the primary surface.
**Persona / journey:** lead editing/versioning a saved chain — *"step sequence, params, scope defaults, approval gates, trigger mode, run history; published = read-only, edit forks a draft."*
**Primary entities:** `Playbook` (extends `ActionChain`), `PlaybookStep`, version metadata, `boundPolicyIds`.

```
◀ Automation / Playbooks / Rollback agent 7.4.2→7.4.1     Published v3 · BCDR · success 94%
[ Steps ][ Scope & triggers ][ Approvals ][ Run history ][ Versions ]
┌──────────────────────────────────────────────┬───────────────────────────────────┐
│ ChainBuilder (read-only when Published)       │ META                              │
│ ① Diagnostic: check agent version  [drag]     │ Version v3 (published)            │
│ ② if version==7.4.2 →                         │ Bound policies: 2 (pinned v3)     │
│    ③ Remediation: rollback to 7.4.1           │ Approval: required if >50 assets  │
│    ④ Diagnostic: verify backup succeeds       │ Trigger: manual / sub-playbook    │
│ ⑤ Notification: post result                   │ [Edit (creates draft)] [Run now]  │
│ (PlaybookStepCard each; branch group collapsible)│ [Load into cart] [Rollback ▾]   │
└──────────────────────────────────────────────┴───────────────────────────────────┘
```

| Tab | Component | Content |
|---|---|---|
| Steps | `ChainBuilder` of `PlaybookStepCard` | ordered steps + collapsible branch groups (`if`/`switch`/`for-each`/`wait`/`stop`/`sub-playbook`/`approval-gate`); read-only when Published, editable in draft (dnd-kit reorder). |
| Scope & triggers | form + `ApplyScopeControl` | scope defaults, trigger mode (manual / triggered / auto-remediation). |
| Approvals | `ApprovalRequestCard` config | which steps gate, required role/approvers, timeout + on-timeout. |
| Run history | `RunHistoryTable` | past runs of this playbook → `/automation/runs/[runId]`; success-rate stat. |
| Versions | version list + diff | published versions; one-click **rollback**; version diff; which policies pin which version. |

**Change control:** Published = read-only; **Edit** forks a draft at `version+1`; promote requires self-approval (low risk) or named approver; rollback restores a prior published version; editing a playbook 3 policies pin **warns** that policies won't auto-migrate. Cycle detection blocks sub-playbook recursion.

**States:** Draft (editable, "Draft v4" badge, test runs allowed); Published (read-only + "Edit creates draft"); Bound-to-policy (migration warning); curated template (immutable, "Duplicate to edit").
**Responsive:** rail meta moves below `ChainBuilder` on <1024px.
**a11y:** drag handles keyboard-operable (dnd-kit keyboard sensor); branch groups are `<details>`/`role="group"`; version diff readable as text.

---

## 11. Automation Policy Editor

**Route:** `/automation/policies/[policyId]`. **Template:** `DetailPageTemplate` with `AutomationPolicyEditor`.
**Persona / journey:** lead — *"I never want to hand-fix this recurring failure again; when it matches, run the playbook on whatever assets match — with a kill-switch and an audit trail."* The top of the fix-once-then-forever ladder; **always gated on publish**.
**Primary entities:** `AutomationPolicy`/`PolicyConfig`, bound `Playbook`/`RemediationAction`, `RunRecord` (per fire), `ApprovalRequest`.

```
◀ Automation / Policies / Auto Diff-Merge after 5 Screenshot Failures   Enabled · BCDR
┌─ AutomationPolicyEditor ─────────────────────────┬───────────────────────────────┐
│ TRIGGER                                          │ STATS & KILL-SWITCH            │
│  ◉ consecutive-failures  count [5]               │ triggered 38 · succeeded 36    │
│  ○ event-type            ○ cron                  │ last fired 2h ago              │
│ MATCH FILTER (dynamic AssetFilter)               │ [⏻ Enabled ▾]  (kill-switch)   │
│  product=BCDR · category=screenshot · status=warn│ ─────────────────────────────│
│  → live preview: 22 assets across 9 clients ↗    │ RECENT FIRES                  │
│ BOUND PLAYBOOK                                    │  • 06-22 04:10 → 3 assets ✓   │
│  VSS Reset + Retry (pinned v1)                    │    → /automation/runs/run_91  │
│ GATING  ☑ requiresApproval  suppressWithin [24h] │  • 06-21 22:40 → 1 asset  ✓   │
│  ☑ dryRunFirst (observe-only)                    │                               │
│ [Save draft] [Publish — requires approval]       │                               │
└──────────────────────────────────────────────────┴───────────────────────────────┘
```

| Region | Component | Content |
|---|---|---|
| Trigger | `RadioGroup` + count/cron inputs | `consecutive-failures` (+count) / `event-type` / `cron`. |
| Match filter | faceted filter + live preview | dynamic `AssetFilter` with debounced live count ("22 assets · 9 clients · View list ↗"); membership re-evaluated per fire; new onboarded matches inherit. |
| Bound playbook | playbook picker | pins a specific version. |
| Gating | `Switch` + inputs | `requiresApproval`, `suppressWithinHours`, `dryRunFirst` (observe-only). |
| Stats / kill-switch | `KpiTile` + `Switch` | triggered/succeeded/lastFired; kill-switch pauses firing immediately, retains config + history. |
| Recent fires | list | each fire → its `RunRecord`. |

**Lifecycle:** draft → publish (**always gated**) → enabled; observe-only fires as dry-run logging "would have affected N" with zero mutation; edit forks a draft; delete retains run records; suppression shows "suppressed until …".

**States:** Empty (graduate a fix → policy, linked from a suggested-fix "Apply always"); Draft ("Publish requires approval"); Observe-only ("would have affected N" prominent before going live); Enabled; Paused; Pending approval.
**Responsive:** stats/fires rail moves below on <1024px.
**a11y:** kill-switch announces state change (`role="status"`); live preview count is `aria-live`; "always gated" publish surfaces a confirmation describing the open-ended blast radius.

---

## 12. Run History & Audit

**Route:** `/automation/runs` (two tabs: **Run History** · **Audit Trail**). **Template:** `ListPageTemplate` (tabbed).
**Persona / journey:** tech ("what did this playbook do last time, on which assets, with what outcome?") and lead/auditor ("immutable who-did-what-when, exportable for client reports / SIEM").
**Primary entities:** `RunRecord`, `StepOutput`, `AuditEvent`.

```
┌─ "Run History & Audit"  [ Run History ][ Audit Trail ]  ─────────────────────────┐
├─ FilterBar: Product·Client·Playbook·Tech·Status·Date·[Dry-run/Apply] ────────────┤
│ RunHistoryTable                                                                    │
│ Run name          │Triggered by│Date    │Scope        │Assets│Outcome   │Dur│⋯    │
│ Rollback agent     │ amellor    │06-22   │once-selected│ 14   │13✓ / 1✕  │47s│↗    │
│ Auto Diff-Merge    │ policy_aa  │06-22   │always-match │ 3    │ 3✓       │12s│↗    │
│ Reset VSS (dry-run)│ tjones     │06-21   │this-asset   │ 1    │dry-run ✓ │ 3s│↗    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 12.1 Run History tab

| Column | Component | Notes |
|---|---|---|
| Run name | link | → [Run Detail](#13-run-detail); stores name/version **at run time**. |
| Triggered by | text / `Avatar` | tech or policy id. |
| Date | mono | ISO; relative on hover. |
| Scope | chip | once-this-asset / once-selected / once-all-matching / always-matching. |
| Assets | mono count | targeted count. |
| Outcome | `StatusBadge`-style chip | `13✓ / 1✕` partial; `dry-run ✓`; `rolled-back`; in-progress = live `Syncing`. |
| Duration | mono | — |
| Actions | `DropdownMenu` | Open detail, Retry failed only, Revert run (if all mutating steps reversible). |

### 12.2 Audit Trail tab

`AuditLog` (DataTable preset, time-ordered, **append-only**). Filters: Event type · Actor · Client · Target type · Playbook · Policy · Date. Verbs: run/approval/playbook/policy/action `.created/.granted/.published/.rolled-back/…`. **No edit/delete UI exists** (overwrite-by-id throws). Export: **CSV** (all fields, SIEM) + **PDF** (client deliverable), honoring the current filter exactly.

**States:** seed data (~20 runs + ~40 audit events) makes empty rare; partial-failure run shows `12✓ / 2✕` + per-asset breakdown; rolled-back run links to its compensating run; dry-run badged; in-progress live-updates.
**Responsive:** hide Triggered-by + Duration <1024px; Audit export buttons collapse into `⋯`.
**a11y:** `aria-sort` on sortable columns; append-only conveyed by absence of edit controls + a caption note; export buttons labeled with the active filter scope.

---

## 13. Run Detail

**Route:** `/automation/runs/[runId]` (also openable as a slide-over from the run list). **Template:** `DetailPageTemplate` or a wide `Sheet`.
**Persona / journey:** tech — *"what did this run do, step by step, on which assets, and can I revert it?"* The landing point of the [signature flow](#74-the-signature-troubleshooting-flow-concrete).

```
◀ Runs / Rollback agent 7.4.2→7.4.1      13✓ / 1✕   run_4471 · amellor · 06-22 04:12
┌─ STEP TIMELINE ──────────────────────────────┬───────────────────────────────────┐
│ ① Diagnostic: check agent version    ✓ 0.4s   │ RESOLVED ASSETS (14)              │
│ ② if version==7.4.2 → true                    │  ● ACME-DC01   ✓                 │
│ ③ Remediation: rollback to 7.4.1     ✓ 38s    │  ● ACME-SQL02  ✓                 │
│    diff: agent 7.4.2 → 7.4.1 (per-asset)      │  ● NWND-SQL01  ✕ creds invalid   │
│ ④ Diagnostic: verify backup          13✓ 1✕   │  …  [Retry failed only]          │
│ ⑤ Notification: post result          ✓        │ ─────────────────────────────────│
│ APPROVAL CHAIN: approved by jlee 04:11        │ PARAMS USED · TRIGGER · back-links│
│ [Revert this run] (all mutating steps reversible)│  → incident inc_8821 · asset ↗ │
└──────────────────────────────────────────────┴───────────────────────────────────┘
```

| Region | Component | Data |
|---|---|---|
| Step timeline | `AssetTimeline` of `StepOutput` | per step: inputs, outputs, errors (`MonoLabel`), diffs, retry attempts; `if`/`switch` show the branch taken. |
| Resolved assets | `AssetTable` (compact) | per-asset fan-out outcome; failures show error + **Retry failed only**. |
| Approval chain | `ApprovalRequestCard` (resolved) | decisions (name, time, comment). |
| Params / trigger / back-links | meta `Card` | params used; who/what triggered; back-links to triggering incident/asset and forward to compensating run. |

**Actions:** Revert this run (only when all mutating steps declared a compensating action; runs in reverse order, re-verifies via diagnostics); Retry failed only.

**States:** in-progress (live step tiles pending→running `--primary` pulse→succeeded/failed); partial failure; rolled-back (reverse-order chain, linked compensating run); partial rollback ("steps 1–3 reverted; step 4 needs manual intervention"); dry-run (diffs, no mutations).
**Responsive:** resolved-assets rail moves below the timeline <1024px.
**a11y:** ordered step list with real timestamps; live regions for in-progress status; revert is a `destructive`-adjacent confirm that names the reverse plan.

---

## 14. Reports

**Routes:** `/reports` (index) + `/reports/[reportId]` (single report + drill-through). **Template:** `AppShell` with a deliberately **varied** chart layout (impeccable bans the identical-card grid and hero-metric).
**Persona / journey:** service manager / lead — *"which failures recur, are we meeting RPO, how is alert volume trending, what is automation saving — so I can report to clients and improve."*
**Primary entities:** aggregates over `BackupRun`, `RecoveryPoint` (RPO), `Alert`/`FailureMode`, `RunRecord` (ROI), `Client`.

```
┌─ "Reports"   range [30d ▾]   client [All ▾] ─────────────────────────────────────┐
├──────────────────────────────────┬───────────────────────────────────────────────┤
│ SLA / RPO COMPLIANCE              │ RECURRING FAILURES (top modes, by product)    │
│ (line, % within RPO over time)    │ (horizontal bar) → /triage?category=…         │
│ breaches 8 ↗ list                 │                                               │
├──────────────────────────────────┴───────────────────────────────────────────────┤
│ ALERT VOLUME (area + incident overlays)        │ AUTOMATION ROI (KpiTile row)     │
│  spike annotated → Pod-EU3 incident            │ runs 142 · auto-healed 38 ·      │
│                                                │ approvals 6 · ~ time saved 9h    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Report | Component | Drill-through |
|---|---|---|
| SLA/RPO compliance | `ReportChartCard` (line + breach list) | breaches → `/assets?rpoBreached=true`; per-asset RPO target, aggregated. |
| Recurring failures | `ReportChartCard` (bar) | top `FailureMode`s by count → `/triage?category=…` / filtered asset list. |
| Alert volume | `ReportChartCard` (area + incident overlay) | spike annotated to its platform `Incident` (annotates, doesn't distort). |
| Automation ROI | `KpiTile` row | runs / auto-healed / approvals / est. time saved → `/automation/runs`. |

**Every chart segment is a drill-through `<Link>`** preserving filter context. Window via `range`, tenant via `client` (URL-encoded; deterministic seed → reproducible in Storybook).

**States:** Empty ("Not enough data yet for this window" + wider-window suggestion; no flat-zero charts); all-healthy ("100% within RPO this window"); loading (chart skeletons); error (per-report retry — one failing report never blanks the index); cosmetic failures excluded from "real failure" trends but available as a toggle.
**Responsive:** 2-col → 1-col; charts use `ResponsiveContainer`; KPI row 4-up → 2-up.
**a11y:** every series paired with a legend label + a data-table fallback (`aria-describedby`), never color-only; gridlines `strokeDasharray="3 3"` `hsl(var(--border))`; tooltips are `bg-card` text not color-coded alone.

---

## 15. Setup

**Routes:** `/setup` (index → tabs) · `/setup/connections` · `/setup/approvals` · `/setup/notifications` · `/setup/preferences`. **Template:** `ListPageTemplate` (tabbed) / form pages.
**Persona / journey:** lead/admin — *"configure tenant, integration health, approval policies, notification routing, and preferences."* Connections are themselves a source of failures to remediate.

```
┌─ "Setup"  [ Connections ][ Approvals ][ Notifications ][ Preferences ] ───────────┐
│ CONNECTIONS (per-product credential/integration health)                           │
│ Product      │Connection        │Status        │Detail                 │Action     │
│ SaaS Protect │contoso.onmicrosoft│● Consent exp.│OAuth grant past due   │[Re-auth]  │
│ BCDR         │SIRIS-3 (appliance)│● Protected   │firmware 9.x · reg OK  │—          │
│ Spanning     │acme.salesforce    │▲ API throttle│cap 78% · sandbox seed │[Raise cap]│
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Tab | Component | Content |
|---|---|---|
| Connections | `DataTable` of `Connection` | OAuth grants, appliance registration, API keys; status + remediation action inline (Re-authorize OAuth, Raise API cap) → cart/Execute. |
| Approvals | `AutomationPolicyEditor`-style form | which actions require sign-off, by whom, for which scopes; timeout + on-timeout; trust window. |
| Notifications | `FormField` rules table | `NotificationRule` routing (event type → channel: in-app/Slack/Teams/email — mock logs to in-app center). |
| Preferences | `FormField` form | density (dense/comfortable), default theme, saved-view defaults, keyboard map. Persists to `ui-store`. |

**States:** Connections empty ("No connections — add one"); a degraded connection links to its remediation; preferences save → Sonner toast.
**Responsive:** tab strip → `Select` on <640px; connections table → card rows.
**a11y:** forms use `FormField` (Label↔control, `aria-describedby` helper/error, `role="alert"` errors); switches/toggles announce state; connection status dot+icon+label.

---

## 16. Global Search results

**Surface:** top-bar omni-search overlay (focused with `f`; **not** while typing in a field). Built on `Command` (cmdk). Finds *things* (distinct from the [Command Palette](#17-command-palette), which runs *commands*).
**Persona / journey:** keyboard-first tech — *"I know the hostname / error code / client / IP — get me there in two keystrokes."*

```
┌─ ⌕  acme-dc01_____________________________  [Esc] ───────────────────────────────┐
│ ASSETS                                                                            │
│  ● ACME-DC01 (mono)        Acme · BCDR · Failed        → /assets/ast-win-dc01     │
│ INCIDENTS                                                                          │
│  ● Backup failing — SQL Tier-1   14 assets            → /triage/inc_8821          │
│ CLIENTS                                                                            │
│  ● Acme MSP                       19 failing          → switch tenant             │
│ ERROR CODES                                                                        │
│  BKP1410 (mono) — 6 assets                            → /assets?q=BKP1410         │
│ PLAYBOOKS                                                                          │
│  Rollback agent 7.4.2→7.4.1                            → /automation/playbooks/…  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Group | Source | Selecting |
|---|---|---|
| Assets | `ProtectedAsset` index | → `/assets/[assetId]`. |
| Incidents | `Incident` | → `/triage/[incidentId]`. |
| Clients | `Client` | → switch tenant (`?client=`). |
| Error codes | verbatim error strings/codes | → filtered list (`?q=BKP1410`). Must find `0x0000007B`, `AADSTS500014`, ports (`3262`), hostnames (`mothership.dtc.datto.com`). |
| Playbooks / Actions | `Playbook`/`RemediationAction` | → detail / run. |

**States:** empty query → recent items + suggestions; no results → "No matches for '…'" + hint (try an error code or hostname); loading → subtle inline spinner, never blocks typing; scoped to current `?client` with an "all clients" toggle. IDs/IPs/error codes render `MonoLabel`.
**Responsive:** full-screen overlay on <768px (top-bar search collapses to an icon).
**a11y:** `Command` is keyboard-navigable (arrow/enter/escape) with `aria-activedescendant`; grouped results have group headings; respects `prefers-reduced-motion` (no flashy open).

---

## 17. Command Palette

**Surface:** `⌘K` / `Ctrl K` overlay (`CommandPalette` organism, cmdk). Runs *commands* (distinct from omni-search).
**Persona / journey:** keyboard-first tech — *"run this command without hunting through menus."*

```
┌─ ⌘K  run playbook______________________________  [Esc] ──────────────────────────┐
│ RUN                                                                               │
│  ⚡ Run playbook…           (opens playbook picker → cart)                         │
│  ⚡ Retry backup on…        (opens asset picker sub-step)                          │
│ NAVIGATE                                                                           │
│  → Go to Run History        → Go to Reports         → Go to client…               │
│ SWITCH                                                                             │
│  ⇄ Switch tenant…                                                                 │
│ TOGGLE                                                                             │
│  ◑ Toggle dark mode         ▦ Toggle density                                      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Category | Commands | Behavior |
|---|---|---|
| Run | Run playbook… · Retry backup on… · Create incident | "Run playbook…" → playbook picker → cart; "Retry backup on…" → asset-picker sub-step. |
| Navigate | Go to Run History · Reports · client… (nav-as-commands from `config/nav.ts`) | route navigation. |
| Switch | Switch tenant… | re-scopes app (`?client=`). |
| Toggle | dark mode · density | writes `ui-store`. |

**States:** empty → suggested commands; no results → "No command matches"; a command needing a target (asset/playbook) opens a sub-step picker. Commands carry through to the relevant flow.
**Responsive / a11y:** same as [§16](#16-global-search-results) — full keyboard nav, `aria-activedescendant`, reduced-motion respected; `⌘K` does not hijack typing in inputs.

---

## 18. Action Cart (global overlay)

**Surface:** right slide-in `Sheet` (`ActionCart` + `ChainBuilder` organisms), openable from anywhere; **not a route** — Zustand `cart-store` + `persist` (survives reload + route + tenant switch). Badge in sidebar + top bar (hidden at 0). The spine of the [automation engine](08-feature-specs.md#5-action-chain--cart).
**Persona / journey:** tech — *"stage these steps in order, set one scope, dry-run, commit — then save as a playbook."*

```
┌─ Action cart ⟨3⟩ ───────────────────────────────────────────── [×] ──────────────┐
│ STEPS (drag to reorder)                                                           │
│ ① Reset VSS Writers        once-this-asset   params ▸   onFailure: fail-chain     │
│ ② if step① failed →                                                               │
│    ③ Force Diff-Merge       (BCDR)            params ▸   retry ×1                  │
│ + Add step  [ Actions | Control-flow ]                                            │
│ ─────────────────────────────────────────────────────────────────────────────────│
│ SCOPE   ApplyScopeControl: ● This asset ○ Selected (3) ○ All matching ○ Always    │
│ Affects 14 assets · 7 clients · Risk: medium · reversible      [View list ↗]      │
│ RUN MODE  ◉ Dry-run (default)  ○ Apply                                             │
│ Total est. ~4 min · blast radius 14                                               │
│ [Dry-run chain]   [Save as playbook]   [Apply — 14 assets]                        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Region | Component | Content |
|---|---|---|
| Step list | `ChainBuilder` of `PlaybookStepCard` | drag-reorder; per-step params, `onFailure` (fail-chain/skip/try-compensate/continue), retry; collapsible branch groups. |
| Step picker | two-bucket `Command` | Actions \| Control-flow. |
| Scope | `ApplyScopeControl` | four modes; live debounced preview count; "View list ↗" resolved-list modal. |
| Run mode | `RadioGroup` | Dry-run (default) → Apply (deliberate toggle; restates scope count). |
| Footer | `Button` row | Dry-run chain · Save as playbook · Apply (one scope, one dry-run, one approval for the whole chain). |

**States:** empty ("No actions staged — add a suggested fix or pick from the catalog"; badge hidden); building/dirty (autosave 10s, "unsaved" indicator); dry-run preview (per-step would-change diffs, nothing committed); running (step tiles pending→running `--primary` pulse→succeeded/failed, per-step countdown, Sonner on terminal); needs-approval (pauses at gate, approval card dispatched); partial failure ("12 succeeded, 2 failed" + "Retry failed only").

**Edge cases:** scope change after dry-run invalidates the preview (must re-dry-run before apply); irreversible step surfaces rollback-impossibility + auto-inserts an approval gate; tenant switch warns if staged assets fall outside the new scope; two-`if` anti-pattern nudges toward `switch`.
**Responsive:** Sheet is full-width on <640px.
**a11y:** Sheet is a focus-trapped `Dialog`; drag handles keyboard-operable; Apply button label restates count ("Apply — 14 assets") so the blast radius is read aloud; scope-count changes `aria-live`.

---

## 19. Asset Quick-Peek (global overlay)

**Surface:** right `Sheet` opened via `?peek=<assetId>` — the same Overview summary as [Asset Detail §7](#7-asset-detail) without leaving the list.
**Persona / journey:** tech triaging a list — *"inspect why this is red and maybe fix it, without losing my place."*

```
┌─ ACME-DC01 ● Failed ──────────────────────────────────────── [Open full ↗][×] ───┐
│ WHY IS THIS RED?   VSS writer failure → crash-consistent only                     │
│  "VSS failed to prepare snapshots"  code BKP1410 (mono)                            │
│ BACKUPS (last 10)  ●●●○●●●●●●          WHAT CHANGED  • 02:14 Win update · 02:31 fail│
│ SUGGESTED FIX  💡 Reset VSS Writers + Retry  (risk low · ~1 min · reversible)      │
│  ApplyScopeControl: ● This asset …   [Dry-run] [Apply once] [Add to cart]         │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Region | Component | Content |
|---|---|---|
| Header | `StatusBadge` + name | status + `Open full ↗` (→ `/assets/[assetId]`). |
| Why-red + evidence | `RemediationPanel` (compact) | classified `FailureMode` + verbatim error (`MonoLabel`). |
| Dot-strip + what-changed | `Last10DotStrip` + `AssetTimeline` (excerpt) | recency + correlation. |
| Suggested fix | `RemediationPanel` + `ApplyScopeControl` | inline Dry-run / Apply once / Add to cart — same engine as the full page. |

**States:** consistent data with the full route (same store reads); loading skeleton; healthy asset shows "Protected — last good …"; cosmetic shows desaturated + Mark verified.
**Responsive:** full-width Sheet <640px; on tap of a row in the <768px card layout, peek is the default (full route via "Open full").
**a11y:** focus-trapped `Dialog`; `Esc` closes and returns focus to the originating row; `?peek=` is URL-encoded so the peek is deep-linkable and consistent with the full route.

---

## 20. Cross-page invariants (build checklist)

Applies to **every** page above; a reviewer verifies these per screen:

- [ ] Wraps the correct template ([component inventory §5](10-component-inventory.md)); shell never re-mounts on nav.
- [ ] Tokens only — no hardcoded hex/px; status = dot + icon + label everywhere ([design system §8](03-design-system.md)).
- [ ] All "what you're looking at" state (filters/tab/sort/page/peek/view/client/cohort) is URL-encoded ([IA §6](04-information-architecture.md)); transient UI (cart/density/theme) is Zustand.
- [ ] Severity sort is law; fleet rollups show worst **real** child; cosmetic/paused never dominate.
- [ ] Every red offers a one-click path to context → cause → fix (no dead-end reds).
- [ ] Five states render: empty / loading (`loading.tsx` skeleton, never center spinner) / error (region-local retry) / partial / success.
- [ ] Responsive at ≥1280 / 1024 / 768 / <768; sidebar → off-canvas on mobile.
- [ ] WCAG 2.2 AA: `aria-sort` on sortable headers, `role="toolbar"` bulk bar, focus-visible rings, `aria-live` on count/status changes, reduced-motion honored.
- [ ] No impeccable bans: nested cards, decorative side-stripes, gradient text, glassmorphism, hero-metric, identical card grids, per-section uppercase eyebrows.
- [ ] Page is storied as Template + seeded mock data ([component inventory §6 note](10-component-inventory.md)).

---

## 21. Cross-references

- Route map, nav, URL state, drill-down paths: [04-information-architecture](04-information-architecture.md)
- What each feature must do + acceptance criteria: [08-feature-specs](08-feature-specs.md)
- Tokens, status system, per-surface styling: [03-design-system](03-design-system.md)
- Every component this doc composes (props/states/Storybook home): [10-component-inventory](10-component-inventory.md)
- Entities the pages render: [05-domain-model](05-domain-model.md)
- Action/chain/scope/policy/approval mechanics: [07-troubleshooting-and-automation-engine](07-troubleshooting-and-automation-engine.md)
- Suggested-fix sourcing per error code: [02-failure-catalog](02-failure-catalog.md)
