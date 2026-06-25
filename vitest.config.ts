import { defineConfig, configDefaults } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Story-based browser tests (play fns + axe a11y gate). Requires:
//   npx playwright install chromium
export default defineConfig({
  plugins: [
    tailwindcss(),
    storybookTest({ configDir: path.join(dirname, ".storybook") }),
  ],
  resolve: {
    alias: {
      "@": path.join(dirname, "src"),
      // The fix stories run the engine's mock loop in-browser (sim path).
      "@fix-engine": path.join(dirname, "fix-engine", "src"),
    },
  },
  test: {
    name: "storybook",
    // Node-env unit tests (*.unit.test.ts) belong to vitest.unit.config.ts — keep
    // them out of the browser project.
    exclude: [...configDefaults.exclude, "**/*.unit.test.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    setupFiles: [".storybook/vitest.setup.ts"],
  },
});
