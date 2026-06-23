import type { Meta, StoryObj } from "@storybook/nextjs-vite";

/**
 * Foundations / Color — the Kaseya Resolution Center palette, rendered straight
 * from semantic tokens (M1). Every swatch is a `bg-*` utility bound to a CSS
 * variable in globals.css, so this story is a live audit of the token set in
 * both light and dark (use the theme toggle in the toolbar).
 */

type Swatch = { label: string; cls: string; note?: string };
type Group = { title: string; swatches: Swatch[] };

const GROUPS: Group[] = [
  {
    title: "Brand · Kaseya blue (actions, active, focus)",
    swatches: [
      { label: "primary", cls: "bg-primary", note: "buttons · topbar · focus" },
      { label: "primary-strong", cls: "bg-primary-strong", note: "hover / pressed" },
      { label: "primary-accent", cls: "bg-primary-accent", note: "active nav · links" },
      { label: "primary-tint", cls: "bg-primary-tint", note: "selected row bg" },
    ],
  },
  {
    title: "AI-assist · purple (AI surfaces ONLY)",
    swatches: [
      { label: "ai", cls: "bg-ai" },
      { label: "ai-accent", cls: "bg-ai-accent" },
      { label: "ai-tint", cls: "bg-ai-tint" },
    ],
  },
  {
    title: "Surfaces & text",
    swatches: [
      { label: "background", cls: "bg-background" },
      { label: "subtle", cls: "bg-subtle" },
      { label: "foreground", cls: "bg-foreground" },
      { label: "muted-foreground", cls: "bg-muted-foreground" },
      { label: "faint-foreground", cls: "bg-faint-foreground" },
      { label: "border", cls: "bg-border" },
    ],
  },
  {
    title: "Fix classification (load-bearing)",
    swatches: [
      { label: "fix-endtoend", cls: "bg-fix-endtoend", note: "End-to-end (green)" },
      { label: "fix-guided", cls: "bg-fix-guided", note: "Guided (blue)" },
      { label: "fix-insights", cls: "bg-fix-insights", note: "Insights (orange)" },
      { label: "fix-unknown", cls: "bg-fix-unknown", note: "Unknown (gray)" },
    ],
  },
  {
    title: "Severity",
    swatches: [
      { label: "critical", cls: "bg-critical" },
      { label: "warning", cls: "bg-warning" },
      { label: "success", cls: "bg-success" },
    ],
  },
  {
    title: "Asset health states",
    swatches: [
      { label: "status-protected", cls: "bg-status-protected" },
      { label: "status-warning", cls: "bg-status-warning" },
      { label: "status-failed", cls: "bg-status-failed" },
      { label: "status-paused", cls: "bg-status-paused" },
      { label: "status-syncing", cls: "bg-status-syncing" },
      { label: "status-offline", cls: "bg-status-offline" },
    ],
  },
  {
    title: "Product accents (chips / charts)",
    swatches: [
      { label: "product-saas", cls: "bg-product-saas" },
      { label: "product-bcdr", cls: "bg-product-bcdr" },
      { label: "product-endpoint", cls: "bg-product-endpoint" },
    ],
  },
  {
    title: "Charts",
    swatches: [
      { label: "chart-1", cls: "bg-chart-1" },
      { label: "chart-2", cls: "bg-chart-2" },
      { label: "chart-3", cls: "bg-chart-3" },
      { label: "chart-4", cls: "bg-chart-4" },
      { label: "chart-5", cls: "bg-chart-5" },
    ],
  },
];

function Palette() {
  return (
    <div className="flex flex-col gap-6 p-2">
      {GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
            {group.title}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {group.swatches.map((s) => (
              <div
                key={s.label}
                className="overflow-hidden rounded-lg border border-border bg-card"
              >
                <div className={`h-12 w-full ${s.cls}`} />
                <div className="px-3 py-2">
                  <p className="font-mono text-xs text-card-foreground">{s.label}</p>
                  {s.note ? (
                    <p className="text-xs text-muted-foreground">{s.note}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const meta: Meta = {
  title: "Foundations/Color",
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
};

export default meta;
type Story = StoryObj;

export const Palette_: Story = {
  name: "Palette",
  render: () => <Palette />,
};
