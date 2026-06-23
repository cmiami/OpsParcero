import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";

import { Textarea } from "./textarea";

const meta = {
  title: "Atoms/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  argTypes: {
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    rows: { control: "number" },
  },
  args: {
    placeholder: "Add a note for the approval request…",
    "aria-label": "Approval note",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Textarea>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = {
  args: {
    defaultValue:
      "Forced diff-merge on btru-fs1 to clear the stalled inverse chain before next backup window.",
  },
};
export const Disabled: Story = { args: { disabled: true, value: "Read-only audit note" } };

export const TypeInteraction: Story = {
  args: { "aria-label": "Remediation note" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const area = canvas.getByRole("textbox", { name: "Remediation note" });
    await userEvent.type(area, "Re-authorize OAuth admin consent");
    await expect(area).toHaveValue("Re-authorize OAuth admin consent");
  },
};
