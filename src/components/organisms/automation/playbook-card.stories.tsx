import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { PlaybookCard } from "./playbook-card";
import { getPlaybooks } from "@/mock/query";
import type { Playbook } from "@/types";

const playbooks = getPlaybooks();
const base: Playbook =
  playbooks[0] ?? {
    id: "pb-fallback",
    orgId: "org-acme",
    name: "VSS Reset + Retry",
    description: "Repair VSS writers and re-run the screenshot verification.",
    steps: [
      { actionId: "repair-vss-writers", params: {}, runIf: "always", haltOnFailure: false },
      { actionId: "rerun-screenshot", params: {}, runIf: "prev-succeeded", haltOnFailure: false },
    ],
    defaultScope: "once",
    createdBy: "u-current",
    lastRunAt: "2026-06-22T12:00:00Z",
  };

const meta = {
  title: "Organisms/PlaybookCard",
  component: PlaybookCard,
  tags: ["autodocs"],
  args: {
    onLoadIntoCart: fn(),
    onRunNow: fn(),
    onEdit: fn(),
    onDuplicate: fn(),
    onRollback: fn(),
    onDelete: fn(),
  },
  argTypes: {
    successRate: { control: { type: "number" } },
    trigger: { control: "text" },
    source: { control: "select", options: ["curated", "msp-authored"] },
    playbook: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-[22rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlaybookCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Manual — an MSP-authored playbook triggered by hand. */
export const Manual: Story = {
  args: {
    playbook: { ...base, lastRunAt: "2026-06-22T12:00:00Z" },
    trigger: "manual",
    successRate: 94,
    source: "msp-authored",
  },
  // Interactive: "Load into cart" stages the playbook → fires onLoadIntoCart.
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /Load into cart/i }),
    );
    await expect(args.onLoadIntoCart).toHaveBeenCalled();
  },
};

/** Triggered — an auto-merge-eligible playbook. */
export const Triggered: Story = {
  args: {
    playbook: base,
    trigger: "auto-merge eligible",
    successRate: 88,
    source: "msp-authored",
  },
};

/** Curated — a read-only library template (delete disabled). */
export const Curated: Story = {
  args: {
    playbook: base,
    trigger: "VSS failure event",
    successRate: 91,
    source: "curated",
  },
};

/** NeverRun — no last-run timestamp yet. */
export const NeverRun: Story = {
  args: {
    playbook: { ...base, lastRunAt: undefined },
    trigger: "manual",
    source: "msp-authored",
  },
};
