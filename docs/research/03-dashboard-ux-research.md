# Health & Troubleshooting Dashboard UX — Research

I have more than enough material across all the requested tools and patterns. Let me synthesize the final implementation-oriented report.

---

# Health-Aware, Troubleshooting-First Center: UX Patterns & Recommended Layouts

Research synthesis across Datto BCDR/RMM, Veeam Service Provider Console / Veeam ONE, Acronis Cyber Protect Cloud, NinjaOne, Datadog Watchdog, Grafana, PagerDuty, and modern SRE alert-triage practice. The throughline: **the best tools never leave a red status as a dead end — every red is a one-click path to context, cause, and a remediating action.**

---

## 1. What the leading tools actually do (extracted patterns)

### Fleet health rollups
- **NinjaOne** uses a **4-tier health model**: Healthy (green) / Needs Attention (yellow) / Unhealthy/Offline (red) / Unknown (gray). Status is **computed from device events** (e.g., "Active Threats" → Unhealthy, "Needs reboot" → Needs Attention, "failed backup" mappable), with **precedence rules** ("Under Active Maintenance" suppresses other statuses so maintenance windows don't generate false reds). Rollup is a **stacked bar of device counts per status**; hover reveals exact counts. Statuses and their event→tier mapping are **admin-customizable**.
- **Datto BCDR** rolls up backup health with **threshold-driven status** (defaults: 1 day last-local-backup, 2 days last-offsite-sync) applied **universally across the fleet**, plus a compact **"last 10 backup attempts" sparkline** (green dot / red X per attempt) — a glanceable per-asset reliability strip distinct from the single most-recent status.
- **Veeam SPC** rolls up by **product widget** (VBR, Agents, Cloud Connect, M365, AWS/Azure/GCP), each showing protected counts, with a **toggle between RPO view and SLA view** of the same data.
- **Acronis** uses a **customizable widget grid** (20+ widgets: pie/bar/table/list), updated in real time, as the overview surface.

> Takeaway: a small, fixed status vocabulary (4 tiers), event-driven computation with **precedence + maintenance suppression**, a **recency threshold per asset class**, and **both a "current status" and a "recent-attempts strip."**

### Status filtering & saved views
- **Grafana** is the canonical model: **template variables** (status, site, asset class, region) drive every panel; changing a variable re-scopes the whole dashboard. Best practice is **one master dashboard customized via URL parameters**, not cloned copies — i.e., **saved views = named URL/filter states**, not duplicated dashboards. Meaningful color convention (blue/green good, red bad) tied to **thresholds**.
- **PagerDuty Operations Console** lets you **create customized views to triage** at-a-glance, optimized for MTTA/MTTR.
- **Datto RMM** exposes alert lists at **global / site / device scope** — the same list component re-scoped, which keeps the mental model constant as you drill.

> Takeaway: filters as first-class state, **shareable saved views as named filter+URL states**, the **same list component re-scoped** at fleet/site/asset levels.

### Drilling "X devices failing" → single asset timeline
- **Datto RMM**: click an alert widget → drill into filtered alert list → single alert → **device summary** ("touchscreen-friendly, single intuitive page, visual cues to the info you need most").
- **Grafana**: hierarchical drill via **data links / URL variables** carrying context down a level.
- Universal pattern: **aggregate number is itself the link**; clicking pre-filters the next level to exactly that failing cohort, and one more click lands on a **single asset's chronological timeline**.

### Incident/alert grouping & dedup
- **PagerDuty**: `dedup_key` for deduplication; **Intelligent Alert Grouping** (ML, learns from your team's response patterns and service topology over time) and **Time-Based Grouping** consolidate alert storms into one incident. The incident's **Alerts tab shows a "Grouping Now" label** and the count of grouped alerts — grouping is **visible and explainable**, not a black box.
- **Datadog Watchdog**: **Topological/Issue Correlation** groups alerts from dependent infra into a **consolidated case**; a **side panel shows related alerts + a dependency map** of affected services.
- **SRE practice** (incident.io): microservices produce cascading alerts from one root cause; **deduplicate into a single incident** so responders face one consolidated alert, not a storm.

### Root-cause surfacing & "what changed / why did this fail"
- **Datadog RCA**: works with traces to **identify causal relationships across services and pinpoint the originating service**.
- **The single highest-leverage pattern** (cross-industry): **"~80% of outages trace to a change."** Surfacing *"X deployed/changed N minutes before first alert"* collapses hours of investigation. Pull recent changes (deploys, config, policy, agent/version updates) onto the **incident timeline**, correlated by timestamp against the failure.
- **Datto RMM single-alert view** is the concrete drill model: **Title** (semantic `[Priority] [Category] Alert On [Device]`) → **Overview** (hostname, site, policy, monitor type) → **Action bar** → **Timeline card** (chronological events, green=success/red=fail) → **expandable diagnostic events** ("Show all events" / "Download events" JSON) → **Device Alerts card** showing all open alerts on that device with the current one highlighted ("some alerts are part of a wider issue").

### SLA / RPO / RTO indicators
- **Veeam SPC**: **RPO & SLA dashboard** with **configurable thresholds** (defaults 1-day RPO, 90% SLA), a **30-day default window**, and a **per-widget RPO↔SLA toggle**. Compliance is framed as: *is each workload meeting its RPO/SLA target?*
- **Datto BCDR** tracks **last local backup, last offsite sync, last screenshot** (verification recency) as distinct recency SLAs.

### Last-good-backup recency
- **Datto**: explicit **"Last Local Backup," "Last Offsite Sync," "Last Screenshot"** columns + the 10-attempt strip. Compare last-backup-time against schedule to detect *silent schedule failures* (schedule disabled vs. failing).
- **Backup run-history pattern** (Veeam/Veritas/general): per-item **latest backup date/time + status + assigned policy**; detail panel shows **full history log**; **Retry** and **Accept** actions appear **contextually** only when a backup completed with errors (Accept = acknowledge failure and let deltas proceed; Retry = re-run). Default auto-retry (e.g., 3x/session).

### Turning a red status into a guided next action
- **Datto RMM**: prominent contextual action bar — **Web Remote, Agent Browser, Resolve, Create Ticket, Quick Job** — right on the alert, "reducing navigation friction between problem identification and remediation."
- **NinjaOne**: alert → **automated remediation workflow** (restart service, run script, create ticket); philosophy: **"alert only on actionable information — if there's no response associated with a monitor, don't monitor it."**
- **incident.io alert-to-action workflow**: alert fires → auto-create incident channel → page on-call into it → **auto-surface owners, runbooks, recent deploys, dashboards** → slash-commands for role/severity → AI suggests root cause + next steps → auto-draft postmortem. Goal: **collapse 15-min coordination to 2 min.**

---

## 2. Design principles for our center (the "house rules")

1. **Every aggregate number is a link.** "12 devices failing backup" navigates to those exact 12, pre-filtered. No re-querying.
2. **Same list component, re-scoped at every level** (fleet → site/group → asset). Constant mental model from rollup to detail.
3. **A fixed 4-tier status vocabulary** everywhere: Healthy / Needs Attention / Failing / Unknown (+ a suppressed Maintenance state). Color is reserved for status only.
4. **Status is computed + explainable.** Every red shows *why it's red* (which rule, which threshold, since when) — never an unexplained color.
5. **Recency is a first-class signal**, separate from pass/fail: "last good backup 4 days ago" is a status even if last night technically "succeeded."
6. **Troubleshooting-first ordering.** The primary surface is the **triage queue** (what needs me now), with health rollups as context — not a vanity dashboard you stare at.
7. **Maintenance/expected-state suppression** so planned work never floods the queue (NinjaOne precedence model).
8. **The "what changed" panel is mandatory** on every asset/incident detail — change events correlated against the failure on one timeline.
9. **Group by default, drill on demand.** One incident per root cause; the storm is collapsed but **expandable and explained** ("Grouping Now: 14 alerts").
10. **No dead-end reds.** Every failing item carries at least one **contextual action** (Retry, Run playbook, Remote in, Create ticket, Snooze-with-reason).

---

## 3. Recommended layouts

### A. Overview / Command Center (health-aware, but lean)

Purpose: 10-second answer to "is the fleet OK, and what needs me?" Deliberately small so it never becomes a dashboard you camp on.

```
┌───────────────────────────────────────────────────────────────────────┐
│  Fleet Health        [Site ▾] [Asset class ▾] [Saved view: "MSP-East" ▾]│
│                                                                         │
│  ┌── Backup health rollup ──┐  ┌── Protection coverage ──┐             │
│  │ ███ Healthy        842   │  │ Protected      / Total   │             │
│  │ ▓▓  Needs Attn      37   │  │ ●●●●●●●●○○  91% covered   │             │
│  │ ▓   Failing         19 ◄─┼──┤ 24 unprotected assets ►  │             │
│  │ ░   Unknown          6   │  │ (click → list)           │             │
│  └──────────────────────────┘  └──────────────────────────┘             │
│   (each segment is a link → filtered asset list)                        │
│                                                                         │
│  ┌── SLA / RPO compliance ────┐  ┌── Recency at risk ─────────────┐     │
│  │ RPO met   96%   [RPO|SLA]  │  │ 11 assets: last good > 24h ►   │     │
│  │ RTO ready 88%   toggle     │  │  3 assets: no good backup 7d ► │     │
│  └────────────────────────────┘  └────────────────────────────────┘     │
│                                                                         │
│  ┌── Active incidents (triage preview) ───────────────────────────┐     │
│  │ ● P1  Backup failing — 14 assets, SQL-cluster  (grouped) 22m ► │     │
│  │ ● P2  Offsite sync stalled — Site Denver        47m ►          │     │
│  │ ● P3  Agent outdated — 9 assets                  3h ►          │     │
│  └─────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

Notes:
- Borrow **Veeam's RPO↔SLA toggle** on the compliance card.
- **"Recency at risk"** is the Datto last-good-backup pattern promoted to the overview — catches silent failures that a pass/fail status misses.
- Saved view selector = **named filter+URL state** (Grafana model), shareable.
- Coverage card surfaces **unprotected assets** (the gap most backup dashboards hide).

### B. Fleet / Asset list (the re-scoped workhorse)

Purpose: the triage table; same component whether scoped to all-fleet, a site, or a policy group.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Assets   [Status: Failing ✕][Site: Denver ✕]  + Add filter   [Save view] [⋮]   │
│ Showing 19 of 904        Bulk: [Retry backup] [Run playbook ▾] [Create ticket] │
├────────┬─────────┬──────────┬───────────────┬────────────┬──────────┬──────────┤
│ Status │ Asset   │ Site     │ Last good     │ Last 10 ●  │ RPO/SLA  │ Action   │
├────────┼─────────┼──────────┼───────────────┼────────────┼──────────┼──────────┤
│ ● Fail │ SQL-01  │ Denver   │ 3d ago ⚠      │ ●●●✕✕✕✕●●● │ RPO miss │ [Retry]▾ │
│ ● Fail │ FILE-02 │ Denver   │ 26h ago       │ ●●●●●●●●✕✕ │ at risk  │ [Retry]▾ │
│ ▓ Attn │ APP-07  │ Denver   │ 8h ago        │ ●●●●●●●●●● │ OK       │ [View] ▾ │
└────────┴─────────┴──────────┴───────────────┴────────────┴──────────┴──────────┘
```

Notes:
- Columns mirror **Datto** (Last good, last-10 strip) + **Veeam** (RPO/SLA) + **NinjaOne** status tier.
- **Active filter chips** are removable; the set of chips *is* the saved view definition.
- **Bulk actions** on a selected cohort (the "X failing" cohort you arrived with) — operate on the group, not one-by-one.
- Inline per-row **contextual action** (Retry only shows when last run errored — the Veeam Retry/Accept pattern).

### C. Asset detail + backup timeline (single source of truth per asset)

Purpose: everything about one asset on one scrollable page (Datto "single intuitive page" principle). This is where troubleshooting happens.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ● FAILING  SQL-01   Denver · Win Server 2022 · Policy: Tier-1-Hourly           │
│ [Remote in] [Run playbook ▾] [Retry backup] [Create ticket] [Snooze ▾] [⋮]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ WHY IS THIS RED?                                                               │
│  Rule "Backup must complete < 24h" violated · last good 3d 4h ago             │
│  3 consecutive failures since Jun 19 02:00 · RPO target 1h — currently MISSED  │
├──────────────────────────────────────────────────────────────────────────────┤
│ WHAT CHANGED  (correlated)                          │ KEY FACTS               │
│  Jun 19 01:42  Agent updated 7.4.1 → 7.4.2  ⚠       │ Last good:  Jun 18 22:00│
│  Jun 19 01:55  Backup policy edited (excl. added)   │ Last offsite: Jun 18    │
│  Jun 18 23:10  Disk volume E: 96% full  ⚠           │ Last verify: Jun 18 ✓   │
│  → first failure Jun 19 02:00 (18 min after update) │ RPO/RTO: 1h / 4h        │
├──────────────────────────────────────────────────────────────────────────────┤
│ BACKUP TIMELINE                                                                │
│  Jun22 ✕  Jun21 ✕  Jun20 ✕  Jun19 ✕  Jun18 ●  Jun17 ●  Jun16 ●  Jun15 ●       │
│  └─ click a run → job log, error code, duration, size, [Retry] [Accept]        │
│                                                                                │
│  Restore points (last good): Jun18 22:00 ✓  ·  Jun17 22:00 ✓   [Restore ▾]    │
├──────────────────────────────────────────────────────────────────────────────┤
│ OPEN ALERTS ON THIS ASSET (2)  — current highlighted                          │
│ RELATED ASSETS — 13 others failing on same policy/cause  [View cohort ►]       │
└──────────────────────────────────────────────────────────────────────────────┘
```

Notes:
- **"Why is this red?"** banner = explainable status (the rule, the threshold, since-when). This is the single most differentiating element.
- **"What changed"** = the deploy/change-correlation pattern (agent version, policy edit, disk pressure) timestamped against first failure — the ~80%-of-outages insight made concrete for backup/DR.
- **Backup timeline** = Datto's attempt strip expanded to clickable runs; each run → log + **Retry/Accept** (Veeam) + **Restore from point**.
- **Last-good restore points** explicit and actionable (RTO readiness).
- **Related assets** links back out to the cohort — recognizing the failure is rarely isolated (Datto's "part of a wider issue").

### D. Incident / Triage queue (the primary, troubleshooting-first surface)

Purpose: "what needs me now," grouped and prioritized. This — not the overview — is the app's home.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Triage Queue   [Mine][Unassigned][All]  [Sev ▾][Site ▾]  Sort: Priority ▾     │
├──────────────────────────────────────────────────────────────────────────────┤
│ ● P1  Backup failing — SQL Tier-1 policy            14 assets   22m   ● Open   │
│       Grouping Now · 14 alerts · likely cause: agent 7.4.2 regression          │
│       [Investigate ►] [Run playbook: Rollback agent ▾] [Ack] [Assign ▾]        │
│ ─────────────────────────────────────────────────────────────────────────────│
│ ● P2  Offsite sync stalled — Site Denver             6 assets   47m   ● Open   │
│       Grouping Now · 6 alerts · likely cause: WAN link saturation              │
│       [Investigate ►] [Run playbook ▾] [Ack] [Assign ▾]                        │
│ ─────────────────────────────────────────────────────────────────────────────│
│ ▓ P3  Agent outdated                                 9 assets    3h   Snoozed  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Incident detail (on Investigate): mirror **PagerDuty + Datadog side-panel** — left = grouped alerts (expandable, "why grouped"), center = **shared "what changed" timeline + dependency/cohort map**, right = **suggested next actions / runbooks**.

Notes:
- **One incident per root cause** (PagerDuty Intelligent Grouping); **"Grouping Now · N alerts" is visible and explainable** — never silent.
- **Likely-cause line** = Datadog RCA / AI-correlation surfaced inline.
- Each incident carries a **contextual playbook** ("Rollback agent"), not just Ack/Assign.
- Severity tiers per SRE practice: **P0/P1 page, P2 ticket, P3 log**. Only **actionable** conditions become incidents (NinjaOne: don't alert on the non-actionable).
- **Snooze requires a reason** and auto-suppresses (maintenance/expected-state model) so the queue stays signal.

### E. Automation / Playbook library

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Playbooks   [Search] [Category ▾]  + New playbook                              │
├────────────────────────┬──────────┬──────────────┬───────────────┬────────────┤
│ Name                   │ Trigger  │ Last run      │ Success rate  │ Action     │
├────────────────────────┼──────────┼──────────────┼───────────────┼────────────┤
│ Rollback agent version │ Manual/  │ 2h ago ✓      │ 94% (47 runs) │ [Run ▾]    │
│                        │ on-alert │               │               │            │
│ Retry failed backup    │ Auto     │ 12m ago ✓     │ 88%           │ [Run ▾]    │
│ Clear disk + retry     │ Manual   │ 1d ago ✕      │ 71%           │ [Run ▾]    │
│ Re-register offsite    │ Manual   │ 3d ago ✓      │ 99%           │ [Run ▾]    │
└────────────────────────┴──────────┴──────────────┴───────────────┴────────────┘
```

Notes:
- Each playbook shows **trigger mode** (manual / on-alert / scheduled), **last run + outcome**, **success rate over N runs** — so operators trust before they run (audit-trail principle).
- Playbooks are **invokable from the contextual surfaces** (asset action bar, incident, bulk fleet action) — the library is the catalog; invocation happens in-context.
- Best-practice framing: pre-checks → action → verify health → **capture evidence automatically**.

### F. Run history / Audit log

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Run History   [Playbook ▾][Asset ▾][Outcome ▾][Date ▾]   Export                │
├──────────┬─────────────────────┬──────────┬─────────┬──────────┬──────────────┤
│ Time     │ Playbook            │ Asset(s) │ By      │ Outcome  │ Detail       │
├──────────┼─────────────────────┼──────────┼─────────┼──────────┼──────────────┤
│ 14:02    │ Rollback agent      │ 14 SQL   │ auto:P1 │ ✓ 13 / ✕1│ [Logs ►]     │
│ 13:40    │ Retry failed backup │ FILE-02  │ jdoe    │ ✓        │ [Logs ►]     │
│ 09:15    │ Clear disk + retry  │ APP-07   │ auto    │ ✕ failed │ [Logs ►] ⚠   │
└──────────┴─────────────────────┴──────────┴─────────┴──────────┴──────────────┘
```

Notes:
- **Immutable audit trail**: who/what/when/outcome, per-asset breakdown for fan-out runs (13✓/1✕), drill to **per-step logs**.
- Filterable by playbook/asset/outcome; **exportable** (compliance, postmortems).
- Failed runs flagged and **link back to the asset detail / incident** that triggered them — closing the loop.

---

## 4. Navigation model (how it all connects)

```
Overview ──(click any rollup segment / number)──► Fleet/Asset list (pre-filtered cohort)
   │                                                      │
   │                                                (click an asset)
   ▼                                                      ▼
Triage Queue ──(Investigate)──► Incident detail ──────► Asset detail + timeline
   │                                  │  (grouped alerts, what-changed, cohort)   │
   │                                  └──(Run playbook)──┐                        │
   └──────────────────────────────────────────► Playbook library ◄───(Run)───────┘
                                                         │
                                                         ▼
                                                   Run history / Audit
```

Three invariants make it feel coherent:
1. **Aggregate → cohort → asset is always one direction, one click per level**, carrying the filter context (Grafana URL-variable model).
2. **Actions are available at every level** in the same shape: row-level on the list, banner on the asset, per-incident in the queue, catalog in the library — same verbs (Retry / Run playbook / Remote in / Ticket / Snooze).
3. **Every red explains itself and offers an exit** — "why red," "what changed," "what to do next," in that order.

---

## 5. Build priority (highest leverage first)

1. **Status engine**: 4-tier vocabulary + event→tier mapping + **precedence/maintenance suppression** + **recency thresholds**. Everything else renders this.
2. **Re-scoped asset list + filter/saved-view state** (the workhorse component).
3. **Asset detail with backup timeline + "Why is this red?" + "What changed."** The differentiator.
4. **Triage queue with grouping/dedup** (start rule-based: same policy/cause/site/time-window; add ML later, but keep grouping **explainable** from day one).
5. **Contextual actions → playbook invocation → run history.** Close the loop from red to remediation to evidence.
6. Overview last — it's a curated read-only roll-up of (1)–(4), cheapest once the primitives exist.

---

## Sources

- [Datto Partner Portal: BCDR Status Page](https://continuity.datto.com/help/Content/kb/siris-alto-nas/KB115004131383.htm) · [BCDR Status (Device Details)](https://continuity.datto.com/help/Content/kb/siris-alto-nas/KB360001307746.html) · [Advanced backup verification](https://continuity.datto.com/help/Content/kb/siris-alto-nas/360024192891.html)
- [Datto RMM: Single Alert View](https://rmm.datto.com/help/de/Content/3NEWUI/Alerts/SingleAlertView.htm) · [Alerts](https://rmm.datto.com/help/en/Content/3NEWUI/Alerts/Alerts.htm) · [Device summary](https://rmm.datto.com/help/de/Content/3NEWUI/Devices/DeviceSummary.htm) · [Best practices for Monitoring policies](https://rmm.datto.com/help/en/Content/2SETUP/BestPractices/Best_Practices_Monitoring_Policies.htm)
- [Veeam Service Provider Console: RPO & SLA](https://helpcenter.veeam.com/docs/vac/provider_admin/protected_data_summary.html) · [Overview dashboard](https://helpcenter.veeam.com/docs/vac/provider_admin/overview.html) · [Alarms](https://helpcenter.veeam.com/docs/vac/provider_admin/appendix_alarms.html) · [Veeam VBR Job Retry](https://helpcenter.veeam.com/docs/backup/vsphere/job_retry.html)
- [Acronis Cyber Protect: Overview dashboard](https://www.acronis.com/en-us/support/documentation/AcronisCyberProtect_15/overview-dashboard.html) · [Alerts integration](https://developer.acronis.com/doc/cyberapps/versions/extensions/alerts/index.html)
- [NinjaOne: Customize Device Health Statuses](https://www.ninjaone.com/docs/endpoint-management/customize-device-health-statuses/) · [Dashboard Inventory Alerts](https://www.ninjaone.com/docs/endpoint-management/inventory-alerts/dashboard-inventory-alerts/) · [Endpoint Monitoring & Alerting Playbook](https://www.ninjaone.com/docs/new-to-ninjaone/getting-started/endpoint-monitoring-and-alerting-playbook/) · [Remote Monitoring & Alerting](https://www.ninjaone.com/endpoint-management/remote-monitoring-alerting/)
- [Datadog Watchdog](https://docs.datadoghq.com/watchdog/) · [Pattern-based Correlation](https://docs.datadoghq.com/events/correlation/patterns/) · [Watchdog enhanced visibility / RCA](https://www.datadoghq.com/blog/watchdog-enhanced-visibility/) · [DASH 2025 roundup (Issue/Topological Correlation)](https://www.datadoghq.com/blog/dash-2025-new-feature-roundup-observe/)
- [PagerDuty: Intelligent Alert Grouping](https://support.pagerduty.com/main/docs/intelligent-alert-grouping) · [Alerts](https://support.pagerduty.com/main/docs/alerts) · [Event Intelligence](https://www.pagerduty.com/platform/aiops/event-intelligence/) · [Runbook Automation](https://www.pagerduty.com/platform/automation/runbook/)
- [Grafana dashboard best practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/) · [Dynamic Grafana Dashboards: variables & interactivity](https://www.datavire.com/blog/build-dynamic-grafana-dashboards)
- [incident.io: SRE alerting best practices](https://incident.io/blog/sre-alerting-best-practices) · [Runbook automation tools 2026](https://incident.io/blog/runbook-automation-tools-2026-the-complete-guide)
- [Event correlation / "what changed" deploy correlation](https://www.netdata.cloud/academy/event-correlation/) · [Incident correlation guide](https://openobserve.ai/blog/incident-correlation/) · [BigPanda AIOps event correlation](https://www.bigpanda.io/blog/event-correlation/)
- [FireHydrant: Runbook Audit Logs](https://firehydrant.zendesk.com/hc/en-us/articles/6586704737812-Runbook-Audit-Logs) · [SolarWinds: Runbook automation best practices](https://www.solarwinds.com/sre-best-practices/runbook-automation)