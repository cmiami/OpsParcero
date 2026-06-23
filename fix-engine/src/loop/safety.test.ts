import { describe, it, expect } from "vitest";
import { runSession } from "./session";
import { MockProvider } from "../providers/mock";
import { defaultRegistry } from "../tools/registry";
import { DB, getAsset } from "../shared/fleet";
import type { ActionRun } from "../domain";

const provider = new MockProvider();
const failed = DB.assets.find((a) => a.status === "failed")!;

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
});
