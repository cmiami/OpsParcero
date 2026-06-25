import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, waitFor } from "storybook/test";
import { IssueCharts } from "./issue-charts";
import { getFleetStats, getIssues } from "@/mock/query";
import { useActivity } from "@/stores/activity";

const stats = getFleetStats();

const meta = {
  title: "Organisms/IssueCharts",
  component: IssueCharts,
  tags: ["autodocs"],
  argTypes: {
    stats: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    // The category overlay reads useActivity; reset it so leaked heal state from
    // another story can't empty the chart. CategoryReflectsHeal sets its own
    // overrides in an inner story decorator, which runs AFTER this reset.
    (Story) => {
      useActivity.setState({
        runs: [],
        audit: [],
        assetOverrides: {},
        alertOverrides: {},
      });
      return <Story />;
    },
  ],
} satisfies Meta<typeof IssueCharts>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default — trend, by-product donut, by-category bar, fix-classification donut. */
export const Default: Story = {
  args: { stats },
  // The charts are gated behind a mount effect (SSR-safe Recharts). The play
  // asserts they actually render after mount, not just the pre-mount shell.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("By category")).toBeInTheDocument(),
    );
    await expect(canvas.getByText("Fix classification")).toBeInTheDocument();
  },
};

/**
 * CategoryReflectsHeal — regression gate for #9: the by-category breakdown is
 * overlay-aware. Healing every impacted asset this session empties the category
 * series ("Top 0 categories"), instead of charting already-fixed issues.
 */
export const CategoryReflectsHeal: Story = {
  args: { stats },
  decorators: [
    (Story) => {
      const allAssetIds = [
        ...new Set(getIssues().flatMap((i) => i.impactedAssetIds)),
      ];
      const assetOverrides = Object.fromEntries(
        allAssetIds.map((id) => [
          id,
          { status: "protected" as const, resolvedAt: "t" },
        ]),
      );
      useActivity.setState({
        runs: [],
        audit: [],
        assetOverrides,
        alertOverrides: {},
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(/Top 0 categories/i)).toBeInTheDocument(),
    );
  },
};

/** SkewedToInsights — most issues are insights-only (orange-heavy donut). */
export const SkewedToInsights: Story = {
  args: {
    stats: {
      ...stats,
      endToEndFixable: 2,
      guidedFixable: 4,
      insightsOnly: 18,
    },
  },
};
