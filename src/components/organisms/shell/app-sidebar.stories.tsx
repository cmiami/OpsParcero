import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";

import { AppSidebar } from "./app-sidebar";
import { useActionCart } from "@/stores/action-cart";

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
