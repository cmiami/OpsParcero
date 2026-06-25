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
import { simulateRun } from "@/mock/runner";
import { useApprovals } from "@/stores/approvals";
import { useActivity } from "@/stores/activity";
import { usePolicies } from "@/stores/automation-policies";

const issues = getIssues();
// A `full` issue whose self-heal apply will NOT hit the approval gate — reversible,
// non-destructive, not always-approval, < 5 impacted — so ConfirmsFix applies
// deterministically (irreversible/destructive mutations now gate, P1-7).
const full =
  issues.find((i) => {
    if (i.fixType !== "full" || !i.failureModeId) return false;
    if (i.impactedAssetIds.length >= 5) return false;
    const a = getPrimaryAction(i.failureModeId);
    return Boolean(
      a &&
        a.outcome === "self-heal" &&
        a.reversible &&
        !a.destructive &&
        a.requiresApproval !== "always",
    );
  }) ??
  issues.find((i) => i.fixType === "full") ??
  issues[0];
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
// A full issue whose "always" apply WON'T hit the approval gate (< 5 impacted,
// non-destructive, reversible, not always-approval) — so confirming "always"
// creates a policy deterministically. (Irreversible mutations now gate — P1-7 —
// so `reversible` is required here, else this would enqueue an approval instead.)
const policyIssue =
  issues.find((i) => {
    if (i.fixType !== "full" || !i.failureModeId) return false;
    if (i.impactedAssetIds.length >= 5) return false;
    const a = getPrimaryAction(i.failureModeId);
    return Boolean(
      a && !a.destructive && a.reversible && a.requiresApproval !== "always",
    );
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
 * OneAlwaysControl — regression gate: there is exactly ONE "always" affordance
 * (the scope radio). The old redundant "Always fix this category" SWITCH is gone.
 */
export const OneAlwaysControl: Story = {
  args: { issue: full },
  play: async () => {
    const body = within(document.body);
    expect(body.queryByRole("switch")).not.toBeInTheDocument();
  },
};

/**
 * CreatesTypePolicy — "Always auto-fix" with the default breadth creates a
 * standing policy scoped to THIS failure mode (trigger.failureModeId set).
 */
export const CreatesTypePolicy: Story = {
  args: { issue: policyIssue },
  play: async () => {
    usePolicies.setState({ policies: [] });
    useActivity.setState({ runs: [], audit: [] });
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("radio", { name: /Always auto-fix/i }),
    );
    await userEvent.click(
      await body.findByRole("button", { name: /Create policy/i }),
    );
    await waitFor(() =>
      expect(usePolicies.getState().policies.length).toBe(1),
    );
    const trigger = usePolicies.getState().policies[0].trigger;
    expect(trigger.kind).toBe("failure-mode");
    if (trigger.kind === "failure-mode") {
      expect(trigger.failureModeId).toBe(policyIssue.failureModeId);
    }
    // Standing automation is created paused (opt-in), never auto-armed.
    expect(usePolicies.getState().policies[0].enabled).toBe(false);
    // Creating a standing policy is audited (P1-6) — never a silent one-click.
    expect(
      useActivity.getState().audit.some((a) => a.verb === "enabled-policy"),
    ).toBe(true);
  },
};

/**
 * CreatesCategoryPolicy — choosing the "Whole category" breadth creates a
 * category-wide policy (trigger.kind === "category", carrying the category — no
 * empty-string sentinel), preserving the capability the deleted switch had, now
 * as a sub-choice of the single "always" control.
 */
export const CreatesCategoryPolicy: Story = {
  args: { issue: policyIssue },
  play: async () => {
    usePolicies.setState({ policies: [] });
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("radio", { name: /Always auto-fix/i }),
    );
    await userEvent.click(
      await body.findByRole("radio", { name: /Whole .* category/i }),
    );
    await userEvent.click(
      await body.findByRole("button", { name: /Create policy/i }),
    );
    await waitFor(() =>
      expect(usePolicies.getState().policies.length).toBe(1),
    );
    const trigger = usePolicies.getState().policies[0].trigger;
    expect(trigger.kind).toBe("category");
    if (trigger.kind === "category") {
      expect(trigger.category).toBe(policyIssue.category);
    }
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
 * IrreversibleMutationGates — regression gate for P1-7: an irreversible OR
 * destructive self-heal MUTATION must always require approval, even when its
 * catalog entry says requiresApproval:'never' and only ONE asset is targeted
 * (so neither the over-threshold nor the always-approval branch would fire).
 * Asserts the invariant directly against the runner across the whole catalog.
 */
export const IrreversibleMutationGates: Story = {
  args: { issue: full },
  play: async () => {
    const modes = getFailureModes();
    let checked = 0;
    for (const mode of modes) {
      const action = getPrimaryAction(mode.id);
      if (!action || action.outcome !== "self-heal") continue;
      // Only the risky ones — a reversible, non-destructive heal should NOT gate.
      if (action.reversible && !action.destructive) continue;
      const out = simulateRun(
        action,
        [{ kind: "asset" as const, id: "AST-TEST-0001" }],
        "once",
      );
      expect(out.awaitingApproval).toBe(true);
      checked++;
    }
    // Prove the catalog actually contains irreversible/destructive self-heals.
    expect(checked).toBeGreaterThan(0);
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
