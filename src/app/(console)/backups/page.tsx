"use client";

import { useRouter } from "next/navigation";
import { AssetTable } from "@/components/organisms/data-table/asset-table";
import { PageShell } from "@/components/templates/page-shell";

/** Backups & protection — backup health for every asset (last-good + last 10). */
export default function BackupsPage() {
  const router = useRouter();
  return (
    <PageShell
      title="Backups & protection"
      description="Last-good recency and the last 10 attempts for every protected asset."
    >
      <AssetTable onOpenAsset={(a) => router.push(`/fleet/${a.id}`)} />
    </PageShell>
  );
}
