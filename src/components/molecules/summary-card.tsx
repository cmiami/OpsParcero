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
  /** Role-based accent on the top border + label. */
  tone?: SummaryCardTone;
  /** Optional secondary line under the value. */
  sublabel?: string;
  /** Click-through (e.g. to the impacted-assets list). Renders as a button. */
  onClick?: () => void;
  className?: string;
}

const TONE: Record<SummaryCardTone, { border: string; label: string }> = {
  default: { border: "border-t-primary", label: "text-muted-foreground" },
  critical: { border: "border-t-critical", label: "text-critical" },
  success: { border: "border-t-success", label: "text-success" },
  ai: { border: "border-t-ai", label: "text-ai" },
};

/**
 * SummaryCard — a Resolution Center summary tile.
 *
 * A single bordered surface (no nested cards) with a role-colored 2px top
 * border, an eyebrow label, a big number, and an optional sublabel. When
 * `onClick` is set it becomes a keyboard-operable button that drills into the
 * impacted assets, with a corner arrow affordance. The colored border is paired
 * with a colored label so the role never reads by hue alone (M5).
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
            "text-[10px] font-bold uppercase tracking-[0.07em]",
            t.label,
          )}
        >
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
    "flex flex-col gap-1 rounded-lg border border-border border-t-2 bg-card p-4 text-left",
    t.border,
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
