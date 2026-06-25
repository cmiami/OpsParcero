/**
 * FixBudget enforcement + halt detection. Wall time is measured on the SEEDED
 * clock (simulated ms), so budget exhaustion is deterministic.
 */
import type { FixBudget, FixMode } from "../types";

export const DEFAULT_BUDGET: Record<FixMode, FixBudget> = {
  guided: { maxSteps: 12, maxToolCalls: 24, maxTokens: 60_000, maxWallMs: 180_000 },
  ai: { maxSteps: 10, maxToolCalls: 20, maxTokens: 80_000, maxWallMs: 120_000 },
};

/** How far above the per-mode default a client may raise any budget field. */
const BUDGET_CEILING_MULTIPLE = 4;

/**
 * Clamp a client-supplied budget to a safe ceiling (P2-3): each provided field is
 * pinned to `[1, default × 4]`, and fields the client omitted are left out (so the
 * loop's own default merge still applies). Prevents a client from requesting an
 * astronomical maxTokens/maxToolCalls — real spend with a paid provider. The
 * ceiling sits ABOVE the mock's deterministic budget, so the mock path is
 * unchanged.
 */
export function clampBudget(
  requested: Partial<FixBudget> | undefined,
  mode: FixMode,
): Partial<FixBudget> | undefined {
  if (!requested) return undefined;
  const def = DEFAULT_BUDGET[mode];
  const out: Partial<FixBudget> = {};
  (["maxSteps", "maxToolCalls", "maxTokens", "maxWallMs"] as const).forEach(
    (f) => {
      const v = requested[f];
      if (typeof v === "number" && Number.isFinite(v)) {
        out[f] = Math.max(1, Math.min(v, def[f] * BUDGET_CEILING_MULTIPLE));
      }
    },
  );
  return out;
}

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
