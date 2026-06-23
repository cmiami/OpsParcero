import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { ApprovalQueue } from "./approval-queue";
import { useApprovals } from "@/stores/approvals";
import { getPendingApprovals, getApprovals } from "@/mock/query";
import type { ApprovalRequest } from "@/types";

const pending = getPendingApprovals();
const all = getApprovals();

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
