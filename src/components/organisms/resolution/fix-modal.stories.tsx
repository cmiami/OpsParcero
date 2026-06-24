import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor, fn } from "storybook/test";
import { FixModal } from "./fix-modal";
import { Toaster } from "@/components/ui/sonner";
import {
  getIssues,
  getFailureModes,
  getActionsForFailureMode,
  getPrimaryAction,
} from "@/mock/query";
import { useApprovals } from "@/stores/approvals";
import { useActivity } from "@/stores/activity";

const issues = getIssues();
const full = issues.find((i) => i.fixType === "full") ?? issues[0];
const partial = issues.find((i) => i.fixType === "partial") ?? issues[0];
const insights =
  issues.find((i) => i.fixType === "manual" || i.fixType === "external") ??
  issues[0];
// An issue whose primary (self-heal) action is gated — destructive or
// always-approval — so confirming it must enqueue an approval, not heal.
const approvalIssue =
  issues.find((i) => {
    const a = i.failureModeId ? getPrimaryAction(i.failureModeId) : undefined;
    return a && (a.destructive || a.requiresApproval === "always");
  }) ?? full;

const meta = {
  title: "Organisms/FixModal",
  component: FixModal,
  tags: ["autodocs"],
  args: { open: true, onOpenChange: fn() },
  argTypes: {
    open: { control: "boolean" },
    onOpenChange: { table: { disable: true } },
    issue: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
} satisfies Meta<typeof FixModal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** EndToEnd — `full` fix with the once → all → always scope control. */
export const EndToEnd: Story = {
  args: { issue: full },
};

/** Guided — `partial` fix; the apply runs the automatable steps. */
export const Guided: Story = {
  args: { issue: partial },
};

/** InsightsOnly — no automatable action; degrades to a runbook hand-off. */
export const InsightsOnly: Story = {
  args: { issue: insights },
};

/** ConfirmsFix — confirming dispatches the simulated runner and toasts. */
export const ConfirmsFix: Story = {
  args: { issue: full },
  play: async () => {
    const body = within(document.body);
    const confirm = await body.findByRole("button", { name: /Confirm fix/i });
    await userEvent.click(confirm);
    await waitFor(
      async () =>
        expect(await body.findByText(/Fix applied|Fix dispatched|policy/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
  },
};

/**
 * EnqueuesApproval — regression gate for the approval-bypass bug: confirming a
 * destructive/always-approval fix must enqueue a resumable ApprovalRequest (so it
 * reaches Automation → Approvals) and must NOT heal or record a run. Previously
 * FixModal force-passed { approved:true } and the gate was unreachable.
 */
export const EnqueuesApproval: Story = {
  args: { issue: approvalIssue },
  play: async () => {
    useApprovals.setState({ requests: [] });
    useActivity.setState({ runs: [], audit: [] });
    const body = within(document.body);
    const confirm = await body.findByRole("button", {
      name: /Confirm fix|Create policy/i,
    });
    await userEvent.click(confirm);
    await waitFor(
      () => expect(useApprovals.getState().requests.length).toBeGreaterThan(0),
      { timeout: 3000 },
    );
    expect(useApprovals.getState().requests[0].state).toBe("pending");
    // A gated dispatch records NO run (nothing applied yet).
    expect(useActivity.getState().runs.length).toBe(0);
    await expect(body.findByText(/Approval required/i)).resolves.toBeDefined();
  },
};

/**
 * PrimaryActionPrefersSelfHeal — regression gate for the dispatch-selection bug:
 * "Apply fix" must dispatch the self-heal action, NOT the first catalog entry
 * (often a guidance-only probe). Asserts the invariant across the whole catalog:
 * whenever a mode owns a self-heal action, getPrimaryAction returns a self-heal.
 */
export const PrimaryActionPrefersSelfHeal: Story = {
  args: { issue: full },
  play: async () => {
    const modes = getFailureModes();
    let checkedSelfHeal = 0;
    let guidanceFirstButHealable = 0;
    for (const mode of modes) {
      const actions = getActionsForFailureMode(mode.id);
      if (actions.length === 0) continue;
      const hasSelfHeal = actions.some((a) => a.outcome === "self-heal");
      const primary = getPrimaryAction(mode.id);
      expect(primary).toBeDefined();
      if (hasSelfHeal) {
        // The chosen action must be a self-heal whenever one exists.
        expect(primary!.outcome).toBe("self-heal");
        checkedSelfHeal++;
        if (actions[0].outcome !== "self-heal") guidanceFirstButHealable++;
      } else {
        // Guidance/insights-only mode → falls back to the first action.
        expect(primary).toBe(actions[0]);
      }
    }
    // The bug only matters because many modes list a probe first — prove the
    // fixture actually exercises that case (the ~33 modes from the audit).
    expect(checkedSelfHeal).toBeGreaterThan(0);
    expect(guidanceFirstButHealable).toBeGreaterThan(0);
  },
};
