# Product

<!-- Impeccable strategic context. Product overview & model: docs/00-vision-and-scope.md.
     Product: Kaseya Resolution Center (repo codename OpsParcero) — a Kaseya/Datto portal module.
     Scope: SaaS (Spanning) / BCDR (incl. Recovery Launchpad: local-device or Datto-Cloud recovery) / Endpoint v2. -->

## Register

product

## Users

**Primary: MSP technicians and NOC/SOC analysts** at Managed Service Providers who manage backup & disaster recovery for dozens to thousands of client endpoints, servers, and SaaS tenants across the Datto/Kaseya portfolio (Datto BCDR/SIRIS-ALTO, Datto Endpoint Backup v1 & v2, Datto Cloud DR, SaaS Protect, Spanning).

Their context: they live in a queue. A backup "failed" alert fired at 2 a.m. across 14 clients; they need to know in seconds which failures are real data-protection risks versus cosmetic noise (a screenshot boot-test timing out is not the same as a missed backup), why each failed, and how to fix it — ideally without opening a ticket with vendor support (a major post-Kaseya pain point). They are time-pressured, keyboard-driven, fluent in tables and filters, and skeptical of dashboards that look pretty but don't shorten the path from red status to resolved.

**Secondary:** MSP service managers / team leads (fleet health, SLA/RPO posture, recurring-failure trends, who's drowning in alerts) and onboarding/junior techs (need guided runbooks that teach the fix).

The job to be done: **"A backup failed (or a fleet of them did). Tell me which ones matter, why, and let me fix them — once or forever — without leaving this screen or calling support."**

## Product Purpose

Kaseya Resolution Center is a **troubleshooting-first automation console** for the Datto/Kaseya data-protection stack. It is health-aware (it rolls up fleet success/failure and last-good-backup recency) but it is **not primarily a backup dashboard** — it is the place you go *when something is wrong* to diagnose and remediate it.

The core differentiator: most backup failures across these products are self-serviceable but require a human in the loop or a manual button click today (re-run a screenshot, run a diff-merge / rebuild the backup chain, force retention to free a full storage pool, restart a wedged agent, re-authorize an expired M365/Google OAuth grant, re-seed a Spanning Salesforce connection). Care Center turns those into **discrete, parameterized remediation actions** that users can run on one asset, **chain together** into a sequence, **scope** (apply once to this asset / apply to all matching / apply always going forward as an auto-remediation policy), **save as reusable playbooks**, gate behind approvals, and review in an audit log. It is "self-healing backups with a human in the loop, when the human wants to be."

Success looks like: the median real failure is resolved from inside Care Center, by the tech, without a vendor ticket; recurring failures get a saved playbook or an always-on auto-remediation; and the alert queue shrinks because noise is triaged and the same fix is never done by hand twice.

This build is a **front-end mock** (realistic mock data, no live backend) that fully expresses the design system, information architecture, content, and interaction model — the foundation a real integration would later plug into.

## Brand Personality

Three words: **trustworthy, fast, expert.** This is infrastructure software for people whose job is reliability; it should feel like a senior engineer's console, not a consumer app. The voice is calm and precise under pressure (it never cries wolf — it distinguishes a cosmetic warning from a data-loss risk), it shows the evidence (the actual error, the chain state, the last 10 attempts) rather than hand-waving, and it earns confidence by being correct and dense without being cluttered. Emotional goal: a tech who was dreading a wall of red alerts feels *in control* within ten seconds.

It must read as a native **Kaseya/Datto portal** surface — white left nav, Kaseya-blue primary, the fix-classification color system, purple reserved for AI-assist — so it feels like part of the suite, not a third-party bolt-on.

## Anti-references

- **Generic AI-slop SaaS:** purple-gradient hero, glassmorphism cards, identical icon-heading-text card grids, big-number "hero metric" templates, tiny uppercase tracked eyebrows over every section. This is a tool, not a landing page.
- **Pretty-but-useless dashboards:** dashboards that show a green donut and stop — no drill-down, no "why," no next action. Status without a path to resolution is the failure mode we exist to fix.
- **Consumer dashboards (Mint/fitness-app aesthetics):** oversized friendly illustrations, low information density, playful motion. Our users want density and speed.
- **The legacy Datto/enterprise-Java look:** cramped gray-on-gray grids, no whitespace rhythm, inconsistent controls. Match-and-avoid: we keep the density but bring modern clarity, hairline structure, and tuned typography.
- **Alarm-fatigue red everywhere:** coloring every imperfect state critical-red. Reserve red for real failures; paused/intentional and cosmetic states are deliberately desaturated.

## Design Principles

1. **Triage before detail.** Every screen answers "what matters most right now?" first. Severity drives sort and rollup (a fleet's health is its worst real child state, not an average). Real risk outranks cosmetic noise everywhere.
2. **Every red leads to a green button.** A failure is never a dead end — it surfaces its likely cause and the remediation action(s) that fix it, inline. Show, don't tell: render the evidence (error string, chain state, last-10 dot-strip) next to the fix.
3. **Fix once, then fix forever.** The same manual fix should never be done twice by hand. Single action → chain → save as playbook → apply-always auto-remediation policy is the spine of the product, not a feature bolted on.
4. **Human in the loop by choice, not by friction.** Automate the safe and mechanical; require human judgement only where data-loss risk or irreversibility demands it (with explicit approval gates and dry-run/preview). Never make the human click through ceremony for a safe action.
5. **Earned familiarity.** Standard, consistent affordances (one button vocabulary, one table model, one status badge) screen to screen. The tool disappears into the task; delight lives in moments (a clean resolution, a satisfying "12 assets remediated"), never in decoration.

## Accessibility & Inclusion

- **WCAG 2.2 AA** target. Body text ≥ 4.5:1, large/UI text ≥ 3:1, against actual token backgrounds (including the teal-black dark surfaces and amber warning states, which are the easy contrast failures).
- **Never color-only status.** Every backup/health state is dot + icon + text label, so red/green color-blind users and grayscale renders are unambiguous (this also matches Datto's own green-circle/red-X + "Paused" label convention).
- Full keyboard operability (this audience is keyboard-first): global command palette, focus-visible rings on every interactive element, logical tab order, table row navigation, no keyboard traps in dialogs/sheets.
- `prefers-reduced-motion` honored on every animation (syncing spinners, reveals) with a non-animated alternative.
- Dense and comfortable modes (row-height toggle) so the density that power users want doesn't exclude users who need larger targets.
