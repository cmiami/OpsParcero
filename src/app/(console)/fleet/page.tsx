"use client";

import { useRouter } from "next/navigation";
import { AssetTable } from "@/components/organisms/data-table/asset-table";

/** The workhorse fleet table — every protected asset, worst-first. */
export default function FleetPage() {
  const router = useRouter();
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-display text-xl font-bold tracking-tight">Fleet</h1>
        <p className="text-sm text-muted-foreground">
          Every protected asset across BCDR, SaaS, and Endpoint — sorted by real
          severity.
        </p>
      </header>
      <div className="min-h-0 flex-1 p-6">
        <AssetTable onOpenAsset={(a) => router.push(`/fleet/${a.id}`)} />
      </div>
    </div>
  );
}
