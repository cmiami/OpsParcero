/**
 * Fix-engine harness types — the FixSession state machine, plan, transcript,
 * budget, and the public run/stream contract. Domain types (AssetId, Issue,
 * ActionScope, …) come from the app's @/types — never redefined here.
 *
 * Canonical interfaces per docs/fix-engine/INDEX.md + the design contract.
 */
import type { AssetId, ActionScope, ActionRunId, ISODateTime } from "./domain";
import type { ProviderId } from "./providers/types";
import type { ToolRisk } from "./tools/types";

export type FixMode = "guided" | "ai";

export type FixState =
  | "triaging"
  | "planning"
  | "awaiting-approval"
  | "executing"
  | "verifying"
  | "succeeded"
  | "partial"
  | "failed"
  | "escalated"
  | "halted";

/** Terminal states — the loop stops here. */
export const TERMINAL_STATES: ReadonlySet<FixState> = new Set<FixState>([
  "succeeded",
  "partial",
  "failed",
  "escalated",
  "halted",
]);

export interface FixBudget {
  maxSteps: number;
  maxToolCalls: number;
  maxTokens: number;
  maxWallMs: number;
}

export type ApprovalActor = "we" | "you";

export interface FixPlanStep {
  id: string;
  intent: string;
  toolName: string;
  input: unknown;
  actor: ApprovalActor;
  risk: ToolRisk;
  requiresApproval: boolean;
}

export interface FixPlan {
  summary: string;
  rationale: string;
  confidencePct: number;
  steps: FixPlanStep[];
}

export type FixTranscriptKind =
  | "model"
  | "tool_call"
  | "tool_result"
  | "observation"
  | "approval"
  | "verification"
  | "status";

export interface FixTranscriptTurn {
  at: ISODateTime;
  kind: FixTranscriptKind;
  text?: string;
  toolCall?: { id: string; name: string; input: unknown };
  toolResult?: import("./tools/types").ToolResult;
  state?: FixState;
}

export interface FixModelRef {
  provider: ProviderId;
  model: string;
}

export interface FixResult {
  healed: boolean;
  summary: string;
  actionRunIds: ActionRunId[];
  ticketRef?: string;
}

export interface FixSession {
  id: string;
  mode: FixMode;
  assetId: AssetId;
  issueId?: string;
  model: FixModelRef;
  /** Optional cheaper/local model for triage+verify; falls back to `model`. */
  triageModel?: FixModelRef;
  scope: ActionScope;
  state: FixState;
  budget: FixBudget;
  plan?: FixPlan;
  transcript: FixTranscriptTurn[];
  result?: FixResult;
  usage: { inputTokens: number; outputTokens: number; toolCalls: number; steps: number };
  startedAt: ISODateTime;
  finishedAt?: ISODateTime;
}

export interface RunSessionRequest {
  assetId: AssetId;
  issueId?: string;
  mode: FixMode;
  model: FixModelRef;
  triageModel?: FixModelRef;
  scope?: ActionScope;
  budget?: Partial<FixBudget>;
  /** Preview only: compute every diff but never execute / mutate / heal. */
  dryRun?: boolean;
  /** Caller-supplied id so the session id matches the one the caller returned
   *  (the server returns this before the loop builds the session). */
  sessionId?: string;
}

/** Streamed to the front-end (SSE live) or yielded by the in-browser sim path. */
export type FixSessionEvent =
  | { type: "state"; state: FixState }
  | { type: "plan"; plan: FixPlan }
  | { type: "turn"; turn: FixTranscriptTurn }
  // The approval gate carries the dry-run PREVIEW (diff + blast-radius) so the
  // approver decides on evidence, not bare intent.
  | {
      type: "approval-request";
      step: FixPlanStep;
      preview?: import("./tools/types").ToolResult;
    }
  | { type: "done"; session: FixSession };

/** Resolves an approval gate (server/CLI/front-end inject this; tests stub it). */
export type ApprovalResolver = (
  step: FixPlanStep,
  preview?: import("./tools/types").ToolResult,
) => Promise<"approve" | "reject">;
