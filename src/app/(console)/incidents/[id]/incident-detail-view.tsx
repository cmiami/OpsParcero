"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Alert, AssetId, ProtectedAsset } from "@/types";
import { getIncident, getAlert, getAsset, getPlaybooks } from "@/mock/query";
import { relativeTime } from "@/lib/format";
import { AssetTable } from "@/components/organisms/data-table/asset-table";
import { PlaybookCard } from "@/components/organisms/automation/playbook-card";
import { MonoLabel } from "@/components/atoms/mono-label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function IncidentDetailView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const incident = getIncident(id);

  if (!incident) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="font-display text-lg font-bold">Incident not found</h1>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => router.push("/overview")}
        >
          <ArrowLeft aria-hidden /> Back to overview
        </Button>
      </div>
    );
  }

  const alerts = incident.alertIds
    .map((aid) => getAlert(aid))
    .filter((a): a is Alert => Boolean(a));
  const assetIds = [
    ...new Set(
      alerts.map((a) => a.assetId).filter((x): x is AssetId => Boolean(x)),
    ),
  ];
  const cohort = assetIds
    .map((aid) => getAsset(aid))
    .filter((a): a is ProtectedAsset => Boolean(a));
  const suggested = getPlaybooks().slice(0, 2);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <button
          onClick={() => router.push("/overview")}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Overview
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="destructive" className="capitalize">
            {incident.status}
          </Badge>
          <h1 className="font-display text-xl font-bold tracking-tight">
            {incident.bannerText ?? incident.kind}
          </h1>
          <MonoLabel>{incident.id}</MonoLabel>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {cohort.length} assets affected · scope{" "}
          <span className="capitalize">{incident.scope}</span> · opened{" "}
          {relativeTime(incident.openedAt)}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Why these are grouped</CardTitle>
              <CardDescription>
                A single root cause correlated across {alerts.length} alerts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Kind: <span className="font-medium">{incident.kind}</span>
              </p>
              {incident.vendorStatusRef ? (
                <p className="text-muted-foreground">
                  Vendor reference:{" "}
                  <MonoLabel>{incident.vendorStatusRef}</MonoLabel>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Suggested playbooks</CardTitle>
              <CardDescription>
                Run cohort-scoped against the affected assets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggested.map((pb) => (
                <PlaybookCard key={pb.id} playbook={pb} />
              ))}
            </CardContent>
          </Card>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-bold">
            Affected cohort ({cohort.length})
          </h2>
          {cohort.length ? (
            <AssetTable
              assets={cohort}
              onOpenAsset={(a) => router.push(`/fleet/${a.id}`)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No individual assets resolved for this incident.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
