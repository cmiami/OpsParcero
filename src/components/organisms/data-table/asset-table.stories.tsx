import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, userEvent, waitFor } from "storybook/test";
import { AssetTable } from "./asset-table";
import { getAssets } from "@/mock/query";
import { useActivity } from "@/stores/activity";

// Seeded slices of the real fleet (mock query is pure/deterministic).
const ALL = getAssets({}).items;
const FAILED = getAssets({ statuses: ["failed"] }).items;
const MIXED = ALL.slice(0, 8);
const ONE_FAILED = ALL.filter((a) => a.status === "failed").slice(0, 1);
// An asset whose identifier === displayName (agent-style), so the asset-name
// button is queryable by its visible text.
const NAMED =
  ALL.find(
    (a) =>
      a.kind !== "saas-seat" &&
      a.kind !== "salesforce-org" &&
      a.kind !== "share",
  ) ?? ALL[0];

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

/**
 * OpensFromAssetName — regression gate for P3-4: the asset name is a real,
 * keyboard-focusable activator (not an inert label), so clicking/Enter opens the
 * detail via onOpenAsset. (axe also gates against nested-interactive here.)
 */
export const OpensFromAssetName: Story = {
  args: { assets: [NAMED], onOpenAsset: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole("button", { name: NAMED.displayName });
    await userEvent.click(btn);
    await waitFor(() =>
      expect(args.onOpenAsset).toHaveBeenCalledWith(NAMED),
    );
  },
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

/**
 * ReflectsHeal — regression gate for #9: a fix applied this session (an
 * assetOverride) must show in the fleet TABLE, not only on the asset-detail page.
 * Seeds an override healing the one failed asset → its row reads Protected.
 */
export const ReflectsHeal: Story = {
  args: { assets: ONE_FAILED },
  decorators: [
    (Story) => {
      const a = ONE_FAILED[0];
      useActivity.setState({
        runs: [],
        audit: [],
        assetOverrides: a
          ? { [a.id]: { status: "protected", resolvedAt: "2026-06-24T00:00:00Z" } }
          : {},
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(/^protected$/i)).toBeInTheDocument(),
    );
    expect(canvas.queryByText(/^failed$/i)).not.toBeInTheDocument();
  },
};
