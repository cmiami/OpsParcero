import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Label } from "./label";
import { Input } from "./input";

const meta = {
  title: "Atoms/Label",
  component: Label,
  tags: ["autodocs"],
  argTypes: {
    children: { control: "text" },
    htmlFor: { control: "text" },
  },
  args: { children: "Hostname" },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Label>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInput: Story = {
  args: { htmlFor: "host", children: "Target hostname" },
  render: (args) => (
    <div className="grid w-64 gap-1.5">
      <Label {...args} />
      <Input id="host" placeholder="btru-fs1" />
    </div>
  ),
};
