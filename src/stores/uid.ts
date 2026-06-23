/**
 * Stable runtime uid generator for store instances (cart steps, etc.).
 *
 * Determinism rule (BUILD-CONTRACT HARD RULE 4): NO `Math.random()` / `Date.now()`
 * at module scope or during render. This module exposes a function that is only
 * ever called from inside Zustand action handlers (runtime, user-driven) — never
 * at module load and never during render. It prefers `crypto.randomUUID()` when
 * available and otherwise falls back to a monotonic per-session counter so SSR
 * and non-secure contexts still get a unique, collision-free id.
 */

let counter = 0;

/** Generate a unique id. Call ONLY from event handlers / store actions. */
export function makeUid(prefix = "uid"): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}
