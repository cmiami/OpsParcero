import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { SummaryCard } from "./summary-card";

const meta = {
  title: "Molecules/SummaryCard",
  component: SummaryCard,
  tags: ["autodocs"],
  argTypes: {
    tone: {
      control: "select",
      options: ["default", "critical", "success", "ai"],
    },
    label: { control: "text" },
    sublabel: { control: "text" },
    onClick: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-60">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SummaryCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TopProblem: Story = {
  args: {
    label: "Top problem",
    value: "Diff-merge stalled",
    sublabel: "23 agents · Storage/ZFS",
    tone: "default",
    onClick: fn(),
  },
  // Interactive: an onClick card renders as a keyboard-operable button and
  // drills through — clicking it fires onClick.
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const OpenIssues: Story = {
  args: {
    label: "Open issues",
    value: 17,
    sublabel: "across 4 clients",
    tone: "default",
    onClick: fn(),
  },
};

export const Critical: Story = {
  args: {
    label: "Critical",
    value: 5,
    sublabel: "need attention now",
    tone: "critical",
    onClick: fn(),
  },
};

export const EndToEndFixable: Story = {
  args: {
    label: "End-to-end fixable",
    value: 9,
    sublabel: "one-click remediation",
    tone: "success",
    onClick: fn(),
  },
};

export const AiTone: Story = {
  args: {
    label: "AI-explained",
    value: 12,
    sublabel: "root cause identified",
    tone: "ai",
    onClick: fn(),
  },
};

export const Static: Story = {
  args: {
    label: "Total assets",
    value: "1,284",
    sublabel: "protected fleet-wide",
    tone: "default",
  },
};
