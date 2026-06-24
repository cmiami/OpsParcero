"use client";

import { useParams, useRouter } from "next/navigation";
import type { ProductBucket, ProductType } from "@/types";
import { getAssets } from "@/mock/query";
import { PRODUCT_BUCKET_BY_KEY } from "@/config/products";
import { AssetTable } from "@/components/organisms/data-table/asset-table";
import { KpiTile } from "@/components/molecules/kpi-tile";
import { useActivity, applyOverrides } from "@/stores/activity";
import { useHasHydrated } from "@/stores/use-has-hydrated";

const TYPES_FOR_BUCKET: Record<ProductBucket, ProductType[]> = {
  bcdr: ["bcdr"],
  saas: ["saas-protect", "spanning"],
  endpoint: ["endpoint-v1", "endpoint-v2"],
};

export function ProductLensView() {
  const { product } = useParams<{ product: string }>();
  const router = useRouter();
  // Hooks must run unconditionally (before the early return). Reflect this
  // session's heals in the lens KPIs + table.
  const hydrated = useHasHydrated(useActivity);
  const overrides = useActivity((s) => s.assetOverrides);
  const bucket = product as ProductBucket;
  const cfg = PRODUCT_BUCKET_BY_KEY[bucket];

  if (!cfg) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="font-display text-lg font-bold">Unknown product</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono">{product}</span> isn&apos;t a product
          surface.
        </p>
      </div>
    );
  }

  const rawAssets = getAssets(
    { productTypes: TYPES_FOR_BUCKET[bucket] },
    undefined,
    0,
    100000,
  ).items;
  const assets = hydrated ? applyOverrides(rawAssets, overrides) : rawAssets;
  const failed = assets.filter((a) => a.status === "failed").length;
  const warning = assets.filter((a) => a.status === "warning").length;
  const Icon = cfg.icon;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Icon className={`size-5 ${cfg.textClass}`} aria-hidden />
          <h1 className="font-display text-xl font-bold tracking-tight">
            {cfg.label}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">{cfg.blurb}</p>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
        <div className="grid grid-cols-3 gap-4 sm:max-w-xl">
          <KpiTile label="Assets" value={assets.length} />
          <KpiTile label="Failed" value={failed} sublabel="real failures" />
          <KpiTile label="Warning" value={warning} sublabel="incl. cosmetic" />
        </div>
        <AssetTable
          assets={assets}
          onOpenAsset={(a) => router.push(`/fleet/${a.id}`)}
        />
      </div>
    </div>
  );
}
