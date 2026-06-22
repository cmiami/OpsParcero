# Storybook + shadcn + Atomic Design — Research (auto-captured)

> Research date: June 2026. Versions verified against official Storybook/shadcn/Tailwind docs. Flags mark areas in flux. This is the source for `docs/storybook-design-system.md`.

## TL;DR / Decisions

- **Storybook 10.x** with the **`@storybook/nextjs-vite`** framework (Vite builder). Required for the modern Vitest test stack; recommended for Next.js App Router + React 19 + Next 15+.
- **Storybook 10 is ESM-only** and folds "essentials" into core — Controls, Actions, Viewport, Backgrounds, Toolbars, Highlight, Measure/Outline ship built-in. Do **not** install `addon-essentials`, `addon-controls`, `addon-actions`, `addon-viewport`, `addon-interactions`, `addon-links`, or `@storybook/blocks` (removed/empty). **Do** install `@storybook/addon-docs`, `@storybook/addon-a11y`, `@storybook/addon-themes`, `@storybook/addon-vitest`, `@storybook/addon-designs`.
- **Tailwind v4** via `@tailwindcss/vite`; tokens live in CSS via `@theme inline` over `:root`/`.dark` variables. Import the **same** `globals.css` into `.storybook/preview.ts` so Storybook renders pixel-identical to the app.
- **Architecture:** single-app colocated Storybook to start (`components/ui/*.stories.tsx`); graduate to a shared `@acme/ui` design-system package when a second consumer appears. (Our mock is single-app → Storybook colocated in the app.)
- **Coverage:** one story file per component, one named export per variant/state, `autodocs` tag, `play` functions for interactive states, a11y checks, Vitest addon (browser mode via Playwright), Chromatic for visual regression.
- **Node 20.19+ or 22.12+ required** (SB10). React version pinned across the workspace.

## Versions & setup gotchas (mid-2026)

- Latest major **Storybook 10** (~10.4), ESM-only, presets must be ESM.
- Framework `@storybook/nextjs-vite` (Next ≥14.1, Vite ≥5). App Router: set `nextjs.appDirectory: true` in preview to enable `next/navigation` hooks.
- React 19 added `ref` as a regular prop; pin a single React version across workspace to avoid mismatch with Next's bundled React. Vitest addon × Next 15 had module-resolution edge cases — pin React, re-test per Next minor.
- Next features not OOTB in Storybook: `unstable_after`, `ssr:false` `next/dynamic` in Server Components. Static image imports return objects; set `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`; install `sharp` for AVIF.

## shadcn + Storybook integration

- shadcn components are copied-in source → author stories next to them. Glob `**/*.stories.@(ts|tsx)`.
- Radix primitives need no special handling. Components needing context (`Select`, `Dialog`, `Tooltip`, `Toast`) get a decorator that provides the provider/open state; use `render` functions for compound components.
- Props → controls via `argTypes` + `autodocs` (install `@storybook/addon-docs`, set `tags:['autodocs']`).
- CVA variants: keep an exported `const buttonVariantKeys = [...]` next to the CVA def and reuse it in both the component and `argTypes`; one named export per variant.
- Bootstrap shortcut: **shadcn-storybook-registry** (`registry.lloydrichards.dev`) ships ready-made stories for 60+ shadcn components + token stories; installable via the shadcn CLI registry namespace.

## Atomic design organization (sidebar via story `title`)

```
Foundations/   → Color, Typography, Spacing, Radius, Shadow, Icons, Theme
Atoms/         → single shadcn primitives (Button, Input, Badge, Checkbox, Switch, Avatar, Skeleton, Separator, Tooltip)
Molecules/     → small compositions (Form Field, Search Field, Card, Dropdown Menu, Select, Pagination, Breadcrumb, Alert, StatusBadge)
Organisms/     → app composites (DataTable, App Header/Nav, Sidebar, Dialog/Sheet flows, Filter Bar, Stat Cards Row, Command Palette, ActionCart)
Templates/     → page layouts with placeholder content (Dashboard, Asset Detail, Triage Queue layouts)
Pages/         → templates filled with mock data
```

## Theming / tokens (light + dark + brand)

- One `globals.css` drives everything; import it in `preview.ts`. Toggle theme with `@storybook/addon-themes` `withThemeByClassName({ themes:{ light:'', dark:'dark' }, defaultTheme:'light' })` (shadcn uses a `.dark` class).
- shadcn token convention is now `:root`/`.dark` raw tokens + `@theme inline` mapping (current docs use OKLCH; our design research provides HSL blocks — either works; keep one source of truth).

## Essential addons & quality gate

| Concern | Tool (v10) |
|---|---|
| Accessibility | `@storybook/addon-a11y` (set `a11y.test:'error'`) |
| Interactions/states | core `play` functions + `@storybook/test` |
| Docs/autodocs | `@storybook/addon-docs` |
| Figma | `@storybook/addon-designs` |
| Story-based testing | `@storybook/addon-vitest` (browser mode + Playwright; replaces test-runner) |
| Visual regression | Chromatic |

**"100% coverage" =** one `*.stories.tsx` per component; one named export per meaningful variant/state; `autodocs` everywhere; `play` for interactive states; CI gate on `vitest --project=storybook` + `chromatic`. A CI lint can assert every `components/ui/*.tsx` has a sibling `.stories.tsx`.

## Config snippets

`.storybook/main.ts`:
```ts
import type { StorybookConfig } from '@storybook/nextjs-vite';
import tailwindcss from '@tailwindcss/vite';
const config: StorybookConfig = {
  framework: { name: '@storybook/nextjs-vite', options: {} },
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs','@storybook/addon-a11y','@storybook/addon-themes','@storybook/addon-vitest','@storybook/addon-designs'],
  staticDirs: ['../public'],
  viteFinal: async (cfg) => { cfg.plugins ??= []; cfg.plugins.push(tailwindcss()); return cfg; },
};
export default config;
```

`.storybook/preview.ts`:
```ts
import type { Preview } from '@storybook/nextjs-vite';
import { withThemeByClassName } from '@storybook/addon-themes';
import '../src/app/globals.css';
const preview: Preview = {
  parameters: { layout: 'centered', nextjs: { appDirectory: true }, a11y: { test: 'error' } },
  tags: ['autodocs'],
  decorators: [ withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'light' }) ],
};
export default preview;
```

`package.json` scripts: `storybook` (`storybook dev -p 6006`), `build-storybook`, `test-storybook` (`vitest --project=storybook`), `chromatic`, `dev:all` (concurrently next + storybook).

## In-flux flags

1. SB10 ESM-only / Node 20.19+|22.12+ — verify CI Node + ESM presets.
2. React 19 / Next 15 × Vitest addon — pin a single React version.
3. Tailwind v4 + non-Vite builders had `@`-parsing issues — stay on `@storybook/nextjs-vite`.
4. Kaseya/Datto exact brand hex now confirmed in `01-design-system-research.md` (no longer a blocker).
5. shadcn token convention is `@theme inline`; our HSL token blocks are an equivalent valid source — keep one source of truth in `globals.css`.

**Sources:** storybook.js.org (nextjs-vite, migration, essentials, themes, autodocs, vitest-addon), ui.shadcn.com (theming, tailwind-v4), github.com/lloydrichards/shadcn-storybook-registry, bradfrost.com (Atomic Design & Storybook), chromatic.com.
