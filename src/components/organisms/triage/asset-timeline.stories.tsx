import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AssetTimeline, type TimelineEvent } from "./asset-timeline";

const sparse: TimelineEvent[] = [
  {
    id: "s-1",
    kind: "run-success",
    at: "2026-06-22T02:00:00Z",
    title: "Backup succeeded",
    detail: "Incremental · 25 Mbps · 412 GB",
  },
  {
    id: "s-2",
    kind: "config-change",
    at: "2026-06-18T09:12:00Z",
    title: "Retention changed 30d → 14d",
  },
];

const meta = {
  title: "Organisms/AssetTimeline",
  component: AssetTimeline,
  tags: ["autodocs"],
  argTypes: {
    failureFocused: { control: "boolean" },
    events: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AssetTimeline>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Mixed — the default run / update / remediation / verification mix. */
export const Mixed: Story = { args: {} };

/** FailureFocused — successes dimmed to spotlight the break. */
export const FailureFocused: Story = { args: { failureFocused: true } };

/** Sparse — a freshly-onboarded asset with few events. */
export const Sparse: Story = { args: { events: sparse } };
