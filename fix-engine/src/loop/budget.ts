/**
 * FixBudget enforcement + halt detection. Wall time is measured on the SEEDED
 * clock (simulated ms), so budget exhaustion is deterministic.
 */
import type { FixBudget, FixMode } from "../types";

export const DEFAULT_BUDGET: Record<FixMode, FixBudget> = {
  guided: { maxSteps: 12, maxToolCalls: 24, maxTokens: 60_000, maxWallMs: 180_000 },
  ai: { maxSteps: 10, maxToolCalls: 20, maxTokens: 80_000, maxWallMs: 120_000 },
};

export type HaltReason =
  | "maxSteps"
  | "maxToolCalls"
  | "maxTokens"
  | "maxWallMs"
  | "approval-rejected"
  | "repeated-failure"
  | "provider-error";

export class Budgeter {
  steps = 0;
  toolCalls = 0;
  tokens = 0;
  private readonly start: number;

  constructor(
    private readonly budget: FixBudget,
    startMs: number,
  ) {
    this.start = startMs;
  }

  stepUsed() {
    this.steps += 1;
  }
  toolUsed() {
    this.toolCalls += 1;
  }
  addTokens(n: number) {
    this.tokens += n;
  }

  /** Returns the first exceeded limit, or null. `nowMs` is the seeded clock. */
  exceeded(nowMs: number): HaltReason | null {
    // Checked at the top of the loop BEFORE the step/call is consumed, so use
    // >= for a HARD bound: maxSteps:N permits exactly N steps, never N+1.
    if (this.steps >= this.budget.maxSteps) return "maxSteps";
    if (this.toolCalls >= this.budget.maxToolCalls) return "maxToolCalls";
    if (this.tokens >= this.budget.maxTokens) return "maxTokens";
    if (nowMs - this.start > this.budget.maxWallMs) return "maxWallMs";
    return null;
  }
}
