# Storybook Design System

Living component library for Kaseya Resolution Center — colocated Storybook instance that is the authoritative source of truth for every UI primitive, composite, and page template in the product. Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

---

## 1. Storybook as Part of the Product

Storybook ships **colocated in the Next.js app repo** — not a separate package. Story files live at `src/components/**/*.stories.tsx` beside their component source. This means:

- The design system is always in sync with the product; there is no "stale docs" gap.
- Developers open `localhost:6006` alongside `localhost:3000`; the same `globals.css` is imported in both so rendering is pixel-identical.
- Every PR that touches a component **must** touch its story. The CI gate (`vitest --project=storybook`) enforces this.
- Storybook builds are published (Chromatic) on every merge to main, creating a versioned visual archive.

**Graduating to a shared package:** when a second consumer (e.g., a separate Kaseya portal) appears, extract `src/components/ui` to `packages/@dattocare/ui` (npm workspace). Stories, tokens, and the `globals.css` source of truth move with it. Until then: single-app, zero overhead.

```
project root
├── src/
│   ├── app/
│   │   └── globals.css          ← single token source (light + dark)
│   ├── components/
│   │   ├── ui/                  ← shadcn primitives (Button, Badge, Input …)
│   │   │   ├── button.tsx
│   │   │   ├── button.stories.tsx
│   │   │   └── …
│   │   ├── status/              ← custom atoms (StatusBadge, SeverityDot …)
│   │   ├── data-table/          ← organisms
│   │   ├── playbook/            ← organisms
│   │   └── …
│   └── stories/
│       └── foundations/         ← token/color/icon showcase stories
├── .storybook/
│   ├── main.ts
│   └── preview.ts
└── package.json
```

---

## 2. Versions, Setup, and Addons

### 2.1 Version matrix

| Package | Version | Notes |
|---|---|---|
| `storybook` | `^10.x` (ESM-only) | Core; essentials folded in |
| `@storybook/nextjs-vite` | `^10.x` | Framework adapter for Next 15 + App Router |
| `@tailwindcss/vite` | `^4.x` | Vite plugin for Tailwind v4 in `viteFinal` |
| Node | `≥20.19` or `≥22.12` | Required by SB10; verify CI image |
| React | pin single version | Next 15 pins React 19; workspace must agree |

### 2.2 What NOT to install (removed/built-in in SB10)

Storybook 10 folds the old `addon-essentials` bundle into core. **Do not install:**

- `@storybook/addon-essentials`
- `@storybook/addon-controls` (built-in)
- `@storybook/addon-actions` (built-in)
- `@storybook/addon-viewport` (built-in)
- `@storybook/addon-backgrounds` (built-in)
- `@storybook/addon-toolbars` (built-in)
- `@storybook/addon-measure` / `addon-outline` (built-in)
- `@storybook/addon-interactions` (replaced by `addon-vitest`)
- `@storybook/addon-links` (rarely needed; install only if using `linkTo`)
- `@storybook/blocks` (removed; docs blocks are part of `addon-docs`)

### 2.3 Addons to install

| Addon | Package | Why |
|---|---|---|
| Docs / autodocs | `@storybook/addon-docs` | Arg tables, autodocs, MDX pages |
| Accessibility | `@storybook/addon-a11y` | WCAG 2.2 AA axe-core gate in CI |
| Theming | `@storybook/addon-themes` | `withThemeByClassName` light/dark toggle |
| Story-based tests | `@storybook/addon-vitest` | Browser-mode Playwright; replaces test-runner |
| Figma link | `@storybook/addon-designs` | Attach Figma frames to stories via `parameters.design` |

```bash
npm install -D \
  @storybook/addon-docs \
  @storybook/addon-a11y \
  @storybook/addon-themes \
  @storybook/addon-vitest \
  @storybook/addon-designs
```

### 2.4 package.json scripts

```json
{
  "scripts": {
    "storybook":       "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "test-storybook":  "vitest --project=storybook",
    "chromatic":       "chromatic --exit-zero-on-changes",
    "dev:all":         "concurrently \"next dev\" \"storybook dev -p 6006\""
  }
}
```

---

## 3. Config Files

### 3.1 `.storybook/main.ts`

```ts
import type { StorybookConfig } from '@storybook/nextjs-vite';
import tailwindcss from '@tailwindcss/vite';

const config: StorybookConfig = {
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(ts|tsx)',
  ],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    '@storybook/addon-vitest',
    '@storybook/addon-designs',
  ],
  staticDirs: ['../public'],
  viteFinal: async (config) => {
    config.plugins ??= [];
    config.plugins.push(tailwindcss());
    return config;
  },
};

export default config;
```

Key decisions:
- `@storybook/nextjs-vite` with Vite builder is required for Tailwind v4 (`@`-parsing issues exist with other builders).
- `staticDirs` exposes `/public` assets (logos, placeholder images) to Storybook.
- No `core.builder` override needed — `nextjs-vite` selects Vite automatically.

### 3.2 `.storybook/preview.ts`

```ts
import type { Preview } from '@storybook/nextjs-vite';
import { withThemeByClassName } from '@storybook/addon-themes';
import '../src/app/globals.css';  // single token source — identical to the app

const preview: Preview = {
  parameters: {
    layout: 'centered',
    nextjs: {
      appDirectory: true,  // enables next/navigation mocks for App Router
    },
    a11y: {
      test: 'error',       // axe violations fail the story (CI gate)
    },
    backgrounds: {
      disable: true,       // use addon-themes instead; backgrounds panel hidden
    },
  },
  tags: ['autodocs'],      // global default; override per-story if needed
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
  ],
};

export default preview;
```

Key decisions:
- **`globals.css` import** is what makes Storybook pixel-identical to the app. All `--primary`, `--status-*`, font-face declarations, and Tailwind utilities come from this single file.
- `withThemeByClassName` applies `class="dark"` to the `<html>` element, matching how shadcn / Tailwind v4 toggles dark mode in the app. Do not use `data-mode` or `data-theme`.
- `a11y.test: 'error'` means a story with any WCAG 2.2 AA axe violation will throw and fail the Vitest run.
- `appDirectory: true` mocks `next/navigation` (useRouter, usePathname, useSearchParams) so components that rely on App Router hooks render without crashing.

---

## 4. Atomic Design Hierarchy and Component Mapping

Stories are organized via the `title` field, which maps to Storybook's sidebar hierarchy. The six levels of atomic design are the top-level groups.

```
Storybook sidebar
│
├── Foundations/
│   ├── Color
│   ├── Typography
│   ├── Spacing
│   ├── Radius & Elevation
│   ├── Icons
│   └── Status System
│
├── Atoms/
│   ├── Button
│   ├── Badge
│   ├── Input
│   ├── Textarea
│   ├── Checkbox
│   ├── Switch
│   ├── Radio Group
│   ├── Select
│   ├── Avatar
│   ├── Skeleton
│   ├── Separator
│   ├── Tooltip
│   ├── StatusBadge       ← custom atom; not shadcn primitive
│   ├── SeverityDot       ← colored dot only (status rollup)
│   └── MonoLabel         ← mono-font ID/IP/size chip
│
├── Molecules/
│   ├── FormField         ← label + input + helper/error text
│   ├── SearchField       ← input + magnifier + shortcut hint
│   ├── FilterBar         ← search + filter chips + column toggle
│   ├── Card              ← shadcn Card with header/content pattern
│   ├── StatCard          ← KPI tile: big number + delta + caption
│   ├── DropdownMenu
│   ├── Breadcrumb
│   ├── Alert
│   ├── Pagination
│   ├── DateRangePicker
│   ├── CommandPalette    ← global search (⌘K / f shortcut)
│   ├── BackupDotStrip    ← "last 10 backups" dot array
│   └── ApprovalGate      ← inline approval request chip
│
├── Organisms/
│   ├── DataTable         ← TanStack Table; sticky header/col; bulk toolbar
│   ├── AssetTable        ← DataTable configured for backup assets
│   ├── AppSidebar        ← full teal left nav with shadcn Sidebar
│   ├── TopBar            ← breadcrumb + search + notifications + user
│   ├── ActionCart        ← Zustand-backed remediation action queue
│   ├── ActionChainEditor ← drag-to-reorder chain builder
│   ├── PlaybookCard      ← saved playbook with scope + trigger + audit
│   ├── PlaybookList
│   ├── DiagnosticPanel   ← why-did-it-fail detail panel (timeline + log)
│   ├── RemediationDialog ← scope selector → confirm → execute flow
│   ├── AuditLog          ← scrollable time-ordered action log
│   └── StatCardsRow      ← row of StatCards for page header KPIs
│
├── Templates/
│   ├── DashboardLayout
│   ├── AssetDetailLayout
│   ├── TriageQueueLayout
│   ├── PlaybookLibraryLayout
│   └── AuditLayout
│
└── Pages/
    ├── DashboardPage
    ├── AssetDetailPage
    ├── TriageQueuePage
    ├── PlaybookLibraryPage
    └── AuditPage
```

**Title convention:** `title: 'Atoms/StatusBadge'` — PascalCase component name after the atomic level, no slashes within the name. MDX-based foundation stories use `title: 'Foundations/Color'`.

**Placement rules:**

| Level | Rule |
|---|---|
| Foundations | Token/theme showcase only — no interactive component |
| Atoms | Single shadcn primitive or a single-purpose custom component with no composed children |
| Molecules | Composition of 2–4 atoms serving one UX function; no full layout |
| Organisms | App-specific composites that embed data, state (Zustand), or multiple molecules |
| Templates | Full page layout with placeholder/slot content; no real mock data |
| Pages | Template + seeded deterministic mock data; demonstrates end-to-end realistic state |

---

## 5. Foundations Stories

Each Foundations story is an MDX file or a `.stories.tsx` with `parameters.docs.page` overridden to render a visual token reference. No controls needed. Every token in `globals.css` must appear in at least one Foundations story.

### 5.1 Color (`src/stories/foundations/Color.stories.tsx`)

Renders a swatch grid grouped by role:

- **Brand primitives:** `datto-blue`, `datto-blue-strong`, `datto-tiber`, `datto-tiber-700`, `datto-tiber-600`, `datto-mint`, `datto-mint-strong`
- **Kaseya corporate accent:** `kaseya-purple`, `kaseya-purple-deep`, `kaseya-ink` (note: reserved for upsell/corporate chrome only)
- **Semantic (light + dark pair):** `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--success`, `--warning`, `--info`, `--border`, `--ring`
- **Status tokens:** `--status-protected`, `--status-warning`, `--status-failed`, `--status-paused`, `--status-syncing`, `--status-offline`
- **Sidebar tokens:** `--sidebar-background`, `--sidebar-accent`, etc.

Each swatch shows: color block, token name, hex (light), hex (dark), semantic role.

### 5.2 Typography (`src/stories/foundations/Typography.stories.tsx`)

Renders every type scale step with a live text sample:

| Step | Size/Weight | Font | Use |
|---|---|---|---|
| `display` | 36px / 700 | Plus Jakarta Sans | Page hero |
| `h1` | 28px / 700 | Plus Jakarta Sans | Page title |
| `h2` | 22px / 600 | Plus Jakarta Sans | Section title |
| `h3` | 18px / 600 | Plus Jakarta Sans | Card header |
| `body-lg` | 16px / 400 | Figtree | Default prose |
| `body` | 14px / 400 | Figtree | **Default UI / table cells** |
| `body-sm` | 13px / 400 | Figtree | Secondary / dense rows |
| `caption` | 12px / 500 | Figtree | Labels, table headers (uppercase, `ls: 0.04em`) |
| `mono-sm` | 13px / 400 | `ui-monospace` stack | IDs, IPs, sizes, error codes |

Show both light and dark versions. Note base font-size is 14px (not 16px).

### 5.3 Spacing (`src/stories/foundations/Spacing.stories.tsx`)

Visual scale: `2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64` px. Each step rendered as a colored bar at its exact width next to its pixel value and Tailwind class (`gap-2`, `p-3`, etc.).

### 5.4 Radius & Elevation (`src/stories/foundations/RadiusElevation.stories.tsx`)

| Token | Value | Example surface |
|---|---|---|
| `--radius-sm` | 4px | Badge, small chip |
| `--radius` | 8px | Button, card, input |
| `--radius-lg` | 12px | Modal, panel, popover |
| `--radius-full` | 9999px | Status dot, avatar, pill |

Elevation: four cards at `elevation-0` through `elevation-3` side by side. Note: in dark mode, elevation is expressed via border emphasis (`1px solid hsl(var(--border))`) rather than shadow — demonstrate both modes.

### 5.5 Icons (`src/stories/foundations/Icons.stories.tsx`)

Renders the full set of in-use lucide icons at 16px and 20px, grouped:

- **Status:** `shield-check`, `alert-triangle`, `x-circle`, `octagon-alert`, `pause-circle`, `refresh-cw`, `cloud-off`, `wifi-off`
- **Domain:** `server`, `hard-drive`, `database`, `cloud`, `shield`, `history`, `rotate-ccw`, `camera`, `building-2`, `monitor`
- **Actions:** `play`, `stop-circle`, `undo-2`, `check`, `plus`, `trash-2`, `pencil`, `copy`, `download`, `upload`, `link`, `external-link`, `settings`, `filter`, `columns-3`, `search`
- **UI chrome:** `chevron-down`, `chevron-right`, `x`, `menu`, `more-horizontal`, `more-vertical`, `bell`, `user`, `log-out`, `moon`, `sun`

Show icon + name + recommended context. Include `spin` animation demo for `refresh-cw`.

### 5.6 Status System (`src/stories/foundations/StatusSystem.stories.tsx`)

Full reference for the six states used across the app:

```
State        Dot color           Icon              Badge bg        Severity
──────────── ─────────────────── ───────────────── ─────────────── ────────
Protected    --status-protected  shield-check       success-subtle  6 (best)
Warning      --status-warning    alert-triangle     warning-subtle  2
Failed       --status-failed     x-circle           danger-subtle   1 (worst)
Paused       --status-paused     pause-circle       muted           5
Syncing      --status-syncing    refresh-cw (spin)  info-subtle     4
Offline      --status-offline    cloud-off          cold-muted      3
```

Show each state as: colored dot + icon + label (the minimum accessible representation — never color alone). Include fleet rollup demo: a row of assets resolving to the worst state.

---

## 6. 100% Coverage: Definition and Enforcement

### 6.1 Definition

"100% coverage" means:

1. **One `.stories.tsx` file per component file.** If `src/components/ui/button.tsx` exists, `src/components/ui/button.stories.tsx` must exist.
2. **One named export per meaningful variant/state.** A `Button` with variants `default | destructive | outline | secondary | ghost | link` needs one export each. A `StatusBadge` needs one export per status state (6 exports minimum).
3. **`autodocs` tag on every story file** (or enabled globally as in the preview config above).
4. **`play` function for every interactive state:** hover, focus, open/close, error, loading, success. Play functions use `@storybook/test` (userEvent, expect, within).
5. **Zero axe violations** — `a11y.test: 'error'` means any violation throws. All interactive elements must have accessible names; status must not be color-only.
6. **`parameters.design`** on at least the Primary story of each component once a Figma frame exists.

### 6.2 Story file structure (canonical template)

```ts
// src/components/ui/button.stories.tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within, expect } from '@storybook/test';
import { Button } from './button';

const meta = {
  title: 'Atoms/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
  },
  parameters: {
    layout: 'centered',
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/…',  // add when frame exists
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: 'default', children: 'Run Playbook' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete Asset' },
};

export const Outline: Story = {
  args: { variant: 'outline', children: 'Cancel' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'View details' },
};

export const Loading: Story = {
  args: { variant: 'default', disabled: true, children: 'Running…' },
};

export const WithFocusInteraction: Story = {
  args: { variant: 'default', children: 'Focus me' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole('button');
    await userEvent.tab();
    await expect(btn).toHaveFocus();
  },
};
```

### 6.3 CI enforcement

```yaml
# .github/workflows/storybook.yml (excerpt)
jobs:
  storybook:
    steps:
      - name: Lint coverage gap
        run: |
          # Every .tsx in src/components/ui/ must have a .stories.tsx sibling
          for f in src/components/ui/*.tsx; do
            base="${f%.tsx}"
            if [[ "$base" != *".stories" ]] && [ ! -f "${base}.stories.tsx" ]; then
              echo "MISSING STORY: $f" && exit 1
            fi
          done

      - name: Build Storybook
        run: npm run build-storybook

      - name: Run Storybook tests (browser mode)
        run: npm run test-storybook

      - name: Chromatic visual regression
        run: npm run chromatic
        env:
          CHROMATIC_PROJECT_TOKEN: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
```

The coverage-gap lint step runs before tests so a missing story fails fast with a clear message.

### 6.4 Component "done" checklist

A component is **not shippable** until all items are checked:

```
[ ] src/components/.../foo.tsx   — component source exists
[ ] src/components/.../foo.stories.tsx — story file exists
[ ] tags: ['autodocs'] present (or global default in force)
[ ] One named export per variant AND per meaningful state
[ ] play() function for all interactive states (click, hover, focus, open, error, loading)
[ ] a11y: zero axe violations at 'error' level in both light and dark themes
[ ] Controls panel: all variant/size/state props exposed via argTypes
[ ] Tokens only: no hardcoded hex or px — all values reference CSS custom properties or Tailwind semantic classes
[ ] Dark-mode story visible and correct (theme switcher in toolbar)
[ ] parameters.design set (Figma frame URL — can be placeholder if frame pending)
[ ] Snapshot taken by Chromatic on merge
[ ] WCAG 2.2 AA: color contrast ≥4.5:1 text, ≥3:1 large/graphic (verified by axe)
```

---

## 7. Theming: Light and Dark

### 7.1 How it works

Tailwind v4 with shadcn uses `@theme inline` declarations tied to CSS custom properties. The `globals.css` file defines:

```css
/* globals.css (simplified) */
@import "tailwindcss";

@theme inline {
  --color-primary: hsl(var(--primary));
  --color-background: hsl(var(--background));
  /* … all semantic tokens … */
}

:root {
  --primary: 199 75% 47%;   /* Kaseya blue */
  --background: 210 17% 98%;
  /* … light theme … */
}

.dark {
  --primary: 199 78% 55%;   /* lifted blue for dark */
  --background: 198 53% 9%; /* slate canvas */
  /* … dark theme … */
}
```

Storybook's `preview.ts` imports this file directly. When `withThemeByClassName` applies `class="dark"` to the root element, Storybook sees exactly the same token cascade the app sees — no extra theme config, no duplication.

### 7.2 Dark mode character

Datto's dark mode is **slate** (`hue 197–198`), not carbon/neutral gray. Every dark surface carries a subtle teal cast:

- `--background` dark: `hsl(198 53% 9%)` ≈ `#0C2129`
- `--card` dark: `hsl(197 46% 13%)` ≈ `#122F38`
- `--border` dark: `hsl(197 35% 22%)` — hairline, not heavy shadow

In dark mode, **prefer border-based elevation** over shadows (shadows disappear on slate). Use `1px solid hsl(var(--border))` + subtle inset highlight for raised surfaces.

### 7.3 Sidebar does not flip

The sidebar (`--sidebar-background: #002A3A` white nav) looks identical in light and dark mode — it is already a dark surface. Only the `--card` / `--background` canvas and text colors flip.

### 7.4 Storybook theme toolbar

The `withThemeByClassName` decorator adds a sun/moon toggle to the Storybook toolbar. Every story should be validated in both themes before it is marked done. Chromatic runs both themes in visual regression.

---

## 8. Example Atom Story: StatusBadge

`StatusBadge` is the single most critical custom atom — it appears in every table row, detail panel, and fleet rollup. Six named exports, one per status state.

```ts
// src/components/status/status-badge.stories.tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from '@storybook/test';
import { StatusBadge, type StatusState } from './status-badge';

const meta = {
  title: 'Atoms/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  argTypes: {
    state: {
      control: 'select',
      options: ['protected', 'warning', 'failed', 'paused', 'syncing', 'offline'] satisfies StatusState[],
      description: 'Backup/asset health state. Never convey status by color alone — dot + icon + label required.',
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'sm = 12px table cell; md = 14px panel header',
    },
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- One export per state (a11y: each must pass axe at 'error' level) ---

export const Protected: Story = {
  args: { state: 'protected' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Label must be present (not color-only)
    await expect(canvas.getByText(/protected/i)).toBeInTheDocument();
    // Icon must have accessible label
    await expect(canvas.getByRole('img', { hidden: true })).toBeInTheDocument();
  },
};

export const Warning: Story = {
  args: { state: 'warning' },
};

export const Failed: Story = {
  args: { state: 'failed' },
};

export const Paused: Story = {
  args: { state: 'paused' },
};

export const Syncing: Story = {
  args: { state: 'syncing' },
  // Spinning icon — verify animation class present
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const spinner = canvas.getByTestId('status-icon');
    await expect(spinner).toHaveClass('animate-spin');
  },
};

export const Offline: Story = {
  args: { state: 'offline' },
};

// --- Composed: All states in a vertical stack (docs reference) ---
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {(['protected','warning','failed','paused','syncing','offline'] as StatusState[]).map(s => (
        <StatusBadge key={s} state={s} />
      ))}
    </div>
  ),
  parameters: { controls: { disable: true } },
};
```

**Component contract** the story documents:

```ts
// src/components/status/status-badge.tsx (interface)
export type StatusState = 'protected' | 'warning' | 'failed' | 'paused' | 'syncing' | 'offline';

export interface StatusBadgeProps {
  state: StatusState;
  size?: 'sm' | 'md';
  className?: string;
}
```

Rendering rules:
- Always: `<span aria-label={stateLabel}> <SeverityDot /> <StatusIcon aria-hidden="true" /> <span>{stateLabel}</span> </span>`
- Dot color: `var(--status-{state})` via `bg-[hsl(var(--status-protected))]` pattern
- Spinning: `state === 'syncing'` → icon gets `className="animate-spin"` (slow, `duration-1000`)
- Badge bg: subtle-bg token from status palette, never hardcoded hex

---

## 9. Example Organism Story: BackupDataTable

The `DataTable` organism is the product's core surface. It deserves the most thorough story coverage: every column state, bulk toolbar, row selection, and inline action.

```ts
// src/components/data-table/backup-data-table.stories.tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within, expect } from '@storybook/test';
import { BackupDataTable } from './backup-data-table';
import { mockBCDRAssets } from '@/lib/mock-data/bcdr';

const meta = {
  title: 'Organisms/BackupDataTable',
  component: BackupDataTable,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',  // tables need full width
    docs: {
      description: {
        component: 'Primary asset-grid organism. Dense TanStack Table with sticky header, status badges, last-10-backups dot strip, and bulk remediation toolbar. See [domain model](../docs/05-domain-model.md) for asset schema.',
      },
    },
  },
} satisfies Meta<typeof BackupDataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Default: mixed health fleet ---
export const Default: Story = {
  args: { assets: mockBCDRAssets },
};

// --- Empty state ---
export const Empty: Story = {
  args: { assets: [] },
};

// --- All-failed: worst-case NOC view ---
export const AllFailed: Story = {
  args: {
    assets: mockBCDRAssets.map(a => ({ ...a, status: 'failed' as const })),
  },
};

// --- Row selected → bulk toolbar appears ---
export const WithRowSelected: Story = {
  args: { assets: mockBCDRAssets },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Select first row checkbox
    const [firstCheckbox] = canvas.getAllByRole('checkbox');
    await userEvent.click(firstCheckbox);
    // Bulk toolbar should now be visible
    await expect(canvas.getByRole('toolbar', { name: /bulk actions/i })).toBeVisible();
    await expect(canvas.getByText(/1 selected/i)).toBeInTheDocument();
  },
};

// --- Sorted by severity (default for triage) ---
export const SortedBySeverity: Story = {
  args: { assets: mockBCDRAssets, defaultSort: [{ id: 'status', desc: false }] },
};

// --- Compact row density ---
export const CompactDensity: Story = {
  args: { assets: mockBCDRAssets, density: 'compact' },
};
```

**Column structure the story exercises:**

| Column | Content | Notes |
|---|---|---|
| Checkbox | row select | Controls bulk toolbar |
| Asset name | text + `building-2` icon | Link to asset detail |
| Client | muted text | Site/tenant name |
| Status | `<StatusBadge>` | dot + icon + label |
| Last backup | relative time (`2h ago`) | `mono-sm` font |
| Last 10 | `<BackupDotStrip>` | green/red dots |
| Storage used | `12.4 GB` | mono, right-aligned |
| Agent version | `1.4.2` | mono |
| Actions | `…` ghost icon button | Opens row action dropdown |

---

## 10. Provider/Context Decorators

Several shadcn and app-level components require context. Apply decorators per-story or in the meta `decorators` array. Do not add providers that aren't needed to the global preview.

```ts
// src/stories/decorators.tsx

// For components that use Sonner toast
import { Toaster } from 'sonner';
export const withToaster = (Story: React.FC) => (
  <>
    <Story />
    <Toaster position="bottom-right" />
  </>
);

// For components that read Zustand action cart
import { useActionCartStore } from '@/stores/action-cart';
export const withActionCart = (Story: React.FC) => {
  useActionCartStore.setState({ items: [], chains: [] }); // reset before each story
  return <Story />;
};

// For components that use nuqs URL state (filter bar, table)
import { NuqsTestingAdapter } from 'nuqs/testing';
export const withNuqs = (Story: React.FC) => (
  <NuqsTestingAdapter>
    <Story />
  </NuqsTestingAdapter>
);
```

Radix primitives (`Select`, `Dialog`, `Tooltip`, `Popover`) need no special wrapper — Radix handles its own portals. For compound components, use the `render` function pattern instead of `args`:

```ts
export const OpenDialog: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader><DialogTitle>Confirm Remediation</DialogTitle></DialogHeader>
      </DialogContent>
    </Dialog>
  ),
};
```

---

## 11. shadcn-storybook-registry Bootstrap (Optional)

For initial Atom story scaffolding, the `shadcn-storybook-registry` at `registry.lloydrichards.dev` ships pre-built stories for 60+ shadcn components plus token showcase stories. Install via the shadcn CLI:

```bash
npx shadcn@latest add "https://registry.lloydrichards.dev/..."
```

**Use as a starting point only.** Every generated story must be reviewed and updated to:
- Use Kaseya Resolution Center semantic tokens (not generic shadcn palette)
- Add status/domain-specific `args` (e.g., `StatusBadge` states, not generic `badge` variants)
- Add `play` functions for interactive states
- Add `parameters.design` with actual Figma frame URLs

---

## 12. CVA Variants and `argTypes`

shadcn components use `class-variance-authority` (CVA) for variant management. Keep variant keys in sync between the component and its story:

```ts
// src/components/ui/button.tsx
import { cva } from 'class-variance-authority';

export const buttonVariants = cva('...base classes...', {
  variants: {
    variant: { default: '...', destructive: '...', outline: '...', secondary: '...', ghost: '...', link: '...' },
    size: { default: '...', sm: '...', lg: '...', icon: '...' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

// Export keys for story reuse:
export const buttonVariantKeys = Object.keys(buttonVariants.variants.variant) as (keyof typeof buttonVariants.variants.variant)[];
```

```ts
// button.stories.tsx
import { buttonVariantKeys } from './button';

const meta = {
  argTypes: {
    variant: { control: 'select', options: buttonVariantKeys },
  },
};
```

This eliminates manual duplication between CVA definitions and Storybook controls — variants stay in sync automatically.

---

## 13. Known Gotchas and Mitigations

| Issue | Mitigation |
|---|---|
| **SB10 ESM-only**: CommonJS presets or config files fail silently | Ensure `.storybook/main.ts` and all preset files are ESM; verify CI Node ≥20.19 |
| **React 19 / Next 15 version mismatch**: Vitest addon may resolve a different React than Next's bundled React | Pin a single React version in `package.json` `resolutions`/`overrides`; re-test each Next minor |
| **`next/font` in stories**: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` env var needed or fonts silently skip | Set in `.env.test` or Storybook env; import fonts via `<link>` in `preview-head.html` as fallback |
| **`next/image`**: static imports return objects in Storybook | Use `parameters.nextjs.images` in preview or wrap with a `<NextImage>` decorator |
| **Tailwind `@`-parsing**: only works with Vite builder | Never switch to webpack/SB builder; keep `@storybook/nextjs-vite` |
| **`unstable_after` / `ssr:false` dynamic**: Server Component features not supported OOTB | Mock at story level; keep Server Component logic in `app/` not `components/` |
| **Zustand store leaks between stories**: one story's state bleeds into the next | Reset store in a `beforeEach` hook or decorator on every relevant story |
| **`nuqs` in stories**: URL state reads from `window.location` which doesn't exist in Storybook | Wrap with `NuqsTestingAdapter` (see section 10) |

---

## 14. Storybook Build and CI Pipeline

```
PR opened
  └─► lint coverage gap (bash: every .tsx has .stories.tsx sibling)
  └─► build-storybook (catches import errors, missing modules)
  └─► test-storybook (vitest --project=storybook, browser mode, Playwright)
         ├─ axe a11y (a11y.test:'error' → zero violations)
         ├─ play() assertions
         └─ vitest unit assertions
  └─► chromatic (visual snapshot, both themes, all stories)
         └─ block merge if unreviewed visual diffs

Merge to main
  └─► chromatic publishes new baseline
  └─► build-storybook artifact deployed to Chromatic CDN (shareable URL)
```

Storybook static build is also deployed as a subdomain (`storybook.dattocarecenter.internal`) for NOC team reference — no login required — so designers and PMs can inspect the component library without running the app locally.

---

## 15. Cross-references

- Token definitions (raw hex, HSL blocks): [design-system](03-design-system.md)
- Component inventory (what exists, what's shadcn vs custom): [component-inventory](10-component-inventory.md)
- Domain entities driving mock data in stories: [domain-model](05-domain-model.md)
- Mock data seeding plan: [data-model-and-mock-data](06-data-model-and-mock-data.md)
- Tech stack, folder structure, state management: [tech-architecture](11-tech-architecture.md)
- Per-product failure states stories should cover: [failure-catalog](02-failure-catalog.md)
