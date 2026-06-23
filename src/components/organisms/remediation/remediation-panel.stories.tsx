import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { RemediationPanel } from "./remediation-panel";
import { Toaster } from "@/components/ui/sonner";
import { useActionCart } from "@/stores/action-cart";
import { getIssues } from "@/mock/query";

const issues = getIssues();
const issue = issues[0];
const cosmetic = issues.find((i) => i.isCosmetic) ?? issues[1] ?? issue;
const insightsOnly =
  issues.find((i) => i.fixType === "manual" || i.fixType === "external") ?? issue;

const meta = {
  title: "Organisms/RemediationPanel",
  component: RemediationPanel,
  tags: ["autodocs"],
  argTypes: {
    matchCount: { control: { type: "number" } },
    asset: { table: { disable: true } },
    issue: { table: { disable: true } },
    failureMode: { table: { disable: true } },
    suggestedActions: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => {
      // Reset the action cart so "Save as playbook" stories don't leak.
      useActionCart.setState({ targets: [], steps: [], defaultScope: "once" });
      return (
        <div className="mx-auto max-w-[28rem]">
          <Story />
          <Toaster />
        </div>
      );
    },
  ],
} satisfies Meta<typeof RemediationPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Suggestion — the default landing state for the rail. */
export const Suggestion: Story = {
  args: { issue, matchCount: 14 },
};

/** ActionSelected — primary suggested fix surfaced with its risk metadata. */
export const ActionSelected: Story = {
  args: { issue, matchCount: 14 },
};

/** ScopeChosen — technician switched scope to "all matching". */
export const ScopeChosen: Story = {
  args: { issue, matchCount: 14 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const allMatching = canvas.getByRole("radio", {
      name: /Apply to all matching/i,
    });
    await userEvent.click(allMatching);
    await expect(allMatching).toBeChecked();
  },
};

/** Executing → Success — apply once runs the simulated runner and toasts. */
export const Success: Story = {
  args: { issue, matchCount: 14 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const apply = canvas.getByRole("button", { name: /Apply once/i });
    await userEvent.click(apply);
    await waitFor(
      () => expect(canvas.getByRole("status")).toBeInTheDocument(),
      { timeout: 3000 },
    );
  },
};

/** Insights-only issue — We/You runbook leans on manual "You" steps. */
export const InsightsOnly: Story = {
  args: { issue: insightsOnly, matchCount: 6 },
};

/** Cosmetic failure — known-limitation issue with low alarm. */
export const Cosmetic: Story = {
  args: { issue: cosmetic, matchCount: 1 },
};

/** SaveAsPlaybook — loads the chain into the action cart. */
export const SaveAsPlaybook: Story = {
  args: { issue, matchCount: 14 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole("button", { name: /Save as playbook/i });
    await userEvent.click(save);
    await expect(useActionCart.getState().steps.length).toBeGreaterThan(0);
  },
};
