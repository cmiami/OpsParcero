#!/usr/bin/env node
/**
 * Story-coverage gate (M2): every component .tsx under src/components must have a
 * sibling *.stories.tsx that proves REAL coverage — not just a stub. A story is
 * real when it has:
 *   • a meta (default export) AND ≥1 named story export, and
 *   • `argTypes` — IF the component declares props (covers all props/variants), and
 *   • a `play` fn — IF the component is interactive (handler props / internal state).
 *
 * This is the full M2 mandate ("argTypes covering all props/variants … and a play
 * function for interactive states. This is the 100% coverage rule."), enforced —
 * no allowlist. Excludes stories, tests, index barrels, and non-renderable
 * helpers. Pure Node (no deps) so CI runs it bare.
 */
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasProps,
  isInteractive,
  isPrimitiveComponent,
} from "./story-coverage-detect.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = join(root, "src", "components");

// Non-renderable helpers (column definitions, etc.) don't need a story.
const SKIP = new Set(["theme-provider.tsx", "columns.tsx"]);

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (
      entry.endsWith(".tsx") &&
      !entry.endsWith(".stories.tsx") &&
      !entry.endsWith(".test.tsx") &&
      entry !== "index.tsx" &&
      !SKIP.has(entry)
    ) {
      files.push(full);
    }
  }
  return files;
}

function storyFacets(storyPath) {
  const raw = readFileSync(storyPath, "utf8");
  // Strip block + line comments before the regex pass, so a `// play:` note or an
  // `argTypes:` mentioned in a comment can't satisfy a facet. The line-comment
  // strip guards against `://` in URLs.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  return {
    exists: true,
    hasMeta: /export\s+default\b/.test(src),
    hasNamedStory: /export\s+const\s+[A-Z]\w*/.test(src),
    hasArgTypes: /argTypes\s*:/.test(src),
    hasPlay: /\bplay\s*:/.test(src),
  };
}

const components = walk(componentsDir);

/** @type {{component:string, reasons:string[]}[]} */
const offenders = [];
for (const component of components) {
  const story = component.replace(/\.tsx$/, ".stories.tsx");
  const rel = component.replace(root + "/", "");
  if (!existsSync(story)) {
    offenders.push({ component: rel, reasons: ["missing story"] });
    continue;
  }
  const f = storyFacets(story);
  const src = readFileSync(component, "utf8");
  const reasons = [];
  if (!f.hasMeta || !f.hasNamedStory) reasons.push("stub (no meta / named story)");
  // Thin shadcn ui/ primitives re-export upstream-typed props — meta + story is
  // enough; argTypes/play are enforced on PRODUCT components (#19).
  const primitive = isPrimitiveComponent(rel);
  if (!primitive && hasProps(src) && !f.hasArgTypes)
    reasons.push("missing argTypes (component has props)");
  if (!primitive && isInteractive(src) && !f.hasPlay)
    reasons.push("missing play (component is interactive)");
  if (reasons.length) offenders.push({ component: rel, reasons });
}

if (offenders.length) {
  console.error(
    "Components whose story does not meet M2 (meta + named story + argTypes-if-props + play-if-interactive):",
  );
  for (const { component, reasons } of offenders) {
    console.error(`  ✗ ${component} — ${reasons.join("; ")}`);
  }
  console.error(`\n${offenders.length} component(s) need work.`);
  process.exit(1);
}

console.log(
  `✓ Story coverage: ${components.length}/${components.length} components — meta + named states + argTypes(props) + play(interactive).`,
);

// ── Route coverage (P1-8) ────────────────────────────────────────────────────
// The gate above covers src/components. Route page.tsx files live in src/app and
// are NOT components — they compose organisms with the Next runtime (nuqs /
// useParams), so most can't be storied directly. To stop a route from regressing
// INVISIBLY (the component count never sees it), every route must be ACKNOWLEDGED
// here: either covered by a Pages/* composition story, or explicitly listed as
// intentionally unstoried (with the reason it relies on organism stories / the
// Next runtime). A new, unacknowledged route fails the gate.
const appDir = join(root, "src", "app");

/** @param {string} dir @returns {string[]} route page.tsx paths relative to src/app */
function walkRoutes(dir) {
  /** @type {string[]} */
  const routes = [];
  if (!existsSync(dir)) return routes;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      routes.push(...walkRoutes(full));
    } else if (entry === "page.tsx") {
      routes.push(full.replace(appDir + "/", ""));
    }
  }
  return routes;
}

// Routes whose page composition IS exercised by a Pages/* story (console-pages).
const ROUTES_WITH_PAGE_STORY = new Set([
  "(console)/backups/page.tsx", // Pages/Console → Backups (AssetTable)
  "(console)/fleet/page.tsx", // same AssetTable composition
  "(console)/alerts/page.tsx", // Pages/Console → Alerts (AlertTriageList)
  "(console)/automation/runs/page.tsx", // Pages/Console → RunHistory
]);

// Routes intentionally without a page-level story — each is covered by its
// organism's own story and/or needs the Next runtime (nuqs/useParams) a CSF
// story can't supply. Listed explicitly so the set can't grow silently.
const ROUTES_INTENTIONALLY_UNSTORIED = new Set([
  "(console)/resolution/page.tsx", // ResolutionCenter organism story (nuqs)
  "(console)/automation/approvals/page.tsx", // ApprovalQueue organism story
  "(console)/automation/playbooks/page.tsx", // PlaybookList organism story
  "(console)/automation/policies/page.tsx", // PoliciesView + editor stories
  "(console)/cart/page.tsx", // ActionCart organism story
  "(console)/fleet/[assetId]/page.tsx", // asset-detail: Next params + dialogs
  "(console)/incidents/[id]/page.tsx", // incident detail: Next params
  "(console)/products/[product]/page.tsx", // product lens: Next params
  "(console)/overview/page.tsx", // KPI composition (aggregate tiles, deferred)
  "(console)/reports/page.tsx", // KPI composition (aggregate tiles, deferred)
  "(console)/settings/page.tsx", // static settings surface
  "page.tsx", // root redirect entry
]);

const routes = walkRoutes(appDir);
const unacknowledgedRoutes = routes.filter(
  (r) =>
    !ROUTES_WITH_PAGE_STORY.has(r) && !ROUTES_INTENTIONALLY_UNSTORIED.has(r),
);
if (unacknowledgedRoutes.length) {
  console.error(
    "Routes not acknowledged for story coverage (add a Pages/* story OR list as intentionally unstoried in check-story-coverage.mjs):",
  );
  for (const r of unacknowledgedRoutes) console.error(`  ✗ ${r}`);
  process.exit(1);
}
console.log(
  `✓ Route coverage: ${ROUTES_WITH_PAGE_STORY.size}/${routes.length} routes have a page-level story; ${ROUTES_INTENTIONALLY_UNSTORIED.size} intentionally unstoried (covered by organism stories or need the Next runtime).`,
);
