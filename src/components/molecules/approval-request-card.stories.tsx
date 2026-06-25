import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, userEvent } from "storybook/test";
import { ApprovalRequestCard } from "./approval-request-card";
import { ACTION_BY_ID } from "@/mock/reference";
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

/**
 * WithDispatchContext — regression gate for #13: a request that carries a
 * resumable payload surfaces WHAT will run — the action label, its scope, and (for
 * an "always" apply) that it arms a standing rule — so no one approves blind.
 */
export const WithDispatchContext: Story = {
  args: {
    request: {
      ...base,
      reason: "destructive",
      payload: {
        kind: "action",
        actionId: "force-retention",
        targetRefs: [{ kind: "asset", id: "btru-fs1" }],
        scope: "always",
        params: {},
        policy: {
          category: "Retention / storage",
          actionId: "force-retention",
        },
      },
    },
    requesterName: "Jordan Doe",
    canApprove: true,
    onDecide: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The action being approved is named (resolved label, not the raw id)…
    await expect(
      canvas.getByText(ACTION_BY_ID["force-retention"].label),
    ).toBeInTheDocument();
    // …its scope is shown…
    await expect(canvas.getByText(/Always — standing rule/i)).toBeInTheDocument();
    // …and the standing-rule consequence is flagged (text, not color alone).
    await expect(canvas.getByText(/Arms a standing rule/i)).toBeInTheDocument();
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
