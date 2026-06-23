# Fix-Engine 02 — Provider Abstraction (model-flexible LLM layer)

The `fix-engine`'s provider layer: a single `ModelProvider` interface that every adapter (Anthropic, OpenAI-compatible, Google Gemini, Local self-hosted, and the deterministic Mock) implements, so the agent loop reasons over failure evidence and calls tools without knowing or caring which model is behind it. Each adapter normalizes its provider's native tool-calling, streaming, and usage-reporting into one unified `ChatEvent` stream. This doc covers the interfaces, per-adapter normalization, streaming, token/cost accounting, configuration (env vars only — never hardcoded keys), the model registry + per-task model selection, fallback + retries, and a capability matrix.

Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md).

Sibling fix-engine docs: [00 — overview & architecture](00-overview-and-goals.md) · [01 — agent loop & FixSession](01-harness-architecture.md) · [03 — tools & execution backends](03-tool-and-execution-model.md). Grounded in the [FIX-ENGINE design contract](../../FIX-ENGINE-CONTRACT.md) (authoritative). Cross-links: [vision & scope](../00-vision-and-scope.md) · [failure catalog](../02-failure-catalog.md) · [domain model](../05-domain-model.md) · [automation engine](../07-troubleshooting-and-automation-engine.md) · [tech architecture](../11-tech-architecture.md).

> **Scope reminder.** The provider layer lives in `fix-engine/src/providers/` — a **standalone Node + TypeScript package**, not under the app's `src/`. It is not bound by the CLAUDE.md token/Storybook mandates (those govern the front-end UI in `src/components/organisms/fix/`), but it must be clean, fully typed, deterministic where it claims to be, and tested. **Decision #3 of the contract is locked:** all five providers ship now, the Mock provider is always available, and the model is selectable per session *and* per task.

---

## 1. Design contract

The provider layer exists so the rest of the engine — the agent loop ([01](01-harness-architecture.md)), the tool dispatcher ([03](03-tool-and-execution-model.md)), the server and CLI — never branches on provider identity. Five rules govern it:

1. **One shape in, one shape out.** Callers build a provider-neutral `ChatRequest` and consume a provider-neutral `AsyncIterable<ChatEvent>`. Anthropic `tool_use` blocks, OpenAI `tool_calls`, and Gemini `functionCall` parts all surface as the *same* `{ type: "tool_call" }` event. Tool results go back as the *same* `{ role: "tool", … }` message regardless of how the provider expects them on the wire.
2. **Streaming is the default path.** Every adapter implements `chat()` as a streaming generator. The agent loop renders reasoning, tool calls, and verification live (it is the product surface for "Fix with AI"). Non-streaming providers are wrapped so they still emit a terminal event sequence.
3. **Usage is always accounted.** Every adapter emits a `{ type: "usage" }` event with input/output token counts; the loop multiplies by registry cost rates to enforce the `FixBudget.maxTokens` halt condition ([01 §budget](01-harness-architecture.md)) and to show a running cost in the transcript.
4. **Keys come from the environment, never code.** Each adapter reads its credentials from documented env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …). No key, base URL, or model id is ever hardcoded in a committed file. The Mock provider needs no credentials and is the offline default.
5. **The Mock provider is a first-class member.** It implements the exact same interface and emits a *seeded, scripted* `ChatEvent` sequence so demos, Storybook play functions, and CI run reproducibly with zero network and zero cost.

---

## 2. Canonical interfaces

These are the normative names from the [contract](../../FIX-ENGINE-CONTRACT.md) — every fix-engine doc uses them verbatim. Domain types (`AssetKind`, `ProductType`, `ProtectedAsset`, `Issue`, `ActionScope`, `RemediationActionId`, `ActionRunId`, `ISODateTime`) are imported from the app's `@/types` and are **not** redefined here.

```ts
// ── Provider identity & model metadata ────────────────────────────────────
type ProviderId = "anthropic" | "openai" | "google" | "local" | "mock";

interface ModelInfo {
  id: string;               // provider-native model id, e.g. "claude-opus-4-8"
  provider: ProviderId;
  label: string;            // human label for the ModelPicker, e.g. "Claude Opus 4.8"
  contextWindow: number;    // max input tokens
  supportsTools: boolean;   // false ⇒ not eligible for the agent loop
  costPer1kIn?: number;     // USD per 1k input tokens (omit/0 for local & mock)
  costPer1kOut?: number;    // USD per 1k output tokens
  local?: boolean;          // self-hosted / no metered cost
}

// ── The provider itself ───────────────────────────────────────────────────
interface ModelProvider {
  id: ProviderId;
  label: string;
  listModels(): Promise<ModelInfo[]> | ModelInfo[];
  chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent>; // streaming + tools
}

// ── Request ───────────────────────────────────────────────────────────────
interface ChatRequest {
  model: string;            // a ModelInfo.id belonging to this provider
  system: string;           // system prompt (per-feature template, see prompts/)
  messages: ChatMessage[];
  tools: ToolSpec[];        // AI-callable tools (see 03), normalized to each provider's schema
  toolChoice?: "auto" | "required" | "none";
  temperature?: number;     // adapters drop this where the model rejects it (see §3.1)
  maxTokens?: number;
}

type ChatMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "tool"; toolCallId: string; name: string; content: string }; // tool result fed back

// ── Unified event stream ──────────────────────────────────────────────────
type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; stopReason: "end" | "tool_use" | "max_tokens" | "stop" }
  | { type: "error"; message: string };
```

### 2.1 Event ordering contract

Adapters must emit events in a **deterministic, well-formed order** so the loop can drive its state machine ([01 §state machine](01-harness-architecture.md)) without provider-specific glue:

1. Zero or more `text` events (streamed reasoning / narration deltas).
2. Zero or more `tool_call` events. A `tool_call`'s `input` is the **fully assembled, parsed** JSON object — adapters buffer partial-JSON deltas internally and never emit a half-formed `input`.
3. Exactly one `usage` event (best-effort token counts; see §5).
4. Exactly one terminal `done` event with a normalized `stopReason`, **or** exactly one `error` event (mutually exclusive with `done`).

If the provider interleaves text and tool-call deltas (Anthropic does, via content-block indices), the adapter may interleave `text` and `tool_call` accordingly — but a `tool_call` is only emitted once its input JSON is complete. `usage` precedes `done`. An aborted request (via `AbortSignal`) ends the stream after emitting a single `error` event with `message: "aborted"`; the loop treats abort distinctly from provider errors.

### 2.2 `stopReason` normalization

| Normalized `stopReason` | Anthropic `stop_reason` | OpenAI `finish_reason` | Gemini `finishReason` | Meaning for the loop |
|---|---|---|---|---|
| `tool_use` | `tool_use` | `tool_calls` | `STOP` *(with functionCall parts present)* | Model wants to call ≥1 tool → loop executes them, appends results, re-invokes |
| `end` | `end_turn` | `stop` | `STOP` *(text only)* | Model finished its turn → loop advances to verify / next plan step |
| `max_tokens` | `max_tokens` | `length` | `MAX_TOKENS` | Output cap hit → loop records a budget signal, may halt |
| `stop` | `stop_sequence` | `stop` *(via stop seq)* | `STOP` | Stop sequence hit → treated like `end` unless mid-tool |

Anthropic's `refusal` and Gemini's `SAFETY`/`RECITATION` finish reasons map to an `error` event (not `done`) so the loop escalates rather than treating a refusal as a clean turn.

---

## 3. Adapter normalization (per provider)

Each adapter is a class in `fix-engine/src/providers/<name>.ts` implementing `ModelProvider`. The shared job: translate `ChatRequest` → provider request, stream the provider response, and re-emit as `ChatEvent`s per §2.1. Tool *schemas* (`ToolSpec.inputSchema`, JSON Schema) are translated to each provider's tool format; tool *results* (`{ role: "tool", … }` messages) are translated to each provider's result format.

### 3.1 Anthropic — Messages API (`anthropic`)

Uses `@anthropic-ai/sdk`, the official SDK (default client resolves `ANTHROPIC_API_KEY` from the environment). Calls `client.messages.stream(...)`; the engine's default planning model is **`claude-opus-4-8`** and its default cheap triage model is **`claude-haiku-4-5`** (see §6).

**Request mapping**

| `ChatRequest` field | Anthropic Messages param | Notes |
|---|---|---|
| `system` | `system` (string or 1 text block) | A `cache_control: {type:"ephemeral"}` breakpoint is placed on the system block + the (deterministic, name-sorted) tool list so the large failure-evidence prefix caches across loop iterations. |
| `messages` | `messages[]` | See block mapping below. |
| `tools` | `tools[]` | `{ name, description, input_schema }` from each `ToolSpec`; sorted by `name` for cache stability. |
| `toolChoice: "auto"` | `tool_choice: {type:"auto"}` | |
| `toolChoice: "required"` | `tool_choice: {type:"any"}` | |
| `toolChoice: "none"` | `tool_choice: {type:"none"}` | |
| `maxTokens` | `max_tokens` | Default **64000** with streaming (Opus 4.8 supports up to 128K but requires streaming). |
| `temperature` | *dropped on Opus 4.8 / 4.7* | These models reject `temperature`/`top_p`/`top_k` (400). The adapter omits it for those model ids and steers via the system prompt. Adaptive thinking (`thinking: {type:"adaptive"}`) is set for planning-tier models; the loop does not surface raw chain-of-thought. |

**Message → content-block mapping**

- `{ role: "user", content }` → `{ role: "user", content: [{ type: "text", text }] }`
- `{ role: "assistant", content }` → `{ role: "assistant", content: [{ type: "text", text }] }`. When replaying an assistant turn that issued tool calls, the adapter reconstructs the assistant message to include the original `tool_use` blocks (the loop persists them on the transcript turn) so the conversation stays well-formed.
- `{ role: "tool", toolCallId, name, content }` → a **user** message containing a `tool_result` block: `{ role: "user", content: [{ type: "tool_result", tool_use_id: toolCallId, content }] }`. Parallel tool results from one assistant turn are batched into a **single** user message (the API trains the model away from parallel calls if they are split).

**Stream → `ChatEvent` mapping** (SSE event types from the Messages API):

| Messages SSE event | Emitted `ChatEvent` |
|---|---|
| `content_block_delta` with `text_delta` | `{ type: "text", delta }` |
| `content_block_start` of type `tool_use` | begins buffering a tool call (records `id`, `name`) |
| `content_block_delta` with `input_json_delta` | appends to that tool call's input-JSON buffer |
| `content_block_stop` for a `tool_use` block | `{ type: "tool_call", id, name, input: JSON.parse(buffer) }` |
| `message_delta` (carries `usage.output_tokens`) + `message_start` (`usage.input_tokens`) | accumulated into one `{ type: "usage", inputTokens, outputTokens }` (cache tokens folded into `inputTokens`; see §5) |
| `message_delta.stop_reason` | → normalized `{ type: "done", stopReason }` per §2.2 |

Tool-call `input` is always parsed with `JSON.parse` (never raw-string-matched) — Opus 4.x may escape Unicode/forward slashes differently. A `stop_reason: "refusal"` → `error` event.

### 3.2 OpenAI-compatible — Chat Completions (`openai`)

Covers the OpenAI API **and any server that speaks the OpenAI Chat Completions wire format** — including vLLM and other OpenAI-API servers — selected by pointing `OPENAI_BASE_URL` at the endpoint. (When that endpoint is a *self-hosted* device for Kimi/Gemma, prefer the `local` provider, §3.4, which is the same wire format with local defaults and zero cost.) Uses the `openai` SDK with `apiKey` from `OPENAI_API_KEY` and `baseURL` from `OPENAI_BASE_URL` (defaults to the public OpenAI endpoint).

**Request mapping** — `system` becomes a `{ role: "system" }` message prepended to `messages`. `tools` map to `[{ type: "function", function: { name, description, parameters: inputSchema } }]`. `toolChoice`: `"auto"`→`"auto"`, `"required"`→`"required"`, `"none"`→`"none"`. `stream: true` with `stream_options: { include_usage: true }` so the final chunk carries usage. `temperature`/`max_tokens` passed through (this family accepts them).

**Message mapping** — `{ role: "tool", toolCallId, name, content }` → `{ role: "tool", tool_call_id: toolCallId, content }`. An assistant turn that called tools is replayed as `{ role: "assistant", content, tool_calls: [{ id, type:"function", function:{ name, arguments } }] }`.

**Stream mapping** — chunks carry `choices[0].delta`:

| Delta field | Emitted `ChatEvent` |
|---|---|
| `delta.content` | `{ type: "text", delta }` |
| `delta.tool_calls[i]` (streamed by `index`; `.function.arguments` arrives in fragments) | buffered by `index` keyed to its `id`/`name` |
| `choices[0].finish_reason` set | flush each buffered tool call as `{ type: "tool_call", id, name, input: JSON.parse(arguments) }`, then `{ type:"done", stopReason }` per §2.2 |
| final chunk `usage` (from `include_usage`) | `{ type: "usage", inputTokens: prompt_tokens, outputTokens: completion_tokens }` |

`finish_reason: "tool_calls"`→`tool_use`; `"length"`→`max_tokens`; `"stop"`→`end`. Servers that omit `usage` (some vLLM builds) trigger the estimation fallback (§5).

### 3.3 Google — Gemini `generateContent` (`google`)

Uses `@google/generative-ai` (or REST `:streamGenerateContent`) with the key from `GOOGLE_API_KEY`. Gemini's shapes differ most from the unified model, so this adapter does the most translation.

**Request mapping** — `system` → `systemInstruction`. `messages` → `contents[]` with `role` `"user"` or `"model"` (assistant→`model`); each message's text becomes a `{ text }` part. `tools` → `[{ functionDeclarations: [{ name, description, parameters: inputSchema }] }]`. `toolChoice` → `toolConfig.functionCallingConfig.mode`: `"auto"`→`AUTO`, `"required"`→`ANY`, `"none"`→`NONE`. `maxTokens`→`generationConfig.maxOutputTokens`; `temperature`→`generationConfig.temperature`.

**Tool result mapping** — `{ role: "tool", name, content }` → a `{ role: "user", parts: [{ functionResponse: { name, response: { content } } }] }` content. (Gemini keys function responses by **function name**, not by an id — the adapter tracks the call→name correspondence so results line up; `toolCallId` is synthesized as `name + ":" + callIndex` when emitting the original `tool_call` so the loop's bookkeeping is uniform.) An assistant turn that called functions is replayed as a `model` content whose parts include the original `functionCall` parts.

**Stream mapping** — `:streamGenerateContent` yields `GenerateContentResponse` chunks with `candidates[0].content.parts[]`:

| Part / field | Emitted `ChatEvent` |
|---|---|
| part `{ text }` | `{ type: "text", delta: text }` |
| part `{ functionCall: { name, args } }` | `{ type: "tool_call", id: synthId, name, input: args }` (`args` is already a parsed object) |
| `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`) on the final chunk | `{ type: "usage", inputTokens: promptTokenCount, outputTokens: candidatesTokenCount }` |
| `candidates[0].finishReason` | normalized per §2.2; `SAFETY`/`RECITATION` → `error` event |

### 3.4 Local self-hosted — Ollama / vLLM (`local`)

For models running on a **self-hosted networked device** — e.g. **Kimi K2.6** or **Gemma 4** on an on-prem GPU box. Two wire dialects are supported behind one adapter, chosen by URL convention:

- **vLLM / OpenAI-compatible** (`LOCAL_BASE_URL` ends in `/v1` or the server advertises `/v1/chat/completions`): the adapter reuses the §3.2 Chat Completions normalization verbatim, just with `baseURL = LOCAL_BASE_URL`, an empty/placeholder API key, and `local: true` cost (zero). **This is the recommended path** — it gives full streaming tool-calling parity with hosted OpenAI-compatible models.
- **Ollama native** (`/api/chat`): the adapter maps to Ollama's `{ model, messages, tools, stream:true }` and reads NDJSON lines; `message.tool_calls[].function` → `tool_call` events, `message.content` → `text` deltas, and the final `{ done:true }` line carries `prompt_eval_count` / `eval_count` → `usage`. **Caveat:** tool-calling support varies by Ollama model; if `ModelInfo.supportsTools` is false for a local model, it is excluded from the agent loop's model registry (the loop requires tools) and may only be used for non-tool summarization.

Config: `LOCAL_BASE_URL` (the device endpoint, e.g. `http://gpu-box.lan:11434` or `http://vllm.lan:8000/v1`) and `LOCAL_MODEL` (default model id, e.g. `kimi-k2.6` / `gemma-4`). No real key is required; if the server enforces a token, it is read from `LOCAL_API_KEY` (optional). All local models are `local: true` → cost 0, so the budget halt condition is driven by token/step/wall-clock limits rather than dollars.

### 3.5 Mock — deterministic scripted provider (`mock`)

**Always available, no config, no network.** The Mock provider returns a **seeded, scripted `ChatEvent` sequence** keyed to the `(assetId, issueId, mode)` of the session so a given failure always produces the same triage → plan → tool-call → verify → success transcript. This powers the offline in-browser simulated fix path ([overview](00-overview-and-goals.md) — `src/lib/fix-sim/` mirrors it), Storybook play functions, and CI.

Mechanics:

- A `MockScript` is a typed array of "beats": `text` chunks, `tool_call`s (referencing real `ToolSpec.name`s and plausible inputs drawn from the [failure catalog](../02-failure-catalog.md) / [mock fixtures](../06-data-model-and-mock-data.md)), and a terminal `done`. Scripts are stored as deterministic fixtures, selected by a seed derived from the session key.
- After each `tool_call` beat, the Mock provider waits for the loop to feed back the corresponding `{ role: "tool", … }` result (exactly as a real provider would, since the loop appends the simulated `ToolResult`), then resumes the next beat. This makes the mock exercise the *same* loop code path as live providers.
- Streaming is simulated by yielding `text` deltas word-by-word with a small, fixed delay so the UI animates believably; `usage` events report scripted token counts and the registry marks mock models `local: true` (cost 0).
- A `MOCK_SEED` env var (or a per-session override) lets a demo pin or vary the scripted outcome (success / partial / escalation paths all have scripts).

`mock` models in the registry: `mock-fast` (stands in for a triage model) and `mock-capable` (planning), both `supportsTools: true`, `local: true`.

---

## 4. Streaming

Streaming is the default for all adapters (contract §3.2 above). The agent loop consumes the `AsyncIterable<ChatEvent>` directly and re-broadcasts a derived `FixSessionEvent` stream over SSE to the front end via the [server](00-overview-and-goals.md) (`GET /sessions/:id/stream`) or, offline, via the in-browser generator in `src/lib/fix-sim/`. The `FixClient` interface ([contract](../../FIX-ENGINE-CONTRACT.md)) hides which transport is in play.

- **Abort.** Every `chat()` accepts an `AbortSignal`. `FixClient.abort(sessionId)` aborts the in-flight provider request; the adapter cancels the underlying SDK stream and emits a single `{ type: "error", message: "aborted" }`. The loop transitions to `halted`.
- **Backpressure / partial JSON.** Adapters buffer tool-call argument fragments and only emit a `tool_call` when its JSON parses; a parse failure at end-of-stream emits an `error` event (the loop retries per §7 or escalates).
- **Heartbeats.** The SSE server emits periodic comments to keep long planning turns alive; these are transport-level and never surface as `ChatEvent`s.
- **Non-streaming providers.** If a configured endpoint cannot stream (rare; some local builds), the adapter falls back to a single request and synthesizes the event sequence (`text` once, then `tool_call`s, `usage`, `done`) so the loop is unaffected.

---

## 5. Token & cost accounting

Every adapter emits exactly one `{ type: "usage", inputTokens, outputTokens }` per `chat()` call. The loop accumulates these across iterations into `FixSession` usage and:

1. Multiplies by `ModelInfo.costPer1kIn` / `costPer1kOut` to compute a running USD cost shown in the transcript and run record (local & mock models contribute 0).
2. Compares cumulative tokens against `FixBudget.maxTokens` and **halts** the session when exceeded ([01 §budget/halt](01-harness-architecture.md)).

Per-provider sourcing:

| Provider | Input tokens | Output tokens | Notes |
|---|---|---|---|
| Anthropic | `message_start.usage.input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` | `message_delta.usage.output_tokens` | Cache tokens folded into `inputTokens` for budget purposes; the registry's cost rates are charged on the *uncached* portion if a finer breakdown is later needed (out of scope for the mock). |
| OpenAI / vLLM | `usage.prompt_tokens` | `usage.completion_tokens` | Requires `stream_options:{include_usage:true}`; if absent → estimate. |
| Google | `usageMetadata.promptTokenCount` | `usageMetadata.candidatesTokenCount` | On final chunk. |
| Local | provider-native counts (`prompt_eval_count`/`eval_count` for Ollama; `usage` for vLLM) | same | Cost 0. |
| Mock | scripted | scripted | Cost 0; deterministic for reproducible transcripts. |

**Estimation fallback.** When a provider does not return usage, the adapter estimates with a cheap heuristic (≈ characters/4 over the rendered prompt and the streamed output) and flags the `usage` event as estimated via the loop's metadata so the cost display can mark it approximate. The estimator is provider-tokenizer-agnostic — it is only a budget guardrail, never billing.

---

## 6. Model registry & per-task model selection

A single `ModelRegistry` (`fix-engine/src/providers/registry.ts`) aggregates `listModels()` across all *configured* providers (a provider is configured when its env var(s) are present; the Mock provider is always configured). It exposes:

- `all(): ModelInfo[]` — everything available, for the `ModelPicker` UI.
- `resolve(provider, modelId): { provider: ModelProvider; info: ModelInfo }` — used by the loop to dispatch a `chat()`.
- `defaultFor(task): { provider, model }` — the **per-task** default.

**Per-task selection** is locked by the contract: a session pins a model, but individual loop *tasks* can use different models for cost/quality balance.

| Task | Default tier | Rationale |
|---|---|---|
| **Triage / diagnostics** (run read-tools, summarize evidence) | cheap / local | Bounded, low-stakes reading of evidence — a small model (Haiku, or a local Kimi/Gemma) is sufficient and cheap. |
| **Planning** (propose a `FixPlan`, decide gated steps, escalation reasoning) | capable / hosted | High-stakes reasoning over the failure → tool mapping; default **`claude-opus-4-8`**. |
| **Verification narration** (explain a diff, confirm symptom cleared) | cheap / local | Re-runs a read tool and narrates; cheap tier is fine. |

Defaults (overridable per session and via env):

| Tier | When `anthropic` configured | When only `local` configured | Always-available fallback |
|---|---|---|---|
| triage | `claude-haiku-4-5` | `LOCAL_MODEL` (Kimi/Gemma) | `mock-fast` |
| planning | `claude-opus-4-8` | `LOCAL_MODEL` | `mock-capable` |

The session records the model used **per transcript turn** (`FixSession.model` is the session pin; per-task overrides are noted on the turn) so the run history / audit shows exactly which model made which decision. Selecting a model whose `supportsTools` is false for a tool-requiring task is rejected at registry resolve time.

---

## 7. Fallback & retries

The loop is **bounded** ([01](01-harness-architecture.md)); the provider layer adds resilience beneath that bound:

- **Transient errors** (HTTP 429, 5xx, 529 overloaded, connection drops) → the adapter retries with exponential backoff (the official SDKs do this automatically with `maxRetries: 2`; the local/Gemini REST paths implement equivalent backoff honoring `retry-after`). Retries are invisible to the loop unless they exhaust.
- **Exhausted retries / hard errors** (401/403 bad key, 400 bad request, parse failure) → the adapter emits a single `error` event. The loop's policy: on a recoverable error it may **fall back** to the next tier's always-available model (down to `mock`) for that task and continue; on a non-recoverable error (auth/config) it transitions to `escalated` and assembles a support package rather than looping.
- **Refusals** (Anthropic `refusal`, Gemini `SAFETY`) → `error` event → the loop escalates (does not silently retry the same prompt).
- **Provider-down fallback chain:** triage/planning task → configured tier → next cheaper configured tier → `mock`. The `mock` tier guarantees the demo never dead-ends, even with no keys and no network. Fallback substitutions are recorded on the transcript so the audit reflects what actually ran.

A model whose required env var is missing is simply **absent** from the registry — never a runtime failure. The front-end `ModelPicker` only lists configured models.

---

## 8. Configuration (env vars only)

All credentials and endpoints come from the environment (`fix-engine/.env`, never committed; a committed `.env.example` documents the keys). **No key is ever hardcoded.**

| Provider | Required | Optional | Default if unset |
|---|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | — | provider absent from registry |
| `openai` | `OPENAI_API_KEY` | `OPENAI_BASE_URL` (point at any OpenAI-API server incl. vLLM) | base URL = public OpenAI endpoint; absent if no key |
| `google` | `GOOGLE_API_KEY` | — | provider absent |
| `local` | `LOCAL_BASE_URL`, `LOCAL_MODEL` | `LOCAL_API_KEY` | provider absent if base URL unset |
| `mock` | — (none) | `MOCK_SEED` | **always available** |

Engine-level: `FIX_ENGINE_PORT` (server), and the per-tier model overrides `FIX_TRIAGE_MODEL` / `FIX_PLANNING_MODEL` (each as `provider:modelId`) which, if set, override the §6 defaults. The front-end's only knob is `NEXT_PUBLIC_FIX_ENGINE_URL` — when set, `FixClient` talks to the live engine over SSE; when unset, it uses the offline simulated path backed by the `mock` behavior.

---

## 9. Capability matrix

What each provider supports, as the registry advertises it. ✅ supported · ⚠️ varies by model/build · ❌ not supported.

| Capability | Anthropic | OpenAI / vLLM | Google (Gemini) | Local (Ollama) | Mock |
|---|---|---|---|---|---|
| Streaming tool-calling | ✅ | ✅ | ✅ | ⚠️ (model-dependent) | ✅ (scripted) |
| Native tool/function schema | `tools` + `tool_use`/`tool_result` | `function` + `tool_calls`/`role:tool` | `functionDeclarations` + `functionCall`/`functionResponse` | OpenAI-shape (vLLM) / `tool_calls` (Ollama) | n/a (direct `tool_call` beats) |
| Parallel tool calls | ✅ | ✅ | ✅ | ⚠️ | ✅ (scriptable) |
| Streaming text deltas | ✅ | ✅ | ✅ | ✅ | ✅ (simulated) |
| Usage in stream | ✅ | ⚠️ (`include_usage`) | ✅ | ⚠️ (final line) | ✅ (scripted) |
| JSON-mode / structured output | ✅ (`output_config.format`) | ✅ (`response_format`) | ✅ (`responseSchema`) | ⚠️ | n/a |
| Context window (default registry entries) | 1M (Opus 4.8 / Haiku 4.5: 200K) | model-dependent | model-dependent (Gemini: large) | model-dependent | synthetic (large) |
| Adaptive / extended thinking | ✅ (adaptive) | ❌ | ⚠️ (thinking models) | ❌ | n/a |
| Metered cost | ✅ | ✅ | ✅ | ❌ (local) | ❌ (mock) |
| Requires API key | ✅ | ✅ | ✅ | optional | ❌ |
| Eligible for agent loop | ✅ | ✅ | ✅ | ⚠️ (only if `supportsTools`) | ✅ |

> The agent loop only uses JSON-mode for the rare structured sub-call (e.g. forcing a `FixPlan` shape); the primary mechanism is **tools**, which all loop-eligible providers support. Tool-calling — not structured output — is the interoperability floor.

---

## 10. Open decisions

1. **Cache breakpoint placement under per-task model switching.** Switching the model mid-session (triage→planning) invalidates Anthropic's prompt cache (caches are model-scoped). The spec recommends keeping each *task* on one model and accepting a cold cache on the first planning turn; an alternative is a subagent-style split that keeps the main loop on one model. Flag for [01-harness-architecture.md](01-harness-architecture.md).
2. **Estimated-usage fidelity.** The char/4 estimator (§5) is a guardrail, not a tokenizer. If a local/vLLM build never returns usage, budget enforcement is approximate. Decide whether to ship a per-provider tokenizer shim or accept the approximation for the mock. Flag for [03-tool-and-execution-model.md](03-tool-and-execution-model.md) only if tool-result sizing needs it.
3. **Gemini function-call id correspondence.** Gemini keys function responses by name, not id; the synthesized `toolCallId` (`name:callIndex`) assumes at most one in-flight call per name per turn. If a plan ever issues two calls to the *same* tool in one turn, the correspondence needs a stronger key. Confirm against the tool catalog ([03](03-tool-and-execution-model.md)).
4. **Local model tool-calling detection.** `ModelInfo.supportsTools` for local models is currently a static registry assertion. A capability probe at startup (a throwaway tool-calling request) would be more robust but adds latency/cost. Decide probe-vs-declare.
