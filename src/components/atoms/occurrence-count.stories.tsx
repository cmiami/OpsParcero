import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, userEvent } from "storybook/test";
import { OccurrenceCount } from "./occurrence-count";

const meta = {
  title: "Atoms/OccurrenceCount",
  component: OccurrenceCount,
  tags: ["autodocs"],
  argTypes: {
    count: { control: { type: "number", min: 0 } },
    onClick: { action: "open-impacted" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof OccurrenceCount>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = { args: { count: 14 } };

export const Clickable: Story = {
  args: { count: 14, onClick: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole("button", {
      name: "14 impacted assets — view list",
    });
    await userEvent.click(btn);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const Single: Story = { args: { count: 1, onClick: fn() } };

export const Large: Story = { args: { count: 248, onClick: fn() } };
