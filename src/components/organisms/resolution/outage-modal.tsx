"use client";

import * as React from "react";
import {
  AlertOctagon,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MonoLabel } from "@/components/atoms/mono-label";
import { relativeTime } from "@/lib/format";
import { getAssets } from "@/mock/query";
import type { Incident, ProtectedAsset } from "@/types";

export interface OutageModalProps {
  /** The active incident driving the outage. */
  incident: Incident;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const KIND_LABEL: Record<Incident["kind"], string> = {
  "platform-outage": "Platform outage",
  "pod-throttling": "Storage pod throttling",
  "appliance-reboot": "Appliance reboot",
  "sync-backlog": "Offsite sync backlog",
  "mass-reauth": "Mass re-authentication",
};

const STATUS_PAGE = "status.datto.com";

function AssetLine({
  asset,
  affected,
}: {
  asset: ProtectedAsset;
  affected: boolean;
}) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      {affected ? (
        <AlertOctagon aria-hidden className="size-3.5 shrink-0 text-critical" />
      ) : (
        <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-success" />
      )}
      <MonoLabel className="truncate">{asset.displayName}</MonoLabel>
    </li>
  );
}

/**
 * OutageModal — the "Are you impacted?" dialog (docs/00 §3 outage awareness).
 *
 * Splits the fleet into assets affected by the active incident vs assets that
 * remain healthy, notes that auto-retry is handling correlated alerts, and links
 * to the status page — so techs don't chase symptoms of a known outage. Affected
 * vs unaffected reads by icon + heading + color, never color alone (M5).
 */
export function OutageModal({ incident, open, onOpenChange }: OutageModalProps) {
  const label = KIND_LABEL[incident.kind];

  // Derive affected/unaffected deterministically from the incident's alert set:
  // assets with a failed/syncing status sit in the affected column.
  const { affected, unaffected } = React.useMemo(() => {
    const all = getAssets().items;
    const aff: ProtectedAsset[] = [];
    const un: ProtectedAsset[] = [];
    for (const a of all) {
      if (a.status === "failed" || a.status === "syncing") aff.push(a);
      else un.push(a);
    }
    return { affected: aff.slice(0, 8), unaffected: un.slice(0, 8) };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertOctagon aria-hidden className="size-4 shrink-0 text-critical" />
            {label} — Are you impacted?
          </DialogTitle>
          <DialogDescription>
            {incident.bannerText ??
              `An active ${label.toLowerCase()} affecting the ${incident.scope} started ${relativeTime(
                incident.openedAt,
              )}. Alerts during this window are correlated to the incident, not your fleet.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <section
            aria-label="Affected assets"
            className="flex flex-col gap-2 rounded-md border border-critical bg-critical-tint p-3"
          >
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-critical">
              <AlertOctagon aria-hidden className="size-4 shrink-0" />
              Affected ({affected.length})
            </h3>
            <ScrollArea className="h-40">
              {affected.length > 0 ? (
                <ul className="divide-y divide-border/60">
                  {affected.map((a) => (
                    <AssetLine key={a.id} asset={a} affected />
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">
                  None of your assets are affected.
                </p>
              )}
            </ScrollArea>
          </section>

          <section
            aria-label="Unaffected assets"
            className="flex flex-col gap-2 rounded-md border border-success bg-success-tint p-3"
          >
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-success">
              <CheckCircle2 aria-hidden className="size-4 shrink-0" />
              Unaffected ({unaffected.length})
            </h3>
            <ScrollArea className="h-40">
              <ul className="divide-y divide-border/60">
                {unaffected.map((a) => (
                  <AssetLine key={a.id} asset={a} affected={false} />
                ))}
              </ul>
            </ScrollArea>
          </section>
        </div>

        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-md border border-border bg-subtle p-3 text-sm",
          )}
        >
          <RefreshCw aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            <span className="font-bold text-card-foreground">
              Auto-retry is handling this.
            </span>{" "}
            Correlated backups are queued and will catch up automatically once the{" "}
            {label.toLowerCase()} clears — no action needed on affected assets.
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          <a
            href={`https://${STATUS_PAGE}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ExternalLink aria-hidden className="size-3.5 shrink-0" />
            View status page
            {incident.vendorStatusRef && (
              <span className="font-mono text-xs text-muted-foreground">
                ({incident.vendorStatusRef})
              </span>
            )}
          </a>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Dismiss
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
