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
const ALLOW_REMOTE =
  process.env.NEXT_PUBLIC_FIX_ENGINE_ALLOW_REMOTE === "true";

/**
 * Whether a URL points at the local loopback. The live engine is a localhost POC
 * (binds 127.0.0.1), so only loopback hosts are honored by default — a remote
 * NEXT_PUBLIC_FIX_ENGINE_URL would, once baked into the client bundle, silently
 * egress fix metadata + approval decisions to that host. Non-loopback requires an
 * explicit opt-in (P3-2).
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return h === "127.0.0.1" || h === "::1" || h === "localhost";
  } catch {
    return false;
  }
}

let cached: FixClient | null = null;
let pending: Promise<FixClient> | null = null;

/**
 * Resolve the active FixClient. Live if a LOOPBACK engine URL is configured and
 * healthy (or a non-loopback URL is explicitly allowed), else the offline Sim.
 * Async because of the best-effort /healthz probe; the result is cached.
 */
export async function getFixClient(): Promise<FixClient> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    const loopback = ENGINE_URL ? isLoopbackUrl(ENGINE_URL) : false;
    const honor = ENGINE_URL && (loopback || ALLOW_REMOTE);
    if (honor) {
      if (!loopback) {
        console.warn(
          "[fix-client] honoring a NON-LOOPBACK engine URL via NEXT_PUBLIC_FIX_ENGINE_ALLOW_REMOTE — fix metadata and approval decisions will egress to that host.",
        );
      }
      const healthy = await probeLiveEngine(ENGINE_URL!);
      cached = healthy ? new LiveFixClient(ENGINE_URL!) : new SimFixClient();
    } else {
      if (ENGINE_URL) {
        console.warn(
          "[fix-client] ignoring non-loopback NEXT_PUBLIC_FIX_ENGINE_URL (set NEXT_PUBLIC_FIX_ENGINE_ALLOW_REMOTE=true to allow). Falling back to the offline Sim.",
        );
      }
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
