import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "storybook-static/**",
      "!.storybook",
    ],
  },
  {
    rules: {
      // Mock data + simulated runner intentionally use deterministic placeholders.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // M1 — tokens only. Ban hardcoded colors + arbitrary z-index in component/page
  // code. Colors/z come from design tokens (CSS vars in globals.css) surfaced as
  // semantic Tailwind classes — never a hex/rgb/hsl literal or a `*-[#…]`/`z-[…]`
  // arbitrary value. Story docs are exempt (a Foundations swatch may print a hex
  // value as documentation); globals.css is the token source and isn't linted here.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    ignores: ["**/*.stories.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/-\\[(#|rgb\\(|hsl\\()/]",
          message:
            "M1: no arbitrary color values (e.g. bg-[#0E67F5]). Use a semantic token class bound to a CSS var in globals.css.",
        },
        {
          selector: "TemplateElement[value.raw=/-\\[(#|rgb\\(|hsl\\()/]",
          message:
            "M1: no arbitrary color values (e.g. bg-[#0E67F5]). Use a semantic token class bound to a CSS var in globals.css.",
        },
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message:
            "M1: no hardcoded hex colors. Use a design token (semantic Tailwind class) instead.",
        },
        {
          selector: "Literal[value=/z-\\[/]",
          message:
            "M1: no arbitrary z-index (z-[…]). Add a token / use a semantic z-index class.",
        },
        {
          selector: "TemplateElement[value.raw=/z-\\[/]",
          message:
            "M1: no arbitrary z-index (z-[…]). Add a token / use a semantic z-index class.",
        },
      ],
    },
  },
];

export default eslintConfig;
