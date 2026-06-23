import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { ProductChip } from "./product-chip";
import type { ProductBucket } from "@/types";

const BUCKETS: ProductBucket[] = ["saas", "bcdr", "endpoint"];

const meta = {
  title: "Atoms/ProductChip",
  component: ProductChip,
  tags: ["autodocs"],
  argTypes: {
    bucket: { control: "select", options: BUCKETS },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof ProductChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Saas: Story = { args: { bucket: "saas" } };
export const Bcdr: Story = {
  args: { bucket: "bcdr" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Datto BCDR")).toBeInTheDocument();
  },
};
export const Endpoint: Story = { args: { bucket: "endpoint" } };

export const AllBuckets: Story = {
  args: { bucket: "saas" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {BUCKETS.map((b) => (
        <ProductChip key={b} bucket={b} />
      ))}
    </div>
  ),
};
