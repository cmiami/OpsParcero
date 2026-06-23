import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { ToolCallCard } from "./tool-call-card";
import type { ToolResult } from "@/lib/fix-client";

// ─── Realistic Datto/Kaseya tool-call fixtures (no competitor names) ──────────

const readResult: ToolResult = {
  ok: true,
  summary:
    "Read the agent service state on FS01-DC. The Datto agent service is stopped; last successful snapshot was 14h ago.",
  output: [
    "PS C:\\> Get-Service -Name DattoAgent | Select-Object Status,StartType",
    "",
    "Status   StartType",
    "------   ---------",
    "Stopped  Automatic",
  ].join("\n"),
};

const safeWriteResult: ToolResult = {
  ok: true,
  summary:
    "Restarted the Datto agent service and re-armed the backup schedule on FS01-DC.",
  output: [
    "PS C:\\> Restart-Service -Name DattoAgent -Force",
    "PS C:\\> Get-Service -Name DattoAgent",
    "",
    "Status   Name        DisplayName",
    "------   ----        -----------",
    "Running  DattoAgent  Datto Backup Agent",
  ].join("\n"),
  diff: {
    before: { serviceStatus: "Stopped", scheduleArmed: false, lastSnapshotAgeH: 14 },
    after: { serviceStatus: "Running", scheduleArmed: true, lastSnapshotAgeH: 0 },
    note: "Schedule re-armed; next snapshot fires within the hour.",
  },
  healed: true,
};

const destructiveResult: ToolResult = {
  ok: true,
  summary:
    "Purged the corrupt local snapshot chain on the SIRIS appliance and forced a fresh base image. This deletes 11 incremental recovery points.",
  output: [
    "$ datto-cli chain purge --agent FS01-DC --confirm",
    "Purging 11 incrementals (corrupt parent 0x8004231F)…",
    "Base image rebuild queued.",
    "Done in 3m 42s.",
  ].join("\n"),
  diff: {
    before: { chainState: "corrupt", recoveryPoints: 11, baseImage: "stale" },
    after: { chainState: "rebuilding", recoveryPoints: 0, baseImage: "fresh" },
    note: "Recovery points removed are not reversible; verified replication target first.",
  },
};

const dryRunResult: ToolResult = {
  ok: true,
  summary:
    "Dry run: would restore the M365 mailbox 'a.reyes@northwind.example' from the 2026-06-21 03:00 UTC point. No mutation performed.",
  output: [
    "POST /v2/spanning/restore (dry-run)",
    "  source: backup://m365/northwind/a.reyes/2026-06-21T03:00Z",
    "  target: mailbox a.reyes@northwind.example",
    "  items: 4,812 messages · 9 folders",
    "  result: PLAN OK (no changes applied)",
  ].join("\n"),
  diff: {
    before: { mailboxItems: 0, restorePoint: "—" },
    after: { mailboxItems: 4812, restorePoint: "2026-06-21T03:00Z" },
    note: "Preview only — apply to execute the restore.",
  },
};

const meta = {
  title: "Organisms/ToolCallCard",
  component: ToolCallCard,
  tags: ["autodocs"],
  argTypes: {
    risk: {
      control: "inline-radio",
      options: ["read", "safe-write", "destructive"],
    },
    dryRun: { control: "boolean" },
    reversible: { control: "boolean" },
    defaultOpen: { control: "boolean" },
    turn: { table: { disable: true } },
    call: { table: { disable: true } },
    result: { table: { disable: true } },
  },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[34rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ToolCallCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Read: Story = {
  args: {
    risk: "read",
    reversible: true,
    call: {
      id: "tc-1",
      name: "inspect_agent_service",
      input: { host: "FS01-DC", service: "DattoAgent" },
    },
    result: readResult,
  },
};

export const SafeWrite: Story = {
  args: {
    risk: "safe-write",
    reversible: true,
    call: {
      id: "tc-2",
      name: "restart_backup_agent",
      input: { host: "FS01-DC", service: "DattoAgent", rearmSchedule: true },
    },
    result: safeWriteResult,
  },
};

export const Destructive: Story = {
  args: {
    risk: "destructive",
    reversible: false,
    call: {
      id: "tc-3",
      name: "purge_corrupt_chain",
      input: { agent: "FS01-DC", confirm: true },
    },
    result: destructiveResult,
  },
};

export const DryRun: Story = {
  args: {
    risk: "safe-write",
    dryRun: true,
    reversible: true,
    call: {
      id: "tc-4",
      name: "restore_m365_mailbox",
      input: {
        mailbox: "a.reyes@northwind.example",
        point: "2026-06-21T03:00Z",
      },
    },
    result: dryRunResult,
  },
};

export const WithDiff: Story = {
  args: {
    risk: "safe-write",
    reversible: true,
    defaultOpen: true,
    call: {
      id: "tc-5",
      name: "restart_backup_agent",
      input: { host: "FS01-DC", service: "DattoAgent", rearmSchedule: true },
    },
    result: safeWriteResult,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Diff table renders the changed serviceStatus.
    await expect(canvas.getByText("serviceStatus")).toBeInTheDocument();
    await expect(canvas.getByText("Running")).toBeInTheDocument();
    // Console output starts expanded.
    await expect(
      canvas.getByText(/Datto Backup Agent/),
    ).toBeInTheDocument();
    // Collapse it.
    const toggle = canvas.getByRole("button", { name: /console output/i });
    await userEvent.click(toggle);
  },
};
