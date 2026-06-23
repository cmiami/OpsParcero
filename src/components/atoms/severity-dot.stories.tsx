import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { SeverityDot } from "./severity-dot";
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
  title: "Atoms/SeverityDot",
  component: SeverityDot,
  tags: ["autodocs"],
  argTypes: {
    state: { control: "select", options: STATES },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof SeverityDot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Protected: Story = { args: { state: "protected" } };
export const Warning: Story = { args: { state: "warning" } };
export const Failed: Story = {
  args: { state: "failed" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: "Failed" })).toBeVisible();
  },
};
export const Paused: Story = { args: { state: "paused" } };
export const Syncing: Story = { args: { state: "syncing" } };
export const Offline: Story = { args: { state: "offline" } };

export const AllStates: Story = {
  args: { state: "protected" },
  render: () => (
    <div className="flex items-center gap-3">
      {STATES.map((s) => (
        <SeverityDot key={s} state={s} size="md" />
      ))}
    </div>
  ),
};
