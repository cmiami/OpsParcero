# 10 — Component Inventory

The atomic component inventory: every UI need mapped to a shadcn primitive or custom composite, with props, variants/states, Storybook home, and a11y notes — plus an auditable coverage table for 100% story coverage.
Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

---

## 0. How to read this inventory

This doc is the bridge between the [design system](03-design-system.md) (tokens, per-surface styling) and the [Storybook architecture](storybook-design-system.md) (how stories are organized + enforced). It enumerates **what gets built**, at which atomic level, on which shadcn basis, with the props/variants/states a builder needs.

**Conventions used in every entry:**

| Field | Meaning |
|---|---|
| **Level** | Foundations / Atom / Molecule / Organism / Template (per atomic design) |
| **Basis** | The shadcn/Radix primitive it wraps, or `custom` if hand-built |
| **Source** | File path under `src/` |
| **Story** | Storybook `title` path → file path |
| **States** | Every meaningful state that needs a named story export |

**Hard rules carried from the design system (do not restate per-component, they apply to all):**
- Tokens only — no hardcoded hex/px in any component ([§0 design-system](03-design-system.md)).
- Status is never color-only: dot + icon + label, always ([§8 design-system](03-design-system.md)).
- Every component file has a sibling `.stories.tsx`; every variant/state is a named export; `autodocs` on; zero axe violations at `error` level ([§6 storybook](storybook-design-system.md)).
- WCAG 2.2 AA; `focus-visible` ring on every interactive element; no `outline:none` without replacement.
- Impeccable bans apply globally ([§11 design-system](03-design-system.md)): no nested cards, no decorative side-stripes, no gradient text, no glassmorphism, no hero-metric, no identical icon-card grids, no per-section uppercase eyebrows.

**Naming:** `title: '<Level>/<PascalName>'`, e.g. `Atoms/StatusBadge`, `Organisms/DataTable`.

---

## 1. Foundations

Token layers rendered as visual reference stories. No interactive component; controls disabled. All live under `src/stories/foundations/` and use the theme toolbar so light + dark are both inspectable. See [§5 storybook](storybook-design-system.md) and [§12 design-system](03-design-system.md).

| Story | Renders | Title path | Source |
|---|---|---|---|
| Color | All semantic + brand + status + sidebar swatches; token name, light hex, dark hex, role | `Foundations/Color` | `foundations/Color.stories.tsx` |
| Typography | Each type-scale step with live specimen; notes 14px base | `Foundations/Typography` | `foundations/Typography.stories.tsx` |
| Spacing | 4px-grid scale as a visual ruler (4 → 64) with Tailwind class | `Foundations/Spacing` | `foundations/Spacing.stories.tsx` |
| Radius & Elevation | Radius scale + elevation 0–3 (shadow in light, border in dark) | `Foundations/Radius & Elevation` | `foundations/RadiusElevation.stories.tsx` |
| Icons | Status + domain + action + chrome lucide sets at 16/20px, with `spin` demo | `Foundations/Icons` | `foundations/Icons.stories.tsx` |
| Status System | All 6 states (dot+icon+label), severity order, fleet-rollup demo | `Foundations/Status System` | `foundations/StatusSystem.stories.tsx` |

**a11y:** Foundations stories must themselves pass axe (swatch labels are real text, not `title`-only). The Status story is the canonical proof that no state relies on color alone.

---

## 2. Atoms

### 2.1 shadcn primitives we adopt

These are vendored via the shadcn CLI into `src/components/ui/`, then re-storied with Datto tokens/args. Variants come from the component's CVA; keep `argTypes.options` synced to `buttonVariantKeys`-style exports ([§12 storybook](storybook-design-system.md)).

| Component | Basis | Variants / key props | States needing a story | Title path |
|---|---|---|---|---|
| **Button** | `ui/button` (Radix Slot + CVA) | `variant`: default/secondary/outline/ghost/destructive/link + **`kaseya`** (upsell only); `size`: default/sm/lg/icon | Primary, Secondary, Outline, Ghost, Destructive, Kaseya, IconOnly, Loading, Disabled, FocusInteraction | `Atoms/Button` |
| **Input** | `ui/input` | `type`, `disabled`, `aria-invalid` | Default, Focused, Error, Disabled, WithIcon | `Atoms/Input` |
| **Textarea** | `ui/textarea` | `resize-y`, mono variant for logs | Default, Mono (log), Error, Disabled | `Atoms/Textarea` |
| **Label** | `ui/label` (Radix Label) | `htmlFor`, required asterisk slot | Default, Required | `Atoms/Label` |
| **Badge** | `ui/badge` (CVA) | `variant`: default/secondary/outline/destructive | Each variant + Count (notification dot) | `Atoms/Badge` |
| **Checkbox** | `ui/checkbox` (Radix) | `checked`, `indeterminate`, `disabled` | Unchecked, Checked, Indeterminate, Disabled | `Atoms/Checkbox` |
| **Switch** | `ui/switch` (Radix) | `checked`, `disabled` | Off, On, Disabled | `Atoms/Switch` |
| **RadioGroup** | `ui/radio-group` (Radix) | `value`, item `disabled` | Default, Selected, Disabled | `Atoms/RadioGroup` |
| **Select** | `ui/select` (Radix) | `value`, grouped options, `disabled` | Closed, Open, Grouped, Disabled | `Atoms/Select` |
| **Avatar** | `ui/avatar` (Radix) | `src`, initials fallback, size | Image, InitialsFallback, Sizes | `Atoms/Avatar` |
| **Skeleton** | `ui/skeleton` | shape via className | Line, Block, TableRow | `Atoms/Skeleton` |
| **Separator** | `ui/separator` (Radix) | `orientation` | Horizontal, Vertical | `Atoms/Separator` |
| **Tooltip** | `ui/tooltip` (Radix) | `side`, `delayDuration` | Top, Side, OnIconButton | `Atoms/Tooltip` |
| **Tabs** | `ui/tabs` (Radix) | `defaultValue`, orientation | TwoTab, ManyTab, Disabled | `Atoms/Tabs` |
| **Kbd** | custom (tiny) | keycap styling | Single, Combo (⌘K) | `Atoms/Kbd` |

> **Button props sketch.** Standard shadcn signature; the only Datto-specific addition is the `kaseya` variant — banned for routine actions, allowed only on upsell/"Powered by Kaseya" CTAs ([§9.1 design-system](03-design-system.md)).
> ```ts
> interface ButtonProps extends React.ComponentProps<'button'> {
>   variant?: 'default'|'secondary'|'outline'|'ghost'|'destructive'|'link'|'kaseya'
>   size?: 'default'|'sm'|'lg'|'icon'
>   asChild?: boolean
>   loading?: boolean   // swaps label for spinner, keeps width, sets aria-busy
> }
> ```

**a11y for atoms:** icon-only Button requires `aria-label` + a Tooltip. Checkbox/Switch/Radio inherit Radix labelling — every instance needs an associated `Label`. Select trigger needs an accessible name. Skeleton containers set `aria-busy="true"` and `aria-hidden` on the shimmer.

### 2.2 Custom atoms

Single-purpose, no composed children. Live in feature folders (`status/`, `mono/`), not `ui/`.

| Component | Basis | Props sketch | States | Title path · Source |
|---|---|---|---|---|
| **StatusBadge** | custom (`span`) | `state: BackupStatus; label?; showIcon?; showDot?; size?: 'sm'\|'md'` | 6 states (Protected/Warning/Failed/Paused/Syncing/Offline) + AllStates + sizes | `Atoms/StatusBadge` · `status/status-badge.tsx` |
| **SeverityDot** | custom (`span`) | `state: BackupStatus; pulse?: boolean` | 6 colors + Pulsing(syncing) | `Atoms/SeverityDot` · `status/severity-dot.tsx` |
| **MonoLabel** | custom (`code`) | `children; copyable?: boolean; truncate?: boolean` | Plain, Copyable, Truncated(tooltip) | `Atoms/MonoLabel` · `mono/mono-label.tsx` |
| **ProductBadge** | custom chip | `product: ProductKey` (BCDR/DEB/DEBv2/Cloud/SaaSProtect/Spanning); shows domain icon, never per-product color | One export per product | `Atoms/ProductBadge` · `product/product-badge.tsx` |

`BackupStatus` and `ProductKey` are imported from the [domain model](05-domain-model.md), not redefined per-component.

> **StatusBadge contract** ([§8 design-system](03-design-system.md), [§8 storybook](storybook-design-system.md)):
> ```ts
> export type BackupStatus =
>   'protected'|'warning'|'failed'|'paused'|'syncing'|'offline'
> export interface StatusBadgeProps {
>   state: BackupStatus
>   label?: string          // defaults to capitalized state
>   showIcon?: boolean       // default true
>   showDot?: boolean        // default true
>   size?: 'sm'|'md'         // sm=table cell, md=panel header
>   className?: string
> }
> ```
> Renders `<span aria-label="{state}: ...">` → SeverityDot (aria-hidden) + lucide icon (aria-hidden, `data-testid="status-icon"`) + visible label. `syncing` icon gets `animate-spin` (duration-1000); reduced-motion swaps to static `loader`.

---

## 3. Molecules

Compositions of 2–4 atoms serving one UX function. Most live in feature folders.

| Component | Basis | Props sketch | States | Title path · Source |
|---|---|---|---|---|
| **FormField** | custom | `label; required?; htmlFor; error?; helper?; children` (wraps Label + control + helper/error) | Default, Required, WithHelper, Error, Disabled | `Molecules/FormField` · `forms/form-field.tsx` |
| **SearchField** | `ui/input` + icon + Kbd | `value; onChange; placeholder; shortcut?: string` | Empty, Typing, WithShortcutHint, Loading | `Molecules/SearchField` · `forms/search-field.tsx` |
| **FilterChip** | `ui/badge` + `x` button | `label; value; onRemove?; active?` | Static, Dismissible, Active | `Molecules/FilterChip` · `filters/filter-chip.tsx` |
| **SeverityChip** | StatusBadge + count | `state; count: number` — compact rollup pill (e.g. `● Failed 3`) | One per state + ZeroSuppressed | `Molecules/SeverityChip` · `status/severity-chip.tsx` |
| **StatusBadge (cell)** | StatusBadge | — | covered in Atoms | — |
| **BackupHealthCell** | StatusBadge + relative time + Last10DotStrip | `status; lastBackupAt; runs: BackupRun[]` | Protected, Failed, MixedHistory, NeverRun | `Molecules/BackupHealthCell` · `table-cells/backup-health-cell.tsx` |
| **Last10DotStrip** | custom (10 SeverityDots) | `runs: BackupRun[]; max?: number` (each dot has per-run tooltip) | AllGreen, MixedFailures, PartialHistory(<10), Empty | `Molecules/Last10DotStrip` · `table-cells/last10-dot-strip.tsx` |
| **KpiTile** | custom (Tremor-style) | `label; value; delta?; deltaLabel?; sublabel?; trend?: number[]` | Flat, PositiveDelta, NegativeDelta, WithSparkline, Loading(skeleton) | `Molecules/KpiTile` · `kpi/kpi-tile.tsx` |
| **Card** | `ui/card` | header/content/footer slots; `actionMenu?` | Default, WithActionMenu, WithFooter | `Molecules/Card` · `ui/card.tsx` |
| **ToastContent** | sonner render | `variant: success/error/warning/info; title; description?; action?` | One per variant + WithAction + Persistent(error) | `Molecules/ToastContent` · `toast/toast-content.tsx` |
| **Breadcrumb** | `ui/breadcrumb` | `items: {label; href?}[]` | TwoLevel, DeepNested, LeafCurrent | `Molecules/Breadcrumb` · `ui/breadcrumb.tsx` |
| **DropdownMenu** | `ui/dropdown-menu` (Radix) | items, separators, destructive item | RowActions, WithDestructive, WithCheckboxItems | `Molecules/DropdownMenu` · `ui/dropdown-menu.tsx` |
| **Pagination** | `ui/pagination` | `page; pageCount; onPageChange` | FirstPage, MidPage, LastPage, SinglePage | `Molecules/Pagination` · `ui/pagination.tsx` |
| **DateRangePicker** | `ui/popover` + calendar | `range; presets` | Closed, Open, PresetSelected | `Molecules/DateRangePicker` · `forms/date-range-picker.tsx` |
| **Alert** | `ui/alert` | `variant: info/warning/destructive; title; description` | One per variant | `Molecules/Alert` · `ui/alert.tsx` |
| **ApplyScopeControl** | RadioGroup + helper copy | `value: ScopeMode; matchCount?: number` | Once, AllMatching, AlwaysForward | `Molecules/ApplyScopeControl` · `automation/apply-scope-control.tsx` |
| **PlaybookStepCard** | Card-lite + zap icon + drag handle | `step: PlaybookStep; index; onRemove; dragHandleProps` | Default, Dragging, ErrorStep, ApprovalGated | `Molecules/PlaybookStepCard` · `playbook/playbook-step-card.tsx` |
| **ApprovalRequestCard** | Card + Avatar + status pill + actions | `request: ApprovalRequest; canApprove?` | Pending, Approved, Rejected, ReadOnly(viewer) | `Molecules/ApprovalRequestCard` · `approvals/approval-request-card.tsx` |

> **ApplyScopeControl** is the load-bearing molecule for the automation model ([§ engine](07-troubleshooting-and-automation-engine.md)). It captures the three scopes a remediation can take:
> ```ts
> type ScopeMode = 'once' | 'all-matching' | 'always-forward'
> interface ApplyScopeControlProps {
>   value: ScopeMode
>   onChange: (m: ScopeMode) => void
>   matchCount?: number   // "applies to 14 matching assets"
>   disabled?: boolean
> }
> ```
> `always-forward` (auto-remediation) renders with a subtle warning affordance + helper text since it creates a standing policy.

**a11y for molecules:** FormField wires `Label htmlFor` ↔ control `id`, and `aria-describedby` to helper/error; error text gets `role="alert"`. Last10DotStrip exposes a visually-hidden summary (`"7 of 10 backups succeeded"`) so the dot row isn't the only signal. ToastContent uses `role="status"` (success/info) or `role="alert"` (error/warning). KpiTile delta direction is conveyed by an arrow icon + sign, not color alone.

---

## 4. Organisms

App-specific composites that embed data, Zustand state, or multiple molecules. Live in dedicated feature folders. These get the heaviest story coverage (every column/empty/error/selection state).

### 4.1 Navigation & search shell

| Component | Basis | Props / state | States | Title path · Source |
|---|---|---|---|---|
| **AppSidebar** | `ui/sidebar` (Radix) + nav config | `activeRoute; collapsed; tenant` | Expanded, Collapsed, ActiveItem, TenantSwitcherOpen | `Organisms/AppSidebar` · `shell/app-sidebar.tsx` |
| **TopBar** | Breadcrumb + SearchField + bell + Avatar | `breadcrumb; unreadCount; user` | Default, UnreadNotifications, MenuOpen | `Organisms/TopBar` · `shell/top-bar.tsx` |
| **OmniSearch / CommandPalette** | `ui/command` (cmdk) | `open; onSelect; sources: assets/jobs/playbooks/docs` | Closed, OpenEmpty, Results, NoResults, KeyboardNav | `Organisms/CommandPalette` · `shell/command-palette.tsx` |

AppSidebar nav config mirrors the [information architecture](04-information-architecture.md) sections (Overview / Protection / SaaS / Automation / Reports & Audit / Settings). The sidebar does **not** flip in dark mode — it is always white nav ([§7.3 storybook](storybook-design-system.md)).

### 4.2 Data surfaces

| Component | Basis | Props / state | States | Title path · Source |
|---|---|---|---|---|
| **DataTable** | TanStack Table + `ui/table` | generic `columns; data; selection; sorting; columnVisibility; density; savedViews` | Default, Empty, Loading(skeleton), Error, WithRowSelected→BulkToolbar, SortedBySeverity, CompactDensity, ColumnPickerOpen, SavedViewApplied | `Organisms/DataTable` · `data-table/data-table.tsx` |
| **DataTableBulkToolbar** | (slot of DataTable) | `selectedCount; actions` | OneSelected, ManySelected, AllSelected | `Organisms/DataTable` (sub-story) |
| **AssetTable** | DataTable preset | `assets: Asset[]` | Default, AllFailed, MixedFleet, Empty | `Organisms/AssetTable` · `data-table/asset-table.tsx` |
| **RunHistoryTable** | DataTable preset | `runs: BackupRun[]; assetId` | WithFailures, AllSuccess, Empty | `Organisms/RunHistoryTable` · `data-table/run-history-table.tsx` |
| **FleetRollup** | SeverityChip row + donut | `summary: Record<BackupStatus, number>` | Healthy, Degraded(some failed), AllFailed, SingleSite | `Organisms/FleetRollup` · `fleet/fleet-rollup.tsx` |

> **DataTable props sketch** — the product's core surface ([§9.3 design-system](03-design-system.md), [§9 storybook](storybook-design-system.md)):
> ```ts
> interface DataTableProps<T> {
>   columns: ColumnDef<T>[]
>   data: T[]
>   isLoading?: boolean
>   error?: string
>   enableSelection?: boolean
>   defaultSort?: SortingState
>   density?: 'default' | 'compact'
>   savedViews?: SavedView[]
>   bulkActions?: BulkAction<T>[]   // render the inverted-primary bulk toolbar
>   stickyFirstColumn?: boolean      // checkbox + name pinned left
>   columnPicker?: boolean           // persists columnVisibility to localStorage
> }
> ```
> Selected rows get `bg-primary/8` + 2px left border; the bulk toolbar slides in with `role="toolbar" aria-label="bulk actions"`. Sortable `<th>` carry `aria-sort`. Empty/error/loading are first-class states (skeletons, never a centered spinner — impeccable ban).

`FleetRollup` enforces the **worst-real-child-state** rule ([§8 design-system](03-design-system.md)): the headline badge is the lowest-severity-integer child present.

### 4.3 Triage & diagnosis

| Component | Basis | Props / state | States | Title path · Source |
|---|---|---|---|---|
| **AlertTriageRow** | table-row composite | `alert: Alert; assignee?; onTriage` | New, Acknowledged, Assigned, Snoozed, Resolved | `Organisms/AlertTriageRow` · `triage/alert-triage-row.tsx` |
| **AlertTriageList** | virtualized list of rows | `alerts: Alert[]; groupBy?` | Default, Grouped, Empty, BulkSelect | `Organisms/AlertTriageList` · `triage/alert-triage-list.tsx` |
| **AssetTimeline** | vertical timeline + log entries | `events: TimelineEvent[]` | Mixed, FailureFocused, Sparse, LiveTail | `Organisms/AssetTimeline` · `diagnostics/asset-timeline.tsx` |
| **RemediationPanel** | Tabs + suggested actions + ApplyScopeControl + confirm | `failure: FailureContext; suggestedActions: Action[]` | SuggestionList, ActionSelected, ScopeChosen, Confirm, Executing, Success, Failure | `Organisms/RemediationPanel` · `remediation/remediation-panel.tsx` |

`RemediationPanel` is where a technician goes from "why did it fail" to "fix it." It pulls suggested actions from the [failure catalog](02-failure-catalog.md) keyed by error code, then routes the chosen fix into the ActionCart or executes inline. Scope selection uses the shared `ApplyScopeControl` molecule.

### 4.4 Automation (Zustand-backed)

| Component | Basis | Props / state | States | Title path · Source |
|---|---|---|---|---|
| **ActionCart** | Zustand `action-cart` store + list | reads store `items` | Empty, OneItem, ManyItems, MixedScopes, ReadyToRun | `Organisms/ActionCart` · `automation/action-cart.tsx` |
| **ChainBuilder** | dnd-kit reorder + PlaybookStepCard | `steps; onReorder; onSavePlaybook` | Empty, SingleStep, Multi, Reordering, WithApprovalGate, SavedAsPlaybook | `Organisms/ChainBuilder` · `automation/chain-builder.tsx` |
| **AutomationPolicyEditor** | form + condition rows + ApplyScopeControl | `policy: AutomationPolicy` | New, Editing, ConditionAdded, AlwaysForwardWarning, Disabled | `Organisms/AutomationPolicyEditor` · `automation/automation-policy-editor.tsx` |
| **PlaybookCard** | Card + step summary + scope + trigger + audit meta | `playbook: Playbook` | Manual, Triggered, AutoRemediation, Disabled | `Organisms/PlaybookCard` · `playbook/playbook-card.tsx` |
| **PlaybookList** | grid/list of PlaybookCards | `playbooks: Playbook[]` | Default, Empty, FilteredByProduct | `Organisms/PlaybookList` · `playbook/playbook-list.tsx` |

ActionCart and ChainBuilder share the Zustand `action-cart` store; stories must reset store state per render via the `withActionCart` decorator to avoid leakage ([§10/§13 storybook](storybook-design-system.md)). ChainBuilder is the path to saving a reusable **Playbook** ([§ engine](07-troubleshooting-and-automation-engine.md)).

### 4.5 Approvals, audit & reporting

| Component | Basis | Props / state | States | Title path · Source |
|---|---|---|---|---|
| **ApprovalQueue** | list of ApprovalRequestCards | `requests: ApprovalRequest[]; role` | Pending, MixedStatuses, Empty, ViewerReadOnly | `Organisms/ApprovalQueue` · `approvals/approval-queue.tsx` |
| **RunHistoryTable** | (see §4.2) | — | — | — |
| **AuditLog** | DataTable preset, time-ordered | `entries: AuditEntry[]; filters` | Default, FilteredByActor, FilteredByAction, Empty | `Organisms/AuditLog` · `audit/audit-log.tsx` |
| **ReportChartCard** | Card + Recharts + legend | `chart: ChartSpec` (area/line/bar/donut) | Area, Bar, Donut(fleet health), Empty, Loading | `Organisms/ReportChartCard` · `reports/report-chart-card.tsx` |

`ReportChartCard` uses status tokens for health breakdowns and the categorical order for everything else ([§9.9 design-system](03-design-system.md)); gridlines `strokeDasharray="3 3"`, no axis lines, donut center shows total.

**a11y for organisms:** DataTable carries a `<caption>` and `aria-sort`; the bulk toolbar is a named `role="toolbar"`. CommandPalette is full keyboard-navigable (arrow/enter/escape) with `aria-activedescendant`. AssetTimeline uses an ordered list with timestamps as real text. Charts in ReportChartCard pair every series with a legend label + a data-table fallback (`aria-describedby`), never relying on color to distinguish series.

---

## 5. Templates

Full page layouts with placeholder/slot content and **no real mock data** (that belongs to Pages). Live in `src/components/templates/`.

| Template | Composes | Slots | Story states | Title path · Source |
|---|---|---|---|---|
| **AppShell** | AppSidebar + TopBar + main outlet + Toaster | `children`, `sidebar`, `topbar` | Default, SidebarCollapsed, Dark | `Templates/AppShell` · `templates/app-shell.tsx` |
| **ListPageTemplate** | AppShell + page header (title + KPI row + FilterBar) + DataTable slot | `header`, `filters`, `table` | Default, WithKpis, Empty | `Templates/ListPageTemplate` · `templates/list-page-template.tsx` |
| **DetailPageTemplate** | AppShell + breadcrumb + FleetRollup/health header + Tabs (timeline/history/config) + RemediationPanel rail | `header`, `tabs`, `rail` | Default, WithRemediationRail, Loading | `Templates/DetailPageTemplate` · `templates/detail-page-template.tsx` |
| **TriageTemplate** | AppShell + AlertTriageList (left) + RemediationPanel/DiagnosticPanel (right, split) | `list`, `detail` | SplitView, ListOnly, DetailFocused | `Templates/TriageTemplate` · `templates/triage-template.tsx` |

Templates take slot props (`ReactNode`), so the same template serves multiple [page specs](09-page-specs.md) (BCDR Devices, Endpoint Backup, SaaS Protect all use ListPageTemplate). Stories use placeholder blocks, not seeded data.

---

## 6. Coverage matrix (auditable → 100%)

Every component file must have a sibling `.stories.tsx`. This table is the audit list; the CI coverage-gap lint ([§6.3 storybook](storybook-design-system.md)) enforces it mechanically, and Chromatic snapshots both themes. "Min exports" is the floor of named story exports (variants/states).

| # | Component | Level | Story title | Min exports | Has `play` |
|---|---|---|---|---|---|
| 1 | Color | Foundations | Foundations/Color | 1 | — |
| 2 | Typography | Foundations | Foundations/Typography | 1 | — |
| 3 | Spacing | Foundations | Foundations/Spacing | 1 | — |
| 4 | Radius & Elevation | Foundations | Foundations/Radius & Elevation | 1 | — |
| 5 | Icons | Foundations | Foundations/Icons | 1 | — |
| 6 | Status System | Foundations | Foundations/Status System | 1 | — |
| 7 | Button | Atom | Atoms/Button | 10 | ✓ focus |
| 8 | Input | Atom | Atoms/Input | 5 | ✓ error |
| 9 | Textarea | Atom | Atoms/Textarea | 4 | — |
| 10 | Label | Atom | Atoms/Label | 2 | — |
| 11 | Badge | Atom | Atoms/Badge | 5 | — |
| 12 | Checkbox | Atom | Atoms/Checkbox | 4 | ✓ toggle |
| 13 | Switch | Atom | Atoms/Switch | 3 | ✓ toggle |
| 14 | RadioGroup | Atom | Atoms/RadioGroup | 3 | ✓ select |
| 15 | Select | Atom | Atoms/Select | 4 | ✓ open |
| 16 | Avatar | Atom | Atoms/Avatar | 3 | — |
| 17 | Skeleton | Atom | Atoms/Skeleton | 3 | — |
| 18 | Separator | Atom | Atoms/Separator | 2 | — |
| 19 | Tooltip | Atom | Atoms/Tooltip | 3 | ✓ hover |
| 20 | Tabs | Atom | Atoms/Tabs | 3 | ✓ switch |
| 21 | Kbd | Atom | Atoms/Kbd | 2 | — |
| 22 | StatusBadge | Atom | Atoms/StatusBadge | 7 | ✓ syncing/label |
| 23 | SeverityDot | Atom | Atoms/SeverityDot | 7 | — |
| 24 | MonoLabel | Atom | Atoms/MonoLabel | 3 | ✓ copy |
| 25 | ProductBadge | Atom | Atoms/ProductBadge | 6 | — |
| 26 | FormField | Molecule | Molecules/FormField | 5 | ✓ error |
| 27 | SearchField | Molecule | Molecules/SearchField | 4 | ✓ type |
| 28 | FilterChip | Molecule | Molecules/FilterChip | 3 | ✓ dismiss |
| 29 | SeverityChip | Molecule | Molecules/SeverityChip | 7 | — |
| 30 | BackupHealthCell | Molecule | Molecules/BackupHealthCell | 4 | — |
| 31 | Last10DotStrip | Molecule | Molecules/Last10DotStrip | 4 | ✓ tooltip |
| 32 | KpiTile | Molecule | Molecules/KpiTile | 5 | — |
| 33 | Card | Molecule | Molecules/Card | 3 | — |
| 34 | ToastContent | Molecule | Molecules/ToastContent | 6 | ✓ action |
| 35 | Breadcrumb | Molecule | Molecules/Breadcrumb | 3 | — |
| 36 | DropdownMenu | Molecule | Molecules/DropdownMenu | 3 | ✓ open |
| 37 | Pagination | Molecule | Molecules/Pagination | 4 | ✓ navigate |
| 38 | DateRangePicker | Molecule | Molecules/DateRangePicker | 3 | ✓ open |
| 39 | Alert | Molecule | Molecules/Alert | 3 | — |
| 40 | ApplyScopeControl | Molecule | Molecules/ApplyScopeControl | 3 | ✓ select |
| 41 | PlaybookStepCard | Molecule | Molecules/PlaybookStepCard | 4 | — |
| 42 | ApprovalRequestCard | Molecule | Molecules/ApprovalRequestCard | 4 | ✓ approve |
| 43 | AppSidebar | Organism | Organisms/AppSidebar | 4 | ✓ collapse |
| 44 | TopBar | Organism | Organisms/TopBar | 3 | ✓ menu |
| 45 | CommandPalette | Organism | Organisms/CommandPalette | 5 | ✓ keyboard |
| 46 | DataTable | Organism | Organisms/DataTable | 9 | ✓ select/sort |
| 47 | AssetTable | Organism | Organisms/AssetTable | 4 | — |
| 48 | RunHistoryTable | Organism | Organisms/RunHistoryTable | 3 | — |
| 49 | FleetRollup | Organism | Organisms/FleetRollup | 4 | — |
| 50 | AlertTriageRow | Organism | Organisms/AlertTriageRow | 5 | ✓ triage |
| 51 | AlertTriageList | Organism | Organisms/AlertTriageList | 4 | ✓ bulk |
| 52 | AssetTimeline | Organism | Organisms/AssetTimeline | 4 | — |
| 53 | RemediationPanel | Organism | Organisms/RemediationPanel | 7 | ✓ scope→confirm |
| 54 | ActionCart | Organism | Organisms/ActionCart | 5 | ✓ add/remove |
| 55 | ChainBuilder | Organism | Organisms/ChainBuilder | 6 | ✓ reorder |
| 56 | AutomationPolicyEditor | Organism | Organisms/AutomationPolicyEditor | 5 | ✓ add condition |
| 57 | PlaybookCard | Organism | Organisms/PlaybookCard | 4 | — |
| 58 | PlaybookList | Organism | Organisms/PlaybookList | 3 | — |
| 59 | ApprovalQueue | Organism | Organisms/ApprovalQueue | 4 | ✓ approve |
| 60 | AuditLog | Organism | Organisms/AuditLog | 4 | ✓ filter |
| 61 | ReportChartCard | Organism | Organisms/ReportChartCard | 5 | — |
| 62 | AppShell | Template | Templates/AppShell | 3 | — |
| 63 | ListPageTemplate | Template | Templates/ListPageTemplate | 3 | — |
| 64 | DetailPageTemplate | Template | Templates/DetailPageTemplate | 3 | — |
| 65 | TriageTemplate | Template | Templates/TriageTemplate | 3 | — |

**Audit rule:** if a row here has no sibling `.stories.tsx`, CI fails fast. If a story file lacks an export listed under "States" in §2–§5, the component is **not shippable** per the [done checklist](storybook-design-system.md). Pages (DashboardPage, AssetDetailPage, TriageQueuePage, PlaybookLibraryPage, AuditPage) are storied separately as Template + seeded mock data and are tracked in the [page specs](09-page-specs.md), not this inventory.

---

## 7. Cross-references

- Tokens, status system, per-surface styling: [03-design-system](03-design-system.md)
- Storybook architecture, coverage enforcement, theming: [storybook-design-system](storybook-design-system.md)
- Entities (Asset, BackupRun, Playbook, Action, ApprovalRequest): [05-domain-model](05-domain-model.md)
- Suggested-action sourcing per error code: [02-failure-catalog](02-failure-catalog.md)
- Automation scopes, chains, auto-remediation: [07-troubleshooting-and-automation-engine](07-troubleshooting-and-automation-engine.md)
- Nav sections feeding AppSidebar: [04-information-architecture](04-information-architecture.md)
- Folder structure + token enforcement: [11-tech-architecture](11-tech-architecture.md)
