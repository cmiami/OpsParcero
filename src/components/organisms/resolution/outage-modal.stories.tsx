import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, fn } from "storybook/test";
import { OutageModal } from "./outage-modal";
import { getActiveOutage } from "@/mock/query";
import type { Incident } from "@/types";

const fallback: Incident = {
  id: "inc-demo",
  kind: "pod-throttling",
  scope: "pod",
  alertIds: ["al-1", "al-2", "al-3", "al-4", "al-5", "al-6", "al-7"],
  status: "active",
  vendorStatusRef: "DTC-2026-0612",
  bannerText:
    "Storage pod throttling on mothership.dtc.datto.com is delaying offsite sync. Queued backups will catch up automatically.",
  openedAt: "2026-06-22T12:30:00Z",
};

const incident = getActiveOutage() ?? fallback;

const meta = {
  title: "Organisms/OutageModal",
  component: OutageModal,
  tags: ["autodocs"],
  args: { open: true, onOpenChange: fn(), incident },
  argTypes: {
    open: { control: "boolean" },
    onOpenChange: { table: { disable: true } },
    incident: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OutageModal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default — "Are you impacted?" with affected vs unaffected asset columns. */
export const Default: Story = {};

/** PlatformOutage — a fleet-wide platform outage variant. */
export const PlatformOutage: Story = {
  args: {
    incident: { ...fallback, kind: "platform-outage", scope: "fleet" },
  },
};

/** ShowsImpactSplit — the dialog renders both affected and unaffected sections. */
export const ShowsImpactSplit: Story = {
  play: async () => {
    const body = within(document.body);
    await expect(await body.findByLabelText("Affected assets")).toBeInTheDocument();
    await expect(
      await body.findByLabelText("Unaffected assets"),
    ).toBeInTheDocument();
  },
};
