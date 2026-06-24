import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { ActionCart } from "./action-cart";
import { Toaster } from "@/components/ui/sonner";
import { useActionCart } from "@/stores/action-cart";
import { useActivity } from "@/stores/activity";
import { makeUid } from "@/stores/uid";
import type { ActionScope } from "@/types";

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
