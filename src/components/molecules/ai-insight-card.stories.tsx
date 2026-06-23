import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AiInsightCard } from "./ai-insight-card";
import type { AiInsight } from "@/types";

const insight: AiInsight = {
  rootCause:
    "The Datto Windows Agent on btru-fs1 lost VSS writer state after a pending reboot, so incremental backups fall back to crash-consistent DBD and screenshot verification reports a cosmetic failure.",
  recommendation:
    "Restart the agent service and force a diff-merge, then verify the next backup. No reboot of the protected host is required.",
  confidencePct: 92,
};

const meta = {
  title: "Molecules/AiInsightCard",
  component: AiInsightCard,
  tags: ["autodocs"],
  argTypes: {
    insight: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-[30rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AiInsightCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { insight },
};

export const HighConfidence: Story = {
  args: {
    insight: {
      rootCause:
        "OAuth admin consent for the M365 tenant was revoked (AADSTS500014), halting Spanning SaaS sync for 23 seats.",
      recommendation:
        "Re-authorize OAuth with admin consent from admin@spanningdemo.com; sync resumes automatically within one cycle.",
      confidencePct: 98,
    },
  },
};

export const WithRationale: Story = {
  args: {
    insight: {
      ...insight,
      confidencePct: 74,
      classificationRationale:
        "Classified as a Guided fix: the restart is automated, but verifying the next backup requires a human to confirm the result.",
    },
  },
};
