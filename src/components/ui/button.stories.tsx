import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { Download } from "lucide-react";

import { Button } from "./button";

const meta = {
  title: "Atoms/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: { control: "select", options: ["default", "sm", "lg", "icon"] },
    disabled: { control: "boolean" },
    asChild: { control: false },
    children: { control: "text" },
  },
  args: { children: "Force offsite sync" },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: "default" } };
export const Destructive: Story = {
  args: { variant: "destructive", children: "Cancel recovery" },
};
export const Outline: Story = { args: { variant: "outline", children: "Run screenshot test" } };
export const Secondary: Story = { args: { variant: "secondary", children: "Add to action cart" } };
export const Ghost: Story = { args: { variant: "ghost", children: "Dismiss" } };
export const Link: Story = { args: { variant: "link", children: "View recovery points" } };

export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { size: "lg" } };
export const Icon: Story = {
  args: { size: "icon", "aria-label": "Download report", children: <Download /> },
};

export const Disabled: Story = { args: { disabled: true } };

export const FocusInteraction: Story = {
  args: { children: "Re-authorize OAuth" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Re-authorize OAuth" });
    await userEvent.tab();
    await expect(button).toHaveFocus();
  },
};
