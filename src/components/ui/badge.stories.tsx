import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Badge } from "./badge";

const meta = {
  title: "Atoms/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline"],
    },
    children: { control: "text" },
  },
  args: { children: "Protected" },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: "default", children: "End-to-end fix" } };
export const Secondary: Story = { args: { variant: "secondary", children: "Guided fix" } };
export const Destructive: Story = { args: { variant: "destructive", children: "Backup failed" } };
export const Outline: Story = { args: { variant: "outline", children: "SIRIS-NYC-01" } };
