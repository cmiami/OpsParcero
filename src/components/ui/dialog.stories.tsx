import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "./dialog";

const meta = {
  title: "Atoms/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Launch recovery
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recovery Launchpad — btru-hv2022</DialogTitle>
          <DialogDescription>
            Boot recovery point 2026-06-22T02:00:00Z in the Datto Cloud. The
            source agent stays protected; this spins up an isolated copy.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-subtle p-3 text-sm">
          <p className="font-mono">8.0 TB · Inverse Chain verified</p>
        </div>
        <DialogFooter>
          <DialogClose className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium">
            Cancel
          </DialogClose>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Launch in Datto Cloud
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Opens: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Launch recovery"));
    const body = within(document.body);
    await expect(
      await body.findByText(/Recovery Launchpad/),
    ).toBeInTheDocument();
  },
};
