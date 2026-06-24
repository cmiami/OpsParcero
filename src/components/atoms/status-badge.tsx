import { cn } from "@/lib/utils";
import { STATUS_META } from "@/lib/status";
import type { AssetStatus } from "@/types";

export interface StatusBadgeProps {
  /** The asset health state to render. */
  state: AssetStatus;
  /** Compact (`sm`) for dense tables, `md` (default) for detail surfaces. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * StatusBadge — the canonical asset-health chip.
 *
 * Never color-only (M5): a colored dot + a lucide icon + a text label, all
 * driven from STATUS_META so the vocabulary stays single-sourced. The syncing
 * state spins its icon (`meta.spin`).
 */
export function StatusBadge({ state, size = "md", className }: StatusBadgeProps) {
  const meta = STATUS_META[state];
  const Icon = meta.icon;
  const sm = size === "sm";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-bold",
        meta.tintClass,
        meta.textClass,
        meta.borderClass,
        sm ? "gap-1 px-2 py-0.5 text-2xs" : "gap-1.5 px-2.5 py-0.5 text-xs",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "rounded-full",
          meta.dotClass,
          sm ? "size-1.5" : "size-2",
        )}
      />
      <Icon
        aria-hidden
        className={cn(
          "shrink-0",
          sm ? "size-3" : "size-3.5",
          meta.spin && "animate-spin",
        )}
      />
      <span>{meta.label}</span>
    </span>
  );
}
