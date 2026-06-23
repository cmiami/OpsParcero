/**
 * Anthropic adapter — Messages API via @anthropic-ai/sdk.
 *
 * Streams client.messages.stream({ model, system, messages, tools, max_tokens })
 * and normalizes the SSE event stream into our unified ChatEvent stream
 * (docs/fix-engine/02-provider-abstraction.md §3.1):
 *
 *   ChatRequest mapping
 *     system               → system (string)
 *     messages             → content-block messages (see toAnthropicMessages)
 *     tools (ToolSpec[])   → [{ name, description, input_schema }] (name-sorted, cache-stable)
 *     toolChoice auto/req/none → tool_choice {type: auto|any|none}
 *     maxTokens            → max_tokens (default 8192 here; streaming required for very large)
 *     temperature          → DROPPED on models that reject it (Opus 4.8/4.7) — see TEMPERATURE_OK
 *
 *   Stream → ChatEvent
 *     content_block_delta(text_delta)        → {type:"text"}
 *     content_block_start(tool_use)          → begin buffering (id, name)
 *     content_block_delta(input_json_delta)  → append to that call's JSON buffer
 *     content_block_stop (tool_use)          → {type:"tool_call", input: JSON.parse(buffer)}
 *     message_start.usage + message_delta.usage → one {type:"usage"} (cache tokens folded in)
 *     message_delta.stop_reason              → {type:"done", stopReason}
 *     stop_reason "refusal"                  → {type:"error"} (loop escalates, never a clean turn)
 *
 * Model ids are config (see CLAUDE_MODELS) — claude-opus-4-8 for planning,
 * claude-haiku-4-5 for cheap triage, claude-sonnet-4-6 as a mid tier. Per the
 * /claude-api reference, claude-opus-4-8 (and 4.7) reject temperature/top_p/top_k
 * (400), so the adapter drops temperature for those ids and steers via the prompt.
 *
 * Best-effort / non-deterministic. NEVER called in tests/CI (no key). available()
 * gates purely on ANTHROPIC_API_KEY; the SDK resolves the key from the env.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlockParam,
  ToolUnion,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ChatEvent,
  ChatRequest,
  ChatStopReason,
  ModelInfo,
  ModelProvider,
  ProviderId,
} from "./types";
import type { ToolSpec } from "../tools/types";

/**
 * Current Claude model ids (config — consult /claude-api for the live set).
 * claude-opus-4-8: planning tier. claude-haiku-4-5: cheap triage. Pricing per the
 * cached /claude-api catalog ($ per 1k tokens). `acceptsTemperature` flags whether
 * the adapter may forward `temperature` (Opus 4.8 rejects it with a 400).
 */
interface ClaudeModel extends ModelInfo {
  acceptsTemperature: boolean;
  /** Largest streamable max_tokens for this model. */
  maxOutput: number;
}

const CLAUDE_MODELS: ClaudeModel[] = [
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude Opus 4.8 (planning)",
    contextWindow: 1_000_000,
    supportsTools: true,
    costPer1kIn: 0.005,
    costPer1kOut: 0.025,
    acceptsTemperature: false,
    maxOutput: 64_000,
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    contextWindow: 1_000_000,
    supportsTools: true,
    costPer1kIn: 0.003,
    costPer1kOut: 0.015,
    acceptsTemperature: true,
    maxOutput: 64_000,
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5 (triage)",
    contextWindow: 200_000,
    supportsTools: true,
    costPer1kIn: 0.001,
    costPer1kOut: 0.005,
    acceptsTemperature: true,
    maxOutput: 32_000,
  },
];

const DEFAULT_MAX_TOKENS = 8192;

function modelMeta(id: string): ClaudeModel | undefined {
  return CLAUDE_MODELS.find((m) => m.id === id);
}

/** ToolSpec[] → Anthropic tools, sorted by name for prompt-cache stability. */
export function toAnthropicTools(tools: ToolSpec[]): ToolUnion[] {
  return [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as ToolUnion extends { input_schema: infer S } ? S : never,
    })) as ToolUnion[];
}

/**
 * Our ChatMessage[] → Anthropic content-block messages.
 *  • user/assistant text   → a single text block
 *  • assistant + toolCalls  → text block (if any) + one tool_use block per call
 *  • {role:"tool",…}        → a USER message with a tool_result block; consecutive
 *                             tool results are batched into one user message (the
 *                             API trains the model away from parallel calls if split)
 */
export function toAnthropicMessages(req: ChatRequest): MessageParam[] {
  const out: MessageParam[] = [];

  const flushToolResults = (blocks: ContentBlockParam[]) => {
    if (blocks.length) out.push({ role: "user", content: blocks });
  };

  let pendingToolResults: ContentBlockParam[] = [];

  for (const m of req.messages) {
    if (m.role === "tool") {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content,
      });
      continue;
    }
    // A non-tool message ends any run of tool results.
    if (pendingToolResults.length) {
      flushToolResults(pendingToolResults);
      pendingToolResults = [];
    }

    if (m.role === "assistant" && "toolCalls" in m && m.toolCalls.length > 0) {
      const blocks: ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: (tc.input ?? {}) as Record<string, unknown>,
        });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    out.push({ role: m.role, content: [{ type: "text", text: m.content }] });
  }

  if (pendingToolResults.length) flushToolResults(pendingToolResults);
  return out;
}

function toToolChoice(
  choice: ChatRequest["toolChoice"],
): { type: "auto" } | { type: "any" } | { type: "none" } | undefined {
  switch (choice) {
    case "required":
      return { type: "any" };
    case "none":
      return { type: "none" };
    case "auto":
      return { type: "auto" };
    default:
      return undefined;
  }
}

/** Anthropic stop_reason → normalized stopReason. */
function normalizeStop(reason: string | null | undefined): ChatStopReason {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop";
    case "end_turn":
    default:
      return "end";
  }
}

/** A tool_use block being assembled from partial_json deltas, keyed by index. */
interface PendingToolUse {
  id: string;
  name: string;
  json: string;
}

export class AnthropicProvider implements ModelProvider {
  id: ProviderId = "anthropic";
  label = "Anthropic (Claude)";

  available(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  listModels(): ModelInfo[] {
    if (!this.available()) return [];
    // Strip adapter-only fields from the public ModelInfo.
    return CLAUDE_MODELS.map(({ acceptsTemperature: _t, maxOutput: _m, ...info }) => info);
  }

  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      yield { type: "error", message: "ANTHROPIC_API_KEY is not set." };
      return;
    }

    const client = new Anthropic({ apiKey });
    const meta = modelMeta(req.model);
    const maxTokens = Math.min(
      req.maxTokens ?? DEFAULT_MAX_TOKENS,
      meta?.maxOutput ?? DEFAULT_MAX_TOKENS,
    );

    // Drop temperature on models that reject it (Opus 4.8/4.7 → 400).
    const includeTemp = req.temperature !== undefined && (meta?.acceptsTemperature ?? false);

    const pending = new Map<number, PendingToolUse>();
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: ChatStopReason = "end";
    let errored: string | null = null;

    try {
      const stream = client.messages.stream(
        {
          model: req.model,
          max_tokens: maxTokens,
          system: req.system,
          messages: toAnthropicMessages(req),
          ...(req.tools.length
            ? {
                tools: toAnthropicTools(req.tools),
                ...(toToolChoice(req.toolChoice) ? { tool_choice: toToolChoice(req.toolChoice)! } : {}),
              }
            : {}),
          ...(includeTemp ? { temperature: req.temperature } : {}),
        },
        { signal },
      );

      for await (const ev of stream) {
        switch (ev.type) {
          case "message_start": {
            const u = ev.message.usage;
            // input + cache tokens folded into inputTokens for budget purposes.
            inputTokens +=
              (u.input_tokens ?? 0) +
              (u.cache_read_input_tokens ?? 0) +
              (u.cache_creation_input_tokens ?? 0);
            break;
          }
          case "content_block_start": {
            const block = ev.content_block;
            if (block.type === "tool_use") {
              pending.set(ev.index, { id: block.id, name: block.name, json: "" });
            }
            break;
          }
          case "content_block_delta": {
            const d = ev.delta;
            if (d.type === "text_delta") {
              yield { type: "text", delta: d.text };
            } else if (d.type === "input_json_delta") {
              const cur = pending.get(ev.index);
              if (cur) cur.json += d.partial_json;
            }
            break;
          }
          case "content_block_stop": {
            const cur = pending.get(ev.index);
            if (cur) {
              pending.delete(ev.index);
              let input: unknown = {};
              try {
                input = cur.json ? JSON.parse(cur.json) : {};
              } catch {
                errored = `Could not parse tool input for "${cur.name}".`;
                break;
              }
              yield { type: "tool_call", id: cur.id, name: cur.name, input };
            }
            break;
          }
          case "message_delta": {
            if (ev.usage?.output_tokens) outputTokens = ev.usage.output_tokens;
            const reason = ev.delta.stop_reason;
            if (reason === "refusal") {
              errored = "Claude refused the request (safety stop).";
            } else {
              stopReason = normalizeStop(reason);
            }
            break;
          }
          default:
            break;
        }
        if (errored) break;
      }

      if (errored) {
        yield { type: "error", message: errored };
        return;
      }

      yield { type: "usage", inputTokens, outputTokens };
      yield { type: "done", stopReason };
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (signal?.aborted || err?.name === "AbortError") {
        yield { type: "error", message: "aborted" };
        return;
      }
      yield { type: "error", message: err?.message ?? "Anthropic request failed" };
    }
  }
}
