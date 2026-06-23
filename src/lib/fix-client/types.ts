"use client";
/**
 * The FixClient seam — one interface, two implementations (Sim/Live), one
 * factory. The UI codes against this and stays agnostic to whether it is driven
 * by the in-browser Mock loop (offline default) or a running engine server.
 *
 * The canonical session/event/plan/transcript types come from the fix-engine
 * (single source of truth); we re-export them here so UI files import everything
 * fix-related from "@/lib/fix-client" and never reach into @fix-engine directly.
 *
 * Only TYPE imports from the engine in this file — no runtime engine code — so
 * importing the contract never pulls the loop into a bundle that doesn't need it.
 */
import type { ModelInfo } from "@fix-engine/providers/types";
import type {
  FixSession,
  FixSessionEvent,
  RunSessionRequest,
} from "@fix-engine/types";

export type {
  // Session + run contract
  FixSession,
  FixSessionEvent,
  RunSessionRequest,
  FixModelRef,
  FixState,
  FixMode,
  // Plan + transcript (re-exported for the organisms)
  FixPlan,
  FixPlanStep,
  FixTranscriptTurn,
  FixTranscriptKind,
  FixResult,
  FixBudget,
  ApprovalActor,
} from "@fix-engine/types";
export { TERMINAL_STATES } from "@fix-engine/types";
export type { ModelInfo, ProviderId } from "@fix-engine/providers/types";
export type {
  ToolResult,
  ToolRisk,
  StateDiff,
  ScriptArtifact,
} from "@fix-engine/tools/types";

/** A model the UI can offer in the ModelPicker (provider+model, with metadata). */
export type FixModelOption = ModelInfo;

/** The approver's decision at an approval gate. */
export type ApprovalDecision = "approve" | "reject";

/**
 * A handle returned by createSession — sugar over the id-keyed client methods so
 * callers that hold the session can `handle.stream()` instead of threading the id.
 * The canonical surface is the id-keyed FixClient (matches the UX-spec data flow).
 */
export interface FixSessionHandle {
  readonly id: string;
  readonly session: FixSession;
  stream(): AsyncIterable<FixSessionEvent>;
  approve(stepId: string, decision: ApprovalDecision): Promise<void>;
  abort(): Promise<void>;
}

/**
 * The seam — the canonical FixClient. The UI codes against this and is agnostic
 * to the backend. Methods are session-id-keyed, matching the data flow in
 * docs/fix-engine/06-ai-fix-ux.md §4:
 *
 *   const { id } = await client.createSession({ assetId, issueId, mode, model, scope });
 *   for await (const ev of client.stream(id)) reduce(ev);
 *   await client.approve(id, stepId, "approve" | "reject");
 *   await client.abort(id);
 *
 * Implementations: SimFixClient (offline Mock loop in-browser, default) and
 * LiveFixClient (engine SSE server). `getFixClient()` picks one.
 */
export interface FixClient {
  /** Which backend is active — for a small "offline demo / live engine" chip. */
  readonly kind: "sim" | "live";
  /** Models available to the picker (Sim returns just the Mock model). */
  listModels(): Promise<FixModelOption[]>;
  /** Start a session. Streaming does not begin until stream(id) is called. */
  createSession(req: RunSessionRequest): Promise<FixSessionHandle>;
  /** Drain a session's events in order until it reaches a terminal state. */
  stream(sessionId: string): AsyncIterable<FixSessionEvent>;
  /** Resolve the session's currently-open approval gate. */
  approve(
    sessionId: string,
    stepId: string,
    decision: ApprovalDecision,
  ): Promise<void>;
  /** Cancel a session. Safe to call multiple times / after completion. */
  abort(sessionId: string): Promise<void>;
}
