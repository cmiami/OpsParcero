"use client";

import { cn } from "@/lib/utils";

export interface OccurrenceCountProps {
  /** How many assets/alerts this issue affects. */
  count: number;
  /** When provided, the pill becomes a button that opens the impacted list. */
  onClick?: () => void;
  className?: string;
}

/**
 * OccurrenceCount — a "× 14" pill summarizing how many assets an issue hits.
 *
 * When `onClick` is wired it renders as a real button (keyboard-operable, with
 * an accessible name describing the action) that opens the impacted-assets
 * view; otherwise it is a static badge.
 */
export function OccurrenceCount({
  count,
  onClick,
  className,
}: OccurrenceCountProps) {
  const label = `× ${count}`;
  const base =
    "inline-flex items-center gap-0.5 rounded-full border border-border bg-subtle px-2 py-0.5 text-xs font-bold tabular-nums text-muted-foreground";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${count} impacted assets — view list`}
        className={cn(
          base,
          "transition-colors hover:border-primary hover:bg-primary-tint hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      aria-label={`${count} impacted assets`}
      className={cn(base, className)}
    >
      {label}
    </span>
  );
}
