# Kaseya Resolution Center — Master Roadmap

> **This is the resume-anywhere progress tracker.** Check items off as they complete. At the start of any session: read this file, read `CLAUDE.md`, run `node .claude/skills/impeccable/scripts/context.mjs`, then continue at the first unchecked item.
>
> **Status legend:** `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked/needs decision
>
> **Working title:** Kaseya Resolution Center (Backup Troubleshooting & Automation Center). Front-end mock · shadcn/ui · Storybook design system · Kaseya/Datto tokens · impeccable-enforced.

---

## Where we are right now

- ✅ **Phase 0 (Foundation) complete** — research, impeccable v3.7.1 + hook (Claude + Codex), `CLAUDE.md` / `AGENTS.md` / `PRODUCT.md` / `DESIGN.md` / `README.md`, repo on GitHub (`cmiami/OpsParcero`, `main`), 7 phase milestones.
- ✅ **Phase 1 (Specification) complete** — [`00-vision`](docs/00-vision-and-scope.md) + the `docs/` spec set define the **Kaseya Resolution Center**: issues-by-category, fix-classification (End-to-end / Guided / Insights), "We/You" steps, apply once/always, outage awareness, **Recovery Launchpad** (recovery on local device or in the Datto Cloud — Datto Cloud is a target, not a product). Scope: **SaaS / BCDR / Endpoint v2**.
- ✅ **Phases 2–5 built (vertical slice) — 2026-06-23** — full app stands up and is **verified building**: `next build` (14 routes) · `tsc --noEmit` clean · `build-storybook` (84 component stories) · story-coverage gate 84/84. Delivered via an agent swarm: foundation (Next 15 + Tailwind v4 + tokens + Storybook 10) → base layer (32 shadcn primitives, typed domain backbone, foundations stories) → mock engine (135 failure modes + 154 actions from the research catalog, correlated seeded fixtures, query + simulated runner) + 8 Zustand stores + 9 atoms → 15 molecules + 29 organisms → `(console)` app shell + BCDR-lead pages (Resolution Center home, Fleet, Asset detail, Alerts, Backups, Automation: playbooks/policies/approvals/runs, Cart, Settings). Runtime-smoke confirms real seeded content renders.
- ✅ **Phase 6 (polish & verification) + static deploy — 2026-06-23** — per-product lenses (BCDR/SaaS/Endpoint), Overview/fleet-health, Incident detail, Reports, and route states (loading/error/404) added. **WCAG 2.2 AA verified with axe-core across all 13 routes in light + dark → 0 serious/critical violations** (token-level fixes: AA-safe orange `#C2410C`, darkened faint/muted/paused/offline/syncing, fixed `--topbar` + dark primary-foreground, AI-card `<dl>`). App converted to **static export** (`output:"export"`) → `out/` deploys to Cloudflare Pages. impeccable design hook clean on every file; light/dark parity confirmed.
- 👉 **Optional follow-ups (secondary surfaces, not blocking):** appliance/tenant/connection child-detail pages, asset quick-peek sheet, global-search results page, multi-tab Setup; wire the Storybook `vitest --project=storybook` a11y gate (Vitest-4 browser-provider API to finalize — axe is already verified via the app audit).

## Build decisions (locked 2026-06-22)

1. **Vertical slice first** — build app shell + design system, then **Datto BCDR end-to-end** (triage → asset detail → remediate → chain → save playbook → apply-always), then replicate to the other products.
2. **Functional client-side engine** — real Zustand + localStorage; the action/chain/playbook/apply-always engine genuinely works (simulated runner), not faked.
3. **Lead product = Datto BCDR** (richest failure surface for the remediation/automation showcase).
4. **Autonomous long swarm** — parallel agents (worktree-isolated where they touch shared files) burn down the numbered list; I surface blockers/decisions and verify at meaningful checkpoints.

## How progress is tracked on GitHub

Repo `cmiami/OpsParcero` (public, `main`). The numbered items below are the burn-down list. **Tracking = a GitHub Milestone per phase + one issue per item.** Completing an item = a commit to `main` whose message closes its issue (`Closes #<n>`); PRs only when a diff is worth review. Milestone progress bars are the live "where are we." This `ROADMAP.md` is the human-readable mirror; GitHub is the system of record.

---

## Phase 0 — Foundation & Research  `[x]`

- [x] Research: real-world failure points across all 6 products (Reddit/forums/KB) → `docs/research/00-failure-catalog-digest.md` + `failure-catalog.json` (135 failure modes)
- [x] Research: Kaseya/Datto design system → `docs/research/01-design-system-research.md` (confirmed tokens)
- [x] Research: automation/runbook/action-chaining UX → `docs/research/02-automation-ux-research.md`
- [x] Research: health/troubleshooting dashboard UX → `docs/research/03-dashboard-ux-research.md`
- [x] Research: shadcn mock-app architecture → `docs/research/04-architecture-research.md`
- [x] Research: Storybook + shadcn + atomic design → `docs/research/05-storybook-research.md`
- [x] Install impeccable v3.7.1 skill → `.claude/skills/impeccable/` (+ helper agent)
- [x] Enable impeccable design-detector hook → `.claude/settings.local.json` + `.impeccable/config.json`
- [x] Author `CLAUDE.md` (non-negotiable mandates: tokens-only, Storybook-first, impeccable-always)
- [x] Author `PRODUCT.md` (impeccable strategic context)
- [x] Author `DESIGN.md` (impeccable visual context, seeded with confirmed tokens)
- [x] Author `README.md`; repo hygiene (`.gitignore`, portable hook in committed `.claude/settings.json`)
- [x] Foundation pushed to GitHub `cmiami/OpsParcero` (`main`)
- [x] `AGENTS.md` (Codex mirror of CLAUDE.md) + Codex impeccable harness (`.agents/skills/impeccable`, `.codex/hooks.json`)
- [x] Competitor mandate (M7) + scrub of product-facing docs; product reference captured (`docs/00-vision-and-scope.md` + `research/kaseya-resolution-center-reference.html`)
- [x] GitHub phase milestones (#1–#7) created

## Phase 1 — Specification  `[x]`

> Every design/architecture/data/feature decision defined before app code. Index: `docs/INDEX.md`.

- [x] `docs/00-vision-and-scope.md` — product overview & model (canonical)
- [x] `docs/01-personas-and-jobs.md` — personas, JTBD, journeys
- [x] `docs/02-failure-catalog.md` — failure modes → causes, self-serve vs human-in-loop, remediation actions
- [x] `docs/03-design-system.md` — Kaseya-portal tokens, fix-classification, status, components
- [x] `docs/04-information-architecture.md` — nav, routes, filters, impacted-assets panel, outage surface
- [x] `docs/05-domain-model.md` — entities & relationships
- [x] `docs/06-data-model-and-mock-data.md` — TS schemas + seeded mock-data generator
- [x] `docs/07-troubleshooting-and-automation-engine.md` — fix-classification, We/You steps, apply once/always, audit
- [x] `docs/08-feature-specs.md` — feature-by-feature specs
- [x] `docs/09-page-specs.md` — page-by-page wireframes
- [x] `docs/10-component-inventory.md` — atomic component inventory
- [x] `docs/storybook-design-system.md` — Storybook architecture, 100% coverage, theming
- [x] `docs/11-tech-architecture.md` — stack, folders, state, mock services, enforcement
- [x] `docs/12-content-strategy.md` — content, runbook copy, microcopy, empty/error states
- [x] `docs/13-implementation-phases.md` — build milestones
- [x] `docs/products/*.md` — per-product deep dives (BCDR, Endpoint Backup, Recovery Launchpad, SaaS Protect, Spanning)

## Phase 2 — Project scaffold & design system  `[x]`

- [ ] Scaffold Next.js (App Router) + TS + Tailwind v4 + shadcn/ui; install pinned deps
- [ ] Write `src/app/globals.css` token blocks (light + dark) from the design system spec
- [ ] Wire Tailwind theme to tokens; fonts (Plus Jakarta Sans + Figtree)
- [ ] Stand up Storybook 10 (`@storybook/nextjs-vite`) + addons; preview theme decorator
- [ ] Foundations stories (color, typography, spacing, radius, elevation, icons, status)
- [ ] Add shadcn primitives + Atom stories (100% coverage)
- [ ] Configure token/lint enforcement (stylelint/eslint ban on hardcoded values)

## Phase 3 — Mock data & domain layer  `[x]`

- [ ] Implement TypeScript domain types from `docs/05-domain-model.md`
- [ ] Implement seeded deterministic mock-data generator (fleets, assets, jobs, recovery points, alerts, run history) across all products
- [ ] Mock "action runner" service (simulated execution, latency, outcomes) + localStorage persistence
- [ ] Zustand stores (action cart/chains, playbooks, saved views); nuqs URL state

## Phase 4 — Core molecules & organisms  `[x]`

- [ ] StatusBadge, BackupHealthCell, last-10 dot-strip, FleetRollup, severity chips
- [ ] DataTable (TanStack) with sticky header/col, bulk toolbar, saved views
- [ ] App shell: white left nav + Kaseya-blue topbar + command palette + command palette
- [ ] ActionCart / action-chain builder, ApplyScope control (once/all/always), PlaybookStepCard
- [ ] AssetTimeline, AlertTriageRow, RemediationPanel — each with stories

## Phase 5 — Pages / screens  `[x]`  (all primary surfaces + per-product lenses + states; secondary child-detail/quick-peek pages optional)

- [ ] Overview / fleet health
- [ ] Triage queue (incident/alert grouping, dedup, severity)
- [ ] Asset detail (backup timeline, evidence, inline remediation)
- [ ] Automation & playbook library (save/apply once/always, scope, approvals)
- [ ] Run history / audit log
- [ ] Reports / SLA-RPO posture
- [ ] Per-product views (BCDR, Endpoint, Cloud, SaaS Protect, Spanning)
- [ ] Empty/loading/error states for every screen

## Phase 6 — Polish & verification  `[x]`

- [ ] `/impeccable polish` + `/impeccable audit` pass on every screen
- [ ] a11y pass (WCAG 2.2 AA, keyboard, non-color status, reduced motion)
- [ ] Light/dark parity check across all screens & stories
- [ ] Storybook coverage gate green (story per component, variants, play, a11y)
- [ ] Realistic-content review (mock data reads as real per product)
- [ ] Final demo walkthrough of key journeys

## Phase 7 — AI remediation harness (Guided fix + Fix with AI)  `[~]`

> POC tooling for the actual "fixing." Spec set: [`docs/fix-engine/INDEX.md`](docs/fix-engine/INDEX.md).
> Decisions (locked): real provider-flexible agent loop · simulated targets · standalone `fix-engine/`
> (CLI + local HTTP/SSE) · providers Anthropic/OpenAI/Gemini/Local + Mock · real scripts, simulated exec.

- [x] Spec set authored (`docs/fix-engine/` — 8 docs + INDEX; design contract pinned)
- [ ] **M1** — fix-engine core: `ModelProvider` abstraction + Mock provider + `FixSession` agent loop (state machine, budgets, halt, transcript) + shared-fleet wiring
- [ ] **M2** — AI-callable tool catalog + simulated `ExecutionBackend`s (agent-windows/linux, agentless, endpoint, saas-api) + real script artifacts + diagnostics + dry-run/diff
- [ ] **M3** — real provider adapters (Anthropic/OpenAI-compatible/Google/Local) + CLI + local HTTP/SSE server + model registry
- [ ] **M4** — front-end `FixClient` (SSE live + offline sim) + `GuidedFixPanel` / `AiFixConsole` / `FixTranscriptView` / `ModelPicker` / `ToolCallCard` wired into RemediationPanel/issue/asset
- [ ] **M5** — verify (tsc/build/storybook/a11y) + CLI smoke + live SSE demo + screenshots + ROADMAP

---

## Open decisions  `[!]`

- [ ] Confirm product name (working title "Kaseya Resolution Center").
- [ ] Single-app Storybook (current plan) vs. monorepo `@acme/ui` package — default single-app; revisit if a second consumer appears.
- [ ] Charts: Recharts vs Tremor for KPI tiles (default Recharts + Tremor tiles).

## Changelog

- 2026-06-22 — Phase 0 completed (research, impeccable v3.7.1 + hook, CLAUDE/PRODUCT/DESIGN, README, repo on GitHub). Build decisions locked (vertical slice / functional engine / BCDR / autonomous swarm). GitHub burn-down = milestones + issue per item. Phase 1 spec authoring in progress.
- 2026-06-23 — Phases 2–5 built via agent swarm (3 workflow waves: base layer → domain+atoms → molecules+organisms, + manual foundation & page integration). 84 components (32 shadcn primitives + 9 atoms + 15 molecules + 29 organisms) each with a story; full seeded mock engine (135 failure modes, 154 remediation actions, ~300 correlated assets) + simulated runner + 8 Zustand stores; `(console)` shell + 14 routes. Verified: `next build` ✓, `tsc` clean, `build-storybook` ✓, coverage 84/84, runtime smoke ✓.
- 2026-06-23 — Phase 5 surfaces completed (Overview, per-product lenses, Incident detail, Reports, route states) + **static export** (`output:"export"` → `out/`, deploys to Cloudflare Pages; dynamic routes split into server-shell + client-view with `generateStaticParams`). Phase 6 verification: **axe-core WCAG 2.2 AA audit across all 13 routes (light + dark) → 0 violations** via token-level contrast fixes; DESIGN.md synced. Pushed to PR cmiami/OpsParcero#1.
