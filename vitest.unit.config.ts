import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Node-env unit tests for the app's pure logic (mock query/runner, store overlay
// helpers, persisted-store validation) — the layer the browser story tests can't
// reach directly (#16). Named `*.unit.test.ts` so the storybook browser project
// never picks them up.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(dir, "src"),
      "@fix-engine": path.join(dir, "fix-engine", "src"),
    },
  },
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.unit.test.ts", "scripts/**/*.unit.test.ts"],
    // Coverage FLOOR on the core decision logic (#15): the runner, the heal
    // overlay, the persisted-store validation, and the one dispatch command. A
    // change that drops a branch here below the floor fails `verify`, so "tested"
    // is enforced, not aspirational. Scoped to node-reachable pure logic — not
    // React components / browser-only paths (those are gated by story play fns).
    coverage: {
      enabled: true,
      provider: "v8",
      include: [
        "src/mock/runner.ts",
        "src/lib/overrides.ts",
        "src/lib/schemas/index.ts",
        "src/lib/activity-record.ts",
      ],
      reporter: ["text-summary"],
      // Floor set just under the suite's current numbers so it's a ratchet, not a
      // red gate. (The runner + overlay aggregate here; the dispatch-command /
      // schema modules are exercised too and gated behaviorally by their unit
      // assertions, but v8's multi-file run doesn't tally them — so the % floor
      // guards the runner + heal-overlay logic specifically.)
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 77,
        branches: 52,
      },
    },
  },
});
