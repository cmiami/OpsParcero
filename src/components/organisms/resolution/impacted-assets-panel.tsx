"use client";

import * as React from "react";
import {
  Server,
  HardDrive,
  Cloud,
  Mail,
  FolderArchive,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/atoms/status-badge";
import { MonoLabel } from "@/components/atoms/mono-label";
import { ProductChip } from "@/components/atoms/product-chip";
import { SeverityBadge } from "@/components/atoms/severity-badge";
import { relativeTime } from "@/lib/format";
import { getAsset } from "@/mock/query";
import type { AssetKind, Issue, ProtectedAsset } from "@/types";

export interface ImpactedAssetsPanelProps {
  /** The issue whose impacted assets are shown. */
  issue: Issue;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Typed glyph + group label per asset kind (device / SaaS account / cloud). */
const KIND_META: Record<AssetKind, { icon: LucideIcon; group: string }> = {
  agent: { icon: Server, group: "Servers & agents" },
  agentless: { icon: Server, group: "Servers & agents" },
  endpoint: { icon: HardDrive, group: "Endpoints" },
  "saas-seat": { icon: Mail, group: "SaaS accounts" },
  "salesforce-org": { icon: Cloud, group: "Cloud services" },
  share: { icon: FolderArchive, group: "Shares" },
};

function kindOf(asset: ProtectedAsset | undefined): AssetKind {
  return asset?.kind ?? "agent";
}

/** A single impacted-asset row, typed by kind. */
function AssetRow({
  id,
  asset,
}: {
  id: string;
  asset: ProtectedAsset | undefined;
}) {
  const meta = KIND_META[kindOf(asset)];
  const Icon = meta.icon;
  return (
    <li className="flex items-center gap-3 py-2">
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <MonoLabel className="truncate" copyable>
          {asset?.displayName ?? id}
        </MonoLabel>
        {asset?.lastGoodBackupAt && (
          <span className="text-xs text-muted-foreground">
            Last good {relativeTime(asset.lastGoodBackupAt)}
          </span>
        )}
      </div>
      {asset && <StatusBadge state={asset.status} size="sm" />}
    </li>
  );
}

/**
 * ImpactedAssetsPanel — the right-side overlay listing an issue's blast radius.
 *
 * Opens as a `Sheet` (no content push, M4 side-panel) summarizing total
 * occurrences and the unique impacted assets, grouped and typed by kind
 * (device / SaaS account / cloud service). Each asset shows its current health
 * via StatusBadge (dot + icon + label, never color-only, M5).
 */
export function ImpactedAssetsPanel({
  issue,
  open,
  onOpenChange,
}: ImpactedAssetsPanelProps) {
  // Resolve the unique impacted assets and bucket them by typed group.
  const groups = React.useMemo(() => {
    const byGroup = new Map<string, { id: string; asset: ProtectedAsset | undefined }[]>();
    for (const id of issue.impactedAssetIds) {
      const asset = getAsset(id);
      const group = KIND_META[kindOf(asset)].group;
      const arr = byGroup.get(group);
      const entry = { id, asset };
      if (arr) arr.push(entry);
      else byGroup.set(group, [entry]);
    }
    return [...byGroup.entries()];
  }, [issue.impactedAssetIds]);

  const uniqueCount = issue.impactedAssetIds.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="gap-2 border-b border-border p-5">
          <div className="flex items-center gap-2">
            <ProductChip bucket={issue.productBucket} size="sm" />
            <SeverityBadge severity={issue.severity} />
          </div>
          <SheetTitle className="text-base">{issue.title}</SheetTitle>
          <SheetDescription>
            <span className="font-bold tabular-nums text-card-foreground">
              {issue.occurrenceCount}
            </span>{" "}
            occurrences across{" "}
            <span className="font-bold tabular-nums text-card-foreground">
              {uniqueCount}
            </span>{" "}
            unique {uniqueCount === 1 ? "asset" : "assets"}.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-5 p-5">
            {groups.map(([group, rows]) => (
              <section key={group} className="flex flex-col gap-1">
                <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
                  <Layers aria-hidden className="size-3.5 shrink-0" />
                  {group}
                  <span className="ml-1 tabular-nums text-muted-foreground">
                    ({rows.length})
                  </span>
                </h3>
                <ul
                  className={cn(
                    "divide-y divide-border",
                  )}
                >
                  {rows.map((r) => (
                    <AssetRow key={r.id} id={r.id} asset={r.asset} />
                  ))}
                </ul>
              </section>
            ))}
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No assets are currently linked to this issue.
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
