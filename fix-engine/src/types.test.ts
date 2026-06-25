import { describe, it, expect } from "vitest";
import { isExecutableScope, TERMINAL_STATES } from "./types";
import type { ActionScope } from "./domain";

// The shared boundary guard both the HTTP server and the CLI use (#2): the
// per-asset engine can only honestly execute "once". This pins the contract so
// the two call sites can't drift.
describe("isExecutableScope (#2 boundary guard)", () => {
  it("accepts only 'once'", () => {
    expect(isExecutableScope("once")).toBe(true);
  });

  it("rejects the fan-out / policy scopes the engine never performs", () => {
    const rejected: ActionScope[] = ["all-matching", "always"];
    for (const s of rejected) expect(isExecutableScope(s)).toBe(false);
  });
});

describe("TERMINAL_STATES", () => {
  it("includes every loop-stopping state and excludes in-flight ones", () => {
    expect(TERMINAL_STATES.has("failed")).toBe(true);
    expect(TERMINAL_STATES.has("succeeded")).toBe(true);
    expect(TERMINAL_STATES.has("triaging")).toBe(false);
  });
});
