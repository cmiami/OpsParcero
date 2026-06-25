import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { ActionCart } from "./action-cart";
import { Toaster } from "@/components/ui/sonner";
import { useActionCart } from "@/stores/action-cart";
import { useActivity } from "@/stores/activity";
import { useApprovals } from "@/stores/approvals";
import { makeUid } from "@/stores/uid";
import { healedAssetIds, resumeApprovedRun } from "@/lib/activity-record";
import type { ActionScope } from "@/types";
import type { RunnerOutcome } from "@/mock/runner";

function seed(opts: {
  steps?: { actionId: string; scope?: ActionScope }[];
  targets?: string[];
  defaultScope?: ActionScope;
}) {
  useActionCart.setState({
    targets: opts.targets ?? [],
    defaultScope: opts.defaultScope ?? "once",
    steps: (opts.steps ?? []).map((s) => ({
      uid: makeUid("step"),
      actionId: s.actionId,
      params: {},
      scope: s.scope ?? opts.defaultScope ?? "once",
    })),
  });
}

const meta = {
  title: "Organisms/ActionCart",
  component: ActionCart,
  tags: ["autodocs"],
  args: { inline: true },
  argTypes: { inline: { control: "boolean" } },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
        <Toaster />
      </div>
    ),
  ],
} satisfies Meta<typeof ActionCart>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * HealsOnlySucceededTargets — regression gate for the partial-heal bug: a partial
 * outcome heals SOME targets and fails others, so healedAssetIds must return only
 * the succeeded asset refs (callers heal exactly those, never the whole list).
 */
export const HealsOnlySucceededTargets: Story = {
  decorators: [
    (Story) => {
      seed({ steps: [] });
      return <Story />;
    },
  ],
  play: async () => {
    const partial = {
      state: "partial",
      resultSummary: "2 of 3 healed",
      healsAsset: true,
      healedStatus: "protected",
      perTarget: [
        { ref: { kind: "asset", id: "AST-A" }, state: "succeeded" },
        { ref: { kind: "asset", id: "AST-B" }, state: "failed" },
        { ref: { kind: "asset", id: "AST-C" }, state: "succeeded" },
      ],
    } as unknown as RunnerOutcome;
    expect(healedAssetIds(partial)).toEqual(["AST-A", "AST-C"]);
    // All targets failed → heal nothing.
    const allFailed = {
      ...partial,
      perTarget: [{ ref: { kind: "asset", id: "AST-B" }, state: "failed" }],
    } as unknown as RunnerOutcome;
    expect(healedAssetIds(allFailed)).toEqual([]);
  },
};

/**
 * EmptyTargetsBlocksDispatch — regression gate for P3-3: a chain with steps but
 * NO target asset must not be dispatchable (no phantom "preview-asset" record).
 * Save-as-playbook stays available — it is target-independent.
 */
export const EmptyTargetsBlocksDispatch: Story = {
  decorators: [
    (Story) => {
      seed({ steps: [{ actionId: "repair-vss-writers" }], targets: [] });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole("button", { name: /Dispatch/ })).toBeDisabled();
    expect(
      canvas.getByRole("button", { name: /Save as playbook/i }),
    ).toBeEnabled();
  },
};

/**
 * GatedChainDefersRecording — regression gate for #11: when a chain ends
 * awaiting-approval, the cart records/heals NOTHING (no phantom 'awaiting-approval'
 * run, no pre-approval self-heal of the earlier step) and only enqueues a
 * resumable payload. resumeApprovedRun is then the SOLE writer — each ran step
 * recorded exactly once on approval, never double-counted.
 */
export const GatedChainDefersRecording: Story = {
  decorators: [
    (Story) => {
      useActivity.setState({
        runs: [],
        audit: [],
        assetOverrides: {},
        alertOverrides: {},
      });
      useApprovals.setState({ requests: [] });
      seed({
        steps: [
          { actionId: "repair-vss-writers" }, // reversible self-heal (would pre-heal)
          { actionId: "force-merge" }, // irreversible → gates the chain
        ],
        targets: ["btru-fs1"],
        defaultScope: "all-matching",
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Dispatch/ }));
    // Chain gates → NOTHING recorded/healed pre-approval; only an approval queued.
    await waitFor(
      () => expect(useApprovals.getState().requests.length).toBeGreaterThan(0),
      { timeout: 3000 },
    );
    expect(useActivity.getState().runs.length).toBe(0);
    expect(Object.keys(useActivity.getState().assetOverrides).length).toBe(0);
    const req = useApprovals.getState().requests[0];
    expect(req.state).toBe("pending");
    expect(req.payload?.kind).toBe("chain");
    // Approving runs the chain ONCE — each ran step recorded exactly once.
    if (req.payload) resumeApprovedRun(req.payload);
    await waitFor(() => expect(useActivity.getState().runs.length).toBe(2));
  },
};

/** Empty — nothing assembled yet. */
export const Empty: Story = {
  decorators: [
    (Story) => {
      seed({ steps: [] });
      return <Story />;
    },
  ],
};

/** OneItem — a single remediation step. */
export const OneItem: Story = {
  decorators: [
    (Story) => {
      seed({
        steps: [{ actionId: "repair-vss-writers" }],
        targets: ["ACME-DC01"],
      });
      return <Story />;
    },
  ],
};

/** ManyItems — a multi-step chain across several targets. */
export const ManyItems: Story = {
  decorators: [
    (Story) => {
      seed({
        steps: [
          { actionId: "repair-vss-writers" },
          { actionId: "restart-agent-service" },
          { actionId: "force-retention" },
        ],
        targets: ["btru-fs1", "btru-erp1", "ACME-DC01"],
        defaultScope: "all-matching",
      });
      return <Story />;
    },
  ],
};

/** MixedScopes — steps carry per-step scope overrides. */
export const MixedScopes: Story = {
  decorators: [
    (Story) => {
      seed({
        steps: [
          { actionId: "repair-vss-writers", scope: "once" },
          { actionId: "force-retention", scope: "all-matching" },
        ],
        targets: ["ACME-DC01", "NWND-SQL02"],
        defaultScope: "once",
      });
      return <Story />;
    },
  ],
};

/** ReadyToRun — full chain + targets, ready to dispatch. */
export const ReadyToRun: Story = {
  decorators: [
    (Story) => {
      seed({
        steps: [
          { actionId: "repair-vss-writers" },
          { actionId: "restart-agent-service" },
        ],
        targets: ["btru-fs1", "btru-erp1"],
        defaultScope: "all-matching",
      });
      return <Story />;
    },
  ],
};

/** AddRemove — remove a step and verify the store shrinks. */
export const AddRemove: Story = {
  decorators: [
    (Story) => {
      seed({
        steps: [
          { actionId: "repair-vss-writers" },
          { actionId: "restart-agent-service" },
        ],
        targets: ["ACME-DC01"],
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const before = useActionCart.getState().steps.length;
    const remove = canvas.getAllByRole("button", { name: "Remove step" })[0];
    await userEvent.click(remove);
    await waitFor(() =>
      expect(useActionCart.getState().steps.length).toBe(before - 1),
    );
  },
};

/**
 * DispatchRecords — dispatch must produce DURABLE ActionRun + Audit records the
 * Run history / Audit surfaces read, and clear the cart on success (R3). Both
 * steps are `requiresApproval:"never"` + non-destructive, so the chain runs to
 * completion deterministically (no approval short-circuit).
 */
export const DispatchRecords: Story = {
  decorators: [
    (Story) => {
      useActivity.setState({ runs: [], audit: [] });
      seed({
        steps: [
          { actionId: "repair-vss-writers" },
          { actionId: "restart-agent-service" },
        ],
        targets: ["btru-fs1", "btru-erp1"],
        defaultScope: "all-matching",
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const runsBefore = useActivity.getState().runs.length;
    await userEvent.click(canvas.getByRole("button", { name: /Dispatch/ }));
    // Dispatch persists after a simulated-latency setTimeout, then clears.
    await waitFor(
      () =>
        expect(useActivity.getState().runs.length).toBeGreaterThan(runsBefore),
      { timeout: 3000 },
    );
    await waitFor(
      () => {
        // Each ran step → a durable run + audit entry; cart cleared on success.
        expect(useActivity.getState().audit.length).toBeGreaterThan(0);
        expect(useActionCart.getState().steps.length).toBe(0);
      },
      { timeout: 3000 },
    );
  },
};
