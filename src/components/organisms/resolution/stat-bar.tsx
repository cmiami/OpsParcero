"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRODUCT_META } from "@/lib/status";
import { getFleetStats, getActiveOutage, type FleetStats } from "@/mock/query";
import type { Incident, ProductBucket } from "@/types";
import { OutageModal } from "./outage-modal";

export interface StatBarProps {
  /** Pre-fetched stats; falls back to `getFleetStats()` for standalone use. */
  stats?: FleetStats;
  /** Pre-fetched active outage; falls back to `getActiveOutage()`. */
  outage?: Incident | null;
  className?: string;
}

/** Deterministic per-product delta direction, derived from the bucket's open count. */
function deltaFor(bucket: ProductBucket, openIssues: number): {
  dir: "up" | "down" | "flat";
  value: number;
} {
  // Even open counts trended down (improving); odd trended up; zero is flat.
  if (openIssues === 0) return { dir: "flat", value: 0 };
  const dir = openIssues % 2 === 0 ? "down" : "up";
  // A small, stable magnitude derived from the count (no randomness at render).
  const value = ((openIssues * 3 + bucket.length) % 9) + 1;
  return { dir, value };
}

/**
 * StatBar — the thin strip under the topbar on the Resolution Center home.
 *
 * Surfaces resolved-today / resolved-this-month counts, a per-product delta
 * trio (▲/▼ with a directional icon + sign, never color-only, M5), and an
 * active-outage indicator that opens the outage modal. Sits on `bg-subtle` per
 * the design system (§9 stat bar).
 */
export function StatBar({ stats, outage, className }: StatBarProps) {
  const s = stats ?? getFleetStats();
  const incident = outage === undefined ? getActiveOutage() ?? null : outage;
  const [open, setOpen] = React.useState(false);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-subtle px-4 py-2 text-xs sm:px-5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-bold tabular-nums text-card-foreground">
          {s.resolvedToday}
        </span>
        <span className="text-muted-foreground">resolved today</span>
      </div>

      <div
        className="hidden h-3 w-px shrink-0 bg-border sm:block"
        aria-hidden
      />

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {s.perProduct.map((p) => {
          const meta = PRODUCT_META[p.bucket];
          const d = deltaFor(p.bucket, p.openIssues);
          const Icon =
            d.dir === "up" ? TrendingUp : d.dir === "down" ? TrendingDown : Minus;
          // Fewer open issues is good (down = green); more is bad (up = critical).
          const tone =
            d.dir === "down"
              ? "text-success"
              : d.dir === "up"
                ? "text-critical"
                : "text-muted-foreground";
          return (
            <li
              key={p.bucket}
              className="flex items-center gap-1.5"
              aria-label={`${meta.label}: ${p.openIssues} open issues, trend ${d.dir}`}
            >
              <span className="text-muted-foreground">{meta.label}</span>
              <span className="font-bold tabular-nums text-card-foreground">
                {p.openIssues}
              </span>
              <span className={cn("flex items-center gap-0.5 font-bold", tone)}>
                <Icon aria-hidden className="size-3 shrink-0" />
                {d.dir !== "flat" && (
                  <span className="tabular-nums">
                    {d.dir === "down" ? "−" : "+"}
                    {d.value}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {incident && (
        <>
          <div className="ml-auto" />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-critical bg-critical-tint px-2.5 py-1 text-xs font-bold text-critical transition-colors hover:bg-critical hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-critical focus-visible:ring-offset-2 focus-visible:ring-offset-subtle"
          >
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-critical" />
            <AlertOctagon aria-hidden className="size-3.5 shrink-0" />
            Active outage
          </button>
          <OutageModal incident={incident} open={open} onOpenChange={setOpen} />
        </>
      )}
    </div>
  );
}
