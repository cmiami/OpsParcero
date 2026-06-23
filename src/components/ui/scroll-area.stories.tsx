import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ScrollArea } from "./scroll-area";

const meta = {
  title: "Atoms/ScrollArea",
  component: ScrollArea,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof ScrollArea>;
export default meta;
type Story = StoryObj<typeof meta>;

const recoveryPoints = [
  "2026-06-22T03:00:00Z",
  "2026-06-22T02:00:00Z",
  "2026-06-22T01:00:00Z",
  "2026-06-22T00:00:00Z",
  "2026-06-21T23:00:00Z",
  "2026-06-21T22:00:00Z",
  "2026-06-21T21:00:00Z",
  "2026-06-21T20:00:00Z",
  "2026-06-21T19:00:00Z",
  "2026-06-21T18:00:00Z",
  "2026-06-21T17:00:00Z",
  "2026-06-21T16:00:00Z",
];

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-56 w-72 rounded-lg border border-border bg-card">
      <div className="p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          Recovery points · SIRIS-NYC-01
        </p>
        <ul className="flex flex-col">
          {recoveryPoints.map((rp) => (
            <li
              key={rp}
              className="border-b border-border py-2 font-mono text-xs last:border-b-0"
            >
              {rp}
            </li>
          ))}
        </ul>
      </div>
    </ScrollArea>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-72 whitespace-nowrap rounded-lg border border-border bg-card">
      <div className="flex gap-3 p-3">
        {["btru-fs1", "btru-erp1", "btru-hv2022", "btru-dr-ubt", "NOR-FIPS-APP", "ACME-DC01"].map(
          (host) => (
            <div
              key={host}
              className="shrink-0 rounded-md border border-border bg-subtle px-3 py-2 font-mono text-xs"
            >
              {host}
            </div>
          ),
        )}
      </div>
    </ScrollArea>
  ),
};
