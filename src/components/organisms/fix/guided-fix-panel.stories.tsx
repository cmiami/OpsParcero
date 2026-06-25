import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
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
import { usePolicies } from "@/stores/automation-policies";
import { useActivity } from "@/stores/activity";

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
  /** Set true when the handle's abort() runs — lets a story assert teardown. */
  aborted = false;
  constructor(
    private readonly events: FixSessionEvent[],
    private readonly opts: { pauseAtGate?: boolean; failApprove?: boolean } = {},
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
      approve: async () => {
        // Simulate a live-engine failure that must NOT clear the gate (#9).
        if (opts.failApprove) throw new Error("approve failed");
        resolveGate?.();
        resolveGate = null;
      },
      abort: async () => {
        this.aborted = true;
        resolveGate?.();
        resolveGate = null;
      },
      async *stream(): AsyncIterable<FixSessionEvent> {
        for (const ev of events) {
          // Stamp run identity onto the terminal so the console's P2-6 guard
          // accepts it (a real engine sets these; the scripted fixtures omit them).
          const out =
            ev.type === "done"
              ? {
                  ...ev,
                  session: { ...ev.session, id: "story-session", assetId: ASSET.id },
                }
              : ev;
          yield out;
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

/**
 * ScopeHidesAllMatching — regression gate for #3: even with matchCount>1 the
 * single-asset engine console offers Once + Always only, never "all-matching"
 * (which it can't fan out across — it would record a blast radius it didn't heal).
 */
export const ScopeHidesAllMatching: Story = {
  args: { asset: ASSET, issue: ISSUE, matchCount: 9 },
  render: (args) => <GuidedFixPanel {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByLabelText(/Fix this once/i)).toBeInTheDocument();
    expect(canvas.getByLabelText(/Always auto-fix/i)).toBeInTheDocument();
    expect(canvas.queryByLabelText(/Apply to all matching/i)).toBeNull();
  },
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
            {
              type: "approval-request",
              step: PLAN.steps[1],
              // The dry-run preview the gate must surface (#8).
              preview: {
                ok: true,
                summary: "Reauthorize the backup OAuth grant",
                output: "dry-run: would reauthorize OAuth grant",
                diff: {
                  before: { authStatus: "expired" },
                  after: { authStatus: "active" },
                },
              } as ToolResult,
            },
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
    // #8: the gate shows the preview diff (the changed facet), not just the tool.
    await waitFor(() =>
      expect(canvas.getByText(/authStatus/i)).toBeInTheDocument(),
    );
  },
};

/**
 * ApproveFailureKeepsGate — regression gate for #9: when the engine fails to
 * confirm the decision, the gate must STAY (the run isn't cleared optimistically)
 * so the user can retry — it doesn't vanish as a silent no-op.
 */
export const ApproveFailureKeepsGate: Story = {
  args: { asset: ASSET, issue: ISSUE, matchCount: 9 },
  render: (args) => (
    <GuidedFixPanel
      {...args}
      client={
        new ScriptedClient(
          [
            { type: "plan", plan: PLAN },
            { type: "state", state: "executing" },
            { type: "approval-request", step: PLAN.steps[1] },
          ],
          { pauseAtGate: true, failApprove: true },
        )
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /start guided/i }),
    );
    await waitFor(() =>
      expect(canvas.getByText(/Approval needed/i)).toBeInTheDocument(),
    );
    await userEvent.click(canvas.getByRole("button", { name: /approve/i }));
    // Let the rejected approve settle, then assert the gate is STILL open.
    await new Promise((r) => setTimeout(r, 60));
    expect(canvas.getByText(/Approval needed/i)).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: /approve/i })).toBeEnabled();
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
    usePolicies.setState({ policies: [] });
    const canvas = within(canvasElement);
    const start = await canvas.findByRole("button", { name: /start guided/i });
    await userEvent.click(start);
    await waitFor(() =>
      expect(canvas.getByText(/reauthorized/i)).toBeInTheDocument(),
    );
    await expect(
      canvas.getByRole("button", { name: /run again/i }),
    ).toBeInTheDocument();
    // Default scope "once" creates NO standing policy.
    expect(usePolicies.getState().policies.length).toBe(0);
  },
};

/**
 * AlwaysCreatesPolicy — closes the gap: picking "Always auto-fix" scope before a
 * successful guided run creates the standing policy (was silently a no-op).
 */
export const AlwaysCreatesPolicy: Story = {
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
                summary: "OAuth grant reauthorized; the next M365 backup completed.",
                actionRunIds: [],
              },
            } as unknown as FixSession,
          },
        ])
      }
    />
  ),
  play: async ({ canvasElement }) => {
    usePolicies.setState({ policies: [] });
    const canvas = within(canvasElement);
    // Pick "Always auto-fix" BEFORE running.
    await userEvent.click(
      canvas.getByRole("radio", { name: /Always auto-fix/i }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: /start guided/i }),
    );
    await waitFor(() =>
      expect(canvas.getByText(/reauthorized/i)).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(usePolicies.getState().policies.length).toBe(1),
    );
    const trigger = usePolicies.getState().policies[0].trigger;
    expect(trigger.kind).toBe("failure-mode");
    if (trigger.kind === "failure-mode") {
      expect(trigger.failureModeId).toBe(ISSUE.failureModeId);
    }
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

// A run that pauses at an approval gate, so we can unmount it MID-RUN.
const unmountClient = new ScriptedClient(
  [
    { type: "state", state: "triaging" },
    { type: "plan", plan: PLAN },
    { type: "approval-request", step: PLAN.steps[1] },
  ],
  { pauseAtGate: true },
);

/** Harness: a toggle that unmounts the panel, so a play fn can unmount mid-run. */
function UnmountHarness() {
  const [mounted, setMounted] = React.useState(true);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setMounted(false)}
        className="self-start rounded-md border border-border px-2 py-1 text-sm"
      >
        Unmount panel
      </button>
      {mounted && (
        <GuidedFixPanel
          asset={ASSET}
          issue={ISSUE}
          client={unmountClient}
          matchCount={9}
        />
      )}
    </div>
  );
}

/**
 * UnmountAbortsMidRun — regression gate for P2-7: unmounting the panel while a
 * run is in flight must tear the session down (call abort) and not dispatch into
 * a dead component. Mirrors the AI console's proven lifecycle guard.
 */
export const UnmountAbortsMidRun: Story = {
  args: { asset: ASSET, issue: ISSUE, matchCount: 9 },
  render: () => <UnmountHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    unmountClient.aborted = false;
    await userEvent.click(
      await canvas.findByRole("button", { name: /start guided/i }),
    );
    // The run reaches the approval gate and holds there — it is mid-run.
    await waitFor(() =>
      expect(canvas.getByText(/Approval needed/i)).toBeInTheDocument(),
    );
    // Unmounting mid-run must abort the session (and not throw).
    await userEvent.click(
      canvas.getByRole("button", { name: /Unmount panel/i }),
    );
    await waitFor(() => expect(unmountClient.aborted).toBe(true));
    expect(canvas.queryByText(/Approval needed/i)).not.toBeInTheDocument();
  },
};

// A client whose createSession BLOCKS until released — to exercise the
// unmount-while-createSession-pending race (#6). A holder object (not a bare
// `let`) so TS doesn't flow-narrow the resolver to null at the release call.
const createGate: { release: (() => void) | null } = { release: null };
function resetCreateGate() {
  createGate.release = null;
}
const lateHandle = { aborted: false, streamStarted: false };
class BlockingClient implements FixClient {
  readonly kind = "sim" as const;
  async listModels(): Promise<FixModelOption[]> {
    return [MOCK_MODEL];
  }
  async createSession(): Promise<FixSessionHandle> {
    await new Promise<void>((res) => {
      createGate.release = res;
    });
    return {
      id: "late-session",
      session: {} as FixSession,
      async approve() {},
      async abort() {
        lateHandle.aborted = true;
      },
      async *stream(): AsyncIterable<FixSessionEvent> {
        lateHandle.streamStarted = true; // must NOT happen after a late abort
        // No events — an aborted late handle should never get here.
        yield* [];
      },
    };
  }
  stream(): AsyncIterable<FixSessionEvent> {
    throw new Error("use the handle returned by createSession");
  }
  async approve(): Promise<void> {}
  async abort(): Promise<void> {}
}
const blockingClient = new BlockingClient();

function LateUnmountHarness() {
  const [mounted, setMounted] = React.useState(true);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setMounted(false)}
        className="self-start rounded-md border border-border px-2 py-1 text-sm"
      >
        Unmount panel
      </button>
      {mounted && (
        <GuidedFixPanel
          asset={ASSET}
          issue={ISSUE}
          client={blockingClient}
          matchCount={9}
        />
      )}
    </div>
  );
}

/**
 * UnmountDuringCreateAbortsLateHandle — regression gate for #6: if the panel
 * unmounts while createSession() is still pending, the handle that arrives late
 * must be aborted and its stream never started (no loop with no UI owner, no
 * recorded run). The unmount-abort otherwise fires against a still-null ref.
 */
export const UnmountDuringCreateAbortsLateHandle: Story = {
  args: { asset: ASSET, issue: ISSUE, matchCount: 9 },
  render: () => <LateUnmountHarness />,
  play: async ({ canvasElement }) => {
    resetCreateGate();
    lateHandle.aborted = false;
    lateHandle.streamStarted = false;
    useActivity.setState({
      runs: [],
      audit: [],
      assetOverrides: {},
      alertOverrides: {},
    });
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /start guided/i }),
    );
    // createSession is now pending (blocked). Unmount the panel mid-pend.
    await waitFor(() => expect(createGate.release).not.toBeNull());
    await userEvent.click(
      canvas.getByRole("button", { name: /Unmount panel/i }),
    );
    // Release the late createSession; the panel is already gone.
    createGate.release?.();
    // The late handle is aborted and its stream is never started → no run.
    await waitFor(() => expect(lateHandle.aborted).toBe(true));
    expect(lateHandle.streamStarted).toBe(false);
    expect(useActivity.getState().runs.length).toBe(0);
  },
};
