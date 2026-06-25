import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";

import { AppSidebar } from "./app-sidebar";
import { useActionCart } from "@/stores/action-cart";
import { useUiStore } from "@/stores/ui";
import { useActivity } from "@/stores/activity";
import { getIssues } from "@/mock/query";

const meta = {
  title: "Organisms/AppSidebar",
  component: AppSidebar,
  tags: ["autodocs"],
  argTypes: {
    activeHref: {
      control: "select",
      options: [
        "/resolution",
        "/fleet",
        "/backups",
        "/alerts",
        "/automation/playbooks",
        "/automation/policies",
        "/settings",
        "/cart",
      ],
    },
    collapsed: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => {
      // Seed the cart so the hydration-gated badge has something to show.
      useActionCart.setState({
        steps: [
          { uid: "s1", actionId: "act-restart-agent", params: {}, scope: "once" },
          { uid: "s2", actionId: "act-force-offsite", params: {}, scope: "once" },
          { uid: "s3", actionId: "act-diff-merge", params: {}, scope: "once" },
        ],
      });
      // Default to unscoped so a leaked active tenant can't change badge counts;
      // TenantScopedBadges sets its own tenant in an inner story decorator (after).
      useUiStore.setState({ lastClientId: undefined });
      return (
        <div className="h-screen">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof AppSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  args: { activeHref: "/resolution", collapsed: false },
};

export const Collapsed: Story = {
  args: { activeHref: "/resolution", collapsed: true },
};

export const ActiveItem: Story = {
  args: { activeHref: "/fleet", collapsed: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const active = canvas.getByRole("link", { name: /fleet/i });
    await expect(active).toHaveAttribute("aria-current", "page");
  },
};

/**
 * TenantScopedBadges — regression gate for #10: with a tenant active, the nav
 * badge counts are scoped to that tenant (matching the scoped Resolution/Alerts
 * pages), not the global fleet total.
 */
export const TenantScopedBadges: Story = {
  args: { activeHref: "/fleet", collapsed: false },
  decorators: [
    (Story) => {
      useUiStore.setState({ lastClientId: "CLI-ACME" });
      // No session heals, so the badge equals the raw scoped count.
      useActivity.setState({
        runs: [],
        audit: [],
        assetOverrides: {},
        alertOverrides: {},
      });
      return (
        <div className="h-screen">
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scoped = getIssues({ clientIds: ["CLI-ACME"] }).length;
    const global = getIssues().length;
    // Precondition: scoping is observable (the tenant has fewer issues than all).
    expect(scoped).toBeLessThan(global);
    const resolution = await canvas.findByRole("link", {
      name: /Resolution Center/i,
    });
    await waitFor(() =>
      expect(resolution).toHaveTextContent(String(scoped)),
    );
    expect(resolution).not.toHaveTextContent(String(global));
  },
};

export const TenantSwitcherOpen: Story = {
  args: { activeHref: "/resolution", collapsed: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("combobox", { name: /switch tenant/i }),
    );
    const screen = within(document.body);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/find tenant/i)).toBeVisible(),
    );
  },
};
