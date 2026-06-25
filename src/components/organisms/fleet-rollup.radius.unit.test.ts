import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The donut radii MUST be percentages of the rendered box, never absolute px.
// The root is 13px (intentional density), so a Tailwind `size-40` box is ~130px,
// not 160px; an absolute outerRadius sized for 160px overflows the SVG and gets
// clipped flat by the square viewport into a "squircle". Percentages auto-fit any
// box + any root. Gate the SOURCE — the geometry isn't queryable from the DOM.
describe("FleetRollup donut radii (#squircle)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/organisms/fleet-rollup.tsx"),
    "utf8",
  );

  it("declares percentage radius constants, never absolute px", () => {
    expect(src).toMatch(/INNER_RADIUS\s*=\s*"\d+%"/);
    expect(src).toMatch(/OUTER_RADIUS\s*=\s*"\d+%"/);
  });

  it("feeds the Pie those percentage constants, not a numeric px radius", () => {
    expect(src).toMatch(/outerRadius=\{OUTER_RADIUS\}/);
    expect(src).toMatch(/innerRadius=\{INNER_RADIUS\}/);
    // No absolute-px radius prop (e.g. outerRadius={75}) that would clip at 13px.
    expect(src).not.toMatch(/(inner|outer)Radius=\{\s*\d+\s*\}/);
  });
});
