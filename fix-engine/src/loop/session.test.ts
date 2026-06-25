import { describe, it, expect, afterEach } from "vitest";
import { runSession } from "./session";
import { MockProvider } from "../providers/mock";
import { ToolRegistry, STUB_TOOLS, defaultRegistry } from "../tools/registry";
import { DB, resetFleet } from "../shared/fleet";
import type { ApprovalResolver } from "../types";
import type { ToolHandler } from "../tools/types";
import type { ModelProvider, ChatEvent } from "../providers/types";

// A provider that streams an `error` event mid-turn (e.g. an upstream 503) and
// emits NO tool calls — the exact shape that used to fall through to the
// "model is done" branch and overwrite the honest "failed" state (#1).
const erroringProvider: ModelProvider = {
  id: "mock",
  label: "Erroring",
  available: () => true,
  listModels: () => [],
  async *chat(): AsyncIterable<ChatEvent> {
    yield { type: "text", delta: "Reading the failure…" };
    yield { type: "error", message: "upstream 503" };
  },
};

// A successful run heals the shared module-level DB; restore the seeded failing
// state after every test so order/shuffle can't change outcomes (finding #7).
afterEach(resetFleet);

const provider = new MockProvider();
const assetId = (DB.assets.find((a) => a.status === "failed") ?? DB.assets[0]).id;

function gatedRegistry(): ToolRegistry {
  const tools: ToolHandler[] = STUB_TOOLS.map((h) =>
    h.spec.risk === "read"
      ? h
      : { ...h, spec: { ...h.spec, requiresApproval: true } },
  );
  return new ToolRegistry(tools);
}

describe("fix-engine M1 — agent loop", () => {
  it("resolves a failure end-to-end with the Mock provider", async () => {
    const s = await runSession(
      { assetId, mode: "ai", model: { provider: "mock", model: "mock-fixer-1" } },
      { provider, registry: defaultRegistry() },
    );
    expect(s.state).toBe("succeeded");
    expect(s.result?.healed).toBe(true);
    // The default registry now serves the real catalog: the plan is the
    // asset-correct tool set (≥1 triage diagnostic + 1 remediation + 1 verify).
    expect(s.plan?.steps.length).toBeGreaterThanOrEqual(3);
    const phases = s.plan?.steps.map((st) => st.intent) ?? [];
    expect(phases).toContain("Apply primary remediation");
    expect(phases).toContain("Verify protection restored");
    expect(s.transcript.length).toBeGreaterThan(5);
    expect(s.result?.actionRunIds.length).toBeGreaterThanOrEqual(1);
    expect(s.usage.toolCalls).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic — same inputs ⇒ byte-identical transcript", async () => {
    const a = await runSession(
      { assetId, mode: "ai", model: { provider: "mock", model: "mock-fixer-1" } },
      { provider, registry: defaultRegistry() },
    );
    // Both runs must start from the SAME (seeded, failing) state — run a healed
    // the shared DB, so reset before run b or the transcripts diverge (#7).
    resetFleet();
    const b = await runSession(
      { assetId, mode: "ai", model: { provider: "mock", model: "mock-fixer-1" } },
      { provider, registry: defaultRegistry() },
    );
    expect(JSON.stringify(a.transcript)).toBe(JSON.stringify(b.transcript));
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
  });

  it("enforces the budget — a tiny maxSteps halts the session", async () => {
    const s = await runSession(
      {
        assetId,
        mode: "ai",
        model: { provider: "mock", model: "mock-fixer-1" },
        budget: { maxSteps: 1 },
      },
      { provider, registry: defaultRegistry() },
    );
    expect(s.state).toBe("halted");
  });

  it("halts when a gated step is rejected", async () => {
    const reject: ApprovalResolver = async () => "reject";
    const s = await runSession(
      { assetId, mode: "ai", model: { provider: "mock", model: "mock-fixer-1" } },
      { provider, registry: gatedRegistry(), approve: reject },
    );
    expect(s.state).toBe("halted");
    expect(s.transcript.some((t) => t.kind === "approval")).toBe(true);
  });

  it("treats a provider error as a terminal 'failed' — not overwritten by the done branch (#1)", async () => {
    const s = await runSession(
      { assetId, mode: "ai", model: { provider: "mock", model: "mock-fixer-1" } },
      { provider: erroringProvider, registry: defaultRegistry() },
    );
    // The honest terminal stands; the calls.length===0 fall-through must NOT
    // relabel it "escalated"/"partial"/"succeeded".
    expect(s.state).toBe("failed");
    expect(s.result?.healed).not.toBe(true);
  });

  it("proceeds when a gated step is approved", async () => {
    const approve: ApprovalResolver = async () => "approve";
    const s = await runSession(
      { assetId, mode: "ai", model: { provider: "mock", model: "mock-fixer-1" } },
      { provider, registry: gatedRegistry(), approve },
    );
    expect(s.state).toBe("succeeded");
  });
});
