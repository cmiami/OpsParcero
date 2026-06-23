import type { Meta, StoryObj } from "@storybook/nextjs-vite";

/**
 * Foundations / Radius & Elevation — corner radii and the elevation ramp.
 * The product favors hairline borders for structure (M4); shadows are reserved
 * for genuinely floating surfaces (menus, dialogs, popovers). In dark mode
 * shadows recede on the slate canvas, so elevation leans on border emphasis —
 * toggle the theme in the toolbar to see the cards lean on their borders.
 */

type RadiusSwatch = { label: string; cls: string; px: string; use: string };
type ElevationSwatch = { label: string; cls: string; use: string };

const RADII: RadiusSwatch[] = [
  { label: "rounded-sm", cls: "rounded-sm", px: "4px", use: "chips · dot strips · inline tags" },
  { label: "rounded-md", cls: "rounded-md", px: "6px", use: "buttons · inputs · badges" },
  { label: "rounded-lg", cls: "rounded-lg", px: "8px", use: "cards · panels · table shell" },
  { label: "rounded-xl", cls: "rounded-xl", px: "10px", use: "dialogs · popovers · sheets" },
  { label: "rounded-full", cls: "rounded-full", px: "pill", use: "status dots · avatars · pills" },
];

const ELEVATION: ElevationSwatch[] = [
  { label: "shadow-e1", cls: "shadow-e1", use: "resting card · raised cell" },
  { label: "shadow-e2", cls: "shadow-e2", use: "dropdown · popover · tooltip" },
  { label: "shadow-e3", cls: "shadow-e3", use: "dialog · command palette" },
];

function RadiusElevation() {
  return (
    <div className="flex flex-col gap-8 p-4">
      <section className="flex flex-col gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          Radius
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {RADII.map((r) => (
            <div key={r.label} className="flex flex-col gap-2">
              <div
                className={`h-20 w-full border border-border bg-subtle ${r.cls}`}
              />
              <div className="flex flex-col">
                <code className="font-mono text-xs text-card-foreground">
                  {r.label}
                </code>
                <span className="font-mono text-xs text-faint-foreground">
                  {r.px}
                </span>
                <span className="text-xs text-muted-foreground">{r.use}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          Elevation
        </h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {ELEVATION.map((e) => (
            <div key={e.label} className="flex flex-col gap-2">
              <div
                className={`flex h-24 items-center justify-center rounded-lg border border-border bg-card ${e.cls}`}
              >
                <span className="text-sm font-bold text-card-foreground">
                  {e.label}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{e.use}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Dark mode leans on borders: the slate canvas swallows shadows, so raised
          surfaces read through <code className="font-mono">border border-border</code>{" "}
          rather than the shadow ramp. Toggle the theme to verify.
        </p>
      </section>
    </div>
  );
}

const meta: Meta = {
  title: "Foundations/Radius & Elevation",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
};

export default meta;
type Story = StoryObj;

export const Reference: Story = {
  render: () => <RadiusElevation />,
};
