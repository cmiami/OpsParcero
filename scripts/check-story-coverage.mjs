#!/usr/bin/env node
/**
 * 100%-coverage gate (M2): every component .tsx under src/components must have a
 * sibling *.stories.tsx. Excludes stories, tests, index barrels, and the
 * theme-provider plumbing component. Pure Node (no deps) so CI runs it bare.
 */
import { readdirSync, existsSync, statSync } from "node:fs";
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
const missing = components.filter(
  (f) => !existsSync(f.replace(/\.tsx$/, ".stories.tsx")),
);

if (missing.length) {
  console.error("Components missing a *.stories.tsx (M2 — 100% coverage):");
  for (const m of missing) console.error("  ✗ " + m.replace(root + "/", ""));
  process.exit(1);
}

console.log(
  `✓ Story coverage: ${components.length}/${components.length} components have stories.`,
);
