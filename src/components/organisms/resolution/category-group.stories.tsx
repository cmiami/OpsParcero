import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { CategoryGroup } from "./category-group";
import { Toaster } from "@/components/ui/sonner";
import { getIssueCategories } from "@/mock/query";

const groups = getIssueCategories();
const withCritical = groups.find((g) => g.criticalCount > 0) ?? groups[0];
const withoutCritical = groups.find((g) => g.criticalCount === 0) ?? groups[0];

const meta = {
  title: "Organisms/CategoryGroup",
  component: CategoryGroup,
  tags: ["autodocs"],
  argTypes: {
    defaultOpen: { control: "boolean" },
    group: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-4xl">
        <Story />
        <Toaster />
      </div>
    ),
  ],
} satisfies Meta<typeof CategoryGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

/** WithCriticals — a category carrying critical issues; opens by default. */
export const WithCriticals: Story = {
  args: { group: withCritical },
};

/** WarningsOnly — a category with no criticals; collapsed by default. */
export const WarningsOnly: Story = {
  args: { group: withoutCritical },
};

/** Collapsed — explicitly closed regardless of critical count. */
export const Collapsed: Story = {
  args: { group: withCritical, defaultOpen: false },
};

/** ExpandsOnClick — collapsed group expands when its header is clicked. */
export const ExpandsOnClick: Story = {
  args: { group: withCritical, defaultOpen: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [trigger] = canvas.getAllByRole("button");
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("data-state", "open");
  },
};
