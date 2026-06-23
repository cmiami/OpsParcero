import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { Last10DotStrip } from "./last10-dot-strip";
import type { BackupRun, RunState } from "@/types";

// Deterministic fixtures (BUILD-CONTRACT §4 — fixed ISO timestamps, no Date.now()).
const BASE = Date.parse("2026-06-22T02:00:00Z");
const HOUR = 3_600_000;

function run(i: number, state: RunState, opts: Partial<BackupRun> = {}): BackupRun {
  const startedAt = new Date(BASE - i * 6 * HOUR).toISOString();
  return {
    id: `run-${i}`,
    jobId: "job-btru-fs1-img",
    assetId: "asset-btru-fs1",
    startedAt,
    finishedAt: new Date(BASE - i * 6 * HOUR + 18 * 60_000).toISOString(),
    state,
    mode: "incremental",
    ...opts,
  };
}

function series(states: RunState[]): BackupRun[] {
  // newest last → reverse the index so the first listed reads as oldest.
  return states.map((s, idx) => run(states.length - idx, s));
}

const meta = {
  title: "Molecules/Last10DotStrip",
  component: Last10DotStrip,
  tags: ["autodocs"],
  argTypes: {
    max: { control: { type: "number", min: 1, max: 20 } },
    runs: { control: false },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Last10DotStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllGreen: Story = {
  args: { runs: series(Array<RunState>(10).fill("success")) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("10 of 10 backups succeeded."),
    ).toBeInTheDocument();
  },
};

export const MixedFailures: Story = {
  args: {
    runs: series([
      "success",
      "success",
      "failed",
      "success",
      "stuck",
      "success",
      "failed",
      "success",
      "success-crash-consistent",
      "success",
    ]),
  },
};

export const Partial: Story = {
  args: { runs: series(["success", "success", "failed", "success"]) },
};

export const Empty: Story = {
  args: { runs: [] },
};
