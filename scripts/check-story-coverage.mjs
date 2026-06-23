#!/usr/bin/env node
/**
 * Story-coverage gate (M2): every component .tsx under src/components must have a
 * sibling *.stories.tsx that is non-empty — it must export a meta (default
 * export) AND at least one named story export. This catches both a missing
 * story and a stub story file, so the gate proves real coverage rather than
 * mere file existence. (argTypes / play are required by M2 only where the
 * component has props / interactive states, so they are not gated universally.)
 * Excludes stories, tests, index barrels, and non-renderable helpers. Pure Node
 * (no deps) so CI runs it bare.
 */
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = join(root, "src", "components");

// Non-rendarable helpers (column definitions, etc.) don't need a story.
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

const components = walk(componentsDir);

/** A story file counts only if it has a meta (default export) + ≥1 named story. */
function storyIsReal(storyPath) {
  if (!existsSync(storyPath)) return false;
  const src = readFileSync(storyPath, "utf8");
  const hasMeta = /export\s+default\b/.test(src);
  const hasNamedStory = /export\s+const\s+[A-Z]\w*/.test(src);
  return hasMeta && hasNamedStory;
}

const offenders = components
  .map((f) => ({ component: f, story: f.replace(/\.tsx$/, ".stories.tsx") }))
  .filter(({ story }) => !storyIsReal(story));

if (offenders.length) {
  console.error(
    "Components without a real *.stories.tsx (M2 — needs a meta + ≥1 named story):",
  );
  for (const { component, story } of offenders) {
    const why = existsSync(story) ? "stub (no meta / named story)" : "missing";
    console.error(`  ✗ ${component.replace(root + "/", "")} — ${why}`);
  }
  process.exit(1);
}

console.log(
  `✓ Story coverage: ${components.length}/${components.length} components have a real story (meta + named states).`,
);
