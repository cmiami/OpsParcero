# CLAUDE.md — Kaseya Resolution Center (operating contract)

> **Product:** **Kaseya Resolution Center** (repo codename **OpsParcero**) — a troubleshooting-first automation **module inside the Kaseya/Datto portal**. Covers **SaaS** (Spanning: M365 / Google / Salesforce), **Datto BCDR** (incl. recovery/test via **Recovery Launchpad**, on local device or in the Datto Cloud), and **Endpoint Backup v2**. Front-end mock, realistic mock data, shadcn/ui, Kaseya-portal design system. **Mirror file for Codex: [`AGENTS.md`](AGENTS.md) — keep the two in sync.**
>
> **Product overview & model:** [`docs/00-vision-and-scope.md`](docs/00-vision-and-scope.md) — issues-by-category, fix-classification (End-to-end / Guided / Insights), "We/You" steps, apply once/always, outage awareness, Recovery Launchpad, scope (SaaS / BCDR / Endpoint v2).
>
> This file is law. Read it at the start of **every** session and obey it. The rules in §1 are **non-negotiable mandates** — there is no task important enough to break them. If a request appears to require breaking one, **stop and surface the conflict** instead of working around it.

---

## 0. Start-of-session checklist (do this first, every session)

1. **Read [`docs/00-vision-and-scope.md`](docs/00-vision-and-scope.md)** (the product overview & model), then `ROADMAP.md` (the progress tracker) and skim `docs/INDEX.md`.
2. **Run impeccable session setup** once: `node .claude/skills/impeccable/scripts/context.mjs`. It prints `PRODUCT.md` + `DESIGN.md` (already present). Follow whatever it prints. Do **not** re-run it if you've already seen its output this session.
3. **Internalize the mandates in §1.** They govern every line of UI you write.
4. Pick up the next unchecked ROADMAP item, or the user's request — whichever applies.

---

## 1. NON-NEGOTIABLE MANDATES

**You must NEVER work outside these requirements.** They are not preferences; they are the definition of acceptable work on this project.

### M1 — Design tokens only. Never hardcode visual values.
- **Every** color, spacing, radius, font, shadow, z-index, and duration comes from a **design token** (CSS variable / Tailwind theme token defined in `src/app/globals.css`). The token set is documented in `DESIGN.md` and `docs/03-design-system.md`.
- **Banned in component/page code:** raw hex/rgb/hsl color literals; arbitrary Tailwind values for color/spacing/radius (`bg-[#0E67F5]`, `p-[13px]`, `rounded-[7px]`); inline `style={{ color: '#...' }}`; pixel magic numbers for spacing; `z-[9999]`; ad-hoc font families.
- **Use instead:** semantic Tailwind classes bound to tokens (`bg-primary`, `text-muted-foreground`, `border-border`, `rounded-md`, `gap-4`, `text-sm`), the status tokens, and the typographic scale. Need a value that doesn't exist as a token? **Add the token** (to `globals.css` + Foundations stories + `DESIGN.md`), don't inline it.
- Enforced by: the impeccable design-detector hook (PostToolUse), and a planned stylelint/eslint rule banning color/arbitrary literals (see `docs/11-tech-architecture.md`).

### M2 — Storybook / design-system first. No one-off UI.
- **The design system (in Storybook) is the source of truth for UI.** Every UI element is a real component in the library, organized by **atomic design**: `Foundations → Atoms → Molecules → Organisms → Templates → Pages`.
- **Build and verify a component in Storybook before** wiring it into a route/page. Pages compose existing organisms/molecules; they do not invent markup.
- **Every component has a story** (`*.stories.tsx`) with: `autodocs`, `argTypes` covering all props/variants, one named export per meaningful variant/state, and a `play` function for interactive states. This is the **100% coverage** rule — a component without a story does not exist.
- **No bespoke duplicates.** If you need a button/badge/table/card, use the library's. If it doesn't exist, add it to the library (with a story) — never hand-roll a divergent copy inside a page.
- Storybook is **part of the product**, not throwaway. It ships and stays green. See `docs/storybook-design-system.md`.

### M3 — Impeccable is always used for UI work.
- For **any** task that creates or changes UI (a screen, a component, styling, copy, motion, states), use the **impeccable** skill — `/impeccable craft|shape|polish|audit|critique|harden|onboard|clarify|layout|colorize|typeset|adapt|optimize` as fits the task. Default flow for new UI: `/impeccable shape` → build → `/impeccable polish` → `/impeccable audit`.
- Obey impeccable's **absolute bans** (no side-stripe borders, gradient text, decorative glassmorphism, hero-metric template, identical card grids, per-section uppercase eyebrows, nested cards) and its **product-register** guidance in `reference/product.md`.
- The design-detector **hook runs after every Edit/Write** on UI files and surfaces findings as system reminders — **address them**, don't ignore them. Only suppress a finding the user has confirmed is intentional, and only via `node .claude/skills/impeccable/scripts/hook-admin.mjs ignore-...` (never inline comments, never hand-edit `.impeccable/config.json`).
- Impeccable and this design system are complementary: **impeccable enforces craft; the tokens/`DESIGN.md` enforce brand fidelity.** When impeccable suggests a value, express it as a token.

### M4 — Match the Kaseya portal design system.
- **White left nav; Kaseya-blue (`#0E67F5` / `#1565C0`) primary** for actions/active/focus; **purple (`#6A1B9A`) for AI-assist ONLY**; **fix-classification colors** (green End-to-end · blue Guided · orange Insights · gray Unknown). Fonts: **Plus Jakarta Sans** (display) + **Figtree** (body/UI, 13px base). Tokens & status semantics per `DESIGN.md` + `docs/03-design-system.md`. (Datto-blue / Tiber-teal are demoted to product-context accents, not the shell.)

### M5 — Accessibility is not optional (WCAG 2.2 AA).
- Contrast ≥ 4.5:1 body / 3:1 large+UI against real token backgrounds (watch amber + teal-black). **Status is never color-only** — always dot + icon + text. Full keyboard operability, visible focus rings, reduced-motion alternatives on every animation.

### M6 — Front-end mock, realistic mock data.
- This phase is **front-end only**. No real backend/credentials/live product APIs. Data comes from typed, seeded, deterministic mock fixtures (see `docs/06-data-model-and-mock-data.md`). Actions simulate execution (optimistic UI + simulated latency/outcomes) and persist to `localStorage`. Mock data must look *real* (plausible hostnames, error strings, chains, timestamps — use the vocabulary in [00-vision §7](docs/00-vision-and-scope.md)) — it is the product's content.

### M7 — No competitors in the product.
- This is a **Kaseya/Datto product**. **Never** put competitor or third-party-tool names, branding, copy, screenshots, or recognizably-derived patterns into product code, UI, mock data, comments, or content — e.g. **Veeam, NinjaOne, Acronis, Cohesity, Rubrik, PagerDuty, Datadog, Grafana, Tines, Torq, n8n, ServiceNow, Rundeck, Zapier**. Those tools informed generic UX patterns only and are confined to `docs/research/`; in the product, describe patterns generically (e.g. "saved views," "canvas builder," "two-bucket step picker"). If you find a competitor name anywhere outside `docs/research/`, remove it.

---

## 2. Token system — how to use it

- **Source of truth:** `src/app/globals.css` (`:root` light + `.dark` dark token blocks) → consumed by Tailwind theme → rendered as **Foundations** stories in Storybook → documented in `DESIGN.md`. These four must stay in sync; `globals.css` wins.
- **Adding a token:** add to `globals.css` (light + dark), expose via Tailwind theme, add/extend a Foundations story, note it in `DESIGN.md`. Then use it.
- **Key semantic tokens:** `--primary` (Kaseya blue) / `--primary-accent`, `--ai` (purple, AI only), fix-classification `--fix-{endtoend|guided|insights|unknown}`, severity `--critical`/`--warning`/`--success`, `--background`/`--surface`/`--subtle`, `--ink`/`--muted-fg`/`--faint-fg`, `--border`, product accents `--product-{saas|bcdr|endpoint}`. Full table in `docs/03-design-system.md`.

## 3. Component & Storybook workflow

- Component lives in the library with its story. Atomic level decides location (`atoms/`, `molecules/`, `organisms/`, `templates/`). shadcn primitives are atoms; product composites (StatusBadge, BackupHealthCell, ActionCartRow, PlaybookStepCard, AssetTimeline, AlertTriageRow, FleetRollup) are molecules/organisms.
- A page/route is a thin composition of organisms/templates + mock data. Logic (filtering, action-cart state) lives in hooks/stores, not in markup.
- Definition of done for a component: all interaction states present, story with full `argTypes` + variants + `play`, a11y panel clean, renders identically in light/dark, no hardcoded values, impeccable hook clean.

## 4. Tech stack (locked — do not substitute without updating this file)

- **Next.js (App Router) + TypeScript** · **Tailwind v4** · **shadcn/ui** (Radix) · **lucide-react** icons.
- **Storybook 10** (`@storybook/nextjs-vite`) + addons: `addon-docs`, `addon-a11y`, `addon-themes`, `addon-vitest`, `addon-designs`. (Essentials are in core — do not install them.)
- **Charts:** Recharts (or Tremor for KPI tiles). **Data grids:** TanStack Table. **Client state (action cart / chains / playbooks):** Zustand. **URL state (filters/saved views):** nuqs. **Toasts:** Sonner. **Mock persistence:** localStorage.
- Node 20.19+ / 22.12+. Pin a single React version across the workspace. Rationale: `docs/research/04-architecture-research.md`, `docs/research/05-storybook-research.md`.

## 5. Project map

- `ROADMAP.md` — **master progress tracker** (checkboxes; resume here across sessions).
- `PRODUCT.md` / `DESIGN.md` — impeccable strategic + visual context (read by every impeccable command).
- `docs/INDEX.md` — index of all spec docs.
- `docs/` — spec set: vision, personas, **failure catalog**, design system, IA, domain & data model, **troubleshooting/automation engine**, feature specs, page specs, component inventory, tech architecture, content strategy, **storybook design system**, implementation phases.
- `docs/research/` — captured research grounding the specs (failure catalog JSON + design/UX/arch/storybook briefs).
- `.claude/skills/impeccable/` — impeccable v3.7.1 (installed). `.claude/agents/` — impeccable helper agent.

## 6. Definition of done (every UI change)

A change is done only when **all** hold: uses tokens only (M1) · lives in the design system with a complete story (M2) · was produced/checked via impeccable and its hook is clean (M3) · matches Kaseya/Datto tokens (M4) · passes a11y incl. non-color status (M5) · uses realistic mock data, no real backend (M6) · no competitor content (M7) · renders correctly in light **and** dark. If any fails, it is not done.
