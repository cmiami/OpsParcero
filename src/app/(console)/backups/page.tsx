"use client";

import { useRouter } from "next/navigation";
import { AssetTable } from "@/components/organisms/data-table/asset-table";

/** Backups & protection — backup health for every asset (last-good + last 10). */
export default function BackupsPage() {
  const router = useRouter();
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-display text-xl font-bold tracking-tight">
          Backups &amp; protection
        </h1>
        <p className="text-sm text-muted-foreground">
          Last-good recency and the last 10 attempts for every protected asset.
        </p>
      </header>
      <div className="min-h-0 flex-1 p-6">
        <AssetTable onOpenAsset={(a) => router.push(`/fleet/${a.id}`)} />
      </div>
    </div>
  );
}
