import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RunHistoryTable } from "./run-history-table";
import { getActionRuns } from "@/mock/query";

const ALL = getActionRuns();
const WITH_FAILURES = ALL.filter(
  (r) => r.state === "failed" || r.state === "partial" || r.state === "rolled-back",
);
const ALL_SUCCESS = ALL.filter((r) => r.state === "succeeded");

const meta = {
  title: "Organisms/RunHistoryTable",
  component: RunHistoryTable,
  tags: ["autodocs"],
  argTypes: {
    density: { control: "inline-radio", options: ["default", "compact"] },
    runs: { control: false },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RunHistoryTable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithFailures: Story = {
  args: { runs: WITH_FAILURES.length > 0 ? WITH_FAILURES : ALL },
};

export const AllSuccess: Story = {
  args: { runs: ALL_SUCCESS.length > 0 ? ALL_SUCCESS : ALL.slice(0, 5) },
};

export const Empty: Story = {
  args: { runs: [] },
};
