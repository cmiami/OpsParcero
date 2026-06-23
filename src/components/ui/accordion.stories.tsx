import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./accordion";

const meta = {
  title: "Atoms/Accordion",
  component: Accordion,
  tags: ["autodocs"],
  argTypes: {
    type: { control: "select", options: ["single", "multiple"] },
  },
  args: { type: "single", collapsible: true },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Accordion>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-96">
      <AccordionItem value="root-cause">
        <AccordionTrigger>Root cause</AccordionTrigger>
        <AccordionContent>
          VSS writer timeout on btru-hv2022 prevented the diff-merge from
          completing within the backup window.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="we-steps">
        <AccordionTrigger>What we will do</AccordionTrigger>
        <AccordionContent>
          Force Diff Merge and re-run screenshot verification on the latest
          recovery point.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="you-steps">
        <AccordionTrigger>What you should do</AccordionTrigger>
        <AccordionContent>
          Confirm the agent service is running on btru-hv2022 before the next
          scheduled run.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" className="w-96">
      <AccordionItem value="a">
        <AccordionTrigger>Spanning (M365)</AccordionTrigger>
        <AccordionContent>OAuth re-authorization required.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="b">
        <AccordionTrigger>Datto BCDR</AccordionTrigger>
        <AccordionContent>Inverse Chain healthy.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const ExpandItem: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-96">
      <AccordionItem value="root-cause">
        <AccordionTrigger>Root cause</AccordionTrigger>
        <AccordionContent>VSS writer timeout on btru-hv2022.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Root cause" });
    await expect(trigger).toHaveAttribute("data-state", "closed");
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("data-state", "open");
    await expect(
      canvas.getByText("VSS writer timeout on btru-hv2022."),
    ).toBeVisible();
  },
};
