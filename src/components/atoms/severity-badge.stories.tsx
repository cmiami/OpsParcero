import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { SeverityBadge } from "./severity-badge";
import type { Severity } from "@/types";

const SEVERITIES: Severity[] = ["critical", "warning", "info", "success"];

const meta = {
  title: "Atoms/SeverityBadge",
  component: SeverityBadge,
  tags: ["autodocs"],
  argTypes: {
    severity: { control: "select", options: SEVERITIES },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof SeverityBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Critical: Story = {
  args: { severity: "critical" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Critical")).toBeInTheDocument();
  },
};
export const Warning: Story = { args: { severity: "warning" } };
export const Info: Story = { args: { severity: "info" } };
export const Success: Story = { args: { severity: "success" } };

export const AllSeverities: Story = {
  args: { severity: "critical" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {SEVERITIES.map((s) => (
        <SeverityBadge key={s} severity={s} />
      ))}
    </div>
  ),
};
