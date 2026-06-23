import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";

import { Input } from "./input";

const meta = {
  title: "Atoms/Input",
  component: Input,
  tags: ["autodocs"],
  argTypes: {
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "search"],
    },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
  },
  args: { placeholder: "Search assets…", "aria-label": "Search assets" },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Email: Story = {
  args: { type: "email", placeholder: "jdoe@acme.onmicrosoft.com", "aria-label": "Email" },
};
export const Search: Story = {
  args: { type: "search", placeholder: "Filter by hostname…", "aria-label": "Filter by hostname" },
};
export const Disabled: Story = { args: { disabled: true, value: "SIRIS-NYC-01" } };

export const TypeInteraction: Story = {
  args: { placeholder: "Hostname", "aria-label": "Hostname" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Hostname" });
    await userEvent.type(input, "btru-fs1");
    await expect(input).toHaveValue("btru-fs1");
  },
};
