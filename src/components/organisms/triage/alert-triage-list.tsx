"use client";

import * as React from "react";
import { Inbox, CheckCheck, BellOff, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriageRow, type TriageAction } from "./alert-triage-row";
import { getOpenAlerts } from "@/mock/query";
import { useActiveClientId } from "@/stores/use-active-client";
import type { Alert } from "@/types";

export interface AlertTriageListProps {
  /** Alerts to render; defaults to all open alerts (severity-sorted). */
  alerts?: Alert[];
  /** Group rows by failure category. */
  groupBy?: "none" | "category";
  /** Fired when a row's triage action is invoked. */
  onTriage?: (action: TriageAction, alert: Alert) => void;
  className?: string;
}

/** Severity-first ordering: critical before warning, newest first within. */
function sortAlerts(alerts: Alert[]): Alert[] {
  const sevRank: Record<Alert["severity"], number> = {
    critical: 0,
    warning: 1,
    info: 2,
    success: 3,
  };
  return [...alerts].sort(
    (a, b) =>
      sevRank[a.severity] - sevRank[b.severity] ||
      (a.firstSeenAt < b.firstSeenAt ? 1 : -1),
  );
}

/**
 * AlertTriageList — the triage-queue surface (docs/10 §4.3, docs/09 §3).
 *
 * Renders a severity-sorted list of AlertTriageRows with bulk selection (a
 * select-all header + a sliding bulk toolbar with Fix / Acknowledge / Snooze),
 * optional grouping by failure category, and a first-class empty state. The
 * bulk toolbar is a named `role="toolbar"`. "use client".
 */
export function AlertTriageList({
  alerts: alertsProp,
  groupBy = "none",
  onTriage,
  className,
}: AlertTriageListProps) {
  const activeClientId = useActiveClientId();
  const alerts = React.useMemo(
    () =>
      sortAlerts(
        alertsProp ??
          getOpenAlerts({
            clientIds: activeClientId ? [activeClientId] : undefined,
          }),
      ),
    [alertsProp, activeClientId],
  );

  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const allSelected = alerts.length > 0 && selected.size === alerts.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(alerts.map((a) => a.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function bulk(action: TriageAction) {
    alerts
      .filter((a) => selected.has(a.id))
      .forEach((a) => onTriage?.(action, a));
    setSelected(new Set());
  }

  if (alerts.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center",
          className,
        )}
      >
        <CheckCheck aria-hidden className="size-8 text-success" />
        <p className="text-sm font-bold text-card-foreground">Queue is clear</p>
        <p className="text-xs text-muted-foreground">
          No open alerts to triage. New failures will appear here.
        </p>
      </div>
    );
  }

  const groups: { key: string; label: string; items: Alert[] }[] =
    groupBy === "category"
      ? Object.entries(
          alerts.reduce<Record<string, Alert[]>>((acc, a) => {
            (acc[a.category] ??= []).push(a);
            return acc;
          }, {}),
        ).map(([label, items]) => ({ key: label, label, items }))
      : [{ key: "all", label: "All alerts", items: alerts }];

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {/* Header / select-all */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2">
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={(v) => toggleAll(v === true)}
          aria-label="Select all alerts"
        />
        <span className="flex items-center gap-1.5 text-sm font-bold text-card-foreground">
          <Inbox aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {alerts.length} open alert{alerts.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk triage actions"
          className="flex items-center gap-2 border-b border-border bg-primary px-3 py-2 text-primary-foreground"
        >
          <span className="text-sm font-bold tabular-nums">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => bulk("fix")}
          >
            <Wrench aria-hidden className="size-4" />
            Fix
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => bulk("acknowledge")}
          >
            <CheckCheck aria-hidden className="size-4" />
            Acknowledge
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => bulk("snooze")}
          >
            <BellOff aria-hidden className="size-4" />
            Snooze
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-primary-foreground hover:bg-primary-strong"
            aria-label="Clear selection"
            onClick={() => setSelected(new Set())}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>
      )}

      {/* Rows */}
      <ScrollArea className="max-h-[34rem]">
        {groups.map((group) => (
          <div key={group.key}>
            {groupBy === "category" && (
              <div className="sticky top-0 z-10 border-b border-border bg-subtle px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
                {group.label} ({group.items.length})
              </div>
            )}
            {group.items.map((alert) => (
              <AlertTriageRow
                key={alert.id}
                alert={alert}
                selected={selected.has(alert.id)}
                onSelectedChange={(v) => toggleOne(alert.id, v)}
                onTriage={onTriage}
              />
            ))}
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
