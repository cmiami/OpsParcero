# Fix Engine 06 — "Fix with AI" Feature UX (the autonomous, purple path)

The screen-level specification for **Fix with AI**: the autonomous remediation surface where a real
tool-calling LLM agent **triages → plans → executes → verifies** a failure within scope and approval,
streaming its reasoning, tool calls, evidence, and verification into a live transcript. This is the
**purple** AI surface; it is the autonomous counterpart to the **blue, step-by-step Guided Fix**
([fix-engine 05 — Guided Fix UX](05-guided-fix-ux.md)).
Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md).

> **Reads with:** the fix-engine design contract (locked decisions, canonical interfaces, the agent
> loop state machine, the asset-class execution model), the product model
> ([00 — vision & scope §3 fix-classification, §7 vocabulary](../00-vision-and-scope.md)), the
> [03 — design system](../03-design-system.md) (**purple = AI only**, status never color-only), the
> [09 — page specs](../09-page-specs.md) (where the AI button lives), and the
> [10 — component inventory](../10-component-inventory.md) (organisms this composes). The agent loop,
> providers, tools, backends, and session types are defined in the sibling fix-engine docs:
> [01 — architecture](01-architecture.md), [02 — providers & models](02-providers-and-models.md),
> [03 — tools & backends](03-tools-and-backends.md), [04 — the agent loop & sessions](04-agent-loop-and-session.md).

---

## 0. How to read this doc

This is the **UX layer** for the AI feature. Where [04 — agent loop & sessions](04-agent-loop-and-session.md)
defines *what the engine does* (the `FixSession` state machine, `FixClient`, budgets, halt conditions),
this doc defines *what the human sees and does*: the entry points, the `AiFixConsole` organism and its
sub-components, the streaming transcript, the plan/dry-run preview, model selection, the bulk cohort
path, escalation, and how an AI fix lands in Run history / Audit.

Build the AI surface by:

1. Reading **§1 — when AI is offered** (fix-classification gates which path appears).
2. Composing the **`AiFixConsole`** organism (§3) from the components in §3.2; every one has a
   Storybook home and obeys all [CLAUDE.md](../../CLAUDE.md) mandates.
3. Driving it from a `FixSession` via the **`FixClient`** stream (§4) — live engine over SSE, or the
   offline `lib/fix-sim` deterministic path. The console never touches a provider directly.
4. Implementing every **session state** as a visible console state (§5) and the **escalation** path (§7).
5. Wiring the **purple AI tokens** (§9) and **a11y** (§10) — status is never color-only even here.

**Conventions.** Component names in `CamelCase` reference [10 — component inventory](../10-component-inventory.md)
and the new fix organisms under `src/components/organisms/fix/`. Type names
(`FixSession`, `FixState`, `FixPlan`, `ToolResult`, `ModelInfo`, …) are the **canonical interfaces**
from the contract — used verbatim, never redefined here. Token names (`--ai`, `--ai-tint`, `--primary`)
reference the [design system](../03-design-system.md). Never hardcode hex/px in console code.

---

## 1. Guided vs AI — what is offered, and when

Both features remediate the **same** failure catalog over the **same** tools and simulated backends.
They differ in **autonomy and locus of control**, and **fix-classification decides which is offered**
([00 §3](../00-vision-and-scope.md), [design system §7](../03-design-system.md)).

| Dimension | **Guided fix** (blue, `--fix-guided` / `--primary`) | **Fix with AI** (purple, `--ai`) |
|---|---|---|
| Control model | Human-in-the-loop, **step-by-step**. The harness runs the automatable **"We"** steps; the human performs the manual **"You"** steps. | **Autonomous.** The agent triages, decides the plan, and executes it itself; it pauses only at approval gates. |
| Who chooses the plan | A curated/known chain (a `Playbook` or suggested `RemediationAction`s) chosen by the catalog. | The **model** proposes a `FixPlan` from live evidence; the human approves it, not authors it. |
| Pace | One step at a time; the user clicks **Next** / completes a You-step before continuing. | Streams continuously; stops at gates and on halt conditions. |
| Best for | Cases that need human judgement or physical action (reboot a NAS, re-consent in a vendor portal, confirm data loss). | Cases that are fully automatable, or where triage is non-obvious and the agent should reason over evidence. |
| Surface | `GuidedFixPanel` (blue) | `AiFixConsole` (purple) |

### 1.1 Offer matrix by fix-classification

The buttons on an issue/asset are driven by the failure mode's `fixClassification` ([design system §7](../03-design-system.md)).
The **AI** path is offered whenever there is at least one automatable tool the agent could call; the
**Guided** path is offered whenever there is any human "You" step or a known chain to walk.

| Fix type | Primary button | AI offered? | Rationale |
|---|---|---|---|
| `full` — **End-to-end** (green, `zap`) | **Fix** (one-click) · **Fix with AI** (secondary) | **Yes** | Fully automatable. One-click runs the known chain; **Fix with AI** runs it autonomously *and* verifies + adapts if the symptom persists. The **bulk "End-to-end fix all"** cohort path (§6) is AI-driven. |
| `partial` — **Guided** (blue, `wand-2`) | **Guided fix** (primary) · **Fix with AI** (secondary) | **Yes, with caveat** | Default is step-by-step because a "You" step exists. AI is offered but the agent will **escalate the You-steps to the human** mid-run (it cannot perform manual actions); it autonomously handles the "We" steps. |
| `external` / `manual` — **Insights** (orange, `lightbulb`) | **View runbook** · **Ask AI** | AI **diagnoses only** | Not controllable by the engine (vendor-side / physical). The agent triages and **assembles a support package** (§7) but cannot apply a fix; it never claims a heal. |
| `unknown` — **Insights** (gray, `help-circle`) | **Ask AI** (diagnose) | AI **diagnoses only** | Symptom unclassified. The agent runs read/diagnostic tools to classify, then either upgrades the offer to a real fix or escalates. |

> **Anti-pattern guard.** The two buttons are never two solid same-weight CTAs competing for the eye.
> The primary is solid; the alternate is the secondary/ghost. **Fix with AI** uses the lavender AI
> button (`bg-ai-tint text-ai`, sparkle `sparkles` glyph) defined in [design system §9](../03-design-system.md) —
> purple appears **only** on this affordance and inside the console.

---

## 2. Entry points

`Fix with AI` / `Ask AI` is reachable from every place a failure is surfaced. All open the **same**
`AiFixConsole`; they differ only in the `mode` and the seed `scope` they pass to `FixClient.createSession`.

| Entry point | Page ref | Opens with | Default `scope` |
|---|---|---|---|
| Issue row AI button (sparkle) | [09 §3.1 Triage](../09-page-specs.md), issue list | `{ assetId, issueId, mode: "ai" }` | `once` (this asset) |
| Asset detail `RemediationPanel` rail → **Fix with AI** | [09 §7.4](../09-page-specs.md) | `{ assetId, issueId, mode: "ai" }` | `once` |
| Incident detail → **Fix cohort with AI** | [09 §4](../09-page-specs.md) | one session per cohort member, fanned (§6) | `all-matching` (the incident cohort) |
| Topbar **End-to-end fix all** | [09 §1, design system §9](../09-page-specs.md) | bulk AI run over the End-to-end-fixable cohort (§6) | `all-matching` |
| Guided panel → **Switch to AI** | [05 — Guided Fix UX](05-guided-fix-ux.md) | carries the same `assetId/issueId`, flips `mode` to `"ai"` | inherited |
| Command palette `⌘K` → "Fix … with AI" | [09 §17](../09-page-specs.md) | resolves to an asset/issue, `mode: "ai"` | `once` |

The console opens as a **right side-panel `Sheet`** (`z-index: side-panel = 50`, elevation `-4px 0 16px`,
no content push — [design system §6](../03-design-system.md)) for single-asset fixes, and as a wide
**`Sheet` / page surface** for the bulk cohort run (§6). It is **resumable**: closing the sheet does
not abort the session; a session in flight shows a persistent topbar pill ("AI fixing ACME-DC01 ▸")
that reopens the console.

---

## 3. The `AiFixConsole` organism

The console is the single home for an autonomous fix. It binds to **one `FixSession`** and renders its
`FixState` and `transcript` live. It is read-mostly (the agent acts; the human steers): the only
controls are **model selection**, **approve/reject** at gates, **abort**, and the **escalation** actions.

### 3.1 ASCII wireframe (single-asset, mid-run — `executing`)

```
┌─ AiFixConsole ───────────────────────────────────────────────  [ ⤢ ]  [ ✕ ] ┐  Sheet, purple header
│ ✦ Fix with AI · ACME-DC01                          ● Executing  step 2 of 3  │  --ai header + StatusBadge
│ bcdr.vss-writer-snapshot-failure · code BKP1410 (mono)        sess fix_7c1a  │  mono ids
├──────────────────────────────────────────────────────────────────────────────┤
│  MODEL                                          BUDGET                         │
│  ✦ Claude · claude-opus-4-… ▾   (session)       steps 2/6 · tools 3/12 · 41s   │  ModelPicker + BudgetMeter
│  └ per-task: triage→[local · gemma-…] plan→[hosted] ▾                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  PLAN  (confidence 86%)                                          [ View plan ▸]│  FixPlanCard (collapsed)
│  Reset VSS writers + retry backup, then verify chain is crash-consistent.      │
├──────────────────────────────────────────────────────────────────────────────┤
│  TRANSCRIPT (streaming)                                              ⟳ live    │  FixTranscriptView
│                                                                                │
│  ✦ model  · 04:12:03                                                           │  kind:"model"
│    The last 4 backups are crash-consistent. The Windows update at 02:14 lines  │
│    up with the first VSS failure. I'll inspect the VSS writers before acting.  │
│                                                                                │
│  ⚙ tool_call · get_vss_writers · agent-windows            [read]               │  ToolCallCard (read)
│    { "host": "ACME-DC01" }                                                      │
│  └ ✓ result · 0.4s                                                             │  tool_result, healed:—
│      VSS writer 'SqlServerWriter' = FAILED (retryable)  …show output ▾         │
│                                                                                │
│  ✦ model  · 04:12:09                                                           │
│    SqlServerWriter is in a failed-retryable state. Reset writers + retry.      │
│                                                                                │
│  ⚙ tool_call · reset_vss_writers · agent-windows     [safe-write] · preview ▾  │  ToolCallCard (safe-write)
│    DRY-RUN DIFF                                                                 │  StateDiff (before/after)
│      services.VSS        Running → (restart)                                    │
│      writers.SqlServer   FAILED  → STABLE                                       │
│  └ ✓ applied · 38s · exit 0   reversible                       show stdout ▾   │  ExecResult
│                                                                                │
│  ◆ verification · 04:12:51                                                     │  kind:"verification"
│    re-ran get_backup_chain → next backup application-consistent ✓              │
│                                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│  SCOPE  ● This asset   ○ Selected   ○ All matching (14)   ○ Always…            │  ApplyScopeControl (shared)
│  [ Abort ]                                                  [ Pause after step ]│  controls
└──────────────────────────────────────────────────────────────────────────────┘
```

When a gated step is reached, the transcript pins an **approval card** and the console enters
`awaiting-approval` (see §5.3). The dry-run diff for that step renders **before** Approve is enabled.

### 3.2 Sub-components (all under `src/components/organisms/fix/`)

| Component | Level · Source | Renders | Key props (canonical types) |
|---|---|---|---|
| **`AiFixConsole`** | Organism · `fix/ai-fix-console.tsx` | the whole panel; binds one session | `session: FixSession; client: FixClient; onClose: () => void` |
| **`FixTranscriptView`** | Organism · `fix/fix-transcript-view.tsx` | streamed `FixTranscriptTurn[]`; auto-scrolls, `aria-live` | `turns: FixTranscriptTurn[]; live: boolean; state: FixState` |
| **`FixTranscriptTurnItem`** | Molecule · `fix/fix-transcript-turn-item.tsx` | one turn, glyph by `kind` | `turn: FixTranscriptTurn` |
| **`ToolCallCard`** | Organism · `fix/tool-call-card.tsx` | a `tool_call` + its `tool_result`/`ExecResult`; risk badge; dry-run `StateDiff`; collapsible stdout/`ScriptArtifact` | `call: { name; input }; spec: ToolSpec; result?: ToolResult; preview?: ToolResult; dryRun: boolean` |
| **`FixPlanCard`** | Molecule · `fix/fix-plan-card.tsx` | a `FixPlan`: summary, rationale, `confidencePct`, step list with per-step risk/`actor`/gate | `plan: FixPlan; onApprovePlan?; onReject?` |
| **`ConfidenceMeter`** | Molecule · `fix/confidence-meter.tsx` | `confidencePct` as a labelled bar (text + bar, never color-only) | `pct: number; basis?: string` |
| **`ModelPicker`** | Molecule · `fix/model-picker.tsx` | per-session model + per-task overrides; provider/model grouped `Select` | `models: ModelInfo[]; session: { provider; model }; perTask?: TaskModelMap; onChange` |
| **`BudgetMeter`** | Molecule · `fix/budget-meter.tsx` | `FixBudget` consumption (steps / toolCalls / tokens / wall) | `used: Partial<FixBudget>; budget: FixBudget` |
| **`AiApprovalCard`** | Molecule · `fix/ai-approval-card.tsx` | a gated `FixPlanStep` with its dry-run diff + Approve/Reject | `step: FixPlanStep; preview: ToolResult; onDecision: (d: "approve"\|"reject") => void` |
| **`StateDiffView`** | Molecule · `fix/state-diff-view.tsx` | a `StateDiff` before→after table | `diff: StateDiff` |
| **`EscalationCard`** | Organism · `fix/escalation-card.tsx` | the escalated terminal state: what was tried + support package + hand-back actions | `session: FixSession; onHandToGuided; onOpenTicket; onAssemblePackage` |
| **`AiFixResultBanner`** | Molecule · `fix/ai-fix-result-banner.tsx` | terminal `succeeded`/`partial`/`failed` summary + links to Run/Audit | `result: FixSession["result"]; state: FixState` |
| **`BulkAiFixConsole`** | Organism · `fix/bulk-ai-fix-console.tsx` | cohort fan-out grid of mini-sessions (§6) | `sessions: FixSession[]; client: FixClient` |

> `ToolCallCard` is the workhorse. It maps one transcript `tool_call` (+ matching `tool_result`) into a
> card showing: the **tool name**, its **`risk`** badge (`read` / `safe-write` / `destructive` — text +
> icon, never color-only), the **`backend`** it ran on (`agent-windows`, `saas-api`, …), the JSON
> **input**, and the **outcome**. For `preview`/dry-run it shows the `StateDiff` with **no mutation**;
> for a real run it shows the `ExecResult` (exit, duration, collapsible stdout) and the real
> **`ScriptArtifact`** (PowerShell/bash/Python/HTTP) under a "show script" disclosure. `healed: true`
> from a `ToolResult` decorates the card with a success accent. See
> [03 — tools & backends](03-tools-and-backends.md).

### 3.3 The transcript turn vocabulary

`FixTranscriptView` renders each `FixTranscriptTurn` by `kind`, each with a distinct, labelled glyph
(lucide), real timestamp (`at: ISODateTime`, mono), and screen-reader text — **never glyph/color alone**:

| `kind` | Glyph | Surface | Meaning |
|---|---|---|---|
| `model` | `sparkles` (`--ai`) | AI-tinted text block | the agent's streamed reasoning (`text` deltas) |
| `tool_call` | `wrench` | `ToolCallCard` header | the agent invoked a tool (`toolCall.name`, `input`) |
| `tool_result` | `terminal` | `ToolCallCard` body | the tool's `ToolResult` (output, diff, healed) |
| `observation` | `eye` | inline note | the agent's read of a result before next action |
| `approval` | `shield-check` | `AiApprovalCard` | a gate was reached / a decision was recorded |
| `verification` | `circle-check` (`--success`) | inline `--success` note | a post-fix read/diagnostic confirming the symptom cleared |
| `status` | `info` | inline muted | a `FixState` transition / budget / halt note |

Model reasoning is the **only** place purple text is used at length; it is body-size, not decorative,
and never gradient (impeccable ban). Tool I/O and diffs use `MonoLabel`/mono surfaces, not purple.

---

## 4. Data flow — `FixClient`, streaming, controls

The console is a pure consumer of the canonical `FixClient`. It does not know whether it is talking to
the **live `fix-engine`** (SSE) or the **offline `lib/fix-sim`** generator — the contract guarantees one
interface ([01 — architecture](01-architecture.md), [04 — agent loop & sessions](04-agent-loop-and-session.md)).

```ts
// console mount → create + stream a session
const session = await client.createSession({
  assetId, issueId, mode: "ai",
  model: { provider: "anthropic", model: "claude-opus-4-…" },  // from ModelPicker
  scope: "once",                                                 // from ApplyScopeControl
});

for await (const ev of client.stream(session.id)) {
  // ev: FixSessionEvent — drives FixTranscriptView (append turn) +
  //     header StatusBadge (state change) + BudgetMeter (usage) + FixPlanCard (plan ready)
  reduce(ev);
}

// gate controls
await client.approve(session.id, stepId, "approve" | "reject");  // AiApprovalCard
await client.abort(session.id);                                   // Abort button
```

**Stream → UI mapping.** Each `FixSessionEvent` updates exactly one region so the console never
re-renders wholesale:

| Event (from the session stream) | Console effect |
|---|---|
| transcript turn (`model` / `tool_call` / `tool_result` / `observation` / `verification` / `status`) | `FixTranscriptView` appends a `FixTranscriptTurnItem`; auto-scroll if pinned to bottom |
| `state` change (`FixState`) | header `StatusBadge` + console state (§5); enables/disables controls |
| `plan` ready (`FixPlan`) | `FixPlanCard` populates; `ConfidenceMeter` shows `confidencePct` |
| `usage` / budget tick | `BudgetMeter` updates steps/tools/tokens/wall |
| gate reached (`awaiting-approval` + `FixPlanStep`) | `AiApprovalCard` pins; dry-run `preview` diff renders; Approve enabled |
| terminal (`succeeded`/`partial`/`failed`/`escalated`/`halted`) | `AiFixResultBanner` or `EscalationCard`; controls collapse to "Open run ↗" |

**Offline parity.** In a static export with no engine, `lib/fix-sim` replays a **deterministic, seeded**
session for the same `assetId`/failure mode (the Mock provider's scripted sequence) so the demo always
runs and always agrees with the seeded fleet. The console looks and behaves identically; a small
`Offline demo` chip distinguishes it ([01 — architecture](01-architecture.md)).

---

## 5. Console states (every `FixState` is a visible state)

The console renders **all** `FixState` values. None is a spinner-only screen (impeccable ban): each has
real content. The header `StatusBadge` carries the state as **dot + icon + label**.

### 5.1 `triaging`
Header `● Triaging`. The agent calls **read/diagnostic** tools first (`get_vss_writers`,
`get_backup_chain`, `get_oauth_grant`, `read_event_log`, …) — these render as `read`-risk `ToolCallCard`s
(no diff, no approval). The plan card shows a skeleton ("Forming a plan from evidence…"). No mutation
is possible in this state.

### 5.2 `planning`
The agent emits a `FixPlan`. `FixPlanCard` expands: `summary`, `rationale`, ordered `steps` (each with
`intent`, `toolName`, `risk`, `actor: "we"|"you"`, `requiresApproval`), and `ConfidenceMeter`
(`confidencePct`). The human can **Approve plan** (let it run), **Reject** (→ `halted`, offer Guided or
escalate), or **edit scope** before it proceeds. A `you`-step in the plan is flagged here ("1 step needs
you") so the human knows a hand-off is coming.

### 5.3 `awaiting-approval`
Reached at each gated step (`requiresApproval` — destructive or over-threshold per the contract). The
console pins an **`AiApprovalCard`** showing the step `intent`, its **dry-run `preview` `StateDiff`**
(rendered *before* Approve is enabled), the `risk` badge, reversibility, and the **real
`ScriptArtifact`** under disclosure. Controls: **Approve** / **Reject**. The agent is paused; the
`BudgetMeter` wall clock pauses too. Rejecting a gate counts toward halt conditions.

### 5.4 `executing`
The approved (or ungated) step runs on its simulated `ExecutionBackend`. The `ToolCallCard` shows a live
"running" sub-state (`--primary` slow pulse + `loader`, reduced-motion → static), then the `ExecResult`
(exit code, duration, stdout). Multiple steps stream sequentially; `BudgetMeter` increments.

### 5.5 `verifying`
After a mutating step the agent re-runs a read/diagnostic to confirm the **symptom cleared** (e.g.
re-read the VSS writers / re-check the backup chain). Rendered as a `verification` turn with a
`--success` accent on pass. If verification fails, the agent loops (re-plan) or escalates.

### 5.6 Terminal states

| State | Banner | Content |
|---|---|---|
| `succeeded` | `AiFixResultBanner` (`--success`) | "Fixed — VSS writers reset, next backup application-consistent." Links: **Open run ↗** (Run detail), **Audit ↗**, **Save as playbook**, **Apply always…** (→ Policy editor). `result.healed: true`. |
| `partial` | `AiFixResultBanner` (`--warning`) | cohort/multi-step: "11 of 14 healed; 3 need attention." Per-asset/step breakdown; **Retry failed only**; failures route to escalation. |
| `failed` | `AiFixResultBanner` (`--critical`) | the fix ran but did not clear the symptom. Always offers a path forward (Guided / escalate) — **no dead-end red** ([09 §0.1](../09-page-specs.md)). |
| `escalated` | **`EscalationCard`** (§7) | the agent could not fix it (Insights-class, missing capability, refused approval, or You-step it cannot perform). Shows what it tried + support package + hand-back. |
| `halted` | `AiFixResultBanner` (muted) | bounded stop: budget exhausted, repeated failures, or rejected gate. Shows which `FixBudget` limit hit; offers **Resume with higher budget** (re-create session) or **Hand to Guided**. |

---

## 6. Bulk "End-to-end fix all" — the cohort path

Triggered from the topbar **End-to-end fix all** or an incident's **Fix cohort with AI**. The agent
fixes a **cohort** (all `full`/End-to-end-fixable assets, or an incident's members) — one bounded
`FixSession` **per asset**, fanned out and shown in a single **`BulkAiFixConsole`**.

### 6.1 ASCII wireframe (cohort fan-out)

```
┌─ Fix with AI · End-to-end fix all · 14 assets             [ ✕ ] ┐  wide Sheet, --ai header
│ ✦ Cohort: incident inc_8821 · bcdr.agent-version-regression     │
│ MODEL ✦ Claude · opus ▾ (all sessions)   BUDGET per-asset 6/6   │  one ModelPicker for the cohort
│ GLOBAL GATE  ☑ approve once for all  ○ approve per asset         │  cohort approval policy
├──────────────────────────────────────────────────────────────────┤
│ Asset          │ State        │ Step       │ Conf │ Outcome        │  per-asset mini-rows
│ ● ACME-DC01    │ ✓ Succeeded  │ 3/3        │ 86%  │ healed         │  → expand to its transcript
│ ● ACME-SQL02   │ ◷ Executing  │ 2/3 pulse  │ 84%  │ —              │
│ ▲ NWND-SQL01   │ ◆ Awaiting   │ gate: roll │ 71%  │ approve ▾      │  per-asset gate (if per-asset)
│ ● GLOBEX-DC1   │ ✕ Escalated  │ —          │ 38%  │ support pkg ↗  │
│ … 10 more                                                          │
├──────────────────────────────────────────────────────────────────┤
│ COHORT  11 succeeded · 1 executing · 1 awaiting · 1 escalated      │  rollup (worst-state aware)
│ [ Pause cohort ] [ Abort all ]            [ Open cohort run ↗ ]    │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Rules

- **One approval policy for the cohort.** Default **approve once for all** (a single gate authorizes the
  same gated step across every asset). **Approve per asset** is available for higher-blast-radius cohorts;
  the contract's over-threshold rule (e.g. >50 assets) forces at least one gate regardless.
- **Per-asset budgets** are independent (`FixBudget` per session); one asset hitting `halted`/`escalated`
  does not stop the others. The cohort rollup is **worst-real-state aware** ([design system §8](../03-design-system.md)).
- **Drill-in.** Clicking a mini-row expands that asset's full `AiFixConsole` transcript inline (or routes
  to its session) — the agent's reasoning per asset is never hidden.
- **Cohort outcome** = `succeeded` only if all members healed; otherwise `partial` with the per-asset
  breakdown, **Retry failed only**, and escalation links for the rest.
- Lands as a **single parent run** (`triggeredBy: ai`, scope `all-matching`) with per-asset child outcomes
  in [Run detail](../09-page-specs.md#13-run-detail) (§8) — identical shape to a manual bulk run.

---

## 7. Escalation UX — when the agent can't fix it

Escalation is a **first-class success of the product**, not a failure screen: the value is the assembled
context, so a human resolves it in minutes. It is reached for Insights-class issues, a missing backend
capability, a refused approval, repeated verification failures, or a **You-step the agent cannot perform**
(Guided-class run in AI mode). The console enters `escalated` and renders the **`EscalationCard`**.

### 7.1 ASCII wireframe

```
┌─ EscalationCard ─────────────────────────────────────────────────┐  --warning header (not red)
│ ✦ I couldn't fully fix this. Here's what I tried and what's next.  │
│ ACME-DC01 · saas.oauth-consent-expired · tenant cascade            │
├────────────────────────────────────────────────────────────────────┤
│ WHAT I TRIED                                                        │
│  ✓ get_oauth_grant → consent expired 2026-05-30 (EWS→Graph)        │  read tools, evidence
│  ✓ get_tenant_seats → 7 seats blocked                              │
│  ✗ reissue_consent (saas-api) → BLOCKED: requires admin consent in │  the wall it hit
│    the vendor portal (a "You" step — I can't click it for you)     │
│  confidence the diagnosis is correct: 91%                          │  ConfidenceMeter
├────────────────────────────────────────────────────────────────────┤
│ WHAT YOU NEED TO DO                                                 │
│  1. Open the M365 admin consent screen for tenant <id>             │  the You-step(s)
│  2. Re-grant the Graph permissions, then click "Verify" below      │
├────────────────────────────────────────────────────────────────────┤
│ [ Switch to Guided fix ]  [ Assemble support package ]  [ Open ticket ]│  hand-back actions
│ [ I've done it — re-verify ]                                        │  resume after You-step
└────────────────────────────────────────────────────────────────────┘
```

### 7.2 Behaviour

- **What it tried** lists the actual transcript: read tools + evidence (verbatim error strings, codes via
  `MonoLabel`), the tool(s) that were blocked and **why** (`ToolResult.summary`), and the diagnosis
  confidence. This is the agent's hand-off note.
- **Assemble support package** bundles the transcript, evidence, the relevant `ScriptArtifact`s, the
  asset/issue context, and the `FixSession` id into a copyable/exportable package (and links any
  `opensTicket` ref). Mirrors the manual support-bundle path; see [03 — tools & backends](03-tools-and-backends.md).
- **Switch to Guided fix** hands the same `assetId/issueId` to the `GuidedFixPanel`
  ([05 — Guided Fix UX](05-guided-fix-ux.md)) with the AI's findings pre-loaded, so the human walks the
  You-steps with the diagnosis already done.
- **I've done it — re-verify** re-opens the session in `verifying` to re-run the read/diagnostic after the
  human performed the You-step — the autonomous path resumes where it handed off.
- Escalation is **logged** to Audit (`fix.escalated`, `triggeredBy: ai`) with the reason — §8.

---

## 8. Where AI fixes land — Run history & Audit

An AI fix is a first-class citizen of the existing automation ledger. The loop writes `ActionRun` +
`AuditLogEntry` records ([05 — domain model](../05-domain-model.md), [06 — data & mock](../06-data-model-and-mock-data.md))
exactly like a manual fix — distinguished only by **`triggeredBy: "ai"`** and the session linkage.

| Record | AI-specific fields | Surfaced on |
|---|---|---|
| `ActionRun` (per `FixSession.result.actionRunIds`) | `triggeredBy: "ai"`; `aiSessionId: FixSession["id"]`; `model: { provider, model }` (and per-task models used); `confidencePct`; scope from `ActionScope` | [Run history](../09-page-specs.md#12-run-history--audit) — **Triggered by** shows `✦ AI (claude-opus-…)` with the sparkle, not a tech avatar |
| `AuditLogEntry` (append-only) | verbs `fix.session.created` · `fix.plan.proposed` · `fix.approval.granted/rejected` · `action.executed` · `fix.verified` · `fix.escalated`; actor = `ai:<provider>/<model>`; approver (human) recorded separately at gates | [Audit trail](../09-page-specs.md#12-run-history--audit) — filterable by `triggeredBy: ai` |
| [Run detail](../09-page-specs.md#13-run-detail) | the **full `FixSession.transcript`** is attached/linkable (reasoning + tool calls + diffs + verification), so an auditor can read *why* the agent did each step | step timeline + a "AI reasoning" disclosure |

**Audit guarantees carried from the contract / [09 §12](../09-page-specs.md):** the log is append-only
(no edit/delete UI); **every human approval at a gate is recorded with the approver's identity**, so an
autonomous run still has a clear human-accountability trail; CSV/PDF export includes the AI fields. A
**bulk cohort** run (§6) lands as one parent run (`triggeredBy: ai`, `all-matching`) with per-asset child
outcomes, mirroring a manual bulk run.

---

## 9. Tokens & visual rules (purple is the AI surface)

The AI surface is the **only** place purple appears ([design system §1, §2, §9, §10](../03-design-system.md)).

| Element | Token | Rule |
|---|---|---|
| Console header, "Fix with AI" affordance, `sparkles`/`wand` glyphs | `--ai` (#6A1B9A), `--ai-accent` (#AB47BC) | purple **only** here and on the AI button; never on routine actions, status, or charts |
| Model-reasoning (`kind:"model"`) blocks | text `--ai` on `--ai-tint` (#F3E5F5) | body-size, never gradient text, never decorative glow (impeccable bans) |
| `running` sub-state pulse | `--primary` (slow spin) | action-in-progress is the **primary** in-progress token, not purple |
| Status / state badges (the header `StatusBadge`, `risk` badges) | severity + fix-classification tokens (`--success`/`--warning`/`--critical`/`--fix-*`) | **status is never purple** and **never color-only** — dot + icon + label, per §3.3 |
| Dry-run diff, stdout, ids, codes, ports, hostnames, `ScriptArtifact` | mono surfaces, `MonoLabel`, `--subtle` | technical content is mono/neutral, not tinted |
| `confidencePct`, `BudgetMeter` bars | neutral track + `--ai`/`--primary` fill **plus** a numeric label | meters are never color-only; the number is the truth |

Banned here as everywhere: gradient text, decorative glassmorphism, side-stripe borders, nested cards,
hero-metric blocks, per-section uppercase eyebrows ([10 §0](../10-component-inventory.md), impeccable).
A token that doesn't exist (e.g. a dedicated `--ai-strong` for hover) is **added** to `globals.css` +
Foundations + `DESIGN.md`, never inlined.

---

## 10. Accessibility

- **Status never color-only.** Every `FixState`, `risk`, and transcript `kind` carries dot/glyph **and**
  text (§3.3). The header `StatusBadge` reuses the audited [Atoms/StatusBadge](../10-component-inventory.md)
  contract. `succeeded`/`failed`/`escalated` are distinguishable in greyscale.
- **The streaming transcript** is an `aria-live="polite"` log (`role="log"`) so a screen reader hears the
  agent's reasoning, tool calls, and verifications as they arrive; the live indicator is not the only cue.
  A **Pause auto-scroll** affordance lets keyboard/SR users read without the view jumping; turns are an
  ordered list with real timestamps.
- **Approval gates** move focus to the `AiApprovalCard` heading; the dry-run diff is reachable and read
  before the Approve button (which names the action + scope count, e.g. "Approve: reset VSS writers on
  ACME-DC01"). Reject is equally reachable. No focus trap when the gate dismisses.
- **Model reasoning** purple-on-tint meets AA (verify `--ai` on `--ai-tint` in both themes, the known
  watch-out in [design system §3, §11](../03-design-system.md)); reasoning is body weight, not a low-contrast
  decorative treatment.
- **Reduced motion.** The `running` pulse, the live `⟳`, the auto-scroll, and any sparkle motion have a
  `prefers-reduced-motion` static alternative (static `loader`, no auto-scroll, no animated glyph).
- **Confidence & budget meters** expose their value as text (`aria-valuenow` / a visually-hidden "86% confidence").
- **Abort/Pause** are always keyboard-reachable; closing the sheet does not abort (focus returns to the
  invoking control; the resumable topbar pill is reachable).
- **Bulk console** mini-rows are a `DataTable` (`aria-sort`, caption, per-row state in text); the cohort
  rollup is `aria-live`.

---

## 11. States checklist (definition of done for the AI surface)

A "Fix with AI" surface is shippable only when **all** hold:

- [ ] Offered per the §1.1 fix-classification matrix (AI for automatable; diagnose-only for Insights/unknown).
- [ ] All entry points (§2) open the **same** `AiFixConsole` bound to a `FixSession` via `FixClient`.
- [ ] Every `FixState` (§5) renders as real content — `triaging`/`planning`/`awaiting-approval`/
      `executing`/`verifying`/`succeeded`/`partial`/`failed`/`escalated`/`halted` — no spinner-only screen.
- [ ] `ToolCallCard` shows risk + backend + input + dry-run `StateDiff` (before apply) + `ExecResult`
      + the real `ScriptArtifact` under disclosure; `healed` reflected.
- [ ] Plan preview with `confidencePct`; **dry-run diff before any mutating apply**; gates honored.
- [ ] `ModelPicker` supports per-session **and** per-task model selection from `ModelInfo[]`.
- [ ] Bulk cohort path (§6) fans out per-asset sessions with a cohort approval policy + worst-state rollup.
- [ ] Escalation (§7) assembles a support package and hands back to Guided / human with what it tried.
- [ ] AI fixes land in Run history + Audit with `triggeredBy: ai`, model, confidence, and the linked
      transcript; human approvals at gates are recorded by identity (§8).
- [ ] Purple is used **only** on the AI surface; status is never color-only; AA in light + dark; reduced-motion
      alternatives present (§9, §10).
- [ ] Every console sub-component (§3.2) has a Storybook story per [10 — component inventory](../10-component-inventory.md)
      coverage rules, and the impeccable hook is clean.

---

## 12. Cross-references

- Sibling fix-engine specs: [01 — architecture](01-architecture.md) · [02 — providers & models](02-providers-and-models.md) ·
  [03 — tools & backends](03-tools-and-backends.md) · [04 — the agent loop & sessions](04-agent-loop-and-session.md) ·
  [05 — Guided Fix UX](05-guided-fix-ux.md) (the blue, step-by-step counterpart).
- Product model & fix-classification: [00 — vision & scope §3, §7](../00-vision-and-scope.md).
- Failure modes → tools mapping: [02 — failure catalog](../02-failure-catalog.md), `research/failure-catalog.json`.
- Domain & ledger records (`ActionRun`, `AuditLogEntry`): [05 — domain model](../05-domain-model.md),
  [06 — data & mock data](../06-data-model-and-mock-data.md).
- Existing automation engine (scope once/all/always, playbooks, approvals): [07 — engine](../07-troubleshooting-and-automation-engine.md).
- Where the AI button lives + Run/Audit pages: [09 — page specs §1, §3, §4, §7, §12, §13](../09-page-specs.md).
- Components reused (`StatusBadge`, `MonoLabel`, `ApplyScopeControl`, `DataTable`, `RemediationPanel`):
  [10 — component inventory](../10-component-inventory.md).
- Tokens (purple AI surface, status, never color-only): [03 — design system](../03-design-system.md), [`../../DESIGN.md`](../../DESIGN.md).
```
