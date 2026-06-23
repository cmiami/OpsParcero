# 00 — Vision, Scope & Product Model

Kaseya Resolution Center — the canonical product overview. Part of the spec set — see [INDEX](INDEX.md). Grounded in the product team's reference mock (`research/kaseya-resolution-center-reference.html`).

## 1. What it is

The **Kaseya Resolution Center** is a troubleshooting-first module **inside the Kaseya/Datto portal**. It is health-aware but not primarily a dashboard — it's where an MSP tech goes *when something is wrong* to see **issues grouped by category**, understand *why* each failed, and **fix it** — once or forever — without opening a vendor ticket.

The portal shell around it: nav **Home · Organizations · Assets · Resolution Center · Analytics · Alerts · Settings**, a tenant switcher, and "Recent Organizations." Brand framing: **Kaseya · Cyber Resilience**.

## 2. The problem

MSP techs manage backup/DR across hundreds–thousands of endpoints, servers, and SaaS tenants. A wall of "backup failed" alerts fires; most are self-serviceable but each needs a human to interpret it and click the fix (run a diff-merge, change a storage controller, re-authorize OAuth, force an offsite sync, restart an agent). Post-Kaseya, vendor support is slower, so self-serve matters more. Today there's no single place that tells a tech *which failures matter, why, and runs the fix*.

## 3. Product model (the spine)

**Issues grouped by category.** The home is: stat bar → summary cards → charts → **collapsible category groups** of issues. Categories: Backup failures · Verification failures · Auth & token errors · Agent offline / connectivity · Storage & policy · Compliance & coverage gaps · Performance & capacity.

Each **issue** carries: name + detail, **product** (SaaS / BCDR / Endpoint v2), **severity** (critical / warning), **occurrence count**, **impacted assets**, a plain-language **problem**, a **runbook**, and an **AI insight**.

**Fix classification (load-bearing).** Every issue has a fix type that sets expectation, color, and the available action:

| Fix type | Label | Color | Action |
|---|---|---|---|
| `full` | **End-to-end fix** | green | one-click / bulk "End-to-end fix all" — fully automated |
| `partial` | **Guided fix** | blue | runs the automatable steps, guides the human through the rest (`stepsAuto` count) |
| `external` / `manual` / `unknown` | **Insights only** | orange / gray | not controllable (vendor/infra/unknown) — diagnostic + runbook, no auto-fix |

**"We" vs "You" steps.** Each runbook splits steps into **"We" (automated)** and **"You" (manual)** — the explicit human-in-the-loop boundary. End-to-end = all-We; Guided = both; Insights = You/diagnostic.

**Apply once / Apply always.** Every fix offers **"Fix this once"** vs **"Always fix this type"** (and **"Always fix this category automatically"**) — "always" = a forward-going auto-remediation policy (mirrors Datto's own auto-diff-merge-after-5-failures).

**AI insight (purple).** Each issue carries an AI explanation — root-cause probability ("VSS failures follow Windows Update cycles in 78% of cases"), the preventive recommendation, and why it's classified as it is. Always a distinct, labeled surface.

**Outage awareness.** An active service-outage banner → modal with "Are you impacted?" listing affected vs unaffected assets, auto-retry note, and a status-page link — so techs don't chase symptoms of a known outage.

**Impacted-assets panel.** A right-side overlay listing occurrences + unique impacted assets, typed device/endpoint, SaaS account, or cloud service.

## 4. Scope — products

**Surfaced products:** **SaaS** (Spanning engine — Microsoft 365 + Google Workspace + Salesforce), **Datto BCDR** (SIRIS/ALTO appliances + agents), **Endpoint Backup v2** (Kaseya Endpoint Backup). These are the three product filters. (Endpoint Backup v1 is legacy/sunset; Spanning is the SaaS engine, also seen in org names.)

**Recovery Launchpad.** The recovery/test product **runs recoveries — on the local device or in the Datto Cloud**. **"Datto Cloud" is NOT a separate product**; it is a recovery *target/location*. Local recovery and cloud recovery (virtualization / test failover) are **two sub-modes of Datto BCDR recovery & DR testing**, orchestrated via Recovery Launchpad — modeled as `RecoveryTarget = 'local-device' | 'datto-cloud'`, not a distinct product. See [products/recovery-launchpad.md](products/recovery-launchpad.md).

## 5. Goals & non-goals

**Goals** — turn a wall of red into ranked, explained, fixable issues; resolve the median real failure from inside the Center without a vendor ticket; make the same fix never get done twice by hand (Fix once → Always); be a faithful Kaseya-portal surface.

**Non-goals (this build)** — not a backup *configuration* console (the products' own settings live elsewhere); not a replacement for the product portals; **front-end mock only** (no live backend/credentials/product APIs); not a real ITSM ticketing system.

## 6. Success metrics (mock-phase proxies)

| Outcome | Metric | Mock proxy |
|---|---|---|
| Faster resolution | MTTR of a real failure | time from issue-open → resolved in the flow |
| Self-serve | % resolved without a vendor ticket | % issues with a `full`/`partial` fix path |
| Less noise | alert-queue reduction | open-issue trend (resolved/day) |
| Stop repeat toil | recurring-failure auto-remediation | # issues converted to "Always fix" policies |

## 7. Mock-data realism (use the reference vocabulary)

Match authentic Kaseya/Datto terminology in mock data:
- **Orgs/tenants:** Spanning Demo Company, Back The Rack Up, Norwalk FIPS, BAC.
- **Assets:** `btru-fs1`, `btru-erp1/2`, `btru-dwp2`, `btru-hv2022`, `btru-dr-ubt`, `NOR-FIPS-APP/FS`, `dc01.norwalkfips.local`; SaaS `*@spanning.com`, `admin@spanningdemo.com`; Salesforce `sf-org-prod`.
- **Real terms/IDs:** SIRIS, VSA, Datto Windows Agent, Datto VSS Provider, diff-merge, screenshot verification, ShadowSnap, ports 25566/25568/3260/3262, stop 0x7B, BOOTMGR, NTDS/DSRM, error -255.
- **Real remediations:** Force Diff Merge, change storage controller to SATA, re-authorize OAuth / admin consent, force offsite sync, apply retention policy, restart agent service, re-push agent update, CPU throttling, increase NTFS change journal.

## 8. Primary use cases

1. Morning storm: a wall of issues → ranked by category/severity/fix-type → bulk End-to-end fix the safe ones.
2. Single issue: open it → problem + We/You steps + AI insight → Fix once, or Always-fix the type.
3. Recurring failure → "Always fix this category automatically."
4. Outage hits → "Are you impacted?" → see affected assets, let auto-retry handle it.
5. Coverage gap → unprotected assets → assign policy.
