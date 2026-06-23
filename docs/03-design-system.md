# 03 — Design System

The canonical, buildable design system for the Kaseya Resolution Center (a Kaseya/Datto portal module). Part of the spec set — see [INDEX](INDEX.md). Concise visual reference: [`../DESIGN.md`](../DESIGN.md). Source of truth at build time is `src/app/globals.css`; this doc defines what goes in it.

## 1. Direction

Kaseya-portal surface: **white left nav**, **Kaseya-blue topbar/primary**, light data-dense canvas, structure from **hairline borders** (not shadows), dense (13px base), 8px-radius cards. **Purple is reserved for AI-assist only.** Color is information — severity, fix-type, product — not decoration. Dark mode is slate.

## 2. Color tokens — light (`:root`)

```css
:root {
  --radius: 0.5rem;            /* 8px cards; buttons 6px, chips 4px */

  /* surfaces & text */
  --background: 0 0% 100%;          /* #FFFFFF content canvas */
  --surface: 0 0% 100%;             /* #FFFFFF cards/panels */
  --subtle: 220 33% 98%;            /* #F8F9FC stat bar / muted surface */
  --ink: 217 32% 15%;               /* #1A2332 primary text */
  --muted-fg: 212 13% 42%;          /* #607185 secondary text */
  --faint-fg: 211 18% 62%;          /* #8A9BB0 labels/captions */
  --border: 214 32% 91%;            /* #E2E8F0 hairline */

  /* primary — Kaseya blue */
  --primary: 217 92% 51%;           /* #0E67F5 actions, topbar, focus */
  --primary-foreground: 0 0% 100%;
  --primary-strong: 217 89% 34%;    /* #0D47A1 hover/pressed */
  --primary-accent: 211 89% 42%;    /* #1565C0 active nav, links, selected */
  --primary-tint: 214 100% 96%;     /* #EEF5FF active/selected bg */
  --ring: 217 92% 51%;

  /* AI-assist — purple (AI surfaces ONLY) */
  --ai: 283 65% 36%;                /* #6A1B9A */
  --ai-accent: 291 47% 51%;         /* #AB47BC */
  --ai-tint: 292 44% 93%;           /* #F3E5F5 */

  /* fix classification */
  --fix-endtoend: 123 46% 34%;      /* #2E7D32 green — full */
  --fix-guided: 211 89% 42%;        /* #1565C0 blue — partial (We+You) */
  --fix-insights: 24 100% 32%;      /* #E65100 orange — not controllable */
  --fix-unknown: 0 0% 62%;          /* #9E9E9E gray — unknown */

  /* severity / status */
  --critical: 0 65% 47%;            /* #C62828 */
  --critical-tint: 0 73% 95%;       /* #FFEBEE */
  --warning: 24 100% 32%;           /* #E65100 */
  --warning-tint: 33 100% 94%;      /* #FFF3E0 */
  --success: 123 46% 34%;           /* #2E7D32 */
  --success-tint: 122 39% 93%;      /* #E8F5E9 */

  /* product accents (chips/charts) */
  --product-saas: 211 71% 46%;      /* #1976D2 */
  --product-bcdr: 24 100% 32%;      /* #E65100 */
  --product-endpoint: 123 46% 34%;  /* #2E7D32 */

  /* nav */
  --nav-fg: 200 19% 33%;            /* #455A64 */
  --nav-hover: 210 33% 96%;         /* #F0F4F8 */
}
```

## 3. Color tokens — dark (`.dark`)

```css
.dark {
  --background: 222 47% 11%;        /* #0F172A slate canvas */
  --surface: 217 33% 17%;           /* #1E293B raised */
  --subtle: 222 40% 14%;
  --ink: 214 32% 91%;              /* #E2E8F0 */
  --muted-fg: 215 16% 65%;
  --faint-fg: 215 14% 54%;
  --border: 215 25% 27%;            /* #334155 */

  --primary: 217 92% 60%;           /* brighter blue on dark */
  --primary-foreground: 222 47% 11%;
  --primary-accent: 211 90% 61%;
  --primary-tint: 217 40% 22%;

  --ai: 291 47% 70%;
  --ai-tint: 283 30% 22%;

  --fix-endtoend: 123 40% 55%;
  --fix-guided: 211 90% 61%;
  --fix-insights: 24 90% 55%;
  --fix-unknown: 0 0% 65%;

  --critical: 0 70% 62%;
  --critical-tint: 0 40% 22%;
  --warning: 24 90% 55%;
  --warning-tint: 24 50% 18%;
  --success: 123 40% 55%;
  --success-tint: 123 35% 16%;

  --nav-fg: 214 20% 75%;
  --nav-hover: 217 33% 22%;
}
```

> All values HSL (Tailwind `hsl(var(--token))`). Light values match `DESIGN.md`. Verify contrast in both modes (esp. warning-orange text, AI purple on tint).

## 4. Tailwind mapping

Map tokens to semantic classes in `tailwind.config`/`@theme`: `background, surface, subtle, ink, muted-fg, faint-fg, border, primary (+foreground/strong/accent/tint), ai (+accent/tint), fix-endtoend|guided|insights|unknown, critical(+tint), warning(+tint), success(+tint), product-saas|bcdr|endpoint, nav-fg, nav-hover`. Use `bg-primary`, `text-ai`, `border-border`, `bg-fix-endtoend/10`, etc. **Never** raw hex/arbitrary values in components.

## 5. Typography

Fonts: **Plus Jakarta Sans** (display) + **Figtree** (body/UI). `--font-sans: Figtree`, `--font-display: "Plus Jakarta Sans"`, `--font-mono: ui-monospace…`. Load via `next/font`.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `page-title` | 24 / 30 | 700 (Jakarta) | page hero (rare) |
| `section` | 15 / 21 | 700 (Jakarta) | section/card title |
| `body` | 13 / 20 | 400 (Figtree) | **default UI / table cells** |
| `body-sm` | 12 / 17 | 400 | dense rows |
| `label` | 10 / 13 | 700 | uppercase eyebrows, table headers, stat names — `letter-spacing .07em`, faint-fg |
| `mono` | 12 / 17 | 400 | ids, hostnames, ports, error codes, sizes |

Base font-size **13px** (data density). Fixed px scale (not fluid).

## 6. Spacing, radius, elevation, z-index

- **Spacing (4px base):** `4 · 8 · 12 · 16 · 20 · 24 · 32`. Card padding `12–14px`; table cell `8px×12px`; page gutter `16–20px`.
- **Radius:** chips/inputs 4px · **buttons 6px** · cards 8px · panels 10px · dots/pills full.
- **Elevation (borders over shadows):** 0 flat (default) · 1 hover `0 2px 10px rgba(0,0,0,.08)` · 2 dropdown/toast `0 4px 16px rgba(0,0,0,.10)` · 3 modal `0 8px 32px rgba(0,0,0,.20)`; side-panel `-4px 0 16px rgba(0,0,0,.08)`.
- **z-index scale:** dropdown 10 → sticky 20 → side-panel 50 → modal-backdrop 100 → modal 200 → toast 300 → tooltip 400. Never arbitrary `9999`.

## 7. Fix-classification system (load-bearing)

| Fix type | Label | Token | Icon | Action |
|---|---|---|---|---|
| `full` | End-to-end fix | `--fix-endtoend` (green) | `zap` | one-click / bulk "End-to-end fix all" |
| `partial` | Guided fix | `--fix-guided` (blue) | `wand-2` | run We-steps, guide You-steps (`stepsAuto`) |
| `external`/`manual` | Insights only | `--fix-insights` (orange) | `lightbulb` | diagnostic + runbook |
| `unknown` | Insights only | `--fix-unknown` (gray) | `help-circle` | diagnostic |

Single `<FixTypeBadge type=… />` and `<FixButton>` driven by these tokens. **"We" steps** render on `--primary-tint` w/ blue numerals; **"You" steps** on `--warning-tint` w/ orange numerals.

## 8. Severity & status (never color-only — dot + icon + label)

| State | Token | Icon (lucide) |
|---|---|---|
| Critical | `--critical` on `--critical-tint` | `octagon-alert` |
| Warning | `--warning` on `--warning-tint` | `alert-triangle` |
| Resolved / healthy | `--success` on `--success-tint` | `circle-check` |
| In progress | `--primary` (slow spin) | `loader` |

Severity sort: **Critical > Warning**. A category group / rollup shows the worst child state + a critical count badge. One `<SeverityBadge>` / `<StatusBadge>`.

## 9. Component specs

- **Left nav (white, 218px):** section labels 10px uppercase faint; item = 14px lucide + 12.5px label `--nav-fg`; hover `--nav-hover`; **active = `--primary-tint` bg + 3px left `--primary-accent` border + accent text**. Tenant switcher top; Recent Organizations list bottom.
- **Topbar (`--primary`, 50px):** Kaseya mark + "Resolution Center"; right: Scan now, End-to-end fix all, notifications, avatar — translucent-white buttons.
- **Stat bar (`--subtle`):** resolved today/month, per-product deltas (▲/▼), active-outage chip (`--critical`, click → outage modal).
- **Summary cards:** colored top-border by role; 32px number; click → impacted-assets panel. Roles: Top problem · Open issues · Critical issues · End-to-end fixable.
- **Charts (Recharts):** trend line (open vs resolved) · product donut · category pie · fix-classification donut; series use product/fix/status tokens; soft gridlines; no heavy axes.
- **Category group:** collapsible card — chevron, icon, name, count + critical badges, sparkline → issue table.
- **Issue row:** name + mono detail · product chip · severity badge · occurrence count (→ panel) · Fix button (`--primary`) + AI button (`--ai` on `--ai-tint`, sparkle) · expand → detail.
- **Issue detail:** problem (plain language) → We-steps / You-steps → AI insight (`--ai` block) → fix modal.
- **Fix modal:** "What will happen" summary; **"Fix this once"** vs **"Always fix this type"**; bulk variant w/ "Always fix this category automatically" toggle.
- **Impacted-assets side panel:** right overlay (no content push), occurrences + unique assets typed device/SaaS-account/cloud.
- **Outage modal:** active outage + "Are you impacted?" affected/unaffected assets + auto-retry note + status-page link.
- **Tables (TanStack):** 32–40px rows, `8px×12px` cells, 13px Figtree, hairline rows, hover `#F8FAFE`→`--subtle`, sticky header, mono ids, right-aligned numerics, bulk toolbar on selection.
- **Buttons:** primary solid (30px, r6); secondary outline; ghost (row/toolbar); AI lavender; destructive `--critical`. Focus ring 2px `--ring` + 2px offset.
- **Toasts (Sonner):** bottom, r8, elevation-2, status-accent left border, auto-dismiss 5s (errors persist).
- **Forms:** 30–32px inputs, r6, label 11px above, focus ring `--ring`, error `--critical` border + helper.

## 10. Iconography

lucide-react, single library. 14–16px in rows/buttons/nav, 18–20px in headers; stroke 1.8. Purple only for AI/sparkle. Domain glyphs: `server`, `hard-drive`, `database`, `cloud`, `mail`, `shield`, `rotate-ccw` (recovery), `camera` (screenshot verify), `building-2` (org), `monitor` (endpoint), `key` (auth), `wifi-off` (offline). Status/fix icons per §7–§8.

## 11. Accessibility

WCAG 2.2 AA: body ≥ 4.5:1, large/UI ≥ 3:1 on real token bg (check warning-orange + AI-purple). Status/fix-type/severity always dot + icon + text (color-blind safe). Full keyboard operability, visible `--ring` focus, logical order, no traps in modals/side-panel. `prefers-reduced-motion` alternative on every animation (spinners, panel slide, reveals). Dense/comfortable row-height toggle.

## 12. Tokens → Storybook → consume

`globals.css` (`:root` + `.dark`) → Tailwind theme → **Foundations** stories (Color, Typography, Spacing, Radius, Elevation, Icons, Fix-classification, Status) → mirrored in `DESIGN.md`. `globals.css` wins; add a token (all four places) rather than inlining a value.
