import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { SlidersHorizontal } from "lucide-react";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "./popover";

const meta = {
  title: "Atoms/Popover",
  component: Popover,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Popover>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
        <SlidersHorizontal className="size-4" />
        Retention policy
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">Apply retention policy</p>
          <p className="text-sm text-muted-foreground">
            Keep daily recovery points for 30 days, weekly for 12 weeks on
            SIRIS-NYC-01.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const IconTrigger: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger
        aria-label="Column settings"
        className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
      >
        <SlidersHorizontal className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end">
        <p className="text-sm text-muted-foreground">
          Toggle columns: Host, Status, Last backup, Offsite sync.
        </p>
      </PopoverContent>
    </Popover>
  ),
};

export const Opens: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Retention policy"));
    const body = within(document.body);
    await expect(
      await body.findByText("Apply retention policy"),
    ).toBeInTheDocument();
  },
};
