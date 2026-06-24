/**
 * OpenAI-compatible adapter — covers the public OpenAI API and any server that
 * speaks the Chat Completions wire format (vLLM, LM Studio, etc.). The local
 * self-hosted adapter (./local.ts) reuses the exact same normalization with a
 * different baseURL + a dummy key, so the streaming / tool-call / message-mapping
 * logic lives here once and both adapters share it.
 *
 * Normalization (per docs/fix-engine/02-provider-abstraction.md §3.2):
 *   • ChatRequest.system               → a {role:"system"} message prepended
 *   • ChatRequest.tools (ToolSpec[])   → [{type:"function", function:{name,description,parameters}}]
 *   • assistant turn w/ toolCalls      → {role:"assistant", content, tool_calls:[…]}
 *   • {role:"tool",toolCallId,…}       → {role:"tool", tool_call_id, content}
 *   • delta.content                    → {type:"text"}
 *   • delta.tool_calls[i] (by index)   → buffered → {type:"tool_call"} on finish
 *   • final chunk usage (include_usage)→ {type:"usage"}
 *   • finish_reason                    → normalized stopReason
 *
 * Real adapters are best-effort / non-deterministic (temperature 0 where the
 * server accepts it). They are NEVER exercised in tests/CI (no keys). No secrets
 * are read from anywhere but the environment.
 */
import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";
import type {
  ChatEvent,
  ChatRequest,
  ChatStopReason,
  ModelInfo,
  ModelProvider,
  ProviderId,
} from "./types";
import type { ToolSpec } from "../tools/types";
import { estimateTokens, renderPromptForEstimate } from "./usage";

/** Config shared by the hosted-OpenAI and local adapters. */
export interface OpenAICompatConfig {
  id: ProviderId;
  label: string;
  apiKey: string;
  baseURL?: string;
  /** Local servers (vLLM/Ollama) report zero metered cost. */
  local?: boolean;
}

/** Map our ToolSpec[] → OpenAI function tools. */
export function toOpenAITools(tools: ToolSpec[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

/** Map a ChatRequest.toolChoice → OpenAI tool_choice. */
function toToolChoice(
  choice: ChatRequest["toolChoice"],
): ChatCompletionToolChoiceOption | undefined {
  switch (choice) {
    case "required":
      return "required";
    case "none":
      return "none";
    case "auto":
      return "auto";
    default:
      return undefined;
  }
}

/** Map our messages (+ system) → OpenAI Chat Completions messages. */
export function toOpenAIMessages(req: ChatRequest): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  if (req.system) out.push({ role: "system", content: req.system });

  for (const m of req.messages) {
    if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
      continue;
    }
    if (m.role === "assistant" && "toolCalls" in m && m.toolCalls.length > 0) {
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
        })),
      });
      continue;
    }
    // plain user / assistant text
    out.push({ role: m.role, content: m.content } as ChatCompletionMessageParam);
  }
  return out;
}

/** finish_reason → normalized stopReason. */
function normalizeFinish(reason: string | null | undefined): ChatStopReason {
  switch (reason) {
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "stop":
    default:
      return "end";
  }
}

/** A tool call being assembled from streamed argument fragments, keyed by index. */
interface PendingToolCall {
  id: string;
  name: string;
  args: string;
}

/**
 * The shared streaming generator. Given a constructed OpenAI client + request,
 * yields the unified ChatEvent stream. Used verbatim by both the hosted-OpenAI
 * and the local self-hosted adapters.
 */
export async function* streamOpenAICompat(
  client: OpenAI,
  cfg: OpenAICompatConfig,
  req: ChatRequest,
  signal?: AbortSignal,
): AsyncIterable<ChatEvent> {
  const messages = toOpenAIMessages(req);
  const tools = req.tools.length ? toOpenAITools(req.tools) : undefined;

  const pending = new Map<number, PendingToolCall>();
  let stopReason: ChatStopReason = "end";
  let usageEmitted = false;
  let outputChars = 0;

  try {
    const stream = await client.chat.completions.create(
      {
        model: req.model,
        messages,
        ...(tools ? { tools, tool_choice: toToolChoice(req.toolChoice) ?? "auto" } : {}),
        // Local servers reject temperature on some models; the cheap-and-safe
        // default is to omit it unless the caller asked for a specific value.
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal },
    );

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      const choice = chunk.choices?.[0];

      // Usage rides the final chunk (when include_usage is honored).
      if (chunk.usage) {
        usageEmitted = true;
        yield {
          type: "usage",
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }

      if (!choice) continue;
      const delta = choice.delta;

      if (delta?.content) {
        outputChars += delta.content.length;
        yield { type: "text", delta: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          const cur = pending.get(idx) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          pending.set(idx, cur);
        }
      }

      if (choice.finish_reason) {
        stopReason = normalizeFinish(choice.finish_reason);
      }
    }

    // Flush completed tool calls (input fully assembled, parsed).
    for (const tc of pending.values()) {
      if (!tc.name) continue;
      let input: unknown = {};
      try {
        input = tc.args ? JSON.parse(tc.args) : {};
      } catch {
        // A server that streamed malformed JSON: surface as an error per §5/§7.
        yield {
          type: "error",
          message: `Could not parse tool arguments for "${tc.name}" from ${cfg.label}.`,
        };
        return;
      }
      yield {
        type: "tool_call",
        id: tc.id || `${cfg.id}-${tc.name}`,
        name: tc.name,
        input,
      };
    }

    // Estimation fallback when the server omitted usage (some vLLM/Ollama builds).
    if (!usageEmitted) {
      yield {
        type: "usage",
        inputTokens: estimateTokens(renderPromptForEstimate(req)),
        outputTokens: estimateTokens("x".repeat(outputChars)),
      };
    }

    yield { type: "done", stopReason };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (signal?.aborted || err?.name === "AbortError") {
      yield { type: "error", message: "aborted" };
      return;
    }
    yield { type: "error", message: err?.message ?? "OpenAI-compatible request failed" };
  }
}

/** Default registry entries for the hosted OpenAI provider. */
const OPENAI_MODELS: ModelInfo[] = [
  {
    id: "gpt-5",
    provider: "openai",
    label: "GPT-5",
    contextWindow: 400_000,
    supportsTools: true,
    costPer1kIn: 0.00125,
    costPer1kOut: 0.01,
  },
  {
    id: "gpt-5-mini",
    provider: "openai",
    label: "GPT-5 mini (cheap triage)",
    contextWindow: 400_000,
    supportsTools: true,
    costPer1kIn: 0.00025,
    costPer1kOut: 0.002,
  },
];

/**
 * Hosted OpenAI (or any OpenAI-API server via OPENAI_BASE_URL). Reads its key
 * from OPENAI_API_KEY. The agent loop never branches on provider identity — this
 * adapter normalizes everything into the same ChatEvent stream as the others.
 */
export class OpenAIProvider implements ModelProvider {
  id: ProviderId = "openai";
  label = "OpenAI";

  available(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  listModels(): ModelInfo[] {
    return this.available() ? OPENAI_MODELS : [];
  }

  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      yield { type: "error", message: "OPENAI_API_KEY is not set." };
      return;
    }
    const client = new OpenAI({
      apiKey,
      ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
    });
    yield* streamOpenAICompat(
      client,
      { id: "openai", label: "OpenAI", apiKey, baseURL: process.env.OPENAI_BASE_URL },
      req,
      signal,
    );
  }
}
