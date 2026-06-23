# Fix-Engine — Harness Architecture

The standalone `fix-engine` package that runs the AI remediation harness: a real, provider-flexible tool-calling LLM loop that reasons over real failure evidence and drives **simulated** execution targets. Defines the package layout, the `FixSession` agent-loop state machine, budgets and halt conditions, the transcript model, how runs persist as `ActionRun` + `AuditLogEntry`, the local HTTP+SSE API, the CLI, fleet sharing with the app, determinism, and safety.
Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md).

---

## 0. How to read this doc

This is the **harness** doc — the runtime that powers the two AI features the spec set introduces (**Guided fix**, blue; **Fix with AI**, purple). It is the architecture spine; the sibling docs detail the pieces:

- **02 — providers & models** — the `ModelProvider` adapters (Anthropic / OpenAI-compatible / Google / Local / Mock) and per-session/per-task model selection.
- **03 — tools & execution backends** — the AI-callable `Tool` catalog (wrapping the [RemediationActions](../06-data-model-and-mock-data.md#7-remediation--automation-schemas)) and the per-asset-class simulated `ExecutionBackend`s.
- **04 — front-end integration** — `FixClient`, the in-browser simulated path, and the `GuidedFixPanel` / `AiFixConsole` organisms.

It builds directly on the existing model: the [domain model](../05-domain-model.md) (entities), the [data model](../06-data-model-and-mock-data.md) (wire schemas + the seeded fleet), the [troubleshooting & automation engine](../07-troubleshooting-and-automation-engine.md) (action scope, chains, approvals, audit), and the [failure catalog](../02-failure-catalog.md) (the evidence the loop reasons over). Where this doc and those conflict on a shared type, **reuse the existing type** — the harness never redefines `ProtectedAsset`, `Issue`, `ActionRun`, `AuditLogEntry`, etc.

**The four locked decisions this doc realizes** (do not relitigate):

1. **Real loop, simulated targets.** A genuine tool-calling LLM loop decides fixes; the assets it acts on are simulated executors returning realistic stdout/exit + a state diff. No real machines.
2. **Standalone `fix-engine/` package** (Node + TS): a CLI **and** a local HTTP/SSE API. The Next.js app stays a static export and reaches the engine through one `FixClient` seam — live (SSE) or offline (in-browser simulation).
3. **Provider-flexible, mock always on.** Five providers; model selectable per session **and** per task.
4. **Real script artifacts, simulated execution.** Tools emit real PowerShell / bash / Python / HTTP artifacts; the executor returns believable output + a before/after diff. Everything supports dry-run; gated actions hit approval gates; the loop is bounded and honors halt conditions.

> **Mandate note.** The `fix-engine` package is Node/TS and is **not** bound by the CLAUDE.md token rules (those govern UI). It must instead be clean, fully typed, and tested. The front-end surfaces it drives **do** obey every mandate — tokens-only, a story per component, status never color-only, **purple reserved for the AI surface**, AA contrast, realistic Datto/Kaseya mock data, no competitor names.

---

## 1. Package layout (canonical tree)

The engine lives **outside** `src/` with its own `package.json` + `tsconfig`, and reuses the app's domain types and seeded fleet as a single source of truth.

```
fix-engine/                      # standalone Node+TS harness (NOT under src/)
├─ src/
│  ├─ loop/         # the agent loop / FixSession state machine, budget, halt conditions, transcript
│  ├─ providers/    # ModelProvider adapters: anthropic, openai, google, local, mock
│  ├─ tools/        # AI-callable tools (ToolSpec + ToolHandler) — wrap RemediationActions + diagnostics
│  ├─ backends/     # ExecutionBackend per asset class (simulated executors)
│  ├─ prompts/      # system prompts, tool-use guidance, per-feature prompt templates
│  ├─ server/       # local HTTP + SSE API (POST /sessions, GET /sessions/:id/stream …)
│  ├─ cli/          # `fix-engine` CLI
│  └─ shared/       # imports domain types + the seeded fleet from the app (single source of truth)
├─ package.json     # own deps (no React, no Next, no Tailwind)
└─ tsconfig.json    # path alias to the app's @/types + @/mock; reuses the seeded fleet as target

src/ (front-end integration — detailed in 04)
├─ lib/fix-client/  # FixClient: talks to fix-engine over SSE (live) OR the simulated path (offline)
├─ lib/fix-sim/     # the deterministic in-browser simulated fix path (mirrors the engine's behavior)
└─ components/organisms/fix/  # GuidedFixPanel, AiFixConsole, FixTranscriptView, ModelPicker, ToolCallCard…
```

### 1.1 `loop/` (this doc's subject)

| Module | Responsibility |
|---|---|
| `session.ts` | `FixSession` factory + the state machine transitions (§3). |
| `runner.ts` | The orchestration loop: drives provider chat ↔ tool calls ↔ verification until terminal. |
| `budget.ts` | `FixBudget` accounting + halt-condition evaluation (§4). |
| `transcript.ts` | `FixTranscriptTurn` append + SSE event projection (§5). |
| `persistence.ts` | Maps loop events to `ActionRun` + `AuditLogEntry` records (§6). |
| `redaction.ts` | Secret scrubbing on everything leaving the loop (§9.6). |
| `store.ts` | In-memory `Map<sessionId, FixSession>` registry (engine is single-process; no DB). |

### 1.2 The `shared/` seam — one fleet, two consumers

`shared/` re-exports the app's `@/types` and the **already-seeded** `@/mock` fixtures (the deterministic `DB` from [data-model §9](../06-data-model-and-mock-data.md#9-mock-data-generation-plan)). The engine never re-seeds; it reads the same `SEED`/`NOW`-derived dataset the browser renders, so **what the user sees and what the agent acts on always agree**. Tools mutate target assets through the same `lib/mock/runner.ts` outcome model the manual action cart uses (§11 of the data model) — the AI path is just another `triggeredBy` source.

```ts
// fix-engine/src/shared/fleet.ts
import { DB } from "@/mock/fixtures";          // the seeded, cached dataset (single source of truth)
import type { ProtectedAsset, Issue, AssetId } from "@/types";

export const getAsset  = (id: AssetId): ProtectedAsset | undefined => DB.assetsById.get(id);
export const getIssue  = (assetId: AssetId, issueId?: string): Issue | undefined => /* … */;
export const getFleet  = () => DB.assets;       // read-only view the agent reasons over
```

> `Issue` here is the resolved view a fix targets: the asset's `primaryFailureModeId` plus its open `Alert`/`BackupRun` evidence (`07` calls this the troubleshoot context). The harness passes it to the loop as the thing to be fixed.

---

## 2. Core types (canonical — used verbatim across the spec set)

The harness types below are **normative**. Domain types (`AssetKind`, `ProductType`, `ProtectedAsset`, `Issue`, `ActionScope`, `RemediationActionId`, `ActionRunId`, `ISODateTime`) come from the app's `@/types` — reused, never redefined.

```ts
// ── The agent loop / session ──────────────────────────────────────────────
type FixMode  = "guided" | "ai";
type FixState = "triaging" | "planning" | "awaiting-approval" | "executing"
  | "verifying" | "succeeded" | "partial" | "failed" | "escalated" | "halted";

interface FixBudget   { maxSteps: number; maxToolCalls: number; maxTokens: number; maxWallMs: number; }
interface FixPlanStep { id: string; intent: string; toolName: string; input: unknown;
  actor: "we" | "you"; risk: ToolRisk; requiresApproval: boolean; }
interface FixPlan      { summary: string; steps: FixPlanStep[]; rationale: string; confidencePct: number; }

interface FixTranscriptTurn { at: ISODateTime;
  kind: "model" | "tool_call" | "tool_result" | "observation" | "approval" | "verification" | "status";
  text?: string; toolCall?: { name: string; input: unknown }; toolResult?: ToolResult; }

interface FixSession {
  id: string; mode: FixMode; assetId: AssetId; issueId?: string;
  model: { provider: ProviderId; model: string }; scope: ActionScope; state: FixState;
  budget: FixBudget; plan?: FixPlan; transcript: FixTranscriptTurn[];
  result?: { healed: boolean; summary: string; actionRunIds: ActionRunId[]; ticketRef?: string };
}
```

`ProviderId`, `ToolRisk`, and `ToolResult` are defined in the providers (02) and tools (03) docs; `StateDiff` lives with the backends (03). The full contract interface set is the single authority — these specs use the names exactly.

---

## 3. The `FixSession` agent loop — state machine

A `FixSession` is one remediation attempt against one asset/issue with one (default) model and a fixed budget. The loop runs **the same states for both modes**; the only difference is *where it pauses for a human* (see §3.4).

### 3.1 States

| `FixState` | Meaning | Entered from | Terminal? |
|---|---|---|---|
| `triaging` | Agent gathers evidence by calling **read** tools (`risk:"read"`) — logs, comms, chain, pool, OAuth grant. | session start | no |
| `planning` | Model proposes a `FixPlan` (ordered `FixPlanStep[]`, rationale, confidence). | `triaging`, or `verifying` re-loop | no |
| `awaiting-approval` | A gated step (`requiresApproval`) or any `you`/destructive step is paused for human decision. | `planning` / per-step gate | no |
| `executing` | The current step runs: **preview (dry-run)** → **execute** through its `ExecutionBackend`. | `planning`, `awaiting-approval` (approved) | no |
| `verifying` | A read/diagnostic tool is re-run to confirm the symptom cleared (the asset moved toward `protected`). | `executing` (observed) | no |
| `succeeded` | All plan steps done; verification confirms the issue is healed. | `verifying` | **yes** |
| `partial` | Some steps healed their target, others did not (batch / multi-symptom). | `verifying` | **yes** |
| `failed` | The plan executed but verification still shows the symptom; no further plan helps. | `verifying`, `planning` | **yes** |
| `escalated` | The agent cannot fix in scope; it assembles a support package / asks the human and opens a ticket ref. | any non-terminal | **yes** |
| `halted` | A budget cap, a repeated-failure guard, or a refused approval stopped the loop early. | any non-terminal | **yes** |

### 3.2 The canonical transition diagram

```
                         ┌─────────────────────────────────────────────────────────────┐
                         │                        FixSession                            │
                         └─────────────────────────────────────────────────────────────┘
                                                    │ createSession()
                                                    ▼
                                            ┌───────────────┐
                                            │   triaging    │  read-tools gather evidence
                                            └───────┬───────┘
                                                    │ evidence sufficient
                                                    ▼
                              ┌───────────────►┌───────────────┐
                  re-plan     │                │   planning    │  model proposes FixPlan
              (verify failed, │                └───────┬───────┘
               budget left)   │                        │ next step
                              │           ┌────────────┴────────────┐
                              │           │ gated? (requiresApproval │
                              │           │  ∨ you-step ∨ destructive)│
                              │      yes  ▼                          ▼ no
                              │   ┌──────────────────┐               │
                              │   │ awaiting-approval │               │
                              │   └───┬───────────┬──┘               │
                              │ reject│           │approve            │
                              │       ▼           └─────────┬─────────┘
                              │  ┌──────────┐               ▼
                              │  │  halted  │        ┌───────────────┐
                              │  └──────────┘        │   executing   │  preview(dry-run) → execute
                              │   (refused)          └───────┬───────┘
                              │                              │ ExecResult / ToolResult
                              │                              ▼  (observe)
                              │                      ┌───────────────┐
                              └──────────────────────│   verifying   │  re-run read tool: symptom cleared?
                                                     └───┬───────┬───┘
                                  more steps / re-plan   │       │ all steps done
                                                         │       ▼
                                                         │   ┌──────────────────────────────┐
                                                         │   │ succeeded │ partial │ failed  │ (terminal)
                                                         │   └──────────────────────────────┘
                                                         │
                          can't fix in scope ──────────►┌──────────┐
                                                         │escalated │ (assemble support pkg / ask human)
                                                         └──────────┘
   budget/halt-guard at every non-terminal state ───────►┌──────────┐
                                                          │  halted  │
                                                          └──────────┘
```

### 3.3 The per-step micro-cycle (inside `executing` → `verifying`)

Each `FixPlanStep` runs the contract's canonical sequence:

```
awaiting-approval (if gated) → preview (dry-run diff) → execute → observe (tool result) → verify
```

1. **Approval gate.** If `step.requiresApproval` (or it is a `you` step, or its tool's `risk` is `destructive`/`safe-write` over threshold), transition to `awaiting-approval` and emit an `ApprovalRequest` carrying a **blast-radius preview** from the dry-run. The loop blocks until `approve(sessionId, stepId, decision)`.
2. **Preview (dry-run).** Call the tool's `preview(input, ctx)` (`ctx.dryRun = true`) → a `ToolResult` with a `StateDiff` and **no mutation**. This is the diff the human approves and the agent inspects.
3. **Execute.** Call `run(input, ctx)` (`ctx.dryRun = false`) → the matching `ExecutionBackend` runs the real `ScriptArtifact` against the simulated target and returns `ExecResult` (`exitCode`, `stdout`, `stderr`, `durationMs`, `diff`).
4. **Observe.** Append `tool_call` + `tool_result` turns; feed the `ToolResult` back to the model as a `{ role: "tool" }` message so it reasons over the outcome.
5. **Verify.** Re-run a read/diagnostic tool (often the same one used in `triaging`) to confirm the symptom cleared — the asset facet moved toward `protected` and the originating alert is `auto-resolved`. Append a `verification` turn. If healed and more steps remain, advance; if healed and none remain, `succeeded`; if not healed, re-plan (budget permitting) or go `failed`/`escalated`.

### 3.4 Mode differences (one machine, two pause policies)

| | **Guided fix** (blue) | **Fix with AI** (purple) |
|---|---|---|
| `you` steps | **Pauses on every one** — walks the human through the manual step, waits for "done". | Pauses (agent cannot perform manual steps); surfaces the instruction and waits. |
| Gated `we` steps | Approval gate, as configured. | Approval gate, as configured. |
| Ungated `we` steps | Runs, but **step-by-step** with a visible continue affordance between steps. | Runs **autonomously**, streaming reasoning and tool calls without pausing. |
| Re-planning | Surfaced to the human for confirmation before re-executing. | Autonomous within budget. |
| Default surface | Step-by-step panel (`GuidedFixPanel`). | Streaming console (`AiFixConsole`, purple AI register). |

Both extend the existing **We/You + apply once/all/always** model ([00 §3](../00-vision-and-scope.md), [07](../07-troubleshooting-and-automation-engine.md)): `session.scope` (`once` | `all-matching` | `always`) determines whether a healed fix is offered to be saved as a Playbook or crystallized into an `AutomationPolicy` on completion.

### 3.5 State machine, in code

```ts
// fix-engine/src/loop/runner.ts (shape)
async function runSession(s: FixSession, deps: LoopDeps): Promise<FixSession> {
  transition(s, "triaging");
  await gatherEvidence(s, deps);                 // read-tools only; appends transcript turns

  while (!isTerminal(s.state)) {
    if (deps.budget.exhausted(s)) return halt(s, "budget-exhausted");

    transition(s, "planning");
    s.plan = await proposePlan(s, deps);         // model → FixPlan
    if (!s.plan.steps.length) return escalate(s, "no-viable-plan");

    for (const step of s.plan.steps) {
      if (needsApproval(step, s)) {
        transition(s, "awaiting-approval");
        const decision = await deps.approvals.wait(s.id, step.id);   // blocks
        if (decision === "reject") return halt(s, "approval-refused");
      }
      transition(s, "executing");
      const preview = await deps.tools.preview(step, s);             // dry-run diff
      const result  = await deps.tools.execute(step, s);            // real artifact, sim target
      observe(s, step, preview, result);

      transition(s, "verifying");
      const healed = await deps.verify(step, s);                    // re-run read tool
      if (!healed && deps.repeatGuard.tripped(s, step)) return halt(s, "repeated-failure");
    }

    const outcome = await deps.verify.overall(s);                   // succeeded | partial | failed
    if (outcome !== "needs-replan") return finalize(s, outcome);
    // else loop: planning again with the new evidence (budget permitting)
  }
  return s;
}
```

---

## 4. `FixBudget` + halt conditions

Every session is **bounded** so a misbehaving loop can never run away (cost, time, or thrash). The budget is set at `createSession` from a per-mode default, overridable by the caller within hard ceilings.

```ts
interface FixBudget { maxSteps: number; maxToolCalls: number; maxTokens: number; maxWallMs: number; }
```

### 4.1 Defaults & ceilings

| Field | Guided default | AI default | Hard ceiling | Counts |
|---|---|---|---|---|
| `maxSteps` | 6 | 8 | 20 | plan steps executed (across re-plans) |
| `maxToolCalls` | 12 | 20 | 60 | every tool invocation incl. read + dry-run + execute + verify |
| `maxTokens` | 60_000 | 120_000 | 400_000 | summed provider input+output tokens (from `usage` events) |
| `maxWallMs` | 120_000 | 180_000 | 600_000 | wall-clock from session start |

The Mock provider's deterministic runs sit well under these so demos never halt on budget.

### 4.2 Halt conditions (→ `halted`)

The loop checks these at the top of every state transition; tripping any moves to `halted` with a recorded `haltReason` and writes a closing `AuditLogEntry`:

| Halt reason | Trigger |
|---|---|
| `budget-steps` / `budget-tools` / `budget-tokens` / `budget-wall` | The corresponding `FixBudget` cap reached. |
| `repeated-failure` | The **repeat guard**: the same `toolName`+target failed (or verification failed for the same symptom) **≥ 2** times. Prevents retry loops. |
| `no-progress` | Two consecutive `verifying` cycles with an **identical `StateDiff`** (the fix changed nothing). |
| `approval-refused` | A human rejected a required approval and no alternative plan step exists. |
| `provider-error` | Unrecoverable `ChatEvent{type:"error"}` (auth, rate-limit after retry, context overflow). |
| `aborted` | `abort(sessionId)` called (`AbortSignal` propagated to the provider + backend). |
| `scope-violation` | The model attempted a tool whose `appliesToKinds`/`productTypes`/scope does not match the target (guard rejects; see §9.2). |

`halted` is distinct from `failed`: `failed` means "we tried a complete plan and the symptom persists"; `halted` means "we stopped before finishing." Both are terminal and both surface a clear reason + a one-click **escalate** affordance.

---

## 5. The `FixTranscript` model

The transcript is the session's **append-only event log** — the substance of the streaming console and the audit story. Each turn is one `FixTranscriptTurn`.

```ts
interface FixTranscriptTurn { at: ISODateTime;
  kind: "model" | "tool_call" | "tool_result" | "observation" | "approval" | "verification" | "status";
  text?: string; toolCall?: { name: string; input: unknown }; toolResult?: ToolResult; }
```

### 5.1 Turn kinds → what the UI renders

| `kind` | Produced when | Carries | Rendered as |
|---|---|---|---|
| `status` | Any `FixState` transition. | `text` = new state + reason. | A state chip in the timeline (purple for AI surface, blue for guided). |
| `model` | Streamed assistant text (reasoning, plan narration). | `text` (accumulated from `ChatEvent{type:"text"}` deltas). | A reasoning bubble. |
| `tool_call` | Model emits `ChatEvent{type:"tool_call"}`. | `toolCall.{name,input}`. | A `ToolCallCard` (tool name, risk pill, args, the `ScriptArtifact`). |
| `tool_result` | A tool returns. | `toolResult` (`ok`, `summary`, `output`, `diff`). | The card expands: console `output` + a before/after `StateDiff` table. |
| `observation` | The agent's reflection on a result, fed back into context. | `text`. | Reasoning bubble (muted). |
| `approval` | An `ApprovalRequest` opens / is decided. | `text` = blast-radius preview + decision. | The approval gate component (blocking in guided, inline in AI). |
| `verification` | A verify cycle resolves. | `text` + (optional) `toolResult` of the re-run read tool. | A pass/fail verification row (dot + icon + label — never color-only). |

### 5.2 Streaming & projection

The transcript is the canonical store; the SSE stream (§7) is a **projection** of newly-appended turns plus lifecycle events. Model text arrives as deltas; the loop coalesces them into a single `model` turn so reconnects replay clean turns rather than partial tokens. The transcript is **bounded** — beyond a cap (default 500 turns) older `model`/`observation` turns are summarized and collapsed, but every `tool_call`/`tool_result`/`approval`/`verification`/`status` turn is retained (they are the audit-relevant ones).

---

## 6. How runs persist — `ActionRun` + `AuditLogEntry`

AI fixes must be **indistinguishable in history** from manual ones: they appear in Run history and the Audit log exactly like a fix dispatched from the action cart. The loop reuses the existing entities verbatim — [domain model §6](../05-domain-model.md#6-remediation--automation-entities) and [data model §7 + §11](../06-data-model-and-mock-data.md#7-remediation--automation-schemas).

### 6.1 Every executed step writes an `ActionRun`

When a `FixPlanStep` whose tool has an `actionId` executes, the loop creates one `ActionRun` (via the same `lib/mock/runner.ts` outcome model the cart uses), with the AI session as the trigger:

```ts
const run: ActionRun = {
  id: nextActionRunId(),
  actionId: step.toolSpec.actionId!,                 // tool ↔ catalog action (1:1 where mapped)
  triggeredBy: { kind: "ai", refId: session.id },    // NEW source value: "ai" (see §6.3)
  scope: session.scope,                              // once | all-matching | always
  targetRefs: [{ type: "asset", id: session.assetId }],
  paramsUsed: step.input as Record<string, unknown>,
  state: toActionRunState(toolResult),               // succeeded | partial | failed | awaiting-approval
  dryRun: false,
  approvalRequestId: step.approvalRequestId,
  startedAt: ctx.startedAt, finishedAt: nowIso(),
  resultSummary: toolResult.summary,                 // "Re-paired 7 of 7 agents", mono-rich
  auditLogEntryIds: [],                              // filled below
};
```

The session's `result.actionRunIds` collects these so the AI Fix console links straight into Run history. Dry-run previews do **not** create `ActionRun`s (matching the data-model rule: preview = blast-radius only, no audit `outcome`).

### 6.2 Every meaningful transition writes an `AuditLogEntry`

The append-only audit log captures the loop's lifecycle so "who fixed what, when, and on whose approval" holds for AI fixes too:

| Loop event | `AuditVerb` | `actor.kind` | `detail` example |
|---|---|---|---|
| Session created | `ran-action` (opening) | `system` | "AI fix session FIX-9F2C started for AST-WIN-DC01 (model: claude · sonnet)" |
| Step executed | `ran-action` | `system` (refId = session) | "Repaired agent communications on ACME-DC01 (exit 0)" |
| Approval requested/decided | `approved` / `rejected` | `user` | "Approved force-merge on 9 agents (blast radius 9)" |
| Verification cleared symptom | `ran-action` (outcome: succeeded) | `system` | "Verified: VSS writers healthy; ALR-44210 auto-resolved" |
| Escalated | `overrode` / `ran-action` (opens-ticket) | `system` | "Assembled support package; opened DAT-TKT-88213" |
| Halted | `ran-action` (outcome: failed) | `system` | "Halted: budget-tokens after 8 steps" |
| Policy saved from `always` scope | `enabled-policy` | `user` | "Created AutomationPolicy from AI fix (apply always)" |

Each `AuditLogEntry` carries `before`/`after` from the step's `StateDiff` (config-change diffs), `scope` from the session, and `subjectRef` to the asset/run. `ActionRun.auditLogEntryIds` back-links them.

### 6.3 The one schema addition the harness needs

`ActionRun.triggeredBy.kind` and `AuditLogEntry.actor.kind` currently enumerate `user | playbook | policy` and `user | policy | system`. The harness needs to attribute work to the agent. **Recommendation:** add `"ai"` as a `triggeredBy.kind` value and reuse `actor.kind:"system"` (with `refId` = session id) for audit, OR add `"ai"` to both. This is the only model change; it is additive and back-compatible. Flagged in open questions for [data model §14](../06-data-model-and-mock-data.md#14-open-decisions--notes-for-downstream-docs) to own the enum edit so two docs don't define competing values.

---

## 7. Local HTTP + SSE API surface

The engine exposes a small local API (default `http://127.0.0.1:8787`, surfaced to the app as `NEXT_PUBLIC_FIX_ENGINE_URL`). It is **localhost-only, single-MSP, no auth** in this phase (front-end mock; the engine runs on the demoer's machine). All bodies are JSON; the stream is `text/event-stream`.

| Method | Path | Purpose | Body / Returns |
|---|---|---|---|
| `POST` | `/sessions` | Create + start a session. | Body: `{ assetId, issueId?, mode, model, scope, budget? }` → `FixSession` (initial). |
| `GET` | `/sessions/:id/stream` | **SSE** stream of session events. | `event:` per `FixSessionEvent`; replays prior turns on connect, then live. |
| `POST` | `/sessions/:id/approve` | Decide a pending approval gate. | Body: `{ stepId, decision: "approve" \| "reject", note? }` → `204`. |
| `POST` | `/sessions/:id/abort` | Abort a running session. | `204`; propagates `AbortSignal` to provider + backend; loop → `halted{aborted}`. |
| `GET` | `/sessions/:id` | Fetch the current `FixSession` snapshot (non-stream). | `FixSession`. |
| `GET` | `/models` | List available models across configured providers. | `{ providers: { id: ProviderId; label: string; models: ModelInfo[]; available: boolean }[] }` (02). |
| `GET` | `/healthz` | Liveness + which providers have credentials. | `{ ok: true; providers: Record<ProviderId, "ready" \| "unconfigured"> }`. |

### 7.1 SSE event shape

`stream` emits the `FixSessionEvent` union (the wire form the `FixClient` yields, identical for live and simulated paths):

```ts
type FixSessionEvent =
  | { type: "state";    state: FixState; reason?: string }     // ← from a `status` transcript turn
  | { type: "turn";     turn: FixTranscriptTurn }              // any appended turn (model/tool/verify…)
  | { type: "plan";     plan: FixPlan }                        // a FixPlan was proposed
  | { type: "approval"; request: { stepId: string; preview: string; risk: ToolRisk } } // gate opened
  | { type: "usage";    inputTokens: number; outputTokens: number; budget: FixBudget } // running totals
  | { type: "result";   result: NonNullable<FixSession["result"]> }  // terminal
  | { type: "error";    message: string };
```

```
# wire example
event: state
data: {"type":"state","state":"triaging"}

event: turn
data: {"type":"turn","turn":{"at":"2026-06-22T09:00:03Z","kind":"tool_call","toolCall":{"name":"get_agent_comms","input":{"assetId":"AST-WIN-DC01"}}}}

event: approval
data: {"type":"approval","request":{"stepId":"s2","preview":"force-merge on 9 agents (blast radius 9)","risk":"destructive"}}
```

On reconnect the server replays the full transcript as `turn` events (idempotent by `at`+`kind`) then resumes live — so a dropped connection never loses the story. The `FixClient.stream()` generator (04) consumes this for the live path and yields the **same** `FixSessionEvent`s from `lib/fix-sim` for the offline path, so the UI is path-agnostic.

---

## 8. The CLI

`fix-engine` ships a CLI for headless demos, scripted reproduction, and CI. It drives the same loop the server does.

```bash
# Run a fix against a seeded asset, autonomous AI mode, deterministic mock provider
fix-engine fix --asset AST-WIN-DC01 --mode ai --provider mock --model mock-default --scope once

# Guided mode against a SaaS reauth issue, capable hosted model, auto-approve gates (demo only)
fix-engine fix --asset SEAT-mhayes@contoso --issue saasp-ews-to-graph-reauth \
  --mode guided --provider anthropic --model claude-sonnet --yes

# Per-task model split: cheap local model for triage, hosted for planning
fix-engine fix --asset AST-VM-SQL02 --triage-model local:gemma-4 --plan-model anthropic:claude-sonnet

# Inspect a transcript / replay a recorded session
fix-engine replay --session FIX-9F2C --format pretty
fix-engine models                      # list configured providers + models
fix-engine serve --port 8787           # start the HTTP+SSE server (same as the app uses)
```

| Command | Purpose |
|---|---|
| `fix` | Run one session to terminal; streams the transcript to stdout (`--json` for machine output). |
| `replay` | Re-render a saved transcript (sessions optionally written to `./.fix-runs/`). |
| `models` | Enumerate providers + models + availability. |
| `serve` | Boot the HTTP+SSE server. |
| `eval` | Run a fixture of `{asset, issue, expected}` cases against the **mock** provider and assert determinism (CI gate). |

Flags: `--provider/--model` (session default), `--triage-model/--plan-model/--verify-model` (per-task override), `--mode`, `--scope`, `--budget-steps/--budget-tokens/...`, `--dry-run` (preview only, never executes), `--yes` (auto-approve gates — **demo/CI only**, never a server default), `--seed` (passes through to the shared fleet for reproducibility).

---

## 9. Determinism, sharing, and safety

### 9.1 Single source of truth for the fleet

The engine imports the app's already-seeded `DB` (data-model §9). It does **not** maintain its own copy and does **not** re-seed. When the app and a live engine run together, both read the same `SEED`/`NOW`-derived dataset; tool mutations go through the same `lib/mock/runner.ts` outcome model, so a fix the agent performs is the same mutation the manual cart would perform — and the app's stores observe it identically.

> **Cross-process note.** In the live demo the engine is a separate Node process from the browser, so they hold separate in-memory copies of the (identical, deterministic) `DB`. The agent's mutation is reflected to the app via the SSE `result`/`turn` events (the app applies the same outcome locally), not via shared memory. The offline path has no such split — `lib/fix-sim` mutates the browser's own `DB` directly. Reconciling "live engine mutated my fleet" into the app's Zustand stores is detailed in 04.

### 9.2 Determinism for demos

- **Mock provider** (always available) returns a **scripted, seeded** `ChatEvent` sequence per `{assetId, issueId}` — same input → byte-identical transcript, plan, and tool calls. This backs every screenshot, Storybook snapshot, and the `eval` CI gate.
- **Simulated backends** derive `ExecResult` deterministically from the target's failure mode + a per-step PRNG draw (namespaced like the data-model generators), so even "partial" outcomes are reproducible (e.g. "re-paired 7 of 9" is always the same 7).
- **Frozen time.** The loop stamps turns from the shared `NOW` epoch in deterministic mode (a `--live-clock` flag uses real time for non-demo runs).
- Real hosted providers are inherently non-deterministic; demos and tests default to `mock`. A `temperature: 0` is requested from real providers to minimize drift, but the **only** guaranteed-stable path is `mock`.

### 9.3 Approval gates (human-in-the-loop where it matters)

The loop never executes a `destructive` tool, a `you` step, or an over-threshold `safe-write` (blast radius > the action's `ApprovalRule` threshold) without an `ApprovalRequest` decision. Guided mode additionally gates **every** `you` step. The gate carries the dry-run blast-radius preview so the approver sees exactly what will change. A refused approval with no alternative → `halted{approval-refused}`, never a silent override.

### 9.4 Scope enforcement

Before any tool runs, the loop validates the call against the target: `tool.appliesToKinds` ⊇ `asset.kind`, `tool.productTypes` ⊇ `asset.productType`, and the resolved target set is within `session.scope` (`once` = this asset only; `all-matching`/`always` widen only via an explicit, approved filter). A model attempt outside scope is rejected at the guard (not sent to the backend) and recorded as `scope-violation` → `halted`. The system prompt declares the asset, its kind/product, and the allowed tool set so the model plans in-scope.

### 9.5 Dry-run, idempotency, rollback/compensation

- **Dry-run / preview** is mandatory on every step before execute (§3.3) and returns a `StateDiff` with no mutation. The CLI `--dry-run` and the data-model "preview impact" rule share this path.
- **Idempotency.** Read tools are pure. Write tools are designed idempotent where the underlying action allows (re-running `repair-agent-comms` on an already-paired agent is a no-op that returns `healed:true`). The repeat guard (§4.2) catches the rest.
- **Rollback / compensation.** Reversible actions (`reversible:true` in the catalog) expose a compensation in their `ToolHandler`; on a `failed`/`halted` terminal after a partial mutation, the loop offers (guided) or runs (AI, if itself reversible and ungated) the compensation, writing an `ActionRun{state:"rolled-back"}` + audit entry. Irreversible actions (`reversible:false` — failback, unseat-delete) are **always** gated and never auto-run; their compensation is "escalate to support," not an automated undo.

### 9.6 Redaction of secrets

Everything leaving the loop — transcript turns, SSE events, `ScriptArtifact.source`, `ExecResult.stdout/stderr`, audit `detail` — passes through `loop/redaction.ts`, which masks credentials and tokens before they are persisted or streamed:

- OAuth bearer/refresh tokens, `AADSTS` token blobs, client secrets, passphrases, API keys, connection strings, and the encryption passphrases used by `unseal-decrypt`.
- Provider API keys are read from env (`ANTHROPIC_API_KEY`, etc.) and **never** appear in any artifact, log, or stream.
- Pattern-based masking (`Bearer ********`, `pass=********`) keeps artifacts realistic and copy-pasteable as runbooks while leaking nothing. Mock data already uses fake credentials; redaction guarantees real-provider runs do too.

---

## 10. End-to-end example (one AI fix)

A concrete pass over the seeded VSS-writer failure on `AST-WIN-DC01` ([data-model §13.1](../06-data-model-and-mock-data.md#131-agentasset-a-real-failing-bcdr-agent--vss-writer-failure)):

```
POST /sessions { assetId:"AST-WIN-DC01", issueId:"vss-writer-snapshot-failure",
                 mode:"ai", model:{provider:"mock",model:"mock-default"}, scope:"once" }
 → FixSession { id:"FIX-9F2C", state:"triaging" }

state:triaging   tool_call get_vss_writers(AST-WIN-DC01)
                 tool_result { ok:true, output:"SqlServerWriter: FAILED (0x80042315)…" }
                 tool_call read_event_log(AST-WIN-DC01, source:"VSS")
                 tool_result { ok:true, output:"Event 8229: writer timed out…" }
state:planning   plan { summary:"Restart VSS + SQL writer, re-run snapshot, verify",
                        steps:[ {restart_vss_writers, we, safe-write, approval:false},
                                {run_backup_now,      we, safe-write, approval:false} ],
                        confidencePct:82 }
state:executing  preview(restart_vss_writers) → diff { before:{vssStatus:"writer-failed"},
                                                        after:{vssStatus:"healthy"} }
                 execute(restart_vss_writers) [agent-windows / PowerShell] → exit 0
state:verifying  tool_call get_vss_writers → "SqlServerWriter: STABLE" → healed
state:executing  execute(run_backup_now) → exit 0, RP-… produced (application-consistent)
state:verifying  symptom cleared; ALR-44210 auto-resolved
state:succeeded  result { healed:true, summary:"VSS writers healthy; application-consistent backup",
                          actionRunIds:["ACT-A1","ACT-A2"] }
```

Two `ActionRun`s (`triggeredBy:{kind:"ai",refId:"FIX-9F2C"}`), one auto-resolved alert, and a chain of `AuditLogEntry`s — all identical in shape to a manual cart fix, all visible in Run history and Audit.

---

## 11. Cross-references

- [00 vision & scope](../00-vision-and-scope.md) — We/You, apply once/all/always, fix classification, AI surface.
- [02 failure catalog](../02-failure-catalog.md) — the evidence and failure modes the loop reasons over.
- [05 domain model §6](../05-domain-model.md#6-remediation--automation-entities) — `ActionRun`, `AuditLogEntry`, approvals, scope.
- [06 data model §7, §11, §14](../06-data-model-and-mock-data.md) — wire schemas, the simulated runner outcome model, the `triggeredBy:"ai"` enum edit.
- [07 troubleshooting & automation engine](../07-troubleshooting-and-automation-engine.md) — chains, playbooks, scope, approvals the harness reuses.
- **fix-engine 02** — providers & models · **fix-engine 03** — tools & execution backends · **fix-engine 04** — front-end integration (`FixClient`, sim path, AI organisms).

---

## 12. Open decisions (flagged for sibling docs)

- **`triggeredBy` / `actor` enum edit** (§6.3). Adding `"ai"` is the only schema change the harness needs; [data model §14](../06-data-model-and-mock-data.md#14-open-decisions--notes-for-downstream-docs) should own the exact enum so docs don't diverge. Recommendation: add `"ai"` to `ActionRun.triggeredBy.kind` and to `AuditLogEntry.actor.kind`.
- **Live-engine → app fleet reconciliation** (§9.1). Engine and browser are separate processes with separate (identical) `DB` copies; how the app applies the engine's mutation locally on `result`/`turn` events (re-run the same outcome vs. trust the streamed diff) belongs to **fix-engine 04**. Recommendation: stream the `StateDiff` and have the app apply it via the existing `lib/mock/runner.ts`, keeping one mutation path.
- **Session persistence beyond memory.** The engine keeps sessions in an in-memory `Map`; should completed sessions persist to `./.fix-runs/` for `replay`/audit across restarts, or is the app's localStorage audit log sufficient? Recommendation: optional JSONL dump for the CLI; the app's audit log remains the product surface.
