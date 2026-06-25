"use client";

import * as React from "react";
import {
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type VisibilityState,
  type Row,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Columns3,
  X,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { columnLabel } from "./columns";

/** A bulk action surfaced in the selection toolbar. */
export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Mark destructive actions (red) — they get the destructive button styling. */
  destructive?: boolean;
  /** Invoked with the currently-selected rows' data. */
  onClick: (rows: T[]) => void;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Skeleton rows instead of data (never a centered spinner). */
  isLoading?: boolean;
  /** First-class error state with a retry affordance. */
  error?: string;
  /** Optional retry handler shown in the error state. */
  onRetry?: () => void;
  /** Render the leading select column + bulk toolbar. */
  enableSelection?: boolean;
  defaultSort?: SortingState;
  /** Row height: default (~44px) or compact (~36px). */
  density?: "default" | "compact";
  /** Bulk actions for the inverted-primary selection toolbar. */
  bulkActions?: BulkAction<T>[];
  /** Pin the first (post-select) column to the left edge. */
  stickyFirstColumn?: boolean;
  /** Show the column-visibility picker. */
  columnPicker?: boolean;
  /** Stable row id (defaults to index). */
  getRowId?: (row: T, index: number) => string;
  /** Row click → detail navigation. */
  onRowClick?: (row: T) => void;
  /** Accessible caption describing the table contents (M5). */
  caption?: string;
  /** Copy for the empty state. */
  emptyTitle?: string;
  emptyHint?: string;
  /** Number of skeleton rows to show while loading. */
  loadingRows?: number;
  className?: string;
}

/** Visual rank for a sorted header (drives aria-sort + the chevron icon). */
function sortState(dir: false | "asc" | "desc") {
  if (dir === "asc") return { aria: "ascending" as const, Icon: ArrowUp };
  if (dir === "desc") return { aria: "descending" as const, Icon: ArrowDown };
  return { aria: "none" as const, Icon: ChevronsUpDown };
}

/**
 * DataTable — the product's core data surface.
 *
 * Generic TanStack-backed table: client sorting, row selection (→ an
 * inverted-primary bulk toolbar), a column-visibility picker, dense hairline
 * rows with a sticky header, and first-class loading / empty / error states
 * (skeleton rows, never a centered spinner — impeccable ban). All visual values
 * come from tokens; status cells the presets render are dot+icon+label (M5).
 */
export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  error,
  onRetry,
  enableSelection = false,
  defaultSort = [],
  density = "default",
  bulkActions = [],
  stickyFirstColumn = false,
  columnPicker = false,
  getRowId,
  onRowClick,
  caption,
  emptyTitle = "Nothing to show",
  emptyHint,
  loadingRows = 6,
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(defaultSort);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection, columnVisibility },
    // First click on any column (incl. numeric) sorts ascending — TanStack
    // defaults numeric columns to descending-first, which contradicts the
    // predictable aria-sort contract.
    sortDescFirst: false,
    enableRowSelection: enableSelection,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });

  const visibleLeaf = table.getVisibleLeafColumns();
  const colSpan = visibleLeaf.length || 1;
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const selectedCount = selectedRows.length;
  const rowHeight = density === "compact" ? "h-9" : "h-11";
  const cellPad = density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";
  const hideableColumns = table
    .getAllLeafColumns()
    .filter(
      (c) => c.getCanHide() && !(c.columnDef.meta?.pinned ?? false),
    );

  // The column pinned left = the first visible non-select column.
  const stickyColId = stickyFirstColumn
    ? visibleLeaf.find((c) => c.id !== "select")?.id
    : undefined;

  function stickyClass(colId: string, isHeader: boolean): string | undefined {
    if (colId === "select") {
      return cn(
        "sticky left-0 z-20",
        isHeader ? "bg-subtle" : "bg-card",
      );
    }
    if (stickyFirstColumn && colId === stickyColId) {
      return cn(
        "sticky left-10 z-20",
        isHeader ? "bg-subtle" : "bg-card",
      );
    }
    return undefined;
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center",
          className,
        )}
        role="alert"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-critical-tint">
          <AlertTriangle aria-hidden className="size-5 text-critical" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">
            Couldn&rsquo;t load this table
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Toolbar row: bulk actions (when selected) OR the column picker. */}
      {(enableSelection || columnPicker) && (
        <div className="flex min-h-9 items-center justify-between gap-2">
          {enableSelection && selectedCount > 0 ? (
            <div
              role="toolbar"
              aria-label="bulk actions"
              className="flex w-full items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-primary-foreground shadow-e1"
            >
              <span className="text-xs font-bold tabular-nums">
                {selectedCount} selected
              </span>
              <div className="ml-1 flex flex-wrap items-center gap-1.5">
                {bulkActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => action.onClick(selectedRows)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60",
                        action.destructive
                          ? "bg-primary-foreground/10 text-primary-foreground hover:bg-destructive hover:text-destructive-foreground"
                          : "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20",
                      )}
                    >
                      {Icon && <Icon className="size-3.5" />}
                      {action.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => table.resetRowSelection()}
                aria-label="Clear selection"
                className="ml-auto inline-flex size-6 items-center justify-center rounded-sm text-primary-foreground/80 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                {data.length > 0 && !isLoading
                  ? `${data.length} ${data.length === 1 ? "row" : "rows"}`
                  : ""}
              </span>
              {columnPicker && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Columns3 aria-hidden className="size-3.5" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {hideableColumns.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                        onSelect={(e) => e.preventDefault()}
                      >
                        {columnLabel(column)}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>
      )}

      <div className="relative overflow-x-auto rounded-lg border border-border bg-card">
        <Table className="border-separate border-spacing-0">
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader className="sticky top-0 z-30">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-0 hover:bg-transparent"
              >
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const { aria, Icon } = sortState(
                    header.column.getIsSorted(),
                  );
                  const meta = header.column.columnDef.meta;
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={canSort ? aria : undefined}
                      className={cn(
                        "h-9 border-b border-border bg-subtle text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground",
                        cellPad,
                        meta?.numeric && "text-right",
                        stickyClass(header.column.id, true),
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-sm uppercase tracking-eyebrow transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            meta?.numeric && "flex-row-reverse",
                          )}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <Icon
                            aria-hidden
                            className={cn(
                              "size-3",
                              header.column.getIsSorted()
                                ? "text-primary"
                                : "text-faint-foreground",
                            )}
                          />
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <LoadingRows
                rows={loadingRows}
                cols={colSpan}
                rowHeight={rowHeight}
                cellPad={cellPad}
              />
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={colSpan} className="border-0 p-0">
                  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                    <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                      <Inbox
                        aria-hidden
                        className="size-5 text-muted-foreground"
                      />
                    </span>
                    <p className="text-sm font-bold text-foreground">
                      {emptyTitle}
                    </p>
                    {emptyHint && (
                      <p className="max-w-xs text-xs text-muted-foreground">
                        {emptyHint}
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <DataRow
                  key={row.id}
                  row={row}
                  rowHeight={rowHeight}
                  cellPad={cellPad}
                  onRowClick={onRowClick}
                  stickyClass={stickyClass}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** A single data row, extracted so row-level handlers stay tidy. */
function DataRow<T>({
  row,
  rowHeight,
  cellPad,
  onRowClick,
  stickyClass,
}: {
  row: Row<T>;
  rowHeight: string;
  cellPad: string;
  onRowClick?: (row: T) => void;
  stickyClass: (colId: string, isHeader: boolean) => string | undefined;
}) {
  const selected = row.getIsSelected();
  const clickable = Boolean(onRowClick);

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      aria-selected={selected || undefined}
      // Row click is a MOUSE convenience only. We deliberately do NOT put
      // role="button"/tabIndex on the <tr>: the row contains interactive
      // controls (checkbox, ⋯ menu), and a button must not nest interactive
      // descendants (axe "nested-interactive"). Keyboard users reach the detail
      // via the focusable activator in the row's primary cell (e.g. the
      // asset-name button in asset-table's column defs).
      onClick={clickable ? () => onRowClick?.(row.original) : undefined}
      className={cn(
        rowHeight,
        "border-0 transition-colors",
        clickable && "cursor-pointer",
        selected
          ? "bg-primary-tint hover:bg-primary-tint"
          : "hover:bg-subtle",
      )}
    >
      {row.getVisibleCells().map((cell) => {
        const meta = cell.column.columnDef.meta;
        return (
          <TableCell
            key={cell.id}
            className={cn(
              "border-b border-border align-middle text-sm",
              cellPad,
              meta?.numeric && "text-right tabular-nums",
              stickyClass(
                cell.column.id,
                false,
              ),
              selected && stickyClass(cell.column.id, false) && "bg-primary-tint",
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/** Skeleton rows for the loading state (never a centered spinner). */
function LoadingRows({
  rows,
  cols,
  rowHeight,
  cellPad,
}: {
  rows: number;
  cols: number;
  rowHeight: string;
  cellPad: string;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow
          key={`sk-${r}`}
          aria-hidden
          className={cn(rowHeight, "border-0 hover:bg-transparent")}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell
              key={`sk-${r}-${c}`}
              className={cn("border-b border-border", cellPad)}
            >
              <Skeleton
                className={cn("h-3.5 rounded-sm", c === 0 ? "w-4" : "w-24")}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
