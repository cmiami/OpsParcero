import type { Meta, StoryObj } from "@storybook/nextjs-vite";

/**
 * Foundations / Typography — the type system for Kaseya Resolution Center.
 * Plus Jakarta Sans (`font-display`) carries headings; Figtree (`font-sans`)
 * is the 13px UI/body default; a mono stack (`font-mono`) carries IDs, hosts,
 * sizes, and verbatim error codes. Every sample below is rendered straight from
 * token utilities (M1) — toggle the theme in the toolbar to verify light + dark.
 */

type Sample = {
  step: string;
  cls: string;
  spec: string;
  text: string;
};

const FAMILIES: { label: string; cls: string; specimen: string }[] = [
  {
    label: "font-display — Plus Jakarta Sans (headings)",
    cls: "font-display text-2xl font-bold tracking-tight",
    specimen: "Resolution Center",
  },
  {
    label: "font-sans — Figtree (body / UI, 13px base)",
    cls: "font-sans text-sm",
    specimen: "Screenshot verification failed on btru-hv2022 — diff-merge stalled.",
  },
  {
    label: "font-mono — IDs · hosts · sizes · error codes",
    cls: "font-mono text-sm text-card-foreground",
    specimen: "SIRIS-NYC-01 · 8.0 TB · 0x0000007B · AADSTS90002",
  },
];

const SCALE: Sample[] = [
  {
    step: "Page title",
    cls: "font-display text-2xl font-bold tracking-tight",
    spec: "font-display · text-2xl · bold",
    text: "BCDR Resolution Queue",
  },
  {
    step: "Section",
    cls: "font-display text-base font-bold",
    spec: "font-display · text-base · bold",
    text: "Failed backups requiring action",
  },
  {
    step: "Card title",
    cls: "text-sm font-bold text-card-foreground",
    spec: "text-sm · bold",
    text: "Force Diff Merge",
  },
  {
    step: "Body",
    cls: "text-sm text-card-foreground",
    spec: "text-sm · regular",
    text: "Re-authorize OAuth admin consent for jdoe@acme.onmicrosoft.com.",
  },
  {
    step: "Dense",
    cls: "text-xs text-muted-foreground",
    spec: "text-xs · muted",
    text: "Last offsite sync 2h ago · 412 GB queued · SIRIS-NYC-01",
  },
  {
    step: "Label / eyebrow",
    cls: "text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground",
    spec: "text-[10px] · bold · uppercase · tracking-[0.07em] · faint",
    text: "Recovery Launchpad",
  },
  {
    step: "Mono",
    cls: "font-mono text-sm text-card-foreground",
    spec: "font-mono · text-sm",
    text: "mothership.dtc.datto.com:3260 — error -255",
  },
];

function Typography() {
  return (
    <div className="flex flex-col gap-8 p-4">
      <section className="flex flex-col gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          Type families
        </h3>
        <div className="flex flex-col gap-4">
          {FAMILIES.map((f) => (
            <div
              key={f.label}
              className="rounded-lg border border-border bg-card px-4 py-3"
            >
              <p className="mb-2 text-xs text-muted-foreground">{f.label}</p>
              <p className={f.cls}>{f.specimen}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          Type scale
        </h3>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {SCALE.map((s) => (
            <div
              key={s.step}
              className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[160px_1fr]"
            >
              <div className="flex flex-col">
                <span className="text-sm font-bold text-card-foreground">
                  {s.step}
                </span>
                <span className="font-mono text-xs text-faint-foreground">
                  {s.spec}
                </span>
              </div>
              <p className={s.cls}>{s.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const meta: Meta = {
  title: "Foundations/Typography",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
};

export default meta;
type Story = StoryObj;

export const Scale: Story = {
  render: () => <Typography />,
};
