import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import * as React from "react";

import { CommandPalette } from "./command-palette";
import { Button } from "@/components/ui/button";

/**
 * The palette is controllable. Stories drive it with local state so each one can
 * pin a deterministic open/closed condition for the docs and play functions.
 */
function Harness({
  initialOpen = false,
}: {
  initialOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(initialOpen);
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Button onClick={() => setOpen(true)}>Open palette (f / ⌘K)</Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}

const meta = {
  title: "Organisms/CommandPalette",
  component: CommandPalette,
  tags: ["autodocs"],
  argTypes: {
    open: { control: "boolean" },
    onOpenChange: { action: "openChange" },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CommandPalette>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  render: () => <Harness initialOpen={false} />,
};

export const OpenEmpty: Story = {
  render: () => <Harness initialOpen />,
};

export const Results: Story = {
  render: () => <Harness initialOpen />,
};

export const NoResults: Story = {
  render: () => <Harness initialOpen />,
  play: async ({ canvasElement }) => {
    const screen = within(document.body);
    const input = await screen.findByPlaceholderText(/search assets/i);
    await userEvent.type(input, "zzzzznotathing");
    await waitFor(() =>
      expect(screen.getByText(/no results found/i)).toBeVisible(),
    );
    void canvasElement;
  },
};

export const OpenAndType: Story = {
  render: () => <Harness initialOpen={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /open palette/i }));
    const screen = within(document.body);
    const input = await screen.findByPlaceholderText(/search assets/i);
    await userEvent.type(input, "back");
    await waitFor(() => expect(input).toHaveValue("back"));
  },
};

/**
 * FindsPolicy — regression gate for #13: the palette now has a Policies group
 * (and tenant scope + heal overlay + user playbooks). A seeded policy name is
 * only reachable through that new group, so finding it proves it renders.
 */
export const FindsPolicy: Story = {
  render: () => <Harness initialOpen />,
  play: async () => {
    const screen = within(document.body);
    const input = await screen.findByPlaceholderText(/search assets/i);
    await userEvent.type(input, "Auto-repair agent comms");
    await waitFor(() =>
      expect(
        screen.getByText(/Auto-repair agent comms/i),
      ).toBeInTheDocument(),
    );
  },
};
