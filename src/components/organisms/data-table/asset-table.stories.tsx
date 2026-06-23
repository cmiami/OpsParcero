import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { AssetTable } from "./asset-table";
import { getAssets } from "@/mock/query";

// Seeded slices of the real fleet (mock query is pure/deterministic).
const ALL = getAssets({}).items;
const FAILED = getAssets({ statuses: ["failed"] }).items;
const MIXED = ALL.slice(0, 8);

const meta = {
  title: "Organisms/AssetTable",
  component: AssetTable,
  tags: ["autodocs"],
  argTypes: {
    density: { control: "inline-radio", options: ["default", "compact"] },
    assets: { control: false },
    onOpenAsset: { control: false },
    onBulk: { control: false },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AssetTable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { assets: ALL },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Select page 1 → bulk toolbar appears with a count.
    const selectAll = canvas.getByLabelText("Select all rows on this page");
    await userEvent.click(selectAll);
    const toolbar = await canvas.findByRole("toolbar", { name: "bulk actions" });
    await expect(toolbar).toBeInTheDocument();
    await expect(within(toolbar).getByText("Run playbook")).toBeInTheDocument();
    // Sort by "Last good".
    await userEvent.click(canvas.getByRole("button", { name: /Last good/ }));
  },
};

export const AllFailed: Story = {
  args: { assets: FAILED.length > 0 ? FAILED : ALL.filter((a) => a.status === "failed") },
};

export const MixedFleet: Story = {
  args: { assets: MIXED },
};

export const Empty: Story = {
  args: { assets: [] },
};

export const Loading: Story = {
  args: { assets: [], isLoading: true },
};
