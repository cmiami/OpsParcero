"use client";

import * as React from "react";
import type { ColumnDef, Column, RowData } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * columns helpers for DataTable presets.
 *
 * `selectionColumn` is the canonical leading select column (header = select-page
 * tri-state, cell = per-row checkbox). Presets spread it as their first column so
 * selection wiring stays single-sourced. `columnLabel` reads a stable human label
 * from a column's `meta.label` (falling back to a humanized id) for the column
 * picker + sort affordances.
 */

/** Column meta we attach for the picker / a11y labels. */
export interface DataColumnMeta {
  /** Human label used in the column-visibility picker + screen-reader copy. */
  label?: string;
  /** Right-align numeric cells (counts, sizes). */
  numeric?: boolean;
  /** Keep this column out of the visibility picker (e.g. select / actions). */
  pinned?: boolean;
}

declare module "@tanstack/react-table" {
  // Declaration-merge our column meta; the generic signature must match upstream
  // (TData extends RowData, TValue) exactly for merging to take effect.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type
  interface ColumnMeta<TData extends RowData, TValue> extends DataColumnMeta {}
}

/** Humanize a column id like "lastGood" → "Last good". */
export function humanizeId(id: string): string {
  const spaced = id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Resolve a stable display label for a column (meta.label → header string → id). */
export function columnLabel<T>(column: Column<T, unknown>): string {
  const meta = column.columnDef.meta as DataColumnMeta | undefined;
  if (meta?.label) return meta.label;
  const header = column.columnDef.header;
  if (typeof header === "string" && header.length > 0) return header;
  return humanizeId(column.id);
}

/**
 * The leading select column: a tri-state "select page" header checkbox and a
 * per-row checkbox. Each checkbox carries an explicit accessible name (M5) since
 * it is an icon-only control. Width is fixed so the sticky-first layout is stable.
 */
export function selectionColumn<T>(): ColumnDef<T> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    meta: { pinned: true, label: "Select" },
    size: 40,
    header: ({ table }) => (
      <div className={cn("flex items-center justify-center")}>
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all rows on this page"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select row ${row.index + 1}`}
          // Stop row-click navigation when toggling the checkbox.
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    ),
  };
}
