# Fix-Engine 07 — Phases & Milestones (the build plan)

The sequenced construction schedule that turns the AI-remediation spec set into a working POC: ordered, checkbox-style milestones (M1–M5) with concrete deliverables, dependency edges, a definition-of-done per milestone, a testing strategy, risks, and explicit out-of-scope. Where the [implementation-phases](../13-implementation-phases.md) doc schedules the *app*, this doc schedules the **`fix-engine/` harness and its front-end integration**.
Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md). Governed by the [fix-engine design contract](00-overview.md) (locked decisions, canonical paths, canonical interfaces).

---

## 0. How to read this doc

This is the **construction schedule for the AI-remediation harness**. It assumes the rest of the fix-engine spec set is the *what* and the *how*; this doc is the **in-what-order, what-unblocks-what, and when-is-it-done**.

- [00 overview](00-overview.md) — the four locked decisions, the two product features (Guided fix / Fix with AI), canonical layout, the canonical interfaces.
- [01 provider abstraction](01-provider-abstraction.md) — `ModelProvider`, `ChatRequest`/`ChatEvent`, the adapter normalization, the model registry.
- [02 tools & backends](02-tools-and-backends.md) — `ToolSpec`/`ToolHandler`, the read/diagnostic tools, `ExecutionBackend` per asset class, `ScriptArtifact`, `StateDiff`.
- [03 agent loop & session](03-agent-loop-and-session.md) — `FixSession`/`FixState` state machine, `FixBudget`, halt conditions, `FixPlan`, transcript.
- [04 server & CLI](04-server-and-cli.md) — the local HTTP/SSE API and the `fix-engine` CLI.
- [05 front-end integration](05-frontend-integration.md) — `FixClient`, the live-SSE vs offline-sim split, the `fix/` organisms.
- [06 prompts & safety](06-prompts-and-safety.md) — system prompts, approval gates, scope/threshold rules.

### 0.1 Principles that shape the sequence

1. **Mock provider before any real provider.** The deterministic **Mock provider** ([contract decision 3](00-overview.md)) lands in M1 so the agent loop, tools, server, and front-end are all testable and demo-able with **zero credentials and byte-identical output** before a single real adapter exists. Real providers (M3) plug into a proven loop.
2. **Loop before tools, tools before real scripts.** The loop is built against a tiny tool surface, then the tool/backend layer is fleshed out, then the *real* script artifacts are authored. Each layer is verified against the Mock provider before the next is stacked on it.
3. **Engine before front-end.** The harness (M1–M3) is a working CLI + local server *before* the React surfaces (M4) consume it. The front-end never reaches around `FixClient`; it talks to a finished contract.
4. **One shared fleet, one source of truth.** The engine imports the app's `@/types` and the seeded `@/mock` fixtures as its **target fleet** ([contract layout](00-overview.md)) from M1 — the engine never redefines domain types or invents assets. The browser-side simulated path ([`lib/fix-sim`](05-frontend-integration.md)) mirrors the engine's behavior against the *same* fixtures so live and offline demos agree.
5. **Simulated execution, real artifacts.** No milestone ever touches a real machine, credential, or product API. Tools emit real PowerShell/bash/Python/HTTP, and a **simulated** `ExecutionBackend` returns believable stdout/exit + a `StateDiff` ([contract decision 4](00-overview.md)). Dry-run/preview and approval gates are built into the loop from M1, not retrofitted.
6. **Two registers of "done."** The **engine** is Node/TS — clean, strictly typed, deterministically tested (it is *not* bound by the token rules). The **front-end** obeys all [CLAUDE.md](../../CLAUDE.md) mandates — tokens-only, a story per component, status never color-only, **purple reserved for the AI surface**, WCAG 2.2 AA, realistic Datto/Kaseya mock data, no competitor names.

### 0.2 Milestone map

| Milestone | Name | Output | Verifiable by |
|---|---|---|---|
| **M1** | Fix-engine core | provider abstraction + Mock provider + agent loop/`FixSession` + budgets/halt + transcript + shared-fleet wiring | a Mock-provider session runs end-to-end in tests, deterministic |
| **M2** | Tools & simulated execution | `ToolHandler`s wrapping `RemediationAction`s + diagnostics, `ExecutionBackend` per asset class, **real script artifacts**, dry-run/diff | a Mock session triages→plans→dry-runs→executes→verifies a real BCDR failure |
| **M3** | Real providers + CLI + server | anthropic/openai/google/local adapters, model registry, `fix-engine` CLI, local HTTP/SSE server | `fix-engine fix …` runs a real model (when keyed) and the Mock model offline; SSE streams |
| **M4** | Front-end fix surfaces | `FixClient` (SSE live + offline sim), GuidedFixPanel, AiFixConsole, FixTranscriptView, ModelPicker, ToolCallCard (stories each), wired into RemediationPanel/issue/asset | the app demos Guided + AI fixes offline, and live against a running engine |
| **M5** | Verify & demo | tsc/build/storybook/a11y green, CLI smoke, live SSE demo, screenshots, docs/ROADMAP update | full `verify` green; a recorded end-to-end walkthrough |

### 0.3 Definition-of-done baseline (applies to every milestone)

Beyond each milestone's specific DoD, *nothing* is "done" unless:

- **Engine side:** `fix-engine` `tsc --noEmit` is clean; `vitest` (the engine's deterministic suite) is green; the Mock-provider path produces **byte-identical** transcripts across runs for the same seed; no `Math.random`/`Date.now` at module scope (seeded clock + PRNG only); no real network call in any test.
- **No real targets, ever.** Every executor in the milestone is simulated; dry-run mutates nothing (asserted); destructive/over-threshold tools require an approval gate.
- **Front-end side (M4–M5):** the app's `npm run verify` stays green (typecheck + lint + lint:stories + story-coverage + a11y); every new `fix/` component ships with its `.stories.tsx`; zero axe violations at `error` level in **both** light and dark; no hardcoded hex/px outside `globals.css`; an impeccable review ran on the new UI; **purple appears only on the AI surface**.
- **No competitor names** ([M7](../../CLAUDE.md)) anywhere in engine code, prompts, fixtures, scripts, or UI.

---

## 1. Dependency graph (what unblocks what)

The critical path runs **Mock provider → loop → tools/backends → providers/server/CLI → front-end → verify**. The shared-fleet wiring and the Mock provider are the two things that unblock everything.

```
M1 core ─────────────► M2 tools+exec ─────────────► M3 providers+CLI+server ──┐
(provider abstraction,   (ToolHandlers, backends,     (anthropic/openai/google/  │
 Mock provider, loop,     real scripts, dry-run/diff)   local, registry, CLI,     │
 budget/halt, transcript,                               HTTP/SSE)                 ▼
 shared fleet)                                                              M4 front-end ──► M5 verify
                                                          (FixClient SSE+sim,  (tsc/build/SB/a11y,
                                                           fix/ organisms,      CLI smoke, SSE demo,
                                                           wired into panels)   screenshots, ROADMAP)
```

| Milestone | Hard-depends on | Unblocks | Can run parallel with |
|---|---|---|---|
| M1 | the app's `@/types` + `@/mock` fixtures already exist (they do — Phases 2–5 shipped) | M2, M4 (the `FixClient`/`fix-sim` mirror can begin against M1's loop) | — |
| M2 | M1 (loop calls tools; tools need `ToolContext`/`emit`/budget) | M3 (real providers exercise real tools), M4 (ToolCallCard renders real `ToolResult`/`StateDiff`) | the **front-end sim path** of M4 (mirrors M1+M2 behavior) |
| M3 | M2 (the server/CLI run a fully-tooled loop) | M4 live path, M5 | — |
| M4 | M1 (`FixClient` contract) + M2 (`ToolResult`/`StateDiff` shapes) for the **sim path**; M3 for the **live SSE path** | M5 | M3 (sim path needs no real provider) |
| M5 | M3 + M4 | release of the POC | — |

**Key insight:** the **front-end offline-sim path** ([`lib/fix-sim`](05-frontend-integration.md)) depends only on M1+M2 shapes, not on M3. So once the loop and tools exist, one track can build the live engine (M3) while another builds the React surfaces against the simulated path (M4) — they converge when the live SSE path is wired. The Mock provider is what makes this parallelism safe: both tracks test against the same deterministic transcripts.

---

## 2. M1 — Fix-engine core (provider abstraction + Mock provider + agent loop)

> **Goal:** a standalone `fix-engine/` package whose **agent loop** drives a `FixSession` through the full [state machine](03-agent-loop-and-session.md) using the deterministic **Mock provider**, bounded by a `FixBudget`, emitting a `FixTranscriptTurn[]`, against the **shared seeded fleet** — with zero real providers, zero real tools, zero credentials. This is the spine everything else stacks on.

### Tasks

- **Package scaffold.** Create `fix-engine/` with its own `package.json` + `tsconfig.json` (strict), Node 20.19+/22.12+, `vitest`. Path alias so the engine imports the app's domain types and fixtures as the single source of truth — `@/types` and the `@/mock` seeded fleet — per [contract layout](00-overview.md). Do **not** redefine `AssetKind`, `ProductType`, `ProtectedAsset`, `Issue`, `ActionScope`, `RemediationActionId`, `ActionRunId`, `ISODateTime`.
- **`shared/`** — the fleet adapter: load the seeded assets/failure-modes/actions from `@/mock`, expose `getAsset(id)`, `getIssue(id)`, `listActionsFor(asset)`; a **seeded clock** (`now()`), and a namespaced **PRNG** so the Mock provider and any simulated latency are reproducible.
- **Provider abstraction** (`providers/`) — author the [canonical interfaces](00-overview.md) exactly: `ProviderId`, `ModelInfo`, `ModelProvider`, `ChatRequest`, `ChatMessage`, `ChatEvent`. Define the `ChatEvent` stream contract (`text` / `tool_call` / `usage` / `done` / `error`) that every adapter must normalize to. (Real adapters are M3.)
- **Mock provider** (`providers/mock.ts`) — a deterministic `ModelProvider` that, given a `ChatRequest` + the seeded asset/issue, returns a **scripted `ChatEvent` sequence**: a triage read-tool call, a `FixPlan` proposal, per-step `tool_call`s, and a verification turn, ending `done`. Seeded by `{assetId, issueId, model}` so the same inputs ⇒ the same transcript. Emits plausible `usage` numbers. This is the CI engine for the entire harness.
- **Agent loop / `FixSession`** (`loop/`) — implement the [state machine](03-agent-loop-and-session.md): `triaging → planning → awaiting-approval → executing → verifying → succeeded | partial | failed | escalated | halted`. The loop calls `provider.chat()`, parses `ChatEvent`s, dispatches `tool_call`s to the tool registry (a **stub registry** in M1 — one read tool + one no-op write tool to prove dispatch), feeds `ToolResult`s back as `{role:"tool"}` messages, and appends a `FixTranscriptTurn` for every model/tool/observation/approval/verification/status event.
- **Budget & halt** (`loop/budget.ts`) — enforce `FixBudget { maxSteps, maxToolCalls, maxTokens, maxWallMs }`. Halt → `state:"halted"` on budget exhaustion, repeated identical failures, or a refused approval. Mode rules: **guided** pauses at every `you` step and every gated `we` step; **ai** runs autonomously but still stops at approval gates.
- **Approval & dry-run hooks** — the loop transitions to `awaiting-approval` for any step whose `requiresApproval` is true, and resolves via an injectable approval callback (the server/CLI/front-end provide it; M1 tests provide an auto-approve/auto-reject stub). The loop's `preview` (dry-run) phase is wired even though tools are stubs.
- **Run/audit emission** — on each executed step the loop writes an `ActionRun` + `AuditLogEntry` record shape ([domain-model](../05-domain-model.md)/[data-model](../06-data-model-and-mock-data.md)) so AI fixes show up in Run history / Audit exactly like manual ones. In M1 these are returned in `FixSession.result.actionRunIds`; persistence wiring is M3 (server) / M4 (app store).

### Deliverables

- A buildable `fix-engine/` package: `tsc` clean, `vitest` green.
- A `runSession(req)` entry point that, given `{assetId, issueId?, mode, model:{provider:"mock",model:…}, scope}`, returns a completed `FixSession` with a populated `transcript`, `plan`, and `result`.
- The Mock provider + stub tool registry proving the full loop.

### Definition of done

- [ ] `fix-engine/` builds standalone (`tsc --noEmit` clean) and imports app `@/types` + `@/mock` without copying them.
- [ ] A Mock-provider `FixSession` runs `triaging → planning → executing → verifying → succeeded` and the **transcript is byte-identical across runs** for the same seed (snapshot test).
- [ ] `FixBudget` is enforced: a deliberately tiny `maxSteps`/`maxToolCalls`/`maxTokens`/`maxWallMs` drives the session to `halted` (each limit proven by its own test).
- [ ] A refused approval drives the session to `halted`; an approved gated step proceeds. Guided mode pauses at `you`/gated `we`; AI mode only at gated.
- [ ] Each executed step yields an `ActionRun` + `AuditLogEntry` record of the canonical shape; `result.actionRunIds` is populated.
- [ ] No real network, no credentials, no `Math.random`/`Date.now` at module scope.

### Risks / notes

- **Tool-call normalization is the load-bearing seam.** Lock the `ChatEvent` shape now; M3's four real adapters must all collapse into it. If the Mock provider's scripted shape diverges from what a real adapter can produce, M3 forces a rewrite — model the Mock provider on the *hardest* normalization (Gemini `functionCall`) from the start.
- The seeded clock/PRNG must thread through **everything** that could vary (latency, usage, Mock decisions) or determinism leaks.

---

## 3. M2 — Tools + simulated execution backends + real script artifacts

> **Goal:** replace M1's stub tool registry with the real **tool catalog** — every automatable `RemediationAction` becomes an AI-callable `ToolHandler`, plus the **read/diagnostic** tools the agent calls first — backed by **simulated `ExecutionBackend`s per asset class** that run **real script artifacts** (PowerShell/bash/Python/HTTP) and return believable stdout/exit + a `StateDiff`. After M2, a Mock session can actually *fix* a real BCDR failure in simulation.

### Tasks

- **`ToolSpec`/`ToolHandler`** (`tools/`) — author the [canonical interfaces](00-overview.md) exactly (`ToolRisk`, `ToolSpec`, `ToolContext`, `ToolResult`, `ToolHandler`). Each tool carries `risk`, `requiresApproval`, `reversible`, `appliesToKinds`, `productTypes`, optional `actionId` (1:1 link to the existing catalog), and a `backend`.
- **Wrap the catalog.** For every automatable `RemediationAction` in the seeded catalog ([data-model](../06-data-model-and-mock-data.md), ~154 actions), generate a `ToolHandler` with a JSON-Schema `inputSchema`, the correct `risk`/approval/backend, and a `run`/`preview` that emits a `ScriptArtifact` and hands it to the matching backend ([tools-and-backends](02-tools-and-backends.md)).
- **Add read/diagnostic tools.** Author the evidence-gathering tools the agent calls during `triage`: `get_vss_writers`, `get_zfs_pool`, `get_agent_comms`, `get_backup_chain`, `get_oauth_grant`, `read_event_log`, `get_screenshot_result`, etc. — `risk:"read"`, never gated. These produce the evidence the model reasons over.
- **Execution backends** (`backends/`) — implement `ExecutionBackend` for each `BackendKind`, all **simulated** ([contract asset-class model](00-overview.md)):
  - `agent-windows` — PowerShell over a *simulated* Datto Windows Agent channel (cmdlets, `vssadmin`, `diskshadow`, service ops). Believable host vocabulary (ports 25568/3260/3262; `mothership.dtc.datto.com`).
  - `agent-linux` — bash/python (`dattobd`/dracut/initramfs, `fsck`, `journald`). Chosen from `asset.os.family` / `asset.kind`.
  - `agentless-hypervisor` — VMware/Hyper-V API (CBT reset, snapshot consolidation).
  - `endpoint-agent` — PowerShell/bash on the endpoint (CBT filter, VSS, AV exclusions, throttle), direct-to-cloud.
  - `saas-api` — Microsoft Graph / Google Workspace Admin / Salesforce REST as **HTTP `ScriptArtifact`s** (OAuth re-consent, re-seed, throttle backoff). No host scripts.
- **Real script artifacts.** Author genuine, readable scripts (the `ScriptArtifact.source`) for the high-value BCDR/Endpoint/SaaS fixes — these are the product's content and must look real (correct cmdlet names, real flags, real Graph endpoints). HTTP artifacts encode method/url/headers/body as a structured block.
- **Simulated execution + `StateDiff`.** Each backend returns an `ExecResult { exitCode, stdout, stderr, durationMs, diff? }` with a believable before/after `StateDiff` (e.g. VSS writer state `failed → stable`, chain `broken → consolidated`, OAuth grant `expired → active`). Outcomes are **seeded** and weighted by action category (diagnostics rarely fail; destructive/restore fail more often) to exercise `partial`/`failed`/`escalated`.
- **Dry-run / preview.** `ToolHandler.preview` and `ExecutionBackend.exec({dryRun:true})` return the **same `StateDiff` with zero mutation** — the loop's preview phase shows the diff before any gated execute. Dry-run mutating nothing is asserted.
- **Failure → tools map.** Encode the `FailureMode → likely Tools → ScriptArtifact(s)` mapping (the catalog already has `remediationActionIds`) so the Mock provider — and later real models — can select the right tools per the [failure catalog](../02-failure-catalog.md).

### Deliverables

- A populated tool registry (read/diagnostic + wrapped remediation tools) the loop dispatches to.
- Five simulated `ExecutionBackend`s with real script artifacts and seeded outcomes + diffs.
- An end-to-end Mock session that **resolves a real BCDR failure** (e.g. `bcdr.vss-writer-snapshot-failure`): triage via `get_vss_writers` + `read_event_log` → plan "Reset VSS Writers" → dry-run diff → execute → verify writers stable.

### Definition of done

- [ ] Every automatable `RemediationAction` has a corresponding `ToolHandler` with a valid JSON-Schema input, correct `risk`/`requiresApproval`/`reversible`/`backend`, and (where 1:1) a matching `actionId`.
- [ ] The read/diagnostic tools return seeded, asset-correlated evidence (a Failed BCDR asset's `get_vss_writers` shows failed writers; a SaaS seat's `get_oauth_grant` shows an expired grant).
- [ ] Backend selection is driven by the tool's `backend` and the asset's `kind`/`os.family`; a SaaS tool never runs a host script, a BCDR-Linux fix never emits PowerShell.
- [ ] Script artifacts are real and product-accurate (correct cmdlets/flags/endpoints); HTTP artifacts carry method/url/headers/body. **No competitor names** in any script.
- [ ] `preview`/dry-run returns the diff and mutates nothing (intercept asserted); gated/destructive tools cannot execute without an approval.
- [ ] Seeded outcomes produce a deterministic mix that can drive `succeeded`, `partial`, `failed`, and `escalated` across the catalog (proven by a fixture sweep test).
- [ ] The BCDR VSS acceptance session completes `triage→plan→dry-run→execute→verify→succeeded` deterministically.

### Risks / notes

- **Breadth temptation.** ~154 actions is a lot; author **real, hand-crafted scripts** for the BCDR/Endpoint/SaaS showcase fixes first, and template the long tail — but every script must still read as real (no placeholder `# do the thing`).
- The `StateDiff` is what makes simulation convincing **and** what powers the front-end `ToolCallCard` diff view (M4) — design the before/after key set per tool now so the UI has structured data, not just text.

---

## 4. M3 — Real provider adapters + CLI + local HTTP/SSE server + model registry

> **Goal:** make the harness real and runnable. Build the four **real `ModelProvider` adapters** (anthropic / openai / google / local) that normalize into the M1 `ChatEvent` contract, a **model registry** (selectable per session *and* per task), the **`fix-engine` CLI**, and the **local HTTP + SSE server**. The Mock provider stays the always-on default for offline/CI; real providers activate when keyed.

### Tasks

- **Provider adapters** (`providers/{anthropic,openai,google,local}.ts`) — each implements `ModelProvider` and normalizes its native streaming tool-call shape into the canonical `ChatEvent` stream ([provider-abstraction](01-provider-abstraction.md)):
  - **anthropic** — Claude; native `tool_use` content blocks + streaming deltas → `ChatEvent`. (See [`/claude-api`](../../CLAUDE.md) reference for current model ids/params before pinning defaults.)
  - **openai** — OpenAI-compatible; `tool_calls` + streamed chunks. Covers GPT and *any* OpenAI-API server (`baseURL` configurable).
  - **google** — Gemini; `functionCall` parts → `ChatEvent`.
  - **local** — self-hosted OpenAI-compatible endpoint (Ollama / vLLM, networked device) — reuses the OpenAI normalization with a `baseURL`/no-key config; covers locally-hosted capable models.
- **Model registry** (`providers/registry.ts`) — aggregate `listModels()` across configured providers into `ModelInfo[]` (label, context window, `supportsTools`, cost per 1k, `local` flag). Per-task model selection: the loop can use a cheap/local model for triage/diagnostics and a capable hosted model for planning ([contract decision 3](00-overview.md)). The Mock model is always present.
- **Config & secrets** — provider config via env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`/`OPENAI_BASE_URL`, `GOOGLE_API_KEY`, `LOCAL_BASE_URL`). Missing key ⇒ that provider is **listed as unavailable**, not a crash; Mock is always available. No secrets in code, fixtures, or transcripts.
- **CLI** (`cli/`) — `fix-engine fix --asset <id> [--issue <id>] --mode <guided|ai> --provider <id> --model <m> [--scope …] [--dry-run] [--budget …]` streams the transcript to the terminal; `fix-engine list-models`; `fix-engine list-tools`; `fix-engine replay <transcript.json>`. Defaults to the **Mock provider** when no provider/key is given (so the CLI always works offline).
- **HTTP/SSE server** (`server/`) — the [local API](04-server-and-cli.md): `POST /sessions` (create a `FixSession`), `GET /sessions/:id/stream` (Server-Sent Events of `FixSessionEvent`s — text deltas, tool calls, tool results, plan, status, approval requests), `POST /sessions/:id/approve` (`{stepId, decision}`), `POST /sessions/:id/abort`, `GET /models`, `GET /tools`. CORS for the static app origin; bind localhost by default.
- **Approval over the wire** — when the loop hits `awaiting-approval`, the server emits an approval-request SSE event and blocks the step until a `POST …/approve` arrives (or the budget's `maxWallMs` halts it).
- **Persistence** — sessions persisted in-memory (POC); transcripts dumpable to JSON for `replay` and screenshots. `ActionRun`/`AuditLogEntry` records exposed so the app can fold AI runs into Run history.

### Deliverables

- Four real adapters + Mock, behind one registry, all normalizing to `ChatEvent`.
- A working `fix-engine` CLI (offline via Mock; live via any keyed provider).
- A running local HTTP/SSE server implementing the full `FixClient` contract surface.

### Definition of done

- [ ] All four real adapters + Mock implement `ModelProvider`; each normalizes its native tool-call streaming into identical `ChatEvent`s (one cross-adapter conformance test, run against Mock + any keyed provider).
- [ ] `fix-engine fix … --provider mock` runs fully offline with **no network**; with a real key, the same command drives a real model through the same loop.
- [ ] Per-task model selection works: a session can route triage to a cheap/local model and planning to a capable model.
- [ ] The SSE server streams a complete session (`POST /sessions` → `GET …/stream`), honors `…/approve` and `…/abort`, and emits approval-request events for gated steps.
- [ ] A missing API key degrades that provider to "unavailable" without crashing; Mock always available.
- [ ] `replay <transcript.json>` reproduces a prior session deterministically.
- [ ] No secrets in code/fixtures/transcripts; CORS limited to the app origin; localhost bind by default.

### Risks / notes

- **Adapter drift** is the top risk — provider SDKs differ on streaming/tool-call/usage shapes. The M1 conformance test is the guardrail; run it in CI against Mock so a normalization regression fails fast even without keys.
- Keep real-provider calls **out of CI** (no keys in CI). The deterministic Mock path is the only thing CI runs against the loop/server/CLI.
- Pin model defaults from the [`/claude-api`](../../CLAUDE.md) reference rather than memory; treat model ids as config, not constants.

---

## 5. M4 — Front-end fix surfaces (FixClient + organisms, wired in)

> **Goal:** the React surfaces for the two features — **Guided fix** (blue) and **Fix with AI** (purple) — driven by a single `FixClient` that talks to the **live engine over SSE** *or* the **offline simulated path** ([`lib/fix-sim`](05-frontend-integration.md)), wired into the existing `RemediationPanel` / issue / asset surfaces. Every component ships with a story and obeys all [CLAUDE.md mandates](../../CLAUDE.md).

### Tasks

- **`FixClient`** (`src/lib/fix-client/`) — implement the [canonical interface](00-overview.md): `createSession`, `stream` (async iterable of `FixSessionEvent`), `approve`, `abort`. Two implementations behind one factory: **live** (SSE to `NEXT_PUBLIC_FIX_ENGINE_URL`, parsing the server's event stream) and **sim** (an in-browser generator). Selection: live if the engine URL is configured **and** reachable, else sim. The app is a **static export** ([contract decision 2](00-overview.md)) — the live path is purely client-side fetch/EventSource.
- **`lib/fix-sim/`** — the deterministic in-browser simulated fix path that **mirrors the engine's behavior** against the **same `@/mock` fixtures** the engine uses. It reuses the M1 Mock-provider transcripts + M2 tool/backend behavior shapes so an offline demo is indistinguishable from a Mock-provider live run. (Heavy script-artifact text is bundled as data, not recomputed.)
- **`fix/` organisms** (`src/components/organisms/fix/`), each tokens-only, with a full `*.stories.tsx` (autodocs, argTypes, variants, `play`):
  - **GuidedFixPanel** — the blue Guided flow: runs automatable **"We"** steps, walks the human through manual **"You"** steps, an **approval gate on each gated step**, per-step status (dot+icon+text), dry-run diff before apply, apply once/all/always scope ([contract features](00-overview.md), extends [automation engine](../07-troubleshooting-and-automation-engine.md)).
  - **AiFixConsole** — the **purple AI surface**: streams the agent's reasoning, tool calls, evidence, plan, and verification; live state badge (triaging/planning/executing/verifying/…); approve/reject controls at gates; abort; escalation panel (assembled support package / "ask a human") when it can't fix.
  - **FixTranscriptView** — renders `FixTranscriptTurn[]` (model text, tool_call, tool_result, observation, approval, verification, status) as a readable, scannable timeline; collapses long script output; copyable.
  - **ModelPicker** — choose provider + model from `GET /models` (live) or the registry mirror (sim); shows label, context window, cost, `local` badge; supports per-task selection (triage vs planning); Mock always offered for offline.
  - **ToolCallCard** — one tool call: name, risk chip (read/safe-write/destructive — never color-only), input summary, the **`StateDiff` before/after**, stdout/exit, dry-run vs applied state, reversible flag.
- **Wire into existing surfaces** — add a **Guided fix** action (blue) and a **Fix with AI** action (purple) to the existing `RemediationPanel` and the issue/asset detail pages, opening the respective panel/console seeded with the asset+issue. AI runs fold into Run history / Audit via the engine's `ActionRun`/`AuditLogEntry` emission.
- **Color discipline** — **purple (`--ai`) appears ONLY on the AI surface** (AiFixConsole + the "Fix with AI" entry point); Guided fix uses blue (`--primary`); fix-classification colors per [design-system](../03-design-system.md). Status is dot+icon+text everywhere.

### Deliverables

- `FixClient` (live + sim) + `lib/fix-sim` mirror.
- Five `fix/` organisms, each with a complete story, both themes.
- Guided + AI entry points wired into RemediationPanel/issue/asset, demoable **offline** (sim) and **live** (against a running engine).

### Definition of done

- [ ] `FixClient.stream` yields the same `FixSessionEvent` shape from both the **live SSE** path and the **offline sim** path; the UI is agnostic to which is active.
- [ ] With the engine **not** running, the app still demos a full Guided fix and a full AI fix via the sim path (static export, no backend).
- [ ] With the engine running and `NEXT_PUBLIC_FIX_ENGINE_URL` set, the same surfaces stream a **live** session over SSE; approvals and abort round-trip.
- [ ] GuidedFixPanel gates every `you` step and every gated `we` step; AiFixConsole runs autonomously but stops at approval gates and shows an escalation path on failure.
- [ ] ToolCallCard renders the `StateDiff` before/after and the risk chip with dot+icon+text (never color-only); dry-run vs applied is unmistakable.
- [ ] **Purple is present only on the AI surface**; blue drives Guided; fix-classification colors correct. Verified by an impeccable review.
- [ ] Every `fix/` component has a story (coverage gate green); zero axe `error` violations in light **and** dark; tokens-only (no hardcoded hex/px); realistic Datto/Kaseya content; no competitor names.

### Risks / notes

- **Sim ↔ live parity** is the subtle risk: the sim path must mirror the engine closely enough that switching `NEXT_PUBLIC_FIX_ENGINE_URL` on/off doesn't visibly change the UX. Share the event-shape types between `fix-client` and the engine to prevent drift.
- **EventSource on a static export** — SSE is plain client-side; ensure reconnection/abort and CORS are handled (the M3 server sets CORS for the app origin).
- Resist letting purple leak into Guided or generic UI — the AI-only color rule is a hard mandate ([M4](../../CLAUDE.md)).

---

## 6. M5 — Verify, demo & docs

> **Goal:** prove the whole POC stands up and is presentable: the engine's deterministic suite + the app's full `verify`, a **CLI smoke test**, a **live SSE demo**, screenshots, and the docs/ROADMAP updated to reflect the shipped AI-remediation harness.

### Tasks

- **Engine verify** — `fix-engine` `tsc --noEmit` clean; `vitest` green incl. the deterministic Mock snapshot, budget/halt, dry-run-no-mutation, backend-selection, and the cross-adapter `ChatEvent` conformance test (Mock + any keyed provider).
- **App verify** — `npm run verify` (typecheck + lint + lint:stories + story-coverage + a11y) green; `next build` (static export) succeeds with the `fix/` surfaces included; `build-storybook` green with the five new stories; story-coverage gate counts them.
- **a11y** — axe across the fix surfaces in light + dark → 0 serious/critical; non-color status on every fix state and risk chip; keyboard operability of approve/reject/abort; reduced-motion alternative for the streaming/“thinking” animation.
- **CLI smoke** — a scripted `fix-engine fix --provider mock …` run that completes a session end-to-end and dumps a transcript (used in CI; no keys).
- **Live SSE demo** — start the engine, point the app at it via `NEXT_PUBLIC_FIX_ENGINE_URL`, and run a Guided fix and an AI fix live; capture the transcript stream.
- **Screenshots** — GuidedFixPanel, AiFixConsole (streaming + escalation), FixTranscriptView, ToolCallCard (with `StateDiff`), ModelPicker — light + dark — for the docs/demo.
- **Docs/ROADMAP update** — add an **AI-remediation phase** to [ROADMAP.md](../../ROADMAP.md) with M1–M5 checkboxes; link the [fix-engine spec set](../INDEX.md) from the [INDEX](../INDEX.md); record the locked decisions + what shipped in the changelog.

### Deliverables

- Green engine suite + green app `verify` + green `build-storybook`.
- A reproducible CLI smoke (Mock) and a recorded live SSE walkthrough.
- A screenshot set + updated ROADMAP/INDEX.

### Definition of done

- [ ] `fix-engine` `tsc` + `vitest` green; Mock transcript snapshot stable; conformance test green.
- [ ] App `npm run verify`, `next build` (static export), and `build-storybook` all green with the `fix/` surfaces; story-coverage includes all five new components.
- [ ] Zero axe `error` violations across the fix surfaces in light + dark; keyboard + reduced-motion verified; status never color-only.
- [ ] CLI smoke (Mock) completes a full session in CI without keys; `replay` reproduces it.
- [ ] A live SSE run of both Guided and AI fixes is demonstrated against the running engine.
- [ ] Screenshots captured; ROADMAP gains the AI-remediation phase with M1–M5 ticked; INDEX links the fix-engine set.

### Risks / notes

- Keep the **live** demo out of automated CI (no keys/engine in CI) — CI runs the **Mock/sim** paths only; the live demo is a manual/recorded acceptance step.
- Screenshots must show **realistic** Datto/Kaseya content and **no competitor names** — they are part of the deliverable.

---

## 7. Testing strategy

The harness is testable **without any credentials or real machines** because every external dependency has a deterministic stand-in.

| Layer | What's tested | How (deterministic) |
|---|---|---|
| Provider abstraction | adapters normalize native tool-call streams into `ChatEvent` | one **conformance suite** run against the **Mock** provider in CI; optionally against keyed providers locally |
| Mock provider | scripted transcript per `{asset,issue,model}` seed | **snapshot test** — byte-identical across runs |
| Agent loop | state-machine transitions, budget/halt, approval gating, mode rules | unit tests with the Mock provider + stub/real tools and a seeded clock |
| Tools & backends | tool selection per failure mode, simulated exec, `StateDiff`, dry-run = no mutation | seeded fixture sweep; dry-run intercept asserted |
| Server/CLI | session lifecycle, SSE stream, approve/abort, offline default | integration tests against the in-process server with the Mock provider |
| Front-end | `FixClient` live↔sim parity, organisms' states, a11y | Storybook `play` fns + axe (both themes); sim path needs no engine |

**CI runs the Mock/sim paths only** — no keys, no network, fully deterministic. Real-provider adapters are exercised by a local/manual run of the conformance suite with keys. The single seeded `SEED` plus the namespaced PRNG and seeded clock guarantee that the same inputs always produce the same transcript, diff, and outcomes — so snapshots are stable and demos are reproducible.

---

## 8. Risks (cross-cutting)

- **Determinism leak** — any unseeded `Math.random`/`Date.now`/wall-clock latency breaks snapshots and reproducible demos. Thread the seeded clock/PRNG through every variable point (Mock decisions, simulated latency, usage numbers).
- **Adapter drift** — real provider SDKs change streaming/tool-call/usage shapes; the conformance test against the canonical `ChatEvent` is the guardrail. Treat model ids/params as config (per [`/claude-api`](../../CLAUDE.md)).
- **Sim ↔ live divergence** — the front-end must look the same whether driven by the live engine (SSE) or the offline sim; shared event-shape types and a shared seeded fleet prevent drift.
- **Script realism vs scope** — ~154 actions can't all get hand-crafted scripts at full depth; prioritize the BCDR/Endpoint/SaaS showcase fixes and template the tail, but never ship placeholder scripts.
- **Color-rule leakage** — purple must stay confined to the AI surface; an impeccable review on every fix screen is the gate.
- **Approval/halt correctness** — the safety surface (gates, budgets, dry-run-no-mutation) is the part most worth over-testing; a single missed gate undermines the whole "simulated, bounded, approved" thesis.

---

## 9. Out of scope (POC)

- **Real machine execution / real credentials / live product APIs.** All execution is simulated; all targets are the seeded fleet ([contract decision 1 & 4](00-overview.md)).
- **A hosted/multi-tenant fix-engine.** The server is **localhost** for the live demo; no auth, no persistence beyond in-memory + JSON transcript dumps.
- **Fine-tuning, RAG, or vector stores.** The agent reasons over the in-context failure evidence the read tools return; no retrieval layer.
- **Provider billing/quotas/rate-limit orchestration** beyond graceful "provider unavailable" when unkeyed.
- **The full 154-action script depth.** Showcase fixes are hand-crafted; the long tail is templated.
- **Cross-session learning / memory** — each `FixSession` is independent.
- **Production observability** (metrics/tracing) — transcripts + audit records are the only telemetry in the POC.

---

## 10. ROADMAP integration

This plan adds one phase to [ROADMAP.md](../../ROADMAP.md) — **AI-Remediation Harness** — mirroring M1–M5:

| Milestone | ROADMAP line | Done when |
|---|---|---|
| M1 | Fix-engine core (providers + Mock + loop + budget/halt + transcript + shared fleet) | §2 DoD |
| M2 | Tools + simulated backends + real scripts + dry-run/diff | §3 DoD |
| M3 | Real adapters + CLI + HTTP/SSE server + model registry | §4 DoD |
| M4 | Front-end `FixClient` + fix organisms wired into RemediationPanel/issue/asset | §5 DoD |
| M5 | Verify + CLI smoke + live SSE demo + screenshots + docs/ROADMAP | §6 DoD |

GitHub remains the system of record (a milestone per Mx, an issue per task); this doc and ROADMAP are the human-readable mirror, kept in sync the same way the existing [implementation-phases](../13-implementation-phases.md) doc maps to ROADMAP.
