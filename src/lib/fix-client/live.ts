"use client";
/**
 * LiveFixClient — the opt-in FixClient that talks to a running fix-engine server
 * (localhost POC; see fix-engine/src/server). Same FixClient surface as the sim,
 * so the UI is agnostic to which is active.
 *
 *   POST {BASE}/sessions                → { id }
 *   GET  {BASE}/sessions/:id/stream     → text/event-stream of FixSessionEvents
 *   POST {BASE}/sessions/:id/approve    → { stepId, decision }
 *   POST {BASE}/sessions/:id/abort
 *   GET  {BASE}/healthz                 → { ok, providers }
 *   GET  {BASE}/models                  → { models, providers }
 *
 * SSE is consumed with fetch + ReadableStream (works under static export, plays
 * well with CORS and AbortController) rather than EventSource, so abort() can tear
 * the connection down deterministically. Each event's `data:` line is the JSON of
 * one FixSessionEvent (the server names the SSE event by `event.type`).
 *
 * No engine RUNTIME imports here — only TYPES (the wire shape), so this file never
 * pulls the loop or any provider SDK into the bundle.
 */
import type { FixSessionEvent, RunSessionRequest } from "@fix-engine/types";
import type { ModelInfo } from "@fix-engine/providers/types";
import type {
  ApprovalDecision,
  FixClient,
  FixModelOption,
  FixSessionHandle,
} from "./types";
import { FixAbortError } from "./deferred";

const TERMINAL_EVENT = "done";

/** Per-session abort handle so abort() can cancel both the fetch + the loop. */
interface LiveSessionRef {
  id: string;
  controller: AbortController;
  aborted: boolean;
}

export class LiveFixClient implements FixClient {
  readonly kind = "live" as const;
  private readonly base: string;
  private sessions = new Map<string, LiveSessionRef>();

  constructor(base: string) {
    // Normalize: no trailing slash so `${base}/sessions` is always well-formed.
    this.base = base.replace(/\/+$/, "");
    // Defense-in-depth (P3-2): the factory already gates non-loopback hosts; warn
    // if this is ever constructed directly against a remote host.
    try {
      const h = new URL(this.base).hostname.toLowerCase().replace(/^\[|\]$/g, "");
      if (h !== "127.0.0.1" && h !== "::1" && h !== "localhost") {
        console.warn(
          `[LiveFixClient] non-loopback engine host "${h}" — fix metadata will egress there.`,
        );
      }
    } catch {
      // Malformed base — the first fetch will surface the error.
    }
  }

  async listModels(): Promise<FixModelOption[]> {
    const res = await fetch(`${this.base}/models`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`[LiveFixClient] /models → ${res.status}`);
    const body = (await res.json()) as { models?: ModelInfo[] };
    return body.models ?? [];
  }

  async createSession(req: RunSessionRequest): Promise<FixSessionHandle> {
    const res = await fetch(`${this.base}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const detail = await safeError(res);
      throw new Error(`[LiveFixClient] POST /sessions → ${res.status} ${detail}`);
    }
    const { id } = (await res.json()) as { id: string };
    this.sessions.set(id, { id, controller: new AbortController(), aborted: false });

    return {
      id,
      // The live session view-model is built by the consumer from the stream; we
      // expose a minimal placeholder so the handle has the same shape as the sim.
      session: {
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
      },
      stream: () => this.stream(id),
      approve: (stepId, decision) => this.approve(id, stepId, decision),
      abort: () => this.abort(id),
    };
  }

  async *stream(sessionId: string): AsyncIterable<FixSessionEvent> {
    const ref =
      this.sessions.get(sessionId) ??
      this.register(sessionId);

    const res = await fetch(`${this.base}/sessions/${sessionId}/stream`, {
      headers: { Accept: "text/event-stream" },
      signal: ref.controller.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`[LiveFixClient] GET /stream → ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        let sep: number;
        while ((sep = indexOfFrameEnd(buffer)) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep).replace(/^(\r?\n){1,2}/, "");
          const event = parseSseFrame(frame);
          if (!event) continue;
          yield event;
          if (event.type === TERMINAL_EVENT) return;
        }
      }
    } catch (err) {
      if (ref.aborted || isAbortError(err)) throw new FixAbortError();
      throw err;
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  async approve(
    sessionId: string,
    stepId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    const res = await fetch(`${this.base}/sessions/${sessionId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId, decision }),
    });
    // 204 = resolved; 409 = no open gate (treat as a tolerated no-op).
    if (!res.ok && res.status !== 409) {
      throw new Error(`[LiveFixClient] POST /approve → ${res.status}`);
    }
  }

  async abort(sessionId: string): Promise<void> {
    const ref = this.sessions.get(sessionId);
    if (ref) {
      ref.aborted = true;
      ref.controller.abort();
    }
    // Best-effort server-side abort; the loop transitions to halted. Send a JSON
    // content-type so the server's POST guard accepts it (empty JSON body).
    try {
      await fetch(`${this.base}/sessions/${sessionId}/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      // Connection already torn down by the client-side abort — fine.
    }
  }

  private register(sessionId: string): LiveSessionRef {
    const ref: LiveSessionRef = {
      id: sessionId,
      controller: new AbortController(),
      aborted: false,
    };
    this.sessions.set(sessionId, ref);
    return ref;
  }
}

/** Best-effort liveness probe used by the factory. */
export async function probeLiveEngine(
  base: string,
  timeoutMs = 1500,
): Promise<boolean> {
  const url = `${base.replace(/\/+$/, "")}/healthz`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── SSE parsing helpers ──────────────────────────────────────────────────────

/** Find the end of one SSE frame (a blank line: \n\n or \r\n\r\n). */
function indexOfFrameEnd(buffer: string): number {
  const a = buffer.indexOf("\n\n");
  const b = buffer.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

/** The FixSessionEvent discriminants this client trusts off the wire (P2-6). */
const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  "state",
  "plan",
  "turn",
  "approval-request",
  "done",
]);

/**
 * Parse one SSE frame's `data:` lines into a FixSessionEvent (or null). The
 * parsed JSON is NARROWED, not blindly cast (P2-6): a frame is dropped unless it
 * is an object with a known `type` discriminant, so a malicious/buggy engine
 * can't stream an arbitrary shape that the consoles would then trust.
 */
function parseSseFrame(frame: string): FixSessionEvent | null {
  const dataLines: string[] = [];
  for (const raw of frame.split(/\r?\n/)) {
    const line = raw.startsWith(":") ? "" : raw; // ignore comment/heartbeat lines
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { type?: unknown }).type !== "string" ||
    !KNOWN_EVENT_TYPES.has((parsed as { type: string }).type)
  ) {
    return null;
  }
  return parsed as FixSessionEvent;
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException
      ? err.name === "AbortError"
      : (err as { name?: string })?.name === "AbortError"
  );
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? "";
  } catch {
    return "";
  }
}
