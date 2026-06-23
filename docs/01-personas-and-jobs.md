# Personas & Jobs-to-be-Done

Who uses Kaseya Resolution Center, the jobs they hire it to do, and the journeys the product must serve.
Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

> Grounding: [PRODUCT.md](../PRODUCT.md), the [automation UX research](research/02-automation-ux-research.md), the [dashboard/triage UX research](research/03-dashboard-ux-research.md), and the [failure-catalog digest](research/00-failure-catalog-digest.md). Personas drive [information architecture](04-information-architecture.md), the [failure catalog](02-failure-catalog.md), and the [automation engine](07-troubleshooting-and-automation-engine.md). This doc is the source of truth for *who* and *why*; the *what* and *how* live downstream.

---

## 1. Audience overview

Kaseya Resolution Center is built for **the people inside an MSP's backup/DR practice**, not for the MSP's end customers. The whole product is shaped around one operator who lives in an alert queue and is judged on whether client data is recoverable. Everyone else is a supporting role around that operator.

| Persona | Role in product | Priority | Primary surface |
|---|---|---|---|
| **Maya — MSP backup tech / NOC analyst** | Diagnoses and remediates failures; the operator the product is designed around | **Primary** | Triage Queue → Asset detail → Action cart |
| **Dev — Service manager / team lead** | Owns fleet health, SLA/RPO posture, recurring-failure trends, approvals, client deliverables | Secondary | Overview / fleet rollups, Run history, Approvals, Playbook governance |
| **Sam — Junior / onboarding tech** | Learning the stack; needs guided runbooks that teach the fix, guardrails against blast radius | Secondary | Suggested-fix cards, dry-run, playbooks (run, not author), approval-gated apply |
| **Riley — MSP client / end customer** | Wants assurance their data is protected and recoverable | **Out of scope (viewer only)** | A read-only DR-readiness / SLA report *generated from* the product (see §4d) — not a login to it |

Shared traits of the in-scope personas (from [PRODUCT.md](../PRODUCT.md) §Users): keyboard-first, fluent in dense tables and filters, multi-tenant (they hold many clients at once), skeptical of decoration, and time-pressured. They distrust dashboards that show a green donut and stop. Every persona section below grounds frustrations in the [failure catalog](research/00-failure-catalog-digest.md).

---

## 2. Personas

### 2a. Maya — MSP backup tech / NOC analyst  *(PRIMARY)*

> *"A backup failed (or fourteen did). Tell me which ones actually matter, why, and let me fix them — once or forever — without leaving this screen or opening a vendor ticket."*

**Context.** Mid-level technician on a 6-person NOC at a 40-client MSP. Owns backup & DR across the whole Datto/Kaseya portfolio: a few hundred BCDR-protected agents on SIRIS/ALTO appliances, ~900 Datto Endpoint Backup endpoints (mixed v1 and v2 mid-migration), Datto Cloud DR for tier-1 clients, plus SaaS Protect and Spanning tenants for M365 / Google / Salesforce. She starts the day in front of an overnight alert backlog spanning multiple clients and multiple products, surfaced from the Partner Portal, RMM, UniView, and email. She is paid to keep "last good backup" recent and DR provable.

**Expertise.** High on the data-protection domain: she knows a `0x7B` screenshot boot failure is a storage-controller driver problem, not data loss; that a "VSS failed to prepare snapshots" error usually means a writer in a bad state or a competing backup product; that a full ZFS pool blocks new agents; that an M365 Exchange backup stopping en masse smells like an OAuth/consent expiry, not a Microsoft outage. Medium on the *fix mechanics* — she can do most of these by hand but it's slow and she repeats the same fix across assets. Keyboard-driven; lives in tables, filters, and a command palette.

**Goals (what "a good day" is).**
- Clear the real failures fast; suppress the cosmetic noise without losing the audit trail.
- Resolve the median failure *inside* the tool, by herself, with **no vendor ticket** (a major post-Kaseya pain point — see digest, every product).
- Never do the same manual fix twice — turn a repeated fix into a saved playbook or an always-on auto-remediation.
- Keep tier-1 clients' RPO/RTO met and have evidence she did.

**Frustrations (grounded in research).**
- **Alarm fatigue / noise.** Everything is colored red. A cosmetic screenshot timeout (`Getting Devices Ready`, sysprep timing — *very common, severity low* in the BCDR catalog) reads the same as a real "no backup in 24h." She wastes the first hour separating signal from noise. Spanning's *"multiple errors on backups that never stop"* and SaaS Protect's *"opaque, generic backup error reporting requiring manual report-running and event-log digging"* are the same wound in different products.
- **No "why."** The native consoles tell her *that* something failed, rarely *why*. She manually correlates: did an agent auto-upgrade overnight (forcing diff-merges)? did a Windows update leave a driver pending reboot? did the offsite link saturate?
- **Manual, repetitive fixes.** Restart a wedged agent, re-run a screenshot, force retention on a full pool, re-pair an agent after a 401, re-authorize an expired M365 OAuth grant, re-seed a Spanning Salesforce connection — *self-serviceable but a human-in-the-loop button click today* ([PRODUCT.md](../PRODUCT.md) §Purpose). She does these one asset at a time across portals.
- **Portal sprawl.** BCDR in the Partner Portal, v2 in UniView, RMM for agent actions, separate SaaS Protect and Spanning consoles. The v1→v2 migration makes this worse (*"dual portals and v1 retention sunset"*).
- **Support is slow and expensive.** Post-Kaseya, escalations are harder and slower; she's pushed to self-serve but the tools don't make self-serve easy.

**Day in the life.**
1. 08:00 — Opens to ~60 overnight alerts across 11 clients. Needs the **10-second answer**: which are real data-loss risks vs cosmetic.
2. Triages the storm: groups the 14 SQL failures that all trace to one agent regression into a single incident; snoozes (with reason) the cosmetic screenshot warnings.
3. Drills the worst incident → asset detail → reads *why it's red* and *what changed* → runs a dry-run of the suggested fix → applies once, watches it go green.
4. Realizes the same regression hit a second client → applies the same fix to all matching → **saves it as a playbook** so it's one click next time.
5. Hits an irreversible/high-blast-radius action (force retention that deletes recovery points) → routes it through an **approval gate** to Dev.
6. End of day: the queue is signal, not noise; two new playbooks exist; zero vendor tickets opened.

**What the product owes Maya.** Triage-first home (not a dashboard); explainable status; "what changed" correlation; inline suggested-fix cards with dry-run; single → chain → scope → save-as-playbook; bulk action on a cohort; command palette; audit trail so snoozing/suppressing is safe.

---

### 2b. Dev — Service manager / team lead  *(SECONDARY)*

> *"Is the fleet healthy, are we meeting RPO/SLA per client, what keeps breaking, who on my team is drowning — and can I trust the automations my techs are turning on?"*

**Context.** Runs the backup/DR service line. Doesn't live in the queue day-to-day but is accountable for SLA posture, recurring-failure trends, capacity (which appliances/pools are filling), and client-facing reporting. He is the **approver** for high-blast-radius and irreversible actions, and the **governor** of the playbook library (what's published, what's allowed to auto-run, who can run what). Reports up to leadership and out to clients in QBRs.

**Expertise.** High on service operations, SLAs, and the commercial relationship (he tracks the post-Kaseya *"contract renewal dates / price changes"* and *"ticket SLA / aging"* the catalog calls out). Medium-high technical: he understands the failure classes without doing the hands-on fixes.

**Goals.**
- See fleet health rolled up to the **worst real child state** (severity-driven, not averaged) and per-client SLA/RPO/RTO posture at a glance.
- Spot **recurring failures** worth a permanent fix (a saved playbook or always-on auto-remediation) before they become a client-facing miss.
- Keep blast radius safe: gate the dangerous, audit everything, avoid approval fatigue by only being asked when it matters.
- Produce **client-ready DR-readiness / SLA evidence** without assembling it by hand.
- Know who on the team is overloaded (alert distribution, MTTR).

**Frustrations (grounded in research).**
- Native dashboards show a green donut and stop — no drill-down, no "why," no next action ([dashboard research](research/03-dashboard-ux-research.md) §anti-patterns).
- Recurring failures get re-fixed by hand forever because nothing captures "this is the third time this week."
- Approval requests arrive without context — he can't tell what will change or how to undo it, so he either rubber-stamps (approval fatigue) or blocks work.
- No clean export for QBRs; he screenshots consoles and hand-builds slides.
- Storage/capacity surprises: pools fill, billing/consumption overages appear with no forecast (v2 *"storage-pool/consumption billing surprises"*; BCDR *"forecast days-until-full"*).

**Day in the life.** Morning scan of fleet rollup + SLA/RPO compliance + "recency at risk." Reviews the recurring-failure trend; promotes one repeated manual fix to a published, scheduled auto-remediation. Clears the approval queue (each request carries affected assets/clients, the diff, evidence, and a rollback plan — he approves/denies/escalates with confidence). Friday: exports a per-client DR-readiness report for a QBR. Quarterly: reviews the audit trail with a client.

**What the product owes Dev.** A lean health-aware overview (rollups as context, not the home); per-client SLA/RPO/RTO posture; recurring-failure analytics that suggest "save as playbook"; rich, context-first approval cards (affected scope + diff + evidence + rollback) with timeout/escalation; playbook governance (publish/version/who-can-run/auto-arm); immutable, filterable, exportable audit trail; capacity/recency/forecast widgets.

---

### 2c. Sam — Junior / onboarding tech  *(SECONDARY)*

> *"Tell me what's wrong in plain language, show me the safe fix, let me preview it before I touch anything, and stop me from doing something I can't undo."*

**Context.** New to the NOC (or new to the Datto stack). Picks up lower-severity queue items and shadows Maya. Knows general IT but not yet the Datto idioms (Inverse Chain, diff-merge, ShadowSnap/VSS, screenshot verification semantics, off-site sync, OAuth/consent per tenant, Salesforce sandbox seeding). Onboarding is the secondary use case [PRODUCT.md](../PRODUCT.md) names explicitly: *"need guided runbooks that teach the fix."*

**Expertise.** Low-to-medium on the domain; high on willingness to follow a runbook. Needs the tool to encode senior judgement (which fix, how risky, what it changes) so he doesn't have to have it yet.

**Goals.**
- Understand *what each failure means* and *why it's red* without asking a senior every time.
- Apply the **right** fix safely — dry-run / single-asset preview before any fleet apply.
- Learn the stack by doing, with the tool teaching as he goes (the runbook *is* the training).
- Not cause a blast-radius incident; have guardrails that route risky actions to approval automatically.

**Frustrations (grounded in research).**
- Generic error strings mean nothing to him (Spanning/SaaS Protect opaque errors; BCDR `Code 9999`; SaaS Protect `AADSTS`/`ErrorAccessDenied`/`OneDriveNotProvisioned`). He needs them **decoded into a remediation card**.
- Fear of irreversible actions (force retention, mass unseat, disable duplicate rules in Salesforce) — he can't tell which actions are safe.
- The cosmetic-vs-real distinction that Maya makes instinctively is invisible to him; he over-escalates or over-reacts.

**Day in the life.** Picks a P3 incident. The asset detail explains the failure in plain language with the actual error decoded. A suggested-fix card names the fix, what it changes, blast radius, and confidence. He runs a **dry-run** (provably side-effect-free), sees the would-change diff, applies to the single asset, watches it verify green. When he tries a high-blast-radius scope, the system **auto-attaches an approval gate** and routes it to Dev — he can't fire it unsupervised. Over weeks, the runbooks teach him the stack.

**What the product owes Sam.** Plain-language failure explanations + decoded error codes; suggested-fix cards with confidence and blast radius; dry-run as the default; single-asset preview before fleet apply; risk-tiered guardrails (auto-gate the dangerous); ability to *run* playbooks without *authoring* them; non-punishing empty/learning states.

---

### 2d. Riley — MSP client / end customer  *(OUT OF SCOPE — viewer only)*

Riley never logs into Care Center. They are the *audience for an artifact the product produces*: a clean, branded **DR-readiness / SLA evidence report** (last-good-backup recency, RPO/RTO posture, last successful DR test, coverage gaps closed) that Dev exports for a QBR or compliance review (§4d). Designing for Riley means: the audit trail and reports must be **client-presentable** (no raw error spew, clear protected/recoverable framing) and exportable to PDF/CSV. No in-app persona, no login, no build surface beyond the export.

---

## 3. Jobs-to-be-Done

JTBD statements in the form *"When [situation], I want to [motivation], so I can [expected outcome]."* Each maps to product capability and downstream specs. **P** = persona (M=Maya, D=Dev, S=Sam).

### 3a. Triage & sense-making

| # | Job | P | Capability that serves it | Spec |
|---|---|---|---|---|
| J1 | When I open to an overnight alert storm, I want to know in seconds which failures are **real data-loss risk vs cosmetic noise**, so I can spend my time where it matters. | M, S | Severity-driven triage queue; cosmetic-vs-real classification; fleet rollup = worst *real* child state | [IA](04-information-architecture.md), [failure catalog](02-failure-catalog.md) |
| J2 | When dozens of alerts share one root cause, I want them **grouped into one incident** (explainably), so I face one problem, not a storm. | M, D | Rule-based grouping (same policy/cause/site/time-window) with visible "Grouping Now · N alerts" | [IA](04-information-architecture.md) |
| J3 | When a status is red, I want to see **why it's red** (which rule, which threshold, since when), so I trust the color. | M, S | Explainable status engine ("Why is this red?" banner) | [domain model](05-domain-model.md), [failure catalog](02-failure-catalog.md) |
| J4 | When an asset starts failing, I want to see **what changed** right before it (agent upgrade, policy edit, disk pressure, OAuth expiry), so I find the cause fast. | M, S | "What changed" correlation timeline on every asset/incident detail | [page specs](09-page-specs.md) |
| J5 | When an alert is cosmetic or expected, I want to **snooze/suppress it with a reason**, so the queue stays signal without losing the audit trail. | M | Snooze-with-reason + maintenance/expected-state suppression | [IA](04-information-architecture.md), [automation engine](07-troubleshooting-and-automation-engine.md) |

### 3b. Diagnose & remediate (the spine)

| # | Job | P | Capability that serves it | Spec |
|---|---|---|---|---|
| J6 | When I've found the cause, I want the screen to **offer the fix inline** (named, with what it changes), so I don't go hunting. | M, S | Suggested-fix card at point of pain (every red → a green button) | [automation engine](07-troubleshooting-and-automation-engine.md) §10 |
| J7 | When I'm about to apply a fix with side effects, I want a **dry-run** that shows the exact would-change diff and is provably safe, so I can preview before I mutate. | M, S | Dry-run default; rendered payloads, evaluated detections, no mutation, test credentials | [automation engine](07-troubleshooting-and-automation-engine.md) §4 |
| J8 | When a fix needs several steps, I want to **chain actions** (with conditions/branching), so a multi-step remediation runs as one unit. | M | Action chains: If/Switch, AND/OR groups, for-each, stop, sub-playbooks | [automation engine](07-troubleshooting-and-automation-engine.md) §3, §11 |
| J9 | When a mutating fix goes wrong, I want **one-click rollback** that reverts exactly what changed and re-verifies, so a bad fix isn't a dead end. | M, D | Compensating actions + pre-change snapshot → Revert-this-run → re-run detection | [automation engine](07-troubleshooting-and-automation-engine.md) §9 |
| J10 | When a generic error code appears, I want it **decoded into a remediation**, so I don't event-log-dig. | M, S | Error-code → remediation mapping (`0x7B`, `9999`, `AADSTS`, `429/503`, `ErrorAccessDenied`…) | [failure catalog](02-failure-catalog.md), [content strategy](12-content-strategy.md) |

### 3c. Scope, save & automate (fix once, then fix forever)

| # | Job | P | Capability that serves it | Spec |
|---|---|---|---|---|
| J11 | When the same failure spans many assets/clients, I want to **scope a fix** (this asset once / these / all matching now / all matching always), so I fix the cohort, not one row at a time. | M | Four-level scope picker; affected-count preview before apply; per-tenant scope tags | [automation engine](07-troubleshooting-and-automation-engine.md) §5 |
| J12 | When I've fixed something I'll see again, I want to **save it as a reusable playbook** (versioned, callable), so I never do it by hand twice. | M, D | Save action / Save as playbook / Promote to template; drafts vs published | [automation engine](07-troubleshooting-and-automation-engine.md) §7 |
| J13 | When a failure is mechanical and recurring, I want to **arm an always-on auto-remediation** (detect → fix, going forward, for newly-onboarded assets too), so it self-heals. | M, D | "Apply always" = dynamic group + recurring detection; quiet unless state changes | [automation engine](07-troubleshooting-and-automation-engine.md) §5 |
| J14 | When an action is irreversible or high-blast-radius, I want it **gated behind approval** with full context, so dangerous fixes get a human check without slowing safe ones. | M, D | Risk-tiered approval gate (auto-required for always/high-blast); context-rich card; timeout+escalation | [automation engine](07-troubleshooting-and-automation-engine.md) §6 |

### 3d. Govern, prove & report

| # | Job | P | Capability that serves it | Spec |
|---|---|---|---|---|
| J15 | When I approve an action, I want **all context on one screen** (affected scope, diff, evidence, confidence, rollback plan), so I decide well and fast. | D | Context-assembled approval card | [automation engine](07-troubleshooting-and-automation-engine.md) §6 |
| J16 | When I need to know what happened, I want an **immutable, filterable, exportable audit trail** (who/what/when/which tenant/outcome, per-step), so I can review, prove compliance, and feed a SIEM. | D | Run history + immutable audit trail; per-asset fan-out breakdown; CSV/PDF export | [automation engine](07-troubleshooting-and-automation-engine.md) §8 |
| J17 | When a client review is coming, I want to **prove DR readiness/SLA** per client without hand-assembly, so QBRs are evidence-based. | D | DR-readiness / SLA report from recency + RPO/RTO + last DR test + coverage | [page specs](09-page-specs.md), [content strategy](12-content-strategy.md) |
| J18 | When I'm accountable for the fleet, I want **health rolled up to the worst real state + recency-at-risk + recurring-failure trends**, so I manage proactively. | D | Lean overview: severity rollup, RPO/SLA toggle, recency-at-risk, recurring-failure analytics | [page specs](09-page-specs.md) |
| J19 | When I'm escalating to vendor support (when self-serve can't fix it), I want the **escalation package auto-assembled** (logs + versions + error + steps tried), so the ticket is fast and complete. | M, D | Auto-assemble escalation package; track ticket SLA/aging | [failure catalog](02-failure-catalog.md) |

### 3e. Learn & onboard

| # | Job | P | Capability that serves it | Spec |
|---|---|---|---|---|
| J20 | When I'm new to the stack, I want the **runbook to teach me the fix** as I apply it, so I get competent by doing. | S | Plain-language explanations + guided runbooks + dry-run + guardrails | [content strategy](12-content-strategy.md) |
| J21 | When I'm unsure if an action is safe, I want the **risk made explicit and the dangerous auto-gated**, so I can't cause a blast-radius incident. | S | Risk tiers; auto-attached approval gates; single-asset preview before fleet | [automation engine](07-troubleshooting-and-automation-engine.md) §6 |

> The spine — **J6 → J7 → J8 → J11 → J12 → J13** (suggest → dry-run → chain → scope → save → automate) — *is* the product, per design principle 3 ("Fix once, then fix forever"). Every other job exists to feed assets into that spine or to govern its output.

---

## 4. Key user journeys

Step sequences the product must serve end-to-end. Cross-product where the storm is; the journeys are the acceptance test for the IA and the engine.

### 4a. Morning alert-storm triage  *(Maya — J1, J2, J3, J5)*

The flagship journey: a tech who was dreading a wall of red feels *in control within ten seconds* ([PRODUCT.md](../PRODUCT.md) §Brand Personality).

```
1. OPEN → Triage Queue (the home, not a dashboard). ~60 alerts / 11 clients overnight.
2. ROLLUP CONTEXT (one glance): fleet health = worst real child state;
   "X failing / Y at-risk recency / Z cosmetic" — severity-sorted
   (Failed > Warning > Offline > Syncing > Paused > Protected).
3. GROUPING collapses the storm: 14 SQL failures → ONE incident
   ("Grouping Now · 14 alerts · likely cause: agent 7.4.2 regression").
4. SEPARATE SIGNAL FROM NOISE:
   - Cosmetic screenshot timeouts (Getting Devices Ready / sysprep) → recognizably low-sev,
     desaturated, NOT critical-red → Snooze-with-reason (audit kept).
   - Real "no backup > 24h", "ZFS pool full", "Exchange OAuth expired (mass)" → top of queue.
5. PICK THE WORST → Investigate → (journey 4b).
6. RESULT: queue is signal; nothing real is hidden; every snooze is logged.
```

Addresses: alarm fatigue, opaque/never-stopping errors, cosmetic-vs-real conflation. Anti-pattern guarded: no all-red coloring; no green-donut-and-stop.

### 4b. Single asset failure → diagnose → remediate  *(Maya/Sam — J3, J4, J6, J7, J9, J10)*

```
1. ASSET DETAIL (one scrollable page — the troubleshooting surface).
2. "WHY IS THIS RED?" banner: rule violated + threshold + since-when
   (e.g. "Backup must complete < 24h · last good 3d 4h ago · 3 consecutive failures").
3. "WHAT CHANGED" correlated timeline:
   "Jun19 01:42 agent 7.4.1→7.4.2 ⚠ · 01:55 policy edited · 23:10 disk E: 96% ⚠
    → first failure 02:00, 18 min after the update."  (the ~80%-of-outages insight)
4. ERROR DECODED: raw code → plain meaning → likely cause
   (e.g. 0x7B → storage-controller driver; AADSTS → consent expiry).
5. SUGGESTED-FIX CARD inline: fix name · what it changes · blast radius · confidence
   · [Dry-run] [Apply once] [Apply always] [Save as playbook].
6. DRY-RUN (default for side-effecting): renders exact would-change diff,
   evaluates detections against real context, mutates NOTHING (test credentials).
7. APPLY ONCE → action runs → re-run detection → status flips Protected (green).
   (If it regresses: one-click REVERT-THIS-RUN → compensating action → re-verify.)
8. RESULT: red → green from inside the tool, no portal-hopping, no vendor ticket.
```

Addresses: no "why," manual correlation, opaque errors, fear of irreversible actions (dry-run + rollback). For Sam, steps 2–6 are also the teaching surface (J20).

### 4c. Recurring failure → save playbook → apply-always  *(Maya/Dev — J11, J12, J13, J14)*

```
1. RECOGNIZE recurrence: the same fix from 4b now needed across a cohort
   (Dev sees it in recurring-failure analytics; Maya sees "13 others failing on same cause").
2. SCOPE PICKER (affected-count preview first — "targets N assets across M clients"):
   ○ This asset (once)   ○ These specific assets (once)
   ○ All matching now (once, filter evaluated at run time)
   ● All matching, ALWAYS (dynamic group + recurring detection — covers future-onboarded assets)
3. SAVE AS PLAYBOOK: name it, version it, set scope defaults + gates;
   draft separate from published (change-control). Other playbooks may call it as a sub-playbook.
4. ARM "APPLY ALWAYS": detect → fix, going forward; quiet unless state changes;
   per-tenant scope tag keeps it inside one client's fleet.
5. AUTO-GATE: because scope = always (high blast radius), an approval gate is
   AUTO-ATTACHED → routes to Dev with full context (4d-style card) → Approve/Deny/Escalate.
6. RESULT: the fix is now one click (or zero, auto) forever; newly-onboarded
   endpoints inherit it; the same fix is never done by hand twice (principle 3).
```

Addresses: repetitive manual fixes, "third time this week" blindness, approval fatigue (gate only the dangerous), MSP multi-tenant isolation (scope tags). Risk-tiered: a safe single-asset reversible action skips the gate; an irreversible/all-matching one cannot.

### 4d. Prove DR readiness for a client review  *(Dev — J16, J17, J18, J19; Riley is the audience)*

```
1. SCOPE TO CLIENT: filter fleet to Riley Corp (saved view = named filter/URL state).
2. ASSEMBLE EVIDENCE (no hand-built slides):
   - Coverage: protected / total assets; unprotected gaps closed since last review.
   - Recency: last good backup per tier-1 asset; "recency at risk" count.
   - RPO/SLA/RTO posture (RPO↔SLA toggle) per workload vs target.
   - Last successful DR TEST / failover (Recovery Launchpad), with screenshot verification.
   - Remediation activity from the AUDIT TRAIL: incidents resolved, playbooks run,
     outcomes (e.g. "13✓ / 1✕"), all attributable.
3. EXPORT: client-presentable PDF/CSV — no raw error spew, protected/recoverable framing.
4. PRESENT to Riley at the QBR; trail available for compliance/SIEM.
5. RESULT: DR readiness is PROVABLE on demand, evidence-based, attributable.
```

Addresses: no clean QBR export, screenshot-and-hand-build toil, "prove we're recoverable" with evidence not assertion. Honors the out-of-scope boundary: Riley consumes an artifact, never a login.

---

## 5. Pain points → product response

Sourced from the [failure-catalog digest](research/00-failure-catalog-digest.md) (recurring across all six products) and the [PRODUCT.md](../PRODUCT.md) user narrative. Each pain maps to a concrete response and the spec that builds it.

| # | Pain point (from research) | Felt by | Product response | Spec / principle |
|---|---|---|---|---|
| P1 | **Alarm fatigue** — everything is red; cosmetic screenshot timeouts read like real data loss. | M, S | Cosmetic-vs-real classification; reserve red for real failures; desaturate paused/intentional/cosmetic; sort by real severity; snooze-with-reason. | [Failure catalog](02-failure-catalog.md); principle 1, 5 |
| P2 | **Opaque / never-stopping errors** — Spanning *"errors that never stop,"* SaaS Protect *"generic error reporting … manual report-running and event-log digging."* | M, S | Auto-classify errors by remediation type; collapse transient noise; one decoded card per actionable item. | [Content strategy](12-content-strategy.md); [failure catalog](02-failure-catalog.md) |
| P3 | **No "why"** — native consoles show failure without cause. | M, S | Explainable status ("Why is this red?") + "What changed" correlation timeline on every asset/incident. | J3, J4; [page specs](09-page-specs.md) |
| P4 | **Manual, repetitive fixes** — restart agent, re-run screenshot, force retention, re-pair, re-auth OAuth, re-seed Salesforce — self-serviceable but hand-clicked one asset at a time. | M | Discrete parameterized remediation **actions** → chain → scope → save → auto-remediate. The product spine. | [Automation engine](07-troubleshooting-and-automation-engine.md); principle 3 |
| P5 | **Same fix done twice (or 50×)** — no capture of recurrence. | M, D | Save-as-playbook; recurring-failure analytics; "apply always" auto-remediation via dynamic group. | J12, J13; [automation engine](07-troubleshooting-and-automation-engine.md) §5, §7 |
| P6 | **Fear of irreversible / blast-radius actions** — force retention deletes recovery points; mass unseat purges; disabling Salesforce duplicate rules. | M, S, D | Dry-run default; single-asset preview before fleet; risk-tiered auto-attached approval gates; compensating-action rollback. | J7, J9, J14, J21; [automation engine](07-troubleshooting-and-automation-engine.md) §4, §6, §9 |
| P6b | **Coded errors no junior can read** — `0x7B`, `9999`, `AADSTS`, `ErrorAccessDenied`, `429/503`, `OneDriveNotProvisioned`. | S, M | Error-code → remediation card mapping per product. | J10; [failure catalog](02-failure-catalog.md) |
| P7 | **Portal sprawl** — BCDR (Partner Portal), v2 (UniView), RMM, SaaS Protect, Spanning; worsened by v1→v2 dual-portal migration. | M, S | One console, one button vocabulary, one table model, one status badge across all six products. | [IA](04-information-architecture.md); principle 5 (earned familiarity) |
| P8 | **Post-Kaseya support degradation** — slow/closed tickets, KB deflection, harder escalation; partners pushed to self-serve. | M, D | Maximize self-service (resolve median failure with no ticket); when escalation is needed, auto-assemble the package + track SLA/aging. | J19; [PRODUCT.md](../PRODUCT.md) success metric |
| P9 | **Pretty-but-useless dashboards** — green donut, no drill-down, no next action. | D, M | Troubleshooting-first: triage queue is home; every aggregate number is a link; no dead-end red. | Principle 1, 2; [dashboard research](research/03-dashboard-ux-research.md) |
| P10 | **Silent recency failures** — last night "succeeded" but last *good* backup was days ago; schedule disabled vs failing. | M, D | Recency as a first-class signal separate from pass/fail; "recency at risk" widget; last-good-backup columns. | J18; [page specs](09-page-specs.md) |
| P11 | **Capacity / consumption surprises** — ZFS pool fills and blocks new agents; v2 storage-pool billing overages with no forecast. | D, M | Storage rollup, top-consumers, days-until-full forecast, retention suggestions, overage projection. | [Feature specs](08-feature-specs.md) |
| P12 | **Approval requests without context** → rubber-stamp or block (approval fatigue). | D | Context-assembled approval card (scope + diff + evidence + confidence + rollback) with timeout/escalation; gate only the risky. | J15; [automation engine](07-troubleshooting-and-automation-engine.md) §6 |
| P13 | **No client-presentable evidence** — QBRs built by screenshotting consoles. | D | DR-readiness/SLA report + exportable immutable audit trail with protected/recoverable framing. | J16, J17; journey 4d |
| P14 | **Multi-tenant blur** — actions must stay inside one client's fleet. | M, D | Per-tenant scope tags on every action/playbook/auto-remediation; affected-count shows "N assets across M clients." | [Automation engine](07-troubleshooting-and-automation-engine.md) §5 |

---

## 6. Non-goals & boundaries (persona-derived)

- **Not a client/end-customer portal.** Riley is a viewer of exported artifacts only (§2d). No customer login, no customer-facing app surface.
- **Not a vanity dashboard.** The overview is a lean, severity-driven roll-up that exists to feed triage — never a screen to camp on (principle 1; anti-references in [PRODUCT.md](../PRODUCT.md)).
- **Not a general RMM/PSA.** Care Center is the backup/DR troubleshooting-and-automation surface; it links to RMM/PSA for adjacent actions (remote-in, ticketing) but doesn't reimplement them.
- **Front-end mock only.** All journeys run against realistic seeded mock data; actions/dry-runs/approvals/audit are fully expressed in the UI with no live backend ([PRODUCT.md](../PRODUCT.md) §Product Purpose). See [data model](06-data-model-and-mock-data.md).

---

## 7. Open decisions flagged

- **Persona naming.** Maya/Dev/Sam/Riley are working names for this doc set; confirm whether downstream specs and mock data should use these names or stay role-generic. (Recommendation: keep names — they make journeys and mock data readable.)
- **Sam's authoring ceiling.** This doc scopes juniors to *running* (not *authoring*) playbooks, gated by approvals. If RBAC granularity (who can author/publish/auto-arm) is richer, the [automation engine](07-troubleshooting-and-automation-engine.md) and [IA](04-information-architecture.md) should define the exact permission tiers — flagged for those docs to resolve.
- **Riley export depth.** The DR-readiness report's exact contents/branding live in [page specs](09-page-specs.md) and [content strategy](12-content-strategy.md); §4d defines intent, not final layout.
