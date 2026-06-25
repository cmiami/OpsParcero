// Native flat config (ESLint 10 + eslint-config-next 16). The old FlatCompat
// bridge breaks under ESLint 10, so we spread eslint-config-next's flat arrays
// directly — no @eslint/eslintrc.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      ".next/**",
      "out/**",
      "coverage/**",
      "storybook-static/**",
      // Stray nested repo-name tree that agent/skill tooling recreates from the
      // review's `OpsParcero/<path>` prefixes — never our source (also gitignored).
      "OpsParcero/**",
      "fix-engine/**", // separate Node package — covered by its own tsc + tests
      // Vendored agent/skill script mirrors — not our source.
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".cursor/**",
      ".windsurf/**",
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
      // React-Compiler-era rules (react-hooks v6, new in eslint-config-next 16):
      // advisory for this existing codebase — they flag INTENTIONAL patterns
      // here (SSR hydration gates, controlled resets, the TanStack Table store).
      // The classic hooks rules (rules-of-hooks, exhaustive-deps) stay enforced;
      // adopting React Compiler is a separate, dedicated pass.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/static-components": "off",
    },
  },
  // M1 — tokens only. Ban hardcoded colors, arbitrary z-index, arbitrary font
  // sizes / letter-spacing, and px spacing/radius in component/page code. These
  // all come from design tokens (CSS vars in globals.css / the Tailwind scale)
  // surfaced as semantic classes — never a hex/rgb/hsl literal, `z-[…]`,
  // `text-[10px]`, `tracking-[…]`, or `p-[13px]`/`rounded-[7px]`. Story docs are
  // exempt (a Foundations swatch may print a value as documentation); globals.css
  // is the token source and isn't linted here.
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
        {
          selector: "Literal[value=/\\b(backdrop-)?blur-\\[/]",
          message:
            "M1: no arbitrary blur (blur-[…]/backdrop-blur-[…]). Add a token (e.g. --blur-overlay) and use the utility.",
        },
        {
          selector: "TemplateElement[value.raw=/\\b(backdrop-)?blur-\\[/]",
          message:
            "M1: no arbitrary blur (blur-[…]/backdrop-blur-[…]). Add a token (e.g. --blur-overlay) and use the utility.",
        },
        {
          selector: "Literal[value=/\\btext-\\[[0-9.]+px\\]/]",
          message:
            "M1: no arbitrary font sizes (e.g. text-[10px]). Use a type-scale token (text-2xs … text-xl).",
        },
        {
          selector: "TemplateElement[value.raw=/\\btext-\\[[0-9.]+px\\]/]",
          message:
            "M1: no arbitrary font sizes (e.g. text-[10px]). Use a type-scale token (text-2xs … text-xl).",
        },
        {
          selector: "Literal[value=/\\btracking-\\[/]",
          message:
            "M1: no arbitrary letter-spacing (tracking-[…]). Use tracking-tight / tracking-eyebrow.",
        },
        {
          selector: "TemplateElement[value.raw=/\\btracking-\\[/]",
          message:
            "M1: no arbitrary letter-spacing (tracking-[…]). Use tracking-tight / tracking-eyebrow.",
        },
        {
          selector:
            "Literal[value=/\\b(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|rounded[a-z-]*)-\\[[0-9.]+px\\]/]",
          message:
            "M1: no arbitrary px spacing/radius (e.g. p-[13px], rounded-[7px]). Use the spacing/radius scale.",
        },
        {
          selector:
            "TemplateElement[value.raw=/\\b(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|rounded[a-z-]*)-\\[[0-9.]+px\\]/]",
          message:
            "M1: no arbitrary px spacing/radius (e.g. p-[13px], rounded-[7px]). Use the spacing/radius scale.",
        },
        {
          selector: "Literal[value=/\\b(drop-)?shadow-\\[/]",
          message:
            "M1: no arbitrary shadow (shadow-[…]/drop-shadow-[…]). Add a token (--shadow-*/an @utility) and use the utility class.",
        },
        {
          selector: "TemplateElement[value.raw=/\\b(drop-)?shadow-\\[/]",
          message:
            "M1: no arbitrary shadow (shadow-[…]/drop-shadow-[…]). Add a token (--shadow-*/an @utility) and use the utility class.",
        },
      ],
    },
  },
];

export default eslintConfig;
