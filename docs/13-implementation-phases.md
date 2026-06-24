# 13 — Implementation Phases

The sequenced build plan that turns the spec set into milestones: ordered work packages with concrete tasks, deliverables, a definition-of-done, dependency edges, and a vertical-slice MVP — mapped 1:1 onto [ROADMAP.md](../ROADMAP.md) Phase 2–6.
Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

---

## 0. How to read this doc

This doc is the **construction schedule**. Where [tech-architecture](11-tech-architecture.md) says *how the app is wired*, [storybook-design-system](storybook-design-system.md) says *how the component library is enforced*, [feature-specs](08-feature-specs.md) says *what each feature must do*, [page-specs](09-page-specs.md) says *how each screen is laid out*, and [component-inventory](10-component-inventory.md) says *which 65 components exist* — this doc says **in what order to build it, what unblocks what, and when each milestone is done.**

### 0.1 Principles that shape the sequence

1. **Tokens before pixels.** No component is built until `globals.css` token blocks and the Tailwind `@theme` mapping exist, so nothing is ever hardcoded then retrofitted ([tech-arch §5](11-tech-architecture.md)).
2. **Bottom-up the atomic ladder.** Foundations → Atoms → Molecules → Organisms → Templates → Pages. A level may not consume a component from a higher level. This is the spine of the whole schedule ([storybook §4](storybook-design-system.md)).
3. **Story-first, not story-after.** Every component lands *with* its `.stories.tsx` in the same milestone — the CI coverage gate (`scripts/check-story-coverage.mjs`) makes "build now, story later" impossible ([tech-arch §5b](11-tech-architecture.md)).
4. **Vertical slice before breadth.** Build one product (BCDR) through the *entire* triage→remediate→chain→playbook→policy journey before replicating to the other five ([ROADMAP build decisions](../ROADMAP.md)). Prove the engine end-to-end on a real surface; breadth is then mechanical.
5. **The mock data layer is the seam.** It is built once, early, behind `mock/query.ts`, so every page reads through one swappable interface and fixtures never drift (zod-validated).
6. **Mandates are gates, not goals.** Each milestone's DoD restates the four mandates as pass/fail checks: tokens-only, 100% Storybook coverage, impeccable review, WCAG 2.2 AA.

### 0.2 Milestone naming & ROADMAP mapping

Milestones are labelled `Mx`. Each maps to one ROADMAP phase; the table in [§9](#9-roadmap-checkbox-map) ties every ROADMAP checkbox to the milestone(s) that complete it so the two documents stay in sync.

| Milestone | Name | ROADMAP phase |
|---|---|---|
| **M0** | Scaffold & toolchain | Phase 2 (setup half) |
| **M1** | Design system & Storybook foundations | Phase 2 |
| **M2** | Atoms & molecules (library) | Phase 2 → Phase 4 (atoms) |
| **M3** | Mock data & domain layer | Phase 3 |
| **M4** | Core organisms (table, shell, automation) | Phase 4 |
| **M5** | Templates & app shell wiring | Phase 4 → Phase 5 |
| **M6** | **BCDR vertical slice (MVP)** | Phase 5 (BCDR cut) |
| **M7** | Breadth — remaining pages & products | Phase 5 |
| **M8** | Polish & verification | Phase 6 |

### 0.3 Definition-of-done baseline (applies to every milestone)

Beyond each milestone's specific DoD, *nothing* in a milestone is "done" unless:

- `pnpm run verify` is green (`typecheck` + `lint` + `lint:stories` + `test:engine` + `smoke:fix-client` + `test` + `test:dark` + `build` + `build-storybook`) — the [CI mirror](11-tech-architecture.md).
- Every new component file has a sibling `.stories.tsx` (coverage gate passes).
- Zero axe violations at `error` level in **both** light and slate dark themes — `test` (light) + `test:dark` (`VITE_SB_THEME=dark`).
- No hardcoded hex/px outside `globals.css` (stylelint + eslint literal bans pass).
- An impeccable review ran on any new UI surface, checking the absolute bans.

---

## 1. Dependency graph (what unblocks what)

The critical path runs through tokens → atoms → data layer → table/shell → slice. Storybook is set up early and grows alongside every milestone.

```
M0 Scaffold ─┬─► M1 Design system + Storybook ─► M2 Atoms+Molecules ─┐
             │                                                        ├─► M4 Organisms ─► M5 Templates ─► M6 BCDR slice ─► M7 Breadth ─► M8 Polish
             └─► M3 Mock data + domain layer ────────────────────────┘                                  ▲
                        (parallel to M1/M2; needed by M4 data surfaces) ─────────────────────────────────┘
```

| Milestone | Hard-depends on | Unblocks | Can run parallel with |
|---|---|---|---|
| M0 | — | everything | — |
| M1 | M0 (Tailwind/SB installed) | M2 (tokens for atoms), all UI | M3 (data layer is pure TS, no UI) |
| M2 | M1 (tokens + SB preview) | M4 (organisms compose atoms/molecules) | M3 |
| M3 | M0 (TS config) | M4 (data surfaces need fixtures + query) | M1, M2 |
| M4 | M2 + M3 (composes atoms over data) | M5, M6 | — |
| M5 | M4 (organisms slot into templates) | M6 | — |
| M6 | M4 + M5 (table, shell, cart, templates) | M7 | — |
| M7 | M6 (slice proves the pattern) | M8 | itself (per-product agents parallelize) |
| M8 | M7 (all surfaces exist) | release | — |

**Key insight:** **M3 (mock data) parallelizes with M1+M2 (design system)** because the data layer is pure TypeScript with zero UI — one agent can build fixtures/generators/stores while another builds the token system and atom library. They converge at **M4**, the first milestone that needs both. This is the single biggest schedule win.

---

## 2. M0 — Scaffold & toolchain

> **Goal:** a running, lint-gated, Storybook-equipped Next.js shell with the folder skeleton from [tech-arch §2](11-tech-architecture.md) — but no product code yet. Maps to the *setup half* of ROADMAP Phase 2.

### Tasks

- Scaffold **Next.js 15 App Router + TypeScript** (`create-next-app`, strict TS). Node 20.19+/22.12+.
- Install pinned deps: **Tailwind v4**, **shadcn/ui** CLI init, **lucide-react**, **TanStack Table v8** + **@tanstack/react-virtual**, **Zustand** + `persist`, **nuqs**, **react-hook-form + zod**, **Sonner**, **date-fns**, **Recharts v3**. (Tremor tiles deferred — see [open decision](../ROADMAP.md).)
- Stand up **Storybook 10** (`@storybook/nextjs-vite`) + addons (`addon-docs`, `addon-a11y`, `addon-themes`, `addon-vitest`, `addon-designs`); **do not** install the SB10-folded-in essentials ([storybook §2.2](storybook-design-system.md)).
- Write `.storybook/main.ts` + `preview.ts` (Vite/Tailwind v4 `viteFinal`, `a11y.test:'error'`, `withThemeByClassName`, `appDirectory:true`) per [storybook §3](storybook-design-system.md).
- Create the **folder skeleton** from [tech-arch §2](11-tech-architecture.md): empty `app/(console)/…`, `components/{ui,atoms,molecules,organisms,templates}`, `lib/`, `stores/`, `mock/`, `types/`, `config/`, `stories/foundations/`.
- Author `config/nav.ts` (IA single source) and `config/products.ts` (6 products → labels/icons/accent rules) as typed stubs.
- Wire **enforcement machinery** ([tech-arch §5](11-tech-architecture.md)): `stylelint.config.mjs` (hex/literal ban, `globals.css` exempt), `eslint.config.mjs` (arbitrary-value + inline-style bans, jsx-a11y), `scripts/check-story-coverage.mjs`, and all `package.json` scripts incl. `verify`.
- CI workflow: run `verify` on PR; Chromatic job stubbed (token wired later).

### Deliverables
- Bootable `npm run dev` (renders a placeholder) and `npm run storybook` (empty but launches).
- Green `npm run verify` on an empty tree (lints pass, coverage gate passes vacuously).
- Committed `.claude/settings.json` portable hook intact (impeccable detector).

### Definition of done
- [ ] `dev`, `storybook`, `build`, and `verify` scripts all run without error.
- [ ] Folder tree matches [tech-arch §2](11-tech-architecture.md) exactly; routes are present but thin/empty.
- [ ] Linters **actively reject** a deliberately-planted `bg-[#0E67F5]` and an inline `style=` (proven, not assumed).
- [ ] Coverage gate script runs and reports `0/0`.
- [ ] Node engine pinned ≥20.19/22.12; React single-version pinned in `overrides` ([storybook §13](storybook-design-system.md)).

### Risks / notes
- **Tailwind v4 + Storybook only works on the Vite builder** — never switch to webpack ([storybook §13](storybook-design-system.md)). Verify `@`-parsing in a smoke story before moving on.
- `next/font` needs `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` for SB; set in `.env.test` now to avoid silent font-skips later.

---

## 3. M1 — Design system & Storybook foundations

> **Goal:** the token law is in code, Tailwind utilities resolve to semantic tokens, and all six Foundations stories render in both themes. Maps to ROADMAP Phase 2 (token + foundations rows).

### Tasks

- Author `app/globals.css` from [design-system](03-design-system.md): `:root` + `.dark` blocks for **every** token — `--background/--foreground/--card/--border`, `--primary` (Curious Blue), `--sidebar` (white nav), `--accent` (mint), `--corporate` (Kaseya purple), the six `--status-*`, and `--chart-1..5`. This is the **one** stylelint-exempt file ([tech-arch §6](11-tech-architecture.md)).
- Build the `@theme inline` mapping so each token → a Tailwind utility (`bg-primary`, `text-status-failed`, `bg-sidebar`, `fill-chart-1`).
- Wire **dark mode** as slate (subtle teal cast, hue 197–198), **not** carbon; elevation = border emphasis in dark, shadow in light ([storybook §7.2](storybook-design-system.md)).
- Load fonts via `next/font` (Plus Jakarta Sans display, Figtree body 14px base, mono stack) → token-mapped font utilities.
- `app/layout.tsx`: `ThemeProvider` (next-themes, class strategy, `defaultTheme="dark"`), `NuqsAdapter`, `<Toaster/>`.
- Implement `lib/status.ts` — the single `AssetStatus`/`Severity → { token, icon, label }` map + the severity-sort comparator (`Failed>Warning>Offline>Syncing>Paused>Protected`). Everything status-related sources this.
- Build the **six Foundations stories** ([storybook §5](storybook-design-system.md), [inventory §1](10-component-inventory.md)): Color, Typography, Spacing, Radius & Elevation, Icons, **Status System** (the canonical "never color-only" proof + fleet-rollup demo).

### Deliverables
- `globals.css` complete; a swatch story renders every declared token in light + dark.
- `lib/status.ts` with unit tests for the severity comparator (Vitest).
- Foundations sidebar group fully populated in Storybook.

### Definition of done
- [ ] Every token in `globals.css` appears in ≥1 Foundations story ([storybook §5](storybook-design-system.md)).
- [ ] Theme toolbar flips all six Foundations stories correctly; sidebar token does **not** flip ([storybook §7.3](storybook-design-system.md)).
- [ ] Status System story shows dot **+** icon **+** label for all 6 states and passes axe (no color-only).
- [ ] Severity comparator unit test green against the canonical order.
- [ ] `tsc`, stylelint, eslint, and a11y gates green; impeccable review of the foundation stories passes.

### Risks / notes
- Get OKLCH/HSL **contrast pairs** right here once — WCAG AA is *designed in* via the light/dark token pairs ([tech-arch §5d](11-tech-architecture.md)); fixing contrast later means re-snapshotting everything.

---

## 4. M2 — Atoms & molecules (the library)

> **Goal:** the full atom + molecule layer of the [component inventory](10-component-inventory.md), each with 100%-coverage stories. Spans the tail of ROADMAP Phase 2 (atoms) into Phase 4 (status/health molecules).

### Tasks

- **shadcn primitives** (vendored into `components/ui/`, re-storied with Datto tokens): Button (+ `kaseya` variant, upsell-only), Input, Textarea, Label, Badge, Checkbox, Switch, RadioGroup, Select, Avatar, Skeleton, Separator, Tooltip, Tabs, Kbd — [inventory §2.1](10-component-inventory.md) (#7–21).
- **Custom atoms**: StatusBadge, SeverityDot, MonoLabel, ProductBadge — [inventory §2.2](10-component-inventory.md) (#22–25). StatusBadge is the most-used atom; story has one export per state + `play` for syncing-spin + label assertion ([storybook §8](storybook-design-system.md)).
- **Molecules** (#26–42): FormField, SearchField, FilterChip, SeverityChip, BackupHealthCell, **Last10DotStrip** (the "last 10 backups" dot-strip with visually-hidden summary), KpiTile, Card, ToastContent, Breadcrumb, DropdownMenu, Pagination, DateRangePicker, Alert, **ApplyScopeControl** (the load-bearing once/all/always molecule), PlaybookStepCard, ApprovalRequestCard.
- Each component: named export per variant/state from the inventory "Min exports" column, `play` fn where the matrix marks it, `parameters.design` placeholder, `autodocs`.
- Provider decorators (`withToaster`, `withNuqs`) authored in `stories/decorators.tsx` ([storybook §10](storybook-design-system.md)) — ApplyScopeControl/ApprovalRequestCard may need them later but molecules stay store-free.

### Deliverables
- 19 atom stories + 17 molecule stories, all green in Storybook, both themes.
- `lib/format.ts` (relative time, sizeGB, ID/IP mono formatters) — consumed by MonoLabel/BackupHealthCell.

### Definition of done
- [ ] Inventory rows #7–42 each have a file + sibling story meeting the "Min exports" floor ([inventory §6](10-component-inventory.md)).
- [ ] `play` functions exist for every matrix-flagged interactive state (Button focus, Input error, Checkbox/Switch/Radio toggle, Select open, Tooltip hover, Last10DotStrip tooltip, ApplyScopeControl select, ApprovalRequestCard approve, etc.).
- [ ] Status never color-only anywhere; Last10DotStrip exposes "N of 10 succeeded" to AT.
- [ ] `kaseya` Button variant exists but is documented as upsell-only.
- [ ] Coverage gate, a11y (both themes), token bans, impeccable review all green.

### Risks / notes
- Optional **shadcn-storybook-registry** bootstrap ([storybook §11](storybook-design-system.md)) can scaffold primitive stories fast — but every generated story **must** be re-pointed to Datto tokens + product args before it counts as done.
- Reset Zustand-touching molecule stories per render to avoid cross-story leakage ([storybook §13](storybook-design-system.md)) — though most molecules should stay store-free by design.

---

## 5. M3 — Mock data & domain layer (parallel track)

> **Goal:** the deterministic mock "backend" — types, generators, the `query.ts` seam, the runner, and the Zustand stores — all pure TS, validated by zod, with zero UI. Maps to ROADMAP Phase 3. **Runs in parallel with M1+M2.**

### Tasks

- Implement **domain types** in `types/`, re-exported from zod schemas (`lib/schemas/`) via `z.infer` — the schema is the single source ([tech-arch §1, §4a](11-tech-architecture.md)) and doubles as fixture validator + RHF validator. Source: [domain-model](05-domain-model.md) + [data-model-and-mock-data](06-data-model-and-mock-data.md).
- Build the **seeded PRNG** (`mock/prng.ts`: xmur3+mulberry32, namespaced streams) and `mock/seed.ts` (canonical `SEED`). **No `Math.random`/`Date.now` at module scope** ([tech-arch §1 determinism caveat](11-tech-architecture.md)).
- **Generators** (`mock/generators/`): assets, backup-jobs, alerts, runs, the hand-authored **actions** catalog (~40, all 6 products), and 3–4 seeded **playbooks** + 3 seed **policies**. Draw from curated value pools (`SIRIS-NYC-01`, `Northwind Traders`, mono error codes) and enforce **correlation**: Failed asset ⇒ open alerts + recent failed backup + lower 30-day rate; rollup = worst real child ([tech-arch §4a](11-tech-architecture.md)).
- `mock/fixtures.ts` builds + caches the whole correlated dataset; every record `schema.parse()`'d in dev so fixtures can't drift.
- `mock/query.ts` — the **API seam**: `getAssets({filter,sort,page})`, `getBackupJobs`, `getAlerts`, `getRuns`, etc., with optional `delay()` to exercise `loading.tsx`. Returns page slices only ([tech-arch §8](11-tech-architecture.md)).
- `mock/runner.ts` — simulated runner: per-(asset,step) seeded outcome, weighted by action category (diagnostics rarely fail, destructive/restore fail more), latency, streamed console output, dry-run intercept (zero mutations).
- `mock/ticker.ts` (fake realtime) — **effect-only** randomness: advance running runs, tick syncing jobs, auto-fire `always` policies, drip new alerts ([tech-arch §4c](11-tech-architecture.md)).
- **Zustand stores** (`stores/`, all `persist` + `partialize` + `version`/`migrate` + `useHasHydrated`): `action-cart`, `playbooks`, `automation-policies`, `saved-views`, `approvals`, `ui` ([tech-arch §3c](11-tech-architecture.md)).
- **nuqs parsers** for the URL "view" plane (`q`, `status`, `product`, `severity`, `sort`, `page`, `tab`, `open`, `density`) per [tech-arch §3b](11-tech-architecture.md).
- Settings → **"Reset demo state"** util (clears `dcc.*` keys + reseeds).

### Deliverables
- A typed, zod-validated, deterministic fixture set (~480 assets / ~620 jobs / ~900 alerts / ~1,500 runs / ~40 actions).
- `query.ts`, `runner.ts`, `ticker.ts`, and all 6 stores, with Vitest coverage of generators, query filter/sort/paginate, runner outcomes, and the severity/rollup logic.

### Definition of done
- [ ] Same `SEED` ⇒ byte-identical fixtures across runs (snapshot test); no build/SSR randomness.
- [ ] Every generated record passes its zod schema; referential integrity holds (alerts→real assetIds, runs→real action+asset, playbooks→real actions).
- [ ] Correlation rules verified by test (Failed ⇒ alerts+failed backup+lower rate; Offline ⇒ stale `lastSeen`+missed jobs; rollup = worst real child, cosmetic/paused never dominate).
- [ ] `query.ts` returns only page slices; dry-run through `runner.ts` produces zero mutations (intercept asserted).
- [ ] All stores hydrate synchronously from localStorage; `persist` `migrate` handles a version bump without bricking saved state.
- [ ] "Reset demo state" restores a pristine, presentable dataset.

### Risks / notes
- This is the **highest-leverage parallel track** — staff it from the start of M1 so M4 isn't blocked.
- The store-shape contracts (esp. `action-cart` `ChainStep`/`Scope`) are load-bearing for the whole engine — pin them to [tech-arch §3c](11-tech-architecture.md) and [automation engine](07-troubleshooting-and-automation-engine.md) before building UI on top.

---

## 6. M4 — Core organisms (table, shell, automation)

> **Goal:** the heavy, data-bound composites — the DataTable engine, the app shell/search, the triage/diagnosis surfaces, and the Zustand-backed automation organisms. Maps to ROADMAP Phase 4 (organism rows). First milestone needing **both** M2 and M3.

### Tasks (grouped by inventory §4)

- **Nav & search shell** (#43–45): AppSidebar (nav shell, never flips; nav from `config/nav.ts`), TopBar (breadcrumb + SearchField + bell + Avatar), CommandPalette (cmdk, full keyboard nav, sources = assets/jobs/playbooks/docs).
- **Data surfaces** (#46–49): the generic **DataTable** engine (`components/organisms/data-table/`: table, toolbar, faceted-filter, column-header, pagination, `use-data-table.ts` wiring TanStack ↔ nuqs ↔ virtualizer) with sticky header/col, bulk toolbar (`role="toolbar"`), column picker, saved-view apply, density, **all** empty/loading/error/selected/sorted states. Then presets: AssetTable, RunHistoryTable, FleetRollup (worst-real-child headline).
- **Triage & diagnosis** (#50–53): AlertTriageRow, AlertTriageList (virtualized, groupable, bulk-select), AssetTimeline (ordered list, real timestamps, live-tail), **RemediationPanel** (suggested actions keyed by error code → ApplyScopeControl → confirm → execute, the why-fail→fix bridge).
- **Automation, Zustand-backed** (#54–58): ActionCart, **ChainBuilder** (dnd-kit reorder, save-as-playbook), AutomationPolicyEditor (condition rows + always-forward warning), PlaybookCard, PlaybookList. Stories reset the `action-cart` store per render (`withActionCart`).
- **Approvals, audit, reporting** (#59–61): ApprovalQueue, AuditLog (time-ordered DataTable preset), ReportChartCard (Recharts, status tokens for health, legend + data-table fallback for AT).

### Deliverables
- 19 organism stories (#43–61), each covering the full state set from the inventory matrix, both themes.
- A working DataTable demonstrably wired to `mock/query.ts` slices + virtualizer (hundreds of rows, buttery).

### Definition of done
- [ ] DataTable renders Default/Empty/Loading(skeleton)/Error/WithRowSelected→BulkToolbar/SortedBySeverity/CompactDensity/ColumnPickerOpen/SavedViewApplied — empty/error/loading are first-class (no centered spinner — impeccable ban).
- [ ] Row virtualization keeps a 500-row table responsive; sticky header/col stay pinned; stable deterministic-ID keys (no index keys).
- [ ] CommandPalette is fully keyboard-navigable (arrow/enter/escape, `aria-activedescendant`).
- [ ] RemediationPanel routes a chosen fix into the ActionCart **or** executes inline, with scope via the shared ApplyScopeControl.
- [ ] ActionCart + ChainBuilder share the `action-cart` store; reorder works; "save as playbook" produces a valid `Playbook`.
- [ ] Charts pair every series with a legend label + AT fallback; never color-only.
- [ ] All matrix `play` fns present (select/sort, collapse, keyboard, triage, bulk, scope→confirm, add/remove, reorder, add-condition, approve, filter).
- [ ] Coverage gate, a11y both themes, token bans, impeccable review green.

### Risks / notes
- The DataTable is the **core surface** — over-invest here; everything downstream (fleet, backups, alerts, runs, audit) is a preset of it ([tech-arch §1](11-tech-architecture.md)). Anything less than headless TanStack guarantees a rewrite.
- Zustand store-leak between stories is the #1 SB gotcha here — enforce the reset decorator on **every** automation organism story ([storybook §13](storybook-design-system.md)).

---

## 7. M5 — Templates & app-shell wiring

> **Goal:** the four page templates ([inventory §5](10-component-inventory.md)) and the live `(console)/layout.tsx` persistent shell, so pages become slot-filling exercises. Bridges ROADMAP Phase 4→5.

### Tasks
- Build templates (#62–65): **AppShell** (AppSidebar + TopBar + main outlet + Toaster + `<ActionCartSheet/>`), **ListPageTemplate** (header + KPI row + FilterBar + DataTable slot), **DetailPageTemplate** (breadcrumb + health header + Tabs + RemediationPanel rail), **TriageTemplate** (resizable list ‖ detail split). Slot props are `ReactNode`; stories use placeholders, **no real data**.
- Wire the **real** `app/(console)/layout.tsx` as the persistent shell — cart badge, sidebar, breadcrumbs survive navigation (layout never remounts) ([tech-arch §2](11-tech-architecture.md)).
- Mount the global **ActionCartSheet** (right slide-in `Sheet`, sidebar/topbar badge count) and the fake-realtime **ticker** inside the layout's `useEffect`.
- Add `loading.tsx` per route group for free skeletons during simulated latency.

### Deliverables
- 4 template stories; a navigable app shell where the cart persists across route changes.

### Definition of done
- [ ] Each template story renders its documented states (e.g. AppShell Default/SidebarCollapsed/Dark) with placeholder slots only.
- [ ] Navigating between routes does **not** remount the shell; cart badge count survives (verified by hydration-safe `useHasHydrated` gate — no mismatch).
- [ ] `loading.tsx` skeletons render during `query.ts` `delay()`; no layout shift on hydrate.
- [ ] Ticker runs effect-only (no SSR randomness); a syncing job visibly ticks.
- [ ] Coverage, a11y, token, impeccable gates green.

---

## 8. M6 — BCDR vertical slice (the MVP)

> **Goal — the proof.** One product (**Datto BCDR**) taken through the **entire** journey end-to-end: triage a grouped incident → open the failing asset → diagnose with evidence → run a suggested fix → chain a second action → set scope → dry-run → apply → save as a playbook → graduate it to an apply-always policy → see the run + audit trail. This is the demo that validates the whole thesis before any breadth. Maps to the **BCDR cut** of ROADMAP Phase 5.

### Why BCDR first
BCDR (SIRIS/ALTO) has the richest failure surface — VSS writer failures, screenshot/boot verification, ZFS pool, inverse chain, diff-merge, off-site sync, encryption re-seal — so it exercises the most of the engine ([ROADMAP build decision #3](../ROADMAP.md)). Prove it here and the other five products are largely configuration.

### The end-to-end journey (the acceptance script)

```
/triage                  group 14 identical "VSS writer failure" alerts into one P1 incident
  → /triage/[id]         see "why grouped", what-changed timeline, suggested playbook, cohort link
  → /assets/[assetId]    Why-red names bcdr.vss-writer-snapshot-failure + verbatim "BKP1410" (mono)
                         What-changed correlates a Windows update to first failure; last-10 dot-strip
  → Suggested Fix        Reset VSS Writers — risk/duration/reversibility/confidence; Dry-run
  → Action Cart          add "Reset VSS Writers", chain "Retry Backup" conditional on success
  → Scope                ● this asset → switch to ○ all-matching (live count "14 across 3 clients")
  → Dry-run → Apply      per-step diffs, zero mutations on dry-run; deliberate Apply toggle
  → Run + audit          Run appears in /automation/runs with per-asset fan-out + audit entries
  → Save as playbook     chain → versioned Playbook in /automation
  → Apply always         graduate to an Automation Policy (gated on publish); ticker auto-fires it
```

### Tasks (build only the BCDR-needed pages, reusing M4/M5)

- **`/triage` + `/triage/[incidentId]`** — incident grouping/dedup/severity, "why grouped", suggested fix, bulk→cart ([feature-specs §2](08-feature-specs.md)).
- **`/assets` + `/assets/[assetId]`** — the workhorse AssetTable (BCDR-filtered) + the tabbed asset-detail (Overview/Timeline/Recovery points/Alerts/Runs/Actions) with Why-red, What-changed, dot-strip, inline RemediationPanel ([feature-specs §3, §16](08-feature-specs.md)).
- **Action Cart + ChainBuilder** wired live to the BCDR action catalog (VSS reset, retry, force diff-merge, repair comms, force retention, off-site resume) ([feature-specs §5](08-feature-specs.md)).
- **Scope picker** all four modes, with debounced live preview + resolved-list modal + >50/high-risk auto-gate ([feature-specs §6](08-feature-specs.md)).
- **Dry-run → Apply** via `mock/runner.ts`; per-step diffs; partial-failure + retry-failed-only.
- **`/automation` (Playbooks)** — save-as-playbook, version, load-into-cart ([feature-specs §7](08-feature-specs.md)).
- **`/automation/policies/[id]`** — graduate "apply always", draft→publish (gated), observe-only, kill-switch; ticker auto-fires it ([feature-specs §8](08-feature-specs.md)).
- **Approvals** card in the notification center for the gated publish ([feature-specs §9](08-feature-specs.md)).
- **`/automation/runs` + `[runId]`** — run history + per-step `StepOutput` + append-only audit ([feature-specs §10](08-feature-specs.md)).
- Page-level stories (Template + seeded BCDR mock data) for each.

### Deliverables
- A clickable, persistent demo where the full journey above completes without leaving the mock — all state persisted to localStorage.

### Definition of done
- [ ] The entire acceptance script runs start-to-finish in the browser with no dead ends and no console errors.
- [ ] Every failure surface offers a one-click path to context, cause, and a fix (**no dead-end reds**).
- [ ] Dry-run mutates nothing; Apply is a deliberate toggle that restates the scope count; partial failure offers retry-failed-only.
- [ ] Save-as-playbook → run-from-cart → graduate-to-policy → policy auto-fires (via ticker) all work; each writes a `Run` + audit entries.
- [ ] Apply-always publish is approval-gated; the decision is captured with identity and audited; audit is append-only (overwrite-by-id throws).
- [ ] Every screen handles empty/loading/error states; all view state is URL-encoded + deep-linkable.
- [ ] Severity sort is law on every list; cosmetic failures render desaturated with a verify action, not red alarm.
- [ ] Page stories exist; coverage, a11y both themes, token bans, impeccable review on every screen green.

### Risks / notes
- **Resist breadth here.** The temptation to "just add SaaS too" is the schedule killer — the slice's value is depth-first proof. Lock BCDR-only until the DoD is fully green.
- The scope→dry-run→apply→policy loop is the product's thesis; if anything is faked rather than functional, it fails the [ROADMAP build decision #2](../ROADMAP.md) (functional client-side engine).

---

## 9. M7 — Breadth: remaining pages & products

> **Goal:** replicate the proven BCDR pattern across the other five products and finish the remaining cross-cutting pages. Maps to the rest of ROADMAP Phase 5. **Parallelizable** — per-product agents fan out (worktree-isolated where they touch shared files).

### Tasks

- **Per-product asset-detail facets & action catalogs** — wire the same tabbed skeleton with product-appropriate facets and hide irrelevant UI ([feature-specs §3, §14](08-feature-specs.md)):
  - **DEB v1** — cloud-first, no appliance; restart-services, AV-exclusions, throttle, metered.
  - **DEB v2** — next-gen agent/console; migration-from-v1 surfacing.
  - **Datto Cloud DR** — cloud restore/virtualization, test failover, VPN/IPsec, retention.
  - **SaaS Protect** — M365/Google; OAuth/consent grant + seat license (no boot test — replace "Recovery points" with "last successful sync"); Graph/Google throttle in console output.
  - **Spanning** — Salesforce + M365 + Google; metadata, API rate-cap %, OAuth, seat sync, Salesforce sandbox seeding.
- **Remaining pages**: `/overview` (read-only fleet rollup, non-uniform layout), `/backups` + `/[jobId]` (restore-point timeline, screenshot/boot verification), `/alerts` (triage queue alt-route), `/reports` + `/[reportId]` (SLA/RPO, recurring-failure trends, automation ROI — varied chart types, not an identical-card grid), `/automation/approvals`, `/settings` (theme, density, reseed/reset) ([feature-specs §1, §10–§16](08-feature-specs.md)).
- **Per-product views** `/products/[product]` (re-scoped workhorse table).
- **Saved views, global search, notifications** finalized cross-route ([feature-specs §12, §13, §15](08-feature-specs.md)).

### Deliverables
- All 6 products navigable through triage→detail→remediate; all routes from [tech-arch §2](11-tech-architecture.md) live; per-product page stories with seeded data.

### Definition of done
- [ ] The same tab skeleton renders for agent, agentless, endpoint, saas-seat, salesforce-org, and share kinds with product-appropriate facets and **no empty/irrelevant UI** (e.g. SaaS shows no boot-test surface).
- [ ] Only product-appropriate actions are offered per asset `kind` (no "Run diff-merge" on a SaaS seat).
- [ ] Overview rollup is read-only, worst-real-child, every segment a correct deep-link; layout is intentionally varied (impeccable — no identical card grid, no hero-metric).
- [ ] Reports drill-through preserves filter context; no misleading flat-zero charts on thin data.
- [ ] Every screen has empty/loading/error states; all view state URL-encoded.
- [ ] Coverage, a11y both themes, token bans, impeccable review green on every new screen.

### Risks / notes
- **SaaS/Spanning diverge most** from the BCDR skeleton (no recovery-point boot test, API-throttle as a first-class concept) — budget extra time and verify the skeleton truly flexes rather than leaving dead boot-test UI.
- Parallel product agents must **not** redefine shared atoms/molecules — they consume the M2 library; any new shared primitive goes back through the inventory + coverage gate.

---

## 10. M8 — Polish & verification

> **Goal:** the final quality bar — impeccable polish/audit, a11y, light/dark parity, coverage-gate green, realistic content, demo walkthrough. Maps to ROADMAP Phase 6.

### Tasks
- `/impeccable polish` + `/impeccable audit` pass on **every** screen — enforce the absolute bans (no nested cards, side-stripe borders, gradient text, glassmorphism, hero-metric, identical card grids, per-section uppercase eyebrows).
- **a11y pass**: WCAG 2.2 AA, full keyboard, non-color status everywhere, reduced-motion (syncing spinner → static loader).
- **Light/dark parity** check across all screens **and** all stories; Chromatic both themes green.
- **Storybook coverage gate** fully green: story per component, all variants, all `play` fns, zero axe violations.
- **Realistic-content review** — mock data reads as real per product (names, error codes, sizes, throttle notices), no lorem ipsum.
- **Final demo walkthrough** of the key journeys (the M6 script + one per other product).

### Deliverables
- A demo-ready mock with green CI (`verify` + Chromatic), all 65+ components storied, all screens audited.

### Definition of done
- [ ] `npm run verify` and `chromatic` green; coverage gate reports 100%.
- [ ] Zero axe violations at `error` level across all stories, both themes.
- [ ] Every screen passes an impeccable audit; no banned pattern present.
- [ ] Light/dark parity verified screen-by-screen and snapshot-by-snapshot.
- [ ] Reduced-motion honored; keyboard-only navigation completes every key journey.
- [ ] Mock content reviewed as believable per all 6 products.
- [ ] All ROADMAP Phase 6 checkboxes ticked.

---

## 11. Vertical-slice rationale (why M6 sits where it does)

The schedule front-loads **infrastructure that the slice needs** (M0–M5) then spends M6 proving the *entire* thesis on one product before M7 breadth:

- **You can't slice without the spine.** The slice needs the token system (M1), the atom/molecule library (M2), the mock engine + stores (M3), the DataTable + automation organisms (M4), and the templates/shell (M5). Building the slice earlier means building these ad-hoc and rewriting them.
- **Depth flushes out the hard problems.** Scope resolution, dry-run intercept, approval gating, policy auto-fire, append-only audit — these only reveal their edges when wired end-to-end on a real failure surface. Finding them in M6 (one product) is far cheaper than in M7 (six).
- **Breadth becomes mechanical.** Once BCDR proves the pattern, the other five products are facet config + action-catalog entries + product-appropriate hiding — parallelizable across agents.

---

## 12. How each phase upholds the mandates

Every milestone's DoD restates the four non-negotiable mandates as machine- or review-checkable gates:

| Mandate | Enforced by (per-milestone) |
|---|---|
| **Tokens-only (no hardcoded values)** | M1 lands `globals.css` as the single token source; from M2 on, stylelint/eslint literal bans reject any hex/px outside it. Every component DoD includes the token-ban gate. |
| **Storybook-first / 100% coverage (atomic order)** | The bottom-up sequence (M1→M2→M4→M5) *is* the atomic ladder; every component lands with its story; `check-story-coverage.mjs` fails the build on any orphan in every milestone. |
| **Impeccable + absolute bans** | An impeccable review is a DoD line item on every UI milestone (M1–M8); M8 is a dedicated audit pass. The bans (nested cards, side-stripes, gradient text, glassmorphism, hero-metric, identical card grids, eyebrows) are checked per screen. |
| **WCAG 2.2 AA** | Contrast designed-in via token pairs in M1; `a11y.test:'error'` axe gate runs in every story from M2 on; M8 adds keyboard + reduced-motion + non-color-status review. Both light and dark themes are gated. |
| **Front-end mock only** | M3 builds the entire "backend" in-memory/localStorage behind `mock/query.ts`; no milestone introduces a network/auth dependency; "Reset demo state" keeps it presentable. |

---

## 13. ROADMAP checkbox map

Direct mapping so [ROADMAP.md](../ROADMAP.md) and this doc never drift. Each ROADMAP item below is completed by the listed milestone(s).

### ROADMAP Phase 2 — Project scaffold & design system

| ROADMAP checkbox | Milestone |
|---|---|
| Scaffold Next.js + TS + Tailwind v4 + shadcn/ui; pinned deps | **M0** |
| Write `globals.css` token blocks (light + dark) | **M1** |
| Wire Tailwind theme to tokens; fonts (Jakarta + Figtree) | **M1** |
| Stand up Storybook 10 + addons; preview theme decorator | **M0** (setup) → **M1** (theme decorator live) |
| Foundations stories (color/typography/spacing/radius/elevation/icons/status) | **M1** |
| Add shadcn primitives + Atom stories (100% coverage) | **M2** |
| Configure token/lint enforcement (stylelint/eslint bans) | **M0** |

### ROADMAP Phase 3 — Mock data & domain layer

| ROADMAP checkbox | Milestone |
|---|---|
| Implement TS domain types from domain-model | **M3** |
| Seeded deterministic mock-data generator (all products) | **M3** |
| Mock action runner (latency/outcomes) + localStorage persistence | **M3** |
| Zustand stores (cart/chains, playbooks, saved views); nuqs URL state | **M3** |

### ROADMAP Phase 4 — Core molecules & organisms

| ROADMAP checkbox | Milestone |
|---|---|
| StatusBadge, BackupHealthCell, last-10 dot-strip, FleetRollup, severity chips | **M2** (atoms/molecules) + **M4** (FleetRollup organism) |
| DataTable (TanStack) sticky header/col, bulk toolbar, saved views | **M4** |
| App shell: nav shell sidebar + omni-search + command palette | **M4** (organisms) + **M5** (shell wiring) |
| ActionCart / chain builder, ApplyScope (once/all/always), PlaybookStepCard | **M2** (ApplyScopeControl, PlaybookStepCard) + **M4** (ActionCart, ChainBuilder) |
| AssetTimeline, AlertTriageRow, RemediationPanel — each with stories | **M4** |

### ROADMAP Phase 5 — Pages / screens

| ROADMAP checkbox | Milestone |
|---|---|
| Overview / fleet health | **M7** |
| Triage queue (grouping/dedup/severity) | **M6** (BCDR) → **M7** (all) |
| Asset detail (timeline, evidence, inline remediation) | **M6** (BCDR) → **M7** (all) |
| Automation & playbook library (once/always, scope, approvals) | **M6** |
| Run history / audit log | **M6** |
| Reports / SLA-RPO posture | **M7** |
| Per-product views (BCDR/Endpoint/Cloud/SaaS/Spanning) | **M6** (BCDR) → **M7** (rest) |
| Empty/loading/error states for every screen | **M6**+**M7** (per-screen DoD) |

### ROADMAP Phase 6 — Polish & verification

| ROADMAP checkbox | Milestone |
|---|---|
| `/impeccable polish` + `/impeccable audit` on every screen | **M8** |
| a11y pass (WCAG 2.2 AA, keyboard, non-color, reduced motion) | **M8** |
| Light/dark parity across screens & stories | **M8** |
| Storybook coverage gate green | **M8** (continuously enforced M2→M7) |
| Realistic-content review | **M8** |
| Final demo walkthrough | **M8** |

---

## 14. Open decisions / flags

- **Page-spec cross-links pending.** [page-specs (09)](09-page-specs.md) is authored in parallel; this plan references its features via [feature-specs](08-feature-specs.md). Once 09 lands, M5–M7 task lists should cite its exact wireframe section numbers.
- **Tremor KPI tiles** deferred from M0 deps per the [ROADMAP open decision](../ROADMAP.md) (default Recharts + thin Tremor tiles). If KPI tiles ship as pure custom (`KpiTile` molecule already covers this), Tremor may be dropped entirely — decide before M2 finalizes `KpiTile`.
- **Server vs client reads** ([tech-arch open decision](11-tech-architecture.md)): plan assumes client-side reads from `mock/query.ts`. If we adopt async Server Components for `loading.tsx` fidelity, M5's `loading.tsx` task grows — flag before M5.
- **Per-product M7 parallelism granularity.** Worktree-per-product vs shared branch is a swarm-orchestration call ([ROADMAP build decision #4](../ROADMAP.md)); the dependency rule (consume the M2 library, never redefine shared atoms) holds regardless.
- **Approvals store vs derived-from-runs** ([tech-arch open decision](11-tech-architecture.md)): M3 builds it as its own persisted store; if it becomes derived from the audit feed, M6's approvals task shifts from "read store" to "derive" — coordinate with [automation engine](07-troubleshooting-and-automation-engine.md).
