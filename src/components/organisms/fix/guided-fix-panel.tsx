"use client";

import * as React from "react";
import {
  Wrench,
  Play,
  Check,
  X,
  FlaskConical,
  RotateCcw,
  Bot,
  Hand,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ApplyScopeControl } from "@/components/molecules/apply-scope-control";
import { FixTranscriptView } from "@/components/organisms/fix/fix-transcript-view";
import { FIX_STATE_META } from "@/components/organisms/fix/fix-state-meta";
import { getFixClientSync, TERMINAL_STATES } from "@/lib/fix-client";
import { recordAgentRun } from "@/lib/activity-record";
import type {
  FixClient,
  FixSessionEvent,
  FixState,
  FixPlan,
  FixPlanStep,
  FixTranscriptTurn,
} from "@/lib/fix-client";
import type { ProtectedAsset, Issue, ActionScope } from "@/types";

export interface GuidedFixPanelProps {
  /** The asset the run targets. */
  asset: ProtectedAsset;
  /** The specific issue to remediate, if scoped to one. */
  issue?: Issue;
  /**
   * The FixClient driving the run. Defaults to `getFixClientSync()` (the offline
   * Sim unless a live engine has been resolved). Stories inject a SimFixClient.
   */
  client?: FixClient;
  /** How many assets match this failure mode (drives the scope control). */
  matchCount?: number;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live-state badge — dot + icon + text, never color-only (M5). Blue register.
// ─────────────────────────────────────────────────────────────────────────────

function FixStateBadge({ state }: { state: FixState }) {
  const meta = FIX_STATE_META[state];
  const Icon = meta.icon;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold",
        meta.tintClass,
        meta.textClass,
        meta.borderClass,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", meta.dotClass)} />
      <Icon
        aria-hidden
        className={cn("size-3.5 shrink-0", meta.active && "animate-spin")}
      />
      <span>{meta.label}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan summary — the "We / You" split derived from the plan's steps.
// ─────────────────────────────────────────────────────────────────────────────

function PlanCard({ plan }: { plan: FixPlan }) {
  const weSteps = plan.steps.filter((s) => s.actor === "we");
  const youSteps = plan.steps.filter((s) => s.actor === "you");
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-bold text-foreground">{plan.summary}</h3>
          <p className="text-xs text-muted-foreground">{plan.rationale}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-tint px-2 py-0.5 text-xs font-bold text-primary-accent">
          {plan.confidencePct}% confidence
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <PlanStepGroup variant="we" steps={weSteps} />
        <PlanStepGroup variant="you" steps={youSteps} />
      </div>
    </div>
  );
}

function PlanStepGroup({
  variant,
  steps,
}: {
  variant: "we" | "you";
  steps: FixPlanStep[];
}) {
  if (steps.length === 0) return null;
  const isWe = variant === "we";
  const HeadingIcon = isWe ? Bot : Hand;
  const heading = isWe ? "We'll handle" : "You'll approve";
  const accent = isWe ? "text-fix-guided" : "text-fix-insights";
  const bg = isWe ? "bg-fix-guided-tint" : "bg-fix-insights-tint";
  return (
    <div className={cn("flex flex-col gap-2 rounded-md p-3", bg)}>
      <h4 className={cn("flex items-center gap-1.5 text-sm font-bold", accent)}>
        <HeadingIcon aria-hidden className="size-4 shrink-0" />
        {heading}
      </h4>
      <ol className="flex flex-col gap-1.5">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-sm">
            <span className="text-card-foreground">{s.intent}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval gate — Approve / Reject, wired to client.approve.
// ─────────────────────────────────────────────────────────────────────────────

function ApprovalGate({
  step,
  busy,
  onDecide,
}: {
  step: FixPlanStep;
  busy: boolean;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-warning bg-warning-tint p-3">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-warning">
          <Hand aria-hidden className="size-4 shrink-0" />
          Approval needed before continuing
        </span>
        <p className="text-sm text-card-foreground">{step.intent}</p>
        <p className="text-xs text-muted-foreground">
          Tool: <span className="font-mono">{step.toolName}</span> · risk:{" "}
          {step.risk}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => onDecide("approve")}
          disabled={busy}
          className="gap-1.5"
        >
          <Check aria-hidden className="size-4 shrink-0" />
          Approve &amp; run
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDecide("reject")}
          disabled={busy}
          className="gap-1.5"
        >
          <X aria-hidden className="size-4 shrink-0" />
          Reject
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel state reducer over FixSessionEvents.
// ─────────────────────────────────────────────────────────────────────────────

type Phase = "idle" | "running" | "done";

interface RunState {
  phase: Phase;
  state: FixState;
  plan?: FixPlan;
  turns: FixTranscriptTurn[];
  /** The open approval gate (set on approval-request, cleared on decide). */
  pendingStep?: FixPlanStep;
  healed?: boolean;
  resultSummary?: string;
}

const INITIAL: RunState = {
  phase: "idle",
  state: "triaging",
  turns: [],
};

type Action =
  | { type: "start" }
  | { type: "event"; ev: FixSessionEvent }
  | { type: "clear-gate" }
  | { type: "error"; message: string }
  | { type: "reset" };

function reducer(prev: RunState, action: Action): RunState {
  switch (action.type) {
    case "start":
      return { ...INITIAL, phase: "running" };
    case "reset":
      return INITIAL;
    case "clear-gate":
      return { ...prev, pendingStep: undefined };
    case "error":
      return {
        ...prev,
        phase: "done",
        state: "failed",
        pendingStep: undefined,
        resultSummary: action.message,
      };
    case "event": {
      const ev = action.ev;
      switch (ev.type) {
        case "state":
          return {
            ...prev,
            state: ev.state,
            phase: TERMINAL_STATES.has(ev.state) ? "done" : "running",
          };
        case "plan":
          return { ...prev, plan: ev.plan };
        case "turn":
          return { ...prev, turns: [...prev.turns, ev.turn] };
        case "approval-request":
          return { ...prev, pendingStep: ev.step, state: "awaiting-approval" };
        case "done":
          return {
            ...prev,
            phase: "done",
            state: ev.session.state,
            plan: ev.session.plan ?? prev.plan,
            healed: ev.session.result?.healed,
            resultSummary: ev.session.result?.summary,
            pendingStep: undefined,
          };
        default:
          return prev;
      }
    }
    default:
      return prev;
  }
}

/**
 * GuidedFixPanel — the human-in-the-loop remediation flow (BLUE / primary).
 *
 * The technician picks a scope (once / all-matching / always) and an optional
 * dry-run, then runs the fix. The panel creates a `guided` session on the
 * injected FixClient, streams the transcript through FixTranscriptView, and
 * pauses at each approval gate with an Approve / Reject control wired to
 * `client.approve`. A live state badge (dot + icon + text) tracks the session
 * state machine. This surface is deliberately blue — purple is reserved for the
 * autonomous AI console.
 */
export function GuidedFixPanel({
  asset,
  issue,
  client,
  matchCount,
  className,
}: GuidedFixPanelProps) {
  const fixClient = React.useMemo(
    () => client ?? getFixClientSync(),
    [client],
  );
  const [run, dispatch] = React.useReducer(reducer, INITIAL);
  const [scope, setScope] = React.useState<ActionScope>("once");
  // Real-with-gates by default (preview-before-execute + approval gates protect);
  // dry-run is the explicit opt-in for preview-only.
  const [dryRun, setDryRun] = React.useState(false);
  const [deciding, setDeciding] = React.useState(false);

  // The active session handle for the current run (for approve/abort).
  const sessionRef = React.useRef<{
    id: string;
    approve: (stepId: string, d: "approve" | "reject") => Promise<void>;
    abort: () => Promise<void>;
  } | null>(null);
  // Guards the one-time activity record per terminal run.
  const recordedRef = React.useRef(false);

  // On a terminal, non-dry, healed run, persist the run + heal the asset so the
  // panel's "recorded" promise holds and the asset's state reflects the fix.
  React.useEffect(() => {
    if (run.phase !== "done" || recordedRef.current) return;
    recordedRef.current = true;
    if (run.healed && !dryRun) {
      recordAgentRun({
        assetId: asset.id,
        actionLabel: issue ? `Guided fix — ${issue.title}` : "Guided fix",
        scope,
        state: "succeeded",
        summary: run.resultSummary ?? "The issue was resolved.",
        heal: { status: "protected" },
      });
    }
  }, [run.phase, run.healed, run.resultSummary, dryRun, scope, asset.id, issue]);

  const running = run.phase === "running";

  const startRun = React.useCallback(async () => {
    dispatch({ type: "start" });
    recordedRef.current = false;
    try {
      const models = await fixClient.listModels();
      const first = models[0];
      const handle = await fixClient.createSession({
        assetId: asset.id,
        issueId: issue?.id,
        mode: "guided",
        model: { provider: first.provider, model: first.id },
        scope,
        dryRun,
      });
      sessionRef.current = {
        id: handle.id,
        approve: handle.approve,
        abort: handle.abort,
      };
      for await (const ev of handle.stream()) {
        dispatch({ type: "event", ev });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The run could not complete.";
      dispatch({ type: "error", message });
    }
  }, [asset.id, issue?.id, scope, dryRun, fixClient]);

  const decide = React.useCallback(
    async (decision: "approve" | "reject") => {
      const session = sessionRef.current;
      const step = run.pendingStep;
      if (!session || !step) return;
      setDeciding(true);
      dispatch({ type: "clear-gate" });
      try {
        await session.approve(step.id, decision);
      } finally {
        setDeciding(false);
      }
    },
    [run.pendingStep],
  );

  const reset = React.useCallback(() => {
    sessionRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  const issueTitle = issue?.title ?? "this issue";

  return (
    <section
      className={cn("flex flex-col gap-4", className)}
      aria-label="Guided fix"
    >
      {/* Header — identity + live state. */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-tint text-primary-accent">
              <Wrench aria-hidden className="size-4" />
            </span>
            Guided fix
          </h2>
          <p className="text-sm text-muted-foreground">
            Step through {issueTitle} on{" "}
            <span className="font-bold text-foreground">
              {asset.displayName}
            </span>
            . We run the automatable steps; you approve anything that changes
            state.
          </p>
        </div>
        {run.phase !== "idle" && <FixStateBadge state={run.state} />}
      </header>

      {/* Controls — scope + dry-run + run (idle / pre-run only). */}
      {run.phase === "idle" && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
          <span className="text-xs font-bold text-foreground">Apply scope</span>
          <ApplyScopeControl
            value={scope}
            onChange={setScope}
            matchCount={matchCount}
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-card-foreground">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="size-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <FlaskConical aria-hidden className="size-4 shrink-0 text-primary-accent" />
            Dry run first — preview each change before it is applied
          </label>
          <div>
            <Button onClick={startRun} className="gap-1.5">
              <Play aria-hidden className="size-4 shrink-0" />
              {dryRun ? "Start guided dry run" : "Start guided fix"}
            </Button>
          </div>
        </div>
      )}

      {/* Plan. */}
      {run.plan && <PlanCard plan={run.plan} />}

      {/* Approval gate. */}
      {run.pendingStep && (
        <ApprovalGate
          step={run.pendingStep}
          busy={deciding}
          onDecide={decide}
        />
      )}

      {/* Live transcript. */}
      {run.turns.length > 0 && (
        <FixTranscriptView turns={run.turns} streaming={running} />
      )}

      {/* Terminal summary + re-run. */}
      {run.phase === "done" && (
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-md border p-3",
            FIX_STATE_META[run.state].borderClass,
            FIX_STATE_META[run.state].tintClass,
          )}
        >
          <p className="text-sm text-card-foreground">
            {run.resultSummary ??
              (run.healed
                ? "The issue was resolved."
                : "The run finished. Review the transcript above.")}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={reset}
            className="shrink-0 gap-1.5"
          >
            <RotateCcw aria-hidden className="size-4 shrink-0" />
            Run again
          </Button>
        </div>
      )}
    </section>
  );
}
