import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { BackupHealthCell } from "./backup-health-cell";
import type { BackupRun, RunState } from "@/types";

// Deterministic fixtures (BUILD-CONTRACT §4).
const BASE = Date.parse("2026-06-22T02:00:00Z");
const HOUR = 3_600_000;

function run(i: number, state: RunState): BackupRun {
  const startedAt = new Date(BASE - i * 6 * HOUR).toISOString();
  return {
    id: `run-${i}`,
    jobId: "job-btru-fs1-img",
    assetId: "asset-btru-fs1",
    startedAt,
    finishedAt: new Date(BASE - i * 6 * HOUR + 18 * 60_000).toISOString(),
    state,
    mode: "incremental",
  };
}

function series(states: RunState[]): BackupRun[] {
  return states.map((s, idx) => run(states.length - idx, s));
}

const LAST_GOOD = "2026-06-22T01:30:00Z";
const STALE_GOOD = "2026-06-18T03:00:00Z";

const meta = {
  title: "Molecules/BackupHealthCell",
  component: BackupHealthCell,
  tags: ["autodocs"],
  argTypes: {
    status: {
      control: "select",
      options: ["protected", "warning", "failed", "paused", "syncing", "offline"],
    },
    runs: { control: false },
    lastGoodBackupAt: { control: "text" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof BackupHealthCell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Protected: Story = {
  args: {
    status: "protected",
    lastGoodBackupAt: LAST_GOOD,
    runs: series(Array<RunState>(10).fill("success")),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Protected")).toBeInTheDocument();
  },
};

export const Failed: Story = {
  args: {
    status: "failed",
    lastGoodBackupAt: STALE_GOOD,
    runs: series([
      "success",
      "success",
      "failed",
      "failed",
      "failed",
      "failed",
    ]),
  },
};

export const MixedHistory: Story = {
  args: {
    status: "warning",
    lastGoodBackupAt: LAST_GOOD,
    runs: series([
      "success",
      "failed",
      "success",
      "stuck",
      "success",
      "success-crash-consistent",
      "success",
    ]),
  },
};

export const NeverRun: Story = {
  args: { status: "offline", runs: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Never run")).toBeInTheDocument();
  },
};
