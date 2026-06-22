# Datto Care Center — Master Roadmap

> **This is the resume-anywhere progress tracker.** Check items off as they complete. At the start of any session: read this file, read `CLAUDE.md`, run `node .claude/skills/impeccable/scripts/context.mjs`, then continue at the first unchecked item.
>
> **Status legend:** `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked/needs decision
>
> **Working title:** Datto Care Center (Backup Troubleshooting & Automation Center). Front-end mock · shadcn/ui · Storybook design system · Kaseya/Datto tokens · impeccable-enforced.

---

## Where we are right now

- ✅ **Phase 0 (Foundation) complete** — research done (135 failure modes across 6 products + design/UX/arch/storybook briefs), impeccable v3.7.1 installed + hook enabled, brand tokens confirmed, `CLAUDE.md` / `PRODUCT.md` / `DESIGN.md` / `README.md` written, **repo on GitHub (`cmiami/OpsParcero`, pushed to `main`)**.
- 🟡 **Phase 1 (Specification) in progress** — spec doc set being authored to `docs/`.
- 👉 **Next:** finish specs → set up GitHub burn-down (milestones + issues) → **Phase 2 scaffold + design system/Storybook** → **BCDR vertical slice**.

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

## Phase 1 — Specification (spec-level, pre-build)  `[~]`

> Goal: every design/architecture/data/feature decision defined before writing app code. Index: `docs/INDEX.md`.

- [x] `docs/INDEX.md` — spec index
- [ ] `docs/00-vision-and-scope.md` — vision, problem, goals/non-goals, scope, success metrics
- [ ] `docs/01-personas-and-jobs.md` — personas, jobs-to-be-done, key user journeys
- [ ] `docs/02-failure-catalog.md` — per-product failure catalog → symptoms, causes, self-serve vs human-in-loop, candidate remediation actions (the action source-of-truth)
- [~] `docs/03-design-system.md` — canonical tokens, status system, component styling (DESIGN.md + research done; full spec pending)
- [ ] `docs/04-information-architecture.md` — nav model, routes, page map, URL/state, saved views
- [ ] `docs/05-domain-model.md` — entities & relationships per product (assets, jobs, recovery points, alerts, actions, playbooks…)
- [ ] `docs/06-data-model-and-mock-data.md` — TypeScript schemas + deterministic seeded mock-data generation plan
- [ ] `docs/07-troubleshooting-and-automation-engine.md` — **the core**: action model, chaining, scope (once/all/always), save-as-playbook, approvals, dry-run, audit log
- [ ] `docs/08-feature-specs.md` — feature-by-feature specs (triage queue, asset detail, automation library, run history, reports…)
- [ ] `docs/09-page-specs.md` — page-by-page, wireframe-level layout specs
- [ ] `docs/10-component-inventory.md` — atomic component inventory mapped to shadcn primitives + custom composites
- [ ] `docs/storybook-design-system.md` — Storybook architecture, atomic structure, 100% coverage plan, theming/addons
- [ ] `docs/11-tech-architecture.md` — stack, folder structure, state, mock services, token/lint enforcement
- [ ] `docs/12-content-strategy.md` — rich per-product content, runbook copy, microcopy, empty/error states
- [ ] `docs/13-implementation-phases.md` — detailed build milestones (feeds Phase 2+ below)
- [ ] `docs/products/*.md` — per-product deep dives (BCDR, Endpoint Backup v1/v2, Datto Cloud, SaaS Protect, Spanning)
- [ ] **Spec review pass** — self-review the set for coverage/consistency; resolve any `[!]` decisions with the user

## Phase 2 — Project scaffold & design system  `[ ]`

- [ ] Scaffold Next.js (App Router) + TS + Tailwind v4 + shadcn/ui; install pinned deps
- [ ] Write `src/app/globals.css` token blocks (light + dark) from the design system spec
- [ ] Wire Tailwind theme to tokens; fonts (Plus Jakarta Sans + Figtree)
- [ ] Stand up Storybook 10 (`@storybook/nextjs-vite`) + addons; preview theme decorator
- [ ] Foundations stories (color, typography, spacing, radius, elevation, icons, status)
- [ ] Add shadcn primitives + Atom stories (100% coverage)
- [ ] Configure token/lint enforcement (stylelint/eslint ban on hardcoded values)

## Phase 3 — Mock data & domain layer  `[ ]`

- [ ] Implement TypeScript domain types from `docs/05-domain-model.md`
- [ ] Implement seeded deterministic mock-data generator (fleets, assets, jobs, recovery points, alerts, run history) across all products
- [ ] Mock "action runner" service (simulated execution, latency, outcomes) + localStorage persistence
- [ ] Zustand stores (action cart/chains, playbooks, saved views); nuqs URL state

## Phase 4 — Core molecules & organisms  `[ ]`

- [ ] StatusBadge, BackupHealthCell, last-10 dot-strip, FleetRollup, severity chips
- [ ] DataTable (TanStack) with sticky header/col, bulk toolbar, saved views
- [ ] App shell: Tiber sidebar + top omni-search bar + command palette
- [ ] ActionCart / action-chain builder, ApplyScope control (once/all/always), PlaybookStepCard
- [ ] AssetTimeline, AlertTriageRow, RemediationPanel — each with stories

## Phase 5 — Pages / screens  `[ ]`

- [ ] Overview / fleet health
- [ ] Triage queue (incident/alert grouping, dedup, severity)
- [ ] Asset detail (backup timeline, evidence, inline remediation)
- [ ] Automation & playbook library (save/apply once/always, scope, approvals)
- [ ] Run history / audit log
- [ ] Reports / SLA-RPO posture
- [ ] Per-product views (BCDR, Endpoint, Cloud, SaaS Protect, Spanning)
- [ ] Empty/loading/error states for every screen

## Phase 6 — Polish & verification  `[ ]`

- [ ] `/impeccable polish` + `/impeccable audit` pass on every screen
- [ ] a11y pass (WCAG 2.2 AA, keyboard, non-color status, reduced motion)
- [ ] Light/dark parity check across all screens & stories
- [ ] Storybook coverage gate green (story per component, variants, play, a11y)
- [ ] Realistic-content review (mock data reads as real per product)
- [ ] Final demo walkthrough of key journeys

---

## Open decisions  `[!]`

- [ ] Confirm product name (working title "Datto Care Center").
- [ ] Single-app Storybook (current plan) vs. monorepo `@acme/ui` package — default single-app; revisit if a second consumer appears.
- [ ] Charts: Recharts vs Tremor for KPI tiles (default Recharts + Tremor tiles).

## Changelog

- 2026-06-22 — Phase 0 completed (research, impeccable v3.7.1 + hook, CLAUDE/PRODUCT/DESIGN, README, repo on GitHub). Build decisions locked (vertical slice / functional engine / BCDR / autonomous swarm). GitHub burn-down = milestones + issue per item. Phase 1 spec authoring in progress.
