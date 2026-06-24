import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface KpiTileProps {
  /** Faint uppercase metric name. */
  label: string;
  /** The headline value (already formatted). */
  value: string | number;
  /** Magnitude of change vs. the comparison period, e.g. "12%" or "+8". */
  delta?: string;
  /** Direction of the delta — drives the arrow icon, sign, and color. */
  deltaDir?: "up" | "down";
  /** Secondary context under the value, e.g. "vs. last 7 days". */
  sublabel?: string;
  /** Optional sparkline data (oldest → newest). */
  trend?: number[];
  /** Render the skeleton placeholder. */
  loading?: boolean;
  className?: string;
}

/** Build an SVG polyline `points` string for the trend, normalized to the box. */
function sparkPoints(trend: number[], w: number, h: number): string {
  if (trend.length < 2) return "";
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const span = max - min || 1;
  const step = w / (trend.length - 1);
  return trend
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * KpiTile — a single metric tile (Tremor-style), not a nested card.
 *
 * Renders a faint uppercase label, a large tabular value, an optional delta
 * (arrow icon + sign + percentage — never color-only, M5), an optional
 * sublabel, and an optional inline SVG sparkline. `loading` swaps in skeletons.
 */
export function KpiTile({
  label,
  value,
  delta,
  deltaDir,
  sublabel,
  trend,
  loading,
  className,
}: KpiTileProps) {
  const W = 96;
  const H = 28;

  if (loading) {
    return (
      <div
        className={cn("rounded-lg border border-border bg-card p-4", className)}
        aria-busy="true"
      >
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-7 w-16" />
        <Skeleton className="mt-3 h-3 w-24" />
      </div>
    );
  }

  const up = deltaDir === "up";
  const DeltaIcon = up ? ArrowUp : ArrowDown;
  const points = trend ? sparkPoints(trend, W, H) : "";

  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <p className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
        {label}
      </p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold tabular-nums leading-none text-foreground">
            {value}
          </p>

          {delta && deltaDir && (
            <p
              className={cn(
                "mt-2 inline-flex items-center gap-0.5 text-xs font-bold tabular-nums",
                up ? "text-success" : "text-critical",
              )}
            >
              <DeltaIcon aria-hidden className="size-3.5" />
              <span>
                {up ? "+" : "−"}
                {delta}
              </span>
              <span className="sr-only">{up ? "increase" : "decrease"}</span>
            </p>
          )}

          {sublabel && (
            <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
          )}
        </div>

        {points && (
          <svg
            aria-hidden
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            className="shrink-0 overflow-visible"
            preserveAspectRatio="none"
          >
            <polyline
              points={points}
              fill="none"
              className={cn(
                "stroke-2",
                up ? "stroke-success" : deltaDir === "down" ? "stroke-critical" : "stroke-primary",
              )}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
