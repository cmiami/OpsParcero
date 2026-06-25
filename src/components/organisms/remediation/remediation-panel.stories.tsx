import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { RemediationPanel } from "./remediation-panel";
import { Toaster } from "@/components/ui/sonner";
import { useActionCart } from "@/stores/action-cart";
import { useActivity } from "@/stores/activity";
import { getIssues, getAsset } from "@/mock/query";

const issues = getIssues();
const issue = issues[0];
// A non-gated self-heal (records + heals) and a dry-run-capable action — both
// deterministic seed fixtures used to gate the dispatch routing (#7).
const healIssue =
  issues.find((i) => i.id === "ISS-destructive-uninstaller") ?? issue;
const healAsset = getAsset("AST-EP-0184");
const dryIssue =
  issues.find((i) => i.id === "ISS-storage-pool-full-backups-skipped") ?? issue;
const dryAsset = getAsset("AST-AGT-0047");
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
      // Reset the action cart so "Save as playbook" stories don't leak, and the
      // activity store so a recorded run / heal can't bleed between stories.
      useActionCart.setState({ targets: [], steps: [], defaultScope: "once" });
      useActivity.setState({
        runs: [],
        audit: [],
        assetOverrides: {},
        alertOverrides: {},
      });
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

/**
 * RealApplyRecordsViaCommand — regression gate for #7: a real "Apply once" flows
 * through the shared executeRemediation command — a durable run is recorded and
 * the targeted asset heals — rather than the panel's own bespoke dispatch.
 */
export const RealApplyRecordsViaCommand: Story = {
  args: { issue: healIssue, asset: healAsset, matchCount: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Apply once/i }));
    await waitFor(
      () => expect(useActivity.getState().runs.length).toBeGreaterThan(0),
      { timeout: 3000 },
    );
    // Healed through the command's heal channel (asset overlay written).
    expect(useActivity.getState().assetOverrides["AST-EP-0184"]).toBeDefined();
  },
};

/**
 * DryRunIsLocalOnly — the dry-run stays a LOCAL preview: it shows the rehearsal
 * banner but records nothing and heals nothing (it never reaches the command).
 */
export const DryRunIsLocalOnly: Story = {
  args: { issue: dryIssue, asset: dryAsset, matchCount: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Dry-run/i }));
    await waitFor(
      () => expect(canvas.getByText(/Dry-run preview/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(useActivity.getState().runs.length).toBe(0);
    expect(useActivity.getState().assetOverrides["AST-AGT-0047"]).toBeUndefined();
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
