import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { ApprovalQueue } from "./approval-queue";
import { useApprovals } from "@/stores/approvals";
import { useActivity } from "@/stores/activity";
import { usePolicies } from "@/stores/automation-policies";
import {
  getPendingApprovals,
  getApprovals,
  getIssues,
  getPrimaryAction,
  getAsset,
} from "@/mock/query";
import { makeUid } from "@/stores/uid";
import { keepValid, approvalRequestSchema } from "@/lib/schemas";
import type { ApprovalRequest, ApprovalRequestId } from "@/types";

const pending = getPendingApprovals();
const all = getApprovals();

// A self-heal action + a real impacted asset that has open alerts, used to
// enqueue a RESUMABLE approval whose decision must actually run/heal/resolve
// alerts (approve) or audit (reject).
const healIssue = getIssues().find((i) => {
  const a = i.failureModeId ? getPrimaryAction(i.failureModeId) : undefined;
  if (a?.outcome !== "self-heal") return false;
  return i.impactedAssetIds.some(
    (id) => (getAsset(id)?.openAlertIds.length ?? 0) > 0,
  );
});
const healAction =
  healIssue?.failureModeId ? getPrimaryAction(healIssue.failureModeId) : undefined;
const healAssetId =
  healIssue?.impactedAssetIds.find(
    (id) => (getAsset(id)?.openAlertIds.length ?? 0) > 0,
  ) ??
  healIssue?.impactedAssetIds[0] ??
  "AST-TEST-0001";

function resumableRequest(): ApprovalRequest {
  return {
    id: makeUid("apr") as ApprovalRequestId,
    requestedFor: { kind: "action-run", refId: healAction?.id ?? "noop" },
    requestedBy: "u-current",
    reason: "over-threshold",
    blastRadius: { assetCount: 1, preview: healAction?.label ?? "Fix" },
    payload: {
      kind: "action",
      actionId: healAction?.id ?? "noop",
      targetRefs: [{ kind: "asset", id: healAssetId }],
      scope: "once",
      params: {},
    },
    state: "pending",
  };
}

/**
 * A resumable request whose held dispatch is an "always"-scoped apply that gated
 * BEFORE it could arm its standing rule — the payload therefore carries the
 * policy spec, and approving must create the policy too (#6).
 */
function policyResumableRequest(): ApprovalRequest {
  return {
    ...resumableRequest(),
    payload: {
      kind: "action",
      actionId: healAction?.id ?? "noop",
      targetRefs: [{ kind: "asset", id: healAssetId }],
      scope: "always",
      params: {},
      policy: {
        failureModeId: healIssue?.failureModeId,
        category: healIssue?.category ?? "Backup failure",
        actionId: healAction?.id ?? "noop",
        productBucket: healIssue?.productBucket,
      },
    },
    reason: "destructive",
  };
}

const mixed: ApprovalRequest[] = [
  ...pending.slice(0, 1),
  ...all.filter((r) => r.state !== "pending").slice(0, 2),
];

const meta = {
  title: "Organisms/ApprovalQueue",
  component: ApprovalQueue,
  tags: ["autodocs"],
  argTypes: {
    canApprove: { control: "boolean" },
    requests: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => {
      // Reset the approvals store so play-driven decisions don't leak.
      useApprovals.setState({ requests: [] });
      return (
        <div className="p-6">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ApprovalQueue>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Pending — store-backed pending queue (seeds on mount). */
export const Pending: Story = {
  args: { canApprove: true },
};

/** MixedStatuses — controlled list with pending + decided cards. */
export const MixedStatuses: Story = {
  args: { requests: mixed, canApprove: true },
};

/** Empty — nothing waiting. */
export const Empty: Story = {
  args: { requests: [], canApprove: true },
};

/** ApproveFlow — store-backed; approving flips the card state to Approved. */
export const ApproveFlow: Story = {
  decorators: [
    (Story) => {
      useApprovals.setState({ requests: getPendingApprovals().slice(0, 1) });
      return (
        <div className="p-6">
          <Story />
        </div>
      );
    },
  ],
  args: { canApprove: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approve = await canvas.findByRole("button", { name: "Approve" });
    await userEvent.click(approve);
    await waitFor(() =>
      expect(useApprovals.getState().requests[0].state).toBe("approved"),
    );
  },
};

/**
 * RehydrateDropsMalformed — regression gate for #12: the approvals store's merge
 * validates rehydrated requests with keepValid(approvalRequestSchema), dropping
 * malformed/garbage entries (which otherwise flow into resumeApprovedRun on
 * approve) while keeping well-formed ones.
 */
export const RehydrateDropsMalformed: Story = {
  args: { canApprove: true },
  play: async () => {
    const valid = resumableRequest();
    const persisted: unknown[] = [
      { id: "", state: "pending" }, // empty id
      { state: "pending" }, // missing id
      { id: "apr-x", state: "bogus-state" }, // invalid state enum
      "not-an-object",
      valid,
    ];
    const kept = keepValid<ApprovalRequest>(persisted, approvalRequestSchema);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe(valid.id);
  },
};

/**
 * ApprovedRunExecutes — regression gate for P1-3 (approval dead-end): approving a
 * request that carries a resumable payload must actually RUN the held dispatch —
 * record a run AND heal the target — not merely flip the card to "approved".
 */
export const ApprovedRunExecutes: Story = {
  decorators: [
    (Story) => {
      useApprovals.setState({ requests: [resumableRequest()] });
      useActivity.setState({
        runs: [],
        audit: [],
        assetOverrides: {},
        alertOverrides: {},
      });
      return (
        <div className="p-6">
          <Story />
        </div>
      );
    },
  ],
  args: { canApprove: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(useApprovals.getState().requests[0].state).toBe("approved"),
    );
    // The held action actually ran: a run was recorded and the asset healed.
    await waitFor(() =>
      expect(useActivity.getState().runs.length).toBeGreaterThan(0),
    );
    expect(useActivity.getState().assetOverrides[healAssetId]).toBeDefined();
    // …and the healed asset's open alerts were resolved too (P2-4, end-to-end).
    const openAlertIds = getAsset(healAssetId)?.openAlertIds ?? [];
    if (openAlertIds.length) {
      await waitFor(() =>
        openAlertIds.forEach((aid) =>
          expect(useActivity.getState().alertOverrides[aid]).toBeDefined(),
        ),
      );
    }
  },
};

/**
 * ApprovedAlwaysArmsPolicy — regression gate for #6 (gate drops the policy):
 * approving a request whose payload carries an "always" policy spec must BOTH run
 * the held dispatch AND create the standing rule (paused) — the automation the
 * operator asked for is never lost just because the fix gated.
 */
export const ApprovedAlwaysArmsPolicy: Story = {
  decorators: [
    (Story) => {
      useApprovals.setState({ requests: [policyResumableRequest()] });
      useActivity.setState({
        runs: [],
        audit: [],
        assetOverrides: {},
        alertOverrides: {},
      });
      usePolicies.setState({ policies: [] });
      return (
        <div className="p-6">
          <Story />
        </div>
      );
    },
  ],
  args: { canApprove: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const before = usePolicies.getState().policies.length;
    await userEvent.click(await canvas.findByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(useApprovals.getState().requests[0].state).toBe("approved"),
    );
    // The held dispatch ran AND the standing rule was created (paused), with an
    // audit trail for the creation.
    await waitFor(() =>
      expect(useActivity.getState().runs.length).toBeGreaterThan(0),
    );
    await waitFor(() =>
      expect(usePolicies.getState().policies.length).toBe(before + 1),
    );
    const created = usePolicies.getState().policies.at(-1);
    expect(created?.enabled).toBe(false); // created paused, never armed silently
    expect(
      useActivity.getState().audit.some((a) => a.verb === "enabled-policy"),
    ).toBe(true);
  },
};

/**
 * RejectedRunAudits — the mirror of P1-3: rejecting audits the refusal and runs
 * NOTHING (no recorded run, no heal) — the human-in-the-loop "no" is real.
 */
export const RejectedRunAudits: Story = {
  decorators: [
    (Story) => {
      useApprovals.setState({ requests: [resumableRequest()] });
      useActivity.setState({
        runs: [],
        audit: [],
        assetOverrides: {},
        alertOverrides: {},
      });
      return (
        <div className="p-6">
          <Story />
        </div>
      );
    },
  ],
  args: { canApprove: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(useApprovals.getState().requests[0].state).toBe("rejected"),
    );
    expect(useActivity.getState().runs.length).toBe(0);
    expect(useActivity.getState().assetOverrides[healAssetId]).toBeUndefined();
    expect(
      useActivity.getState().audit.some((a) => a.verb === "rejected"),
    ).toBe(true);
  },
};
