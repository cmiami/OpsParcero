import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { StatusBadge } from "./status-badge";
import type { AssetStatus } from "@/types";

const STATES: AssetStatus[] = [
  "protected",
  "warning",
  "failed",
  "paused",
  "syncing",
  "offline",
];

const meta = {
  title: "Atoms/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
  argTypes: {
    state: { control: "select", options: STATES },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof StatusBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Protected: Story = { args: { state: "protected" } };
export const Warning: Story = { args: { state: "warning" } };
export const Failed: Story = {
  args: { state: "failed" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Failed")).toBeInTheDocument();
  },
};
export const Paused: Story = { args: { state: "paused" } };
export const Syncing: Story = { args: { state: "syncing" } };
export const Offline: Story = { args: { state: "offline" } };

export const AllStates: Story = {
  args: { state: "protected" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {STATES.map((s) => (
        <StatusBadge key={s} state={s} />
      ))}
    </div>
  ),
};

export const Small: Story = {
  args: { state: "warning", size: "sm" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {STATES.map((s) => (
        <StatusBadge key={s} state={s} size="sm" />
      ))}
    </div>
  ),
};
