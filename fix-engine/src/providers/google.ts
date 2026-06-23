/**
 * Google Gemini adapter — @google/genai generateContentStream.
 *
 * Gemini's shapes differ most from the unified model, so this adapter does the
 * most translation (docs/fix-engine/02-provider-abstraction.md §3.3):
 *
 *   ChatRequest mapping
 *     system               → config.systemInstruction
 *     messages             → contents[] (role "user" | "model"); text → {text} part
 *     tools (ToolSpec[])   → config.tools = [{ functionDeclarations: [{name,description,parametersJsonSchema}] }]
 *     toolChoice           → config.toolConfig.functionCallingConfig.mode (AUTO|ANY|NONE)
 *     maxTokens            → config.maxOutputTokens
 *     temperature          → config.temperature (Gemini accepts it)
 *     {role:"tool",name,…} → a USER content with a functionResponse part (Gemini keys
 *                            responses by NAME, not id — see synthId note below)
 *     assistant + toolCalls → a MODEL content whose parts include functionCall parts
 *
 *   Stream → ChatEvent
 *     part {text}                       → {type:"text"}
 *     part {functionCall:{name,args}}   → {type:"tool_call", id:synthId, input:args}
 *     usageMetadata (final chunk)       → {type:"usage", in:promptTokenCount, out:candidatesTokenCount}
 *     candidates[0].finishReason        → normalized; SAFETY/RECITATION/… → error
 *
 * Gemini keys function responses by function NAME, not an id; we synthesize a
 * toolCallId as `name + ":" + callIndex` so the loop's bookkeeping is uniform
 * (one in-flight call per name per turn — see the open-decision note in §02-3.3).
 *
 * Best-effort / non-deterministic. NEVER called in tests/CI (no key). available()
 * gates on GOOGLE_API_KEY.
 */
import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  type Content,
  type Part,
  type FunctionDeclaration,
  type GenerateContentResponse,
} from "@google/genai";
import type {
  ChatEvent,
  ChatRequest,
  ChatStopReason,
  ModelInfo,
  ModelProvider,
  ProviderId,
} from "./types";
import type { ToolSpec } from "../tools/types";

const GEMINI_MODELS: ModelInfo[] = [
  {
    id: "gemini-2.5-pro",
    provider: "google",
    label: "Gemini 2.5 Pro (planning)",
    contextWindow: 1_000_000,
    supportsTools: true,
    costPer1kIn: 0.00125,
    costPer1kOut: 0.01,
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    label: "Gemini 2.5 Flash (triage)",
    contextWindow: 1_000_000,
    supportsTools: true,
    costPer1kIn: 0.0003,
    costPer1kOut: 0.0025,
  },
];

/** ToolSpec[] → Gemini functionDeclarations. */
export function toFunctionDeclarations(tools: ToolSpec[]): FunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    // Our inputSchema is JSON Schema; parametersJsonSchema is the JSON-Schema slot.
    parametersJsonSchema: t.inputSchema,
  }));
}

/** Our ChatMessage[] → Gemini contents[]. */
export function toGeminiContents(req: ChatRequest): Content[] {
  const out: Content[] = [];
  for (const m of req.messages) {
    if (m.role === "tool") {
      out.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.name,
              response: { content: m.content },
            },
          },
        ],
      });
      continue;
    }
    if (m.role === "assistant" && "toolCalls" in m && m.toolCalls.length > 0) {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls) {
        parts.push({
          functionCall: {
            id: tc.id,
            name: tc.name,
            args: (tc.input ?? {}) as Record<string, unknown>,
          },
        });
      }
      out.push({ role: "model", parts });
      continue;
    }
    out.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  return out;
}

function toFunctionCallingMode(
  choice: ChatRequest["toolChoice"],
): FunctionCallingConfigMode | undefined {
  switch (choice) {
    case "required":
      return FunctionCallingConfigMode.ANY;
    case "none":
      return FunctionCallingConfigMode.NONE;
    case "auto":
      return FunctionCallingConfigMode.AUTO;
    default:
      return undefined;
  }
}

/** Gemini finishReason → normalized stopReason (or null when it should error). */
function normalizeFinish(reason: string | undefined): ChatStopReason | "error" {
  switch (reason) {
    case undefined:
    case "STOP":
      return "end"; // (with functionCall parts present, the caller treats it as tool_use)
    case "MAX_TOKENS":
      return "max_tokens";
    case "SAFETY":
    case "RECITATION":
    case "PROHIBITED_CONTENT":
    case "BLOCKLIST":
    case "SPII":
    case "MALFORMED_FUNCTION_CALL":
      return "error";
    default:
      return "end";
  }
}

export class GoogleProvider implements ModelProvider {
  id: ProviderId = "google";
  label = "Google (Gemini)";

  available(): boolean {
    return !!process.env.GOOGLE_API_KEY;
  }

  listModels(): ModelInfo[] {
    return this.available() ? GEMINI_MODELS : [];
  }

  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      yield { type: "error", message: "GOOGLE_API_KEY is not set." };
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const mode = toFunctionCallingMode(req.toolChoice);

    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: ChatStopReason = "end";
    let sawToolCall = false;
    let callIndex = 0;

    try {
      const stream = await ai.models.generateContentStream({
        model: req.model,
        contents: toGeminiContents(req),
        config: {
          ...(req.system ? { systemInstruction: req.system } : {}),
          ...(req.tools.length
            ? {
                tools: [{ functionDeclarations: toFunctionDeclarations(req.tools) }],
                ...(mode
                  ? { toolConfig: { functionCallingConfig: { mode } } }
                  : {}),
              }
            : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
          abortSignal: signal,
        },
      });

      for await (const chunk of stream as AsyncGenerator<GenerateContentResponse>) {
        // Usage (accumulated; final chunk carries the totals).
        const usage = chunk.usageMetadata;
        if (usage) {
          inputTokens = usage.promptTokenCount ?? inputTokens;
          outputTokens = usage.candidatesTokenCount ?? outputTokens;
        }

        const candidate = chunk.candidates?.[0];
        const parts = candidate?.content?.parts ?? [];
        for (const part of parts) {
          if (typeof part.text === "string" && part.text.length > 0) {
            yield { type: "text", delta: part.text };
          }
          if (part.functionCall) {
            sawToolCall = true;
            const name = part.functionCall.name ?? "unknown";
            const id = part.functionCall.id ?? `${name}:${callIndex++}`;
            yield {
              type: "tool_call",
              id,
              name,
              input: part.functionCall.args ?? {},
            };
          }
        }

        if (candidate?.finishReason) {
          const norm = normalizeFinish(candidate.finishReason);
          if (norm === "error") {
            yield {
              type: "error",
              message: `Gemini stopped: ${candidate.finishReason}.`,
            };
            return;
          }
          stopReason = norm;
        }
      }

      yield { type: "usage", inputTokens, outputTokens };
      // STOP + functionCall parts present ⇒ the model wants tools → tool_use.
      yield { type: "done", stopReason: sawToolCall ? "tool_use" : stopReason };
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (signal?.aborted || err?.name === "AbortError") {
        yield { type: "error", message: "aborted" };
        return;
      }
      yield { type: "error", message: err?.message ?? "Gemini request failed" };
    }
  }
}
