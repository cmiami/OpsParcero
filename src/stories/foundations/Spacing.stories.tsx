import type { Meta, StoryObj } from "@storybook/nextjs-vite";

/**
 * Foundations / Spacing — the standard Tailwind 4px scale used throughout the
 * product for `gap-*` and `p-*`. Each bar below is rendered at its exact token
 * width (`w-{n}`) so spacing rhythm reads at a glance. Tokens only (M1) —
 * the bar fill uses `bg-primary`; the track uses `bg-subtle`.
 */

type Step = { n: number; px: number };

// Standard Tailwind spacing steps 1..16 (4px base).
const STEPS: Step[] = [
  { n: 1, px: 4 },
  { n: 2, px: 8 },
  { n: 3, px: 12 },
  { n: 4, px: 16 },
  { n: 5, px: 20 },
  { n: 6, px: 24 },
  { n: 8, px: 32 },
  { n: 10, px: 40 },
  { n: 12, px: 48 },
  { n: 14, px: 56 },
  { n: 16, px: 64 },
];

// Static width classes (no arbitrary values) — Tailwind generates w-{n} from the scale.
const WIDTH: Record<number, string> = {
  1: "w-1",
  2: "w-2",
  3: "w-3",
  4: "w-4",
  5: "w-5",
  6: "w-6",
  8: "w-8",
  10: "w-10",
  12: "w-12",
  14: "w-14",
  16: "w-16",
};

function Spacing() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
        Spacing scale (gap / padding)
      </h3>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="grid grid-cols-[88px_72px_1fr] items-center gap-3 px-4 py-2"
          >
            <code className="font-mono text-xs text-card-foreground">
              gap-{s.n}
            </code>
            <span className="font-mono text-xs text-muted-foreground">
              {s.px}px
            </span>
            <div className="flex h-3 items-center rounded-sm bg-subtle">
              <div className={`h-3 rounded-sm bg-primary ${WIDTH[s.n]}`} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Compose pages from these steps — e.g. <code className="font-mono">gap-4</code>{" "}
        between cards, <code className="font-mono">p-3</code> inside a dense table
        cell. Avoid pixel magic numbers; pick the nearest step.
      </p>
    </div>
  );
}

const meta: Meta = {
  title: "Foundations/Spacing",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
};

export default meta;
type Story = StoryObj;

export const Scale: Story = {
  render: () => <Spacing />,
};
