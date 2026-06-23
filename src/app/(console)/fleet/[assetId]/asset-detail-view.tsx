"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Wrench, Sparkles } from "lucide-react";
import type { AssetId } from "@/types";
import { productTypeToBucket } from "@/types";
import {
  getAsset,
  getClient,
  getAlertsForAsset,
  getRecoveryPoints,
  getBackupRuns,
  getIssues,
} from "@/mock/query";
import { relativeTime } from "@/lib/format";
import { StatusBadge } from "@/components/atoms/status-badge";
import { MonoLabel } from "@/components/atoms/mono-label";
import { ProductChip } from "@/components/atoms/product-chip";
import { BackupDotStrip } from "@/components/atoms/backup-dot-strip";
import { RemediationPanel } from "@/components/organisms/remediation/remediation-panel";
import { AssetTimeline } from "@/components/organisms/triage/asset-timeline";
import { AlertTriageList } from "@/components/organisms/triage/alert-triage-list";
import { RunHistoryTable } from "@/components/organisms/data-table/run-history-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GuidedFixPanel } from "@/components/organisms/fix/guided-fix-panel";
import { AiFixConsole } from "@/components/organisms/fix/ai-fix-console";

export function AssetDetailView() {
  const params = useParams<{ assetId: string }>();
  const router = useRouter();
  const [fixOpen, setFixOpen] = React.useState<null | "guided" | "ai">(null);
  const id = params.assetId as AssetId;
  const asset = getAsset(id);

  if (!asset) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="font-display text-lg font-bold">Asset not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono">{id}</span> isn&apos;t in the fleet.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => router.push("/fleet")}
        >
          <ArrowLeft aria-hidden /> Back to fleet
        </Button>
      </div>
    );
  }

  const client = getClient(asset.clientId);
  const alerts = getAlertsForAsset(id);
  const points = getRecoveryPoints(id);
  const runs = getBackupRuns(id);
  const issue = getIssues().find((i) => i.impactedAssetIds.includes(id));

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <button
          onClick={() => router.push("/fleet")}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Fleet
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge state={asset.status} size="md" />
          <h1 className="font-display text-xl font-bold tracking-tight">
            {asset.displayName}
          </h1>
          <MonoLabel copyable>{asset.id}</MonoLabel>
          <ProductChip bucket={productTypeToBucket(asset.productType)} />
          {client ? (
            <span className="text-sm text-muted-foreground">{client.name}</span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span>
            Last good backup:{" "}
            <span className="text-foreground">
              {asset.lastGoodBackupAt
                ? relativeTime(asset.lastGoodBackupAt)
                : "never"}
            </span>
          </span>
          <span className="flex items-center gap-2">
            Last 10: <BackupDotStrip runs={asset.recentRuns} />
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <Tabs defaultValue="overview" className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="points">
              Recovery points ({points.length})
            </TabsTrigger>
            <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
            <TabsTrigger value="runs">Runs ({runs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
              <span className="mr-1 text-sm font-bold text-foreground">
                Resolve this asset
              </span>
              <Button size="sm" onClick={() => setFixOpen("guided")}>
                <Wrench className="size-4" aria-hidden /> Guided fix
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFixOpen("ai")}
                className="border-ai-accent bg-ai-tint text-ai hover:bg-ai-tint hover:text-ai"
              >
                <Sparkles className="size-4" aria-hidden /> Fix with AI
              </Button>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <RemediationPanel asset={asset} issue={issue} />
              <AssetTimeline />
            </div>
          </TabsContent>

          <TabsContent value="points">
            {points.length ? (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Taken</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Bootable</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead>Cloud</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {points.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{relativeTime(p.takenAt)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {p.pointKind}
                        </TableCell>
                        <TableCell>{p.bootable ? "Yes" : "—"}</TableCell>
                        <TableCell>{p.localStored ? "Yes" : "—"}</TableCell>
                        <TableCell>{p.cloudStored ? "Yes" : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No recovery points yet.
              </p>
            )}
          </TabsContent>

          <TabsContent value="alerts">
            {alerts.length ? (
              <AlertTriageList alerts={alerts} />
            ) : (
              <p className="text-sm text-muted-foreground">No open alerts.</p>
            )}
          </TabsContent>

          <TabsContent value="runs">
            <RunHistoryTable runs={runs} />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={fixOpen === "guided"}
        onOpenChange={(o) => {
          if (!o) setFixOpen(null);
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="size-4 text-primary" aria-hidden /> Guided fix —{" "}
              {asset.displayName}
            </DialogTitle>
          </DialogHeader>
          <GuidedFixPanel asset={asset} issue={issue} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={fixOpen === "ai"}
        onOpenChange={(o) => {
          if (!o) setFixOpen(null);
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-ai" aria-hidden /> Fix with AI —{" "}
              {asset.displayName}
            </DialogTitle>
          </DialogHeader>
          <AiFixConsole
            asset={asset}
            issue={issue}
            onSwitchToGuided={() => setFixOpen("guided")}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
