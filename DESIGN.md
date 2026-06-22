<!-- SEED: pre-implementation. Re-run `/impeccable document` (scan mode) once globals.css exists to capture real extracted tokens. Tokens below are confirmed from live Kaseya/Datto CSS (see docs/research/01-design-system-research.md). -->
---
name: Datto Care Center
description: Troubleshooting-first automation console for the Datto/Kaseya data-protection stack
colors:
  primary: "#199ED9"            # Datto Curious Blue — primary actions, focus, selection
  primary-strong: "#0580C2"     # pressed/hover
  primary-dark: "#2BA5E0"       # brighter primary for dark surfaces
  tiber: "#002A3A"              # deep teal — app shell / sidebar canvas
  tiber-700: "#1B434D"          # teal raised surface / nav hover
  accent-mint: "#30DAC1"        # teal/mint accent
  accent-mint-strong: "#10BDA4"
  kaseya: "#5E42FF"             # Kaseya corporate purple — upsell/"Powered by Kaseya" ONLY
  bg: "#F6F9FC"                # light page canvas
  surface: "#FFFFFF"            # cards/panels
  ink: "#212529"               # primary text
  muted-fg: "#6C757D"           # secondary text
  border: "#DEE2E6"             # hairline borders/inputs
  dark-bg: "#0C2129"            # dark canvas (teal-black)
  dark-surface: "#122F38"       # dark raised surface
  success: "#28A745"            # Protected / Healthy
  warning: "#FFC107"            # Warning / stale
  danger: "#DC3545"             # Failed / Critical
  info: "#17A2B8"               # informational
  status-paused: "#6C757D"      # intentional pause (desaturated)
  status-offline: "#343A40"     # unreachable (colder than paused)
typography:
  display:
    fontFamily: "Plus Jakarta Sans, Figtree, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.28
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Plus Jakarta Sans, Figtree, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.44
    letterSpacing: "normal"
  body:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "normal"
  caption:
    fontFamily: "Figtree, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "0.04em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.38
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
  badge-status:
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
    typography: "{typography.caption}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
  sidebar:
    backgroundColor: "{colors.tiber}"
    textColor: "#CBD7DC"
    width: "240px"
  table-cell:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "8px 12px"
    height: "40px"
---

## Overview

Datto Care Center reads as a **native Datto/Kaseya portal** surface: a deep Tiber-teal app shell (left nav + top omni-search bar) wrapping a light, data-dense content canvas. The personality is **trustworthy, fast, expert** — a senior engineer's troubleshooting console, not a marketing page. Design *serves* the task: triage a wall of backup alerts, understand *why* something failed, and run the fix. Density is a feature; clarity is the discipline that keeps density from becoming clutter. Visual structure comes from **hairline borders and typographic hierarchy**, not heavy shadows or decoration. Dark mode is teal-black (a subtle teal cast in every surface), never generic carbon-gray. The tool should disappear into the task; the only "delight" is the satisfaction of a clean resolution.

This is the canonical visual reference for all agents generating screens. Tokens are normative; match them exactly. Full rationale and sourcing in `docs/research/01-design-system-research.md`; comprehensive spec in `docs/03-design-system.md`.

## Colors

**Brand strategy: Restrained** (product floor) — tinted neutrals + Datto blue as the single accent for primary actions, current selection, and focus. Color is information here, not decoration.

- **Primary — Datto Curious Blue `#199ED9`** (HSL `199 75% 47%`): primary buttons, active nav indicator, focus rings, selected rows, syncing state, default chart series. Hover/pressed `#0580C2`. On dark surfaces lift to `#2BA5E0`.
- **App shell — Tiber teal `#002A3A`** (`197 100% 11%`): left sidebar and dark-mode canvas base. Raised teal surfaces / nav hover `#1B434D`.
- **Accent — Mint `#30DAC1`** (`173 71% 52%`): sparingly, for positive emphasis and secondary chart series; pops on the teal shell.
- **Kaseya purple `#5E42FF`** is the **corporate accent only** — "Powered by Kaseya," IT Complete upsell, cross-sell banners. **Never** use it for routine product actions.
- **Neutrals:** canvas `#F6F9FC`, surface `#FFFFFF`, ink `#212529`, muted text `#6C757D`, hairline border `#DEE2E6`. Dark: canvas `#0C2129`, surface `#122F38`.

**Backup health / status semantics (never color-only — always dot + icon + label):**

| State | Color | Icon (lucide) |
|---|---|---|
| Protected / Healthy | success `#28A745` | `shield-check` / `circle-check` |
| Warning (stale, nearing quota) | warning `#FFC107` (dark text on amber) | `alert-triangle` |
| Failed / Critical | danger `#DC3545` | `x-circle` / `octagon-alert` |
| Paused (intentional) | desaturated `#6C757D` | `pause-circle` |
| Syncing / In progress | primary `#199ED9` (slow spin) | `refresh-cw` / `loader` |
| Offline / Unreachable | cold `#343A40` | `cloud-off` / `wifi-off` |

Severity order for sort/rollup: **Failed > Warning > Offline > Syncing > Paused > Protected.** A fleet rollup shows the worst real child state. Verify contrast on amber (use dark foreground) and on teal-black dark surfaces.

## Typography

Two confirmed brand families, both variable-weight geometric/humanist sans:

- **Display / headings — Plus Jakarta Sans.** Page titles (28/700), section titles (22/600), card headers (18/600). Fixed rem scale, not fluid (product UI at consistent DPI).
- **Body / UI / tables — Figtree.** Default UI text and table cells **14px/400** (data density — base is 14, not 16). Dense rows 13px. Closest web-font fallback if needed: Inter.
- **Caption / labels — Figtree 12px/500**, uppercase, `letter-spacing 0.04em` for table headers and badge labels.
- **Mono** for IDs, IPs, sizes, timestamps, error codes (`ui-monospace, SFMono-Regular, Menlo…`).

Tight type scale ratio (1.125–1.2). Prose capped 65–75ch; tables may run denser. One family carries headings, the other body — paired on a real contrast axis (geometric display vs humanist UI), never two near-identical sans.

## Elevation

Structure comes from **hairline borders, not shadows.** Soft, low-contrast elevation only where layering demands it:

- `elevation-0` — flat, border-defined (default for cards/tables).
- `elevation-1` (card) — `0 1px 2px rgba(16,42,58,.06), 0 1px 3px rgba(16,42,58,.10)`.
- `elevation-2` (dropdown/popover/toast) — `0 4px 12px rgba(16,42,58,.12)`.
- `elevation-3` (modal/sheet) — `0 12px 32px rgba(16,42,58,.18)`.

**Dark mode:** replace shadows with border emphasis (`1px solid border`) + a faint `inset 0 1px 0 rgba(255,255,255,.03)` top highlight — shadows read poorly on teal-black. Build a semantic z-index scale (dropdown → sticky → modal-backdrop → modal → toast → tooltip); never arbitrary `9999`. Radius: 4px chips/inputs-sm, **8px default** (buttons/cards/inputs), 12px modals/popovers, full for status dots/pills.

## Components

Every interactive component ships **all** states: default, hover, focus, active, disabled, loading, error. Skeletons (not center spinners) for loading; empty states that *teach* the interface.

- **Buttons:** primary solid Datto-blue (36px / sm 32px / lg 40px, radius 8px, 600); secondary outline (1px border, muted hover); ghost (table-row & toolbar actions); destructive solid red for purge/delete; icon buttons 32×32 with 16px lucide. Focus ring 2px primary @40% + 2px offset.
- **Tables (the core surface):** dense by default (40px row / 32px compact), cell padding `8px 12px`, body 14px. Header 12px uppercase 600 muted, sortable. Hairline row borders; hover → muted; selected → primary @8% bg + 2px left primary border. Sticky header + sticky first column; right-align numerics; mono for IDs/sizes. **Signature pattern:** inline "last 10 backups" green/red dot-strip and mini sparklines in cells. Bulk-action toolbar appears above the grid on selection.
- **Status badge:** one `<StatusBadge state=… />` = 8px dot + icon + 12px caption + subtle-bg, driven by the status table above.
- **Cards / KPI:** white on `#F6F9FC`, radius 8px, border or elevation-1. KPI = 28–32px Jakarta number + caption + trend delta (success/danger). **Never nest cards.**
- **Sidebar:** Tiber-teal rail, 240px expanded / 64px collapsed, 16px lucide + 14px label, active item = teal-700 bg + 3px left blue indicator + white text. Tenant switcher top, collapse toggle bottom.
- **Top bar:** 56–60px, breadcrumb left, full-width global omni-search (magnifying glass, `f` shortcut — Datto pattern) center, tenant selector + notifications bell + avatar right.
- **Toasts:** bottom-right, radius 8px, elevation-2, 4px left status accent, leading icon, auto-dismiss 5s (errors persist).
- **Forms:** 36px inputs, radius 8px, label 13px/500 above, focus ring primary, error = red border + 12px helper.
- **Charts:** series order blue → mint → purple → amber → info; status charts always use status tokens; soft gridlines, no heavy axes.

## Do's and Don'ts

**Do**
- Drive every color/size/radius/font from tokens (CSS variables); render the token set as Storybook Foundations stories.
- Lead with triage: severity-sorted, worst-state rollups, real risk above cosmetic noise.
- Pair every failure state with its remediation action(s) inline. Show the evidence (error string, chain state, dot-strip).
- Use hairline borders for structure; keep a subtle teal cast in dark surfaces.
- Give every state a dot + icon + label (a11y, color-blind safe, matches Datto convention).

**Don't**
- Hardcode any color/spacing/radius/font, or invent a one-off component outside the design system / Storybook.
- Use Kaseya purple for routine actions (corporate-accent only).
- Nest cards, use side-stripe borders >1px as decoration, gradient text, decorative glassmorphism, hero-metric templates, identical icon-card grids, or per-section uppercase eyebrows (impeccable absolute bans).
- Color every imperfect state red — reserve red for real failures; desaturate intentional/paused.
- Reinvent standard affordances (custom scrollbars, weird modals) or add decorative page-load motion. Motion conveys state only (150–250ms), with a reduced-motion alternative.
