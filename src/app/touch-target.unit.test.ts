import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The touch-target @utility is a `pointer: coarse` media query, so the
// fine-pointer test browser can't compute it — gate the regression (#14) at the
// source: it must resolve to an absolute 44px (WCAG 2.2 AA, M5). A rem value
// would resolve against the intentional 13px root (2.75rem = ~35.75px), silently
// missing the target — exactly the bug this guards.
describe("touch-target hit area (#14)", () => {
  it("declares an absolute 44px, never a rem", () => {
    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const m = css.match(/@utility touch-target\s*\{([\s\S]*?)\n\}/);
    expect(m, "@utility touch-target block").not.toBeNull();
    const block = m![1];
    expect(block).toMatch(/min-block-size:\s*44px/);
    expect(block).toMatch(/min-inline-size:\s*44px/);
    expect(block).not.toMatch(/\brem\b/);
  });
});
