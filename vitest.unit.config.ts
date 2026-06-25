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
  },
});
