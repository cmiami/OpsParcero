import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Skeleton } from "./skeleton";

const meta = {
  title: "Atoms/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  argTypes: {
    className: { control: "text" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { className: "h-4 w-48" } };

export const AssetRow: Story = {
  render: () => (
    <div className="flex w-72 items-center gap-3">
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="grid flex-1 gap-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  ),
};

export const CardBlock: Story = {
  render: () => (
    <div className="grid w-64 gap-2 rounded-lg border border-border p-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  ),
};
