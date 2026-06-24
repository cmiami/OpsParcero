import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
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

/**
 * RunGuidedFixOpensPanel — regression gate: for a `partial` issue, "Run guided
 * fix" must open the real streaming GuidedFixPanel (not the lightweight FixModal).
 * Proven by the panel's own "Start guided fix" run button appearing in the dialog.
 */
export const RunGuidedFixOpensPanel: Story = {
  args: { issue: partial },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /Run guided fix/i }),
    );
    const body = within(document.body);
    await waitFor(() => expect(body.getByRole("dialog")).toBeInTheDocument());
    // GuidedFixPanel renders a "Start guided fix" run button; FixModal does not.
    await expect(
      body.getByRole("button", { name: /Start guided (fix|dry run)/i }),
    ).toBeInTheDocument();
  },
};

/**
 * AskAiOpensConsole — regression gate: "Ask AI" must open the real AiFixConsole
 * dialog (it previously had no onClick).
 */
export const AskAiOpensConsole: Story = {
  args: { issue: partial },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ask = canvas.getByRole("button", { name: /Ask AI about this issue/i });
    await expect(ask).toBeEnabled();
    await userEvent.click(ask);
    const body = within(document.body);
    await waitFor(() => expect(body.getByRole("dialog")).toBeInTheDocument());
    await expect(body.getByRole("dialog")).toHaveTextContent(/Fix with AI/i);
  },
};
