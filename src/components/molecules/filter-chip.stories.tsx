import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, fn } from "storybook/test";
import { FilterChip } from "./filter-chip";

const meta = {
  title: "Molecules/FilterChip",
  component: FilterChip,
  tags: ["autodocs"],
  argTypes: {
    label: { control: "text" },
    value: { control: "text" },
    active: { control: "boolean" },
    onRemove: { control: false },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof FilterChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = {
  args: { label: "Product", value: "Datto BCDR" },
};

export const Dismissible: Story = {
  args: { label: "Status", value: "Failed", onRemove: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const remove = canvas.getByRole("button", {
      name: "Remove filter: Status",
    });
    await userEvent.click(remove);
    await expect(args.onRemove).toHaveBeenCalledOnce();
  },
};

export const Active: Story = {
  args: { label: "Site", value: "Norwalk FIPS", active: true, onRemove: fn() },
};

export const Row: Story = {
  args: { label: "Status", value: "Failed" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip label="Status" value="Failed" active onRemove={fn()} />
      <FilterChip label="Product" value="Datto BCDR" onRemove={fn()} />
      <FilterChip label="Site" value="Norwalk FIPS" onRemove={fn()} />
      <FilterChip label="Fix" value="End-to-end" />
    </div>
  ),
};
