/**
 * @/mock/seed — the single source of the frozen clock + dataset seed.
 *
 * Every mock generator draws from the seeded PRNG (see `./prng`) keyed off
 * `SEED`, and every relative timestamp is computed against `NOW_MS` rather than
 * the wall clock. This keeps the whole fixture set byte-identical across builds,
 * SSR, and Storybook snapshots (BUILD-CONTRACT HARD RULE 4 — determinism).
 *
 * Do NOT call `Date.now()` / `new Date()` here or anywhere downstream at module
 * scope or during render. Use `NOW_MS` as the epoch and derive offsets from it.
 */

import { NOW } from "@/lib/format";

/** Dataset seed. Same seed → identical fixtures forever. */
export const SEED = "datto-care-center-v1";

/** Re-export the frozen "now" ISO string so generators can import it from one place. */
export { NOW };

/**
 * Frozen "now" as epoch milliseconds — the single clock all relative dates
 * ("2h ago", "14 days behind") are computed from. Parsed once at module load
 * from the (constant) `NOW` string; never read from the system clock.
 */
export const NOW_MS = Date.parse(NOW);
