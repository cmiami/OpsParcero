import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, userEvent } from "storybook/test";
import { AiBadge, AiButton } from "./ai-badge";

const meta = {
  title: "Atoms/AiBadge",
  component: AiBadge,
  tags: ["autodocs"],
  argTypes: {
    children: { control: "text" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AiBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: "AI" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("AI")).toBeInTheDocument();
  },
};

export const Insight: Story = { args: { children: "AI insight" } };

export const AsButton: Story = {
  args: {},
  render: () => <AiButton onClick={fn()}>Explain root cause</AiButton>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole("button", { name: "Explain root cause" });
    await userEvent.click(btn);
    await expect(btn).toBeInTheDocument();
  },
};

export const IconOnlyButton: Story = {
  args: {},
  render: () => (
    <AiButton aria-label="Ask AI" onClick={fn()}>
      <span className="sr-only">Ask AI</span>
    </AiButton>
  ),
};

export const Together: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-3">
      <AiBadge />
      <AiButton onClick={fn()}>Ask AI</AiButton>
    </div>
  ),
};
