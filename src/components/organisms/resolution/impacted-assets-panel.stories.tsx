import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, fn } from "storybook/test";
import { ImpactedAssetsPanel } from "./impacted-assets-panel";
import { getIssues } from "@/mock/query";

const issues = getIssues();
const wide = [...issues].sort(
  (a, b) => b.impactedAssetIds.length - a.impactedAssetIds.length,
)[0];
const single =
  issues.find((i) => i.impactedAssetIds.length === 1) ?? issues[0];

const meta = {
  title: "Organisms/ImpactedAssetsPanel",
  component: ImpactedAssetsPanel,
  tags: ["autodocs"],
  args: { open: true, onOpenChange: fn() },
  argTypes: {
    open: { control: "boolean" },
    onOpenChange: { table: { disable: true } },
    issue: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ImpactedAssetsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** ManyAssets — the issue with the widest blast radius, grouped by kind. */
export const ManyAssets: Story = {
  args: { issue: wide },
};

/** SingleAsset — an issue impacting a single asset. */
export const SingleAsset: Story = {
  args: { issue: single },
};

/** ShowsBlastRadius — the panel announces occurrence + unique-asset counts. */
export const ShowsBlastRadius: Story = {
  args: { issue: wide },
  play: async () => {
    const body = within(document.body);
    const panel = await body.findByRole("dialog");
    await expect(panel).toBeInTheDocument();
  },
};
