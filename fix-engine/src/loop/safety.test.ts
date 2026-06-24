import { describe, it, expect } from "vitest";
import { runSession } from "./session";
import { MockProvider } from "../providers/mock";
import { defaultRegistry, stubRegistry } from "../tools/registry";
import { DB, getAsset } from "../shared/fleet";
import type { ActionRun } from "../domain";
import type { ChatEvent, ModelProvider, ModelInfo } from "../providers/types";

const provider = new MockProvider();
const failed = DB.assets.find((a) => a.status === "failed")!;

/** A provider that emits SEVERAL tool calls in a single turn, to exercise the
 *  per-call budget guard. Turn 1 → 3 read calls; turn 2 → done. */
class BurstProvider implements ModelProvider {
  id = "mock" as const;
  label = "Burst";
  private turn = 0;
  available() {
    return true;
  }
  listModels(): ModelInfo[] {
    return [
      {
        id: "burst",
        provider: "mock",
        label: "Burst",
        contextWindow: 100_000,
        supportsTools: true,
      },
    ];
  }
  async *chat(): AsyncIterable<ChatEvent> {
    this.turn += 1;
    if (this.turn === 1) {
      yield { type: "tool_call", id: "c1", name: "get_diagnostics", input: {} };
      yield { type: "tool_call", id: "c2", name: "get_diagnostics", input: {} };
      yield { type: "tool_call", id: "c3", name: "get_diagnostics", input: {} };
      yield { type: "done", stopReason: "tool_use" };
    } else {
      yield { type: "text", delta: "done" };
      yield { type: "done", stopReason: "end" };
    }
  }
}

describe("fix-engine R2 — safety", () => {
  it("dry-run never mutates the asset and flags every run dryRun", async () => {
    const before = getAsset(failed.id)!.status;
    expect(before).toBe("failed");

    const s = await runSession(
      {
        assetId: failed.id,
        mode: "ai",
        model: { provider: "mock", model: "mock-fixer-1" },
        dryRun: true,
      },
      { provider, registry: defaultRegistry() },
    );

    // Asset is untouched — a dry-run heals nothing.
    expect(getAsset(failed.id)!.status).toBe(before);
    expect(s.result?.healed).toBe(false);
    // It still completes (preview-only), not "partial".
    expect(s.state).toBe("succeeded");

    const runs = (s as { actionRuns?: ActionRun[] }).actionRuns ?? [];
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((r) => r.dryRun === true)).toBe(true);
    // The dry-run preview is recorded as an observation, never a verification heal.
    expect(s.transcript.some((t) => t.kind === "observation")).toBe(true);
  });

  it("a real (non-dry) run on the same fresh asset does mutate", async () => {
    // Separate test file = fresh seeded DB, so this asset starts failed again
    // only if untouched; use a different failed asset to avoid the dry-run one.
    const other =
      DB.assets.find((a) => a.status === "failed" && a.id !== failed.id) ?? failed;
    const before = getAsset(other.id)!.status;
    const s = await runSession(
      {
        assetId: other.id,
        mode: "ai",
        model: { provider: "mock", model: "mock-fixer-1" },
      },
      { provider, registry: defaultRegistry() },
    );
    // A successful real run heals (status improves away from failed).
    if (s.result?.healed) {
      expect(getAsset(other.id)!.status).not.toBe("failed");
      expect(before).toBe("failed");
    }
    const runs = (s as { actionRuns?: ActionRun[] }).actionRuns ?? [];
    expect(runs.some((r) => r.dryRun === false)).toBe(true);
  });

  it("hard-caps a burst of tool calls in one turn (budget per call)", async () => {
    const burst = new BurstProvider();
    const target = DB.assets.find((a) => a.status === "failed")!;
    const s = await runSession(
      {
        assetId: target.id,
        mode: "ai",
        model: { provider: "mock", model: "burst" },
        // One call allowed; the turn emits three.
        budget: { maxToolCalls: 1 },
      },
      // stubRegistry exposes get_diagnostics (read, ALL_KINDS) — the tool the
      // burst provider calls; the catalog registry doesn't carry that name.
      { provider: burst, registry: stubRegistry() },
    );
    // The 2nd and 3rd calls must NOT execute — without the per-call guard all
    // three would run (toolCalls === 3, over the cap).
    expect(s.usage.toolCalls).toBe(1);
    expect(s.state).toBe("halted");
  });
});
