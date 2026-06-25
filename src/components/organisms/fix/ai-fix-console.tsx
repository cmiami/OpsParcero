"use client";

import * as React from "react";
import {
  Sparkles,
  Square,
  Check,
  X,
  ShieldCheck,
  Package,
  Ticket,
  Wand2,
  RotateCcw,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MonoLabel } from "@/components/atoms/mono-label";
import { AiInsightCard } from "@/components/molecules/ai-insight-card";
import { FixTranscriptView } from "./fix-transcript-view";
import { ToolCallCard } from "./tool-call-card";
import { ModelPicker } from "./model-picker";
import { FIX_STATE_META } from "./fix-state-meta";
import { getFixClientSync, getFixClient } from "@/lib/fix-client";
import { toast } from "sonner";
import type {
  FixClient,
  FixSessionEvent,
  FixSessionHandle,
  FixState,
  FixPlanStep,
  FixTranscriptTurn,
  FixModelOption,
  FixModelRef,
  FixPlan,
  ToolResult,
} from "@/lib/fix-client";
import { FixAbortError } from "@/lib/fix-client";
import { recordAgentRun } from "@/lib/activity-record";
import type { ProtectedAsset, Issue } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// State presentation — every FixState is a visible, labelled console state.
// We reuse the shared FIX_STATE_META (dot + icon + text — never color-only, M5)
// so the badge vocabulary stays single-sourced with the Guided surface; the AI
// (purple) register lives only on this console's container/header/identity.
// ─────────────────────────────────────────────────────────────────────────────

/** States the EscalationPanel takes over for (no straightforward heal). */
const ESCALATION_STATES: ReadonlySet<FixState> = new Set<FixState>([
  "failed",
  "escalated",
  "halted",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Reducer — folds the FixSessionEvent stream into the console view-model.
// ─────────────────────────────────────────────────────────────────────────────

interface ConsoleModel {
  state: FixState;
  turns: FixTranscriptTurn[];
  plan?: FixPlan;
  /** The open approval gate, if any. */
  gate: FixPlanStep | null;
  /** The dry-run preview (diff / blast-radius) carried with the gate, so the
   *  human sees WHAT they're approving — not just the tool name (#8). */
  gatePreview: ToolResult | null;
  /** True once a terminal `done` (or abort) has landed. */
  finished: boolean;
  /** Set when the run was aborted by the user. */
  aborted: boolean;
  /**
   * The engine's HONEST heal signal (session.result.healed) — the symptom was
   * verified cleared. NOT the same as "didn't escalate": a `partial` terminal is
   * a non-escalation state but healed===false (P1 #1). Only this drives a heal.
   */
  healed: boolean;
}

const INITIAL_MODEL: ConsoleModel = {
  state: "triaging",
  turns: [],
  plan: undefined,
  gate: null,
  gatePreview: null,
  finished: false,
  aborted: false,
  healed: false,
};

type ConsoleEvent =
  | { kind: "reset" }
  | { kind: "event"; event: FixSessionEvent }
  | { kind: "aborted" }
  | { kind: "approval-cleared" };

function reduce(model: ConsoleModel, action: ConsoleEvent): ConsoleModel {
  switch (action.kind) {
    case "reset":
      return INITIAL_MODEL;
    case "aborted":
      return {
        ...model,
        finished: true,
        aborted: true,
        gate: null,
        gatePreview: null,
        state: "halted",
      };
    case "approval-cleared":
      return { ...model, gate: null, gatePreview: null };
    case "event": {
      const ev = action.event;
      switch (ev.type) {
        case "state":
          return { ...model, state: ev.state };
        case "plan":
          return { ...model, plan: ev.plan };
        case "turn":
          return { ...model, turns: [...model.turns, ev.turn] };
        case "approval-request":
          return {
            ...model,
            gate: ev.step,
            gatePreview: ev.preview ?? null,
            state: "awaiting-approval",
          };
        case "done":
          return {
            ...model,
            state: ev.session.state,
            plan: ev.session.plan ?? model.plan,
            turns: ev.session.transcript?.length
              ? ev.session.transcript
              : model.turns,
            gate: null,
            gatePreview: null,
            finished: true,
            healed: ev.session.result?.healed === true,
          };
        default:
          return model;
      }
    }
    default:
      return model;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AiFixConsole
// ─────────────────────────────────────────────────────────────────────────────

export interface AiFixConsoleProps {
  /** The asset the agent will autonomously fix. */
  asset: ProtectedAsset;
  /** The diagnosed issue (drives the failure-mode header + AI insight). */
  issue?: Issue;
  /**
   * The FixClient that backs the run. Defaults to the offline Sim (or the live
   * engine if one is configured). Stories inject scripted clients to pin a state.
   */
  client?: FixClient;
  /** Routed when the human chooses to switch to the Guided fix flow. */
  onSwitchToGuided?: () => void;
  className?: string;
}

/**
 * AiFixConsole — the autonomous "Fix with AI" surface.
 *
 * The ONLY new purple surface in M4. A ModelPicker + a "Fix with AI" run button
 * open a session (`mode: "ai"`) on the {@link FixClient}; the console then
 * streams the agent's reasoning, ToolCallCards, and verification through
 * {@link FixTranscriptView}, carries a live state badge (dot + icon + text,
 * never color-only — M5), pins Approve/Reject controls when the loop reaches a
 * gate, exposes an Abort, and renders an EscalationPanel (what it tried + a
 * support-package / hand-to-a-human CTA) on a failed/escalated/halted terminal.
 *
 * Purple (`ai*` tokens) is reserved to this surface; the per-state tone uses the
 * shared status tokens. The transcript is the agent's full audit trail; runs
 * land in Run history / Audit as `triggeredBy: "ai"`.
 */
export function AiFixConsole({
  asset,
  issue,
  client,
  onSwitchToGuided,
  className,
}: AiFixConsoleProps) {
  // Resolve the client asynchronously so the live-engine opt-in is reachable
  // (P1-2): start on a synchronous Sim, then upgrade to whatever getFixClient()
  // resolves. Stories pass an explicit `client`, bypassing the probe.
  const [fixClient, setFixClient] = React.useState<FixClient>(
    () => client ?? getFixClientSync(),
  );
  React.useEffect(() => {
    if (client) {
      setFixClient(client);
      return;
    }
    let alive = true;
    void getFixClient().then((c) => {
      if (alive) setFixClient(c);
    });
    return () => {
      alive = false;
    };
  }, [client]);

  const [model, dispatch] = React.useReducer(reduce, INITIAL_MODEL);
  const [running, setRunning] = React.useState(false);
  const [models, setModels] = React.useState<FixModelOption[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<FixModelRef | null>(
    null,
  );

  const handleRef = React.useRef<FixSessionHandle | null>(null);
  const aliveRef = React.useRef(true);
  // Guards the one-time activity record per terminal run.
  const recordedRef = React.useRef(false);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      // Best-effort cleanup if the console unmounts mid-run.
      void handleRef.current?.abort().catch(() => {});
    };
  }, []);

  // Load the model menu once (the Sim offers the deterministic Mock model).
  React.useEffect(() => {
    let alive = true;
    void fixClient.listModels().then((list) => {
      if (!alive) return;
      setModels(list);
      if (list[0]) {
        setSelectedModel((cur) =>
          cur ?? { provider: list[0].provider, model: list[0].id },
        );
      }
    });
    return () => {
      alive = false;
    };
  }, [fixClient]);

  const drainStream = React.useCallback(
    async (handle: FixSessionHandle) => {
      try {
        for await (const ev of handle.stream()) {
          if (!aliveRef.current) return;
          // Ignore a terminal that isn't for THIS run's session+asset — a
          // buggy/hostile engine must not heal a non-target asset (P2-6).
          if (
            ev.type === "done" &&
            (ev.session.id !== handle.id || ev.session.assetId !== asset.id)
          ) {
            continue;
          }
          dispatch({ kind: "event", event: ev });
        }
      } catch (err) {
        if (err instanceof FixAbortError) {
          if (aliveRef.current) dispatch({ kind: "aborted" });
        } else {
          // Surface engine/transport faults as a halted terminal — no dead end.
          if (aliveRef.current) dispatch({ kind: "aborted" });
        }
      } finally {
        if (aliveRef.current) setRunning(false);
      }
    },
    [asset.id],
  );

  const handleRun = React.useCallback(async () => {
    if (running || !selectedModel) return;
    dispatch({ kind: "reset" });
    recordedRef.current = false;
    setRunning(true);
    const handle = await fixClient.createSession({
      assetId: asset.id,
      issueId: issue?.id,
      mode: "ai",
      model: selectedModel,
      scope: "once",
    });
    // If the console unmounted while createSession was pending, the unmount
    // effect aborted a still-null ref — so abort this late handle ourselves and
    // never start its stream (which would run the loop with no UI owner). (#6)
    if (!aliveRef.current) {
      void handle.abort().catch(() => {});
      return;
    }
    handleRef.current = handle;
    void drainStream(handle);
  }, [running, selectedModel, fixClient, asset.id, issue?.id, drainStream]);

  const handleApprove = React.useCallback(
    async (decision: "approve" | "reject") => {
      const handle = handleRef.current;
      const gate = model.gate;
      if (!handle || !gate) return;
      // Confirm with the engine BEFORE clearing the gate (#9): on the Sim this
      // resolves locally and never throws; on a live engine a non-409 failure
      // must keep the gate visible + retryable instead of vanishing as a no-op.
      try {
        await handle.approve(gate.id, decision);
        if (aliveRef.current) dispatch({ kind: "approval-cleared" });
      } catch {
        if (aliveRef.current) {
          toast.error("Approval didn't go through", {
            description: "The engine didn't confirm the decision — try again.",
          });
        }
      }
    },
    [model.gate],
  );

  const handleAbort = React.useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;
    await handle.abort();
  }, []);

  const meta = FIX_STATE_META[model.state];
  const StateIcon = meta.icon;
  const started = running || model.turns.length > 0 || model.finished;
  const escalated = model.finished && ESCALATION_STATES.has(model.state);
  // A non-escalation terminal split by the engine's HONEST heal signal: a true
  // verified heal vs a 'partial' that ran but did NOT clear the symptom (#1).
  const terminalNonEscalation =
    model.finished && !ESCALATION_STATES.has(model.state);
  const healed = terminalNonEscalation && model.healed;
  const partialNoHeal = terminalNonEscalation && !model.healed;
  const failureLabel = issue
    ? issue.failureModeId ?? issue.category
    : asset.kind;

  // On a non-escalation terminal, persist the run with the engine's HONEST
  // outcome — heal the asset ONLY when the engine verified the symptom cleared
  // (model.healed). A 'partial' terminal records a partial run with NO heal, so
  // the asset/alerts are never falsely closed (#1). Escalation has its own panel.
  React.useEffect(() => {
    if (!model.finished || recordedRef.current) return;
    recordedRef.current = true;
    if (!terminalNonEscalation) return;
    recordAgentRun({
      assetId: asset.id,
      actionLabel: issue ? `AI fix — ${issue.title}` : "AI autonomous fix",
      scope: "once",
      state: model.healed ? "succeeded" : "partial",
      summary: model.healed
        ? ([...model.turns].reverse().find((t) => t.kind === "verification")
            ?.text ??
          "The AI agent applied the fix and verification confirmed the heal.")
        : "The AI agent ran but verification did not confirm the symptom cleared — review the transcript or escalate.",
      by: { kind: "ai", refId: selectedModel?.model ?? "ai-agent" },
      heal: model.healed ? { status: "protected" } : undefined,
    });
  }, [
    model.finished,
    terminalNonEscalation,
    model.healed,
    asset.id,
    issue,
    selectedModel,
    model.turns,
  ]);

  return (
    <section
      aria-label="Fix with AI console"
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-ai-accent bg-card",
        className,
      )}
    >
      {/* Header — AI identity (purple), failure-mode + session ids (mono),
          live state badge (dot + icon + text). */}
      <header className="flex flex-col gap-2 border-b border-border bg-ai-tint px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-bold text-ai">
            <Sparkles aria-hidden className="size-4 shrink-0" />
            Fix with AI
            <span className="text-card-foreground">· {asset.displayName}</span>
          </span>
          <span
            role="status"
            aria-label={`Status: ${meta.label}`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold",
              meta.tintClass,
              meta.textClass,
            )}
          >
            <span
              aria-hidden
              className={cn("size-2 rounded-full", meta.dotClass)}
            />
            <StateIcon
              aria-hidden
              className={cn(
                "size-3.5 shrink-0",
                meta.active && "motion-safe:animate-spin",
              )}
            />
            {meta.label}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonoLabel>{String(failureLabel)}</MonoLabel>
          {issue?.detail && <MonoLabel copyable>{issue.detail}</MonoLabel>}
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {/* Pre-run: model + the "Fix with AI" run button. */}
        {!started && (
          <div className="flex flex-col gap-4">
            {issue?.aiInsight && <AiInsightCard insight={issue.aiInsight} />}
            <div className="flex flex-col gap-2">
              <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
                Model
              </span>
              {selectedModel && (
                <ModelPicker
                  models={models}
                  value={selectedModel}
                  onChange={setSelectedModel}
                />
              )}
            </div>
            <Button
              type="button"
              onClick={handleRun}
              disabled={!selectedModel}
              className="self-start bg-ai text-ai-foreground hover:bg-ai-accent focus-visible:ring-ai"
            >
              <Sparkles aria-hidden className="size-4" />
              Fix with AI
            </Button>
          </div>
        )}

        {/* Live run: streamed transcript + controls. */}
        {started && (
          <>
            {model.plan && (
              <div className="flex flex-col gap-1 rounded-md border border-ai-accent bg-ai-tint p-3">
                <span className="flex items-center gap-2 text-xs font-bold text-ai">
                  <Wand2 aria-hidden className="size-3.5 shrink-0" />
                  Plan · {model.plan.confidencePct}% confidence
                </span>
                <p className="text-sm text-card-foreground">
                  {model.plan.summary}
                </p>
              </div>
            )}

            <ScrollArea className="max-h-[22rem] rounded-md border border-border bg-surface">
              <div className="p-3">
                <FixTranscriptView turns={model.turns} streaming={running} />
              </div>
            </ScrollArea>

            {/* Approval gate — pinned when the loop awaits a decision. */}
            {model.gate && (
              <div
                role="group"
                aria-label="Approval required"
                className="flex flex-col gap-3 rounded-md border border-warning bg-warning-tint p-3"
              >
                <div className="flex items-start gap-2">
                  <ShieldCheck
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-warning"
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-bold text-card-foreground">
                      Approval required — {model.gate.intent}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {model.gate.toolName} ·{" "}
                      {model.gate.risk === "destructive"
                        ? "destructive"
                        : model.gate.risk === "safe-write"
                          ? "safe write"
                          : "read"}{" "}
                      · {model.gate.actor === "we" ? "we run this" : "you confirm"}
                    </span>
                  </div>
                </div>

                {/* The dry-run preview (diff / blast-radius) the engine carried
                    with the gate — so the decision is informed, not blind (#8). */}
                {model.gatePreview && (
                  <ToolCallCard
                    call={{
                      id: model.gate.id,
                      name: model.gate.toolName,
                      input: model.gate.input,
                    }}
                    result={model.gatePreview}
                    risk={model.gate.risk}
                    dryRun
                    defaultOpen
                  />
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={() => void handleApprove("approve")}
                  >
                    <Check aria-hidden className="size-4" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => void handleApprove("reject")}
                  >
                    <X aria-hidden className="size-4" />
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {/* Non-escalation terminal — copy follows the engine's honest heal
                signal: a true heal reads as resolved; a 'partial' says plainly it
                did NOT clear, and is NOT recorded as a heal (#1). */}
            {(healed || partialNoHeal) && (
              <div
                role="status"
                className={cn(
                  "flex items-start gap-2 rounded-md p-3",
                  meta.tintClass,
                )}
              >
                <StateIcon
                  aria-hidden
                  className={cn("mt-0.5 size-4 shrink-0", meta.textClass)}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn("text-sm font-bold", meta.textClass)}>
                    {meta.label}
                  </span>
                  {healed ? (
                    <span className="text-xs text-muted-foreground">
                      The agent applied the fix and verified the symptom cleared.
                      This run is recorded in Run history and Audit as{" "}
                      <span className="inline-flex items-center gap-1 font-bold text-ai">
                        <Sparkles aria-hidden className="size-3" />
                        AI
                      </span>
                      .
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      The agent ran but verification did not confirm the symptom
                      cleared — no heal was applied. Review the transcript or
                      escalate. Recorded as a partial AI run.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Escalation terminal — what it tried + hand-to-human CTA. */}
            {escalated && (
              <EscalationPanel
                state={model.state}
                turns={model.turns}
                issue={issue}
                onSwitchToGuided={onSwitchToGuided}
              />
            )}

            <Separator />

            {/* Controls — Abort while running; Re-run on a terminal. */}
            <div className="flex flex-wrap items-center gap-2">
              {running && !model.finished ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleAbort()}
                >
                  <Square aria-hidden className="size-4" />
                  Abort
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRun}
                  disabled={!selectedModel}
                >
                  <RotateCcw aria-hidden className="size-4" />
                  Run again
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EscalationPanel — first-class hand-off, not a dead-end red screen.
// Warning (not critical) tone: the value is the assembled context.
// ─────────────────────────────────────────────────────────────────────────────

interface EscalationPanelProps {
  state: FixState;
  turns: FixTranscriptTurn[];
  issue?: Issue;
  onSwitchToGuided?: () => void;
}

function EscalationPanel({
  state,
  turns,
  issue,
  onSwitchToGuided,
}: EscalationPanelProps) {
  // "What it tried" = the tool calls + their outcomes from the transcript.
  const attempts = turns.filter(
    (t) => t.kind === "tool_call" || t.kind === "tool_result",
  );
  const blockReason = turns
    .filter((t) => t.kind === "tool_result" && t.toolResult && !t.toolResult.ok)
    .map((t) => t.toolResult?.summary)
    .filter(Boolean)
    .at(-1);

  const heading =
    state === "halted"
      ? "I stopped before finishing. Here's what I tried and what's next."
      : state === "failed"
        ? "The fix ran but didn't clear the symptom. Here's what I tried and what's next."
        : "I couldn't fully fix this. Here's what I tried and what's next.";

  return (
    <section
      aria-label="Escalation"
      className="flex flex-col gap-3 rounded-md border border-warning bg-warning-tint p-3"
    >
      <div className="flex items-start gap-2">
        <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-ai" />
        <p className="text-sm font-bold text-card-foreground">{heading}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-md bg-surface p-3">
        <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
          What I tried
        </span>
        {attempts.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {attempts.map((t, i) => {
              const ok = t.kind === "tool_call" ? true : t.toolResult?.ok;
              const name =
                t.toolCall?.name ?? t.toolResult?.summary ?? "observation";
              return (
                <li
                  key={`${name}-${i}`}
                  className="flex items-start gap-2 text-xs text-card-foreground"
                >
                  {ok ? (
                    <Check
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0 text-success"
                    />
                  ) : (
                    <X
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0 text-critical"
                    />
                  )}
                  <span className="min-w-0">
                    {t.kind === "tool_call" ? (
                      <span className="font-mono">{name}</span>
                    ) : (
                      <span>{t.toolResult?.summary ?? name}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            The agent triaged the issue but could not apply a controllable fix.
          </p>
        )}
        {blockReason && (
          <p className="mt-1 text-xs italic text-muted-foreground">
            Blocked: {blockReason}
          </p>
        )}
        {issue?.aiInsight && (
          <p className="text-xs text-muted-foreground">
            Diagnosis confidence: {issue.aiInsight.confidencePct}%.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {onSwitchToGuided && (
          <Button type="button" size="sm" onClick={onSwitchToGuided}>
            <Wand2 aria-hidden className="size-4" />
            Switch to Guided fix
          </Button>
        )}
        <Button type="button" size="sm" variant="outline">
          <Package aria-hidden className="size-4" />
          Assemble support package
        </Button>
        <Button type="button" size="sm" variant="outline">
          <Ticket aria-hidden className="size-4" />
          Open ticket
        </Button>
        <Button type="button" size="sm" variant="ghost">
          <Play aria-hidden className="size-4" />
          I&apos;ve done it — re-verify
        </Button>
      </div>
    </section>
  );
}
