# Kaseya Resolution Center — Spec Index

Master tracker: [`../ROADMAP.md`](../ROADMAP.md) · Operating contract: [`../CLAUDE.md`](../CLAUDE.md) · Impeccable context: [`../PRODUCT.md`](../PRODUCT.md), [`../DESIGN.md`](../DESIGN.md)

## Specification set (`docs/`)

| # | Doc | Purpose |
|---|---|---|
| 00 | [vision-and-scope](00-vision-and-scope.md) | Vision, problem, goals/non-goals, scope, success metrics |
| 01 | [personas-and-jobs](01-personas-and-jobs.md) | Personas, jobs-to-be-done, key journeys |
| 02 | [failure-catalog](02-failure-catalog.md) | Per-product failure modes → causes, self-serve vs human-in-loop, remediation actions |
| 03 | [design-system](03-design-system.md) | Canonical tokens, status system, component styling |
| 04 | [information-architecture](04-information-architecture.md) | Nav, routes, page map, URL/state, saved views |
| 05 | [domain-model](05-domain-model.md) | Entities & relationships per product |
| 06 | [data-model-and-mock-data](06-data-model-and-mock-data.md) | TS schemas + seeded deterministic mock-data plan |
| 07 | [troubleshooting-and-automation-engine](07-troubleshooting-and-automation-engine.md) | **Core**: actions, chaining, scope (once/all/always), playbooks, approvals, audit |
| 08 | [feature-specs](08-feature-specs.md) | Feature-by-feature specifications |
| 09 | [page-specs](09-page-specs.md) | Page-by-page wireframe-level layout specs |
| 10 | [component-inventory](10-component-inventory.md) | Atomic component inventory → shadcn primitives + composites |
| — | [storybook-design-system](storybook-design-system.md) | Storybook architecture, atomic structure, 100% coverage, theming |
| 11 | [tech-architecture](11-tech-architecture.md) | Stack, folders, state, mock services, token/lint enforcement |
| 12 | [content-strategy](12-content-strategy.md) | Per-product content, runbook copy, microcopy, empty/error states |
| 13 | [implementation-phases](13-implementation-phases.md) | Detailed build milestones |

## Per-product deep dives (`docs/products/`)

- [BCDR (SIRIS/ALTO)](products/bcdr.md) · [Endpoint Backup v1/v2](products/endpoint-backup.md) · [Datto Cloud DR](products/datto-cloud.md) · [SaaS Protect](products/saas-protect.md) · [Spanning](products/spanning.md)

## Research (grounding) (`docs/research/`)

- [00 failure-catalog digest](research/00-failure-catalog-digest.md) (+ `failure-catalog.json`) · [01 design system](research/01-design-system-research.md) · [02 automation UX](research/02-automation-ux-research.md) · [03 dashboard UX](research/03-dashboard-ux-research.md) · [04 architecture](research/04-architecture-research.md) · [05 storybook](research/05-storybook-research.md)
