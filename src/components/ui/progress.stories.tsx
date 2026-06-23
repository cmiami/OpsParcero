import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Progress } from "./progress";

const meta = {
  title: "Atoms/Progress",
  component: Progress,
  tags: ["autodocs"],
  argTypes: {
    value: { control: { type: "range", min: 0, max: 100, step: 1 } },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Progress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: 62 },
  render: (args) => (
    <div className="w-72 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Offsite sync</span>
        <span className="font-mono">{args.value}%</span>
      </div>
      <Progress {...args} />
    </div>
  ),
};

export const Empty: Story = { args: { value: 0 }, render: (a) => <div className="w-72"><Progress {...a} /></div> };
export const Complete: Story = { args: { value: 100 }, render: (a) => <div className="w-72"><Progress {...a} /></div> };
