import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { KpiTile } from "./kpi-tile";

const meta = {
  title: "Molecules/KpiTile",
  component: KpiTile,
  tags: ["autodocs"],
  argTypes: {
    label: { control: "text" },
    value: { control: "text" },
    delta: { control: "text" },
    deltaDir: { control: "inline-radio", options: ["up", "down"] },
    sublabel: { control: "text" },
    loading: { control: "boolean" },
    trend: { control: false },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof KpiTile>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Flat: Story = {
  args: {
    label: "Protected assets",
    value: 1284,
    sublabel: "across 42 sites",
  },
  render: (args) => (
    <div className="w-56">
      <KpiTile {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Protected assets")).toBeInTheDocument();
  },
};

export const PositiveDelta: Story = {
  args: {
    label: "Backup success rate",
    value: "98.4%",
    delta: "2.1%",
    deltaDir: "up",
    sublabel: "vs. last 7 days",
  },
  render: (args) => (
    <div className="w-56">
      <KpiTile {...args} />
    </div>
  ),
};

export const NegativeDelta: Story = {
  args: {
    label: "Failed jobs",
    value: 17,
    delta: "5",
    deltaDir: "down",
    sublabel: "vs. last 7 days",
  },
  render: (args) => (
    <div className="w-56">
      <KpiTile {...args} />
    </div>
  ),
};

export const WithSparkline: Story = {
  args: {
    label: "Offsite sync backlog",
    value: "1.2 TB",
    delta: "18%",
    deltaDir: "down",
    sublabel: "last 24h",
    trend: [42, 48, 39, 51, 44, 33, 28, 21, 18, 12],
  },
  render: (args) => (
    <div className="w-64">
      <KpiTile {...args} />
    </div>
  ),
};

export const Loading: Story = {
  args: { label: "Loading", value: "—", loading: true },
  render: (args) => (
    <div className="w-56">
      <KpiTile {...args} />
    </div>
  ),
};
