import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { MoreHorizontal, RefreshCw, Wrench, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "./dropdown-menu";

const meta = {
  title: "Atoms/DropdownMenu",
  component: DropdownMenu,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof DropdownMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Asset actions"
        className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>btru-fs1 actions</DropdownMenuLabel>
        <DropdownMenuItem>
          <RefreshCw />
          Force offsite sync
          <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Wrench />
          Restart agent service
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Recovery Launchpad</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>On local device</DropdownMenuItem>
            <DropdownMenuItem>In Datto Cloud</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive">
          <Trash2 />
          Remove from protection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const WithSelections: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-md border border-border bg-card px-3 py-1.5 text-sm">
        View options
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked>Status</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>Last backup</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Offsite sync</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="status">
          <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="host">Host name</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const Opens: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Asset actions"));
    const body = within(document.body);
    await expect(
      await body.findByText("Force offsite sync"),
    ).toBeInTheDocument();
  },
};
