import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, userEvent, waitFor } from "storybook/test";
import { AlertTriageList } from "./alert-triage-list";
import {
  getOpenAlerts,
  getAsset,
  getActionsForFailureMode,
} from "@/mock/query";
import { applyAlertOverrides } from "@/stores/activity";

const alerts = getOpenAlerts();

const meta = {
  title: "Organisms/AlertTriageList",
  component: AlertTriageList,
  tags: ["autodocs"],
  args: { onTriage: fn() },
  argTypes: {
    groupBy: { control: "select", options: ["none", "category"] },
    alerts: { table: { disable: true } },
    onTriage: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AlertTriageList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default — severity-sorted flat list. */
export const Default: Story = {
  args: { alerts: alerts.slice(0, 12) },
};

/** Grouped — clustered by failure category. */
export const Grouped: Story = {
  args: { alerts: alerts.slice(0, 12), groupBy: "category" },
};

/** Empty — queue is clear. */
export const Empty: Story = {
  args: { alerts: [] },
};

/** BulkSelect — select all → bulk toolbar slides in → Acknowledge fires per alert. */
export const BulkSelect: Story = {
  args: { alerts: alerts.slice(0, 5) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const selectAll = canvas.getByRole("checkbox", { name: /Select all alerts/i });
    await userEvent.click(selectAll);
    const toolbar = await canvas.findByRole("toolbar", {
      name: /Bulk triage actions/i,
    });
    await expect(toolbar).toBeInTheDocument();
    const ack = within(toolbar).getByRole("button", { name: /Acknowledge/i });
    await userEvent.click(ack);
    await waitFor(() => expect(args.onTriage).toHaveBeenCalled());
  },
};

/**
 * NoImpossibleTargets — fixture-integrity gate (#2): every injected failure must
 * land on an asset whose kind one of the mode's actions can actually run on (e.g.
 * never a Salesforce-restore failure on a mailbox seat). Asserts zero impossible
 * targets across the whole seeded alert set.
 */
export const NoImpossibleTargets: Story = {
  args: { alerts: alerts.slice(0, 1) },
  play: async () => {
    let checked = 0;
    for (const al of getOpenAlerts()) {
      if (!al.assetId || !al.failureModeId) continue;
      const asset = getAsset(al.assetId);
      if (!asset) continue;
      const kinds = new Set(
        getActionsForFailureMode(al.failureModeId).flatMap(
          (a) => a.appliesToKinds,
        ),
      );
      if (kinds.size === 0) continue; // mode has no kind constraint
      checked++;
      expect(
        kinds.has(asset.kind),
        `${al.failureModeId} landed on ${asset.kind} ${asset.id} — impossible target`,
      ).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  },
};

/**
 * AlertOverlayResolves — regression gate for P2-4: a heal that resolves an
 * asset's alerts must drop those alerts from the triage queue. Tests the pure
 * overlay the list/asset-detail/alerts surfaces apply on read (hydration-gated),
 * directly — no global store mutation, so it can't leak into other stories.
 */
export const AlertOverlayResolves: Story = {
  args: { alerts: alerts.slice(0, 1) },
  play: async () => {
    const sample = getOpenAlerts().slice(0, 4);
    expect(sample.length).toBeGreaterThan(0);
    const overrides = {
      [sample[0].id]: {
        state: "resolved" as const,
        resolvedAt: "2026-06-24T00:00:00Z",
      },
    };
    const overlaid = applyAlertOverrides(sample, overrides);
    // The targeted alert flips to resolved…
    expect(overlaid.find((a) => a.id === sample[0].id)?.state).toBe("resolved");
    // …and the consumers' "drop resolved" filter removes exactly it.
    const open = overlaid.filter((a) => a.state !== "resolved");
    expect(open).toHaveLength(sample.length - 1);
    expect(open.some((a) => a.id === sample[0].id)).toBe(false);
  },
};

/**
 * BulkFixFires — regression gate for the "Fix" verb specifically: it must call
 * onTriage("fix", alert) so the page/asset-view can open the real GuidedFixPanel.
 * Previously both call sites omitted onTriage, so Fix did nothing.
 */
export const BulkFixFires: Story = {
  args: { alerts: alerts.slice(0, 5) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Select all alerts/i }),
    );
    const toolbar = await canvas.findByRole("toolbar", {
      name: /Bulk triage actions/i,
    });
    await userEvent.click(within(toolbar).getByRole("button", { name: /^Fix$/i }));
    await waitFor(() =>
      expect(args.onTriage).toHaveBeenCalledWith("fix", expect.anything()),
    );
  },
};
