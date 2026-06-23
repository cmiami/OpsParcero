# fix-engine — Kaseya Resolution Center AI-remediation harness

A standalone **Node + TypeScript** agent harness that triages a failing asset,
plans a fix, dry-runs it, executes (against **simulated** targets), and verifies —
driven by a **model-flexible** provider layer (Anthropic / OpenAI / Google /
Local self-hosted / a deterministic **Mock**). It runs over the app's seeded
fleet (`@/mock`) — **no real machines, credentials, or product APIs**.

> POC / front-end-adjacent harness. Every executor is simulated; tools emit real
> PowerShell / bash / Python / HTTP artifacts and a believable `StateDiff`. The
> **Mock** provider is always available and fully offline, so the CLI works with
> **zero API keys** (and is the default).

---

## Quick start

```bash
# from the repo root or fix-engine/ — both work (the @/* alias is in tsconfig.json)
cd fix-engine

# list the models every configured provider advertises (Mock always shows)
npx tsx src/cli/index.ts list-models

# run an offline AI fix on the first failed BCDR asset (no keys needed)
npx tsx src/cli/index.ts fix --provider mock --mode ai
```

The package also exposes npm scripts:

```bash
npm run fix    -- --provider mock --mode ai     # tsx src/cli/index.ts
npm run models                                  # list-models
npm run typecheck                               # tsc --noEmit
npm run test                                    # vitest (deterministic, no network)
```

If `tsx` ever fails to resolve the `@/*` alias, pass the tsconfig explicitly:

```bash
npx tsx --tsconfig fix-engine/tsconfig.json fix-engine/src/cli/index.ts list-models
```

---

## CLI

### `fix` — run a remediation session (default command)

```
fix [--asset <id>] [--issue <id>] --mode <guided|ai>
    [--provider <id>] [--model <m>] [--scope <once|all-matching|always>]
    [--dry-run] [--no-approve] [--budget-steps N] [--json]
```

| Flag | Default | Meaning |
|---|---|---|
| `--asset <id>` | first **failed BCDR** asset in the fleet | The asset to remediate. A bare `fix` demos something. |
| `--issue <id>` | the asset's primary issue | Pin a classified issue. |
| `--mode <m>` | `ai` | `guided` (pauses at `you`/gated steps) or `ai` (autonomous, still stops at approval gates). |
| `--provider <id>` | `mock` | `anthropic` · `openai` · `google` · `local` · `mock`. An unconfigured provider falls back to Mock with a note (never crashes). |
| `--model <m>` | the provider's first model | Provider-native model id. |
| `--scope <s>` | `once` | `once` · `all-matching` · `always`. |
| `--dry-run` | off | Safe preview — auto-**rejects** every approval gate so no gated/destructive action runs (each write's dry-run diff is still shown before its gate). |
| `--no-approve` | off (auto-approve) | Auto-**reject** approval gates → a gated step halts the session. |
| `--budget-steps N` | mode default | Override the max model-step budget (drives `halted` when exceeded). |
| `--json` | off | Also dump the final `FixSession` as JSON to stdout. |

The transcript streams live to stdout: model narration, each tool call with its
input, the dry-run preview + before/after `StateDiff` for writes, approval
decisions, and a status line per state transition, ending in a summary block.

**Exit code:** `0` when the final state is `succeeded` or `partial`; `1`
otherwise (`failed` / `escalated` / `halted`, or a usage error).

Color is auto-suppressed when stdout is not a TTY or `NO_COLOR` is set, so
`fix … > transcript.txt` is clean and grep-able.

### `list-models`

Prints every model from every **available** provider — provider label,
availability (`● available` / `○ unavailable (no key)`), model id, label,
context window, tool support, and cost (or `local/free`).

### `list-tools`

Prints the tool catalog: name, risk (`read` / `safe-write` / `destructive`),
execution backend, and approval requirement, with each tool's description.

### `replay <transcript.json>`

Re-prints a saved transcript. Accepts either a full `FixSession` JSON (e.g. a
`fix … --json` dump) or a bare `FixTranscriptTurn[]` array. When given a full
session it also re-prints the summary and exits with the same success/failure
code as the original run.

---

## Configuration (env only — never committed)

All provider credentials/endpoints come from the environment. **No key is ever
hardcoded.** A provider whose required var is unset is simply **listed as
unavailable** — it never crashes the CLI, and the offline **Mock** provider is
always available and the default.

| Provider | Required | Optional | If unset |
|---|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | — | unavailable |
| `openai` | `OPENAI_API_KEY` | `OPENAI_BASE_URL` (any OpenAI-API server) | unavailable |
| `google` | `GOOGLE_API_KEY` | — | unavailable |
| `local` | `LOCAL_BASE_URL`, `LOCAL_MODEL` | `LOCAL_API_KEY` | unavailable |
| `mock` | — | `MOCK_SEED` | **always available (default)** |

Real adapters are best-effort / non-deterministic (temperature 0 where the model
supports it) and are **never** exercised in tests/CI (no keys). Only the Mock
path is deterministic and byte-identical across runs.

See [`docs/fix-engine/02-provider-abstraction.md`](../docs/fix-engine/02-provider-abstraction.md)
and [`docs/fix-engine/01-harness-architecture.md`](../docs/fix-engine/01-harness-architecture.md)
for the full provider/loop contract.

---

## Layout

```
src/
  cli/        index.ts (entry) · render.ts (transcript) · term.ts (ANSI)
  providers/  types.ts · mock.ts · {anthropic,openai,google,local}.ts · registry.ts
  tools/      types.ts · registry.ts · catalog.ts · diagnostics.ts
  backends/   simulated execution backends per asset class
  loop/       session.ts (runSession) · budget.ts
  shared/     fleet.ts (DB → assets) · clock.ts (seeded clock + PRNG)
  types.ts    FixSession / FixState / FixPlan / transcript / ApprovalResolver
```
