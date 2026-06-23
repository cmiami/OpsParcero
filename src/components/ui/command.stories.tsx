import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, within, userEvent } from "storybook/test";
import { Server, Cloud, Wrench, RefreshCw } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "./command";

const meta = {
  title: "Atoms/Command",
  component: Command,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Command>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {
  render: () => (
    <Command className="w-96 rounded-lg border border-border shadow-e2">
      <CommandInput placeholder="Search assets, issues, actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Assets">
          <CommandItem>
            <Server />
            btru-fs1
          </CommandItem>
          <CommandItem>
            <Cloud />
            jdoe@acme.onmicrosoft.com
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem>
            <RefreshCw />
            Force offsite sync
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Wrench />
            Force Diff Merge
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium"
      >
        Open command palette
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search assets, issues, actions…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Recovery">
            <CommandItem>
              <Server />
              Launch Recovery Launchpad — btru-hv2022
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

export const AsDialog: Story = {
  render: () => <DialogDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Open command palette"));
    const body = within(document.body);
    await expect(
      await body.findByPlaceholderText("Search assets, issues, actions…"),
    ).toBeInTheDocument();
  },
};
