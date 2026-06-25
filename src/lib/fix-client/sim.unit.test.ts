import { describe, it, expect, afterEach } from "vitest";
import { SimFixClient } from "./sim";
import { ToolRegistry, STUB_TOOLS } from "@fix-engine/tools/registry";
import { DB, resetFleet } from "@fix-engine/shared/fleet";
import type { ToolHandler } from "@fix-engine/tools/types";
import type { FixSessionEvent, FixSessionHandle } from "./types";
import type { FixPlanStep } from "@fix-engine/types";

// A gated Sim run heals the shared module DB on success; restore the seeded
// failing state after each test so order can't change outcomes (#7).
afterEach(resetFleet);

// Force every non-read tool to require approval so the Mock loop pauses at a real
// gate — the default catalog auto-approves, so the approval path is otherwise
// unreachable from the Sim's public API.
function gatedRegistry(): ToolRegistry {
  const tools: ToolHandler[] = STUB_TOOLS.map((h) =>
    h.spec.risk === "read"
      ? h
      : { ...h, spec: { ...h.spec, requiresApproval: true } },
  );
  return new ToolRegistry(tools);
}

const assetId = (DB.assets.find((a) => a.status === "failed") ?? DB.assets[0]).id;

async function pullUntilGate(
  it: AsyncIterator<FixSessionEvent>,
): Promise<FixPlanStep> {
  for (;;) {
    const { value, done } = await it.next();
    if (done) throw new Error("stream ended before reaching a gate");
    if (value.type === "approval-request") return value.step;
  }
}

function newGatedClient(): SimFixClient {
  return new SimFixClient(gatedRegistry);
}

async function openGate(): Promise<{
  handle: FixSessionHandle;
  it: AsyncIterator<FixSessionEvent>;
  step: FixPlanStep;
}> {
  const handle = await newGatedClient().createSession({
    assetId,
    mode: "ai",
    model: { provider: "mock", model: "mock-fixer-1" },
  });
  const it = handle.stream()[Symbol.asyncIterator]();
  const step = await pullUntilGate(it);
  return { handle, it, step };
}

describe("SimFixClient approve — exact-step parity with the live engine (#3)", () => {
  it("ignores a mismatched step id (the gate stays open), like the server's 409", async () => {
    const { handle, it, step } = await openGate();

    // A wrong/blank step id must NOT resolve the only open gate.
    await handle.approve("not-the-open-step", "approve");

    // Proof it stayed open: pulling the next event blocks (the loop is still
    // awaiting the decision). A resolved gate would emit a post-gate event fast,
    // since the Mock loop is deterministic and in-memory.
    const next = it.next();
    const raced = await Promise.race([
      next.then(() => "advanced" as const),
      new Promise<"blocked">((r) => setTimeout(() => r("blocked"), 80)),
    ]);
    expect(raced).toBe("blocked");

    // The exact step id resolves it — the run advances and reaches a terminal.
    await handle.approve(step.id, "approve");
    let sawDone = false;
    let res = await next; // the now-unblocked post-gate IteratorResult
    for (; !res.done; res = await it.next()) {
      if (res.value.type === "done") {
        sawDone = true;
        break;
      }
    }
    expect(sawDone).toBe(true);
  });

  it("is idempotent when no gate is open (double-click safe)", async () => {
    const { handle, it, step } = await openGate();
    await handle.approve(step.id, "approve");
    // Second decision after the gate cleared is a no-op, never throws.
    await expect(handle.approve(step.id, "approve")).resolves.toBeUndefined();
    // Drain so the run can finish cleanly.
    for (;;) {
      const n = await it.next();
      if (n.done || n.value.type === "done") break;
    }
  });
});
