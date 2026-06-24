"use client";

import { useRouter } from "next/navigation";
import { AssetTable } from "@/components/organisms/data-table/asset-table";
import { PageShell } from "@/components/templates/page-shell";

/** The workhorse fleet table — every protected asset, worst-first. */
export default function FleetPage() {
  const router = useRouter();
  return (
    <PageShell
      title="Fleet"
      description="Every protected asset across BCDR, SaaS, and Endpoint — sorted by real severity."
    >
      <AssetTable onOpenAsset={(a) => router.push(`/fleet/${a.id}`)} />
    </PageShell>
  );
}
