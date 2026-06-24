import { cn } from "@/lib/utils";
import { FIX_META } from "@/lib/status";
import type { FixType } from "@/types";

export interface FixTypeBadgeProps {
  /** The fix classification — drives label, icon, and color. */
  type: FixType;
  /** Compact (`sm`) for table cells, `md` (default) for issue headers. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * FixTypeBadge — the fix-classification pill.
 *
 * Renders "End-to-end fix" (green) / "Guided fix" (blue) / "Insights only"
 * (orange or gray for unknown) from FIX_META. Icon + label, tinted background,
 * so the classification reads without relying on color alone.
 */
export function FixTypeBadge({ type, size = "md", className }: FixTypeBadgeProps) {
  const meta = FIX_META[type];
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
      <Icon aria-hidden className={cn("shrink-0", sm ? "size-3" : "size-3.5")} />
      <span>{meta.label}</span>
    </span>
  );
}
