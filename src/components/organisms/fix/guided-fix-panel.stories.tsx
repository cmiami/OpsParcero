import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { GuidedFixPanel } from "./guided-fix-panel";
import type {
  FixClient,
  FixModelOption,
  FixSessionEvent,
  FixSessionHandle,
  FixSession,
  FixPlan,
  FixTranscriptTurn,
  ToolResult,
} from "@/lib/fix-client";
import { getAssets, getIssues } from "@/mock/query";

// ── Real fixtures so the panel reads like the product ────────────────────────
const ASSET = getAssets().items[0];
const ISSUE = getIssues()[0];

const MOCK_MODEL: FixModelOption = {
  id: "mock-fixer-1",
  provider: "mock",
  label: "Mock Fixer (deterministic)",
  contextWindow: 200_000,
  supportsTools: true,
  local: true,
};

const PLAN: FixPlan = {
  summary: "Reauthorize the expired Microsoft 365 OAuth grant",
  rationale:
    "The seat's backup grant returned AADSTS700082 (refresh token expired). Re-consenting restores incremental backups without data loss.",
  confidencePct: 92,
  steps: [
    {
      id: "s1",
      intent: "Read the current OAuth grant state",
      toolName: "get_oauth_grant",
      input: {},
      actor: "we",
      risk: "read",
      requiresApproval: false,
    },
    {
      id: "s2",
      intent: "Reauthorize the backup OAuth grant",
      toolName: "reauthorize_oauth",
      input: {},
      actor: "you",
      risk: "safe-write",
      requiresApproval: true,
    },
    {
      id: "s3",
      intent: "Verify the next incremental backup succeeds",
      toolName: "trigger_backup",
      input: {},
      actor: "we",
      risk: "safe-write",
      requiresApproval: false,
    },
  ],
};

const okResult = (summary: string, output: string): ToolResult => ({
  ok: true,
  summary,
  output,
});

function turn(t: Partial<FixTranscriptTurn> & { kind: FixTranscriptTurn["kind"] }): FixTranscriptTurn {
  return { at: new Date().toISOString(), ...t };
}

/**
 * A scripted FixClient for stories — emits a fixed FixSessionEvent sequence so
 * each named story lands on a deterministic UI state, fully offline. `gateAt`
 * makes the stream pause at an approval gate until the UI calls approve().
 */
class ScriptedClient implements FixClient {
  readonly kind = "sim" as const;
  constructor(
    private readonly events: FixSessionEvent[],
    private readonly opts: { pauseAtGate?: boolean } = {},
  ) {}

  async listModels(): Promise<FixModelOption[]> {
    return [MOCK_MODEL];
  }

  async createSession(): Promise<FixSessionHandle> {
    const events = this.events;
    const opts = this.opts;
    let resolveGate: (() => void) | null = null;
    const session = {} as FixSession;

    const handle: FixSessionHandle = {
      id: "story-session",
      session,
      async approve() {
        resolveGate?.();
        resolveGate = null;
      },
      async abort() {
        resolveGate?.();
        resolveGate = null;
      },
      async *stream(): AsyncIterable<FixSessionEvent> {
        for (const ev of events) {
          yield ev;
          if (ev.type === "approval-request" && opts.pauseAtGate) {
            await new Promise<void>((res) => {
              resolveGate = res;
            });
          }
        }
      },
    };
    return handle;
  }

  stream(): AsyncIterable<FixSessionEvent> {
    throw new Error("use the handle returned by createSession");
  }
  async approve(): Promise<void> {}
  async abort(): Promise<void> {}
}

const meta = {
  title: "Organisms/Fix/GuidedFixPanel",
  component: GuidedFixPanel,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  argTypes: {
    asset: { table: { disable: true } },
    issue: { table: { disable: true } },
    client: { table: { disable: true } },
    matchCount: { control: "number" },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GuidedFixPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Pre-run — scope + dry-run controls, no session yet. */
export const Idle: Story = {
  args: { asset: ASSET, issue: ISSUE, matchCount: 9 },
  render: (args) => <GuidedFixPanel {...args} />,
};

/** Mid-run — triaging, plan shown, transcript streaming. */
export const Running: Story = {
  args: { asset: ASSET, issue: ISSUE, matchCount: 9 },
  render: (args) => (
    <GuidedFixPanel
      {...args}
      client={
        new ScriptedClient([
          { type: "state", state: "triaging" },
          {
            type: "turn",
            turn: turn({ kind: "model", text: "Inspecting the OAuth grant…" }),
          },
          { type: "plan", plan: PLAN },
          { type: "state", state: "planning" },
          {
            type: "turn",
            turn: turn({
              kind: "tool_call",
              toolCall: { id: "t1", name: "get_oauth_grant", input: {} },
            }),
          },
          {
            type: "turn",
            turn: turn({
              kind: "tool_result",
              toolResult: okResult(
                "Grant expired (AADSTS700082)",
                "status: expired\nlast_consent: 2024-11-02",
              ),
            }),
          },
          { type: "state", state: "executing" },
        ])
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const start = await canvas.findByRole("button", { name: /start guided/i });
    await userEvent.click(start);
    await waitFor(() =>
      expect(canvas.getByText(/Reauthorize the expired/i)).toBeInTheDocument(),
    );
  },
};

/** Paused at an approval gate — Approve / Reject available. */
export const AwaitingApproval: Story = {
  args: { asset: ASSET, issue: ISSUE, matchCount: 9 },
  render: (args) => (
    <GuidedFixPanel
      {...args}
      client={
        new ScriptedClient(
          [
            { type: "plan", plan: PLAN },
            { type: "state", state: "executing" },
            {
              type: "turn",
              turn: turn({
                kind: "tool_result",
                toolResult: okResult("Grant expired", "status: expired"),
              }),
            },
            { type: "approval-request", step: PLAN.steps[1] },
          ],
          { pauseAtGate: true },
        )
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const start = await canvas.findByRole("button", { name: /start guided/i });
    await userEvent.click(start);
    await waitFor(() =>
      expect(canvas.getByText(/Approval needed/i)).toBeInTheDocument(),
    );
    await expect(
      canvas.getByRole("button", { name: /approve/i }),
    ).toBeEnabled();
  },
};

/** Resolved — terminal success summary + re-run. */
export const Succeeded: Story = {
  args: { asset: ASSET, issue: ISSUE, matchCount: 9 },
  render: (args) => (
    <GuidedFixPanel
      {...args}
      client={
        new ScriptedClient([
          { type: "plan", plan: PLAN },
          {
            type: "turn",
            turn: turn({
              kind: "verification",
              text: "Next incremental backup completed cleanly.",
            }),
          },
          {
            type: "done",
            session: {
              state: "succeeded",
              plan: PLAN,
              result: {
                healed: true,
                summary:
                  "OAuth grant reauthorized; the next M365 backup completed.",
                actionRunIds: [],
              },
            } as unknown as FixSession,
          },
        ])
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const start = await canvas.findByRole("button", { name: /start guided/i });
    await userEvent.click(start);
    await waitFor(() =>
      expect(canvas.getByText(/reauthorized/i)).toBeInTheDocument(),
    );
    await expect(
      canvas.getByRole("button", { name: /run again/i }),
    ).toBeInTheDocument();
  },
};

/** Escalated — the fix could not complete and was handed to a human. */
export const Escalated: Story = {
  args: { asset: ASSET, issue: ISSUE, matchCount: 9 },
  render: (args) => (
    <GuidedFixPanel
      {...args}
      client={
        new ScriptedClient([
          { type: "plan", plan: PLAN },
          {
            type: "turn",
            turn: turn({
              kind: "observation",
              text: "Re-consent requires a Global Admin; the current scope cannot grant it.",
            }),
          },
          {
            type: "done",
            session: {
              state: "escalated",
              plan: PLAN,
              result: {
                healed: false,
                summary:
                  "Escalated: a Global Admin must approve the M365 re-consent. Support package attached.",
                actionRunIds: [],
                ticketRef: "RC-48217",
              },
            } as unknown as FixSession,
          },
        ])
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const start = await canvas.findByRole("button", { name: /start guided/i });
    await userEvent.click(start);
    await waitFor(() =>
      expect(
        canvas.getByText(/must approve the M365 re-consent/i),
      ).toBeInTheDocument(),
    );
  },
};
