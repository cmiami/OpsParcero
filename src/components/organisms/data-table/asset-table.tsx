"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Building2,
  ExternalLink,
  Eye,
  RefreshCw,
  Workflow,
  Plus,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { productTypeToBucket, type ProtectedAsset, type BackupRun } from "@/types";
import { getAssets, getClient } from "@/mock/query";
import { useActiveClientId } from "@/stores/use-active-client";
import { useActivity, applyOverrides } from "@/stores/activity";
import { useHasHydrated } from "@/stores/use-has-hydrated";
import { MonoLabel } from "@/components/atoms/mono-label";
import { StatusBadge } from "@/components/atoms/status-badge";
import { ProductChip } from "@/components/atoms/product-chip";
import { Last10DotStrip } from "@/components/molecules/last10-dot-strip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DataTable, type BulkAction } from "./data-table";
import { toast } from "sonner";
import { useActionCart } from "@/stores/action-cart";
import { selectionColumn } from "./columns";

export interface AssetTableProps {
  /** Assets to render. Defaults to the full seeded fleet (worst-first). */
  assets?: ProtectedAsset[];
  density?: "default" | "compact";
  /** Row click → asset detail. */
  onOpenAsset?: (asset: ProtectedAsset) => void;
  /** Optional bulk-action wiring (Retry / Run playbook / Add to cart / Open ticket). */
  onBulk?: (id: string, assets: ProtectedAsset[]) => void;
  isLoading?: boolean;
  error?: string;
  className?: string;
}

/** The leading identifier per asset kind: host / UPN / org id. */
function assetIdentifier(a: ProtectedAsset): string {
  if (a.kind === "saas-seat") return a.upn;
  if (a.kind === "salesforce-org") return a.id.replace(/^asset-/, "");
  if (a.kind === "share") return a.sharePath;
  return a.displayName;
}

/** Cache client names once per render (mock query is pure). */
function useClientName() {
  return React.useCallback((clientId: string): string => {
    return getClient(clientId)?.name ?? clientId;
  }, []);
}

/**
 * AssetTable — the workhorse fleet table (page-spec §6).
 *
 * A DataTable preset with the canonical fleet columns: select · Status · Asset
 * (mono id + name) · Client · Product · Last good · Last 10 · ⋯ actions. Status
 * is dot+icon+label (M5); product is an accent chip, never per-product color.
 * Selection drives the inverted bulk toolbar (Retry / Run playbook / Add to cart
 * / Open ticket). Sticky header + sticky first column for wide fleets.
 */
export function AssetTable({
  assets,
  density = "default",
  onOpenAsset,
  onBulk,
  isLoading,
  error,
  className,
}: AssetTableProps) {
  const activeClientId = useActiveClientId();
  // Reflect any heals applied this session — a fixed asset must read protected in
  // the fleet table too, not only on its detail page. Hydration-gated.
  const hydrated = useHasHydrated(useActivity);
  const overrides = useActivity((s) => s.assetOverrides);
  const data = React.useMemo(() => {
    const base =
      assets ??
      getAssets({
        clientIds: activeClientId ? [activeClientId] : undefined,
      }).items;
    return hydrated ? applyOverrides(base, overrides) : base;
  }, [assets, activeClientId, hydrated, overrides]);
  const clientName = useClientName();

  // Built-in bulk behavior so BOTH the toolbar AND the per-row menu are
  // functional on every surface (the page can still override via onBulk): "cart"
  // stages the assets in the action cart, "peek" opens the asset, the rest
  // simulate a dispatch with a toast. Declared before the columns memo so the
  // per-row RowActions can use it (the toolbar bulkActions use it too).
  const addTarget = useActionCart((s) => s.addTarget);
  const handleBulk = React.useCallback(
    (id: string, rows: ProtectedAsset[]) => {
      if (onBulk) return onBulk(id, rows);
      if (id === "peek") {
        if (rows[0]) onOpenAsset?.(rows[0]);
        return;
      }
      const n = rows.length;
      const suffix = `${n} asset${n === 1 ? "" : "s"}`;
      if (id === "cart") {
        rows.forEach((a) => addTarget(a.id));
        toast.success(`Added ${suffix} to the action cart`);
      } else {
        const LABEL: Record<string, string> = {
          retry: "Retry queued",
          playbook: "Playbook started",
          ticket: "Ticket opened",
        };
        toast.success(LABEL[id] ?? "Action dispatched", { description: suffix });
      }
    },
    [onBulk, addTarget, onOpenAsset],
  );

  const columns = React.useMemo<ColumnDef<ProtectedAsset>[]>(
    () => [
      selectionColumn<ProtectedAsset>(),
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        meta: { label: "Status", pinned: true },
        cell: ({ row }) => <StatusBadge state={row.original.status} size="sm" />,
      },
      {
        id: "asset",
        accessorFn: (a) => assetIdentifier(a),
        header: "Asset",
        meta: { label: "Asset" },
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              {onOpenAsset ? (
                // A real, keyboard-focusable activator for the row (P3-4) — the
                // row-click is mouse-only, so this is how keyboard users open the
                // detail. stopPropagation so it coexists with the row click.
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAsset(a);
                  }}
                  className="max-w-xs rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <MonoLabel title={assetIdentifier(a)} className="max-w-xs">
                    {assetIdentifier(a)}
                  </MonoLabel>
                </button>
              ) : (
                <MonoLabel title={assetIdentifier(a)} className="max-w-xs">
                  {assetIdentifier(a)}
                </MonoLabel>
              )}
              <span className="truncate text-xs text-muted-foreground">
                {a.displayName}
              </span>
            </div>
          );
        },
      },
      {
        id: "client",
        accessorFn: (a) => clientName(a.clientId),
        header: "Client",
        meta: { label: "Client" },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Building2
              aria-hidden
              className="size-3.5 shrink-0 text-faint-foreground"
            />
            <span className="truncate">{clientName(row.original.clientId)}</span>
          </span>
        ),
      },
      {
        id: "product",
        accessorFn: (a) => productTypeToBucket(a.productType),
        header: "Product",
        meta: { label: "Product" },
        cell: ({ row }) => (
          <ProductChip
            bucket={productTypeToBucket(row.original.productType)}
            size="sm"
          />
        ),
      },
      {
        id: "lastGood",
        accessorKey: "lastGoodBackupAt",
        header: "Last good",
        meta: { label: "Last good" },
        cell: ({ row }) => {
          const a = row.original;
          if (a.status === "syncing") {
            return (
              <span className="font-mono text-xs text-status-syncing">
                running
              </span>
            );
          }
          if (!a.lastGoodBackupAt) {
            return (
              <span className="font-mono text-xs text-faint-foreground">
                never
              </span>
            );
          }
          return (
            <span className="font-mono text-xs text-muted-foreground">
              {relativeTime(a.lastGoodBackupAt)}
            </span>
          );
        },
      },
      {
        id: "last10",
        header: "Last 10",
        enableSorting: false,
        meta: { label: "Last 10" },
        cell: ({ row }) => (
          <Last10DotStrip runs={runsFromSummaries(row.original)} />
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        meta: { label: "Actions", pinned: true },
        cell: ({ row }) => (
          <RowActions
            asset={row.original}
            onOpen={onOpenAsset}
            onBulk={handleBulk}
          />
        ),
      },
    ],
    [clientName, onOpenAsset, handleBulk],
  );


  const bulkActions: BulkAction<ProtectedAsset>[] = [
    { id: "retry", label: "Retry", icon: RefreshCw, onClick: (rows) => handleBulk("retry", rows) },
    { id: "playbook", label: "Run playbook", icon: Workflow, onClick: (rows) => handleBulk("playbook", rows) },
    { id: "cart", label: "Add to cart", icon: Plus, onClick: (rows) => handleBulk("cart", rows) },
    { id: "ticket", label: "Open ticket", icon: Ticket, onClick: (rows) => handleBulk("ticket", rows) },
  ];

  return (
    <DataTable<ProtectedAsset>
      className={className}
      columns={columns}
      data={data}
      isLoading={isLoading}
      error={error}
      enableSelection
      columnPicker
      stickyFirstColumn
      density={density}
      bulkActions={bulkActions}
      getRowId={(a) => a.id}
      onRowClick={onOpenAsset}
      caption="Protected assets across all products"
      emptyTitle="No assets match these filters"
      emptyHint="Clear a filter or broaden the product scope to see protected assets."
      defaultSort={[]}
    />
  );
}

/** Adapt an asset's recentRuns summaries into BackupRun-shaped rows for the strip. */
function runsFromSummaries(a: ProtectedAsset): BackupRun[] {
  return a.recentRuns.map((s) => ({
    id: s.runId,
    jobId: `job-${a.id}`,
    assetId: a.id,
    startedAt: s.at,
    finishedAt: s.at,
    state: s.state,
    mode: "incremental",
    failureModeId: s.isCosmetic ? "fm-cosmetic-screenshot" : undefined,
  }));
}

/** Per-row ⋯ menu: Open / Peek / Retry / Run playbook / Add to cart / Open ticket. */
function RowActions({
  asset,
  onOpen,
  onBulk,
}: {
  asset: ProtectedAsset;
  onOpen?: (a: ProtectedAsset) => void;
  onBulk?: (id: string, assets: ProtectedAsset[]) => void;
}) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${asset.displayName}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <MoreHorizontal aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem onSelect={() => onOpen?.(asset)}>
            <ExternalLink aria-hidden className="size-3.5" />
            Open detail
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onBulk?.("peek", [asset])}>
            <Eye aria-hidden className="size-3.5" />
            Quick-peek
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onBulk?.("retry", [asset])}>
            <RefreshCw aria-hidden className="size-3.5" />
            Retry backup
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onBulk?.("playbook", [asset])}>
            <Workflow aria-hidden className="size-3.5" />
            Run playbook
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onBulk?.("cart", [asset])}>
            <Plus aria-hidden className="size-3.5" />
            Add to cart
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onBulk?.("ticket", [asset])}>
            <Ticket aria-hidden className="size-3.5" />
            Open ticket
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
