---
name: Kaseya Resolution Center
description: Troubleshooting-first automation module inside the Kaseya/Datto portal
colors:
  primary: "#0E67F5"          # Kaseya blue — primary actions, topbar
  primary-strong: "#0D47A1"   # hover / pressed
  primary-accent: "#1565C0"   # active nav, links, selected row
  primary-tint: "#EEF5FF"     # active / selected background
  ai: "#6A1B9A"               # AI-assist text/icon (purple)
  ai-accent: "#AB47BC"
  ai-tint: "#F3E5F5"          # AI surfaces background
  bg: "#FFFFFF"               # content canvas
  surface: "#FFFFFF"          # cards / panels
  subtle: "#F8F9FC"           # stat bar / muted surface
  ink: "#1A2332"              # primary text
  muted-fg: "#586A7E"         # secondary text
  faint-fg: "#5F6F84"         # labels / captions
  border: "#E2E8F0"           # hairline borders
  nav-fg: "#455A64"           # nav item text
  nav-hover: "#F0F4F8"        # nav hover bg
  fix-endtoend: "#2E7D32"     # End-to-end fix (fully automatable)
  fix-guided: "#1565C0"       # Guided fix (We + You steps)
  fix-insights: "#C2410C"     # Insights only (not controllable / external)
  fix-unknown: "#9E9E9E"      # Unknown classification
  critical: "#C62828"         # critical severity
  critical-tint: "#FFEBEE"
  warning: "#C2410C"          # warning severity
  warning-tint: "#FFF3E0"
  success: "#2E7D32"          # resolved / healthy
  success-tint: "#E8F5E9"
  product-saas: "#1976D2"     # product accent — SaaS
  product-bcdr: "#C2410C"     # product accent — BCDR
  product-endpoint: "#2E7D32" # product accent — Endpoint v2
  dark-bg: "#0F172A"          # dark canvas (slate)
  dark-surface: "#1E293B"     # dark raised surface
  dark-border: "#334155"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, Figtree, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Plus Jakarta Sans, Figtree, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Figtree, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.07em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  "2xl": "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "5px 12px"
    height: "30px"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.surface}"
  button-fix:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "4px 9px"
  button-ai:
    backgroundColor: "{colors.ai-tint}"
    textColor: "{colors.ai}"
    rounded: "{rounded.md}"
    padding: "4px 9px"
  nav-item-active:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary-accent}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  badge-critical:
    backgroundColor: "{colors.critical-tint}"
    textColor: "{colors.critical}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-warning:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  sidebar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.nav-fg}"
    width: "218px"
  topbar:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    height: "50px"
---

## Overview

The Kaseya Resolution Center is a **module inside the Kaseya/Datto portal** — a troubleshooting console where an MSP tech triages backup/DR **issues grouped by category**, understands *why* each failed, and runs the **fix**. It reads as a native portal surface: a **white left nav**, a **Kaseya-blue (`#0E67F5`) topbar**, and a light, data-dense content canvas. Personality: **trustworthy, fast, expert** — a senior engineer's console, not a marketing page. Structure comes from **hairline borders and typographic hierarchy**, not heavy shadows. Density is a feature; clarity keeps it from clutter. The only "delight" is the satisfaction of a clean resolution.

This is the canonical visual reference; tokens are normative, match them exactly. Comprehensive spec: `docs/03-design-system.md`. Product model: `docs/00-vision-and-scope.md`.

## Colors

**Strategy: Restrained** — neutrals + Kaseya blue as the single action accent. Color is information here (severity, fix-type, product), not decoration.

- **Primary — Kaseya blue `#0E67F5`**: topbar, primary/fix buttons, focus. Hover `#0D47A1`. **`#1565C0`** for active nav, links, selected rows; **`#EEF5FF`** as the active/selected tint.
- **AI-assist — purple `#6A1B9A` / `#AB47BC`** on tint `#F3E5F5`: the *only* place purple appears. Used for AI insight surfaces and the AI button (sparkle glyph). Never mixed silently with deterministic content.
- **Neutrals:** canvas/surface `#FFFFFF`, subtle surface (stat bar) `#F8F9FC`, ink `#1A2332`, muted text `#586A7E`, faint labels `#5F6F84`, hairline border `#E2E8F0`. Nav text `#455A64`, nav hover `#F0F4F8`.
- **Dark mode:** slate — canvas `#0F172A`, surface `#1E293B`, border `#334155`, ink `#E2E8F0`. (Portal dark is slate, not teal.) The **topbar uses a fixed `--topbar` (`#0E67F5`) that does NOT flip** (like the white nav), and dark-mode `--primary-foreground` is dark ink (`#0A1322`) so primary buttons stay AA on the lifted dark blue.
- **WCAG 2.2 AA tuning (verified with axe across every screen, light + dark):** the deep orange (warning / Insights / BCDR accent) is `#C2410C` (not `#E65100`) and faint/muted/paused/offline/syncing text colors are darkened so 10px labels and status-on-tint chips clear 4.5:1. globals.css is the source of truth.

**Fix classification (the load-bearing semantic — see `00-vision` §model):**

| Fix type | Label | Color | Meaning |
|---|---|---|---|
| `full` | End-to-end fix | green `#2E7D32` | fully automatable, one-click |
| `partial` | Guided fix | blue `#1565C0` | some steps automated (We), some manual (You) |
| `external`/`manual` | Insights only | orange `#C2410C` | not controllable (vendor/infra) |
| `unknown` | Insights only | gray `#9E9E9E` | root cause unknown |

**Severity & status (never color-only — always dot + icon + label):** Critical `#C62828` on `#FFEBEE`; Warning `#C2410C` on `#FFF3E0`; Resolved/healthy `#2E7D32` on `#E8F5E9`. **Product accents** (chips/charts): SaaS `#1976D2`, BCDR `#C2410C`, Endpoint v2 `#2E7D32`.

## Typography

Kaseya brand families: **Figtree** (body/UI/tables) + **Plus Jakarta Sans** (display/headings). Data-dense base.

- **Body/UI/tables:** Figtree **13px**/400 (dense tables to 12px). Closest fallback: Inter / system-ui.
- **Headings:** Plus Jakarta Sans — page title 24/700, section 15/700, card title 13/700.
- **Labels/eyebrows:** 10px/700 uppercase, `letter-spacing 0.07em`, color faint `#5F6F84` (stat names, table headers, section labels).
- **Mono:** IDs, hostnames, error codes, ports, sizes (`ui-monospace, SFMono-Regular, Menlo…`).

Fixed px scale (product UI at consistent DPI), tight ratio. One family for headings, the other for body — never two near-identical sans.

## Elevation

Structure via **hairline borders, not shadows.**

- `elevation-0` — flat, border-defined (default for cards/rows/tables).
- `elevation-1` (hover card) — `0 2px 10px rgba(0,0,0,.08)`.
- `elevation-2` (dropdown/popover/toast) — `0 4px 16px rgba(0,0,0,.10)`.
- `elevation-3` (modal / side panel) — `0 8px 32px rgba(0,0,0,.20)` (side panel: `-4px 0 16px rgba(0,0,0,.08)`).

Build a semantic z-index scale (dropdown → sticky → side-panel → modal-backdrop → modal → toast → tooltip); never arbitrary `9999`. Radius: 4px chips/inputs, **6px buttons**, 8px cards, full for status dots/pills. Dark mode: lean on borders (`#334155`) over shadows.

## Components

Every interactive component ships all states: default, hover, focus, active, disabled, loading, error. Skeletons for loading; empty states that teach.

- **Left nav (white):** 218px, sections (Views / Reports) with 10px uppercase faint labels; item = 14px lucide + 12.5px label, `#455A64`; hover `#F0F4F8`; **active = `#EEF5FF` bg + 3px left blue (`#1565C0`) border + blue text**. Tenant switcher top; "Recent Organizations" list.
- **Topbar (Kaseya blue `#0E67F5`):** Kaseya mark + "Resolution Center"; right side: Scan now, End-to-end fix all, notifications, avatar. White translucent buttons.
- **Stat bar:** thin strip under topbar — Resolved today/month, per-product deltas (▲/▼), active-outage indicator (red, click → outage modal).
- **Summary cards:** Top problem of the day · Open issues · Critical issues · End-to-end fixable. Colored top-border by role; big number; click → impacted-assets panel.
- **Charts:** Issue trend (line, open vs resolved) · By product (donut) · By category (pie) · Fix-classification (donut). Series colored by the fix/product/status tokens; soft gridlines.
- **Category group:** collapsible card per category — chevron, icon, name, count badge, critical badge, sparkline. Expands to the **issue table**.
- **Issue row:** name + detail (mono asset id) · product chip · severity badge · **occurrence count** (clickable → impacted assets) · **Fix** button (blue) + **AI** button (purple) · expands to detail.
- **Issue detail / fix panel:** plain-language problem → **"We" steps (automated, blue)** vs **"You" steps (manual, orange)** → AI insight (purple) → fix modal with **"Fix this once"** vs **"Always fix this type / category"**.
- **Fix modal:** "What will happen" summary; once vs always actions; bulk "End-to-end fix all" with per-category always toggle.
- **Impacted-assets side panel:** right overlay (does not push content); occurrences + unique assets typed device/SaaS-account/cloud.
- **Outage modal:** active service outage → "Are you impacted?" affected vs unaffected assets; auto-retry note; status-page link.
- **Tables:** dense (32–40px rows), 8px×12px cells, 13px Figtree, hairline rows, hover `#F8FAFE`, sticky header, mono ids, right-aligned numerics, bulk toolbar on selection.
- **Buttons:** primary solid blue (30px, radius 6px); secondary outline; ghost (row/toolbar actions); AI = lavender bg + purple text + sparkle. **Toasts:** bottom-center/right, status-accented.
- **Icons:** lucide, 14–16px, 1.8 stroke; purple only for AI/sparkle.

## Do's and Don'ts

**Do**
- Drive every color/size/radius/font from tokens; render the token set as Storybook Foundations stories.
- Group issues by category; lead with severity + fix-type; pair every issue with its fix (We/You steps) and Fix-once/Always.
- Reserve purple for AI-assist only; reserve Kaseya blue for actions/active.
- Use hairline borders for structure; give every status a dot + icon + label.

**Don't**
- Hardcode any color/spacing/radius/font, or build a one-off outside the design system / Storybook.
- Use the Datto-teal sidebar / Datto-blue primary — those are demoted to product-context accents (BCDR), not the app shell.
- Put competitor names/branding/derived patterns anywhere in the product.
- Nest cards, use side-stripe borders >1px as decoration, gradient text, decorative glassmorphism, hero-metric templates, identical icon-card grids, or per-section uppercase eyebrows (impeccable bans).
- Add decorative page-load motion. Motion conveys state only (150–250ms), with a reduced-motion alternative.
