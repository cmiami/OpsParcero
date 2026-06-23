import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { IssueRow } from "./issue-row";
import { Toaster } from "@/components/ui/sonner";
import { getIssues } from "@/mock/query";

const issues = getIssues();
const full = issues.find((i) => i.fixType === "full") ?? issues[0];
const partial = issues.find((i) => i.fixType === "partial") ?? issues[0];
const insights =
  issues.find((i) => i.fixType === "manual" || i.fixType === "external") ??
  issues[0];
const critical = issues.find((i) => i.severity === "critical") ?? issues[0];

const meta = {
  title: "Organisms/IssueRow",
  component: IssueRow,
  tags: ["autodocs"],
  argTypes: {
    expanded: { control: "boolean" },
    onToggle: { table: { disable: true } },
    issue: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Story />
        <Toaster />
      </div>
    ),
  ],
} satisfies Meta<typeof IssueRow>;
export default meta;
type Story = StoryObj<typeof meta>;

/** EndToEnd — a `full` fix: green "End-to-end fix" classification + Fix button. */
export const EndToEnd: Story = {
  args: { issue: full },
};

/** Guided — a `partial` fix with both We and You steps when expanded. */
export const Guided: Story = {
  args: { issue: partial },
};

/** InsightsOnly — not auto-fixable: orange "Insights only" + Runbook action. */
export const InsightsOnly: Story = {
  args: { issue: insights },
};

/** Critical — a critical-severity issue. */
export const Critical: Story = {
  args: { issue: critical },
};

/** Expanded — pre-expanded to reveal the IssueDetailPanel. */
export const Expanded: Story = {
  args: { issue: full, expanded: true },
};

/** TogglesOpen — clicking the row expands the detail panel. */
export const TogglesOpen: Story = {
  args: { issue: full },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { expanded: false });
    await userEvent.click(toggle);
    await expect(
      canvas.getByRole("button", { expanded: true }),
    ).toBeInTheDocument();
  },
};
