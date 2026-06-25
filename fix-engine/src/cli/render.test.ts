/**
 * #1 — a 'partial' terminal (write attempted, heal NOT verified) must not be
 * collapsed into success: exitCodeForState maps it to a distinct non-zero code so
 * a script can't treat an unconfirmed heal as a pass.
 */
import { describe, it, expect } from "vitest";
import { exitCodeForState } from "./render";

describe("exitCodeForState (#1 — partial is not success)", () => {
  it("verified resolution → 0", () => {
    expect(exitCodeForState("succeeded")).toBe(0);
  });
  it("partial (unconfirmed heal) → 2, never 0", () => {
    expect(exitCodeForState("partial")).toBe(2);
  });
  it("failure terminals → 1", () => {
    expect(exitCodeForState("failed")).toBe(1);
    expect(exitCodeForState("halted")).toBe(1);
    expect(exitCodeForState("escalated")).toBe(1);
  });
});
