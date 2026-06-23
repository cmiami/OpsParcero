import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { BackupDotStrip, type BackupDotRun } from "./backup-dot-strip";

// Fixed timestamps relative to format NOW = 2026-06-22T14:00:00Z (deterministic).
const T = (h: number): string =>
  new Date(Date.parse("2026-06-22T14:00:00Z") - h * 3_600_000).toISOString();

const healthy: BackupDotRun[] = Array.from({ length: 10 }, (_, i) => ({
  state: "success",
  at: T((10 - i) * 12),
}));

const flapping: BackupDotRun[] = [
  { state: "success", at: T(120) },
  { state: "success", at: T(108) },
  { state: "failed", at: T(96) },
  { state: "success", at: T(84) },
  { state: "failed", at: T(72) },
  { state: "success", at: T(60) },
  { state: "skipped", at: T(48) },
  { state: "success", at: T(36) },
  { state: "failed", at: T(24) },
  { state: "running", at: T(0) },
];

const allFailed: BackupDotRun[] = Array.from({ length: 10 }, (_, i) => ({
  state: "failed",
  at: T((10 - i) * 6),
}));

const cosmeticTail: BackupDotRun[] = [
  ...Array.from({ length: 6 }, (_, i) => ({
    state: "success" as const,
    at: T((10 - i) * 8),
  })),
  { state: "failed", isCosmetic: true, at: T(16) },
  { state: "failed", isCosmetic: true, at: T(12) },
  { state: "failed", isCosmetic: true, at: T(8) },
  { state: "success", at: T(0) },
];

const meta = {
  title: "Atoms/BackupDotStrip",
  component: BackupDotStrip,
  tags: ["autodocs"],
  argTypes: {
    max: { control: { type: "number", min: 1, max: 20 } },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof BackupDotStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  args: { runs: healthy },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("group", { name: "Last 10 backups" })).toBeInTheDocument();
  },
};

export const Flapping: Story = { args: { runs: flapping } };

export const AllFailed: Story = { args: { runs: allFailed } };

export const CosmeticTail: Story = { args: { runs: cosmeticTail } };

export const Padded: Story = {
  args: { runs: flapping.slice(-4) },
};
