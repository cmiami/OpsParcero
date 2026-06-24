import { cn } from "@/lib/utils";
import { PRODUCT_META } from "@/lib/status";
import type { ProductBucket } from "@/types";

export interface ProductChipProps {
  /** SaaS / Datto BCDR / Endpoint Backup bucket. */
  bucket: ProductBucket;
  /** Compact (`sm`) for filters/cells, `md` (default) for headers. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * ProductChip — product-context accent chip (icon + label) from PRODUCT_META.
 *
 * These accents tag content by product line; per M4 they are *context* accents
 * only and never drive the app shell. Outline + tinted dot keeps them quiet
 * next to status/fix chips.
 */
export function ProductChip({ bucket, size = "md", className }: ProductChipProps) {
  const meta = PRODUCT_META[bucket];
  const Icon = meta.icon;
  const sm = size === "sm";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface font-bold",
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
