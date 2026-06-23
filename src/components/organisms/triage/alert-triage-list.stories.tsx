import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, userEvent, waitFor } from "storybook/test";
import { AlertTriageList } from "./alert-triage-list";
import { getOpenAlerts } from "@/mock/query";

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
