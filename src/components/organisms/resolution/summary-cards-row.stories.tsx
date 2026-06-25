import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SummaryCardsRow } from "./summary-cards-row";
import { getFleetStats, getIssues } from "@/mock/query";
import { useActivity } from "@/stores/activity";

const stats = getFleetStats();

/** The same worst-first ordering the component uses to pick the headline issue. */
function currentTopProblem() {
  return [...getIssues()].sort((a, b) => {
    const sev =
      (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1);
    if (sev !== 0) return sev;
    return b.occurrenceCount - a.occurrenceCount;
  })[0];
}

const meta = {
  title: "Organisms/SummaryCardsRow",
  component: SummaryCardsRow,
  tags: ["autodocs"],
  argTypes: {
    stats: { table: { disable: true } },
    onSelectTopProblem: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    // The top-problem overlay reads useActivity; reset it so leaked heal state
    // from another story (the browser shares one page) can't change the headline.
    // Heal-dependent stories set their own overrides in an inner story decorator,
    // which runs AFTER this reset.
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
} satisfies Meta<typeof SummaryCardsRow>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default — the non-uniform summary tile row (top problem spans two columns). */
export const Default: Story = {
  args: { stats, onSelectTopProblem: fn() },
  // Interactive: the top-problem tile drills into the issue → onSelectTopProblem.
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /Top problem of the day/i }),
    );
    await expect(args.onSelectTopProblem).toHaveBeenCalled();
  },
};

/**
 * TopProblemReflectsHeal — regression gate for #9: the "top problem of the day"
 * is overlay-aware. Healing every asset of the current worst issue this session
 * drops it from the headline (the card moves to the next-worst), instead of
 * headlining an already-fixed issue.
 */
export const TopProblemReflectsHeal: Story = {
  args: { onSelectTopProblem: fn() },
  decorators: [
    (Story) => {
      const top = currentTopProblem();
      const assetOverrides = Object.fromEntries(
        top.impactedAssetIds.map((id) => [
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
    const healedTitle = currentTopProblem().title;
    // The fully-healed worst issue no longer headlines the card.
    await waitFor(() =>
      expect(canvas.queryByText(healedTitle)).not.toBeInTheDocument(),
    );
  },
};

/** CleanFleet — no open issues; the top-problem card reads "No open issues". */
export const CleanFleet: Story = {
  args: {
    stats: {
      ...stats,
      openIssues: 0,
      criticalIssues: 0,
      endToEndFixable: 0,
      guidedFixable: 0,
      insightsOnly: 0,
      failedAssets: 0,
      openAlerts: 0,
    },
    onSelectTopProblem: fn(),
  },
};
