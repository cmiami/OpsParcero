/**
 * Provider registry — the single seam the loop/server/CLI resolve a model
 * through, so nothing else branches on provider identity
 * (docs/fix-engine/02-provider-abstraction.md §6).
 *
 * Holds the Mock provider (always available, offline default) plus the four real
 * adapters (Anthropic, OpenAI, Google, Local). A provider whose env var(s) are
 * missing is still LISTED — it just reports available()=false and listModels()=[].
 * Resolution NEVER throws on a missing key; the only failure is an unknown
 * provider id or a model id that doesn't belong to its provider. This keeps CI
 * key-free: with no env keys, only Mock contributes models.
 */
import type {
  ChatRequest,
  ChatEvent,
  ModelInfo,
  ModelProvider,
  ProviderId,
} from "./types";
import { MockProvider } from "./mock";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { GoogleProvider } from "./google";
import { LocalProvider } from "./local";

/** A model reference: which provider + which model id. */
export interface ModelRef {
  provider: ProviderId;
  model: string;
}

/** What the /models endpoint and ModelPicker render per provider. */
export interface ProviderListing {
  id: ProviderId;
  label: string;
  available: boolean;
  models: ModelInfo[];
}

export class ProviderRegistry {
  private byId = new Map<ProviderId, ModelProvider>();

  constructor(providers?: ModelProvider[]) {
    const list = providers ?? [
      new MockProvider(),
      new AnthropicProvider(),
      new OpenAIProvider(),
      new GoogleProvider(),
      new LocalProvider(),
    ];
    for (const p of list) this.byId.set(p.id, p);
  }

  /** All providers in a stable order (Mock first), regardless of availability. */
  providers(): ModelProvider[] {
    const order: ProviderId[] = ["mock", "anthropic", "openai", "google", "local"];
    const seen = new Set<ProviderId>();
    const out: ModelProvider[] = [];
    for (const id of order) {
      const p = this.byId.get(id);
      if (p) {
        out.push(p);
        seen.add(id);
      }
    }
    // Any extra (custom) providers appended after the canonical order.
    for (const [id, p] of this.byId) if (!seen.has(id)) out.push(p);
    return out;
  }

  /** Get a provider by id. Throws only on an unknown id (a programming error). */
  getProvider(id: ProviderId): ModelProvider {
    const p = this.byId.get(id);
    if (!p) throw new Error(`[fix-engine] unknown provider: ${id}`);
    return p;
  }

  /** Whether a provider is configured (has its env var / is Mock). */
  isAvailable(id: ProviderId): boolean {
    return this.byId.get(id)?.available() ?? false;
  }

  /**
   * Every model from every AVAILABLE provider (Mock always contributes). Used by
   * the ModelPicker / `fix-engine models`. Missing-key providers add nothing —
   * they never throw.
   */
  async listAvailableModels(): Promise<ModelInfo[]> {
    const out: ModelInfo[] = [];
    for (const p of this.providers()) {
      if (!p.available()) continue;
      out.push(...(await p.listModels()));
    }
    return out;
  }

  /** Per-provider listing (availability + models) for the /models endpoint. */
  async listings(): Promise<ProviderListing[]> {
    const out: ProviderListing[] = [];
    for (const p of this.providers()) {
      const available = p.available();
      out.push({
        id: p.id,
        label: p.label,
        available,
        models: available ? await p.listModels() : [],
      });
    }
    return out;
  }

  /**
   * Resolve a model reference to its provider + info. Never throws on a missing
   * key — but a model id that doesn't belong to the named provider (or a provider
   * that has no models because it's unconfigured) returns info=undefined so the
   * caller can fall back to Mock per the §7 fallback chain.
   */
  async resolveProvider(
    ref: ModelRef,
  ): Promise<{ provider: ModelProvider; info?: ModelInfo }> {
    const provider = this.getProvider(ref.provider);
    const models = provider.available() ? await provider.listModels() : [];
    const info = models.find((m) => m.id === ref.model);
    return { provider, info };
  }

  /**
   * Convenience: a streaming chat against a resolved reference. Falls back to the
   * Mock provider's first model when the requested provider is unavailable, so a
   * demo never dead-ends with no keys (the §7 always-available fallback).
   */
  async *chat(ref: ModelRef, req: Omit<ChatRequest, "model">, signal?: AbortSignal): AsyncIterable<ChatEvent> {
    const provider = this.getProvider(ref.provider);
    if (provider.available()) {
      yield* provider.chat({ ...req, model: ref.model }, signal);
      return;
    }
    const mock = this.getProvider("mock");
    const [fallback] = await mock.listModels();
    yield* mock.chat({ ...req, model: fallback?.id ?? ref.model }, signal);
  }
}

/** A default registry wired with Mock + the four real adapters. */
export function defaultProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}
