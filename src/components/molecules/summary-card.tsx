"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type SummaryCardTone = "default" | "critical" | "success" | "ai";

export interface SummaryCardProps {
  /** Short metric label, e.g. "Open issues". */
  label: string;
  /** The headline number/value. */
  value: React.ReactNode;
  /** Role-based accent on the leading dot + label. */
  tone?: SummaryCardTone;
  /** Optional secondary line under the value. */
  sublabel?: string;
  /** Click-through (e.g. to the impacted-assets list). Renders as a button. */
  onClick?: () => void;
  className?: string;
}

const TONE: Record<SummaryCardTone, { dot: string; label: string }> = {
  default: { dot: "bg-primary", label: "text-muted-foreground" },
  critical: { dot: "bg-critical", label: "text-critical" },
  success: { dot: "bg-success", label: "text-success" },
  ai: { dot: "bg-ai", label: "text-ai" },
};

/**
 * SummaryCard — a Resolution Center summary tile.
 *
 * A single hairline-bordered surface (no nested cards) with a small role-colored
 * leading dot beside an eyebrow label, a big number, and an optional sublabel.
 * When `onClick` is set it becomes a keyboard-operable button that drills into
 * the impacted assets, with a corner arrow affordance. The role reads from the
 * dot + the colored label, never hue alone (M5) — and there is no accent border
 * on the rounded edge (impeccable register).
 */
export function SummaryCard({
  label,
  value,
  tone = "default",
  sublabel,
  onClick,
  className,
}: SummaryCardProps) {
  const t = TONE[tone];
  const interactive = Boolean(onClick);

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 text-2xs font-bold uppercase tracking-eyebrow",
            t.label,
          )}
        >
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />
          {label}
        </span>
        {interactive && (
          <ArrowUpRight
            aria-hidden
            className="size-3.5 shrink-0 text-faint-foreground transition-colors group-hover:text-primary"
          />
        )}
      </div>
      <span className="font-display text-2xl font-bold tracking-tight text-card-foreground">
        {value}
      </span>
      {sublabel && (
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      )}
    </>
  );

  const cls = cn(
    "flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-left",
    interactive &&
      "group cursor-pointer transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    className,
  );

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    );
  }
  return <div className={cls}>{content}</div>;
}
