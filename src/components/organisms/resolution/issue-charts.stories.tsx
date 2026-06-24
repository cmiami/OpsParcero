import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, waitFor } from "storybook/test";
import { IssueCharts } from "./issue-charts";
import { getFleetStats } from "@/mock/query";

const stats = getFleetStats();

const meta = {
  title: "Organisms/IssueCharts",
  component: IssueCharts,
  tags: ["autodocs"],
  argTypes: {
    stats: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
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
