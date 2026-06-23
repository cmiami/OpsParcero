import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";

import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "./sheet";

const meta = {
  title: "Atoms/Sheet",
  component: Sheet,
  tags: ["autodocs"],
  argTypes: {
    children: { control: false },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ side }: { side: "top" | "right" | "bottom" | "left" }) {
  return (
    <Sheet>
      <SheetTrigger className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium">
        Asset details
      </SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>btru-erp1</SheetTitle>
          <SheetDescription>
            Datto Windows Agent on SIRIS-NYC-01 (model S5-4)
          </SheetDescription>
        </SheetHeader>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="text-muted-foreground">Protected</dt>
          <dd className="font-mono">1.2 TB</dd>
          <dt className="text-muted-foreground">Last backup</dt>
          <dd className="font-mono">2026-06-22T03:00:00Z</dd>
          <dt className="text-muted-foreground">Offsite sync</dt>
          <dd className="font-mono">25 Mbps</dd>
        </dl>
        <SheetFooter>
          <SheetClose className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium">
            Close
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export const Right: Story = { render: () => <Demo side="right" /> };
export const Left: Story = { render: () => <Demo side="left" /> };
export const Top: Story = { render: () => <Demo side="top" /> };
export const Bottom: Story = { render: () => <Demo side="bottom" /> };

export const Opens: Story = {
  render: () => <Demo side="right" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Asset details"));
    const body = within(document.body);
    await expect(await body.findByText("btru-erp1")).toBeInTheDocument();
  },
};
