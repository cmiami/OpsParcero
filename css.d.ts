// Ambient declaration for side-effect CSS imports (global Tailwind styles).
// TypeScript 6 type-checks side-effect imports (TS2882); Next.js injects the
// stylesheet at build time, so the module just needs to exist for the checker.
declare module "*.css";

// Vite (Storybook's builder + the vitest browser provider) inlines `import.meta.env`
// at build. The app's tsconfig isn't a Vite project, so declare just the env we
// read — `VITE_SB_THEME` flips the Storybook a11y default theme for `test:dark`.
interface ImportMetaEnv {
  readonly VITE_SB_THEME?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
