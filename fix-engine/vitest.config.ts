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
  },
});
