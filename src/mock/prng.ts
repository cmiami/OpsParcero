/**
 * @/mock/prng — deterministic, build-safe pseudo-random number generation.
 *
 * The whole mock dataset is generated from a fixed `SEED` through namespaced
 * streams so that adding records to one entity never reshuffles another
 * (referential integrity + stable screenshots, BUILD-CONTRACT HARD RULE 4).
 *
 * Algorithm: `xmur3` string hash → seeds `mulberry32`, a fast 32-bit PRNG.
 * Both are pure integer/bit operations (`Math.imul`, shifts, xor) — no
 * `Math.random()`, no `Date.now()`, no floating accumulation that could drift
 * between engines. `rng(namespace)` returns a stateful `() => number` in [0, 1).
 */

import { SEED, NOW_MS } from "./seed";

/**
 * xmur3 — produces a deterministic 32-bit seed generator from a string.
 * Returns a function that yields successive uint32 hash values.
 */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/**
 * mulberry32 — a compact, high-quality 32-bit PRNG seeded from a single uint32.
 * Returns a stateful `() => number` producing floats in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A stateful PRNG that yields floats in [0, 1).
 */
export type Rng = () => number;

/**
 * Build a deterministic PRNG stream for a named namespace.
 * `rng("assets")` and `rng("runs")` are independent streams off the same SEED.
 */
export function rng(namespace: string): Rng {
  const seedFn = xmur3(`${SEED}:${namespace}`);
  return mulberry32(seedFn());
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared draw helpers — all pure given the rng they are handed.
// ─────────────────────────────────────────────────────────────────────────────

/** Pick one element from a non-empty array. */
export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

/**
 * Weighted choice over a `{ key: weight }` map. Weights need not sum to 1;
 * they are normalized internally. Returns one of the keys.
 */
export function weighted<K extends string>(r: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let threshold = r() * total;
  for (const [key, w] of entries) {
    threshold -= w;
    if (threshold <= 0) return key;
  }
  // Floating-point fallback: return the last key.
  return entries[entries.length - 1][0];
}

/** Integer in the inclusive range [min, max]. */
export function int(r: Rng, min: number, max: number): number {
  return Math.floor(r() * (max - min + 1)) + min;
}

/**
 * An ISO timestamp `minMin`..`maxMin` minutes in the past relative to the frozen
 * `NOW_MS`. Deterministic — never reads the wall clock.
 */
export function isoAgo(r: Rng, minMin: number, maxMin: number): string {
  const minutesAgo = minMin + r() * (maxMin - minMin);
  return new Date(NOW_MS - minutesAgo * 60_000).toISOString();
}

/** Convert whole/fractional gigabytes to bytes (binary, matches ZFS reporting). */
export function bytes(gb: number): number {
  return Math.round(gb * 1024 ** 3);
}

/**
 * Shuffle a copy of `arr` using the supplied rng (Fisher–Yates). Deterministic.
 */
export function shuffle<T>(r: Rng, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
