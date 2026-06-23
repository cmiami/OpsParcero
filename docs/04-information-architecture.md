# Information Architecture

Navigation model, route map, page inventory, URL/state strategy, saved views, and the cross-cutting filtering model for Kaseya Resolution Center.
Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

---

## 0. IA principles (what the structure must express)

The IA is the structural encoding of the product thesis from [PRODUCT.md](../PRODUCT.md) and the navigation invariants from [dashboard UX research](research/03-dashboard-ux-research.md §4). Five rules govern every routing and nav decision:

1. **Triage-first, not dashboard-first.** The default landing surface is the **Triage Queue** ("what needs me now"), not a vanity Overview. Overview exists, but is a curated read-only roll-up reached deliberately.
2. **Every aggregate is a link, every drill carries context.** "19 assets failing" is a `<Link>` to those exact 19, pre-filtered via URL. Aggregate → cohort → asset is always one direction, one click per level, never a re-query. (research §4 invariant 1)
3. **One workhorse list, re-scoped.** The same Asset/Protection table component renders at fleet, client, site, product, and cohort scope. The mental model never changes as you drill. (research §1, §4 invariant 2)
4. **Cross-product by default; per-product on demand.** The six products ([BCDR](products/bcdr.md), [Endpoint Backup](products/endpoint-backup.md), [Datto Cloud](products/datto-cloud.md), [SaaS Protect](products/saas-protect.md), [Spanning](products/spanning.md)) share one IA. Product is a **filter dimension first**, a nav section second. You can work the whole fleet across products, then narrow to one product when its domain shape demands it.
5. **State lives in the URL.** Filters, active tab, search, selected detail, sort, and the saved-view id are all URL-encoded ([nuqs](research/04-architecture-research.md)). Every view is deep-linkable and shareable — the single biggest "this feels real" detail in the mock. Ephemeral UI (sidebar collapsed, density, action-cart contents) lives in Zustand/localStorage, **not** the URL.

> See the [domain model](05-domain-model.md) for the entities these routes operate on, the [page specs](09-page-specs.md) for wireframe-level layout of each page, and the [tech architecture](11-tech-architecture.md) for the `config/nav.ts` single-source-of-truth that drives sidebar + breadcrumbs + command palette.

---

## 1. The app shell

A persistent shell wraps every authenticated route via the `(console)` route group's `layout.tsx`. It never re-mounts on navigation, so the sidebar, tenant context, and action-cart badge stay put. Three zones:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR  [≡] Kaseya Resolution Center  / Triage / SQL-cluster   [⌕ Search  f]  ◔ ⌘K ⌂│  ← global
│          ▲ collapse           ▲ breadcrumbs        ▲ omni-search  ▲ notif ▲user │
├──────────┬───────────────────────────────────────────────────────────────────┤
│ SIDEBAR  │                                                                     │
│ (nav shell)  │   ROUTED CONTENT (the page)                                         │
│          │                                                                     │
│ [Tenant▾]│   ┌── filter bar / saved-view selector ──────────────────────────┐ │
│ Overview │   │ ...                                                           │ │
│ Triage ● │   └───────────────────────────────────────────────────────────────┘ │
│ Assets   │                                                                     │
│  ...     │   ┌── primary surface (table / detail / timeline) ───────────────┐ │
│          │   │ ...                                                           │ │
│ ───      │   └───────────────────────────────────────────────────────────────┘ │
│ Action   │                                                                     │
│ cart (3) │                                                              [Cart▸] │  ← action cart
└──────────┴───────────────────────────────────────────────────────────────────┘
```

- **Sidebar** = white nav `#002A3A` (`--sidebar`), primary navigation, tenant switcher pinned at top, action-cart entry pinned at bottom.
- **Top bar** = breadcrumbs (left), global omni-search + command palette (center/right), notifications + user menu (far right). Background `bg-card`, hairline bottom border (no shadow).
- **Action cart** = slide-in `Sheet` (right), route-independent overlay, badge count in sidebar + top bar. The cart is the spine of the [automation engine](07-troubleshooting-and-automation-engine.md); it is *not* a route — it is global state, openable from anywhere.

---

## 2. Left navigation (nav shell sidebar)

Driven by `config/nav.ts` (single source of truth for sidebar, breadcrumbs, and command palette). Grouped into four labelled sections. Severity-ordered status counts and live badges render inline (worst-state-wins rollup per [design system](03-design-system.md) status rules).

### 2.1 Structure (expanded)

```
┌────────────────────────────┐
│ [Acme MSP ▾]   ← tenant     │   tenant/client switcher (combobox)
├────────────────────────────┤
│ WORK                        │   ← section label (not an uppercase eyebrow on content; this is nav chrome)
│  ⌂  Overview                │
│  ◎  Triage Queue      ⟨14⟩  │   ← live count badge = open incidents needing me
│  ▦  Assets & Protection     │   ← the workhorse list (cross-product)
├────────────────────────────┤
│ BY PRODUCT                  │
│  ▣  BCDR                ●19 │   ← worst-state dot + failing count per product
│  ▣  Endpoint Backup     ●3  │
│  ▣  Datto Cloud DR          │
│  ▣  SaaS Protect        ▲7  │   ← ▲ = warning rollup
│  ▣  Spanning                │
├────────────────────────────┤
│ AUTOMATE                    │
│  ⚡  Actions & Playbooks     │
│  ⟲  Run History & Audit     │
├────────────────────────────┤
│ ANALYZE                     │
│  ▤  Reports                 │
│  ⚙  Setup                   │
├────────────────────────────┤
│  🛒 Action cart        ⟨3⟩  │   ← pinned bottom, opens cart sheet
└────────────────────────────┘
```

### 2.2 Item-by-item

| Section | Item | Route | Purpose | Badge |
|---|---|---|---|---|
| Work | **Overview** | `/overview` | Curated fleet health roll-up (lean command center). Not the default landing. | — |
| Work | **Triage Queue** | `/triage` | **Default landing.** Grouped, prioritized incidents — "what needs me now." | open-incident count (worst sev color) |
| Work | **Assets & Protection** | `/assets` | The re-scoped workhorse table: every protected entity across all 6 products. | failing count |
| By Product | **BCDR** | `/products/bcdr` | BCDR-scoped lens: appliances, protected machines, screenshot verification, chain/ZFS health, offsite sync. | worst-state dot + count |
| By Product | **Endpoint Backup** | `/products/endpoint-backup` | DEB v1 + v2 agents (direct-to-cloud), with the v1→v2 migration lens. | worst-state dot + count |
| By Product | **Datto Cloud DR** | `/products/datto-cloud` | Cloud continuity: cloud restore, virtualization, test failover, VPN/IPsec networking, retention. | worst-state dot + count |
| By Product | **SaaS Protect** | `/products/saas-protect` | M365 + Google Workspace tenants: OAuth/consent, seats/licensing, Graph/Google throttling, restores. | worst-state dot + count |
| By Product | **Spanning** | `/products/spanning` | Salesforce + M365 + Google: metadata, API rate limits, OAuth, seat sync, sandbox seeding. | worst-state dot + count |
| Automate | **Actions & Playbooks** | `/automation` | The remediation catalog (atomic actions) + saved playbooks + auto-remediation policies. | — |
| Automate | **Run History & Audit** | `/automation/runs` | Immutable audit feed of every action/playbook run (who/what/when/outcome). | — |
| Analyze | **Reports** | `/reports` | Recurring-failure trends, SLA/RPO posture, alert-volume, automation ROI. | — |
| Analyze | **Setup** | `/setup` | Tenant config, integrations/connections, approval policies, notification rules, preferences. | — |

**Why "By Product" is a section, not the whole nav:** the products differ enough in domain shape (an Endpoint agent has no ZFS pool; a SaaS tenant has seats and OAuth grants, not boot tests) that each benefits from a tailored lens with product-specific columns and remediation actions. But the *common* job — triage failures, fix them — is cross-product, so it lives above the product split. A product item is sugar for `/assets?product=<id>` plus that product's specialized columns and detail tabs (see [§7](#7-cross-product-vs-per-product-navigation)).

### 2.3 Collapsed state

`SidebarProvider` collapsible (icon rail). Collapsed = `--sidebar` rail showing only icons; section labels hide; badges shrink to a corner dot (still color-coded). Tenant switcher collapses to the tenant's avatar/initial; clicking opens the same combobox in a popover. Action cart collapses to the cart icon + count. State persisted in `ui-store` (`msp-ui`, localStorage). Hover on a collapsed item shows a tooltip with the full label + badge count. Honors `prefers-reduced-motion` on the expand/collapse transition.

### 2.4 Tenant / client switcher

```
┌─ Acme MSP ────────────────── ▾ ─┐
│ ⌕ Search clients…               │
│ ───────────────────────────────  │
│ ★ Pinned                         │
│   ● Northwind Traders    ▲ 7    │   ← worst-state dot + open-issue count per tenant
│   ● Contoso Ltd          ● 19   │
│ All clients (142)                │
│   ○ Aberdeen Dental             │
│   ○ Brightpath Legal            │
│ ───────────────────────────────  │
│ ⌂ All clients (fleet view)      │   ← cross-tenant aggregate
└─────────────────────────────────┘
```

- This is the **MSP multi-tenancy** primitive. Default scope = "All clients" (the whole MSP fleet); switching to a client re-scopes the **entire app** (sidebar counts, every list, the triage queue) to that tenant.
- Searchable combobox (`Popover` + `Command`), not a `<select>` — hundreds of clients. Pinned/recent at top; each row shows the tenant's worst-state rollup.
- Selected tenant is URL-encoded (`?client=<id>`) so a shared link lands in the same tenant context. "All clients" = absent param.
- Tenant switch preserves the current route shape where it makes sense (stay on `/triage`, just re-scoped) and resets cohort-specific filters that no longer apply.

---

## 3. Top bar

```
[≡]  Kaseya Resolution Center  ◂ breadcrumb ▸  Triage / SQL Tier-1 failing      [⌕ Search  f]   ◔3   ⌘K   ◑   ⏷
 │    └ wordmark (→ /triage)   └ trail from nav.ts + route                  └ omni      │    │     │   └ user
 └ sidebar toggle                                                                       notif palette theme
```

| Element | Behavior |
|---|---|
| **Sidebar toggle** | Collapse/expand the nav shell sidebar (also `[` shortcut). |
| **Wordmark** | Returns to `/triage` (the home surface), not `/overview`. |
| **Breadcrumbs** | Derived from `config/nav.ts` + current route + the resolved entity name. E.g. `Assets / SQL-01` or `Triage / Backup failing — SQL Tier-1`. Each crumb is a link to its level. The cohort filter that produced a detail view is preserved on "back" navigation. |
| **Omni-search** (`f`) | Global search across assets, incidents, clients, playbooks, actions, error codes, IPs. Type-ahead grouped results. `f` focuses it from anywhere (not while typing in a field). Distinct from the command palette: search finds *things*, palette runs *commands*. |
| **Command palette** (`⌘K` / `Ctrl K`) | Action-oriented: "Run playbook…", "Go to client…", "Retry backup on…", "Create incident", "Toggle dark mode", "Switch tenant". Also surfaces navigation as commands ("Go to Run History"). Keyboard-first audience — this is a primary entry point, not a nicety. |
| **Notifications** (`◔` with count) | Dropdown feed: new incidents, completed/failed runs awaiting review, approvals pending *my* sign-off, auto-remediation actions taken overnight. Each links to the relevant detail. Worst-severity count badge. |
| **Theme toggle** | Light / dark (slate) / system. Persisted in `ui-store`. |
| **User menu** | Account (`nimda_sys@hotmail.com`), role, "My saved views", keyboard-shortcut reference, sign out. |

---

## 4. Full route map (Next.js App Router)

All authenticated routes live under the `(console)` route group (shared shell). `(console)/page.tsx` redirects `/` → `/triage`. Dynamic segments in `[brackets]`. Primary entity = the [domain entity](05-domain-model.md) the page is built around.

| Route | Page | Purpose | Primary entity |
|---|---|---|---|
| `/` | — | Redirect → `/triage`. | — |
| `/triage` | **Triage Queue** | Default landing. Grouped, prioritized incidents; bulk + per-incident contextual actions. | `Incident` (grouped `Alert`s) |
| `/triage/[incidentId]` | **Incident detail** | Grouped alerts (why grouped) · shared "what changed" timeline · affected cohort · suggested playbooks. | `Incident` |
| `/overview` | **Overview / Command Center** | Lean fleet health roll-up: backup-health rollup, coverage, SLA/RPO, recency-at-risk, incident preview. Every segment links into a filtered list. | fleet rollup (read-only) |
| `/assets` | **Assets & Protection** | The cross-product workhorse table. Faceted filters, saved views, bulk action toolbar, last-10 dot-strip. | `ProtectedAsset` |
| `/assets/[assetId]` | **Asset detail** | Single-page troubleshooting surface: "Why is this red?" · "What changed" · backup timeline · restore points · open alerts · related cohort · action bar. Tabbed. | `ProtectedAsset` |
| `/products/bcdr` | **BCDR lens** | `/assets` scoped to BCDR with BCDR columns (appliance, chain state, ZFS pool %, last screenshot, offsite sync) + appliance roll-up. | `Appliance` / `ProtectedMachine` |
| `/products/bcdr/appliances/[applianceId]` | **Appliance detail** | SIRIS/ALTO device health: ZFS pool, inverse chain, local virtualization, offsite sync, protected-machine list. | `Appliance` |
| `/products/endpoint-backup` | **Endpoint Backup lens** | DEB v1 + v2 agents; migration (v1→v2) status column; direct-to-cloud job health. | `EndpointAgent` |
| `/products/datto-cloud` | **Datto Cloud DR lens** | Cloud restore/virtualization, test-failover readiness, VPN/IPsec status, retention posture. | `CloudDRWorkload` |
| `/products/saas-protect` | **SaaS Protect lens** | M365 + Google tenants; OAuth/consent health, seat/license sync, API-throttle state, per-service (Exchange/SharePoint/OneDrive/Teams) coverage. | `SaaSTenant` / `SaaSSeat` |
| `/products/spanning` | **Spanning lens** | Salesforce + M365 + Google; metadata backup, API rate-limit state, seat sync, sandbox-seeding jobs. | `SpanningConnection` / `SpanningSeat` |
| `/automation` | **Actions & Playbooks** | Catalog of atomic remediation actions + saved playbooks + auto-remediation policies (three tabs). | `Action` / `Playbook` / `AutoPolicy` |
| `/automation/playbooks/[playbookId]` | **Playbook detail/editor** | Step sequence, params, scope, approval gates, trigger mode, success rate, run history; "Load into cart". | `Playbook` |
| `/automation/policies/[policyId]` | **Auto-remediation policy detail** | The "apply always going forward" rule: match conditions, action, scope, gates, kill-switch, recent fires. | `AutoPolicy` |
| `/automation/runs` | **Run History & Audit** | Immutable feed of every run; per-asset fan-out outcomes; filter by playbook/asset/outcome/date; export. | `Run` |
| `/automation/runs/[runId]` | **Run detail** | Per-step logs, params used, evidence captured, who/trigger, per-asset breakdown; links back to triggering incident/asset. | `Run` |
| `/reports` | **Reports** | Recurring-failure trends, SLA/RPO compliance over time, alert-volume, automation coverage/ROI. | aggregates |
| `/reports/[reportId]` | **Report detail** | A single saved/standard report with its chart + drill-through table. | report |
| `/setup` | **Setup** (index → tabs) | Tenant config hub. | settings |
| `/setup/connections` | **Connections** | Integration/credential health per product (OAuth grants, appliance registration, API keys) — themselves a source of failures to remediate. | `Connection` |
| `/setup/approvals` | **Approval policies** | Which actions require sign-off, by whom, for which scopes. | `ApprovalPolicy` |
| `/setup/notifications` | **Notification rules** | Routing of incidents/run outcomes to channels. | `NotificationRule` |
| `/setup/preferences` | **Preferences** | Density, theme default, saved-view defaults, keyboard map. | prefs |

**Global overlays (route-independent, not in the route map):**

- **Action cart** — slide-in `Sheet`, openable from anywhere, persisted in Zustand. Chains actions before commit. See [automation engine](07-troubleshooting-and-automation-engine.md).
- **Command palette** — `⌘K` overlay.
- **Omni-search results** — `f` overlay/popover.
- **Asset quick-peek** — a right `Sheet` summarizing an asset without leaving the list (open id in URL `?peek=<assetId>`); the full `/assets/[assetId]` route is the deep view.

**App Router mechanics:** each route ships a `loading.tsx` for skeletons during simulated latency; `(console)/layout.tsx` holds the persistent shell so the cart badge and sidebar never flicker on navigation; thin `page.tsx` files compose components and read from `lib/mock/query.ts` (swappable for a real API later).

---

## 5. Drill-down paths

The IA's spine is the aggregate → cohort → asset → remediation flow. Every red is a one-click path to context, cause, and a fix — **no dead-end reds**. Filter context rides the URL the whole way down.

```
Overview ──(click rollup segment "19 Failing")──► /assets?status=failing      (the exact 19)
   │                                                       │
   │                                                 (click a row)
   ▼                                                       ▼
/triage ──(Investigate)──► /triage/[incidentId] ─────► /assets/[assetId]
   │                              │  grouped alerts,            │  Why-red · What-changed
   │                              │  what-changed, cohort       │  timeline · restore points
   │                              └─(Run playbook)──┐           │
   │                                                ▼           │ (Retry / Run playbook / Remote / Ticket)
   └────────────────────────────────────► /automation ◄────────┘
                                                │  catalog · playbooks · policies
                                                ▼
                                        /automation/runs ──► /automation/runs/[runId]
                                                                  (evidence; links back to incident/asset)
```

**Canonical worked example (the 2 a.m. story from [PRODUCT.md](../PRODUCT.md)):**

| Step | Surface | URL | What the tech does |
|---|---|---|---|
| 1 | Triage Queue | `/triage` | Sees `P1 Backup failing — SQL Tier-1 · 14 assets · likely cause: agent 7.4.2 regression`. |
| 2 | Incident detail | `/triage/inc_8821` | Reads grouped alerts ("Grouping Now · 14"), the "what changed" timeline (agent updated 18 min before first failure), the affected cohort. |
| 3 | Cohort list | `/assets?incident=inc_8821` (or `?policy=tier1-hourly&status=failing`) | Reviews the exact 14 assets in the workhorse table; selects all. |
| 4a | Bulk remediate | bulk toolbar → "Run playbook: Rollback agent" | Adds the rollback playbook to the cart scoped to the 14; reviews preview/dry-run; commits (approval gate if required). |
| 4b | Single drill | `/assets/sql-01` | Or drills into one asset to confirm "Why is this red?" + "What changed" before deciding. |
| 5 | Audit | `/automation/runs/run_4471` | Run completes `13✓ / 1✕`; the one failure links back to its asset to continue. |
| 6 | Fix forever | "Save as playbook" / "Apply always" → `/automation/policies/...` | Turns the fix into an auto-remediation policy so the next 7.4.2 regression self-heals. |

Two more drill entries worth stating explicitly:

- **From a product lens:** `/products/saas-protect` → click "7 tenants: consent expired" → `/products/saas-protect?issue=oauth_expired` (re-scoped same table) → tenant detail → "Re-authorize OAuth" action.
- **From notifications:** a completed auto-remediation notification → `/automation/runs/[runId]` → back-link to the asset it healed.

---

## 6. URL state strategy (nuqs)

**Principle:** anything that defines *what you are looking at* is URL-encoded and shareable; anything that is *transient personal UI* is local state. Pasting a URL must reproduce the exact same view (same tenant, same filters, same tab, same open detail, same sort).

### 6.1 What is URL-encoded

| Concern | Param(s) | Type / encoding | Scope |
|---|---|---|---|
| Tenant/client | `client` | string id (absent = all clients) | global, persists across routes |
| Product filter | `product` | enum: `bcdr \| endpoint \| cloud \| saas \| spanning` (multi via comma) | list/triage |
| Status | `status` | enum multi: `failed,warning,offline,syncing,paused,protected` | list/triage |
| Severity | `sev` | enum multi: `p0,p1,p2,p3` | triage |
| Category | `category` | enum multi (failure category, e.g. `chain,offsite,oauth,storage,agent`) | list/triage |
| Site / group | `site` | string id multi | list |
| Time window | `range` | preset (`24h,7d,30d`) or `from`/`to` ISO | list/runs/reports |
| Free-text search (in-table) | `q` | string | list/runs |
| Active tab | `tab` | enum per page (e.g. asset: `overview,jobs,alerts,runs,actions`) | detail pages |
| Sort | `sort` | `field:dir` (e.g. `lastGood:desc`) | tables |
| Pagination | `page`, `pageSize` | int | tables |
| Selected detail (quick-peek) | `peek` | asset id (opens Sheet without leaving list) | list |
| Saved-view id | `view` | string id (resolves to a stored filter set; explicit filter params override) | list/triage |
| Cohort linkage | `incident` / `policy` | id (the cohort that produced this list) | list |

**Encoding conventions:** multi-value filters are comma-joined and sorted deterministically (so the URL is stable/cacheable and two people building the same filter get the same string). Default values are omitted from the URL (a clean default view has a clean URL). nuqs `parseAsArrayOf` + typed parsers; TanStack Table state is wired to nuqs via the shared `use-data-table` hook so sort/filter/page round-trip automatically.

### 6.2 What is NOT URL-encoded (local/Zustand)

- **Action cart contents** (chained actions, edited params) — Zustand `cart-store` + `persist` (`msp-cart`). It must survive reloads and route changes but is personal/in-progress, not a shareable view.
- **Sidebar collapsed, density (dense/comfortable), theme, last-active tenant** — `ui-store` (`msp-ui`).
- **Saved-view *definitions*** — stored in `views-store` (`msp-views`, localStorage); the URL carries only the `view` id that points at one.
- **Command-palette / search open state, hover/focus, toast state** — ephemeral component state.

### 6.3 Precedence rules

1. Explicit filter params in the URL **override** a `view` id's stored filters (so you can deep-link "this saved view but also status=failing").
2. `client` is the outermost scope; clearing it (→ all clients) widens every downstream list.
3. When a saved view is loaded and the user then edits a filter, the view enters a **"modified"** state (badge: `MSP-East •`) — the user can Update the view, Save as new, or Reset. The URL reflects the *effective* filters, not just the view id.

---

## 7. Saved views & filtering model (cross-cutting)

Saved views are **named filter + URL states** (the named-filter + URL-state model), not cloned pages. One master list component, re-scoped by a stored filter set. This is the shareable-saved-view primitive that makes the console feel like a real ops tool.

### 7.1 Global filter dimensions

These six dimensions are the cross-cutting filter vocabulary; they appear (where relevant) as faceted filter chips on every list/triage surface, with live counts driven by the fixtures:

| Dimension | Values | Notes |
|---|---|---|
| **Product** | BCDR · Endpoint Backup · Datto Cloud · SaaS Protect · Spanning | The cross-product unifier. A product lens = this filter pre-applied. |
| **Client / Site** | tenant → site → policy-group hierarchy | Two-level: `client` (global, in switcher) and `site`/group (in-list). |
| **Status** | Protected · Warning · Failed · Paused · Syncing · Offline | Per [design system](03-design-system.md) — dot+icon+label, never color-only. Rollup = worst real child state. |
| **Severity** | P0 · P1 · P2 · P3 | Triage ordering. Severity sort outranks status sort in the queue. |
| **Category** | failure category (chain/diff-merge, offsite sync, ZFS storage, agent wedged, OAuth/consent, API throttle, seat sync, screenshot/verification, retention, networking…) | Sourced from the [failure catalog](02-failure-catalog.md). The "why" axis. |
| **Time** | last 24h / 7d / 30d / custom | Scopes recency, run history, trend windows. |

### 7.2 Filter bar anatomy (shared component)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [View: MSP-East • ▾]  [Product: BCDR ✕] [Status: Failing ✕] [Site: Denver ✕]   │
│ + Add filter            ⌕ q…                  [Update view] [Save as…] [Reset]  │
│ Showing 19 of 904       ☑ Bulk: [Retry] [Run playbook ▾] [Add to cart] [Ticket]│
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Active filters are removable chips**; the set of chips *is* the saved-view definition.
- **"+ Add filter"** opens a faceted-filter popover (`Popover` + `Command` + counts) across the six dimensions.
- **Bulk toolbar** appears on row selection — operates on the arrived-with cohort (the "X failing" group), feeding the [automation cart](07-troubleshooting-and-automation-engine.md).
- The **`•` modified indicator** signals the view diverges from its saved definition.

### 7.3 Saved-view model

```ts
type SavedView = {
  id: string;
  name: string;              // "MSP-East failing backups"
  scope: "global" | "triage" | "assets" | `product:${ProductId}`; // where it applies
  filters: {                 // the encodable filter set
    product?: ProductId[];
    status?: Status[];
    severity?: Severity[];
    category?: FailureCategory[];
    site?: string[];
    range?: TimeRange;
    q?: string;
  };
  sort?: { field: string; dir: "asc" | "desc" };
  columns?: string[];        // optional column visibility/order
  owner: string;             // userEmail
  shared: boolean;           // visible to team (mock: just a flag)
  pinned?: boolean;          // surfaces in sidebar/view dropdown
  createdAt: string;
};
```

- **Storage:** `views-store` (Zustand + `persist`, key `msp-views`). Seeded with 3–4 useful views so the dropdown isn't empty: *"Failing — all products"*, *"SaaS consent expiring (7d)"*, *"BCDR offsite sync stalled"*, *"My snoozed"*.
- **Selector:** lives in the filter bar (`View: … ▾`) and in the user menu ("My saved views"). Selecting one writes `?view=<id>` and applies its filters.
- **Sharing:** a shared view is just a URL — "share" copies the deep link. The `shared` flag also lists it in a team section of the dropdown (mock).
- **Scope:** a view bound to `product:bcdr` only offers in the BCDR lens; `global` views appear everywhere relevant.

---

## 8. Cross-product vs per-product navigation

The single hardest IA question: **how do six products with different domain shapes coexist in one console without fragmenting the experience?** The answer is a deliberate two-layer model.

### 8.1 Layer 1 — Cross-product (the default everywhere)

`/triage`, `/assets`, `/overview`, `/automation`, `/automation/runs`, `/reports` are **product-agnostic**. They render every product side by side, with `product` as a filter dimension and a column/badge on each row. A tech triaging a 2 a.m. alert storm should not have to know or care which product each failure belongs to — they triage by severity and cause, and the product is just metadata. This honors PRODUCT.md's "earned familiarity": one table model, one button vocabulary, one status badge, across all six.

### 8.2 Layer 2 — Per-product lens (on demand)

`/products/[product]` routes are **specialized views of the same workhorse table**, differing only where the domain genuinely diverges:

| Product | What the lens adds beyond the generic table | Specialized child routes |
|---|---|---|
| **BCDR** | Appliance roll-up, ZFS pool %, inverse-chain state, last screenshot/boot-test, offsite-sync recency, local-virtualization readiness | `/products/bcdr/appliances/[id]` |
| **Endpoint Backup** | DEB v1 vs v2 split, migration status, direct-to-cloud job health (no appliance) | — |
| **Datto Cloud DR** | Test-failover readiness, cloud-virtualization state, VPN/IPsec status, retention posture | — |
| **SaaS Protect** | Per-service coverage (Exchange/SharePoint/OneDrive/Teams), OAuth/consent health, seat/license sync, Graph/Google throttle | `/products/saas-protect/tenants/[id]` |
| **Spanning** | Salesforce + M365 + Google connections, metadata backup, API rate-limit state, sandbox-seeding | `/products/spanning/connections/[id]` |

**The unifying mechanic:** a product lens is sugar for the generic list with `product=<id>` pre-applied **plus** that product's column preset and detail tabs. The entity-detail pages converge: a BCDR protected machine, a DEB endpoint, and a SaaS seat all resolve through `/assets/[assetId]` with the **same** "Why is this red? / What changed / timeline / actions" skeleton, hydrated with product-appropriate facts (a SaaS seat shows OAuth grant + seat license where a BCDR machine shows chain state + ZFS). The shared shape is what makes one console feel like one product, not six bolted together — which is exactly the anti-reference PRODUCT.md warns against.

### 8.3 Coexistence rules (summary)

1. **Triage and remediate cross-product by default; narrow to a product only for its specialized facts.**
2. **`/assets/[assetId]` is the convergence point** — one detail skeleton, product-specific content.
3. **Actions are product-scoped in the catalog** (a "Re-authorize OAuth" action only offers on SaaS/Spanning assets; "Run diff-merge" only on BCDR) but invoked through the *same* cart/playbook machinery — see [automation engine](07-troubleshooting-and-automation-engine.md) and [failure catalog](02-failure-catalog.md).
4. **The `product` filter is the seam** — present on every cross-product surface, pre-applied on every per-product lens.

---

## 9. Open decisions flagged

- **Quick-peek Sheet vs full route for asset detail:** the architecture research suggests both (`?peek=` Sheet for triage speed, `/assets/[assetId]` for deep work). Spec assumes both coexist; confirm whether the product lens detail pages (`/products/.../[id]`) should redirect into the unified `/assets/[assetId]` with a product tab preset, or remain distinct routes. Recommendation: unify on `/assets/[assetId]` and treat the product child-routes as redirects-with-preset to keep the convergence rule (§8.2) literal — pending the [domain model](05-domain-model.md) finalizing whether appliances/tenants are first-class assets or parents-of-assets.
- **Overview vs Triage as `/`:** locked to `/triage` per the triage-first mandate; Overview reachable but never default. Re-confirm with stakeholders that no role wants a dashboard-first landing.
