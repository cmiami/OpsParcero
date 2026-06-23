import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { AuditLog } from "./audit-log";
import { getAuditLog } from "@/mock/query";

const ALL = getAuditLog();
// A single-actor slice for the FilteredByActor state.
const firstUserActor = ALL.find((e) => e.actor.kind === "user")?.actor.refId;
const SINGLE_ACTOR = firstUserActor
  ? ALL.filter((e) => e.actor.kind === "user" && e.actor.refId === firstUserActor)
  : ALL.slice(0, 3);

const meta = {
  title: "Organisms/AuditLog",
  component: AuditLog,
  tags: ["autodocs"],
  argTypes: {
    density: { control: "inline-radio", options: ["default", "compact"] },
    entries: { control: false },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AuditLog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { entries: ALL },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Filter via the search field (deterministic, no portal).
    const search = canvas.getByRole("searchbox", { name: "Search audit log" });
    await userEvent.type(search, "approved");
    await expect(search).toHaveValue("approved");
  },
};

export const FilteredByActor: Story = {
  args: { entries: SINGLE_ACTOR },
};

export const Empty: Story = {
  args: { entries: [] },
};
