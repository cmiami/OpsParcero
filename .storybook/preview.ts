import type { Preview } from "@storybook/nextjs-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import "../src/app/globals.css"; // single token source — identical to the app

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    nextjs: {
      appDirectory: true,
    },
    a11y: {
      test: "error",
    },
    backgrounds: { disable: true },
  },
  tags: ["autodocs"],
  decorators: [
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      // The vitest a11y gate renders each story once; `VITE_SB_THEME=dark` flips
      // the default so the SAME axe pass runs against the `.dark` token block too
      // (the `test:dark` script). Storybook UI keeps the light default + toolbar.
      defaultTheme:
        import.meta.env.VITE_SB_THEME === "dark" ? "dark" : "light",
    }),
  ],
};

export default preview;
