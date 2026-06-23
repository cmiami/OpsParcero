import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { FleetRollup } from "./fleet-rollup";

const meta = {
  title: "Organisms/FleetRollup",
  component: FleetRollup,
  tags: ["autodocs"],
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    stats: { control: false },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof FleetRollup>;
export default meta;
type Story = StoryObj<typeof meta>;

// A mostly-healthy fleet with a couple of warnings.
export const Healthy: Story = {
  args: {
    stats: { protected: 184, warning: 6, syncing: 3 },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Worst-real-child rollup = Warning here (text label proves not color-only).
    const breakdown = canvas.getByLabelText("Fleet status breakdown");
    await expect(within(breakdown).getByText("Protected")).toBeInTheDocument();
  },
};

// A degraded fleet: real failures present alongside healthy assets.
export const Degraded: Story = {
  args: {
    stats: { protected: 142, warning: 31, failed: 12, offline: 5, paused: 4, syncing: 6 },
  },
};

// Worst case: every present state is failed.
export const AllFailed: Story = {
  args: {
    stats: { failed: 38 },
  },
};

// Default — derived from the seeded fleet snapshot (no stats prop).
export const FromSeededFleet: Story = {
  args: {},
};
