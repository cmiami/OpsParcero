/**
 * In-memory session store for the local HTTP/SSE server (POC; single-process, no
 * DB — fix-engine 01 §7 / 07 §M3). One `SessionEntry` per running `FixSession`:
 *
 *  - `events`     — the append-only `FixSessionEvent[]` buffer (replayed to any
 *                   SSE client on connect, then live).
 *  - `subscribers`— live SSE listeners; each appended event is pushed to all.
 *  - `pending`    — the open approval gate (a deferred the loop's ApprovalResolver
 *                   awaits; the POST /approve route resolves it).
 *  - `abort`      — AbortController whose signal the loop/provider observe.
 *  - `done`       — resolves when the background runSession settles (terminal).
 *
 * The store never branches on provider identity and holds no secrets. Event
 * projection (FixTranscriptTurn → FixSessionEvent) lives in index.ts; the store
 * only buffers + fans out whatever `emit()` is handed.
 */
import type { FixSession, FixSessionEvent, FixPlanStep } from "../types";

/** A minimal deferred (resolve-from-outside Promise). */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export type Subscriber = (event: FixSessionEvent) => void;

export interface PendingApproval {
  step: FixPlanStep;
  deferred: Deferred<"approve" | "reject">;
}

export interface SessionEntry {
  id: string;
  /** The live session object (mutated by the loop as it runs). */
  session: FixSession;
  /** Append-only event log; replayed to late SSE subscribers. */
  events: FixSessionEvent[];
  /** Live SSE listeners. */
  subscribers: Set<Subscriber>;
  /** The currently-open approval gate, if any. */
  pending?: PendingApproval;
  /** Cancels the in-flight provider request + loop. */
  abort: AbortController;
  /** Resolves when the background run reaches a terminal state. */
  done: Deferred<void>;
  /** True once a terminal `done` event has been buffered. */
  finished: boolean;
}

/** Bound memory growth on a long-lived POC process (P2-3). */
const MAX_SESSIONS = 50;
const MAX_EVENTS_PER_SESSION = 2000;

export class SessionStore {
  private byId = new Map<string, SessionEntry>();

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): SessionEntry | undefined {
    return this.byId.get(id);
  }

  /** Register a freshly-created session entry, evicting the oldest finished one
   * when at capacity so repeated POST /sessions can't grow memory unbounded. */
  create(entry: SessionEntry): void {
    if (this.byId.size >= MAX_SESSIONS) {
      for (const [k, e] of this.byId) {
        if (e.finished) {
          this.byId.delete(k);
          break;
        }
      }
    }
    this.byId.set(entry.id, entry);
  }

  /** Buffer an event and fan it out to all live subscribers. */
  emit(id: string, event: FixSessionEvent): void {
    const entry = this.byId.get(id);
    if (!entry) return;
    entry.events.push(event);
    // Cap the replay buffer (keep head + recent tail) so a runaway/abusive run
    // can't grow this array without bound; replay tolerates gaps (clients key on
    // the turn's at+kind).
    if (entry.events.length > MAX_EVENTS_PER_SESSION) {
      entry.events = [
        ...entry.events.slice(0, 100),
        ...entry.events.slice(-(MAX_EVENTS_PER_SESSION - 100)),
      ];
    }
    if (event.type === "done") entry.finished = true;
    for (const sub of entry.subscribers) {
      try {
        sub(event);
      } catch {
        // A dead subscriber must never break the fan-out.
      }
    }
  }

  /** Subscribe to live events; returns an unsubscribe fn. */
  subscribe(id: string, sub: Subscriber): () => void {
    const entry = this.byId.get(id);
    if (!entry) return () => {};
    entry.subscribers.add(sub);
    return () => entry.subscribers.delete(sub);
  }

  /**
   * Open an approval gate: store the pending decision and return the promise the
   * loop's ApprovalResolver awaits. Resolved by `resolveApproval`.
   */
  openApproval(id: string, step: FixPlanStep): Promise<"approve" | "reject"> {
    const entry = this.byId.get(id);
    if (!entry) return Promise.resolve("reject");
    const d = deferred<"approve" | "reject">();
    entry.pending = { step, deferred: d };
    // If the session aborts while waiting, treat the gate as rejected.
    entry.abort.signal.addEventListener(
      "abort",
      () => {
        if (entry.pending?.step.id === step.id) {
          entry.pending.deferred.resolve("reject");
          entry.pending = undefined;
        }
      },
      { once: true },
    );
    return d.promise;
  }

  /** Resolve the open approval gate for `stepId`. Returns whether one matched. */
  resolveApproval(
    id: string,
    stepId: string,
    decision: "approve" | "reject",
  ): boolean {
    const entry = this.byId.get(id);
    if (!entry?.pending) return false;
    // Require an EXACT step-id match (P1-1): the caller must name the open gate's
    // step, so a blank/guessed id can't resolve it. The legit client echoes the
    // step.id from the approval-request event.
    if (!stepId || entry.pending.step.id !== stepId) return false;
    entry.pending.deferred.resolve(decision);
    entry.pending = undefined;
    return true;
  }

  /** Abort a running session; the loop transitions to `halted`. */
  abort(id: string): boolean {
    const entry = this.byId.get(id);
    if (!entry) return false;
    entry.abort.abort();
    return true;
  }

  /** All session ids (for diagnostics; not exposed over the wire). */
  ids(): string[] {
    return [...this.byId.keys()];
  }
}
