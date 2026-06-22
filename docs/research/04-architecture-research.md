# shadcn Mock-App Architecture — Research

I now have current best-practice confirmation for all the key choices. Producing the brief.

---

# MSP Troubleshooting & Automation Center — Implementation Architecture Brief

**Scope:** A polished, *front-end-only* MOCK product. No real backend, no auth, no network calls. All data is generated/served locally. The goal is a demo-grade UI that *feels* like a production Kaseya/Datto-class console (RMM + backup + alerting + automation) so it can be clicked through, screenshotted, and used to validate IA/UX before any real engineering.

A "mock" constraint changes several decisions: we optimize for **fidelity + iteration speed + zero infra**, not for scalability, server load, or data-fetching correctness. Every recommendation below is justified through that lens.

---

## 1. Recommended Stack

| Layer | Choice | Why (for a mock specifically) |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | App Router gives us nested layouts (persistent sidebar/topbar across routes), `loading.tsx` skeletons for free, and route groups for IA. For a mock we run it as a client-heavy app — but App Router's file-based routing *is* our IA skeleton, which is the cheapest way to make navigation feel real. TS is non-negotiable: the entire value of the mock is the data model, and the model should be typed once and reused everywhere. |
| Styling | **Tailwind CSS v4** | v4 ships OKLCH as the default color space and a CSS-first `@theme` config — perceptually uniform colors mean dark-mode contrast "just works" without eyeballing. Pairs natively with shadcn. ([Tailwind v4 + shadcn theming](https://ui.shadcn.com/docs/theming)) |
| Component system | **shadcn/ui** (Radix primitives, copy-in source) | You own the source, so you can re-skin to a Kaseya/Datto look without fighting a library's opinions. 112k+ stars, the de-facto 2026 standard. Crucially for a mock: components are local files you edit, not a dependency you theme around. ([shadcn UI 2026 guide](https://designrevision.com/blog/shadcn-ui-guide)) |
| Icons | **lucide-react** | shadcn's default icon set; tree-shakeable; covers device/server/shield/backup/alert metaphors we need. |
| Charts | **Recharts (primary) + a thin Tremor-style wrapper, OR shadcn `chart` block** | Recharts v3 is the 2026 default (SVG, declarative, ~150kB, deepest customization) and is what shadcn's own `chart` component wraps. Use the **shadcn `chart` block** (Recharts under the hood + themeable `--chart-1..5` CSS vars) so charts inherit our theme automatically. Reach for **Tremor** only if you want pre-built KPI cards in hours; for brand-exact polish, Recharts wins. ([Recharts v3 vs Tremor 2026](https://www.pkgpulse.com/guides/recharts-v3-vs-tremor-vs-nivo-react-charting-2026)) |
| Data grids | **TanStack Table v8** (headless) + shadcn `Table` markup | The data table is the most demanding component in any MSP console — users expect sort, faceted column filters, column visibility/resize, row selection + bulk-action toolbar, and URL-shareable state. TanStack is headless (manages state, renders nothing) and shadcn provides the markup. Starting here avoids a guaranteed rewrite. ([shadcn Data Table](https://ui.shadcn.com/docs/components/radix/data-table)) |
| Cart/chain + selection state | **Zustand** (with `persist` middleware) | The "action cart" is cross-route, must survive navigation, and must persist to `localStorage`. Zustand's `persist` middleware synchronously hydrates from localStorage *before* render, has near-zero boilerplate, and avoids the re-render storms Context causes for frequently-mutated state. Context is fine for low-frequency, tree-local state (theme, current-org) — use it there, Zustand for the cart. ([Zustand persist](https://react-news.com/how-to-persist-zustand-state-with-localstorage-in-react-apps), [Context vs Zustand 2026](https://oneuptime.com/blog/post/2026-01-15-choose-react-state-management-context-redux-zustand/view)) |
| URL state | **nuqs** | Type-safe, `useState`-like API backed by the query string. ~6kB. This is what makes filters/tabs/selected-asset **shareable and deep-linkable** — the single biggest "this feels real" detail in a mock console. Use it for table filters, active tab, search query, and the detail-drawer's open id. ([nuqs](https://nuqs.dev/)) |
| Forms (playbook editor) | **react-hook-form + zod** | Even mock forms benefit from zod schemas — and we reuse those zod schemas to *validate our fixtures*, killing two birds. shadcn `Form` is RHF-native. |
| Tables/virtualization | **@tanstack/react-virtual** | We're generating *hundreds* of assets/jobs/alerts. Virtualize long lists so the mock stays buttery. |
| Toasts | **Sonner** | shadcn's recommended toast; perfect for "Action queued", "Playbook saved", "Reboot dispatched (mock)" feedback. |
| Dates | **date-fns** | Deterministic, tree-shakeable formatting + relative-time ("2h ago") which is core to alert/run feeds. |

### The determinism caveat (call it out explicitly)
Next.js may prerender at build time. **`Math.random()` and `Date.now()` are forbidden in any module that can run at build/SSR**, because they produce hydration mismatches and non-reproducible fixtures. The rule:

- **Build/SSR-safe fixtures** → generated by a **seeded PRNG** (deterministic; same seed → same data forever).
- **Runtime-only effects** (e.g. a live-feeling alert ticking in via `setInterval`) → `Math.random()` is fine *inside `useEffect`/event handlers only*, never during render.

---

## 2. Folder Structure

```
src/
├── app/
│   ├── (console)/                  # route group: authenticated-looking shell
│   │   ├── layout.tsx              # SidebarProvider + TopBar + Breadcrumbs + <CartSheet/>
│   │   ├── page.tsx                # redirect → /dashboard
│   │   ├── dashboard/
│   │   │   └── page.tsx            # KPI cards + charts + recent alerts
│   │   ├── assets/
│   │   │   ├── page.tsx            # DataTable of devices/endpoints
│   │   │   └── [assetId]/page.tsx  # asset detail (tabs: overview/jobs/alerts/runs)
│   │   ├── backups/
│   │   │   ├── page.tsx            # backup jobs grid
│   │   │   └── [jobId]/page.tsx
│   │   ├── alerts/page.tsx         # alert inbox/triage
│   │   ├── automation/
│   │   │   ├── page.tsx            # action catalog (the "library")
│   │   │   ├── playbooks/page.tsx  # saved playbooks list
│   │   │   └── runs/page.tsx       # run history feed
│   │   └── settings/page.tsx
│   ├── layout.tsx                  # <html>, ThemeProvider, NuqsAdapter, Toaster, fonts
│   └── globals.css                 # @theme + CSS variables (light/dark)
│
├── components/
│   ├── ui/                         # shadcn primitives (generated; you own these)
│   ├── data-table/                 # reusable generic DataTable engine
│   │   ├── data-table.tsx          # <DataTable columns data />
│   │   ├── data-table-toolbar.tsx  # search + faceted filters + view options + bulk bar
│   │   ├── data-table-faceted-filter.tsx
│   │   ├── data-table-pagination.tsx
│   │   ├── data-table-column-header.tsx   # sortable header w/ dropdown
│   │   └── use-data-table.tsx      # hook wiring TanStack ↔ nuqs
│   ├── charts/                     # chart wrappers themed to --chart-*
│   ├── cart/
│   │   ├── cart-sheet.tsx          # the slide-in action cart
│   │   ├── cart-item.tsx
│   │   └── add-to-cart-button.tsx
│   ├── asset/                      # asset cards, status badges, health pills
│   ├── alerts/
│   └── shell/                      # AppSidebar, TopBar, OrgSwitcher, CommandMenu
│
├── lib/
│   ├── store/
│   │   ├── cart-store.ts           # zustand + persist
│   │   └── ui-store.ts             # sidebar collapsed, density, etc.
│   ├── mock/
│   │   ├── prng.ts                 # seeded mulberry32/xmur3
│   │   ├── seed.ts                 # canonical SEED constant
│   │   ├── generators/             # one file per entity
│   │   │   ├── assets.ts
│   │   │   ├── backup-jobs.ts
│   │   │   ├── alerts.ts
│   │   │   ├── runs.ts
│   │   │   └── actions.ts          # the automation catalog
│   │   ├── fixtures.ts             # builds + caches the whole dataset
│   │   └── query.ts               # mock "API": getAssets({filter,sort,page})
│   ├── schemas/                    # zod schemas (validate fixtures + forms)
│   ├── columns/                    # TanStack column defs per entity
│   └── utils.ts                    # cn(), formatters, status maps
│
├── types/                          # domain types (Asset, BackupJob, Alert, Run, Action, Playbook)
└── config/
    ├── nav.ts                      # sidebar IA definition (single source of truth)
    └── theme.ts                    # status→color token maps
```

**Convention:** `page.tsx` files are thin — they fetch from `lib/mock/query.ts` and compose components. All logic lives in `lib/` and `components/`. This keeps routes readable and lets you swap `lib/mock/query.ts` for a real API later with zero page changes.

---

## 3. Modeling & Serving Realistic MOCK DATA

### 3a. Domain types (`types/`)
Model the union of all "products" an MSP console covers:

```ts
// types/index.ts
export type ProductLine = 'rmm' | 'backup' | 'edr' | 'patch' | 'network' | 'saas-backup';

export type AssetStatus = 'online' | 'offline' | 'warning' | 'critical' | 'maintenance';
export type OS = 'windows-11' | 'windows-server-2022' | 'macos-15' | 'ubuntu-24' | 'esxi-8';

export interface Asset {
  id: string;                 // "AST-000142"
  hostname: string;
  org: string;                // client/tenant
  site: string;
  os: OS;
  ip: string;
  status: AssetStatus;
  cpuPct: number; memPct: number; diskPct: number;
  lastSeen: string;           // ISO — never a Date object (serializable)
  agentVersion: string;
  products: ProductLine[];    // which modules are enabled on this asset
  tags: string[];
  patchCompliance: number;    // 0–100
  openAlerts: number;
}

export type BackupResult = 'success' | 'success-with-warnings' | 'failed' | 'running' | 'missed';
export interface BackupJob {
  id: string;                 // "BKP-00091"
  assetId: string;
  type: 'image' | 'file-folder' | 'm365' | 'gworkspace' | 'hyper-v' | 'vmware';
  schedule: string;           // "Every 4h", "Daily 02:00"
  lastRun: string; nextRun: string;
  lastResult: BackupResult;
  sizeGB: number; durationMin: number;
  retention: string;          // "30d / 12m"
  destination: 'local' | 'cloud' | 'hybrid';
  successRate30d: number;
}

export type Severity = 'info' | 'warning' | 'critical';
export interface Alert {
  id: string;                 // "ALT-004821"
  assetId: string; org: string;
  severity: Severity;
  category: 'performance' | 'security' | 'backup' | 'patch' | 'connectivity' | 'disk';
  title: string; message: string;
  createdAt: string;
  state: 'new' | 'acknowledged' | 'resolved' | 'snoozed';
  suggestedActions: string[]; // action ids → drives "add to cart" suggestions
}

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface Run {
  id: string;                 // "RUN-2026-0001"
  actionId: string; assetId: string;
  status: RunStatus;
  startedAt: string; finishedAt?: string;
  durationSec?: number;
  output: string;             // mock console output
  triggeredBy: 'manual' | 'playbook' | 'alert-auto';
  playbookId?: string;
}

export interface Action {           // the automation catalog
  id: string;                       // "reboot-device"
  name: string; description: string;
  category: 'remediation' | 'maintenance' | 'security' | 'diagnostic';
  product: ProductLine;
  icon: string;                     // lucide name
  destructive: boolean;
  estDurationSec: number;
  params?: ActionParam[];           // drives the param form in the cart
}

export interface Playbook {
  id: string; name: string; description: string;
  steps: PlaybookStep[];            // ordered chain of actions
  createdAt: string;
  applyMode: 'once' | 'always';     // see §5
}
```

> **Tip:** define these with **zod** in `lib/schemas/` and *infer* the TS types (`z.infer<typeof AssetSchema>`). Then run `AssetSchema.parse()` over every generated record in dev to guarantee fixtures never drift from the model.

### 3b. Seeded deterministic PRNG (`lib/mock/prng.ts`)
No `Math.random` at module scope. Use a tiny, dependency-free hash→PRNG:

```ts
// xmur3 hash → seed, mulberry32 → fast deterministic float[0,1)
export function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A reusable, named RNG so each entity stream is independent & stable.
export function rng(namespace: string) {
  return mulberry32(xmur3(`${SEED}:${namespace}`)());
}
```
`Math.imul`/bit ops are pure and build-safe. Same `SEED` → byte-identical dataset on every build, so screenshots and Storybook snapshots are stable.

### 3c. Generators (`lib/mock/generators/`)
Each generator takes a count and draws from curated value pools so output reads like real MSP data (not lorem ipsum). Hostnames like `NYC-DC01`, `LON-WS-0142`; orgs like `Northwind Traders`, `Contoso Health`.

```ts
export function generateAssets(count = 480): Asset[] {
  const r = rng('assets');
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  return Array.from({ length: count }, (_, i) => {
    const id = `AST-${String(i + 1).padStart(6, '0')}`;
    const status = weighted(r, { online: .72, warning: .14, critical: .06, offline: .06, maintenance: .02 });
    return {
      id, org: pick(ORGS), site: pick(SITES), os: pick(OS_LIST),
      hostname: `${pick(SITE_CODES)}-${pick(ROLE_CODES)}-${String(i).padStart(4,'0')}`,
      ip: `10.${Math.floor(r()*255)}.${Math.floor(r()*255)}.${Math.floor(r()*254)+1}`,
      status,
      cpuPct: clampedNoise(r, status), memPct: clampedNoise(r, status), diskPct: clampedNoise(r, status),
      lastSeen: isoMinutesAgo(r, status),  // offline → days ago; online → seconds
      // ...correlated fields: critical assets carry more openAlerts, lower patchCompliance
    };
  });
}
```

**Make the data *correlated*, not just random** — this is what sells realism:
- A `critical` asset should have `openAlerts > 0`, high `cpuPct`, low `patchCompliance`.
- `offline` assets get `lastSeen` days ago and their backup jobs show `missed`.
- Alerts reference real `assetId`s; runs reference real `actionId`s and `assetId`s; playbooks chain real actions. Cross-link via the **same RNG namespaces** so referential integrity holds.

### 3d. The mock "API" (`lib/mock/query.ts`)
One module that mimics a paginated/filterable backend. This is the seam you'd later replace with `fetch`:

```ts
const DB = {
  assets: generateAssets(480),
  jobs:   generateBackupJobs(620),
  alerts: generateAlerts(900),
  runs:   generateRuns(1500),
  actions: ACTION_CATALOG,        // hand-authored, ~40 actions
};

export function getAssets(q: AssetQuery) {
  let rows = DB.assets;
  if (q.search) rows = rows.filter(a => a.hostname.includes(q.search!) || a.org.includes(q.search!));
  if (q.status?.length) rows = rows.filter(a => q.status!.includes(a.status));
  rows = sortBy(rows, q.sort);
  const total = rows.length;
  const page = rows.slice(q.offset, q.offset + q.limit);
  return { rows: page, total };
}
```
Optionally wrap in a `await delay(rng('latency')() * 300)` to simulate network latency and exercise your skeleton/loading states. (Latency uses runtime randomness inside an async fn — safe.)

> **Counts:** 480 assets / 620 backup jobs / 900 alerts / 1,500 runs / ~40 actions gives a dense, believable console while staying instant in-memory. Virtualize the grids and it never stutters.

---

## 4. Component Inventory (needs → shadcn components)

| MSP UI need | shadcn / lib component(s) | Notes |
|---|---|---|
| Asset / backup / alert / run grids | **DataTable** (TanStack + `Table`) + `Checkbox` (row select) + `DropdownMenu` (row actions) | The workhorse. Bulk-action toolbar appears on selection. |
| Faceted filtering (status, OS, org, severity) | **`data-table-faceted-filter`** (`Popover` + `Command` + `Badge` counts) | Counts driven by fixtures. URL-synced via nuqs. |
| Global search / "go to anything" | **Command** (`⌘K` `CommandDialog`) | Jump to asset, run action, open playbook. The signature "feels real" feature. |
| Asset detail without leaving the list | **Sheet** (right slide-in) or full route | Sheet for quick-peek; `[assetId]/page.tsx` for deep view. nuqs holds the open id. |
| Action parameter entry / confirmations | **Dialog** + **`AlertDialog`** (for destructive, e.g. reboot/isolate) | Destructive actions require AlertDialog confirm. |
| Tabbed detail views (Overview / Jobs / Alerts / Runs) | **Tabs** | Active tab persisted in URL via nuqs. |
| Status / severity / health indicators | **Badge** (variants: success/warning/critical/info) + custom health pill | Map `AssetStatus`/`Severity` → semantic CSS tokens. |
| KPI tiles + content containers | **Card** + **`Skeleton`** | Skeletons render during simulated latency. |
| Feedback ("Reboot dispatched (mock)") | **Sonner** (`<Toaster />`) | Queue/dispatch/save confirmations. |
| Split layouts (alert list ‖ detail) | **Resizable** (`ResizablePanelGroup`) | Email-client-style triage layout. |
| Location context | **Breadcrumb** | Built from `config/nav.ts` + current route. |
| Org/tenant switcher, OS picker | **Combobox** (`Popover` + `Command`) | Hundreds of orgs → searchable combobox, not a `<select>`. |
| Primary navigation | **Sidebar** (`SidebarProvider`, collapsible) | Driven by `config/nav.ts`. |
| The action cart / chain | **Sheet** + `ScrollArea` + drag handles (`@dnd-kit`) + `Switch` (once/always) | See §5. |
| Run console output | **`ScrollArea`** + monospace + `Badge` status | Streamed-feel via runtime `setInterval`. |
| Bulk progress | **Progress** + Sonner | "Running 12 of 40…" |
| Dense/comfortable toggle, theme | **`DropdownMenu`** + **`Switch`** | Density + light/dark. |
| Empty/zero states | `Card` + lucide illustration | Every grid needs a designed empty state. |
| Hover metadata | **`HoverCard`** / **`Tooltip`** | Asset preview on hostname hover. |

---

## 5. Action Cart / Chain + Apply-Once-vs-Always + Save-as-Playbook

This is the product's centerpiece: select assets → add remediation actions to a **cart** → arrange them into a **chain** → choose **apply once vs always** → optionally **save as a playbook**. All persisted to `localStorage`.

### 5a. The store (`lib/store/cart-store.ts`)

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CartAction {
  uid: string;            // instance id (an action can appear twice in a chain)
  actionId: string;       // → Action catalog
  params: Record<string, unknown>;
  applyMode: 'once' | 'always';   // per-step override; cart has a default
}
interface CartState {
  targets: string[];                 // selected asset ids
  steps: CartAction[];               // ordered chain
  defaultApplyMode: 'once' | 'always';
  addAction: (actionId: string) => void;
  removeAction: (uid: string) => void;
  reorder: (from: number, to: number) => void;
  setStepMode: (uid: string, m: 'once' | 'always') => void;
  setTargets: (ids: string[]) => void;
  clear: () => void;
  dispatch: () => Run[];             // mock: creates Run records + toasts
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      targets: [], steps: [], defaultApplyMode: 'once',
      addAction: (actionId) =>
        set((s) => ({ steps: [...s.steps, { uid: nanoid(), actionId, params: {}, applyMode: s.defaultApplyMode }] })),
      removeAction: (uid) => set((s) => ({ steps: s.steps.filter((x) => x.uid !== uid) })),
      reorder: (from, to) => set((s) => ({ steps: arrayMove(s.steps, from, to) })),
      setStepMode: (uid, m) => set((s) => ({ steps: s.steps.map(x => x.uid === uid ? { ...x, applyMode: m } : x) })),
      setTargets: (ids) => set({ targets: ids }),
      clear: () => set({ targets: [], steps: [] }),
      dispatch: () => {
        const { targets, steps } = get();
        const runs = mockDispatch(targets, steps);   // builds Run[] in memory
        toast.success(`Dispatched ${steps.length} action(s) to ${targets.length} asset(s) (mock)`);
        return runs;
      },
    }),
    {
      name: 'msp-action-cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ targets: s.targets, steps: s.steps, defaultApplyMode: s.defaultApplyMode }),
      version: 1,
      // migrate: (persisted, fromVersion) => { ... }   // future-proof the schema
    },
  ),
);
```

**Why Zustand + `persist` here:** the cart is mutated frequently (drag reorder, param edits, toggles) and must survive route changes and reloads. `persist` hydrates synchronously from localStorage before render, and `partialize` keeps transient UI flags out of storage. Context would re-render the whole subtree on every keystroke in a param field.

> **SSR/hydration note:** because the store reads localStorage, gate cart-dependent UI behind a `useHasHydrated()` flag (subscribe to `persist.onFinishHydration`) or render the cart badge count only after mount, to avoid a hydration mismatch on the persisted count.

### 5b. Apply **Once** vs **Always** — the semantic
- **Once** → a one-shot remediation. `dispatch()` creates immediate `Run` records and the step is consumed.
- **Always** → a *standing rule*: "whenever an asset matches this condition, auto-run this action." In the mock, "always" steps are saved into a **`rules` list** (also localStorage) and surfaced on the asset/alert as "Auto-remediation active." To *demonstrate* it, a runtime `setInterval` ticker can fabricate a matching alert and show the rule auto-firing (creating a `Run` with `triggeredBy: 'alert-auto'`). This runtime randomness lives in `useEffect` — build-safe.

Model it as a default at the cart level (`defaultApplyMode`) with **per-step overrides** (`setStepMode`), surfaced as a `Switch`/segmented control on each `CartItem` plus a master toggle in the cart header.

### 5c. Save as Playbook
A button in the cart footer opens a `Dialog` (name + description, RHF + zod). On submit:

```ts
function saveAsPlaybook(name: string, description: string) {
  const { steps, defaultApplyMode } = useCart.getState();
  const pb: Playbook = {
    id: `PB-${nanoid(6)}`, name, description, createdAt: new Date().toISOString(),
    applyMode: defaultApplyMode,
    steps: steps.map((s, i) => ({ order: i, actionId: s.actionId, params: s.params, applyMode: s.applyMode })),
  };
  savePlaybook(pb);          // pushes into a second persisted store: playbooks[]
  toast.success(`Saved playbook "${name}"`);
}
```
Playbooks live in a separate persisted store (`playbook-store.ts`, key `msp-playbooks`). The `/automation/playbooks` route lists them; "Run playbook" loads its steps **back into the cart**, closing the loop. Ship 3–4 pre-seeded playbooks in fixtures ("After-hours patch + reboot", "Ransomware isolate + snapshot") so the page isn't empty on first load.

### 5d. Mock persistence summary
| Store | localStorage key | Holds |
|---|---|---|
| `cart-store` | `msp-action-cart` | targets, steps, default mode |
| `playbook-store` | `msp-playbooks` | user-saved playbooks (+ seeded) |
| `rules-store` | `msp-auto-rules` | "always" standing rules |
| `ui-store` | `msp-ui` | sidebar, density, last org |

All use `version` + `migrate` so you can evolve the shape without bricking a demoer's saved state.

---

## 6. Theming — Kaseya/Datto-style Dark + Light via CSS Variables

Use shadcn's CSS-variable convention with **OKLCH** (Tailwind v4 default) for perceptually-uniform, predictable dark-mode contrast. Define semantic tokens once; both modes get value overrides. ([shadcn theming](https://ui.shadcn.com/docs/theming), [tweakcn](https://tweakcn.com/))

```css
/* globals.css */
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.5rem;
  /* Datto/Kaseya feel: deep navy/charcoal surfaces, electric-blue primary, vivid status accents */
  --background: oklch(1 0 0);
  --foreground: oklch(0.20 0.02 250);
  --card: oklch(0.99 0.003 250);
  --primary: oklch(0.55 0.20 255);          /* brand blue */
  --primary-foreground: oklch(0.98 0 0);
  --muted: oklch(0.96 0.005 250);
  --border: oklch(0.91 0.006 250);
  --ring: oklch(0.55 0.20 255);

  /* MSP semantic status tokens — used by Badge/health pills/charts */
  --status-online:   oklch(0.72 0.17 150);
  --status-warning:  oklch(0.80 0.16 85);
  --status-critical: oklch(0.62 0.22 25);
  --status-offline:  oklch(0.65 0.01 250);
  --status-info:     oklch(0.62 0.16 250);

  /* chart palette consumed by shadcn <ChartContainer> */
  --chart-1: oklch(0.60 0.20 255);
  --chart-2: oklch(0.72 0.17 150);
  --chart-3: oklch(0.80 0.16 85);
  --chart-4: oklch(0.62 0.22 25);
  --chart-5: oklch(0.65 0.18 300);
}

.dark {
  --background: oklch(0.18 0.02 255);        /* near-black navy */
  --foreground: oklch(0.95 0.01 250);
  --card: oklch(0.22 0.02 255);
  --primary: oklch(0.65 0.19 255);           /* brighten primary for dark */
  --muted: oklch(0.26 0.02 255);
  --border: oklch(0.30 0.02 255);
  --ring: oklch(0.65 0.19 255);
  --status-online:   oklch(0.76 0.17 150);
  --status-warning:  oklch(0.83 0.16 85);
  --status-critical: oklch(0.68 0.21 25);
  --status-offline:  oklch(0.55 0.01 250);
  --status-info:     oklch(0.70 0.15 250);
  /* re-tune --chart-* a touch brighter for contrast on dark surfaces */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-status-online: var(--status-online);
  --color-status-warning: var(--status-warning);
  --color-status-critical: var(--status-critical);
  /* …expose every token to Tailwind utilities (bg-status-critical, text-status-online) */
}
```

**Mode switching:** `next-themes` `ThemeProvider` (class strategy, `defaultTheme="dark"` to match the Datto/Kaseya night-ops feel) with `disableTransitionOnChange`. A `DropdownMenu` toggle in the topbar (Light / Dark / System).

**Status → token map** (`config/theme.ts`) so a single source maps `AssetStatus`/`Severity` to Badge variant + token:
```ts
export const statusToken: Record<AssetStatus, string> = {
  online: 'status-online', warning: 'status-warning',
  critical: 'status-critical', offline: 'status-offline', maintenance: 'status-info',
};
```
Bootstrap the base palette fast with **tweakcn**, then hand-tune the navy/blue to the target brand. Charts inherit automatically because shadcn's `ChartContainer` reads `--chart-*`.

---

## 7. Routing / IA Skeleton

Single source of truth in `config/nav.ts` (drives sidebar, breadcrumbs, and Command menu):

```
/dashboard                     Overview: KPI cards (assets online, jobs failed 24h,
                               critical alerts, patch compliance) + trend charts + recent alerts feed

/assets                        DataTable (480 rows): faceted filters status/OS/org/product,
   /assets/[assetId]           Detail — Tabs: Overview · Backup Jobs · Alerts · Run History · Actions
                               (per-asset "Add actions to cart")

/backups                       Backup jobs grid (620): result, success-rate, next-run; row → quick-restore (mock)
   /backups/[jobId]            Job detail + restore-point timeline

/alerts                        Triage: Resizable split (list ‖ detail). Bulk ack/resolve/snooze.
                               Each alert shows suggestedActions → "Add to cart"

/automation                    Action catalog (cards, ~40 actions) → "Add to cart"
   /automation/playbooks       Saved playbooks (seeded + user) → "Load into cart" / "Run"
   /automation/runs            Run history feed (1500): live-feel ticker, status, output drawer

/settings                      Theme, density, mock-data reseed button, "Reset demo state"

Global overlays (route-independent):
   ⌘K Command menu             jump-to-asset, run-action, open-playbook
   Action Cart Sheet           persistent FAB/topbar badge → slide-in chain editor
```

**App Router mechanics that sell the mock:**
- `(console)/layout.tsx` renders the persistent shell (`SidebarProvider` + topbar + breadcrumbs + cart sheet) — never re-mounts on navigation, so the cart badge and sidebar stay put.
- `loading.tsx` per route → automatic skeletons during simulated latency.
- nuqs holds table filters, active tab, search, and open-drawer id → every view is **deep-linkable and shareable** (paste a URL, land on the same filtered asset list with the same alert open).
- Add a **"Reset demo state"** action (clears the four localStorage keys + reseeds) so the mock is always presentable for the next demo.

---

### Sources
- [shadcn/ui Data Table docs](https://ui.shadcn.com/docs/components/radix/data-table) · [Complete Data Table with TanStack in Next.js](https://www.buildwithmatija.com/blog/build-data-table-tanstack-shadcn-nextjs) · [shadcn Table vs Data Table](https://www.buildwithmatija.com/blog/shadcn-table-vs-data-table-when-to-choose)
- [Build an Admin Dashboard with shadcn/ui (2026)](https://adminlte.io/blog/build-admin-dashboard-shadcn-nextjs/) · [shadcn UI complete guide (2026)](https://designrevision.com/blog/shadcn-ui-guide)
- [nuqs — type-safe URL state](https://nuqs.dev/) · [nuqs GitHub](https://github.com/47ng/nuqs) · [Managing search params with nuqs (LogRocket)](https://blog.logrocket.com/managing-search-parameters-next-js-nuqs/)
- [Zustand persist with localStorage](https://react-news.com/how-to-persist-zustand-state-with-localstorage-in-react-apps) · [Context vs Redux vs Zustand (2026)](https://oneuptime.com/blog/post/2026-01-15-choose-react-state-management-context-redux-zustand/view) · [Zustand GitHub](https://github.com/pmndrs/zustand)
- [shadcn/ui Theming](https://ui.shadcn.com/docs/theming) · [shadcn/ui Dark Mode](https://ui.shadcn.com/docs/dark-mode) · [tweakcn theme editor](https://tweakcn.com/) · [Best shadcn theme generators 2026](https://medium.com/@robertobatts/the-7-best-shadcn-theme-generators-in-2026-tested-and-ranked-3f46c82da355)
- [Recharts v3 vs Tremor vs Nivo (2026)](https://www.pkgpulse.com/guides/recharts-v3-vs-tremor-vs-nivo-react-charting-2026) · [Tremor review (2026)](https://makerstack.co/reviews/tremor-review/)