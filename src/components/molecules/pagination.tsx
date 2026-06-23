"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PaginationProps {
  /** Current 1-based page. */
  page: number;
  /** Total number of pages (>= 1). */
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Build a compact page window with "…" gaps around the current page. */
function pageItems(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const items: (number | "gap")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) items.push("gap");
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < pageCount - 1) items.push("gap");
  items.push(pageCount);
  return items;
}

/**
 * Pagination — prev/next plus a windowed list of page numbers.
 *
 * The current page is marked `aria-current="page"`; prev/next disable at the
 * ends. The whole control is a labelled `nav` so AT announces it as pagination.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: PaginationProps) {
  const items = pageItems(page, pageCount);
  const atStart = page <= 1;
  const atEnd = page >= pageCount;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center gap-1", className)}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={atStart}
        aria-label="Previous page"
      >
        <ChevronLeft aria-hidden className="size-4" />
        <span className="sr-only sm:not-sr-only">Prev</span>
      </Button>

      {items.map((it, i) =>
        it === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="px-1 text-xs text-muted-foreground"
          >
            …
          </span>
        ) : (
          <Button
            key={it}
            variant={it === page ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onPageChange(it)}
            aria-current={it === page ? "page" : undefined}
            aria-label={`Page ${it}`}
            className={cn("tabular-nums", it === page && "font-bold")}
          >
            {it}
          </Button>
        ),
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={atEnd}
        aria-label="Next page"
      >
        <span className="sr-only sm:not-sr-only">Next</span>
        <ChevronRight aria-hidden className="size-4" />
      </Button>
    </nav>
  );
}
