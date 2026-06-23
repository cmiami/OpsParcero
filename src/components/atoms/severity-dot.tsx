import { cn } from "@/lib/utils";
import { STATUS_META } from "@/lib/status";
import type { AssetStatus } from "@/types";

export interface SeverityDotProps {
  /** The asset health state the dot represents. */
  state: AssetStatus;
  /** Visual size — `sm` (default) for inline use, `md` for emphasis. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * SeverityDot — a bare status dot for dense rows (no label text).
 *
 * Color is never the only signal: the dot carries the human-readable label as
 * its accessible name (`role="img"` + `aria-label`), so screen readers announce
 * the state even though no text is painted (M5).
 */
export function SeverityDot({ state, size = "sm", className }: SeverityDotProps) {
  const meta = STATUS_META[state];

  return (
    <span
      role="img"
      aria-label={meta.label}
      title={meta.label}
      className={cn(
        "inline-block shrink-0 rounded-full",
        meta.dotClass,
        size === "sm" ? "size-2" : "size-2.5",
        className,
      )}
    />
  );
}
