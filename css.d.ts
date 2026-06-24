// Ambient declaration for side-effect CSS imports (global Tailwind styles).
// TypeScript 6 type-checks side-effect imports (TS2882); Next.js injects the
// stylesheet at build time, so the module just needs to exist for the checker.
declare module "*.css";
