import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { RefreshCw } from "lucide-react";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./tooltip";

const meta = {
  title: "Atoms/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="rounded-md border border-border bg-card px-3 py-1.5 text-sm">
          Last screenshot verification
        </TooltipTrigger>
        <TooltipContent>Verified 2026-06-22T03:14:00Z on SIRIS-NYC-01</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};

export const IconTrigger: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          aria-label="Force offsite sync"
          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-primary"
        >
          <RefreshCw className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Force offsite sync to mothership.dtc.datto.com</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};

export const Opens: Story = {
  render: () => (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger className="rounded-md border border-border bg-card px-3 py-1.5 text-sm">
          btru-fs1
        </TooltipTrigger>
        <TooltipContent>Datto Windows Agent · 412 GB protected</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByText("btru-fs1"));
    // Radix renders the tooltip content twice (the visible portal + an sr-only
    // copy for aria-describedby) — assert at least one is present.
    const tips = await within(document.body).findAllByText(
      /Datto Windows Agent/,
    );
    await expect(tips.length).toBeGreaterThan(0);
  },
};
