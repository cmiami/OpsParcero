import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, userEvent } from "storybook/test";
import { AlertTriageRow } from "./alert-triage-row";
import { getOpenAlerts, getAlerts } from "@/mock/query";
import type { Alert } from "@/types";

const open = getOpenAlerts();
const all = getAlerts();
const baseAlert: Alert =
  open[0] ??
  all[0] ?? {
    id: "alert-fallback",
    clientId: "acme",
    assetId: "ACME-DC01",
    source: "backup-run",
    subjectRef: { kind: "asset", id: "ACME-DC01" },
    severity: "critical",
    category: "Screenshot/Local Verification",
    title: "Screenshot verification failing",
    state: "open",
    isCosmetic: false,
    firstSeenAt: "2026-06-22T10:00:00Z",
    lastSeenAt: "2026-06-22T13:30:00Z",
    occurrenceCount: 4,
  };

const meta = {
  title: "Organisms/AlertTriageRow",
  component: AlertTriageRow,
  tags: ["autodocs"],
  args: { onTriage: fn(), assetName: "ACME-DC01" },
  argTypes: {
    selected: { control: "boolean" },
    assetName: { control: "text" },
    alert: { table: { disable: true } },
    onTriage: { table: { disable: true } },
    onSelectedChange: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="border-x border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AlertTriageRow>;
export default meta;
type Story = StoryObj<typeof meta>;

/** New — an open, untriaged alert. */
export const New: Story = {
  args: { alert: { ...baseAlert, state: "open" } },
};

/**
 * TouchTargetsOnIconButtons — regression gate for #15: the dense size-7 icon
 * controls carry the coarse-pointer min-hit-area utility (touch-target), so they
 * reach 44px on touch while keeping the compact look on a mouse.
 */
export const TouchTargetsOnIconButtons: Story = {
  args: { alert: { ...baseAlert, state: "open" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByRole("button", { name: /Acknowledge alert/i }),
    ).toHaveClass("touch-target");
    expect(
      canvas.getByRole("button", { name: /More triage actions/i }),
    ).toHaveClass("touch-target");
  },
};

/** Acknowledged — picked up by a technician. */
export const Acknowledged: Story = {
  args: { alert: { ...baseAlert, state: "acknowledged" } },
};

/** Assigned — same as acknowledged with an owner (shown via menu). */
export const Assigned: Story = {
  args: { alert: { ...baseAlert, state: "acknowledged" }, selected: true, onSelectedChange: fn() },
};

/** Snoozed — suppressed for a window. */
export const Snoozed: Story = {
  args: { alert: { ...baseAlert, state: "suppressed", isCosmetic: true } },
};

/** Resolved — decided; action buttons hidden. */
export const Resolved: Story = {
  args: { alert: { ...baseAlert, state: "resolved" } },
};

/** TriageFix — clicking Fix fires the triage handler. */
export const TriageFix: Story = {
  args: { alert: { ...baseAlert, state: "open" } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const fixBtn = canvas.getByRole("button", { name: /Fix/i });
    await userEvent.click(fixBtn);
    await expect(args.onTriage).toHaveBeenCalledWith("fix", expect.anything());
  },
};
