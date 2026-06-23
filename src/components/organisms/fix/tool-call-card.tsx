"use client";

import * as React from "react";
import {
  Eye,
  PencilLine,
  Flame,
  ChevronDown,
  Terminal,
  Undo2,
  Ban,
  FlaskConical,
  PlayCircle,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MonoLabel } from "@/components/atoms/mono-label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  FixTranscriptTurn,
  ToolResult,
  ToolRisk,
  StateDiff,
} from "@/lib/fix-client";

// ─────────────────────────────────────────────────────────────────────────────
// Risk metadata — token-bound, never color-only (M5).
// read → muted · safe-write → primary (blue) · destructive → critical (red).
// No purple here — this card is shared by guided (blue) and AI surfaces.
// ─────────────────────────────────────────────────────────────────────────────

interface RiskMeta {
  label: string;
  icon: LucideIcon;
  dotClass: string;
  textClass: string;
  tintClass: string;
  borderClass: string;
}

const RISK_META: Record<ToolRisk, RiskMeta> = {
  read: {
    label: "Read-only",
    icon: Eye,
    dotClass: "bg-muted-foreground",
    textClass: "text-muted-foreground",
    tintClass: "bg-muted",
    borderClass: "border-border",
  },
  "safe-write": {
    label: "Safe write",
    icon: PencilLine,
    dotClass: "bg-primary",
    textClass: "text-primary",
    tintClass: "bg-primary-tint",
    borderClass: "border-primary",
  },
  destructive: {
    label: "Destructive",
    icon: Flame,
    dotClass: "bg-critical",
    textClass: "text-critical",
    tintClass: "bg-critical-tint",
    borderClass: "border-critical",
  },
};

/** Risk chip — colored dot + lucide icon + text label (never color-only). */
function RiskChip({ risk }: { risk: ToolRisk }) {
  const meta = RISK_META[risk];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold",
        meta.tintClass,
        meta.textClass,
        meta.borderClass,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dotClass)} />
      <Icon aria-hidden className="size-3 shrink-0" />
      <span>{meta.label}</span>
    </span>
  );
}

/** Dry-run vs applied chip — icon + text (never color-only). */
function ModeChip({ dryRun }: { dryRun: boolean }) {
  const Icon = dryRun ? FlaskConical : PlayCircle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold",
        dryRun
          ? "border-border bg-subtle text-muted-foreground"
          : "border-primary bg-primary-tint text-primary",
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span>{dryRun ? "Dry run" : "Applied"}</span>
    </span>
  );
}

/** Reversible flag — icon + text. */
function ReversibleFlag({ reversible }: { reversible: boolean }) {
  const Icon = reversible ? Undo2 : Ban;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        reversible ? "text-muted-foreground" : "text-warning",
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span>{reversible ? "Reversible" : "Not reversible"}</span>
    </span>
  );
}

/** Outcome marker — ok/failed, icon + text (never color-only). */
function OutcomeMark({ ok }: { ok: boolean }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-bold",
        ok ? "text-success" : "text-critical",
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span>{ok ? "Succeeded" : "Failed"}</span>
    </span>
  );
}

/** Renders a value from a StateDiff cell as a verbatim string. */
function diffValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Before/after table — keyed by the union of before+after keys. */
function StateDiffTable({ diff }: { diff: StateDiff }) {
  const keys = React.useMemo(() => {
    const set = new Set<string>([
      ...Object.keys(diff.before ?? {}),
      ...Object.keys(diff.after ?? {}),
    ]);
    return Array.from(set);
  }, [diff]);

  if (keys.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-subtle">
              <TableHead className="h-8 text-xs">Field</TableHead>
              <TableHead className="h-8 text-xs">Before</TableHead>
              <TableHead className="h-8 text-xs">After</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => {
              const before = diffValue(diff.before?.[k]);
              const after = diffValue(diff.after?.[k]);
              const changed = before !== after;
              return (
                <TableRow key={k}>
                  <TableCell className="py-1.5 align-top font-mono text-xs text-muted-foreground">
                    {k}
                  </TableCell>
                  <TableCell className="py-1.5 align-top font-mono text-xs text-foreground">
                    {before}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "py-1.5 align-top font-mono text-xs",
                      changed ? "font-bold text-primary" : "text-foreground",
                    )}
                  >
                    {after}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {diff.note && (
        <p className="text-xs text-muted-foreground">{diff.note}</p>
      )}
    </div>
  );
}

export interface ToolCallCardProps {
  /** A transcript turn whose toolCall (and optionally toolResult) is rendered. */
  turn?: FixTranscriptTurn;
  /** Or pass the call/result directly (e.g. composing outside a transcript). */
  call?: { id: string; name: string; input: unknown };
  result?: ToolResult;
  /** The tool's risk class (read / safe-write / destructive). */
  risk?: ToolRisk;
  /** Whether the call was a dry run (preview) vs applied. Defaults to applied. */
  dryRun?: boolean;
  /** Whether the underlying action is reversible. */
  reversible?: boolean;
  /** Start with stdout/exit expanded. */
  defaultOpen?: boolean;
  className?: string;
}

/** Compact one-line summary of the tool input for the header. */
function summarizeInput(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === "string") return input;
  if (typeof input !== "object") return String(input);
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries
    .map(([k, v]) => `${k}=${diffValue(v)}`)
    .join("  ");
}

/**
 * ToolCallCard — one tool call in a fix transcript.
 *
 * Renders the tool name, a token-bound risk chip (dot + icon + text — never
 * color-only, M5), a monospace input summary, the StateDiff before/after as a
 * compact two-column table, a dry-run-vs-applied chip, the reversible flag, and
 * a collapsible monospace stdout pane. Shared by the Guided (blue) and AI
 * surfaces, so it carries no purple — the AI register lives on its container.
 */
export function ToolCallCard({
  turn,
  call: callProp,
  result: resultProp,
  risk = "safe-write",
  dryRun = false,
  reversible = true,
  defaultOpen = false,
  className,
}: ToolCallCardProps) {
  const call = callProp ?? turn?.toolCall;
  const result = resultProp ?? turn?.toolResult;

  if (!call) return null;

  const inputSummary = summarizeInput(call.input);
  const diff = result?.diff;
  const output = result?.output?.trim();
  const ticket = result?.opensTicket;

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground",
        className,
      )}
    >
      {/* Header: tool name + risk + mode */}
      <header className="flex flex-wrap items-center gap-2">
        <Terminal aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-mono text-sm font-bold">{call.name}</span>
        <RiskChip risk={risk} />
        <ModeChip dryRun={dryRun} />
        {result && (
          <span className="ml-auto">
            <OutcomeMark ok={result.ok} />
          </span>
        )}
      </header>

      {/* Input summary */}
      {inputSummary && (
        <div className="flex items-start gap-2">
          <span className="mt-1 shrink-0 text-xs font-medium text-muted-foreground">
            Input
          </span>
          <MonoLabel
            copyable
            copyValue={inputSummary}
            className="max-w-full items-start whitespace-pre-wrap break-all"
          >
            {inputSummary}
          </MonoLabel>
        </div>
      )}

      {/* Result summary */}
      {result?.summary && (
        <p className="text-sm text-card-foreground">{result.summary}</p>
      )}

      {/* State diff */}
      {diff && <StateDiffTable diff={diff} />}

      {/* Ticket */}
      {ticket && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground">Opened ticket</span>
          <MonoLabel copyable>{ticket}</MonoLabel>
        </div>
      )}

      {/* Collapsible stdout */}
      {output && (
        <Collapsible defaultOpen={defaultOpen} className="flex flex-col gap-1.5">
          <CollapsibleTrigger className="group inline-flex w-fit items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronDown
              aria-hidden
              className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
            />
            Console output
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="max-h-64 overflow-auto rounded-md border border-border bg-subtle p-2.5 font-mono text-xs leading-relaxed text-foreground">
              {output}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Footer: reversible flag */}
      <footer className="flex items-center justify-between border-t border-border pt-2">
        <ReversibleFlag reversible={reversible} />
        {result?.healed != null && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-bold",
              result.healed ? "text-success" : "text-muted-foreground",
            )}
          >
            <CheckCircle2 aria-hidden className="size-3 shrink-0" />
            {result.healed ? "Issue healed" : "Not yet healed"}
          </span>
        )}
      </footer>
    </article>
  );
}
