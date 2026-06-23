import { cn } from "@/lib/utils";
import { STATUS_META } from "@/lib/status";
import type { AssetStatus } from "@/types";

export interface SeverityChipProps {
  /** Which asset-health bucket this count belongs to. */
  state: AssetStatus;
  /** How many assets are in this state. */
  count: number;
  className?: string;
}

/**
 * SeverityChip — a compact rollup pill, e.g. "● Failed 3".
 *
 * Drives label/icon/color from STATUS_META so it is never color-only (M5):
 * colored dot + lucide icon + text label + tabular count. Used in fleet
 * rollups and header summaries.
 */
export function SeverityChip({ state, count, className }: SeverityChipProps) {
  const meta = STATUS_META[state];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold",
        meta.tintClass,
        meta.textClass,
        meta.borderClass,
        className,
      )}
      aria-label={`${meta.label}: ${count}`}
    >
      <span aria-hidden className={cn("size-2 rounded-full", meta.dotClass)} />
      <Icon
        aria-hidden
        className={cn("size-3.5 shrink-0", meta.spin && "animate-spin")}
      />
      <span>{meta.label}</span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
