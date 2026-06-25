import { describe, it, expect } from "vitest";
import {
  keepValid,
  cartStepSchema,
  automationPolicySchema,
  approvalRequestSchema,
  actionRunEntrySchema,
  auditLogEntrySchema,
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

  it("drops an under-specified ActionRun the Run-history table would crash on (#5)", () => {
    // The OLD loose schema accepted these; the table then derefs
    // triggeredBy.kind / targetRefs.length / scope and throws.
    const valid = {
      id: "run1",
      actionId: "a1",
      triggeredBy: { kind: "user", refId: "u1" },
      targetRefs: [{ kind: "asset", id: "AST-1" }],
      scope: "once",
      state: "succeeded",
      startedAt: "2026-06-25T00:00:00Z",
    };
    const missingTrigger = { ...valid, id: "run2", triggeredBy: undefined };
    const badTriggerKind = {
      ...valid,
      id: "run3",
      triggeredBy: { kind: "martian", refId: "x" },
    };
    const missingTargets = { ...valid, id: "run4", targetRefs: undefined };
    const kept = keepValid(
      [valid, missingTrigger, badTriggerKind, missingTargets],
      actionRunEntrySchema,
    );
    expect(kept).toHaveLength(1);
    expect((kept[0] as { id: string }).id).toBe("run1");
  });

  it("drops an under-specified AuditLogEntry the Audit table would crash on (#5)", () => {
    const valid = {
      id: "aud1",
      at: "2026-06-25T00:00:00Z",
      actor: { kind: "user", refId: "u1" },
      verb: "ran-action",
      subjectRef: { kind: "asset", id: "AST-1" },
      detail: "did a thing",
    };
    const missingActor = { ...valid, id: "aud2", actor: undefined };
    const unknownVerb = { ...valid, id: "aud3", verb: "frobnicated" };
    const missingSubject = { ...valid, id: "aud4", subjectRef: undefined };
    const kept = keepValid(
      [valid, missingActor, unknownVerb, missingSubject],
      auditLogEntrySchema,
    );
    expect(kept).toHaveLength(1);
    expect((kept[0] as { id: string }).id).toBe("aud1");
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
