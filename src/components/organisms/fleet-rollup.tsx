"use client";

import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { STATUS_META, rollupStatus } from "@/lib/status";
import type { AssetStatus, StatusRollup } from "@/types";
import { getFleetStats } from "@/mock/query";
import { StatusBadge } from "@/components/atoms/status-badge";
import { SeverityChip } from "@/components/molecules/severity-chip";

export interface FleetRollupProps {
  /**
   * Per-status counts. Defaults to the seeded fleet snapshot. Accepts a full
   * StatusRollup or a partial record of {status: count}.
   */
  stats?: Partial<Record<AssetStatus, number>> | StatusRollup;
  /** Donut size — maps to a fixed token dimension (`md` default). */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Token-bound donut dimensions: container class + recharts radii (px). */
const DONUT_SIZE: Record<NonNullable<FleetRollupProps["size"]>, {
  box: string;
  inner: number;
  outer: number;
}> = {
  sm: { box: "size-32", inner: 40, outer: 60 },
  md: { box: "size-40", inner: 50, outer: 75 },
  lg: { box: "size-52", inner: 66, outer: 98 },
};

/** Worst-first display order for legend + donut segments. */
const ORDER: AssetStatus[] = [
  "failed",
  "warning",
  "offline",
  "syncing",
  "paused",
  "protected",
];

/**
 * Each status maps to its token via a CSS variable (not a raw hex — recharts
 * needs a concrete color string, so we hand it the design token itself).
 */
const FILL_VAR: Record<AssetStatus, string> = {
  failed: "var(--status-failed)",
  warning: "var(--status-warning)",
  offline: "var(--status-offline)",
  syncing: "var(--status-syncing)",
  paused: "var(--status-paused)",
  protected: "var(--status-protected)",
};

function countFor(
  stats: FleetRollupProps["stats"],
  s: AssetStatus,
): number {
  return (stats as Record<string, number>)?.[s] ?? 0;
}

/**
 * FleetRollup — worst-real-child fleet health.
 *
 * A soft, gridless recharts donut over the per-status counts, with the rolled-up
 * worst-real-child state called out in the center (dot+icon+label via
 * StatusBadge, M5) and a SeverityChip legend row beneath. The legend gives every
 * segment a text label + count so the chart is never color-only (M5).
 */
export function FleetRollup({ stats, size = "md", className }: FleetRollupProps) {
  const source = React.useMemo(
    () => stats ?? deriveFromFleet(),
    [stats],
  );

  const segments = ORDER.map((s) => ({
    status: s,
    label: STATUS_META[s].label,
    count: countFor(source, s),
    fill: FILL_VAR[s],
  })).filter((seg) => seg.count > 0);

  const total = segments.reduce((sum, seg) => sum + seg.count, 0);
  const present = segments.map((seg) => seg.status);
  const worst = rollupStatus(present);
  const dim = DONUT_SIZE[size];

  // Render the donut only after mount — ResponsiveContainer measures its parent,
  // which has no size during the static prerender (Recharts width(-1)).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:gap-6",
        className,
      )}
    >
      <div className={cn("relative shrink-0", dim.box)}>
        {total > 0 && mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={segments}
                dataKey="count"
                nameKey="label"
                innerRadius={dim.inner}
                outerRadius={dim.outer}
                paddingAngle={total > 1 ? 2 : 0}
                strokeWidth={0}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
              >
                {segments.map((seg) => (
                  <Cell key={seg.status} fill={seg.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex size-full items-center justify-center rounded-full border border-dashed border-border" />
        )}
        {/* Center: total + the worst-real-child rollup badge. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <span className="font-display text-2xl font-bold tabular-nums leading-none text-foreground">
            {total}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
            assets
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
            Fleet status
          </span>
          <StatusBadge state={worst} size="sm" />
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Fleet status breakdown">
          {segments.map((seg) => (
            <li key={seg.status}>
              <SeverityChip state={seg.status} count={seg.count} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Build the default per-status snapshot from the seeded fleet stats. */
function deriveFromFleet(): Record<AssetStatus, number> {
  const fs = getFleetStats();
  const known: Record<AssetStatus, number> = {
    failed: fs.failedAssets,
    warning: fs.warningAssets,
    protected: fs.protectedAssets,
    paused: 0,
    syncing: 0,
    offline: 0,
  };
  // Distribute the remainder across the non-headline states so the donut totals
  // the real fleet size (deterministic, derived from the seed — no randomness).
  const accounted = known.failed + known.warning + known.protected;
  const remainder = Math.max(0, fs.totalAssets - accounted);
  known.offline = Math.round(remainder * 0.4);
  known.syncing = Math.round(remainder * 0.35);
  known.paused = remainder - known.offline - known.syncing;
  return known;
}
