import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// The engine imports the app's domain types + seeded fleet as its single source
// of truth (@/ → ../src). Node environment; deterministic, no real network.
export default defineConfig({
  root: dir,
  resolve: { alias: { "@": path.join(dir, "..", "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Shuffle test order so a future shared-fixture leak (a test that heals the
    // module-level DB without resetting) can't silently pass on declaration order
    // again (finding #7). resetFleet() in each file's afterEach keeps this green.
    sequence: { shuffle: { tests: true } },
  },
});
