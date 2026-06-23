"use client";

import * as React from "react";
import {
  MessageSquare,
  Search,
  ShieldQuestion,
  BadgeCheck,
  Activity,
  Copy,
  Check,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/atoms/status-badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ToolCallCard } from "./tool-call-card";
import type {
  FixTranscriptTurn,
  FixTranscriptKind,
  FixState,
  ToolRisk,
} from "@/lib/fix-client";

// Engine FixState → app AssetStatus (StatusBadge vocabulary), so the timeline's
// status rows reuse the single-sourced status atom (dot + icon + text, M5).
const STATE_TO_STATUS: Record<
  FixState,
  React.ComponentProps<typeof StatusBadge>["state"]
> = {
  triaging: "syncing",
  planning: "syncing",
  "awaiting-approval": "paused",
  executing: "syncing",
  verifying: "syncing",
  succeeded: "protected",
  partial: "warning",
  failed: "failed",
  escalated: "warning",
  halted: "offline",
};

const STATE_LABEL: Record<FixState, string> = {
  triaging: "Triaging",
  planning: "Planning",
  "awaiting-approval": "Awaiting approval",
  executing: "Executing",
  verifying: "Verifying",
  succeeded: "Succeeded",
  partial: "Partial",
  failed: "Failed",
  escalated: "Escalated",
  halted: "Halted",
};

interface KindMeta {
  icon: LucideIcon;
  /** Rail dot + icon color. Tokens only — no purple (shared surface). */
  accentClass: string;
  ringClass: string;
}

const KIND_META: Record<FixTranscriptKind, KindMeta> = {
  model: { icon: MessageSquare, accentClass: "text-muted-foreground", ringClass: "ring-border" },
  tool_call: { icon: Activity, accentClass: "text-primary", ringClass: "ring-primary" },
  tool_result: { icon: BadgeCheck, accentClass: "text-success", ringClass: "ring-success" },
  observation: { icon: Search, accentClass: "text-muted-foreground", ringClass: "ring-border" },
  approval: { icon: ShieldQuestion, accentClass: "text-warning", ringClass: "ring-warning" },
  verification: { icon: BadgeCheck, accentClass: "text-success", ringClass: "ring-success" },
  status: { icon: Activity, accentClass: "text-primary", ringClass: "ring-primary" },
};

function fmtTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** A row on the vertical timeline rail (dot + icon, connected by a line). */
function TimelineRow({
  kind,
  at,
  children,
  last,
}: {
  kind: FixTranscriptKind;
  at: string;
  children: React.ReactNode;
  last: boolean;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* Rail */}
      <div className="relative flex flex-col items-center">
        <span
          className={cn(
            "z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-card ring-1",
            meta.ringClass,
          )}
        >
          <Icon aria-hidden className={cn("size-3.5", meta.accentClass)} />
        </span>
        {!last && (
          <span aria-hidden className="w-px flex-1 bg-border" />
        )}
      </div>
      {/* Body */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-bold capitalize text-card-foreground">
            {kind.replace(/_/g, " ")}
          </span>
          <time className="text-xs text-muted-foreground" dateTime={at}>
            {fmtTime(at)}
          </time>
        </div>
        {children}
      </div>
    </li>
  );
}

/** Long text block — collapses past a threshold. */
function CollapsibleText({ text }: { text: string }) {
  const long = text.length > 280;
  if (!long) {
    return <p className="whitespace-pre-wrap text-sm text-card-foreground">{text}</p>;
  }
  return (
    <Collapsible className="group flex flex-col gap-1">
      {/* Truncated preview, hidden once expanded. */}
      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-card-foreground group-data-[state=open]:hidden">
        {text}
      </p>
      <CollapsibleContent>
        <p className="whitespace-pre-wrap text-sm text-card-foreground">{text}</p>
      </CollapsibleContent>
      <CollapsibleTrigger className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronDown
          aria-hidden
          className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
        />
        <span className="group-data-[state=open]:hidden">Show full message</span>
        <span className="hidden group-data-[state=open]:inline">Show less</span>
      </CollapsibleTrigger>
    </Collapsible>
  );
}

/** Guess a risk class for a tool call from a result diff (no spec field on the turn). */
function inferRisk(turn: FixTranscriptTurn): ToolRisk {
  const r = turn.toolResult;
  if (!r) return "safe-write";
  if (!r.diff) return "read";
  return "safe-write";
}

export interface FixTranscriptViewProps {
  /** The ordered transcript turns. Append new turns to stream. */
  turns: FixTranscriptTurn[];
  /** Whether the session is still streaming (drives the live "thinking" cue). */
  streaming?: boolean;
  /**
   * Optional override for rendering a tool_call turn. Lets a host surface (e.g.
   * the AI console) inject its own ToolCallCard composition while reusing this
   * timeline. Defaults to the built-in {@link ToolCallCard}. Receives the
   * tool_call turn with its `toolResult` already folded in from the paired
   * tool_result turn when one immediately follows.
   */
  renderToolCall?: (turn: FixTranscriptTurn) => React.ReactNode;
  className?: string;
}

/**
 * FixTranscriptView — the fix run rendered as a scannable vertical timeline.
 *
 * Each FixTranscriptTurn is one rail row keyed by `kind`: model text,
 * tool_call (→ {@link ToolCallCard}, paired with its following tool_result when
 * present), observation, approval gate, verification, and engine status (→
 * StatusBadge, dot + icon + text, M5). Append-friendly for streaming: new turns
 * land in an `aria-live="polite"` region so assistive tech hears each step. Long
 * model blocks collapse; the whole transcript is copyable. No purple — this
 * timeline is shared by the Guided (blue) and AI surfaces.
 */
export function FixTranscriptView({
  turns,
  streaming = false,
  renderToolCall,
  className,
}: FixTranscriptViewProps) {
  const [copied, setCopied] = React.useState(false);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  // Pre-process: fold a tool_result immediately following its tool_call into the
  // same ToolCallCard. We render the call row and skip the consumed result.
  const rows = React.useMemo(() => {
    const out: Array<{ turn: FixTranscriptTurn; idx: number; pairedResult?: FixTranscriptTurn }> = [];
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (t.kind === "tool_result") {
        // If the previous emitted row was its call, it was already folded in.
        const prev = out[out.length - 1]?.turn;
        if (prev?.kind === "tool_call") continue;
      }
      if (t.kind === "tool_call") {
        const next = turns[i + 1];
        const paired =
          next?.kind === "tool_result" ? next : undefined;
        out.push({ turn: t, idx: i, pairedResult: paired });
        continue;
      }
      out.push({ turn: t, idx: i });
    }
    return out;
  }, [turns]);

  const handleCopy = React.useCallback(() => {
    const text = turns
      .map((t) => {
        const stamp = `[${fmtTime(t.at)}] ${t.kind}`;
        if (t.kind === "tool_call" && t.toolCall) {
          return `${stamp}: ${t.toolCall.name}(${JSON.stringify(t.toolCall.input)})`;
        }
        if (t.kind === "tool_result" && t.toolResult) {
          return `${stamp}: ${t.toolResult.summary}`;
        }
        if (t.kind === "status" && t.state) {
          return `${stamp}: ${STATE_LABEL[t.state]}`;
        }
        return `${stamp}: ${t.text ?? ""}`;
      })
      .join("\n");
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-subtle px-4 py-10 text-center",
          className,
        )}
      >
        <Activity aria-hidden className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No activity yet. The fix transcript will stream here.
        </p>
      </div>
    );
  }

  const lastTurn = turns[turns.length - 1];

  return (
    <section
      className={cn("flex flex-col gap-3", className)}
      aria-label="Fix transcript"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-card-foreground">Transcript</h3>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? (
            <Check aria-hidden className="size-3.5 text-success" />
          ) : (
            <Copy aria-hidden className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy transcript"}
        </button>
      </div>

      <ol className="flex flex-col">
        {rows.map(({ turn, idx, pairedResult }, rowIdx) => {
          const last = rowIdx === rows.length - 1 && !streaming;

          let body: React.ReactNode = null;
          switch (turn.kind) {
            case "tool_call": {
              const folded: FixTranscriptTurn = {
                ...turn,
                toolResult: pairedResult?.toolResult ?? turn.toolResult,
              };
              body = renderToolCall ? (
                renderToolCall(folded)
              ) : (
                <ToolCallCard
                  call={folded.toolCall}
                  result={folded.toolResult}
                  risk={inferRisk(pairedResult ?? turn)}
                />
              );
              break;
            }
            case "status":
              body = turn.state ? (
                <div className="flex items-center gap-2">
                  <StatusBadge state={STATE_TO_STATUS[turn.state]} size="sm" />
                  <span className="text-sm text-card-foreground">
                    {STATE_LABEL[turn.state]}
                  </span>
                </div>
              ) : (
                turn.text && <CollapsibleText text={turn.text} />
              );
              break;
            case "approval":
              body = (
                <div className="rounded-md border border-warning bg-warning-tint p-2.5 text-sm text-card-foreground">
                  {turn.text ?? "Approval requested."}
                </div>
              );
              break;
            case "tool_result":
              body = turn.toolResult ? (
                <p className="text-sm text-card-foreground">
                  {turn.toolResult.summary}
                </p>
              ) : (
                turn.text && <CollapsibleText text={turn.text} />
              );
              break;
            default:
              body = turn.text ? <CollapsibleText text={turn.text} /> : null;
          }

          return (
            <TimelineRow key={idx} kind={turn.kind} at={turn.at} last={last}>
              {body}
            </TimelineRow>
          );
        })}
      </ol>

      {/* Live region — announces the latest streamed turn to assistive tech. */}
      <div aria-live="polite" className="sr-only">
        {streaming && lastTurn
          ? `${lastTurn.kind.replace(/_/g, " ")}: ${
              lastTurn.text ??
              lastTurn.toolCall?.name ??
              lastTurn.toolResult?.summary ??
              (lastTurn.state ? STATE_LABEL[lastTurn.state] : "")
            }`
          : ""}
      </div>

      {streaming && (
        <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
          <Activity aria-hidden className="size-3.5 animate-pulse" />
          <span>Working…</span>
        </div>
      )}
    </section>
  );
}
