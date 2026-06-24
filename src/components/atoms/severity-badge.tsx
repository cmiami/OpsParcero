import { cn } from "@/lib/utils";
import { SEVERITY_META } from "@/lib/status";
import type { Severity } from "@/types";

export interface SeverityBadgeProps {
  /** Alert/incident severity — typically `critical` or `warning`. */
  severity: Severity;
  /** Compact (`sm`) for triage rows, `md` (default) elsewhere. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * SeverityBadge — alert severity chip (dot + icon + label) from SEVERITY_META.
 *
 * Used on alert triage rows and incident headers. Color is paired with a dot
 * and the OctagonAlert/AlertTriangle icon so severity never reads by hue alone.
 */
export function SeverityBadge({
  severity,
  size = "md",
  className,
}: SeverityBadgeProps) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.icon;
  const sm = size === "sm";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-bold",
        meta.tintClass,
        meta.textClass,
        sm ? "gap-1 px-2 py-0.5 text-2xs" : "gap-1.5 px-2.5 py-0.5 text-xs",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "rounded-full bg-current",
          sm ? "size-1.5" : "size-2",
        )}
      />
      <Icon aria-hidden className={cn("shrink-0", sm ? "size-3" : "size-3.5")} />
      <span>{meta.label}</span>
    </span>
  );
}
