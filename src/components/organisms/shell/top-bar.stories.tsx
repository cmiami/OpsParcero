import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";

import { TopBar } from "./top-bar";
import { useActivity } from "@/stores/activity";

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

/**
 * FixAllRecordsRuns — regression gate for #5: "End-to-end fix all" REALLY runs
 * the end-to-end-fixable issues (records durable runs + heals), not just a toast.
 */
export const FixAllRecordsRuns: Story = {
  play: async ({ canvasElement }) => {
    useActivity.setState({
      runs: [],
      audit: [],
      assetOverrides: {},
      alertOverrides: {},
    });
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /End-to-end fix all/i }),
    );
    await waitFor(() =>
      expect(useActivity.getState().runs.length).toBeGreaterThan(0),
    );
  },
};

/**
 * OverflowMenuPresent — regression gate for #14: a compact overflow trigger is
 * rendered (lg:hidden) so Search / Scan / Fix-all stay reachable below lg, where
 * their inline buttons are hidden. (display:none at this wide test viewport, so
 * queried with hidden:true.)
 */
export const OverflowMenuPresent: Story = {
  play: async ({ canvasElement }) => {
    // Visibility-agnostic: the trigger is display:none at this wide test width
    // (lg:hidden), so query the DOM directly rather than by accessible role.
    expect(
      canvasElement.querySelector('[aria-label="More actions"]'),
    ).not.toBeNull();
  },
};
