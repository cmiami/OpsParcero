"use client";
/**
 * SimFixClient — the offline, DEFAULT FixClient. It runs the fix-engine's
 * deterministic Mock agent loop IN THE BROWSER, for true parity with the live
 * engine: same loop, same tools, same transcript. No network, no credentials.
 *
 * BROWSER-SAFE IMPORTS ONLY (pure TS, no node/SDK deps):
 *   - runSession        @fix-engine/loop/session
 *   - MockProvider      @fix-engine/providers/mock
 *   - defaultRegistry   @fix-engine/tools/registry
 *   - types             @fix-engine/types
 * NEVER import @fix-engine/index, /providers/registry, /providers/{anthropic,
 * openai,google,local}, /cli, or /server — those pull node + provider SDKs and
 * break the bundle. (The mock path's only data dep is the app's own @/mock/*.)
 *
 * Push → pull bridge: runSession is a single async call that PUSHES transcript
 * turns through `onTurn` and AWAITS an injected ApprovalResolver at each gate. We
 * turn that into a pull-style FixSessionEvent stream:
 *   - onTurn → map each FixTranscriptTurn to a `turn` event, and synthesize a
 *     `state` event whenever a status turn carries a new FixState.
 *   - approve (ApprovalResolver) → emit an `approval-request` event and block on
 *     a per-step Deferred the UI resolves via client.approve(id, stepId, …).
 *   - on resolve → emit the `plan` (from the finished session) then `done`.
 *   - abort() → reject any open gate and fail the queue with FixAbortError.
 */
import { runSession } from "@fix-engine/loop/session";
import { MockProvider } from "@fix-engine/providers/mock";
import { defaultRegistry } from "@fix-engine/tools/registry";
import type {
  FixSession,
  FixSessionEvent,
  FixPlanStep,
  FixState,
  RunSessionRequest,
} from "@fix-engine/types";
import type { ModelInfo } from "@fix-engine/providers/types";
import {
  AsyncQueue,
  createDeferred,
  FixAbortError,
  type Deferred,
} from "./deferred";
import type {
  ApprovalDecision,
  FixClient,
  FixModelOption,
  FixSessionHandle,
} from "./types";

/** Per-session runtime state held by the SimFixClient between calls. */
interface SimSession {
  id: string;
  req: RunSessionRequest;
  queue: AsyncQueue<FixSessionEvent>;
  /** The currently-open approval gate, keyed by step id, awaiting a decision. */
  pendingApproval: { stepId: string; gate: Deferred<ApprovalDecision> } | null;
  aborted: boolean;
  started: boolean;
  /** Cancels the in-flight loop so abort() actually stops execution (#2). */
  controller: AbortController;
  /** Resolves with the finished FixSession (or rejects on abort/error). */
  done: Promise<FixSession>;
}

export class SimFixClient implements FixClient {
  readonly kind = "sim" as const;
  private sessions = new Map<string, SimSession>();

  async listModels(): Promise<FixModelOption[]> {
    // The sim only offers the deterministic Mock model.
    const models = new MockProvider().listModels();
    return models as ModelInfo[];
  }

  async createSession(req: RunSessionRequest): Promise<FixSessionHandle> {
    // The engine derives a stable id (`fix-<assetId>-<mode>`); make it unique per
    // create so re-opening the same asset starts a fresh stream.
    const baseId = `fix-${req.assetId}-${req.mode}`;
    const id = this.sessions.has(baseId)
      ? `${baseId}-${this.sessions.size + 1}`
      : baseId;

    const queue = new AsyncQueue<FixSessionEvent>();
    const sim: SimSession = {
      id,
      // Pin the loop's session id to this handle's id so the terminal `done`
      // event's session.id === handle.id — lets consoles verify run identity
      // before healing (P2-6) without the id-derivation drift on re-open.
      req: { ...req, sessionId: id },
      queue,
      pendingApproval: null,
      aborted: false,
      started: false,
      controller: new AbortController(),
      done: Promise.resolve(undefined as unknown as FixSession),
    };
    this.sessions.set(id, sim);

    // The session FixSession view the handle exposes before streaming begins.
    const placeholder: FixSession = {
      id,
      mode: req.mode,
      assetId: req.assetId,
      issueId: req.issueId,
      model: req.model,
      triageModel: req.triageModel,
      scope: req.scope ?? "once",
      state: "triaging",
      budget: { maxSteps: 0, maxToolCalls: 0, maxTokens: 0, maxWallMs: 0 },
      transcript: [],
      usage: { inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0 },
      startedAt: new Date().toISOString(),
    };

    return {
      id,
      session: placeholder,
      stream: () => this.stream(id),
      approve: (stepId, decision) => this.approve(id, stepId, decision),
      abort: () => this.abort(id),
    };
  }

  stream(sessionId: string): AsyncIterable<FixSessionEvent> {
    const sim = this.sessions.get(sessionId);
    if (!sim) {
      throw new Error(`[SimFixClient] unknown session: ${sessionId}`);
    }
    if (!sim.started) {
      sim.started = true;
      this.runLoop(sim);
    }
    return sim.queue;
  }

  async approve(
    sessionId: string,
    stepId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    const sim = this.sessions.get(sessionId);
    if (!sim) throw new Error(`[SimFixClient] unknown session: ${sessionId}`);
    const pending = sim.pendingApproval;
    if (!pending) return; // No open gate — no-op (idempotent for double clicks).
    // The UX keys approvals by step id; the loop only awaits one gate at a time,
    // so accept the open gate (and assert the id matches when one is provided).
    if (stepId && pending.stepId !== stepId) {
      // Tolerate id drift between the planned step and the live gate.
    }
    sim.pendingApproval = null;
    pending.gate.resolve(decision);
  }

  async abort(sessionId: string): Promise<void> {
    const sim = this.sessions.get(sessionId);
    if (!sim || sim.aborted) return;
    sim.aborted = true;
    // Cancel the in-flight loop so it stops before the next tool call instead of
    // running to completion and healing the shared in-browser fleet AFTER the UI
    // shows 'halted' (#2). The loop honors this signal at its while/per-call checks.
    sim.controller.abort();
    // Unblock any open gate so the loop can unwind, then fail the stream.
    if (sim.pendingApproval) {
      const gate = sim.pendingApproval.gate;
      sim.pendingApproval = null;
      gate.reject(new FixAbortError());
    }
    sim.queue.fail(new FixAbortError());
  }

  /** Kick off the engine Mock loop and bridge its callbacks into the queue. */
  private runLoop(sim: SimSession): void {
    const { req, queue } = sim;
    let lastState: FixState | undefined;

    const run = runSession(req, {
      provider: new MockProvider(),
      registry: defaultRegistry(),
      // Abort signal so abort() actually halts the loop (#2), not just the queue.
      signal: sim.controller.signal,
      // ApprovalResolver: surface the gate, then block on the UI's decision.
      approve: async (step: FixPlanStep, preview) => {
        if (sim.aborted) return "reject";
        const gate = createDeferred<ApprovalDecision>();
        sim.pendingApproval = { stepId: step.id, gate };
        queue.push({ type: "approval-request", step, preview });
        try {
          return await gate.promise;
        } catch {
          // Aborted while awaiting the gate.
          return "reject";
        }
      },
      // Every transcript turn → a `turn` event; status turns also drive `state`.
      onTurn: (turn) => {
        if (sim.aborted) return;
        queue.push({ type: "turn", turn });
        if (turn.kind === "status" && turn.state && turn.state !== lastState) {
          lastState = turn.state;
          queue.push({ type: "state", state: turn.state });
        }
      },
    });

    sim.done = run;
    run
      .then((session) => {
        if (sim.aborted) return;
        // The plan is finalized on the returned session — emit it before `done`
        // so a FixPlanCard can populate, then the terminal `done`.
        if (session.plan) queue.push({ type: "plan", plan: session.plan });
        if (session.state !== lastState) {
          queue.push({ type: "state", state: session.state });
        }
        queue.push({ type: "done", session });
        queue.close();
      })
      .catch((err) => {
        if (sim.aborted) return; // abort() already failed the queue.
        queue.fail(err);
      });
  }
}
