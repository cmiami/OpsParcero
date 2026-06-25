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
      { id: "i1", impactedAssetIds: ["a", "b"] },
      { id: "i2", impactedAssetIds: ["c"] },
    ] as Issue[];
    const out = applyIssueResolution(issues, {
      a: { status: "protected", resolvedAt: "t" },
      b: { status: "protected", resolvedAt: "t" },
    });
    expect(out.map((i) => i.id)).toEqual(["i2"]);
  });

  it("keeps a partially-healed issue", () => {
    const issues = [{ id: "i1", impactedAssetIds: ["a", "b"] }] as Issue[];
    const out = applyIssueResolution(issues, {
      a: { status: "protected", resolvedAt: "t" },
    });
    expect(out).toHaveLength(1);
  });
});
