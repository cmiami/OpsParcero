import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, userEvent } from "storybook/test";
import { ApprovalRequestCard } from "./approval-request-card";
import type { ApprovalRequest } from "@/types";

const base: ApprovalRequest = {
  id: "apr-001",
  requestedFor: { kind: "action-run", refId: "arun-7781" },
  requestedBy: "u-jdoe",
  reason: "destructive",
  blastRadius: {
    assetCount: 14,
    preview: "Force Retention on 14 agents incl. btru-fs1, btru-erp1, ACME-DC01",
  },
  state: "pending",
};

const meta = {
  title: "Molecules/ApprovalRequestCard",
  component: ApprovalRequestCard,
  tags: ["autodocs"],
  argTypes: {
    canApprove: { control: "boolean" },
    requesterName: { control: "text" },
    onDecide: { table: { disable: true } },
    request: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-[26rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ApprovalRequestCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: {
    request: base,
    requesterName: "Jordan Doe",
    canApprove: true,
    onDecide: fn(),
  },
};

export const Approved: Story = {
  args: {
    request: {
      ...base,
      state: "approved",
      decidedBy: "u-smgr",
      decidedAt: "2026-06-22T13:40:00Z",
      note: "Verified maintenance window, safe to proceed.",
    },
    requesterName: "Jordan Doe",
    canApprove: true,
    onDecide: fn(),
  },
};

export const Rejected: Story = {
  args: {
    request: {
      ...base,
      reason: "irreversible",
      state: "rejected",
      decidedBy: "u-smgr",
      decidedAt: "2026-06-22T13:45:00Z",
      note: "Hold until offsite sync is current.",
    },
    requesterName: "Jordan Doe",
    canApprove: true,
    onDecide: fn(),
  },
};

export const ReadOnly: Story = {
  args: {
    request: base,
    requesterName: "Jordan Doe",
    canApprove: false,
    onDecide: fn(),
  },
};

export const ApproveFlow: Story = {
  args: {
    request: base,
    requesterName: "Jordan Doe",
    canApprove: true,
    onDecide: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const approve = canvas.getByRole("button", { name: "Approve" });
    await userEvent.click(approve);
    await expect(args.onDecide).toHaveBeenCalledWith("apr-001", "approved");
  },
};
