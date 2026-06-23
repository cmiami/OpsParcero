"use client";

import * as React from "react";
import { AlertOctagon, ChevronRight, CheckCircle2 } from "lucide-react";
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
import { relativeTime } from "@/lib/format";
import type { Incident } from "@/types";

export interface OutageBannerProps {
  /** The correlated incident driving the banner. */
  incident: Incident;
  /** Optional hook fired when the technician opens the impact dialog. */
  onOpen?: () => void;
  className?: string;
}

const KIND_LABEL: Record<Incident["kind"], string> = {
  "platform-outage": "Platform outage",
  "pod-throttling": "Storage pod throttling",
  "appliance-reboot": "Appliance reboot",
  "sync-backlog": "Offsite sync backlog",
  "mass-reauth": "Mass re-authentication",
};

/**
 * OutageBanner — fleet-wide "Are you impacted?" outage strip.
 *
 * When an incident is active, renders a critical-token strip (dot + icon + text,
 * never color-only) that opens a dialog summarizing scope and affected assets,
 * so noise during an outage is correlated rather than triaged one-by-one.
 * Resolved incidents render a quiet success confirmation instead.
 */
export function OutageBanner({ incident, onOpen, className }: OutageBannerProps) {
  const [open, setOpen] = React.useState(false);
  const active = incident.status !== "resolved";
  const label = KIND_LABEL[incident.kind];

  if (!active) {
    return (
      <div
        role="status"
        className={cn(
          "flex items-center gap-2 rounded-md border border-success bg-success-tint px-3 py-2 text-sm",
          className,
        )}
      >
        <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" />
        <span className="font-bold text-success">Service restored</span>
        <span className="text-muted-foreground">
          {label} resolved{" "}
          {incident.resolvedAt ? relativeTime(incident.resolvedAt) : ""}.
        </span>
      </div>
    );
  }

  return (
    <>
      <div
        role="alert"
        className={cn(
          "flex items-center gap-3 rounded-md border border-critical bg-critical-tint px-3 py-2",
          className,
        )}
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-critical" />
        <AlertOctagon aria-hidden className="size-4 shrink-0 text-critical" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold text-critical">
            Active service outage — Are you impacted?
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {label} · {incident.scope} scope · started{" "}
            {relativeTime(incident.openedAt)}
          </span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="shrink-0"
          onClick={() => {
            setOpen(true);
            onOpen?.();
          }}
        >
          Check impact
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon aria-hidden className="size-4 shrink-0 text-critical" />
              {label}
            </DialogTitle>
            <DialogDescription>
              {incident.bannerText ??
                `An active ${label.toLowerCase()} is affecting the ${incident.scope}. Alerts generated during this window are correlated to this incident.`}
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
                Scope
              </dt>
              <dd className="font-bold text-card-foreground capitalize">
                {incident.scope}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
                Correlated alerts
              </dt>
              <dd className="font-bold text-card-foreground">
                {incident.alertIds.length}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
                Started
              </dt>
              <dd className="font-bold text-card-foreground">
                {relativeTime(incident.openedAt)}
              </dd>
            </div>
            {incident.vendorStatusRef && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
                  Status reference
                </dt>
                <dd className="font-mono text-xs text-card-foreground">
                  {incident.vendorStatusRef}
                </dd>
              </div>
            )}
          </dl>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Dismiss
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
