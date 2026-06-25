"use client";

import * as React from "react";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { AlertTriageList } from "@/components/organisms/triage/alert-triage-list";
import type { TriageAction } from "@/components/organisms/triage/alert-triage-row";
import { GuidedFixPanel } from "@/components/organisms/fix/guided-fix-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAsset, getIssues } from "@/mock/query";
import { recordAlertTriage } from "@/lib/activity-record";
import type { Alert, Issue, ProtectedAsset } from "@/types";

/**
 * AlertsView — the Alerts page's client composition (the page-level shell that
 * owns dialog state, mirroring fleet/[assetId]/asset-detail-view.tsx). It supplies
 * the `onTriage` the AlertTriageList needs: "Fix" resolves the alert's asset +
 * diagnosed issue and opens the EXISTING streaming GuidedFixPanel (which records
 * via its own recordAgentRun and heals the asset); the other triage verbs give
 * honest mock feedback. No new fix surface — the panel and stores are reused.
 */
export function AlertsView() {
  const [fixFor, setFixFor] = React.useState<{
    asset: ProtectedAsset;
    issue?: Issue;
  } | null>(null);

  function onTriage(action: TriageAction, alert: Alert) {
    if (action === "fix") {
      const assetId = alert.assetId;
      const asset = assetId ? getAsset(assetId) : undefined;
      if (!asset || !assetId) {
        toast.info("No asset attached to this alert", {
          description: alert.title,
        });
        return;
      }
      const issue = getIssues().find((i) =>
        i.impactedAssetIds.includes(assetId),
      );
      setFixFor({ asset, issue });
      return;
    }
    const verb = {
      acknowledge: "acknowledged",
      assign: "assigned",
      snooze: "snoozed",
      resolve: "resolved",
    }[action];
    // Real-semantic verbs (resolve / acknowledge) leave a durable audit + (for
    // resolve) close the alert; snooze / assign stay toast-only (P3-7).
    if (action === "resolve" || action === "acknowledge") {
      recordAlertTriage({
        alertId: alert.id,
        alertTitle: alert.title,
        assetId: alert.assetId,
        verb: action === "resolve" ? "resolved" : "acknowledged",
      });
    }
    toast.success(`Alert ${verb}`, { description: alert.title });
  }

  return (
    <>
      <AlertTriageList groupBy="category" onTriage={onTriage} />

      <Dialog open={fixFor !== null} onOpenChange={(o) => !o && setFixFor(null)}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="size-4 text-primary" aria-hidden /> Guided fix —{" "}
              {fixFor?.asset.displayName}
            </DialogTitle>
          </DialogHeader>
          {fixFor && <GuidedFixPanel asset={fixFor.asset} issue={fixFor.issue} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
