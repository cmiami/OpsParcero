import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { ActionCart } from "./action-cart";
import { Toaster } from "@/components/ui/sonner";
import { useActionCart } from "@/stores/action-cart";
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
