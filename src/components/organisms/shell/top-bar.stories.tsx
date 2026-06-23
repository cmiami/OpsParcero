import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";

import { TopBar } from "./top-bar";

const meta = {
  title: "Organisms/TopBar",
  component: TopBar,
  tags: ["autodocs"],
  argTypes: {
    notificationCount: { control: { type: "number", min: 0, max: 99 } },
    onSearch: { action: "search" },
  },
  args: {
    breadcrumb: [
      { label: "Resolution Center", href: "/resolution" },
      { label: "Backup failing", href: "/resolution/cat-backup" },
      { label: "btru-fs1" },
    ],
    notificationCount: 0,
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TopBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const UnreadNotifications: Story = {
  args: { notificationCount: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: /3 unread/i }),
    ).toBeVisible();
  },
};

export const MenuOpen: Story = {
  args: { notificationCount: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /account:/i }));
    const screen = within(document.body);
    await waitFor(() => expect(screen.getByText(/sign out/i)).toBeVisible());
  },
};
