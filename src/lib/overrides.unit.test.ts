import { describe, it, expect } from "vitest";
import {
  applyOverrides,
  applyAlertOverrides,
  applyIssueResolution,
} from "@/lib/overrides";
import type { ProtectedAsset, Alert, Issue } from "@/types";

describe("applyOverrides", () => {
  it("overlays status for matching ids only", () => {
    const assets = [
      { id: "a", status: "failed" },
      { id: "b", status: "warning" },
    ] as ProtectedAsset[];
    const out = applyOverrides(assets, {
      a: { status: "protected", resolvedAt: "t" },
    });
    expect(out.find((x) => x.id === "a")!.status).toBe("protected");
    expect(out.find((x) => x.id === "b")!.status).toBe("warning");
  });
});

describe("applyAlertOverrides", () => {
  it("flips a matching alert's state to resolved, leaves others", () => {
    const alerts = [
      { id: "x", state: "open" },
      { id: "y", state: "open" },
    ] as Alert[];
    const out = applyAlertOverrides(alerts, {
      x: { state: "resolved", resolvedAt: "t" },
    });
    expect(out.find((a) => a.id === "x")!.state).toBe("resolved");
    expect(out.find((a) => a.id === "y")!.state).toBe("open");
  });
});

describe("applyIssueResolution", () => {
  it("drops an issue only when EVERY impacted asset is healed", () => {
    const issues = [
      { id: "i1", impactedAssetIds: ["a", "b"], occurrenceCount: 4 },
      { id: "i2", impactedAssetIds: ["c"], occurrenceCount: 1 },
    ] as Issue[];
    const out = applyIssueResolution(issues, {
      a: { status: "protected", resolvedAt: "t" },
      b: { status: "protected", resolvedAt: "t" },
    });
    expect(out.map((i) => i.id)).toEqual(["i2"]);
  });

  it("projects a partially-healed issue onto the still-impacted assets (#8)", () => {
    const issues = [
      { id: "i1", impactedAssetIds: ["a", "b", "c", "d"], occurrenceCount: 8 },
    ] as Issue[];
    const out = applyIssueResolution(issues, {
      a: { status: "protected", resolvedAt: "t" },
      b: { status: "protected", resolvedAt: "t" },
    });
    expect(out).toHaveLength(1);
    // Healed assets removed — the count no longer includes already-fixed assets.
    expect(out[0].impactedAssetIds).toEqual(["c", "d"]);
    // occurrenceCount scales with the remaining share (8 * 2/4 = 4), never below
    // one per still-impacted asset, so "{n} occurrences · {m} assets" stays sane.
    expect(out[0].occurrenceCount).toBe(4);
    expect(out[0].occurrenceCount).toBeGreaterThanOrEqual(
      out[0].impactedAssetIds.length,
    );
  });

  it("leaves an untouched issue's count and ids intact", () => {
    const issues = [
      { id: "i1", impactedAssetIds: ["a", "b"], occurrenceCount: 5 },
    ] as Issue[];
    const out = applyIssueResolution(issues, {
      z: { status: "protected", resolvedAt: "t" },
    });
    expect(out[0]).toBe(issues[0]); // same reference — no needless clone
  });
});
