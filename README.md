# OpsParcero — Kaseya Resolution Center

A **troubleshooting-first automation console** for the Datto/Kaseya data-protection stack (Datto BCDR, Endpoint Backup v1/v2, Datto Cloud DR, SaaS Protect, Spanning). It is health-aware but not primarily a dashboard — it's where an MSP tech goes to diagnose *why* a backup failed and **fix it**, turning manual fixes into discrete remediation **actions** that can be chained, scoped (apply once / to all matching / always), saved as **playbooks**, gated by approvals, and audited.

This repo is a **front-end mock** (realistic mock data, functional client-side action engine — no live backend). Built with shadcn/ui on the Kaseya/Datto design system, with a Storybook component library that ships as part of the product.

## Start here (every session / fresh clone)

1. **Read [`CLAUDE.md`](CLAUDE.md)** — the operating contract and non-negotiable mandates (tokens-only, Storybook/design-system-first, impeccable-always, a11y, mock-only).
2. **Read [`ROADMAP.md`](ROADMAP.md)** — the resume-anywhere progress tracker (numbered steps). GitHub Issues/Milestones mirror it as the live burn-down (see below).
3. **Run impeccable setup:** `node .claude/skills/impeccable/scripts/context.mjs` (prints `PRODUCT.md` + `DESIGN.md`).
4. Skim **[`docs/INDEX.md`](docs/INDEX.md)** — the full spec set.
5. Pick up the first open item in `ROADMAP.md` / the next open GitHub issue.

## Build decisions (locked)

- **Vertical slice first** — app shell + design system, then **Datto BCDR end-to-end** (triage → asset detail → remediate → chain → save playbook → apply-always), then replicate to other products.
- **Functional client-side engine** — real Zustand + localStorage; actions genuinely queue/chain/run (simulated), apply-once/all/always and save-playbook actually work.
- **Autonomous long swarm** — parallel agents (worktree-isolated where they touch shared files) burn down the numbered list; check-ins at blockers/decisions.

## How progress is tracked on GitHub

The numbered items in `ROADMAP.md` are the project's burn-down list. Each completed item lands as a commit to `main` (lightweight; PR only when review adds value) that closes its tracking issue. **GitHub is the system of record for "where we are."**

## Tooling notes

- **impeccable v3.7.1** (design skill + PostToolUse detector hook) is committed under `.claude/`. The hook is in `.claude/settings.json` (shared) so it works on clone and in worktrees. If ever missing, reinstall with `npx impeccable install` or `/plugin marketplace add pbakaus/impeccable`.
- Machine-local files (`.claude/settings.local.json`, `.impeccable/config.local.json`) are gitignored.

## Stack (planned)

Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui · lucide-react · Storybook 10 (`@storybook/nextjs-vite`) · TanStack Table · Zustand · nuqs · Recharts/Tremor · Sonner. See [`docs/11-tech-architecture.md`](docs/11-tech-architecture.md).
