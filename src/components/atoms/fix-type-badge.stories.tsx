import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { FixTypeBadge } from "./fix-type-badge";
import type { FixType } from "@/types";

const TYPES: FixType[] = ["full", "partial", "external", "manual", "unknown"];

const meta = {
  title: "Atoms/FixTypeBadge",
  component: FixTypeBadge,
  tags: ["autodocs"],
  argTypes: {
    type: { control: "select", options: TYPES },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof FixTypeBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EndToEnd: Story = {
  args: { type: "full" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("End-to-end fix")).toBeInTheDocument();
  },
};
export const Guided: Story = { args: { type: "partial" } };
export const InsightsExternal: Story = { args: { type: "external" } };
export const InsightsManual: Story = { args: { type: "manual" } };
export const Unknown: Story = { args: { type: "unknown" } };

export const AllTypes: Story = {
  args: { type: "full" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {TYPES.map((t) => (
        <FixTypeBadge key={t} type={t} />
      ))}
    </div>
  ),
};
