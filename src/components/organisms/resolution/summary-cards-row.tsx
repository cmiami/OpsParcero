"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { SummaryCard } from "@/components/molecules/summary-card";
import { getFleetStats, getIssues, type FleetStats } from "@/mock/query";
import type { ClientId, Issue } from "@/types";

export interface SummaryCardsRowProps {
  /** Pre-fetched stats; falls back to `getFleetStats()`. */
  stats?: FleetStats;
  /** Active tenant — scopes the "top problem" to that client's issues. */
  clientId?: ClientId;
  /** Click-through for a card (e.g. to open the impacted-assets list). */
  onSelectTopProblem?: (issue: Issue) => void;
  className?: string;
}

/**
 * SummaryCardsRow — the at-a-glance tile row on the Resolution Center home.
 *
 * Deliberately NON-uniform (impeccable bans the identical-card grid, M2/M4): the
 * "Top problem of the day" card spans two columns and carries the headline as a
 * string, while Open / Critical / End-to-end-fixable are compact numeric tiles
 * with role-colored top borders. Each card's tone is paired with a colored label
 * so the role never reads by hue alone (M5).
 */
export function SummaryCardsRow({
  stats,
  clientId,
  onSelectTopProblem,
  className,
}: SummaryCardsRowProps) {
  const s = stats ?? getFleetStats(clientId);

  // The worst issue currently open is the "top problem of the day" — scoped to
  // the active tenant so it can't contradict the scoped counts beside it.
  const topProblem = React.useMemo<Issue | undefined>(() => {
    const issues = getIssues(clientId ? { clientIds: [clientId] } : {});
    const sorted = [...issues].sort((a, b) => {
      const sev =
        (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1);
      if (sev !== 0) return sev;
      return b.occurrenceCount - a.occurrenceCount;
    });
    return sorted[0];
  }, [clientId]);

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 lg:grid-cols-5",
        className,
      )}
    >
      {/* Top problem — wide, headline as a string */}
      <SummaryCard
        className="col-span-2 lg:col-span-2"
        tone="critical"
        label="Top problem of the day"
        value={
          <span className="block truncate text-base font-bold leading-snug">
            {topProblem ? topProblem.title : "No open issues"}
          </span>
        }
        sublabel={
          topProblem
            ? `${topProblem.occurrenceCount} occurrences · ${topProblem.impactedAssetIds.length} assets`
            : "Fleet is clear"
        }
        onClick={
          topProblem && onSelectTopProblem
            ? () => onSelectTopProblem(topProblem)
            : undefined
        }
      />

      <SummaryCard
        tone="default"
        label="Open issues"
        value={s.openIssues}
        sublabel={`${s.openAlerts} underlying alerts`}
      />

      <SummaryCard
        tone="critical"
        label="Critical issues"
        value={s.criticalIssues}
        sublabel={`${s.failedAssets} failed assets`}
      />

      <SummaryCard
        tone="success"
        label="End-to-end fixable"
        value={s.endToEndFixable}
        sublabel={`${s.guidedFixable} guided · ${s.insightsOnly} insights`}
      />
    </div>
  );
}
