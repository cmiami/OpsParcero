"use client";
/**
 * FixClient seam — public entry point.
 *
 * The UI imports everything fix-related from here and never reaches into
 * @fix-engine directly: the canonical session/event/plan/transcript TYPES are
 * re-exported (from ./types), and the runtime is one of two interchangeable
 * implementations selected by `getFixClient()`:
 *
 *   - SimFixClient  (DEFAULT, offline) — runs the engine's Mock loop in-browser.
 *   - LiveFixClient (opt-in)           — talks to a running fix-engine SSE server
 *                                        at NEXT_PUBLIC_FIX_ENGINE_URL.
 *
 * `getFixClient()` returns Live iff NEXT_PUBLIC_FIX_ENGINE_URL is set AND a quick
 * /healthz probe succeeds; otherwise Sim. It memoizes the choice per process so
 * the probe runs once. The static-export demo therefore always works offline.
 */
export * from "./types";
export { SimFixClient } from "./sim";
export { LiveFixClient, probeLiveEngine } from "./live";
export { FixAbortError } from "./deferred";

import type { FixClient } from "./types";
import { SimFixClient } from "./sim";
import { LiveFixClient, probeLiveEngine } from "./live";

const ENGINE_URL = process.env.NEXT_PUBLIC_FIX_ENGINE_URL;

let cached: FixClient | null = null;
let pending: Promise<FixClient> | null = null;

/**
 * Resolve the active FixClient. Live if an engine URL is configured and healthy,
 * else the offline Sim. Async because of the best-effort /healthz probe; the
 * result is cached so subsequent calls are synchronous-fast.
 */
export async function getFixClient(): Promise<FixClient> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    if (ENGINE_URL) {
      const healthy = await probeLiveEngine(ENGINE_URL);
      cached = healthy ? new LiveFixClient(ENGINE_URL) : new SimFixClient();
    } else {
      cached = new SimFixClient();
    }
    pending = null;
    return cached;
  })();

  return pending;
}

/**
 * Synchronous accessor for callers that can't await (and don't want the probe):
 * returns the cached client if `getFixClient()` already resolved, else a fresh
 * SimFixClient. Useful for Storybook stories, which always run offline.
 */
export function getFixClientSync(): FixClient {
  return cached ?? new SimFixClient();
}

/** Test/Storybook hook: reset the memoized choice. */
export function __resetFixClientForTests(): void {
  cached = null;
  pending = null;
}
