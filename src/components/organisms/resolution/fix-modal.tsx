"use client";

import * as React from "react";
import {
  CheckCircle2,
  ListChecks,
  Layers,
  FolderCog,
  AlertTriangle,
  Info,
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
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FixTypeBadge } from "@/components/atoms/fix-type-badge";
import { ApplyScopeControl } from "@/components/molecules/apply-scope-control";
import { FIX_META } from "@/lib/status";
import { getActionsForFailureMode } from "@/mock/query";
import { simulateRun } from "@/mock/runner";
import {
  recordSimulatedRun,
  buildAutomationPolicy,
} from "@/lib/activity-record";
import { usePolicies } from "@/stores/automation-policies";
import type { ActionScope, AssetId, EntityRef, Issue } from "@/types";

export interface FixModalProps {
  /** The issue being remediated. */
  issue: Issue;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** The persistent outcome shown in-modal after a confirm (M5: icon + text). */
type FixResult = {
  tone: "success" | "warning" | "info";
  title: string;
  detail: string;
};

const RESULT_TONE = {
  success: {
    Icon: CheckCircle2,
    tint: "bg-success-tint",
    text: "text-success",
    border: "border-success",
  },
  warning: {
    Icon: AlertTriangle,
    tint: "bg-warning-tint",
    text: "text-warning",
    border: "border-warning",
  },
  info: {
    Icon: Info,
    tint: "bg-primary-tint",
    text: "text-primary-accent",
    border: "border-primary",
  },
} as const;

/**
 * FixModal — the "What will happen" confirmation for applying a fix.
 *
 * Summarizes the action, lets the technician set scope on the once → all-matching
 * → always spine (ApplyScopeControl) plus an optional "always fix this whole
 * category" escalation, then runs the bound remediation through the deterministic
 * simulator and surfaces the outcome as a toast. Insights-only issues have no
 * automatable action, so the modal degrades to a runbook hand-off (M5: every
 * state reads by icon + text, not color alone).
 */
export function FixModal({ issue, open, onOpenChange }: FixModalProps) {
  const fix = FIX_META[issue.fixType];
  const FixIcon = fix.icon;
  const automatable = issue.fixType === "full" || issue.fixType === "partial";

  const action = React.useMemo(
    () =>
      issue.failureModeId
        ? getActionsForFailureMode(issue.failureModeId)[0]
        : undefined,
    [issue.failureModeId],
  );

  const [scope, setScope] = React.useState<ActionScope>("once");
  const [alwaysCategory, setAlwaysCategory] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<FixResult | null>(null);

  // Reset transient state whenever the modal (re)opens for a fresh issue.
  React.useEffect(() => {
    if (open) {
      setScope("once");
      setAlwaysCategory(false);
      setRunning(false);
      setResult(null);
    }
  }, [open, issue.id]);

  const matchCount = issue.impactedAssetIds.length;

  function handleConfirm() {
    if (!action) {
      setResult({
        tone: "info",
        title: "Runbook opened",
        detail: `${issue.title} is insights-only — follow the You-steps to resolve it.`,
      });
      return;
    }

    setRunning(true);
    // Scope decides the target set: "once" acts on a single asset; "all-matching"
    // and "always" act on every impacted asset (count + targets agree).
    const targetIds: AssetId[] =
      scope === "once"
        ? issue.impactedAssetIds.slice(0, 1)
        : issue.impactedAssetIds;
    const targets: EntityRef[] = targetIds.map((id) => ({ kind: "asset", id }));
    // Simulate against the deterministic runner; runtime randomness lives here,
    // inside an event handler, never at module scope (M6).
    const outcome = simulateRun(action, targets, scope, {}, { approved: true });

    // Where the apply landed — the once → all-matching → always scope spine.
    const appliedCount = targetIds.length;
    const where =
      scope === "always"
        ? "this category, now and going forward"
        : scope === "all-matching"
          ? `${appliedCount} matching ${appliedCount === 1 ? "asset" : "assets"}`
          : "1 asset";

    // Persist a durable ActionRun + AuditLogEntry for the dispatch, and heal the
    // targeted assets when the run resolves them — so Run history, Audit, and the
    // fleet asset-state reflect what just happened (not the frozen seed).
    recordSimulatedRun({
      actionId: action.id,
      actionLabel: action.label,
      targets,
      scope,
      outcome,
      heal: outcome.healsAsset
        ? { assetIds: targetIds, status: outcome.healedStatus ?? "protected" }
        : undefined,
    });

    if (alwaysCategory || scope === "always") {
      // Create a standing policy that the Policies page reads from the store.
      usePolicies.getState().addPolicy(
        buildAutomationPolicy({
          failureModeId: issue.failureModeId,
          category: issue.category,
          actionId: action.id,
          productBucket: issue.productBucket,
        }),
      );
      setResult({
        tone: "warning",
        title: "Auto-remediation policy created",
        detail: `Future "${issue.category}" failures will be fixed automatically. ${outcome.resultSummary} See Automation → Policies.`,
      });
    } else if (outcome.healsAsset) {
      setResult({
        tone: "success",
        title: "Fix applied",
        detail: `Applied to ${where}. ${outcome.resultSummary} Recorded in Run history and Audit.`,
      });
    } else if (outcome.awaitingApproval) {
      setResult({
        tone: "warning",
        title: "Approval required",
        detail: outcome.resultSummary,
      });
    } else {
      setResult({
        tone: "info",
        title: "Fix dispatched",
        detail: `Dispatched to ${where}. ${outcome.resultSummary}`,
      });
    }

    setRunning(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FixIcon
              aria-hidden
              className={cn("size-4 shrink-0", fix.textClass)}
            />
            {automatable ? "Apply fix" : "Open runbook"}
          </DialogTitle>
          <DialogDescription>{issue.title}</DialogDescription>
        </DialogHeader>

        <section
          aria-label="What will happen"
          className="flex flex-col gap-2 rounded-md border border-border bg-subtle p-3"
        >
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
            <ListChecks aria-hidden className="size-3.5 shrink-0" />
            What will happen
          </h3>
          <div className="flex items-center gap-2">
            <FixTypeBadge type={issue.fixType} size="sm" />
            <span className="text-sm text-card-foreground">
              {action ? action.label : "Diagnostic runbook"} on{" "}
              <span className="font-bold tabular-nums">{matchCount}</span>{" "}
              {matchCount === 1 ? "asset" : "assets"}.
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{issue.problem}</p>
        </section>

        {automatable && !result && (
          <>
            <ApplyScopeControl
              value={scope}
              onChange={setScope}
              matchCount={matchCount}
              disabled={running}
            />

            <Label
              htmlFor="fix-always-category"
              className={cn(
                "flex items-start justify-between gap-3 rounded-md border border-border bg-surface p-3 transition-colors hover:bg-subtle",
                alwaysCategory && "border-warning bg-warning-tint",
              )}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-bold text-card-foreground">
                  {alwaysCategory ? (
                    <FolderCog
                      aria-hidden
                      className="size-3.5 shrink-0 text-warning"
                    />
                  ) : (
                    <Layers
                      aria-hidden
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                  )}
                  Always fix this category automatically
                </span>
                <span className="text-xs text-muted-foreground">
                  Auto-remediate every future {issue.category} failure across the
                  fleet.
                </span>
              </span>
              <Switch
                id="fix-always-category"
                checked={alwaysCategory}
                onCheckedChange={setAlwaysCategory}
                disabled={running}
              />
            </Label>
          </>
        )}

        {result &&
          (() => {
            const tone = RESULT_TONE[result.tone];
            const ToneIcon = tone.Icon;
            return (
              <section
                aria-label="Result"
                role="status"
                className={cn(
                  "flex items-start gap-2 rounded-md border p-3",
                  tone.tint,
                  tone.border,
                )}
              >
                <ToneIcon
                  aria-hidden
                  className={cn("mt-0.5 size-4 shrink-0", tone.text)}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn("text-sm font-bold", tone.text)}>
                    {result.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {result.detail}
                  </span>
                </div>
              </section>
            );
          })()}

        <DialogFooter>
          {result ? (
            <Button size="sm" onClick={() => onOpenChange?.(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange?.(false)}
                disabled={running}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirm} disabled={running}>
                <CheckCircle2 aria-hidden className="size-4" />
                {automatable
                  ? scope === "always" || alwaysCategory
                    ? "Create policy"
                    : "Confirm fix"
                  : "Open runbook"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
