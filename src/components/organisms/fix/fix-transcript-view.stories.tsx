import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { FixTranscriptView } from "./fix-transcript-view";
import type { FixTranscriptTurn } from "@/lib/fix-client";

// ─── A realistic, fully-resolved Guided/AI fix transcript (Datto BCDR) ────────
// Scenario: FS01-DC stopped its backup agent; the run inspects, plans, restarts,
// re-arms the schedule, and verifies a fresh snapshot fired.

const t = (min: number) =>
  new Date(Date.UTC(2026, 5, 22, 14, min, 0)).toISOString();

const resolved: FixTranscriptTurn[] = [
  {
    at: t(0),
    kind: "status",
    state: "triaging",
  },
  {
    at: t(0),
    kind: "model",
    text: "Triaging FS01-DC: the last successful Datto snapshot was 14 hours ago and the host is flagged 'Backup failed'. I'll start by reading the agent service state before changing anything.",
  },
  {
    at: t(1),
    kind: "observation",
    text: "Failure signature matches BCDR-AGENT-STOPPED (the Datto Backup Agent service is not running). This is a known, recoverable condition.",
  },
  {
    at: t(1),
    kind: "tool_call",
    toolCall: {
      id: "tc-read",
      name: "inspect_agent_service",
      input: { host: "FS01-DC", service: "DattoAgent" },
    },
  },
  {
    at: t(1),
    kind: "tool_result",
    toolResult: {
      ok: true,
      summary:
        "DattoAgent is Stopped (StartType Automatic). No snapshot has run since 00:12 UTC.",
      output: [
        "PS C:\\> Get-Service -Name DattoAgent | Select Status,StartType",
        "Status   StartType",
        "------   ---------",
        "Stopped  Automatic",
      ].join("\n"),
    },
  },
  {
    at: t(2),
    kind: "status",
    state: "planning",
  },
  {
    at: t(2),
    kind: "model",
    text: "Plan: restart the agent service, confirm it reaches Running, then re-arm the backup schedule and trigger an on-demand snapshot to confirm recovery. All steps are reversible.",
  },
  {
    at: t(3),
    kind: "status",
    state: "executing",
  },
  {
    at: t(3),
    kind: "tool_call",
    toolCall: {
      id: "tc-restart",
      name: "restart_backup_agent",
      input: { host: "FS01-DC", service: "DattoAgent", rearmSchedule: true },
    },
  },
  {
    at: t(3),
    kind: "tool_result",
    toolResult: {
      ok: true,
      summary:
        "Restarted DattoAgent and re-armed the backup schedule on FS01-DC.",
      output: [
        "PS C:\\> Restart-Service -Name DattoAgent -Force",
        "PS C:\\> Get-Service -Name DattoAgent",
        "Status   Name        DisplayName",
        "Running  DattoAgent  Datto Backup Agent",
      ].join("\n"),
      diff: {
        before: { serviceStatus: "Stopped", scheduleArmed: false },
        after: { serviceStatus: "Running", scheduleArmed: true },
        note: "Schedule re-armed; next snapshot fires within the hour.",
      },
    },
  },
  {
    at: t(4),
    kind: "status",
    state: "verifying",
  },
  {
    at: t(4),
    kind: "tool_call",
    toolCall: {
      id: "tc-verify",
      name: "trigger_snapshot",
      input: { host: "FS01-DC", onDemand: true },
    },
  },
  {
    at: t(5),
    kind: "tool_result",
    toolResult: {
      ok: true,
      summary:
        "On-demand snapshot completed and verified against the SIRIS appliance.",
      output: [
        "$ datto-cli snapshot run --agent FS01-DC --now",
        "Snapshot rp-2026-06-22T14:05Z queued…",
        "Transferred 2.1 GB · screenshot-verify PASS",
        "Done in 1m 58s.",
      ].join("\n"),
      diff: {
        before: { lastSnapshotAgeH: 14, verified: false },
        after: { lastSnapshotAgeH: 0, verified: true },
      },
      healed: true,
    },
  },
  {
    at: t(6),
    kind: "verification",
    text: "Recovery confirmed: a fresh, screenshot-verified recovery point now exists. FS01-DC returned to Protected.",
  },
  {
    at: t(6),
    kind: "status",
    state: "succeeded",
  },
];

const withApprovalGate: FixTranscriptTurn[] = [
  ...resolved.slice(0, 7),
  {
    at: t(2),
    kind: "status",
    state: "awaiting-approval",
  },
  {
    at: t(2),
    kind: "approval",
    text: "This run wants to restart the Datto Backup Agent on FS01-DC and re-arm the schedule (safe write, reversible). Approve to continue, or reject to hand off.",
  },
];

const escalated: FixTranscriptTurn[] = [
  ...resolved.slice(0, 6),
  {
    at: t(3),
    kind: "tool_call",
    toolCall: {
      id: "tc-restart-fail",
      name: "restart_backup_agent",
      input: { host: "FS01-DC", service: "DattoAgent" },
    },
  },
  {
    at: t(4),
    kind: "tool_result",
    toolResult: {
      ok: false,
      summary:
        "Restart failed: the service binary is missing (error 0x80070002). The Datto agent install appears corrupt — this needs a re-install on the host.",
      output: [
        "PS C:\\> Restart-Service -Name DattoAgent -Force",
        "Restart-Service : Cannot find path 'C:\\Program Files\\Datto\\agent.exe'.",
        "    + FullyQualifiedErrorId : 0x80070002",
      ].join("\n"),
      opensTicket: "KRC-48217",
    },
  },
  {
    at: t(5),
    kind: "model",
    text: "I can't recover this automatically — the agent binary is missing, which requires a re-install I'm not permitted to run unattended. I've assembled a support package and opened ticket KRC-48217 with everything I tried.",
  },
  {
    at: t(5),
    kind: "status",
    state: "escalated",
  },
];

const meta = {
  title: "Organisms/FixTranscriptView",
  component: FixTranscriptView,
  tags: ["autodocs"],
  argTypes: {
    streaming: { control: "boolean" },
    turns: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[40rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FixTranscriptView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Resolved: Story = {
  args: { turns: resolved, streaming: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The terminal status badge is present.
    await expect(canvas.getByText("Succeeded")).toBeInTheDocument();
    // A folded tool call surfaced its result summary.
    await expect(
      canvas.getByText(/re-armed the backup schedule/i),
    ).toBeInTheDocument();
  },
};

export const StreamingMidway: Story = {
  args: { turns: resolved.slice(0, 6), streaming: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Working…")).toBeInTheDocument();
  },
};

export const WithApprovalGate: Story = {
  args: { turns: withApprovalGate, streaming: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Awaiting approval")).toBeInTheDocument();
    await expect(canvas.getByText(/Approve to continue/i)).toBeInTheDocument();
  },
};

export const Escalated: Story = {
  args: { turns: escalated, streaming: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Escalated")).toBeInTheDocument();
    await expect(canvas.getByText("KRC-48217")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { turns: [], streaming: false },
};
