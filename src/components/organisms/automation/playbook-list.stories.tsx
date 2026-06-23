import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { PlaybookList } from "./playbook-list";
import { getPlaybooks } from "@/mock/query";

const playbooks = getPlaybooks();

const meta = {
  title: "Organisms/PlaybookList",
  component: PlaybookList,
  tags: ["autodocs"],
  args: { onLoadIntoCart: fn(), onRunNow: fn() },
  argTypes: {
    grouped: { control: "boolean" },
    playbooks: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlaybookList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default — flat responsive grid of the seeded library. */
export const Default: Story = {
  args: { playbooks: playbooks.slice(0, 6) },
};

/** Grouped — split into My playbooks + Curated templates. */
export const Grouped: Story = {
  args: { playbooks: playbooks.slice(0, 9), grouped: true },
};

/** FilteredByProduct — a narrowed set. */
export const FilteredByProduct: Story = {
  args: { playbooks: playbooks.slice(0, 3) },
};

/** Empty — no playbooks; first-class empty state. */
export const Empty: Story = {
  args: { playbooks: [] },
};
