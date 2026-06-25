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

/** Token-bound donut box per size. */
const DONUT_BOX: Record<NonNullable<FleetRollupProps["size"]>, string> = {
  sm: "size-32",
  md: "size-40",
  lg: "size-52",
};

// Radii as PERCENTAGES of the rendered box — never absolute px. The root is
// 13px (intentional density), so `size-40` is ~130px, not 160px; an absolute
// outerRadius sized for 160px overflowed the SVG and got clipped flat by the
// square viewport into a "squircle". Percentages fit any box + any root. The
// ~36% ring thickness leaves the hole free for the center total.
const INNER_RADIUS = "60%";
const OUTER_RADIUS = "96%";

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
  const box = DONUT_BOX[size];
  // A single-status fleet is one full ring: drop the segment separator + corner
  // rounding so it closes seamlessly (otherwise the stroke + cornerRadius leave a
  // faint card-colored notch at the start/end seam).
  const single = segments.length === 1;

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
      <div className={cn("relative shrink-0", box)}>
        {total > 0 && mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={segments}
                dataKey="count"
                nameKey="label"
                innerRadius={INNER_RADIUS}
                outerRadius={OUTER_RADIUS}
                // Separate segments with a thin card-colored stroke instead of an
                // angular gap (paddingAngle) — a gap shrinks the tiny tail wedges
                // into spikes; a stroke delineates without distorting them. A lone
                // full-ring segment needs neither (no seam to hide).
                stroke="var(--card)"
                strokeWidth={single ? 0 : 2}
                cornerRadius={single ? 0 : 2}
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
          <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
            assets
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
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
