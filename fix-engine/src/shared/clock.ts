/**
 * Seeded clock + PRNG — determinism for the whole harness. The clock advances a
 * fixed step per turn from the app's frozen NOW; no Date.now()/wall-clock so
 * transcripts are byte-identical across runs for the same seed.
 */
import { NOW_MS } from "@/mock/seed";
import { rng } from "@/mock/prng";

export class SeededClock {
  private t: number;
  constructor(base: number = NOW_MS) {
    this.t = base;
  }
  /** Advance by a deterministic step and return the new ISO timestamp. */
  tick(stepMs = 1200): string {
    this.t += stepMs;
    return new Date(this.t).toISOString();
  }
  now(): string {
    return new Date(this.t).toISOString();
  }
  /** Current simulated epoch ms — drives deterministic wall-time budgeting. */
  ms(): number {
    return this.t;
  }
}

export { rng, NOW_MS };
