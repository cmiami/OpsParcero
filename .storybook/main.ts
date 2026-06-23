import type { StorybookConfig } from "@storybook/nextjs-vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
    "@storybook/addon-vitest",
    "@storybook/addon-designs",
  ],
  staticDirs: ["../public"],
  viteFinal: async (config) => {
    config.plugins ??= [];
    config.plugins.push(tailwindcss());
    // Resolve the fix-engine alias (mirrors tsconfig `@fix-engine/*`) so stories
    // can drive the offline SimFixClient. Stories only ever touch the browser-safe
    // mock-path engine modules; the node/SDK ones are never imported. `@` already
    // resolves via the framework's tsconfig-paths support; we mirror it here too
    // because the engine's own source imports `@/...` and must resolve the same.
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@fix-engine": path.join(dirname, "..", "fix-engine", "src"),
      "@": path.join(dirname, "..", "src"),
    };
    return config;
  },
};

export default config;
