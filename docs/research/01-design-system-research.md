# Kaseya/Datto Design System — Research (auto-captured)

I now have comprehensive, authoritative data from the live Kaseya and Datto CSS, brand color confirmations, status semantics (green circle = success, red X = failed, Paused state), and the unified shell pattern (left nav with Dashboards/Sites/Devices/Automation/Policies/Analytics/Setup + top bar with global search). I have everything needed to write an implementation-ready brief.

---

# Kaseya / Datto Visual Design System Brief for shadcn/ui

*Research basis: extracted live from production Kaseya.com and Datto.com CSS bundles (June 2026), Datto/Kaseya help documentation, and Brandfetch. Both marketing sites now share an identical type system and a converged "Kaseya Design System," confirmed by Datto RMM release notes referencing "implementation of more elements of the Kaseya Design System." Where I infer a token rather than cite an exact source value, it is marked **(inferred)**.*

## 0. Source-of-truth findings (what's confirmed vs. inferred)

**Confirmed from live CSS / docs:**
- Kaseya brand primary is **purple/indigo `#5E42FF`** (hero CTAs) with a deep near-black `#04031E`. A secondary deep purple `#4D11D4` also appears. *Kaseya is NOT green/teal — that's a common misconception; the brand is purple.* The "green" association comes from product status chips, not the brand.
- Datto brand primary is **Curious Blue `#199ED9`**, deep teal **Tiber `#002A3A`** (and tints `#1B434D`, `#1C3E4C`, `#0C3443`), with a **mint/teal accent `#30DAC1` / `#10BDA4`**.
- **Both** brands use the same typefaces: **Figtree** (body/UI) and **Plus Jakarta Sans** (display/headings), variable weight, sans-serif. Mono fallback is the system stack (`SFMono-Regular, Menlo, Monaco, Consolas`).
- Status palette in both CSS bundles is Bootstrap-derived: success `#28A745`, warning `#FFC107`, danger `#DC3545`, info `#17A2B8`, neutral grays `#212529 / #343A40 / #6C757D / #DEE2E6`.
- Product shell (Datto RMM "new UI"): **left nav** (Dashboards, Sites, Devices, Automation, Policies, Analytics, Setup) + **top bar** with global search (magnifying glass, `f` shortcut), breadcrumbs, user dropdown. Backup status: green circle = success, red X = failed, "Paused" label for paused agents.

**Inferred (no exact published hex):** dark-mode surface ramps, elevation/shadow values, radius scale, exact spacing scale, and the full neutral ramp. These follow the products' visible conventions (deep teal/navy dark surfaces for Datto, near-black indigo for Kaseya) and standard data-dense SaaS practice.

---

## 1. Color palette → semantic roles → shadcn/Tailwind tokens

### 1a. Raw brand swatches (confirmed)

| Token | Hex | Origin |
|---|---|---|
| `kaseya-purple` | `#5E42FF` | Kaseya primary CTA (live) |
| `kaseya-purple-deep` | `#4D11D4` | Kaseya secondary (live) |
| `kaseya-ink` | `#04031E` | Kaseya near-black bg (live) |
| `datto-blue` | `#199ED9` | Datto Curious Blue primary (live) |
| `datto-blue-strong` | `#0580C2` | Datto blue pressed/hover (live) |
| `datto-tiber` | `#002A3A` | Datto deep teal (live) |
| `datto-tiber-700` | `#1B434D` | Datto teal surface (live) |
| `datto-tiber-600` | `#1C3E4C` | Datto teal surface (live) |
| `datto-mint` | `#30DAC1` | Datto teal/mint accent (live) |
| `datto-mint-strong` | `#10BDA4` | Datto mint pressed (live) |

**Brand decision for a Datto-portal-style backup app:** lead with **Datto blue `#199ED9`** as `--primary` (this is the "Datto portal" look the task targets), use **Tiber teal `#002A3A`** as the dark canvas, and reserve **Kaseya purple `#5E42FF`** as the corporate/marketing accent (e.g., "Powered by Kaseya" chrome, upsell banners). If you want the corporate-Kaseya shell instead, swap `--primary` to the purple. Both ramps are provided below.

### 1b. Functional status palette (confirmed, Bootstrap-derived)

| Role | Base | Hover/Strong | Subtle bg (light) | Subtle bg (dark) |
|---|---|---|---|---|
| Success/green | `#28A745` | `#1E7E34` | `#E6F5EC` | `#10301C` |
| Warning/amber | `#FFC107` | `#D39E00` | `#FFF6DB` | `#3A2E05` |
| Danger/red | `#DC3545` | `#BD2130` | `#FBE7E9` | `#3A1216` |
| Info/blue | `#17A2B8` | `#117A8B` | `#E3F5F8` | `#06303A` |

### 1c. Neutral ramp (confirmed values where present, interpolated steps inferred)

`#FFFFFF · #F6F9FC · #F8F9FA · #E9ECEF · #DEE2E6 · #CED4DA · #ADB5BD · #6C757D · #495057 · #343A40 · #212529 · #04031E`

### 1d. shadcn `globals.css` — LIGHT theme (HSL, copy-paste ready)

```css
:root {
  --radius: 0.5rem;

  --background: 210 17% 98%;        /* #F6F9FC page canvas */
  --foreground: 210 11% 15%;        /* #212529 ink */

  --card: 0 0% 100%;                /* #FFFFFF */
  --card-foreground: 210 11% 15%;
  --popover: 0 0% 100%;
  --popover-foreground: 210 11% 15%;

  --primary: 199 75% 47%;           /* #199ED9 Datto Curious Blue */
  --primary-foreground: 0 0% 100%;

  --secondary: 197 100% 11%;        /* #002A3A Tiber teal */
  --secondary-foreground: 0 0% 100%;

  --muted: 210 16% 93%;             /* #E9ECEF */
  --muted-foreground: 208 7% 46%;   /* #6C757D */

  --accent: 173 71% 52%;            /* #30DAC1 mint */
  --accent-foreground: 197 100% 11%;

  --destructive: 354 70% 54%;       /* #DC3545 */
  --destructive-foreground: 0 0% 100%;

  --success: 134 61% 41%;           /* #28A745 */
  --warning: 45 100% 51%;           /* #FFC107 */
  --info: 188 78% 41%;              /* #17A2B8 */

  --border: 210 14% 89%;            /* #DEE2E6 */
  --input: 210 14% 89%;
  --ring: 199 75% 47%;              /* focus = primary blue */

  /* Kaseya corporate accent (banners, upsell) */
  --kaseya: 252 100% 63%;           /* #5E42FF */

  /* sidebar (shadcn sidebar tokens) */
  --sidebar-background: 197 100% 11%;   /* #002A3A deep teal nav */
  --sidebar-foreground: 200 18% 80%;
  --sidebar-primary: 199 75% 47%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 197 46% 20%;        /* #1B434D hover */
  --sidebar-accent-foreground: 0 0% 100%;
  --sidebar-border: 197 40% 18%;
  --sidebar-ring: 199 75% 47%;
}
```

### 1e. shadcn `globals.css` — DARK theme (surfaces inferred from Datto Tiber ramp)

```css
.dark {
  --background: 198 53% 9%;         /* #0C2129 deepest canvas (inferred) */
  --foreground: 200 18% 90%;        /* #DCE3E6 */

  --card: 197 46% 13%;             /* #122F38 raised surface (inferred) */
  --card-foreground: 200 18% 90%;
  --popover: 197 46% 13%;
  --popover-foreground: 200 18% 90%;

  --primary: 199 78% 55%;           /* #2BA5E0 brighter blue for dark */
  --primary-foreground: 197 100% 8%;

  --secondary: 197 46% 20%;         /* #1B434D */
  --secondary-foreground: 200 18% 90%;

  --muted: 197 40% 18%;
  --muted-foreground: 200 12% 65%;  /* #9AAAB0 (inferred) */

  --accent: 173 71% 52%;            /* #30DAC1 mint pops on dark */
  --accent-foreground: 197 100% 8%;

  --destructive: 354 75% 60%;       /* #E04654 lifted (inferred) */
  --destructive-foreground: 0 0% 100%;

  --success: 134 50% 50%;           /* #3DBF5E lifted */
  --warning: 45 100% 55%;           /* #FFC93B lifted */
  --info: 188 70% 50%;

  --border: 197 35% 22%;            /* hairline on teal */
  --input: 197 35% 22%;
  --ring: 199 78% 55%;

  --kaseya: 252 100% 70%;           /* #7B66FF lifted */

  --sidebar-background: 197 100% 8%;   /* #001E2A (darker than canvas) */
  --sidebar-foreground: 200 18% 80%;
  --sidebar-primary: 199 78% 55%;
  --sidebar-primary-foreground: 197 100% 8%;
  --sidebar-accent: 197 46% 16%;
  --sidebar-accent-foreground: 0 0% 100%;
  --sidebar-border: 197 40% 14%;
  --sidebar-ring: 199 78% 55%;
}
```

> **Dark mode usage note:** Datto's product chrome leans into deep teal/navy surfaces (Tiber) rather than pure neutral gray — the dark mode reads as "teal-black," not "carbon." Keep a subtle teal cast (`hue 197–198`) in every dark surface so it feels native rather than a generic dark theme. Kaseya's own dark surfaces lean indigo-black (`#04031E`); use that hue only if you choose the purple-primary variant.

---

## 2. Typography

**Fonts (confirmed, both brands):**
- **Display / headings:** `Plus Jakarta Sans` (variable weight) — geometric, slightly rounded, confident.
- **Body / UI / tables:** `Figtree` (variable weight) — humanist, highly legible at small sizes, ideal for data-dense grids.
- **Mono (data/IDs/code):** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`.

Both ship via Google Fonts. Fallback stack: `"Figtree", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. If you must avoid web fonts, **Inter** is the closest drop-in for Figtree.

```js
// tailwind.config — fontFamily
sans: ['Figtree', 'system-ui', 'sans-serif'],
display: ['"Plus Jakarta Sans"', 'Figtree', 'sans-serif'],
mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
```

**Type scale** (data-dense SaaS; line-heights tuned for tables):

| Token | Size / Line | Weight | Use |
|---|---|---|---|
| `display` | 36 / 44 | 700 | Page hero (rare in-app) |
| `h1` | 28 / 36 | 700 (Jakarta) | Page title |
| `h2` | 22 / 30 | 600 | Section title |
| `h3` | 18 / 26 | 600 | Card header |
| `body-lg` | 16 / 24 | 400 | Default prose |
| `body` | 14 / 20 | 400 | **Default UI / table cells** |
| `body-sm` | 13 / 18 | 400 | Secondary / dense rows |
| `caption` | 12 / 16 | 500 | Labels, badges, table headers (uppercase, `letter-spacing: 0.04em`) |
| `mono-sm` | 13 / 18 | 400 | IDs, IP, sizes, timestamps |

Default app font-size is **14px** (data density), not 16px. Table column headers are 12px, 600 weight, uppercase, muted-foreground.

---

## 3. Spacing, radius, elevation

**Spacing scale (4px base):** `2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`. Data-dense defaults: table cell padding `8px 12px`; card padding `16px` (compact) / `24px` (default); page gutter `24px`; section gap `24–32px`.

**Radius (inferred from rounded geometric brand):**

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | Badges, inputs, small chips |
| `--radius` | 8px | **Buttons, cards, inputs (default)** |
| `--radius-lg` | 12px | Modals, large panels, popovers |
| `--radius-full` | 9999px | Status dots, avatar, pill toggles |

**Elevation (inferred; soft, low-contrast — typical of Datto's `#F6F9FC`-on-white look):**

| Token | Shadow |
|---|---|
| `elevation-0` | none (flat, border-defined) |
| `elevation-1` (card) | `0 1px 2px rgba(16,42,58,.06), 0 1px 3px rgba(16,42,58,.10)` |
| `elevation-2` (dropdown/popover) | `0 4px 12px rgba(16,42,58,.12)` |
| `elevation-3` (modal) | `0 12px 32px rgba(16,42,58,.18)` |

Dark mode: replace shadows with **border emphasis** (`1px solid hsl(var(--border))`) plus a faint `inset 0 1px 0 rgba(255,255,255,.03)` highlight — shadows read poorly on teal-black. Prefer borders over shadows for separation throughout (this matches the flat, hairline-bordered Datto grid aesthetic).

---

## 4. Status & severity system for backup health

Maps backup states to the confirmed product semantics (green circle = healthy, red X = failed, "Paused" label) and the functional palette. Each state = **dot + label + subtle-bg badge**; never color-only (a11y).

| State | Semantic | Dot/Icon hex (light / dark) | Badge bg / text (light) | Icon (lucide) | Notes |
|---|---|---|---|---|---|
| **Protected / Healthy** | success | `#28A745` / `#3DBF5E` | `#E6F5EC` / `#147A33` | `shield-check` / `circle-check` | Steady green. "Protected" is Datto's canonical positive backup state. |
| **Warning** | warning | `#FFC107` / `#FFC93B` | `#FFF6DB` / `#8A6D00` | `alert-triangle` | Stale backup, nearing retention/quota, last-screenshot old. Amber text needs dark foreground for contrast. |
| **Failed / Critical** | danger | `#DC3545` / `#E04654` | `#FBE7E9` / `#B02530` | `x-circle` / `octagon-alert` | Red X = failed backup (matches Datto "last 10 attempts" red X). Use for missed/failed jobs. |
| **Paused** | neutral/muted | `#6C757D` / `#9AAAB0` | `#E9ECEF` / `#495057` | `pause-circle` | Datto shows literal "Paused" label. Deliberately desaturated — paused is intentional, not an error. |
| **Syncing / In progress** | info (animated) | `#199ED9` / `#2BA5E0` | `#E3F2FB` / `#0F6FA0` | `refresh-cw` (spin) / `loader` | Use Datto blue + a slow spin/pulse. Offsite sync, replication, screenshot verification. |
| **Offline / Unreachable** | dark-neutral | `#343A40` / `#7F94AB` | `#E9ECEF` / `#343A40` | `wifi-off` / `cloud-off` | Agent/appliance not checked in. Darker/colder than Paused to distinguish "can't reach" from "deliberately stopped." |

```css
/* status tokens */
--status-protected: 134 61% 41%;
--status-warning:   45 100% 51%;
--status-failed:    354 70% 54%;
--status-paused:    208 7% 46%;
--status-syncing:   199 75% 47%;
--status-offline:   210 11% 22%;
```

**Severity ordering for sorting/rollups:** `Failed (1) > Warning (2) > Offline (3) > Syncing (4) > Paused (5) > Protected (6)`. Dashboard health rollup = the worst child state. Use **donut/stacked bars** colored by these tokens for fleet summaries (e.g., "412 Protected · 18 Warning · 3 Failed").

---

## 5. Component styling notes (Kaseya/Datto style)

**Buttons**
- *Primary:* solid `--primary` (Datto blue), white text, `radius 8px`, `font-weight 600`, height 36px (default) / 32px (sm, dense tables) / 40px (lg). Hover → `#0580C2`; focus ring 2px `--ring` at 40% + 2px offset.
- *Secondary/outline:* transparent bg, `1px border-border`, `foreground` text; hover → `--muted` bg.
- *Ghost:* no border, text-only, hover `--muted` — used heavily in table row actions and toolbars.
- *Destructive:* solid `--destructive` for delete/purge confirmations.
- *Kaseya accent button:* purple `#5E42FF` reserved for cross-sell/"IT Complete" upsell only — not for routine actions.
- Icon buttons 32×32, `radius 8px`, lucide icon at 16px.

**Badges / chips**
- Pill (`radius-full`) or `radius-sm` for status. Pattern: **8px colored dot + 12px caption label**, subtle-bg variant from the status table. Height 20–22px, padding `2px 8px`, `font-weight 500`. Count badges (e.g., alert counts) use solid `--destructive`/`--warning` with white text.

**Tables (the core of this app — make them excellent)**
- Dense by default: row height 40px (comfortable) / 32px (compact toggle). Cell padding `8px 12px`. Body 14px Figtree.
- Header row: `--muted` bg or transparent with bottom `1px border`; labels 12px uppercase 600 muted-foreground; sortable carets on hover.
- **Hairline borders**, not shadows: `border-b border-border` per row; zebra striping optional and subtle (`#F8F9FA`). Hover row → `--muted`. Selected row → `--primary` at 8% bg + 2px left accent border in `--primary`.
- Sticky header + sticky first column for wide device grids. Right-align numeric columns (sizes, counts, durations); mono font for IDs/IPs/sizes.
- Status cells use the badge pattern; inline mini sparkline or "last 10 backups" dot-strip (green/red dots) directly in a cell — a signature Datto pattern.
- Bulk-action toolbar appears above the grid when rows are selected (count + actions on left, search/filter/column-toggle on right).

**Cards / panels**
- White (`--card`) on `#F6F9FC` canvas; `radius 8px`; `elevation-1` or border-only. Header row: 16/18px title (Jakarta 600) + optional action menu (`...`). KPI/stat cards: big number (28–32px Jakarta 700) + caption label + trend delta colored by success/danger.

**Side nav (left rail)**
- Deep-teal (`--sidebar-background` `#002A3A`) full-height rail, ~240px expanded / 64px collapsed (icon-only). Sections: Dashboards, Sites/Clients, Devices, Backups/Protection, Automation, Policies, Analytics/Reports, Setup.
- Item: 16px lucide icon + 14px label, `8px 12px` padding, `radius 8px`. Active item: `--sidebar-accent` bg (`#1B434D`) + 3px left indicator bar in `--primary` (blue) or `--accent` (mint) + white text. Hover: `--sidebar-accent` at lower opacity. Group headers: 11px uppercase, muted, `letter-spacing .06em`. Collapse toggle pinned at bottom. Tenant/client switcher at top.

**Top bar**
- 56–60px tall, white (light) / `--card` (dark), bottom `1px border`. Left: breadcrumb trail (small, muted, `/` separators). Center/left: **global search** with magnifying glass and `f` keyboard shortcut hint (confirmed Datto pattern) — full-width omni-search. Right: environment/tenant selector, help, notifications bell (with count badge), user avatar dropdown (account, security level, user-switch). Optional 2px brand accent line at very top.

**Toasts / notifications**
- Bottom-right stack, `radius 8px`, `elevation-2`, max-width 400px. Left 4px accent border colored by status; leading status icon; title 14px 600 + body 13px; auto-dismiss 5s (errors persist until dismissed). Success green, error red, warning amber, info Datto-blue.

**Forms & inputs**
- Height 36px, `radius 8px`, `1px border-input`, `8px 12px` padding, 14px text. Focus: border → `--ring` + 2px ring at 40%. Labels 13px 500 above field. Error state: `--destructive` border + 12px helper text. Toggles/switches in `--primary` when on; checkboxes square `radius-sm`.

**Charts/dashboards**
- Categorical series order: `#199ED9` (blue) → `#30DAC1` (mint) → `#5E42FF` (purple) → `#FFC107` → `#17A2B8`. Status charts always use the status tokens. Soft gridlines (`--border`), no heavy axis lines, generous whitespace, big legible KPI numbers.

---

## 6. Iconography

- **Library:** the brands use **Font Awesome 6 Pro/Sharp** (confirmed in CSS). For a shadcn app, **lucide-react** (shadcn default) is the right open analog — clean, geometric, 1.5–2px stroke, matches the Figtree/Jakarta geometric feel. Stay single-library for consistency.
- **Sizing:** 16px in tables/buttons/nav, 20px in headers/cards, 24px for empty-states/feature callouts. Stroke 1.75px. Align to the 4px grid.
- **Style:** outline (stroke) icons for UI actions; reserve **filled** variants for active nav and solid status dots. Don't mix outline + filled within the same context.
- **Status icon set (lucide):** `shield-check`/`circle-check` (protected), `alert-triangle` (warning), `x-circle`/`octagon-alert` (failed), `pause-circle` (paused), `refresh-cw`/`loader` spinning (syncing), `cloud-off`/`wifi-off` (offline). Domain glyphs: `server`, `hard-drive`, `database`, `cloud`, `shield`, `history`/`rotate-ccw` (restore points), `camera` (screenshot verify), `building-2` (sites/tenants), `monitor` (endpoints).
- Color icons by their semantic token; default UI icons inherit `--muted-foreground`, brighten to `--foreground` on hover/active.

---

### Quick implementation checklist
1. Install Figtree + Plus Jakarta Sans (next/font or `<link>`); set `--font-sans: Figtree`.
2. Drop the light/dark `:root`/`.dark` token blocks above into `globals.css`.
3. Use shadcn `Sidebar` with the teal `--sidebar-*` tokens; 3px blue active indicator.
4. Set base font-size 14px, table cell padding `8px 12px`, default radius 8px.
5. Build a single `<StatusBadge state="protected|warning|failed|paused|syncing|offline" />` driven by the section-4 token table.
6. Prefer hairline borders over shadows, especially in dark (teal-black) mode.

**Sources:**
- [Kaseya Brand page](https://www.kaseya.com/brand/) and live `kaseya.com` CSS (primary `#5E42FF`, ink `#04031E`; fonts Figtree + Plus Jakarta Sans)
- [Datto logotyp.us / brand](https://logotyp.us/logo/datto/) and live `datto.com` CSS (Curious Blue `#199ED9`, Tiber `#002A3A`, mint `#30DAC1`; status palette)
- [Datto RMM New UI docs](https://rmm.datto.com/help/en/Content/3NEWUI/NEWUI.htm) (left-nav + top-bar shell, global search `f`)
- [Datto RMM 12.2.0 release notes](https://rmm.datto.com/help/en/Content/0HOME/ReleaseNotes/2023/ReleaseNotesDattoRMMv12.2.0.htm) ("Kaseya Design System" convergence)
- [Datto Endpoint Backup Status Page](https://continuity.datto.com/help/Content/kb/EB/EB-StatusPage.htm) and [BCDR Status Page](https://continuity.datto.com/help/Content/kb/siris-alto-nas/KB115004131383.htm) (green circle = success, red X = failed, Paused state)