import { describe, it, expect } from "vitest";
import {
  keepValid,
  cartStepSchema,
  automationPolicySchema,
  approvalRequestSchema,
} from "@/lib/schemas";

describe("keepValid (persisted-store rehydration guard, #12)", () => {
  it("returns [] for non-arrays", () => {
    expect(keepValid(null, cartStepSchema)).toEqual([]);
    expect(keepValid("nope", cartStepSchema)).toEqual([]);
    expect(keepValid(undefined, cartStepSchema)).toEqual([]);
  });

  it("keeps only schema-valid cart steps", () => {
    const valid = { uid: "u1", actionId: "a1", params: {}, scope: "once" };
    const kept = keepValid(
      [valid, { uid: "" }, { actionId: "a" }, "x"],
      cartStepSchema,
    );
    expect(kept).toHaveLength(1);
  });

  it("validates a policy's discriminated trigger union", () => {
    const valid = {
      id: "p1",
      orgId: "o",
      name: "n",
      trigger: { kind: "category", category: "c" },
      action: { kind: "action", refId: "r", params: {} },
      enabled: false,
    };
    const badTrigger = { ...valid, id: "p2", trigger: { kind: "bogus" } };
    expect(keepValid([valid, badTrigger], automationPolicySchema)).toHaveLength(
      1,
    );
  });

  it("drops an approval request with a malformed payload, keeps a valid one", () => {
    const base = {
      id: "apr1",
      requestedFor: { kind: "action-run", refId: "r" },
      requestedBy: "u",
      reason: "over-threshold",
      blastRadius: { assetCount: 1, preview: "x" },
      state: "pending",
    };
    const valid = {
      ...base,
      payload: {
        kind: "action",
        actionId: "a1",
        targetRefs: [{ kind: "asset", id: "x" }],
        scope: "once",
        params: {},
      },
    };
    const badPayload = {
      ...base,
      id: "apr2",
      payload: { kind: "bogus", actionId: "a1" },
    };
    expect(keepValid([valid, badPayload], approvalRequestSchema)).toHaveLength(1);
  });
});
