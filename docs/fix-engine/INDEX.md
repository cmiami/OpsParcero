# Fix Engine — AI Remediation Harness (spec set)

The design spec set for the Kaseya Resolution Center's **AI remediation harness** — the POC that
turns the product's "fix" affordances (**Guided fix** and **Fix with AI**) into a real,
model-flexible, tool-calling agent that reasons over failure evidence and emits real remediation
scripts against a simulated fleet. Part of the broader spec set — see [`../INDEX.md`](../INDEX.md).

> **Status:** specified. Build plan in [`07-phases-and-milestones.md`](07-phases-and-milestones.md).

## The four locked decisions

1. **Real provider-flexible agent loop, simulated execution targets** — a genuine tool-calling LLM
   loop decides fixes; the assets it acts on are simulated executors returning realistic output.
2. **Standalone `fix-engine/` package** (Node + TS): a CLI **and** a local HTTP/SSE API. The Next.js
   app stays a static export and uses an in-browser **simulated** fix path offline, or connects to the
   running engine for a **live** demo — both behind one `FixClient`.
3. **Four providers + always-on Mock** — Anthropic, OpenAI-compatible, Google Gemini, Local
   (Ollama/vLLM → Kimi K2.6, Gemma 4), plus a deterministic Mock provider. Model selectable per
   session and per task (cheap local for triage, capable hosted for planning).
4. **Real script artifacts, simulated execution** — PowerShell / bash / Python / HTTP(Graph/Google/
   Salesforce) artifacts, run by a simulated executor with dry-run + before/after diff, approval gates,
   and a bounded, halt-safe loop.

## Documents

| # | Doc | What it specifies |
|---|---|---|
| 00 | [overview-and-goals](00-overview-and-goals.md) | Problem, the two features, scope, non-goals, success proxies, glossary |
| 01 | [harness-architecture](01-harness-architecture.md) | Package layout, the `FixSession` loop state machine, budgets/halts, transcript, HTTP/SSE API, CLI, audit integration, safety |
| 02 | [provider-abstraction](02-provider-abstraction.md) | `ModelProvider`/`ChatEvent` layer; Anthropic/OpenAI/Gemini/Local/Mock adapters; tool-call normalization; model registry + per-task selection |
| 03 | [tool-and-execution-model](03-tool-and-execution-model.md) | `ToolSpec`/`ToolHandler`, diagnostic tools, `ExecutionBackend` (5 simulated backends), `ScriptArtifact`, dry-run/diff/rollback |
| 04 | [remediation-tooling-by-product](04-remediation-tooling-by-product.md) | Concrete failure→tool→script tables per asset class (BCDR agent Win/Linux, agentless, ZFS, Endpoint, SaaS) with real script sketches |
| 05 | [guided-fix-ux](05-guided-fix-ux.md) | The blue human-in-the-loop UX: `GuidedFixPanel`, `ToolCallCard`, `FixTranscriptView`, `ModelPicker` |
| 06 | [ai-fix-ux](06-ai-fix-ux.md) | The purple autonomous UX: `AiFixConsole`, plan preview, streaming, escalation, bulk fix |
| 07 | [phases-and-milestones](07-phases-and-milestones.md) | The build plan — M1 core → M2 tools/backends → M3 adapters/CLI/API → M4 front-end → M5 verify |

## Resolved open questions (decisions for the build)

The spec agents flagged several design questions; resolved as follows (sensible defaults — revisit if needed):

- **Agent attribution.** Add `"ai"` to `ActionRun.triggeredBy.kind` and `AuditLogEntry.actor.kind`
  (with `refId = sessionId`) so AI fixes are first-class in Run history / Audit. *(type change in M1.)*
- **Live → app reconciliation.** The engine streams the `StateDiff`; the app applies it through the
  existing `lib/mock/runner` mutation path so there is one source of truth for state changes.
- **Phase → model-tier mapping.** Owned by the loop config (see 01/05): `triage`/`verify` → cheap/local
  tier, `plan` → capable/hosted tier; overridable per session. Referenced from 02.
- **Guided ↔ AI handoff.** A `FixSession` stays one mode; **AI escalates *to Guided*** by handing its
  plan to the `GuidedFixPanel` (the human takes over step-by-step). A deeper mid-session hybrid is out
  of scope for the POC.
- **AI + policies.** The agent may *recommend* an always-on auto-remediation Policy but never creates
  one — a human authors/approves it (preserves the human gate at the top of the fix-once-forever ladder).
- **Determinism.** Only the **Mock** provider is reproducible (CI/eval default). Hosted/local providers
  run temperature-0 where supported but are best-effort, non-deterministic.
- **Success criteria.** POC uses qualitative mock proxies (unattended-resolution %, MTTR, escalation
  rate, reproducibility on Mock) — no hard numeric SLOs.
- **Session persistence.** Sessions live in memory; the CLI may dump a JSONL transcript to `./.fix-runs/`
  for replay. The app's localStorage audit log remains the product surface.
