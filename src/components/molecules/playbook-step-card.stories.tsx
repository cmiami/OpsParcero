import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { PlaybookStepCard } from "./playbook-step-card";
import type { PlaybookStep } from "@/types";

const baseStep: PlaybookStep = {
  actionId: "restart-agent-service",
  params: { waitSec: 30, dryRun: false },
  runIf: "always",
  haltOnFailure: false,
};

const meta = {
  title: "Molecules/PlaybookStepCard",
  component: PlaybookStepCard,
  tags: ["autodocs"],
  argTypes: {
    index: { control: { type: "number" } },
    dragHandle: { control: "boolean" },
    actionLabel: { control: "text" },
    onRemove: { table: { disable: true } },
    onMoveUp: { table: { disable: true } },
    onMoveDown: { table: { disable: true } },
    step: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-[28rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlaybookStepCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    step: baseStep,
    index: 0,
    onRemove: fn(),
    onMoveDown: fn(),
  },
  // Interactive: the icon-only controls are wired — removing fires onRemove.
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Remove step" }));
    await expect(args.onRemove).toHaveBeenCalled();
  },
};

export const ErrorStep: Story = {
  args: {
    step: {
      actionId: "reauthorize-oauth",
      params: { adminConsent: true },
      runIf: "prev-failed",
      haltOnFailure: false,
    },
    index: 1,
    onRemove: fn(),
    onMoveUp: fn(),
    onMoveDown: fn(),
  },
};

export const ApprovalGated: Story = {
  args: {
    step: {
      actionId: "force-retention",
      params: { retentionDays: 30, dryRun: false },
      runIf: "always",
      haltOnFailure: true,
    },
    index: 2,
    onRemove: fn(),
    onMoveUp: fn(),
  },
};

export const WithDragHandle: Story = {
  args: {
    step: baseStep,
    index: 0,
    dragHandle: true,
    onRemove: fn(),
    onMoveDown: fn(),
  },
};
