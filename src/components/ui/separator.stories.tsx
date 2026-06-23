import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Separator } from "./separator";

const meta = {
  title: "Atoms/Separator",
  component: Separator,
  tags: ["autodocs"],
  argTypes: {
    orientation: { control: "inline-radio", options: ["horizontal", "vertical"] },
    decorative: { control: "boolean" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Separator>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  args: { orientation: "horizontal" },
  render: (args) => (
    <div className="w-64">
      <p className="text-sm font-bold">Recovery points</p>
      <Separator {...args} className="my-3" />
      <p className="text-sm text-muted-foreground">Last verified 2 hours ago</p>
    </div>
  ),
};

export const Vertical: Story = {
  args: { orientation: "vertical" },
  render: (args) => (
    <div className="flex h-6 items-center gap-3 text-sm">
      <span>SIRIS-NYC-01</span>
      <Separator {...args} />
      <span className="font-mono">8.0 TB</span>
      <Separator {...args} />
      <span className="font-mono">25 Mbps</span>
    </div>
  ),
};
