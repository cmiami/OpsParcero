"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterChipProps {
  /** The dimension being filtered, e.g. "Status". */
  label: string;
  /** The chosen value, e.g. "Failed". Rendered after the label. */
  value?: string;
  /** When provided, renders a dismiss (X) button. */
  onRemove?: () => void;
  /** Active (applied) chips read in the primary tint; inactive are neutral. */
  active?: boolean;
  className?: string;
}

/**
 * FilterChip — a compact applied-filter pill.
 *
 * Shows "Label: value" and, when `onRemove` is given, a dismiss button whose
 * accessible name names the filter ("Remove filter: Status"). Active chips use
 * the primary tint so applied filters stand out from available ones.
 */
export function FilterChip({
  label,
  value,
  onRemove,
  active,
  className,
}: FilterChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold",
        active
          ? "border-primary/30 bg-primary-tint text-primary"
          : "border-border bg-subtle text-muted-foreground",
        className,
      )}
    >
      <span>{label}</span>
      {value && (
        <span className={cn(!active && "text-foreground")}>: {value}</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove filter: ${label}`}
          className={cn(
            "-mr-0.5 ml-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full",
            "hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <X aria-hidden className="size-3" />
        </button>
      )}
    </span>
  );
}
