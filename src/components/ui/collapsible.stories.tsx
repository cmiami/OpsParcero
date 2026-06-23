import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { ChevronsUpDown } from "lucide-react";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "./collapsible";

const meta = {
  title: "Atoms/Collapsible",
  component: Collapsible,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Collapsible>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Collapsible className="w-80 rounded-lg border border-border p-3">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Affected assets (3)
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p className="font-mono">btru-fs1</p>
        <p className="font-mono">btru-hv2022</p>
        <p className="font-mono">ACME-DC01</p>
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const Toggle: Story = {
  render: () => (
    <Collapsible className="w-80">
      <CollapsibleTrigger className="text-sm font-medium">
        Show details
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 text-xs text-muted-foreground">
        Force offsite sync to mothership.dtc.datto.com.
      </CollapsibleContent>
    </Collapsible>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Show details" });
    await expect(trigger).toHaveAttribute("data-state", "closed");
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("data-state", "open");
    await expect(
      canvas.getByText("Force offsite sync to mothership.dtc.datto.com."),
    ).toBeVisible();
  },
};
