"use client";

import * as React from "react";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Settings2,
  ArrowUpCircle,
  AlertTriangle,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MonoLabel } from "@/components/atoms/mono-label";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { ISODateTime } from "@/types";

export type TimelineEventKind =
  | "run-success"
  | "run-failed"
  | "run-running"
  | "config-change"
  | "agent-update"
  | "remediation"
  | "verification"
  | "alert";

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  at: ISODateTime;
  title: string;
  detail?: string;
  /** Verbatim error/code, rendered in a MonoLabel. */
  mono?: string;
}

export interface AssetTimelineProps {
  /** Ordered events (newest first preferred; the component sorts defensively). */
  events?: TimelineEvent[];
  /** Highlight failure/remediation events (dims successes). */
  failureFocused?: boolean;
  className?: string;
}

const KIND_META: Record<
  TimelineEventKind,
  { icon: LucideIcon; dot: string; text: string; label: string }
> = {
  "run-success": { icon: CheckCircle2, dot: "bg-success", text: "text-success", label: "Backup succeeded" },
  "run-failed": { icon: XCircle, dot: "bg-critical", text: "text-critical", label: "Backup failed" },
  "run-running": { icon: RefreshCw, dot: "bg-status-syncing", text: "text-status-syncing", label: "Backup running" },
  "config-change": { icon: Settings2, dot: "bg-primary", text: "text-primary", label: "Config change" },
  "agent-update": { icon: ArrowUpCircle, dot: "bg-primary", text: "text-primary", label: "Agent update" },
  remediation: { icon: Wrench, dot: "bg-fix-guided", text: "text-fix-guided", label: "Remediation" },
  verification: { icon: ShieldCheck, dot: "bg-success", text: "text-success", label: "Verification" },
  alert: { icon: AlertTriangle, dot: "bg-warning", text: "text-warning", label: "Alert raised" },
};

const DEFAULT_EVENTS: TimelineEvent[] = [
  {
    id: "ev-1",
    kind: "verification",
    at: "2026-06-22T13:19:00Z",
    title: "Screenshot verification passed",
    detail: "Boot test verified via local virtualization.",
  },
  {
    id: "ev-2",
    kind: "remediation",
    at: "2026-06-22T12:50:00Z",
    title: "Reset VSS Writers + Retry applied",
    detail: "Next backup completed application-consistent.",
  },
  {
    id: "ev-3",
    kind: "run-failed",
    at: "2026-06-21T02:31:00Z",
    title: "Backup failed — VSS snapshot",
    detail: "Fell back to crash-consistent DBD.",
    mono: "BKP1410 VSS failed to prepare snapshots",
  },
  {
    id: "ev-4",
    kind: "agent-update",
    at: "2026-06-21T02:14:00Z",
    title: "Windows update installed (RMM)",
    detail: "KB5036* applied; reboot pending.",
  },
  {
    id: "ev-5",
    kind: "run-success",
    at: "2026-06-20T02:00:00Z",
    title: "Backup succeeded",
    detail: "Incremental · 412 GB transferred.",
  },
];

/**
 * AssetTimeline — a vertical event timeline for an asset or a run (docs/10 §4.3).
 *
 * An ordered list (newest-first) of run / config / update / remediation /
 * verification / alert events, each with a colored kind dot, a lucide icon, a
 * title, a relative + absolute timestamp, and an optional verbatim error in a
 * MonoLabel. Real timestamps are rendered as text so the timeline isn't
 * color-only (M5). `failureFocused` dims successes to spotlight the break.
 * "use client".
 */
export function AssetTimeline({
  events: eventsProp,
  failureFocused,
  className,
}: AssetTimelineProps) {
  const events = React.useMemo(() => {
    const list = eventsProp ?? DEFAULT_EVENTS;
    return [...list].sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [eventsProp]);

  if (events.length === 0) {
    return (
      <p
        className={cn(
          "rounded-md border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No events recorded yet.
      </p>
    );
  }

  return (
    <ol
      aria-label="Asset event timeline"
      className={cn("relative flex flex-col", className)}
    >
      {events.map((event, i) => {
        const meta = KIND_META[event.kind];
        const Icon = meta.icon;
        const isLast = i === events.length - 1;
        const dimmed =
          failureFocused &&
          (event.kind === "run-success" || event.kind === "verification");
        return (
          <li key={event.id} className={cn("flex gap-3", dimmed && "opacity-50")}>
            {/* Rail */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full bg-card ring-2 ring-border",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "size-3.5",
                    meta.text,
                    event.kind === "run-running" && "animate-spin",
                  )}
                />
              </span>
              {!isLast && <span className="w-px flex-1 bg-border" />}
            </div>

            {/* Content */}
            <div className={cn("flex min-w-0 flex-1 flex-col gap-1 pb-5")}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className={cn("text-sm font-bold", meta.text)}>
                  {meta.label}
                </span>
                <time
                  dateTime={event.at}
                  title={formatDateTime(event.at)}
                  className="text-xs text-muted-foreground"
                >
                  {relativeTime(event.at)}
                </time>
              </div>
              <span className="text-sm text-card-foreground">{event.title}</span>
              {event.detail && (
                <span className="text-xs text-muted-foreground">{event.detail}</span>
              )}
              {event.mono && (
                <MonoLabel copyable className="mt-0.5">
                  {event.mono}
                </MonoLabel>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
