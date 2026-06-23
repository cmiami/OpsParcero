import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { AiFixConsole } from "./ai-fix-console";
import { SimFixClient } from "@/lib/fix-client";
import type {
  FixClient,
  FixSessionEvent,
  FixSessionHandle,
  FixModelOption,
  FixSession,
  FixTranscriptTurn,
  ToolResult,
} from "@/lib/fix-client";
import { getIssues, getAsset, getAssets } from "@/mock/query";
import type { ProtectedAsset, Issue } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Seeded, deterministic asset + issue (offline) — a BCDR VSS-writer failure, the
// canonical AI-fix example from docs/fix-engine/06-ai-fix-ux.md.
// ─────────────────────────────────────────────────────────────────────────────

const issues = getIssues();
const issue: Issue =
  issues.find((i) => i.productBucket === "bcdr" && i.fixType === "full") ??
  issues.find((i) => i.fixType === "full") ??
  issues[0];
const asset: ProtectedAsset =
  getAsset(issue.impactedAssetIds[0]) ?? getAssets().items[0];

const insightsIssue: Issue =
  issues.find((i) => i.fixType === "manual" || i.fixType === "external") ?? issue;
const insightsAsset: ProtectedAsset =
  getAsset(insightsIssue.impactedAssetIds[0]) ?? asset;

// ─────────────────────────────────────────────────────────────────────────────
// ScriptedFixClient — an offline FixClient test double that yields a fixed event
// sequence so a story can pin a single FixState (awaiting-approval / succeeded /
// escalated). It implements the SAME FixClient contract the console consumes, so
// the consumer code path is identical to the live engine and the real Sim. The
// `Streaming` story below uses the real SimFixClient for true engine parity.
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_MODEL: FixModelOption = {
  id: "mock-opus",
  provider: "mock",
  label: "Resolution Center · Mock agent",
  contextWindow: 200_000,
  supportsTools: true,
  local: true,
};

const now = (offsetS: number) =>
  new Date(Date.UTC(2026, 5, 22, 4, 12, offsetS)).toISOString();

const turn = (t: Partial<FixTranscriptTurn>): FixTranscriptTurn => ({
  at: now(0),
  kind: "status",
  ...t,
});

const okResult = (over: Partial<ToolResult>): ToolResult => ({
  ok: true,
  summary: "",
  output: "",
  ...over,
});

/** A FixClient that replays a scripted event list and pauses at gates. */
class ScriptedFixClient implements FixClient {
  readonly kind = "sim" as const;
  /** When true, stop after emitting the approval-request and await approve(). */
  private gateOpen = false;

  constructor(
    private readonly script: FixSessionEvent[],
    private readonly opts: { pauseAtGate?: boolean } = {},
  ) {}

  async listModels(): Promise<FixModelOption[]> {
    return [MOCK_MODEL];
  }

  async createSession(): Promise<FixSessionHandle> {
    const id = "fix-story-scripted";
    const placeholder = { id, state: "triaging" } as unknown as FixSession;
    return {
      id,
      session: placeholder,
      stream: () => this.stream(),
      approve: async () => {
        this.gateOpen = false;
      },
      abort: async () => {
        this.gateOpen = false;
      },
    };
  }

  async *stream(): AsyncIterable<FixSessionEvent> {
    for (const ev of this.script) {
      yield ev;
      if (ev.type === "approval-request" && this.opts.pauseAtGate) {
        this.gateOpen = true;
        // Hold here so the story stays pinned in awaiting-approval. The console
        // shows the live Approve/Reject controls until the human acts.
        while (this.gateOpen) {
          await new Promise((r) => setTimeout(r, 120));
        }
      }
    }
  }

  async approve(): Promise<void> {
    this.gateOpen = false;
  }

  async abort(): Promise<void> {
    this.gateOpen = false;
  }
}

// Shared opening: triage reads, then a confident plan.
const triageScript: FixSessionEvent[] = [
  { type: "state", state: "triaging" },
  {
    type: "turn",
    turn: turn({
      at: now(3),
      kind: "model",
      text: "The last four backups are crash-consistent. The Windows update at 02:14 lines up with the first VSS failure. I'll inspect the VSS writers before acting.",
    }),
  },
  {
    type: "turn",
    turn: turn({
      at: now(4),
      kind: "tool_call",
      toolCall: {
        id: "tc-1",
        name: "get_vss_writers",
        input: { host: asset.displayName },
      },
    }),
  },
  {
    type: "turn",
    turn: turn({
      at: now(4),
      kind: "tool_result",
      toolResult: okResult({
        summary: "VSS writer 'SqlServerWriter' = FAILED (retryable)",
        output:
          "Writer name: 'SqlServerWriter'\n  State: [9] Failed\n  Last error: Retryable error",
      }),
    }),
  },
  { type: "state", state: "planning" },
  {
    type: "plan",
    plan: {
      summary:
        "Reset the VSS writers and retry the backup, then verify the next recovery point is application-consistent.",
      rationale:
        "SqlServerWriter is failed-retryable after the OS update; a writer reset clears the state.",
      confidencePct: 86,
      steps: [],
    },
  },
];

const succeededScript: FixSessionEvent[] = [
  ...triageScript,
  { type: "state", state: "executing" },
  {
    type: "turn",
    turn: turn({
      at: now(20),
      kind: "tool_call",
      toolCall: {
        id: "tc-2",
        name: "reset_vss_writers",
        input: { host: asset.displayName, retry: true },
      },
    }),
  },
  {
    type: "turn",
    turn: turn({
      at: now(58),
      kind: "tool_result",
      toolResult: okResult({
        summary: "VSS writers reset; backup re-queued.",
        output: "Stopping VSS... ok\nRestarting writers... ok\nRe-queued backup job.",
        diff: {
          before: { "writers.SqlServer": "FAILED", "services.VSS": "Running" },
          after: { "writers.SqlServer": "STABLE", "services.VSS": "Running" },
        },
      }),
    }),
  },
  { type: "state", state: "verifying" },
  {
    type: "turn",
    turn: turn({
      at: now(59),
      kind: "verification",
      text: "Re-ran get_backup_chain → next backup is application-consistent.",
    }),
  },
  { type: "state", state: "succeeded" },
  {
    type: "done",
    session: {
      id: "fix-story-scripted",
      state: "succeeded",
    } as unknown as FixSession,
  },
];

const approvalScript: FixSessionEvent[] = [
  ...triageScript,
  { type: "state", state: "executing" },
  {
    type: "approval-request",
    step: {
      id: "step-roll-back",
      intent: "Roll the agent back to the last known-good version",
      toolName: "rollback_agent_version",
      input: { host: asset.displayName, toVersion: "5.18.2" },
      actor: "we",
      risk: "destructive",
      requiresApproval: true,
    },
  },
];

const escalatedScript: FixSessionEvent[] = [
  { type: "state", state: "triaging" },
  {
    type: "turn",
    turn: turn({
      at: now(2),
      kind: "model",
      text: "The OAuth consent for this tenant expired on 2026-05-30. I'll confirm the grant and seat impact before attempting a fix.",
    }),
  },
  {
    type: "turn",
    turn: turn({
      at: now(3),
      kind: "tool_call",
      toolCall: { id: "tc-1", name: "get_oauth_grant", input: { tenant: "acme" } },
    }),
  },
  {
    type: "turn",
    turn: turn({
      at: now(3),
      kind: "tool_result",
      toolResult: okResult({
        summary: "Consent expired 2026-05-30 (EWS→Graph migration).",
        output: "grant.status = EXPIRED\nscopes = mail.read, files.read",
      }),
    }),
  },
  {
    type: "turn",
    turn: turn({
      at: now(5),
      kind: "tool_call",
      toolCall: { id: "tc-2", name: "get_tenant_seats", input: { tenant: "acme" } },
    }),
  },
  {
    type: "turn",
    turn: turn({
      at: now(5),
      kind: "tool_result",
      toolResult: okResult({ summary: "7 seats blocked by the expired grant." }),
    }),
  },
  { type: "state", state: "executing" },
  {
    type: "turn",
    turn: turn({
      at: now(8),
      kind: "tool_call",
      toolCall: { id: "tc-3", name: "reissue_consent", input: { tenant: "acme" } },
    }),
  },
  {
    type: "turn",
    turn: turn({
      at: now(9),
      kind: "tool_result",
      toolResult: {
        ok: false,
        summary:
          "BLOCKED: requires admin consent in the vendor portal — a 'You' step I can't perform.",
        output: "HTTP 403 admin_consent_required",
        opensTicket: "INC-48217",
      },
    }),
  },
  { type: "state", state: "escalated" },
  {
    type: "done",
    session: {
      id: "fix-story-scripted",
      state: "escalated",
    } as unknown as FixSession,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

const meta = {
  title: "Organisms/Fix/AiFixConsole",
  component: AiFixConsole,
  tags: ["autodocs"],
  argTypes: {
    asset: { table: { disable: true } },
    issue: { table: { disable: true } },
    client: { table: { disable: true } },
    onSwitchToGuided: { table: { disable: true } },
  },
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "The autonomous “Fix with AI” surface — the only new purple surface in M4. A ModelPicker + run button open an AI session on the FixClient; the console streams the agent's reasoning, ToolCallCards, and verification, carries a live state badge (dot + icon + text), pins Approve/Reject at gates, exposes Abort, and renders an EscalationPanel on a failed/escalated/halted terminal. Purple (`ai*` tokens) is confined to this surface.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[34rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AiFixConsole>;
export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────────────────────────

/** Idle — pre-run. The ModelPicker + the purple "Fix with AI" run button. */
export const Idle: Story = {
  args: {
    asset,
    issue,
    client: new ScriptedFixClient(succeededScript),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The AI identity + run affordance are present; nothing has streamed yet.
    await expect(
      canvas.getByRole("button", { name: /Fix with AI/i }),
    ).toBeInTheDocument();
  },
};

/**
 * Streaming — driven by the REAL offline SimFixClient (the engine's Mock loop in
 * the browser) for true parity. Clicking "Fix with AI" streams live turns.
 */
export const Streaming: Story = {
  args: {
    asset,
    issue,
    client: new SimFixClient(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const run = await canvas.findByRole("button", { name: /Fix with AI/i });
    await userEvent.click(run);
    // A live status region appears once streaming begins.
    await waitFor(() => expect(canvas.getAllByRole("status").length).toBeGreaterThan(0), {
      timeout: 4000,
    });
  },
};

/**
 * AwaitingApproval — the scripted loop pauses at a destructive gate. The console
 * pins the Approve / Reject controls; the badge reads "Awaiting approval".
 */
export const AwaitingApproval: Story = {
  args: {
    asset,
    issue,
    client: new ScriptedFixClient(approvalScript, { pauseAtGate: true }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /Fix with AI/i }),
    );
    await waitFor(
      () =>
        expect(
          canvas.getByRole("button", { name: /^Approve$/i }),
        ).toBeInTheDocument(),
      { timeout: 4000 },
    );
    // Status is text, not color-only.
    await expect(canvas.getByText(/Awaiting approval/i)).toBeInTheDocument();
  },
};

/** Succeeded — the agent applied the fix and verification confirmed the heal. */
export const Succeeded: Story = {
  args: {
    asset,
    issue,
    client: new ScriptedFixClient(succeededScript),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /Fix with AI/i }),
    );
    await waitFor(
      () => expect(canvas.getByText(/Resolved/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );
  },
};

/**
 * Escalated — the agent hit a "You" step it can't perform (vendor-portal admin
 * consent). The EscalationPanel shows what it tried + a hand-to-a-human CTA.
 */
export const Escalated: Story = {
  args: {
    asset: insightsAsset,
    issue: insightsIssue,
    client: new ScriptedFixClient(escalatedScript),
    onSwitchToGuided: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /Fix with AI/i }),
    );
    await waitFor(
      () =>
        expect(
          canvas.getByRole("button", { name: /Assemble support package/i }),
        ).toBeInTheDocument(),
      { timeout: 4000 },
    );
    await expect(canvas.getByLabelText(/Escalation/i)).toBeInTheDocument();
  },
};
