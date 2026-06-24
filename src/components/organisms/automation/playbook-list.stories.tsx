import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, waitFor } from "storybook/test";
import { PlaybookList } from "./playbook-list";
import { getPlaybooks } from "@/mock/query";
import { useUserPlaybooks } from "@/stores/playbooks";
import type { Playbook } from "@/types";

const playbooks = getPlaybooks();

const USER_PB: Playbook = {
  id: "pb-user-gate",
  orgId: "org-acme",
  name: "My Saved Chain (gate)",
  description: "Saved from the action cart.",
  steps: [
    { actionId: "repair-vss-writers", params: {}, runIf: "always", haltOnFailure: false },
  ],
  defaultScope: "once",
  createdBy: "u-current",
};

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

/**
 * UserPlaybookAppears — regression gate: a playbook saved to the store (from the
 * action cart) must show in the library's "My playbooks", not just the seed.
 * Uncontrolled (no `playbooks` prop) so the component reads the merged store.
 */
export const UserPlaybookAppears: Story = {
  args: { grouped: true },
  decorators: [
    (Story) => {
      useUserPlaybooks.setState({ userPlaybooks: [USER_PB] });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(USER_PB.name)).toBeInTheDocument(),
    );
  },
};
