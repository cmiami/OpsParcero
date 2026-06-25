import { describe, it, expect } from "vitest";
import { simulateRun } from "@/mock/runner";
import { ACTION_BY_ID } from "@/mock/reference";
import type { EntityRef } from "@/types";

const targets: EntityRef[] = [{ kind: "asset", id: "AST-TEST-0001" }];

describe("simulateRun approval gating (P1-7)", () => {
  it("gates an irreversible self-heal even with a single target", () => {
    const out = simulateRun(ACTION_BY_ID["force-merge"], targets, "once");
    expect(out.awaitingApproval).toBe(true);
  });

  it("does NOT gate a reversible, non-destructive self-heal", () => {
    const out = simulateRun(
      ACTION_BY_ID["repair-vss-writers"],
      targets,
      "once",
    );
    expect(out.awaitingApproval).toBeFalsy();
  });

  it("an approved irreversible action runs instead of gating", () => {
    const out = simulateRun(ACTION_BY_ID["force-merge"], targets, "once", {}, {
      approved: true,
    });
    expect(out.awaitingApproval).toBeFalsy();
  });
});
