import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Star } from "lucide-react";

import { Toggle } from "./toggle";

const meta = {
  title: "Atoms/Toggle",
  component: Toggle,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "outline"] },
    size: { control: "select", options: ["sm", "default", "lg"] },
    pressed: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Toggle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: "Auto-remediate" },
};

export const WithIcon: Story = {
  render: () => (
    <Toggle aria-label="Pin saved view">
      <Star aria-hidden />
      Pin view
    </Toggle>
  ),
};

export const Outline: Story = {
  args: { variant: "outline", children: "Only failures" },
};

export const Pressed: Story = {
  args: { pressed: true, children: "Apply always" },
};
