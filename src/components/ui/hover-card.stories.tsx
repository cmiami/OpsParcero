import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { Server } from "lucide-react";

import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "./hover-card";

const meta = {
  title: "Atoms/HoverCard",
  component: HoverCard,
  tags: ["autodocs"],
  argTypes: {
    openDelay: { control: { type: "number" } },
    closeDelay: { control: { type: "number" } },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof HoverCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { openDelay: 100, closeDelay: 100 },
  render: (args) => (
    <HoverCard {...args}>
      <HoverCardTrigger className="cursor-default rounded-sm font-mono text-sm text-primary underline-offset-2 hover:underline">
        btru-dr-ubt
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex items-start gap-3">
          <Server className="mt-0.5 size-4 text-product-bcdr" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold">btru-dr-ubt</p>
            <p className="text-sm text-muted-foreground">
              Agentless asset · SIRIS-NYC-01
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              8.0 TB · last backup 2026-06-22T03:00:00Z
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};

export const Opens: Story = {
  args: { openDelay: 0, closeDelay: 0 },
  render: Default.render,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByText("btru-dr-ubt"));
    const body = within(document.body);
    await expect(await body.findByText("Agentless asset · SIRIS-NYC-01")).toBeInTheDocument();
  },
};
