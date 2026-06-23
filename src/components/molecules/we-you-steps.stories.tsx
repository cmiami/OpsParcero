import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WeYouSteps } from "./we-you-steps";
import type { RunbookStep } from "@/types";

const weSteps: RunbookStep[] = [
  {
    actor: "we",
    text: "Restart the Datto Windows Agent service on the protected host.",
    actionId: "restart-agent-service",
  },
  {
    actor: "we",
    text: "Force a diff-merge to repair the inverse chain.",
    actionId: "force-retention",
  },
];

const youSteps: RunbookStep[] = [
  {
    actor: "you",
    text: "Re-authorize OAuth with admin consent from admin@spanningdemo.com.",
    actionId: "reauthorize-oauth",
  },
  {
    actor: "you",
    text: "Confirm the next backup succeeds, then close the issue.",
  },
];

const meta = {
  title: "Molecules/WeYouSteps",
  component: WeYouSteps,
  tags: ["autodocs"],
  argTypes: {
    weSteps: { table: { disable: true } },
    youSteps: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-[42rem] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WeYouSteps>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BothSteps: Story = {
  args: { weSteps, youSteps },
};

export const WeOnly: Story = {
  name: "WeOnly (End-to-end)",
  args: { weSteps, youSteps: [] },
};

export const YouOnly: Story = {
  name: "YouOnly (Insights)",
  args: { weSteps: [], youSteps },
};
