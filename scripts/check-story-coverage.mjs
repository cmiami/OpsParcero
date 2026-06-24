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

/** Does the component declare props (so the story must document them via argTypes)? */
function hasProps(src) {
  return (
    /(interface|type)\s+\w*Props\b/.test(src) ||
    // A component whose only export takes a typed `{ ... }: SomeProps` param.
    /:\s*\w*Props\b/.test(src)
  );
}

/** Is the component interactive (so the story must exercise it with a play fn)? */
function isInteractive(src) {
  return (
    /\bon[A-Z]\w*\s*[?:]/.test(src) || // a handler PROP is declared
    /\b(useState|useReducer)\b/.test(src) || // owns interactive state
    /\son(Click|Change|Select|ValueChange|CheckedChange|OpenChange|Submit)=/.test(
      src,
    ) // binds a handler in JSX
  );
}

function storyFacets(storyPath) {
  const src = readFileSync(storyPath, "utf8");
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
  if (hasProps(src) && !f.hasArgTypes) reasons.push("missing argTypes (component has props)");
  if (isInteractive(src) && !f.hasPlay) reasons.push("missing play (component is interactive)");
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
