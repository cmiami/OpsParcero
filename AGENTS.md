# AGENTS.md — Kaseya Resolution Center (operating contract)

> **For Codex / agent harnesses that read `AGENTS.md`.** This mirrors [`CLAUDE.md`](CLAUDE.md) — the two are kept in sync; if you edit one mandate, edit both. Working title: **Kaseya Resolution Center** (repo codename **OpsParcero**) — a troubleshooting-first automation module inside the Kaseya/Datto portal. Front-end mock, realistic mock data, shadcn/ui, Kaseya-portal design system.
>
> This file is law. The §1 mandates are non-negotiable; there is no task important enough to break them. If a request appears to require breaking one, stop and surface the conflict.

## 0. Start-of-session checklist

1. **Read [`docs/00-vision-and-scope.md`](docs/00-vision-and-scope.md)** — the product overview & model (identity, issues-by-category, fix-classification, "We/You" steps, apply once/always, outage, Recovery Launchpad, scope).
2. **Read [`ROADMAP.md`](ROADMAP.md)** (the burn-down tracker) and skim [`docs/INDEX.md`](docs/INDEX.md).
3. **Run impeccable session setup once:** `node .agents/skills/impeccable/scripts/context.mjs` (prints `PRODUCT.md` + `DESIGN.md`). Follow what it prints.
4. Pick up the next open issue / ROADMAP item.

## 1. NON-NEGOTIABLE MANDATES

**Never work outside these.**

- **M1 — Design tokens only.** Every color/space/radius/font/shadow/z-index/duration comes from a token (CSS variable / Tailwind theme in `src/app/globals.css`, documented in `DESIGN.md` + `docs/03-design-system.md`). Banned: raw hex/rgb/hsl literals, arbitrary Tailwind values (`bg-[#0E67F5]`, `p-[13px]`), inline `style` colors, magic spacing, `z-[9999]`. Need a new value? Add a token (globals.css + Foundations story + DESIGN.md), don't inline it.
- **M2 — Design-system / Storybook first.** Every UI element is a real component in the atomic-design library (`Foundations → Atoms → Molecules → Organisms → Templates → Pages`), built & verified in Storybook **before** use in a route. Every component has a story (`autodocs`, full `argTypes`, one export per variant/state, `play` for interactions). No bespoke one-offs; if it doesn't exist, add it to the library.
- **M3 — Impeccable for all UI work.** Use the impeccable skill (`craft|shape|polish|audit|critique|harden|clarify|layout|colorize|typeset|...`) for any UI create/change. Default new-UI flow: `shape → build → polish → audit`. Obey impeccable's absolute bans (no side-stripe borders, gradient text, decorative glassmorphism, hero-metric template, identical card grids, per-section uppercase eyebrows, nested cards). The design-detector **hook runs after every Edit/Write/apply_patch** on UI files (`.codex/hooks.json` → `.agents/skills/impeccable/scripts/hook.mjs`) — address its findings; suppress only confirmed-intentional ones via `node .agents/skills/impeccable/scripts/hook-admin.mjs ignore-...`.
- **M4 — Match the Kaseya portal design system.** Per `DESIGN.md` + [`docs/00-vision-and-scope.md`](docs/00-vision-and-scope.md): white left nav, blue topbar/primary (`#0E67F5`/`#1565C0`), purple AI-assist accent (AI only), fix-classification colors (green/blue/orange/gray). Status never color-only.
- **M5 — Accessibility (WCAG 2.2 AA).** Contrast ≥ 4.5:1 body / 3:1 large+UI on real token backgrounds; status = dot + icon + text (never color alone); full keyboard operability; visible focus; reduced-motion alternatives.
- **M6 — Front-end mock only.** No real backend/credentials/live product APIs. Typed, seeded, deterministic mock fixtures; the action engine simulates execution (optimistic UI + simulated outcomes) and persists to `localStorage`. Mock data must read as real (use the vocabulary in `docs/00-vision-and-scope.md` §7).
- **M7 — No competitors in the product.** This is a Kaseya/Datto product. **Never** put competitor or third-party-tool names, branding, copy, screenshots, or recognizably-derived patterns into product code, UI, mock data, comments, or content (e.g. Veeam, NinjaOne, Acronis, PagerDuty, Datadog, Grafana, Tines, Torq, n8n, ServiceNow, Rundeck, Zapier). Such tools were generic-UX reference only, confined to `docs/research/`; describe patterns generically. If you spot a competitor name anywhere outside `docs/research/`, remove it.

## 2. Tokens, components, stack

- **Tokens:** source of truth is `src/app/globals.css` (`:root` + `.dark`) → Tailwind theme → Storybook **Foundations** stories → `DESIGN.md`. Keep in sync; `globals.css` wins. Add tokens, never inline values.
- **Stack (locked):** Next.js (App Router) + TypeScript · Tailwind v4 · shadcn/ui (Radix) · lucide-react · Storybook 10 (`@storybook/nextjs-vite`; addons docs/a11y/themes/vitest/designs — essentials are in core) · Recharts (+ optional Tremor tiles) · TanStack Table · Zustand (action cart/chains/playbooks) · nuqs (URL/filter state) · Sonner toasts · localStorage. Node 20.19+/22.12+; pin one React version. Rationale: `docs/11-tech-architecture.md`, `docs/research/04-architecture-research.md`, `docs/research/05-storybook-research.md`.

## 3. Project map

`docs/00-vision-and-scope.md` (product overview) · `ROADMAP.md` (burn-down) · `PRODUCT.md`/`DESIGN.md` (impeccable context) · `docs/INDEX.md` (spec index) · `docs/` (spec set) · `docs/research/` (grounding, incl. the reference HTML) · `.agents/skills/impeccable/` + `.codex/` (Codex impeccable + hook) · `.claude/` (Claude impeccable + hook).

## 4. Definition of done (every UI change)

Tokens only (M1) · in the design system with a complete story (M2) · produced/checked via impeccable, hook clean (M3) · matches the Kaseya-portal system (M4) · a11y incl. non-color status (M5) · realistic mock data, no backend (M6) · no competitor content (M7) · renders in light **and** dark. If any fails, it's not done.
