"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  User,
  Workflow,
  Cog,
  Clock,
  CheckCircle2,
  XCircle,
  CircleSlash2,
  AlertTriangle,
  Undo2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, formatDurationSec } from "@/lib/format";
import type {
  ActionRun,
  ActionRunState,
  BackupRun,
  RunState,
  ActionScope,
} from "@/types";
import { getActionRuns } from "@/mock/query";
import { ACTION_BY_ID } from "@/mock/reference";
import { MonoLabel } from "@/components/atoms/mono-label";
import { DataTable } from "./data-table";

/** A normalized row so we can render BackupRun[] or ActionRun[] uniformly. */
interface RunRow {
  id: string;
  name: string;
  trigger: { kind: "user" | "playbook" | "policy" | "schedule"; label: string };
  at?: string;
  scope?: ActionScope;
  assetCount: number;
  outcome: ActionRunState | RunState;
  durationSec?: number;
}

export interface RunHistoryTableProps {
  /** ActionRun[] (default) or BackupRun[]. Type is inferred per-row. */
  runs?: ActionRun[] | BackupRun[];
  density?: "default" | "compact";
  isLoading?: boolean;
  error?: string;
  className?: string;
}

function isActionRun(r: ActionRun | BackupRun): r is ActionRun {
  return "actionId" in r;
}

const TRIGGER_META: Record<RunRow["trigger"]["kind"], { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  user: { icon: User, label: "User" },
  playbook: { icon: Workflow, label: "Playbook" },
  policy: { icon: Cog, label: "Policy" },
  schedule: { icon: Clock, label: "Schedule" },
};

const SCOPE_LABEL: Record<ActionScope, string> = {
  once: "Once",
  "all-matching": "All matching",
  always: "Always",
};

interface OutcomeVisual {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  textClass: string;
  tintClass: string;
  dotClass: string;
  spin?: boolean;
}

/** Map an action-run or backup-run state to its dot+icon+label chip (M5). */
function outcomeVisual(outcome: ActionRunState | RunState): OutcomeVisual {
  switch (outcome) {
    case "succeeded":
    case "success":
    case "success-crash-consistent":
      return { label: "Succeeded", icon: CheckCircle2, textClass: "text-success", tintClass: "bg-success-tint", dotClass: "bg-success" };
    case "failed":
      return { label: "Failed", icon: XCircle, textClass: "text-critical", tintClass: "bg-critical-tint", dotClass: "bg-critical" };
    case "partial":
      return { label: "Partial", icon: AlertTriangle, textClass: "text-warning", tintClass: "bg-warning-tint", dotClass: "bg-warning" };
    case "rolled-back":
      return { label: "Rolled back", icon: Undo2, textClass: "text-muted-foreground", tintClass: "bg-muted", dotClass: "bg-muted-foreground" };
    case "running":
      return { label: "Running", icon: Loader2, textClass: "text-status-syncing", tintClass: "bg-status-syncing-tint", dotClass: "bg-status-syncing", spin: true };
    case "queued":
    case "awaiting-approval":
      return { label: "Queued", icon: Clock, textClass: "text-status-syncing", tintClass: "bg-status-syncing-tint", dotClass: "bg-status-syncing" };
    case "skipped":
    case "cancelled":
    case "stuck":
      return { label: "Skipped", icon: CircleSlash2, textClass: "text-muted-foreground", tintClass: "bg-muted", dotClass: "bg-muted-foreground" };
    default:
      return { label: "Unknown", icon: CircleSlash2, textClass: "text-muted-foreground", tintClass: "bg-muted", dotClass: "bg-muted-foreground" };
  }
}

function durationOf(startedAt?: string, finishedAt?: string): number | undefined {
  if (!startedAt || !finishedAt) return undefined;
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : undefined;
}

function toRow(r: ActionRun | BackupRun): RunRow {
  if (isActionRun(r)) {
    return {
      id: r.id,
      name: ACTION_BY_ID[r.actionId]?.label ?? r.actionId,
      trigger: { kind: r.triggeredBy.kind, label: r.triggeredBy.refId },
      at: r.startedAt ?? r.finishedAt,
      scope: r.scope,
      assetCount: r.targetRefs.length,
      outcome: r.state,
      durationSec: durationOf(r.startedAt, r.finishedAt),
    };
  }
  return {
    id: r.id,
    name: r.mode === "saas-sync" ? "SaaS sync" : `${r.mode[0].toUpperCase()}${r.mode.slice(1)} backup`,
    trigger: { kind: "schedule", label: "Scheduled" },
    at: r.startedAt,
    scope: "once",
    assetCount: 1,
    outcome: r.state,
    durationSec: durationOf(r.startedAt, r.finishedAt),
  };
}

const COLUMNS: ColumnDef<RunRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Action",
    meta: { label: "Action" },
    cell: ({ row }) => (
      <span className="font-bold text-foreground">{row.original.name}</span>
    ),
  },
  {
    id: "trigger",
    accessorFn: (r) => r.trigger.kind,
    header: "Triggered by",
    meta: { label: "Triggered by" },
    cell: ({ row }) => {
      const m = TRIGGER_META[row.original.trigger.kind];
      const Icon = m.icon;
      return (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon aria-hidden className="size-3.5 shrink-0 text-faint-foreground" />
          {m.label}
        </span>
      );
    },
  },
  {
    id: "at",
    accessorKey: "at",
    header: "When",
    meta: { label: "When" },
    cell: ({ row }) =>
      row.original.at ? (
        <MonoLabel title={row.original.at}>{formatDateTime(row.original.at)}</MonoLabel>
      ) : (
        <span className="text-xs text-faint-foreground">—</span>
      ),
  },
  {
    id: "scope",
    accessorKey: "scope",
    header: "Scope",
    meta: { label: "Scope" },
    cell: ({ row }) =>
      row.original.scope ? (
        <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
          {SCOPE_LABEL[row.original.scope]}
        </span>
      ) : null,
  },
  {
    id: "assetCount",
    accessorKey: "assetCount",
    header: "Assets",
    meta: { label: "Assets", numeric: true },
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">{row.original.assetCount}</span>
    ),
  },
  {
    id: "outcome",
    accessorKey: "outcome",
    header: "Outcome",
    meta: { label: "Outcome" },
    cell: ({ row }) => {
      const v = outcomeVisual(row.original.outcome);
      const Icon = v.icon;
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-bold",
            v.tintClass,
            v.textClass,
          )}
        >
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", v.dotClass)}
          />
          <Icon
            aria-hidden
            className={cn("size-3.5 shrink-0", v.spin && "animate-spin")}
          />
          {v.label}
        </span>
      );
    },
  },
  {
    id: "duration",
    accessorKey: "durationSec",
    header: "Duration",
    meta: { label: "Duration", numeric: true },
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.durationSec != null
          ? formatDurationSec(row.original.durationSec)
          : "—"}
      </span>
    ),
  },
];

/**
 * RunHistoryTable — append-only run log for ActionRun[] (default) or BackupRun[].
 *
 * A DataTable preset that normalizes either run type into one row shape: action
 * name · triggered-by (icon+label) · when (mono) · scope chip · asset count ·
 * outcome chip (dot+icon+label, M5) · duration. Read-only history, newest first.
 */
export function RunHistoryTable({
  runs,
  density = "default",
  isLoading,
  error,
  className,
}: RunHistoryTableProps) {
  const rows = React.useMemo<RunRow[]>(() => {
    const source = runs ?? getActionRuns();
    return source.map(toRow);
  }, [runs]);

  return (
    <DataTable<RunRow>
      className={className}
      columns={COLUMNS}
      data={rows}
      isLoading={isLoading}
      error={error}
      density={density}
      columnPicker
      getRowId={(r) => r.id}
      caption="Run history"
      emptyTitle="No runs yet"
      emptyHint="Action and backup runs will appear here as they execute."
    />
  );
}
