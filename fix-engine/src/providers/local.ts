/**
 * Local self-hosted adapter — a model running on a networked device that speaks
 * the OpenAI Chat Completions wire format (vLLM with `/v1`, an Ollama server's
 * OpenAI-compatible endpoint, etc.). Covers e.g. Kimi K2.6 / Gemma 4 on an
 * on-prem GPU box.
 *
 * It REUSES the OpenAI normalization (streamOpenAICompat) verbatim — same
 * streaming, tool-call assembly, message mapping, and usage handling — just with
 * baseURL = LOCAL_BASE_URL and a dummy/placeholder key (local servers usually
 * don't require one; if they do, LOCAL_API_KEY is read). All local models are
 * cost 0 (local: true), so the budget halt is driven by token/step/wall-clock
 * limits, not dollars.
 *
 * Config (env only — no secrets in code):
 *   LOCAL_BASE_URL  the device endpoint, e.g. http://localhost:11434/v1 or
 *                   http://vllm.lan:8000/v1   (required ⇒ provider available)
 *   LOCAL_MODEL     the model id, e.g. kimi-k2.6 / gemma-4
 *   LOCAL_API_KEY   optional bearer if the server enforces one
 */
import OpenAI from "openai";
import type {
  ChatEvent,
  ChatRequest,
  ModelInfo,
  ModelProvider,
  ProviderId,
} from "./types";
import { streamOpenAICompat } from "./openai";

const DEFAULT_LOCAL_MODEL = "local-model";

export class LocalProvider implements ModelProvider {
  id: ProviderId = "local";
  label = "Local (self-hosted)";

  available(): boolean {
    return !!process.env.LOCAL_BASE_URL;
  }

  listModels(): ModelInfo[] {
    if (!this.available()) return [];
    const id = process.env.LOCAL_MODEL ?? DEFAULT_LOCAL_MODEL;
    return [
      {
        id,
        provider: "local",
        label: `Local — ${id}`,
        // Self-hosted context windows vary by model/build; advertise a large,
        // conservative window. Tool support is model-dependent but the loop
        // requires it, so we declare true and let real failures surface.
        contextWindow: 128_000,
        supportsTools: true,
        local: true,
      },
    ];
  }

  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent> {
    const baseURL = process.env.LOCAL_BASE_URL;
    if (!baseURL) {
      yield { type: "error", message: "LOCAL_BASE_URL is not set." };
      return;
    }
    // Local servers typically ignore the key; pass a placeholder when none is set
    // so the SDK constructs. A real key (if the server enforces one) comes from env.
    const apiKey = process.env.LOCAL_API_KEY ?? "local-no-key";
    const client = new OpenAI({ apiKey, baseURL });

    // Honor LOCAL_MODEL when the caller didn't pin a specific local model id.
    const model = req.model || process.env.LOCAL_MODEL || DEFAULT_LOCAL_MODEL;

    yield* streamOpenAICompat(
      client,
      { id: "local", label: this.label, apiKey, baseURL, local: true },
      { ...req, model },
      signal,
    );
  }
}
