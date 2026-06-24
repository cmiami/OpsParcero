import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { SummaryCardsRow } from "./summary-cards-row";
import { getFleetStats } from "@/mock/query";

const stats = getFleetStats();

const meta = {
  title: "Organisms/SummaryCardsRow",
  component: SummaryCardsRow,
  tags: ["autodocs"],
  argTypes: {
    stats: { table: { disable: true } },
    onSelectTopProblem: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
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
