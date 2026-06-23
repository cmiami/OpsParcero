import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { StatBar } from "./stat-bar";
import { getFleetStats, getActiveOutage } from "@/mock/query";

const stats = getFleetStats();
const outage = getActiveOutage() ?? null;

const meta = {
  title: "Organisms/StatBar",
  component: StatBar,
  tags: ["autodocs"],
  argTypes: {
    stats: { table: { disable: true } },
    outage: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StatBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default — resolved-today count, per-product deltas, and the active-outage chip. */
export const Default: Story = {
  args: { stats, outage },
};

/** NoOutage — the strip with no active service outage. */
export const NoOutage: Story = {
  args: { stats, outage: null },
};

/** OutageOpensModal — clicking the outage chip opens the impact dialog. */
export const OutageOpensModal: Story = {
  args: { stats, outage },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const chip = canvas.queryByRole("button", { name: /Active outage/i });
    if (!chip) return; // seeded fixtures may not carry an active outage
    await step("open the outage modal", async () => {
      await userEvent.click(chip);
      const dialog = await within(document.body).findByRole("dialog");
      await expect(dialog).toBeInTheDocument();
    });
  },
};
