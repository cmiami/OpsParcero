import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { IssueDetailPanel } from "./issue-detail-panel";
import { Toaster } from "@/components/ui/sonner";
import { getIssues } from "@/mock/query";

const issues = getIssues();
const full = issues.find((i) => i.fixType === "full") ?? issues[0];
const partial = issues.find((i) => i.fixType === "partial") ?? issues[0];
const insights =
  issues.find((i) => i.fixType === "manual" || i.fixType === "external") ??
  issues[0];

const meta = {
  title: "Organisms/IssueDetailPanel",
  component: IssueDetailPanel,
  tags: ["autodocs"],
  argTypes: {
    issue: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
        <Story />
        <Toaster />
      </div>
    ),
  ],
} satisfies Meta<typeof IssueDetailPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** EndToEnd — `full` fix: We-only runbook and an "End-to-end fix all" CTA. */
export const EndToEnd: Story = {
  args: { issue: full },
};

/** Guided — `partial` fix: We + You runbook split and a "Run guided fix" CTA. */
export const Guided: Story = {
  args: { issue: partial },
};

/** InsightsOnly — diagnostic-only: You-leaning runbook and a "View runbook" CTA. */
export const InsightsOnly: Story = {
  args: { issue: insights },
};
