# Fix Engine 00 — Overview & Goals (AI-Remediation Harness)

The overview and scope for the **AI-remediation harness** behind the Kaseya Resolution Center's two new fix features — **Guided fix** and **Fix with AI**. This is the entry point to the fix-engine spec sub-set; it states the problem, the locked decisions, the POC scope, non-goals, success criteria, and a glossary, then points at the seven companion specs.

Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md). Grounded in the product model ([00-vision-and-scope](../00-vision-and-scope.md)) and the automation engine ([07-troubleshooting-and-automation-engine](../07-troubleshooting-and-automation-engine.md)).

---

## 1. The problem

The Resolution Center already turns a wall of red into ranked, explained, fixable issues ([00 §2–§3](../00-vision-and-scope.md)). It also already knows *how* to fix most of them: the automation engine ([07](../07-troubleshooting-and-automation-engine.md)) models ~154 typed `RemediationAction`s with preconditions, dry-run, scope, approval gates, and rollback. The gap is not "can the platform run the fix" — it's **who decides which fix, with which parameters, and clicks the button**.

Look at the failure catalog ([02](../02-failure-catalog.md)): the overwhelming majority of failures are *self-serviceable*. A VSS writer is wedged, an OAuth grant lapsed after an EWS-to-Graph migration, a SIRIS pool crossed 88% and is skipping backups, an agent stopped checking in on port 25568, a Salesforce tenant hit its API call cap. None of these require a vendor. Each requires a human to:

1. **Read the evidence** — the event log, the error string (`stop 0x7B`, `error -255`, `cbtfilter` block), the chain state, the consecutive-failure count;
2. **Interpret it** — map symptom → root cause → the correct remediation (and rule out a known outage);
3. **Choose scope** — this asset, all matching, or always;
4. **Click** — dry-run, review the diff, approve if gated, apply, then verify the symptom actually cleared.

That interpret-and-click loop is exactly what a tool-calling LLM can now do. **An AI can read the same evidence, reason over it, call the same remediation tools, review its own dry-run diff, respect the same approval gates, and verify the result** — turning a self-serviceable failure into an *actually-self-served* one, unattended or human-supervised. The remediation primitives already exist; the harness adds the agent that drives them.

> **Design stance.** The harness does **not** invent a parallel fix mechanism. It is a new *driver* over the existing engine: every fix it runs lands as an `ActionRun` + `AuditLogEntry` ([05](../05-domain-model.md)/[06](../06-data-model-and-mock-data.md)), so an AI fix appears in Run history and Audit identically to a manual one. The agent is held to the same dry-run-first, scope-as-decision, risk-tiered-approval, rollback-declared-up-front contract ([07 §1](../07-troubleshooting-and-automation-engine.md)).

---

## 2. The two features

The harness ships **two** product features. Both sit on the existing fix-classification, the We/You split, and the apply-once/all/always model — they extend that spine rather than replacing it.

### 2.1 Guided fix (blue)

The human-in-the-loop, step-by-step feature. The harness runs the automatable **"We"** steps and walks the tech through the manual **"You"** steps, pausing at every You step and every gated We step for an explicit approval before continuing.

- **Color:** blue — it reuses the **Guided** fix-classification color ([00 §3](../00-vision-and-scope.md)). Guided fix is the interactive surface for `partial`-classification issues (and any issue a tech wants to supervise).
- **Relationship to We/You:** this *is* the We/You runbook, now executed by the engine rather than copy-pasted by the tech. Each runbook step becomes a `FixPlanStep` carrying `actor: "we" | "you"`. We steps map to AI-callable Tools; You steps render instructions plus a "Done / Couldn't" control.
- **Relationship to apply once/all/always:** a Guided fix defaults to `once-this-asset` scope but offers the same **Fix once / Always fix this type** choice on completion ([07 §4](../07-troubleshooting-and-automation-engine.md)) — promoting a successful Guided run to an `always-matching` Policy.
- **`FixMode`:** `"guided"`.

### 2.2 Fix with AI (purple)

The autonomous feature. The agent **triages → plans → executes** the remediation within its scope and approval boundary, **streaming** its reasoning, tool calls, evidence, and verification in real time. When it cannot fix the issue — out of scope, repeated failure, refused approval, budget exhausted — it **escalates**: it assembles a support package (evidence, attempted steps, dry-run diffs, last error) and hands off to the human or opens a ticket reference.

- **Color:** **purple — AI surface only.** Per M4/the design system, purple is reserved exclusively for the AI-assist surface; the Fix-with-AI console, its streaming transcript, and its model picker are the canonical purple surface ([00 §3](../00-vision-and-scope.md), DESIGN.md).
- **Relationship to fix-classification:** Fix-with-AI is offered on `full` and `partial` issues. On `full` (End-to-end) issues it can run start-to-finish unattended; on `partial` it runs the We steps autonomously and escalates the You steps to a human (it cannot, e.g., physically reseat a cable). It is **not** offered on `external`/`manual`/`unknown` (Insights-only) issues — those are vendor/infra/unknown and have no auto-fix path; there the AI surface is the existing **AI insight** explanation only.
- **`FixMode`:** `"ai"`.

### 2.3 How the two relate

Both modes drive the **same** agent loop, the **same** Tools, the **same** `ExecutionBackend`s, and write the **same** `ActionRun`/`AuditLogEntry` records. They differ only in **autonomy and stopping points**, expressed by `FixMode`:

| | Guided fix (`"guided"`, blue) | Fix with AI (`"ai"`, purple) |
|---|---|---|
| Autonomy | Step-by-step, human advances | Autonomous within scope/approval |
| Pauses at | **Every** You step + every gated We step | **Only** approval gates (gated steps) |
| Primary surface | `GuidedFixPanel` | `AiFixConsole` (streaming) |
| Offered on | `partial` (and opt-in on `full`) | `full`, `partial` (We-steps); escalates You |
| Escalation | Tech is already present | Auto-assembles support package, hands off |
| Maps to classification | **Guided** | **End-to-end** (full) / **Guided** (partial) |

Both honor `ActionScope` (once / all-matching / always) and the same risk-tiered gates. The loop, state machine, providers, tools, and backends are shared infrastructure described in the companion specs (§7); this overview is intentionally feature-and-scope only.

---

## 3. The four LOCKED decisions

These are settled product/architecture decisions. Every fix-engine spec must conform to them; **do not relitigate**. Restated here verbatim-in-intent so this overview is self-contained.

### LOCKED-1 — Real provider-flexible agent loop, simulated execution targets

A genuine tool-calling LLM loop reasons over real failure evidence and **decides** the fix. The assets it acts on are **simulated executors** that return realistic output (stdout, exit codes, before/after state diffs). **No real machines, credentials, or product APIs are ever touched.** The intelligence is real; the targets are mock. This keeps the POC honest about agent behavior while staying inside the front-end-mock mandate (M6).

### LOCKED-2 — Standalone `fix-engine/` package: CLI **and** local HTTP/SSE API

The harness is a separate Node + TypeScript package at repo root `fix-engine/` (**not** under `src/`). It exposes both a `fix-engine` **CLI** and a local **HTTP + SSE** server (`POST /sessions`, `GET /sessions/:id/stream`, …). The Next.js app stays a **static export**. In the browser the app uses a built-in **simulated fix path** (offline demo) and can *optionally* connect to a running engine for a **live** demo via `NEXT_PUBLIC_FIX_ENGINE_URL`. Both paths sit behind one `FixClient` interface so the UI is agnostic to which is in play.

### LOCKED-3 — Four providers (all built now) + an always-on Mock provider

The provider layer is built provider-flexible from day one:

| `ProviderId` | What | Notes |
|---|---|---|
| `anthropic` | Claude (Anthropic) | Native `tool_use` |
| `openai` | OpenAI-compatible | GPT **and** any OpenAI-API-compatible server |
| `google` | Gemini (Google) | `functionCall` |
| `local` | Self-hosted (Ollama / vLLM) | OpenAI-compatible; covers networked local models (e.g. Kimi K2.6, Gemma 4) |
| `mock` | Deterministic Mock | **Always available**; scripted/seeded sequence for reproducible offline demos |

Adapters normalize each provider's tool-call shape into one `ChatEvent` stream. The model is **selectable per session AND per task** — e.g. a cheap local model for triage/diagnostics, a capable hosted model for planning.

### LOCKED-4 — Real script artifacts, simulated execution

Tools emit **real** `ScriptArtifact`s — **PowerShell / bash / Python / HTTP** (Microsoft Graph / Google Workspace / Salesforce REST) — that a real engineer would recognize as correct. A simulated `ExecutionBackend` returns believable `stdout` + `exitCode` and a before/after `StateDiff`. **Everything supports dry-run/preview**; destructive or over-threshold actions hit **approval gates**; the loop honors **halt conditions** and is **bounded** by a `FixBudget`.

---

## 4. POC scope

What this build delivers — and the boundary line.

### 4.1 In scope

- **A real agent loop.** A genuine tool-calling loop implementing the canonical state machine (§5): `triage → plan → (per step) awaiting-approval → preview → execute → observe → verify → loop/terminal`. Bounded by `FixBudget`; honors halt conditions.
- **Both features.** `FixMode = "guided" | "ai"` — Guided fix and Fix with AI — over the shared loop.
- **Four providers + Mock.** All five `ProviderId`s implemented behind `ModelProvider`, with per-session and per-task model selection. Mock is always present and deterministic.
- **Real scripts, simulated exec.** Tools emit real `ScriptArtifact`s; `ExecutionBackend`s per asset class (`agent-windows`, `agent-linux`, `agentless-hypervisor`, `endpoint-agent`, `saas-api`) simulate execution with realistic output + `StateDiff`.
- **Tool catalog over the existing engine.** Every automatable `RemediationAction` becomes an AI-callable `ToolHandler`, plus new **read/diagnostic** tools (`get_vss_writers`, `get_backup_chain`, `get_oauth_grant`, `get_agent_comms`, `read_event_log`, …) the agent calls during triage.
- **Standalone package + dual surface.** `fix-engine/` (CLI + HTTP/SSE), the app's offline `lib/fix-sim` mirror, and the unifying `FixClient`. Engine and app **share the same seeded fleet** (`@/mock` fixtures) so what the user sees and what the agent acts on always agree.
- **Front-end integration.** `components/organisms/fix/` — `GuidedFixPanel`, `AiFixConsole`, `FixTranscriptView`, `ModelPicker`, `ToolCallCard` — each a tokenized, story-covered component per the CLAUDE.md mandates (purple reserved for the AI surface).
- **Continuity with the engine.** Every fix writes `ActionRun` + `AuditLogEntry` records so AI fixes appear in Run history / Audit exactly like manual ones.

### 4.2 Explicitly out (non-goals)

- **No real execution.** No real machines, OS calls, cloud APIs, or live product credentials are ever invoked (LOCKED-1, M6). The scripts are real *artifacts*; the *execution* is simulated.
- **No live backend for app data.** The fleet, issues, actions, runs, and audit remain mock/`localStorage` ([06](../06-data-model-and-mock-data.md)/[07 §12](../07-troubleshooting-and-automation-engine.md)). The only optional live component is the standalone fix-engine reasoning loop.
- **Not a backup-configuration console** and **not an ITSM ticketing system** — same non-goals as the base product ([00 §5](../00-vision-and-scope.md)). Escalation produces a *ticket reference* + support package, not a real ticket in a real PSA.
- **No fine-tuning / no training.** Off-the-shelf provider models only; no model training, RAG corpus, or embeddings store in this phase.
- **No competitor tooling.** Per M7, no competitor or third-party automation-tool names appear in engine or UI; patterns are described generically.
- **No multi-agent orchestration** beyond per-task model selection. One `FixSession` = one agent loop (which may call a cheaper model for some tasks); no agent-to-agent delegation in this phase.
- **No autonomous policy creation by the agent.** The AI can *recommend* "Always fix this type," but creating an `always-matching` Policy remains a human, approval-gated action ([07 §4.2](../07-troubleshooting-and-automation-engine.md)).

---

## 5. The agent loop (canonical state machine)

Every fix-engine doc describes this loop consistently; the authoritative detail lives in the loop spec (§7), but the shape is fixed here:

```
triage    → gather evidence via read/diagnostic tools (read-only)
plan      → model proposes a FixPlan (steps, rationale, confidencePct)
for each FixPlanStep:
  awaiting-approval  → only if step.requiresApproval (a gate)
  preview            → dry-run; produce a StateDiff (no mutation)
  execute            → run the tool via its ExecutionBackend
  observe            → record the ToolResult
  verify             → re-run a read/diagnostic to confirm the symptom cleared
                     → loop to next step, or reach a terminal state
terminal: succeeded | partial | failed | escalated | halted
```

`FixState = "triaging" | "planning" | "awaiting-approval" | "executing" | "verifying" | "succeeded" | "partial" | "failed" | "escalated" | "halted"`.

- **Bounded** by `FixBudget` (`maxSteps`, `maxToolCalls`, `maxTokens`, `maxWallMs`).
- **`halted`** on budget exhaustion, repeated failures, or a refused approval.
- **Guided mode** pauses at every `you` step and every gated `we` step; **AI mode** runs autonomously but still stops at approval gates.

The interfaces that flow through this loop — `ModelProvider`/`ChatEvent`, `ToolSpec`/`ToolHandler`, `ExecutionBackend`/`StateDiff`, `FixPlan`/`FixSession`/`FixClient` — are normative and defined once in the loop and integration specs (§7). This overview references them; it does not redefine them.

---

## 6. Success criteria

This is a front-end mock phase, so success is measured by **mock-phase proxies** — the same posture as [00 §6](../00-vision-and-scope.md), specialized to the harness. These metrics are computed over the seeded fleet + failure catalog, deterministically (Mock provider) for reproducibility, and sampled across providers for realism.

| Outcome | Metric | Mock-phase proxy |
|---|---|---|
| **Unattended resolution** | % of issues an agent can resolve without a human | Over the seeded catalog: share of `full`/`partial` issues whose `FixSession` reaches `succeeded` with no `awaiting-approval` human action (AI mode, default scope). Target stated in the loop spec. |
| **Faster resolution (MTTR)** | Mean time to repair | Wall-clock from `createSession` → terminal `succeeded`, using simulated step durations (±20% jitter as in [07 §8.2](../07-troubleshooting-and-automation-engine.md)). Compared against the manual-flow MTTR proxy from [00 §6](../00-vision-and-scope.md). |
| **Escalation rate** | % of sessions that escalate | Share of `FixSession`s ending in `escalated` or `halted` rather than `succeeded`/`partial`. Lower is better, but a *calibrated* escalation rate (escalating exactly the unfixable) is the real goal — track false-escalations (escalated something it could have fixed) and over-reach (ran past its competence) separately. |
| **Reproducibility** | Deterministic replay | With the **Mock provider** and a fixed seed, the same issue produces the same transcript, plan, diffs, and terminal state on every run — required for stable Storybook stories and demos. Hosted providers are *not* expected to be bit-identical; reproducibility is asserted only on Mock. |
| **Safety / trust** | No unsafe mutation | 100% of mutating tool calls pass through `preview` (dry-run `StateDiff`) and the correct approval gate per `ToolRisk`; zero destructive actions executed without a gate. A hard invariant, not a trend. |
| **Provider parity** | Works across providers | Each of `anthropic`/`openai`/`google`/`local` completes the canonical worked examples (BCDR screenshot, Storage-full, OAuth re-consent) end-to-end; differences are surfaced, not hidden. |

> **Calibration over raw automation.** A harness that fixes 100% by ignoring approval gates is a failure. The intent is to maximize *unattended-and-safe* resolution while keeping escalation *honest* — the agent should escalate precisely the issues a competent tech would escalate, and no more.

---

## 7. How this spec set is organized

This overview is the first of eight fix-engine docs. The remaining seven carry the normative detail; cross-reference them rather than duplicating.

| # | Doc | Purpose |
|---|---|---|
| 00 | **overview-and-goals** (this doc) | Problem, two features, locked decisions, POC scope, success criteria, glossary |
| 01 | architecture-and-package | The standalone `fix-engine/` package layout, CLI + HTTP/SSE server, static-export app integration, `FixClient` boundary, shared-fleet wiring |
| 02 | provider-abstraction | `ModelProvider`/`ChatRequest`/`ChatEvent`; the five adapters (anthropic/openai/google/local/mock); per-session & per-task model selection; `ModelInfo` |
| 03 | tool-catalog | `ToolSpec`/`ToolHandler`/`ToolContext`/`ToolResult`; mapping each automatable `RemediationAction` → Tool; the read/diagnostic tools; risk/approval/backend metadata |
| 04 | execution-backends | `ExecutionBackend` per `BackendKind`; `ScriptArtifact` realism per asset class; `ExecResult`/`StateDiff`; dry-run guarantee |
| 05 | agent-loop-and-session | The `FixSession` state machine, `FixBudget`, `FixPlan`/`FixPlanStep`, halt conditions, verification, escalation; the canonical loop in full |
| 06 | front-end-integration | `components/organisms/fix/*` (GuidedFixPanel, AiFixConsole, FixTranscriptView, ModelPicker, ToolCallCard), `lib/fix-client`, `lib/fix-sim`, token/story/a11y mandates, purple-only AI surface |
| 07 | prompts-and-evaluation | System prompts & tool-use guidance per feature; the worked examples; the evaluation harness computing the §6 proxies |

Companion grounding outside this sub-set: the base product model ([00](../00-vision-and-scope.md)), the failure catalog ([02](../02-failure-catalog.md)) and its [JSON](../research/failure-catalog.json), the domain & data model ([05](../05-domain-model.md)/[06](../06-data-model-and-mock-data.md)), and — critically — the **automation engine** ([07](../07-troubleshooting-and-automation-engine.md)) whose actions, scope, approvals, runs, and audit this harness drives.

---

## 8. Glossary

| Term | Definition |
|---|---|
| **AI-remediation harness / fix engine** | The standalone system (this spec set) that lets an LLM agent drive the existing remediation engine to diagnose and fix failures. |
| **Guided fix** | Human-in-the-loop fix feature (blue). Engine runs We steps, walks the tech through You steps, gates as configured. `FixMode = "guided"`. |
| **Fix with AI** | Autonomous fix feature (purple, AI surface). Agent triages → plans → executes within scope/approval, streaming, escalating when stuck. `FixMode = "ai"`. |
| **Fix-classification** | The existing per-issue fix type: **End-to-end** (`full`, green) · **Guided** (`partial`, blue) · **Insights** (`external`/`manual`/`unknown`, orange/gray). Sets which fix feature is offered ([00 §3](../00-vision-and-scope.md)). |
| **We / You steps** | The automated ("We") vs manual ("You") split of a runbook ([00 §3](../00-vision-and-scope.md)). Each becomes a `FixPlanStep` with `actor: "we" \| "you"`. |
| **Apply once / all / always** | The three scope decisions ([07 §4](../07-troubleshooting-and-automation-engine.md)); `always` creates a forward-going Policy. Modeled as `ActionScope`. |
| **`FixMode`** | `"guided" \| "ai"` — selects which feature drives the shared loop. |
| **`FixState`** | The agent-loop state: `triaging \| planning \| awaiting-approval \| executing \| verifying \| succeeded \| partial \| failed \| escalated \| halted`. |
| **`FixSession`** | One run of the agent loop over one issue/asset, with its model, scope, budget, plan, transcript, and result. Writes `ActionRun` + `AuditLogEntry`. |
| **`FixBudget`** | Bounds on a session: `maxSteps`, `maxToolCalls`, `maxTokens`, `maxWallMs`. |
| **`FixPlan` / `FixPlanStep`** | The model's proposed remediation (`summary`, `steps`, `rationale`, `confidencePct`); each step carries intent, tool, input, actor, risk, approval. |
| **`ModelProvider` / `ProviderId`** | The provider abstraction and its five values: `anthropic \| openai \| google \| local \| mock`. |
| **`ModelInfo`** | A selectable model's metadata (id, provider, label, context window, tool support, cost, local flag). |
| **`ChatEvent`** | The normalized streaming event from any provider: `text \| tool_call \| usage \| done \| error`. |
| **Tool (`ToolSpec` / `ToolHandler`)** | An AI-callable operation wrapping a `RemediationAction` or a diagnostic; carries `risk`, `requiresApproval`, `reversible`, `backend`, and an optional `actionId` link to the catalog. |
| **`ToolRisk`** | `read \| safe-write \| destructive` — drives approval gating. |
| **`ExecutionBackend` / `BackendKind`** | The simulated executor per asset class: `agent-windows \| agent-linux \| agentless-hypervisor \| endpoint-agent \| saas-api`. |
| **`ScriptArtifact` / `ScriptLang`** | The real script the tool emits: `powershell \| bash \| python \| http`. |
| **`StateDiff`** | Before/after state returned by preview (dry-run) and execute — the basis of the diff shown to the human. |
| **`FixClient`** | The single front-end interface to the engine; talks to the live engine over SSE or to the in-browser simulated path. |
| **Simulated fix path (`lib/fix-sim`)** | The deterministic in-browser mirror of the engine, used for the offline static-export demo. |
| **Approval gate** | A human checkpoint before a gated step ([07 §6](../07-troubleshooting-and-automation-engine.md)); both fix modes stop here. |
| **Escalation** | The agent's terminal hand-off when it cannot fix: assemble a support package (evidence, attempts, diffs) + a ticket reference; `FixState = "escalated"`. |
| **Halt condition** | A safety stop: budget exhausted, repeated failures, or refused approval; `FixState = "halted"`. |
| **Shared seeded fleet** | The single `@/mock` fixture set ([06](../06-data-model-and-mock-data.md)) used by both the app UI and the engine targets, so display and action always agree. |
