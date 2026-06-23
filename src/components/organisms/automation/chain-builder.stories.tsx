import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { ChainBuilder } from "./chain-builder";
import { Toaster } from "@/components/ui/sonner";
import { useUserPlaybooks } from "@/stores/playbooks";
import type { PlaybookStep } from "@/types";

const vssChain: PlaybookStep[] = [
  { actionId: "query-vss-writer-status", params: {}, runIf: "always", haltOnFailure: false },
  { actionId: "repair-vss-writers", params: {}, runIf: "always", haltOnFailure: false },
  { actionId: "rerun-screenshot", params: {}, runIf: "prev-succeeded", haltOnFailure: false },
];

const gatedChain: PlaybookStep[] = [
  { actionId: "query-vss-writer-status", params: {}, runIf: "always", haltOnFailure: false },
  { actionId: "force-retention", params: { retentionDays: 14 }, runIf: "always", haltOnFailure: true },
];

const meta = {
  title: "Organisms/ChainBuilder",
  component: ChainBuilder,
  tags: ["autodocs"],
  argTypes: {
    steps: { table: { disable: true } },
    onSave: { table: { disable: true } },
    defaultScope: {
      control: "select",
      options: ["once", "all-matching", "always"],
    },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => {
      useUserPlaybooks.setState({ userPlaybooks: [] });
      return (
        <div className="mx-auto max-w-xl">
          <Story />
          <Toaster />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ChainBuilder>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Empty — no steps; add-step picker is the entry point. */
export const Empty: Story = { args: {} };

/** SingleStep — one action queued. */
export const SingleStep: Story = {
  args: { steps: [vssChain[1]] },
};

/** Multi — a multi-step diagnostic → remediation → verify chain. */
export const Multi: Story = {
  args: { steps: vssChain, defaultScope: "all-matching" },
};

/** WithApprovalGate — a halt-on-failure step renders the gate marker. */
export const WithApprovalGate: Story = {
  args: { steps: gatedChain },
};

/** Reorder — move the second step up and confirm order changed in the DOM. */
export const Reorder: Story = {
  args: { steps: vssChain },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const items = canvas.getAllByRole("listitem");
    const firstLabelBefore = items[0].textContent ?? "";
    const moveUpButtons = canvas.getAllByRole("button", { name: "Move step up" });
    // Step 1's move-up is disabled; step 2's (index 1) is the first enabled one.
    await userEvent.click(moveUpButtons[1]);
    await waitFor(() => {
      const after = canvas.getAllByRole("listitem")[0].textContent ?? "";
      expect(after).not.toBe(firstLabelBefore);
    });
  },
};
