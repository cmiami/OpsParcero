"use client";

import * as React from "react";
import {
  Inbox,
  Eye,
  UserCheck,
  BellOff,
  CheckCircle2,
  Clock,
  Server,
  Lightbulb,
  Wrench,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { SeverityBadge } from "@/components/atoms/severity-badge";
import { OccurrenceCount } from "@/components/atoms/occurrence-count";
import { relativeTime } from "@/lib/format";
import { FAILURE_MODE_BY_ID } from "@/mock/reference";
import type { Alert } from "@/types";

export type TriageAction = "acknowledge" | "assign" | "snooze" | "resolve" | "fix";

export interface AlertTriageRowProps {
  /** The alert to triage. */
  alert: Alert;
  /** Display name for the affected asset (falls back to the asset id). */
  assetName?: string;
  /** Selection (bulk) state. */
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  /** Fired when the technician takes a triage action. */
  onTriage?: (action: TriageAction, alert: Alert) => void;
  className?: string;
}

const STATE_META: Record<
  Alert["state"],
  { label: string; icon: typeof Inbox; text: string }
> = {
  open: { label: "New", icon: Inbox, text: "text-critical" },
  acknowledged: { label: "Acknowledged", icon: Eye, text: "text-warning" },
  suppressed: { label: "Snoozed", icon: BellOff, text: "text-muted-foreground" },
  resolved: { label: "Resolved", icon: CheckCircle2, text: "text-success" },
  "auto-resolved": {
    label: "Auto-resolved",
    icon: CheckCircle2,
    text: "text-success",
  },
};

/**
 * AlertTriageRow — one triage-queue row (docs/10 §4.3).
 *
 * Shows the severity badge, alert title, affected asset + occurrence count, the
 * likely cause (from the failure mode), age, a triage-state marker, and quick
 * actions (Fix, Acknowledge, plus an overflow with Assign / Snooze / Resolve).
 * State reads by icon + text (never color alone, M5); icon-only controls carry
 * accessible names. "use client".
 */
export function AlertTriageRow({
  alert,
  assetName,
  selected,
  onSelectedChange,
  onTriage,
  className,
}: AlertTriageRowProps) {
  const stateMeta = STATE_META[alert.state];
  const StateIcon = stateMeta.icon;
  const mode = alert.failureModeId ? FAILURE_MODE_BY_ID[alert.failureModeId] : undefined;
  const likelyCause = mode?.title ?? alert.category;
  const isDecided = alert.state === "resolved" || alert.state === "auto-resolved";

  return (
    <div
      data-state={selected ? "selected" : undefined}
      className={cn(
        "flex items-center gap-3 border-b border-border bg-card px-3 py-2.5 transition-colors hover:bg-subtle",
        "data-[state=selected]:bg-primary-tint",
        className,
      )}
    >
      {onSelectedChange && (
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelectedChange(Boolean(v))}
          aria-label={`Select alert ${alert.title}`}
          className="shrink-0"
        />
      )}

      <div className="shrink-0">
        <SeverityBadge severity={alert.severity} size="sm" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 truncate text-sm font-bold text-card-foreground">
          {alert.title}
          {alert.isCosmetic && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-2xs font-bold text-muted-foreground">
              <Lightbulb aria-hidden className="size-3 shrink-0" />
              Cosmetic
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono">
            <Server aria-hidden className="size-3 shrink-0" />
            {assetName ?? alert.assetId ?? alert.clientId}
          </span>
          <span className="truncate">likely: {likelyCause}</span>
        </span>
      </div>

      <div className="hidden shrink-0 sm:block">
        <OccurrenceCount count={alert.occurrenceCount} />
      </div>

      <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground md:inline-flex">
        <Clock aria-hidden className="size-3 shrink-0" />
        {relativeTime(alert.firstSeenAt)}
      </span>

      <span
        className={cn(
          "hidden shrink-0 items-center gap-1 text-xs font-bold lg:inline-flex",
          stateMeta.text,
        )}
      >
        <StateIcon aria-hidden className="size-3.5 shrink-0" />
        {stateMeta.label}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {!isDecided && (
          <>
            <Button
              variant="default"
              size="sm"
              onClick={() => onTriage?.("fix", alert)}
            >
              <Wrench aria-hidden className="size-4" />
              <span className="hidden sm:inline">Fix</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Acknowledge alert"
              onClick={() => onTriage?.("acknowledge", alert)}
            >
              <Eye aria-hidden className="size-4" />
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="More triage actions"
            >
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onTriage?.("assign", alert)}>
              <UserCheck aria-hidden className="size-4" />
              Assign
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onTriage?.("snooze", alert)}>
              <BellOff aria-hidden className="size-4" />
              Snooze
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onTriage?.("resolve", alert)}>
              <CheckCircle2 aria-hidden className="size-4" />
              Resolve
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
