import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, userEvent } from "storybook/test";
import { OutageBanner } from "./outage-banner";
import type { Incident } from "@/types";

const active: Incident = {
  id: "inc-001",
  kind: "pod-throttling",
  scope: "pod",
  alertIds: ["al-1", "al-2", "al-3", "al-4", "al-5"],
  status: "active",
  vendorStatusRef: "DTC-2026-0612",
  bannerText:
    "Storage pod throttling on mothership.dtc.datto.com is delaying offsite sync. Backups are queued and will catch up automatically.",
  openedAt: "2026-06-22T12:30:00Z",
};

const meta = {
  title: "Molecules/OutageBanner",
  component: OutageBanner,
  tags: ["autodocs"],
  argTypes: {
    onOpen: { table: { disable: true } },
    incident: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-[40rem] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OutageBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: { incident: active, onOpen: fn() },
};

export const Resolved: Story = {
  args: {
    incident: {
      ...active,
      status: "resolved",
      resolvedAt: "2026-06-22T13:50:00Z",
    },
    onOpen: fn(),
  },
};

export const OpenImpactDialog: Story = {
  args: { incident: active, onOpen: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole("button", { name: /Check impact/i });
    await userEvent.click(btn);
    await expect(args.onOpen).toHaveBeenCalled();
    const dialog = within(document.body);
    await expect(
      await dialog.findByText(/Correlated alerts/i),
    ).toBeInTheDocument();
  },
};
