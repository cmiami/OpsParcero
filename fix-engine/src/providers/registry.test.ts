/**
 * Registry tests — key-free by construction. We clear every provider env var in
 * beforeEach so the suite asserts the no-credentials baseline (CI never has keys
 * and never makes a network call): Mock is always available; the four real
 * providers are constructible but report available()=false; listAvailableModels()
 * always contains the Mock model.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ProviderRegistry, defaultProviderRegistry } from "./registry";
import { MockProvider } from "./mock";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { GoogleProvider } from "./google";
import { LocalProvider } from "./local";
import type { ProviderId } from "./types";

const KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "GOOGLE_API_KEY",
  "LOCAL_BASE_URL",
  "LOCAL_MODEL",
  "LOCAL_API_KEY",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterAll(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("fix-engine M3 — provider registry", () => {
  it("constructs all five providers without throwing", () => {
    expect(() => new MockProvider()).not.toThrow();
    expect(() => new AnthropicProvider()).not.toThrow();
    expect(() => new OpenAIProvider()).not.toThrow();
    expect(() => new GoogleProvider()).not.toThrow();
    expect(() => new LocalProvider()).not.toThrow();
    expect(() => defaultProviderRegistry()).not.toThrow();
  });

  it("Mock is always available with ≥1 model", async () => {
    const reg = defaultProviderRegistry();
    expect(reg.isAvailable("mock")).toBe(true);
    const models = await reg.getProvider("mock").listModels();
    expect(models.length).toBeGreaterThanOrEqual(1);
  });

  it("the four real providers report available()=false with no env keys", () => {
    const reg = defaultProviderRegistry();
    for (const id of ["anthropic", "openai", "google", "local"] as ProviderId[]) {
      expect(reg.isAvailable(id)).toBe(false);
    }
  });

  it("an unconfigured real provider lists no models (never throws)", async () => {
    const reg = defaultProviderRegistry();
    for (const id of ["anthropic", "openai", "google", "local"] as ProviderId[]) {
      const provider = reg.getProvider(id);
      expect(provider.available()).toBe(false);
      await expect(Promise.resolve(provider.listModels())).resolves.toEqual([]);
    }
  });

  it("listAvailableModels always includes the Mock model (and only Mock with no keys)", async () => {
    const reg = defaultProviderRegistry();
    const models = await reg.listAvailableModels();
    const mockModelId = (await reg.getProvider("mock").listModels())[0].id;
    expect(models.some((m) => m.id === mockModelId)).toBe(true);
    // With no keys, every advertised model belongs to Mock.
    expect(models.every((m) => m.provider === "mock")).toBe(true);
  });

  it("listings() reports each provider with its availability flag", async () => {
    const reg = defaultProviderRegistry();
    const listings = await reg.listings();
    const ids = listings.map((l) => l.id);
    for (const id of ["mock", "anthropic", "openai", "google", "local"] as ProviderId[]) {
      expect(ids).toContain(id);
    }
    const mock = listings.find((l) => l.id === "mock");
    expect(mock?.available).toBe(true);
    expect((mock?.models.length ?? 0)).toBeGreaterThanOrEqual(1);
    for (const id of ["anthropic", "openai", "google", "local"] as ProviderId[]) {
      const l = listings.find((x) => x.id === id);
      expect(l?.available).toBe(false);
      expect(l?.models).toEqual([]);
    }
  });

  it("getProvider throws only on an unknown provider id", () => {
    const reg = defaultProviderRegistry();
    expect(() => reg.getProvider("nope" as ProviderId)).toThrow();
    expect(() => reg.getProvider("mock")).not.toThrow();
  });

  it("resolveProvider returns the provider + info=undefined for an unconfigured one", async () => {
    const reg = defaultProviderRegistry();
    const r = await reg.resolveProvider({ provider: "anthropic", model: "claude-opus-4-8" });
    expect(r.provider.id).toBe("anthropic");
    expect(r.info).toBeUndefined(); // no key ⇒ no models ⇒ no match, but no throw
  });

  it("resolveProvider resolves a Mock model to its info", async () => {
    const reg = defaultProviderRegistry();
    const mockModelId = (await reg.getProvider("mock").listModels())[0].id;
    const r = await reg.resolveProvider({ provider: "mock", model: mockModelId });
    expect(r.provider.id).toBe("mock");
    expect(r.info?.id).toBe(mockModelId);
  });

  it("registry.chat falls back to Mock when the requested provider is unavailable", async () => {
    const reg = defaultProviderRegistry();
    const events: string[] = [];
    for await (const ev of reg.chat(
      { provider: "anthropic", model: "claude-opus-4-8" },
      { system: "", messages: [{ role: "user", content: "hi" }], tools: [] },
    )) {
      events.push(ev.type);
      if (ev.type === "done" || ev.type === "error") break;
    }
    // Mock fallback produces a well-formed stream (no network, no key needed).
    expect(events).toContain("done");
    expect(events).not.toContain("error");
  });
});
