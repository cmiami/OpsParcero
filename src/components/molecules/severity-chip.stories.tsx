import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { SeverityChip } from "./severity-chip";
import type { AssetStatus } from "@/types";

const STATES: AssetStatus[] = [
  "failed",
  "warning",
  "offline",
  "syncing",
  "paused",
  "protected",
];

const meta = {
  title: "Molecules/SeverityChip",
  component: SeverityChip,
  tags: ["autodocs"],
  argTypes: {
    state: { control: "select", options: STATES },
    count: { control: { type: "number", min: 0 } },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof SeverityChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Failed: Story = {
  args: { state: "failed", count: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Failed: 3")).toBeInTheDocument();
  },
};
export const Warning: Story = { args: { state: "warning", count: 7 } };
export const Offline: Story = { args: { state: "offline", count: 1 } };
export const Syncing: Story = { args: { state: "syncing", count: 2 } };
export const Paused: Story = { args: { state: "paused", count: 4 } };
export const Protected: Story = { args: { state: "protected", count: 128 } };

export const AllStates: Story = {
  args: { state: "failed", count: 3 },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {STATES.map((s, i) => (
        <SeverityChip key={s} state={s} count={(i + 1) * 2} />
      ))}
    </div>
  ),
};
