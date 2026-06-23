"use client";
/**
 * Async primitives the FixClient seam needs to turn the engine's push-style
 * `onTurn` callback (and an injected ApprovalResolver) into a pull-style async
 * iterator the UI can `for await` over.
 *
 *   - Deferred<T>  : a promise you resolve/reject from the outside. Used to wire
 *                    the loop's ApprovalResolver — the loop awaits it; the UI's
 *                    approve()/abort() resolves it.
 *   - AsyncQueue<T>: a single-producer / single-consumer channel. The session's
 *                    onTurn (+ derived state/plan/approval events) pushes
 *                    FixSessionEvents in; stream() drains them in order until the
 *                    queue is closed (the loop finished) or errored/aborted.
 *
 * No engine imports here — pure, browser-safe, reusable.
 */

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * A minimal back-pressure-free async channel. Producers call `push`; the single
 * consumer iterates with `for await`. `close()` ends the iteration cleanly;
 * `fail(err)` ends it by throwing into the consumer.
 */
export class AsyncQueue<T> {
  private values: T[] = [];
  private waiting: Array<(r: IteratorResult<T>) => void> = [];
  private rejectWaiting: Array<(e: unknown) => void> = [];
  private closed = false;
  private error: unknown = undefined;

  push(value: T): void {
    if (this.closed) return;
    const wake = this.waiting.shift();
    if (wake) {
      this.rejectWaiting.shift();
      wake({ value, done: false });
    } else {
      this.values.push(value);
    }
  }

  /** No more values; the consumer drains what's buffered then completes. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.waiting.length > 0) {
      const wake = this.waiting.shift()!;
      this.rejectWaiting.shift();
      wake({ value: undefined as never, done: true });
    }
  }

  /** Abort/error: the consumer's pending (or next) await throws `err`. */
  fail(err: unknown): void {
    if (this.closed) return;
    this.closed = true;
    this.error = err;
    while (this.rejectWaiting.length > 0) {
      const rej = this.rejectWaiting.shift()!;
      this.waiting.shift();
      rej(err);
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.values.length > 0) {
        yield this.values.shift()!;
        continue;
      }
      if (this.closed) {
        if (this.error !== undefined) throw this.error;
        return;
      }
      const result = await new Promise<IteratorResult<T>>((resolve, reject) => {
        this.waiting.push(resolve);
        this.rejectWaiting.push(reject);
      });
      if (result.done) {
        if (this.error !== undefined) throw this.error;
        return;
      }
      yield result.value;
    }
  }
}

/** Thrown by the queue (and surfaced to the UI) when a session is aborted. */
export class FixAbortError extends Error {
  constructor(message = "Fix session aborted.") {
    super(message);
    this.name = "FixAbortError";
  }
}
