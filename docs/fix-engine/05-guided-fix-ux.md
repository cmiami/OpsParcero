# Fix Engine 05 — Guided Fix UX (the blue, human-in-the-loop path)

The screen-level UX spec for **Guided fix** — the blue, step-by-step remediation surface where the AI harness runs the automatable **"We"** steps (with live tool-call cards, dry-run diffs, and verification) and walks the human through the manual **"You"** steps, pausing at every gated step for approval. This is the *human-in-the-loop* sibling of [Fix with AI](06-fix-with-ai-ux.md) (the autonomous purple path); both are driven by the same agent loop and the same `FixSession` state machine.
Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md). Part of the **Fix Engine** sub-set: [00 overview](00-overview.md) · [01 architecture](01-architecture.md) · [02 providers & models](02-providers-and-models.md) · [03 tool catalog](03-tool-catalog.md) · [04 agent loop & sessions](04-agent-loop-and-sessions.md) · **05 Guided Fix UX** · [06 Fix-with-AI UX](06-fix-with-ai-ux.md).

---

## 0. How to read this doc

This is the **feature-UX** layer for Guided fix. It says *what the Guided fix surface looks like, which components compose it, which `FixSession` states it renders, and how a technician drives a session from triage to verified-resolved* — without leaving the page they were already on. It is grounded in:

- the **locked decisions** and **canonical interfaces** in the [Fix Engine design contract](01-architecture.md) (`FixSession`, `FixState`, `FixPlanStep`, `ToolResult`, `StateDiff`, `FixClient`, `ModelProvider`) — used here **verbatim**, never redefined;
- the existing **RemediationPanel / We-You / ApplyScopeControl** model from [page specs §7 (Asset Detail)](../09-page-specs.md#7-asset-detail) and [§3 (Triage)](../09-page-specs.md#3-triage-queue), and the [component inventory](../10-component-inventory.md);
- the **fix-classification** model (End-to-end / Guided / Insights) and the We/You + apply-once/all/always model from [00-vision §3](../00-vision-and-scope.md) and [07-troubleshooting-and-automation-engine](../07-troubleshooting-and-automation-engine.md).

**The one-sentence definition.** Guided fix = the existing `RemediationPanel` rail, *upgraded* from "click Apply and watch a Run record appear" to "the agent reasons over the failure evidence, drives the automatable steps live in front of you with previewable diffs, and hands you the manual steps with approve/continue gates." It is the **blue** fix-classification (`--fix-guided`); the AI reasoning chrome inside it is the **only** place purple (`--ai`) appears.

### 0.1 Conventions

- Component names in `CamelCase` reference the [component inventory](../10-component-inventory.md) or the new **Fix** organism family added by this doc (`GuidedFixPanel`, `FixTranscriptView`, `ToolCallCard`, `ModelPicker`, `FixStepRail`). Token names (`--primary`, `--fix-guided`, `--ai`, `bg-card`) reference the [design system](../03-design-system.md). Never hardcode hex.
- All interfaces are the contract's. `FixState`, `FixMode`, `FixPlanStep`, `FixSession`, `FixTranscriptTurn`, `ToolResult`, `StateDiff`, `FixClient`, `FixSessionEvent`, `ModelInfo` are **imported**, not invented.
- Guided fix runs in `mode: "guided"`. The loop pauses at **every `you` step and every gated `we` step**; AI mode (mode `"ai"`) does not — that is the only loop-level difference ([contract: agent loop](04-agent-loop-and-sessions.md)).

---

## 1. Where Guided fix lives (entry points)

Guided fix is not a route. It is a surface that **mounts in place** of (or expands) the existing suggested-fix affordance, on the two screens where a technician confronts a single diagnosed failure:

| Surface | Host | How Guided fix appears |
|---|---|---|
| **Issue / Incident detail** (Resolution Center) | [page specs §4](../09-page-specs.md#4-incident-detail) `RemediationPanel`/suggested-playbook rail | A suggested fix classified `guided` renders **`[Start Guided fix]`** beside `[Dry-run]`/`[Run ▸]`. Starting it expands the rail into the `GuidedFixPanel`, cohort-scoped from the incident. |
| **Asset detail** (`/assets/[assetId]`) | [page specs §7.4 signature flow](../09-page-specs.md#74-the-signature-troubleshooting-flow-concrete), the `RemediationPanel` rail | The **💡 Suggested fix** card gains **`[Start Guided fix]`** under the existing `[Dry-run] [Apply once] [Always…]`. It launches the `GuidedFixPanel` inline in the rail, scoped via the same `ApplyScopeControl`. |

In both cases Guided fix is a **progressive upgrade of the existing rail**, not a new modal or route. The technician never loses their place; the why-red evidence, the `MonoLabel` error, and the `ApplyScopeControl` stay visible above the running session.

### 1.1 How it extends the existing RemediationPanel

The current `RemediationPanel` ([component inventory §4.3](../10-component-inventory.md)) has states `SuggestionList → ActionSelected → ScopeChosen → Confirm → Executing → Success/Failure`. Guided fix inserts the agent between **ScopeChosen** and **Executing**:

```
RemediationPanel (today)        RemediationPanel + Guided fix (this doc)
─────────────────────          ────────────────────────────────────────
SuggestionList                  SuggestionList
  ↓ select                        ↓ select
ActionSelected                  ActionSelected   (fix shows classification: ● Guided)
  ↓ scope                         ↓ scope (ApplyScopeControl — unchanged)
ScopeChosen                     ScopeChosen
  ↓ Apply                         ↓ [Start Guided fix]   ← new branch
Executing ──────────────►       GuidedFixPanel  (triaging → planning → … → verifying)
  ↓                               ↓ each `we` step: ToolCallCard (preview → run → result)
Success / Failure                 ↓ each `you` / gated step: pause for human
                                GuidedFixPanel: succeeded / partial / escalated
                                  ↓ (every step still writes ActionRun + AuditLog)
                                Run detail (unchanged target: /automation/runs/[id])
```

The **`[Dry-run] / [Apply once] / [Always…]`** buttons remain for the classic one-shot path (and for `end-to-end` fixes). `[Start Guided fix]` is additive — present only when the suggested fix's classification is `guided` (or when the technician explicitly chooses "step me through it"). When the session finishes it lands in [Run detail](../09-page-specs.md#13-run-detail) exactly like a manual apply, because the loop writes `ActionRun` + `AuditLogEntry` records ([contract §canonical interfaces](04-agent-loop-and-sessions.md)).

### 1.2 We / You + Apply-scope are preserved, not replaced

- **We/You** is the spine. The contract's `FixPlanStep.actor: "we" | "you"` *is* the We/You distinction. Guided fix renders `we` steps as **automated tool-call cards the agent drives**, and `you` steps as **human-action cards the agent waits on** ([00-vision §3](../00-vision-and-scope.md)).
- **Apply once / all / always** is unchanged. The `ApplyScopeControl` ([component inventory §3](../10-component-inventory.md#3-molecules), `ScopeMode = 'once' | 'all-matching' | 'always-forward'`) sits **above** the `GuidedFixPanel` and feeds `FixSession.scope` (`ActionScope`). A Guided session can target one asset, a selected cohort, or all matching; `always-forward` after a successful Guided session offers **"Save as policy"** → [Policy editor](../09-page-specs.md#11-automation-policy-editor), identical to today.
- **Fan-out.** When scope > 1 asset, the agent plans once and the `we`-step tool calls fan out per asset (the executor runs per target); the panel shows a per-asset progress strip identical to [Run detail's resolved-assets rail](../09-page-specs.md#13-run-detail). Gated steps gate the **whole batch** (one approval, not N).

---

## 2. The GuidedFixPanel organism (the core surface)

`GuidedFixPanel` is the new lead organism. It is a vertical, three-region composite that drives one `FixSession` in `mode: "guided"`:

1. **Session header** — model in use, state pill, budget meter, abort. (`ModelPicker` collapsed view + `FixStatePill` + `FixBudgetMeter`.)
2. **Step rail** (`FixStepRail`) — the `FixPlan.steps` as an ordered, We/You-tagged checklist with per-step status; the live step expands into its `ToolCallCard` (for `we`) or `YouStepCard` (for `you`).
3. **Transcript** (`FixTranscriptView`) — the streaming reasoning + tool calls + tool results + verification, collapsible, for the technician who wants to *watch the agent think*.

### 2.1 ASCII wireframe — Guided fix mid-session (a `we` step running)

```
┌─ RemediationPanel rail · Asset detail: ACME-DC01 ──────────────────────────────┐
│ WHY IS THIS RED?  VSS writer failure → crash-consistent only                   │
│ Evidence "VSS failed to prepare snapshots"  code BKP1410 (mono)                 │
│ Classified: bcdr.vss-writer-snapshot-failure                                    │
│ SUGGESTED FIX  ● Guided   💡 Reset VSS Writers + Retry                          │
│ ApplyScopeControl:  ● This asset  ○ Selected  ○ All matching  ○ Always          │
│ [Dry-run] [Apply once] [Always…]            [▶ Start Guided fix]                │
├────────────────────────────────────────────────────────────────────────────────┤
│ ╭─ GuidedFixPanel ──────────────────────────────────────────────────────────╮  │
│ │ ✦ Guided fix · ACME-DC01            ◐ Executing  ·  step 3/5               │  │  ← FixStatePill (state≠color-only)
│ │ Model: Claude · claude-…  [change ▾]   budget ▣▣▣▣▣▢▢ 4/12 calls · 38s     │  │  ← ModelPicker(collapsed)+FixBudgetMeter
│ │ ────────────────────────────────────────────────────────────────  [⏹ Stop]│  │
│ │ STEPS                                                                       │  │  ← FixStepRail
│ │  ✓ 1  We · Diagnose VSS writers            get_vss_writers      0.4s        │  │
│ │  ✓ 2  We · Stop affected writer services   (preview→run)        2.1s        │  │
│ │  ◐ 3  We · Reset + re-register VSS writers  ◀ running now                   │  │
│ │  ▸ ╭─ ToolCallCard · reset_vss_writers ───────────────────── safe-write ─╮ │  │
│ │  ▸ │ input  { services:["VSS","SWPRV","COMSysApp"], reRegister:true }      │ │  │
│ │  ▸ │ ┌ Dry-run preview (diff) ───────────────────────────────────────┐    │ │  │
│ │  ▸ │ │ vss.writers.failed   3  →  0                                   │    │ │  │
│ │  ▸ │ │ services.VSS.state    stopped → running                        │    │ │  │
│ │  ▸ │ └───────────────────────────────────────────────────────────────┘    │ │  │
│ │  ▸ │ ▸ console  PS> Reset-VssWriters -ReRegister … (streaming) ▍          │ │  │
│ │  ▸ ╰── result: pending ────────────────────────────────────────────────╯ │  │
│ │  ○ 4  You · Confirm a successful test backup ran        (waits for you)     │  │
│ │  ○ 5  We · Verify chain consistency        verify_backup_chain (gated)      │  │
│ │ ────────────────────────────────────────────────────────────────────────  │  │
│ │ ▾ Reasoning & verification  (FixTranscriptView)                            │  │
│ │   model  "VSS writers VSS, SWPRV, COMSysApp are in a failed state; the     │  │
│ │           safe fix is to stop the dependent services, re-register the …"  ▍ │  │  ← aria-live streaming
│ │   tool_call  get_vss_writers { } → 3 writers failed                        │  │
│ │   observation  matches code BKP1410; proceeding to reset                   │  │
│ ╰───────────────────────────────────────────────────────────────────────────╯  │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 ASCII wireframe — paused at a `you` step (human action)

```
│ │  ◐ 4  You · Confirm a successful test backup ran        ◀ needs you          │
│ │  ▸ ╭─ YouStepCard · manual step ─────────────────────────────── you ──────╮ │
│ │  ▸ │ Run an on-demand backup of ACME-DC01 and confirm it completes         │ │
│ │  ▸ │ crash-consistent → application-consistent.                            │ │
│ │  ▸ │ Why: the agent reset the writers but cannot trigger your maintenance- │ │
│ │  ▸ │ window backup for you. Verify, then continue.                         │ │
│ │  ▸ │ Need help?  [Open backup job ↗]   [Copy steps]                        │ │
│ │  ▸ ╰── [✓ I did this — continue]   [✕ Couldn't — escalate]  [Skip step ▾]──╯ │
```

### 2.3 ASCII wireframe — gated `we` step awaiting approval

```
│ │  ◐ 5  We · Verify chain consistency      ◀ approval required                │
│ │  ▸ ╭─ ToolCallCard · verify_backup_chain ──── destructive · gated ─────────╮ │
│ │  ▸ │ This step reseeds the inverse chain if verification fails — it can     │ │
│ │  ▸ │ discard local recovery points older than 24h.   reversible: no        │ │
│ │  ▸ │ ┌ Dry-run preview (diff) ──────────────────────────────────────────┐  │ │
│ │  ▸ │ │ chain.localPoints   42 → 6     (36 points would be discarded)     │  │ │
│ │  ▸ │ └──────────────────────────────────────────────────────────────────┘  │ │
│ │  ▸ │ Approve to run on 1 asset.                                            │ │
│ │  ▸ ╰── [Approve & run]   [Reject — skip]   [Approve all matching ▾]────────╯ │
```

### 2.4 GuidedFixPanel — props & state

```ts
interface GuidedFixPanelProps {
  // identity of the target + the suggested fix that seeded this session
  assetId: AssetId;
  issueId?: string;                 // present when launched from Incident/Issue detail
  suggestedFix: SuggestedFix;       // from the failure catalog (name, classification, actionId)
  scope: ActionScope;               // mirrored from the host ApplyScopeControl
  defaultModel: { provider: ProviderId; model: string };  // session + per-task overridable
  client: FixClient;                // live engine OR offline sim — indistinguishable (see §6)
  onResolved?: (r: NonNullable<FixSession["result"]>) => void;  // → Run detail / toast
  onEscalated?: (ticketRef?: string) => void;
}
```

`GuidedFixPanel` owns no business logic of its own: it `createSession({ ..., mode: "guided" })`, subscribes to `client.stream(sessionId)`, reduces `FixSessionEvent`s into a local `FixSession` view-model, and renders. Human actions call `client.approve(sessionId, stepId, decision)` and `client.abort(sessionId)`. **All `FixState` values render** — see [§3](#3-states-the-fixsession-state-machine-on-screen).

---

## 3. States — the FixSession state machine on screen

`GuidedFixPanel` is a faithful renderer of the contract's `FixState`. Every value has a designed appearance; status is **never color-only** (dot + icon + text on the `FixStatePill`).

| `FixState` | Pill (dot · icon · label) | What the panel shows | Token |
|---|---|---|---|
| `triaging` | ◌ · search · **Triaging** | Transcript streams read-tool calls (`get_vss_writers`, `read_event_log`); step rail not yet built. | `--ai` accents on reasoning; pill `--muted-fg` |
| `planning` | ◔ · list-checks · **Planning** | Transcript streams plan rationale; `FixStepRail` populates as `FixPlan.steps` arrive, We/You-tagged, with `confidencePct`. | `--ai` |
| `awaiting-approval` | ⏸ · shield-alert · **Needs approval** | Live step is a gated `ToolCallCard` (or batch) showing the dry-run diff + **[Approve & run]/[Reject]**. Panel is calm, not alarming. | `--warning` |
| `executing` | ◐ · play · **Executing** | Live `we` step `ToolCallCard` runs: preview → console stream → result + diff. Budget meter advances. | `--primary` (the run), `--ai` (reasoning) |
| `verifying` | ◑ · scan-line · **Verifying** | Agent re-runs a read/diagnostic tool to confirm the symptom cleared; verification turn streams in transcript. | `--primary` |
| `succeeded` | ✓ · check-circle · **Resolved** | Success summary card: "Symptom cleared — code BKP1410 no longer present," `ActionRun` link, `[Open Run detail ↗]`, `[Save as playbook]`, `[Always…]`. | `--success` |
| `partial` | ◑ · check-minus · **Partly fixed** | Per-asset / per-step breakdown: which cleared, which didn't; `[Retry failed only]`, `[Escalate remaining]`. | `--warning` |
| `failed` | ✕ · x-circle · **Couldn't fix** | Failure summary + last error (`MonoLabel`); offers `[Escalate]` (assemble support package) and `[Try a different model ▾]`. | `--critical` |
| `escalated` | ↗ · life-buoy · **Escalated** | Support package summary (evidence bundle, transcript excerpt, attempted steps) + `opensTicket` ref; **never a dead end** ([page specs §0.1](../09-page-specs.md)). | `--muted-fg` |
| `halted` | ⏹ · octagon-pause · **Stopped** | Why it stopped (budget exhausted / repeated failures / approval refused) + `[Resume with higher budget ▾]` / `[Escalate]`. | `--muted-fg` |

> **Pause semantics (guided-specific).** In `mode: "guided"` the loop additionally enters a *human-wait* whenever the current `FixPlanStep.actor === "you"`. On screen this is rendered as the live step being a `YouStepCard` ([§2.2](#22-ascii-wireframe--paused-at-a-you-step-human-action)); under the hood it is modeled as an `awaiting-approval`-class pause keyed to that step, resolved by `client.approve(sessionId, stepId, "approve")` when the human clicks **[✓ I did this — continue]**. AI mode never produces `you` steps in its critical path (it would escalate instead).

**Idle.** Before `[Start Guided fix]` is pressed, the host `RemediationPanel` is in its normal `ScopeChosen` state — `GuidedFixPanel` is not yet mounted. There is no separate "idle" panel chrome; idle is the existing suggested-fix card.

---

## 4. The sub-components (what to build)

All live under `src/components/organisms/fix/` ([contract canonical layout](01-architecture.md)). Each gets a Storybook story with full `argTypes`, every state as a named export, and a `play` function for interactive states ([CLAUDE.md M2](../../CLAUDE.md), [storybook coverage rule](../10-component-inventory.md#6-coverage-matrix-auditable--100)). The offline `FixClient` (the [sim path](#6-offline-sim-vs-live-engine)) is what stories drive, so they are fully deterministic.

### 4.1 ToolCallCard — one automated "We" step

The unit of automated work. Shows the tool name + risk badge, the structured input, the **dry-run diff** (`StateDiff`), a live console stream, and the result. Drives preview → (gate) → run → result.

```ts
interface ToolCallCardProps {
  step: FixPlanStep;                 // intent, toolName, input, actor:"we", risk, requiresApproval
  preview?: ToolResult;              // dryRun:true result — populated before run (diff, no mutation)
  result?: ToolResult;              // post-run result (ok, summary, output, diff, healed, opensTicket)
  console?: string;                  // streaming stdout (live) — appended from ChatEvent/ToolProgress
  phase: "previewing" | "awaiting-approval" | "running" | "done" | "error";
  onApprove?: () => void;            // gated step → client.approve(...,"approve")
  onReject?: () => void;             // → client.approve(...,"reject")  (skips the step)
  onApproveScope?: (m: ScopeMode) => void;  // "Approve all matching" for batch fan-out
}
```

- **Risk badge** uses `ToolRisk` (`read` · `safe-write` · `destructive`) with text + icon (never color-only): `read` = eye, `safe-write` = pencil, `destructive` = alert-triangle. `requiresApproval` adds a **gated** chip.
- **Diff** renders `StateDiff.before → after` as a two-column key/value list; removed/decremented values flagged with a minus icon, not red alone. `reversible: false` surfaces a "not reversible" line.
- **Console** is a `MonoLabel`/`Textarea(mono)` region with `aria-live="polite"` and a copy button; the real `ScriptArtifact` source is viewable behind a **`▸ View script`** disclosure (the actual PowerShell/bash/HTTP — [contract: real script artifacts](03-tool-catalog.md)).
- **Indistinguishable** whether the console text came from a live executor or the sim ([§6](#6-offline-sim-vs-live-engine)).
- **States (stories):** `Read`, `SafeWritePreview`, `SafeWriteRunning`, `SafeWriteDone`, `DestructiveGatedAwaitingApproval`, `BatchFanOut`, `Error`, `ScriptDisclosureOpen`.

### 4.2 YouStepCard — one manual "You" step

The human-action card the agent waits on. Plain-language instruction + *why the agent can't do it* + optional deep link + the continue/escalate/skip controls.

```ts
interface YouStepCardProps {
  step: FixPlanStep;                 // actor:"you"; intent is the instruction
  helpLink?: { label: string; href: string };  // e.g. "Open backup job ↗"
  onContinue: () => void;            // [✓ I did this — continue]  → approve(step,"approve")
  onCantDo: () => void;              // [✕ Couldn't — escalate]    → approve(step,"reject") → escalate
  onSkip?: (reason: string) => void; // optional, audited
}
```

- Carries a **`you`** badge (icon + text) so it is unmistakable from the `we` tool cards.
- `[Copy steps]` copies the instruction text. Skipping is **audited** (writes an `AuditLogEntry`).
- **States (stories):** `Default`, `WithHelpLink`, `Continued`, `Escalated`, `Skipped`.

### 4.3 FixStepRail — the We/You plan checklist

Ordered render of `FixPlan.steps` with per-step status; the live step expands its `ToolCallCard`/`YouStepCard`. This is the at-a-glance "where are we."

```ts
interface FixStepRailProps {
  plan?: FixPlan;                    // undefined while triaging → renders "Building plan…" skeleton
  steps: Array<FixPlanStep & { status: "pending"|"running"|"done"|"failed"|"skipped"|"awaiting" }>;
  activeStepId?: string;
  perAsset?: Array<{ assetId: AssetId; name: string; outcome: "ok"|"fail"|"running"|"pending" }>; // fan-out
}
```

- Each row: index · **We/You** tag · intent · tool name (mono) · duration/status. Status uses dot+icon+text.
- When scope > 1, a compact per-asset outcome strip mirrors [Run detail's resolved-assets rail](../09-page-specs.md#13-run-detail).
- **States (stories):** `Building` (planning), `MixedWeYou`, `RunningStep`, `AwaitingApproval`, `FanOutMultiAsset`, `Completed`, `PartialFailures`.

### 4.4 FixTranscriptView — streaming reasoning + tool calls + verification

The "watch it think" log. A time-ordered render of `FixTranscriptTurn[]`, collapsible (collapsed by default for confident techs, expanded for skeptics). Fed by `FixSessionEvent` / `ChatEvent` deltas.

```ts
interface FixTranscriptViewProps {
  turns: FixTranscriptTurn[];        // kind: model|tool_call|tool_result|observation|approval|verification|status
  streamingText?: string;            // the in-flight model delta (typed-in effect)
  collapsed?: boolean;
  onToggle?: () => void;
}
```

- Turn rendering by `kind`: `model` reasoning = **purple** (`--ai`) left accent + text; `tool_call`/`tool_result` = neutral code-style; `verification` = `--primary`; `approval` = the recorded decision (who/when); `status`/`observation` = `--muted-fg`.
- **Purple is confined here and to the model-reasoning accents** — the run mechanics, diffs, and buttons are `--primary` (blue/Guided), per [CLAUDE.md M4](../../CLAUDE.md) and [design system §AI surface](../03-design-system.md). Guided fix is *blue with a purple reasoning inset*, not a purple feature.
- Streaming text appends into an `aria-live="polite"` region (see [§7 a11y](#7-accessibility-wcag-22-aa)).
- **States (stories):** `Triaging`, `Planning`, `ExecutingWithToolCalls`, `Verifying`, `Collapsed`, `Escalation`.

### 4.5 ModelPicker — choose provider / model (session + per-task)

Lets the technician pick the `ModelProvider` + `ModelInfo` for the session, and (advanced) override per task phase (cheap local model for triage, capable hosted model for planning — [contract decision 3](02-providers-and-models.md)). The **Mock** provider is always present for reproducible/offline demos.

```ts
interface ModelPickerProps {
  models: ModelInfo[];               // from provider.listModels() across all configured providers
  value: { provider: ProviderId; model: string };
  onChange: (v: { provider: ProviderId; model: string }) => void;
  perTask?: Partial<Record<"triage"|"plan"|"verify", { provider: ProviderId; model: string }>>;
  onPerTaskChange?: (m: NonNullable<ModelPickerProps["perTask"]>) => void;
  variant?: "collapsed" | "full";    // collapsed = the header chip; full = popover/sheet
}
```

- Groups by `ProviderId` (Anthropic · OpenAI-compatible · Google · Local · Mock). Each option shows `label`, context window, a **local** chip for self-hosted, and cost hint (`costPer1kIn/Out`) when present. Models without `supportsTools` are disabled with a "no tool calling" note (the loop needs tools).
- **Changing the model mid-session** is allowed only at a pause (`awaiting-approval` / `you`-step / between steps), not mid-tool-call; otherwise it applies to the next session.
- **States (stories):** `Collapsed`, `FullGroupedByProvider`, `PerTaskOverrides`, `LocalModelSelected`, `MockSelected`, `ToolUnsupportedDisabled`.

### 4.6 Supporting atoms/molecules

| Component | Level | Props sketch | Notes |
|---|---|---|---|
| **FixStatePill** | Molecule | `state: FixState; mode: FixMode` | dot + icon + label per [§3 table](#3-states-the-fixsession-state-machine-on-screen); the canonical non-color-only proof for fix sessions. |
| **FixBudgetMeter** | Molecule | `budget: FixBudget; used: {steps; toolCalls; tokens; wallMs}` | segmented meter + "4/12 calls · 38s"; turns `--warning` near exhaustion; mono numerals. |
| **StateDiffView** | Molecule | `diff: StateDiff` | shared by `ToolCallCard` preview + result; before→after key/value; used in [Run detail](../09-page-specs.md#13-run-detail) too. |
| **RiskBadge** | Atom | `risk: ToolRisk; requiresApproval?; reversible?` | icon+text; reused by the [tool catalog](03-tool-catalog.md) docs surfaces. |

### 4.7 Coverage matrix delta (append to component inventory §6)

| # | Component | Level | Story title | Min exports | `play` |
|---|---|---|---|---|---|
| 66 | RiskBadge | Atom | `Atoms/RiskBadge` | 4 | — |
| 67 | FixStatePill | Molecule | `Molecules/FixStatePill` | 10 | — |
| 68 | FixBudgetMeter | Molecule | `Molecules/FixBudgetMeter` | 4 | — |
| 69 | StateDiffView | Molecule | `Molecules/StateDiffView` | 4 | — |
| 70 | YouStepCard | Molecule | `Molecules/YouStepCard` | 5 | ✓ continue |
| 71 | ModelPicker | Molecule | `Molecules/ModelPicker` | 6 | ✓ pick |
| 72 | ToolCallCard | Organism | `Organisms/Fix/ToolCallCard` | 8 | ✓ preview→run |
| 73 | FixStepRail | Organism | `Organisms/Fix/FixStepRail` | 7 | — |
| 74 | FixTranscriptView | Organism | `Organisms/Fix/FixTranscriptView` | 6 | ✓ stream |
| 75 | GuidedFixPanel | Organism | `Organisms/Fix/GuidedFixPanel` | 10 | ✓ full session |

`GuidedFixPanel`'s 10 exports map 1:1 to the ten `FixState` rows in [§3](#3-states-the-fixsession-state-machine-on-screen), each seeded by the deterministic Mock `FixClient`.

---

## 5. The session lifecycle on this surface (driving the loop)

This is the [contract's canonical state machine](04-agent-loop-and-sessions.md) as the technician experiences it in Guided mode:

1. **Start.** Tech picks scope (`ApplyScopeControl`) and model (`ModelPicker`), clicks **[Start Guided fix]**. `client.createSession({ assetId, issueId, mode: "guided", model, scope })` → `FixSession{ state: "triaging" }`. Panel mounts; transcript begins streaming.
2. **Triage.** Agent calls **read tools only** (`get_vss_writers`, `read_event_log`, `get_backup_chain` …) to gather evidence over the *real* failure data; cards show `risk: read`, no diffs/mutations.
3. **Plan.** Agent emits a `FixPlan` (summary, steps, rationale, `confidencePct`). `FixStepRail` fills; each step is tagged We/You and risk. Tech can read the plan before anything runs.
4. **Per step:**
   - **gated `we` step** → `awaiting-approval`: `ToolCallCard` shows the **dry-run preview diff** (zero mutation), tech **[Approve & run]** (or rejects → step skipped, may escalate).
   - **ungated `we` step** → `executing`: card previews then runs; console streams; result + diff land.
   - **`you` step** → human-wait: `YouStepCard`; tech **[continue]** or **[escalate]**.
   - **verify** → `verifying`: agent re-runs a read/diagnostic to confirm the symptom cleared; verification turn streams.
5. **Terminal.** `succeeded` (symptom cleared, healed) / `partial` (some assets/steps) / `failed` / `escalated` / `halted`. The result writes `ActionRun` + `AuditLogEntry`; `onResolved` toasts + links to [Run detail](../09-page-specs.md#13-run-detail).
6. **Bounds & halts.** `FixBudget` caps steps/tool-calls/tokens/wall-time (meter visible). The loop `halts` on budget exhaustion, repeated failures, or a refused approval — each rendered with a specific reason + recovery affordance ([§3](#3-states-the-fixsession-state-machine-on-screen)). **No dead-end reds** — every terminal state offers a next step.
7. **Abort.** **[⏹ Stop]** → `client.abort(sessionId)`; any completed mutating steps remain in the `ActionRun` (and are revertible from Run detail if reversible); the session ends `halted` with a clear "stopped by you."

---

## 6. Offline-sim vs live-engine (indistinguishable to the user)

Per [contract decision 2](01-architecture.md), the front end talks to **one `FixClient` interface** with two implementations, and **the UX must be identical** regardless of which is active:

| | Live engine | Offline sim |
|---|---|---|
| Impl | `src/lib/fix-client/` over SSE to the running `fix-engine` (`NEXT_PUBLIC_FIX_ENGINE_URL`) | `src/lib/fix-sim/` — deterministic in-browser generator mirroring the engine |
| Model loop | real provider tool-calling LLM | scripted, seeded `ChatEvent`/`FixSessionEvent` sequence (Mock provider) |
| Execution | simulated `ExecutionBackend`s in the engine | same simulated behavior, in-browser |
| Streaming | SSE → `FixSessionEvent` | async generator → identical `FixSessionEvent` shape |
| Approvals | `POST` to engine | resolved in the local state machine |

The `GuidedFixPanel` and all sub-components **only ever see `FixClient` + `FixSessionEvent`** — they cannot tell which is wired. Console output, diffs, timings, and reasoning all look real in both ([contract: realistic mock data, M6](../../CLAUDE.md)). A small, non-alarming **mode indicator** in the session header reads `Live` or `Demo` (text + icon, not a different layout) so a demoer knows which path is active — but the *fix experience* does not change. Storybook always uses the sim client, which is why every state is a deterministic story export.

---

## 7. Accessibility (WCAG 2.2 AA)

Carrying [CLAUDE.md M5](../../CLAUDE.md) and [page specs a11y](../09-page-specs.md):

- **Status is never color-only.** `FixStatePill`, `RiskBadge`, per-step status, and per-asset outcomes all use **dot/icon + text**. The `FixStatePill` is the canonical proof for fix sessions (mirrors the [Status System foundation story](../10-component-inventory.md#1-foundations)).
- **Streaming is announced.** `FixTranscriptView`'s in-flight model text and `ToolCallCard`'s console live in `aria-live="polite"` regions; **state transitions** (planning→executing→verifying→resolved) fire on a single `role="status"` region so a screen-reader user hears "Executing step 3 of 5: reset VSS writers," not a flood of token deltas. Token-level deltas are visually animated but **not** individually announced (throttled to turn boundaries).
- **Pauses move focus.** When the loop enters `awaiting-approval` or a `you` step, focus moves to the gating card's heading; the primary action (**Approve & run** / **I did this — continue**) is the first tab stop. Escalation/abort are reachable but never the default focus.
- **Keyboard.** Entire panel operable without a mouse: step rail rows are a list; `ToolCallCard`/`YouStepCard` controls are buttons; `ModelPicker` is a `Popover`+`Command` combobox; `View script` and transcript are `<details>`/disclosure with proper `aria-expanded`. Approval has no time-pressure auto-dismiss.
- **Reduced motion.** The "thinking" caret, console autoscroll, and budget-meter fill respect `prefers-reduced-motion` (swap pulse for static state); content is never conveyed by motion alone.
- **Copyable evidence.** Verbatim errors, console output, and script artifacts use `MonoLabel`/mono `Textarea` and are copyable for ticketing.

---

## 8. Tokens (the purple rule)

| Surface | Token | Rule |
|---|---|---|
| Guided fix classification, run mechanics, primary buttons, progress | `--fix-guided` / `--primary` (Kaseya blue) | Guided fix is a **blue** feature; every control and run indicator is blue. |
| **AI reasoning only** — transcript model turns, the "✦ Guided fix" reasoning accent, the model-thinking caret | `--ai` (purple) | **Purple appears ONLY on the agent's reasoning/AI chrome** ([CLAUDE.md M4](../../CLAUDE.md)). Diffs, tool I/O, approvals, and buttons are **not** purple. |
| Risk / gated | `--warning` (gated/destructive-preview), `--critical` (failed) | dot+icon+text. |
| Success / verify | `--success`, `--primary` | resolved + verifying. |
| State pills, budget | semantic tokens per [§3](#3-states-the-fixsession-state-machine-on-screen) | no raw hex; add a token before inlining ([CLAUDE.md M1](../../CLAUDE.md)). |

Net: **Guided fix reads as blue, with a purple reasoning inset.** [Fix with AI](06-fix-with-ai-ux.md) inverts this — purple-dominant — which is exactly how a user tells the two features apart at a glance.

---

## 9. Cross-references

- Contract, canonical interfaces, layout, decisions: [Fix Engine 01 — architecture](01-architecture.md)
- Provider/model abstraction, per-task model selection, Mock provider: [Fix Engine 02 — providers & models](02-providers-and-models.md)
- Tool catalog (RemediationAction→Tool mapping, read/diagnostic tools, `ScriptArtifact`s, backends): [Fix Engine 03 — tool catalog](03-tool-catalog.md)
- Agent loop, `FixSession` state machine, budget, halt conditions, `FixClient`: [Fix Engine 04 — agent loop & sessions](04-agent-loop-and-sessions.md)
- The autonomous purple sibling: [Fix Engine 06 — Fix-with-AI UX](06-fix-with-ai-ux.md)
- Host surfaces (RemediationPanel rail, signature flow, Run detail): [09 — page specs §4](../09-page-specs.md#4-incident-detail), [§7.4](../09-page-specs.md#74-the-signature-troubleshooting-flow-concrete), [§13](../09-page-specs.md#13-run-detail)
- Component basis (RemediationPanel, ApplyScopeControl, StatusBadge, MonoLabel, DataTable): [10 — component inventory](../10-component-inventory.md)
- We/You, fix classification, apply once/all/always: [00 — vision & scope §3](../00-vision-and-scope.md), [07 — automation engine](../07-troubleshooting-and-automation-engine.md)
- Failure modes → suggested fixes: [02 — failure catalog](../02-failure-catalog.md)
- Tokens, status system, AI/purple rule: [03 — design system](../03-design-system.md); mandates: [CLAUDE.md](../../CLAUDE.md)
