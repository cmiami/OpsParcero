"use client";

import * as React from "react";
import { CheckCircle2, ListChecks, AlertTriangle, Info } from "lucide-react";
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
import {
  ApplyScopeControl,
  type PolicyBreadth,
} from "@/components/molecules/apply-scope-control";
import { FIX_META } from "@/lib/status";
import { getPrimaryAction, getUsers } from "@/mock/query";
import { simulateRun } from "@/mock/runner";
import {
  recordSimulatedRun,
  buildAutomationPolicy,
  recordPolicyCreated,
  healedAssetIds,
} from "@/lib/activity-record";
import { usePolicies } from "@/stores/automation-policies";
import { useApprovals } from "@/stores/approvals";
import { makeUid } from "@/stores/uid";
import type {
  ActionScope,
  ApprovalRequestId,
  AssetId,
  EntityRef,
  Issue,
} from "@/types";

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

  // The self-heal action that resolves the asset — not merely actions[0], which
  // is often a guidance-only diagnostic. getPrimaryAction falls back to the first
  // action for guidance/insights modes that own no self-heal.
  const action = React.useMemo(
    () =>
      issue.failureModeId ? getPrimaryAction(issue.failureModeId) : undefined,
    [issue.failureModeId],
  );

  const [scope, setScope] = React.useState<ActionScope>("once");
  // When scope is "always", whether the policy covers this failure type or the
  // whole category (replaces the old separate "always fix category" toggle).
  const [policyBreadth, setPolicyBreadth] = React.useState<PolicyBreadth>("type");
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<FixResult | null>(null);

  // Reset transient state whenever the modal (re)opens for a fresh issue.
  React.useEffect(() => {
    if (open) {
      setScope("once");
      setPolicyBreadth("type");
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
    // inside an event handler, never at module scope (M6). No `approved` override
    // — the runner's gate must fire for destructive / over-threshold fixes.
    const outcome = simulateRun(action, targets, scope, {});

    // Approval gate: a destructive / over-threshold dispatch pauses here. Enqueue
    // a resumable ApprovalRequest the Approval queue can decide — NOT a heal — so
    // the human-in-the-loop contract holds (same pattern as the action cart).
    if (outcome.awaitingApproval) {
      useApprovals.getState().enqueue({
        id: makeUid("apr") as ApprovalRequestId,
        requestedFor: { kind: "action-run", refId: action.id },
        requestedBy: getUsers()[0]?.id ?? "u-current",
        reason: !action.reversible
          ? "irreversible"
          : action.destructive
            ? "destructive"
            : "over-threshold",
        blastRadius: outcome.blastRadius ?? {
          assetCount: targetIds.length,
          preview: action.label,
        },
        // Resumable: the Approval queue can run this exact dispatch on approval.
        payload: {
          kind: "action",
          actionId: action.id,
          targetRefs: targets,
          scope,
          params: {},
        },
        state: "pending",
      });
      setResult({
        tone: "warning",
        title: "Approval required",
        detail: `${outcome.resultSummary} Review it in Automation → Approvals.`,
      });
      setRunning(false);
      return;
    }

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
    // Heal only the targets that actually succeeded — a partial outcome leaves
    // some failed; healing the whole list would falsely mark them protected.
    const healed = healedAssetIds(outcome);
    recordSimulatedRun({
      actionId: action.id,
      actionLabel: action.label,
      targets,
      scope,
      outcome,
      heal:
        outcome.healsAsset && healed.length
          ? { assetIds: healed, status: outcome.healedStatus ?? "protected" }
          : undefined,
    });

    if (scope === "always") {
      // Standing policy. Breadth decides what it covers: "type" → just this
      // failure mode; "category" → every failure in the category (failureModeId
      // omitted). One control, one meaning — no separate category toggle.
      const wholeCategory = policyBreadth === "category";
      const policy = buildAutomationPolicy({
        failureModeId: wholeCategory ? undefined : issue.failureModeId,
        category: issue.category,
        actionId: action.id,
        productBucket: issue.productBucket,
      });
      usePolicies.getState().addPolicy(policy);
      recordPolicyCreated({ policyId: policy.id, policyName: policy.name });
      setResult({
        tone: "warning",
        title: "Policy created (paused)",
        detail: wholeCategory
          ? `Applied now, and a standing rule for every future "${issue.category}" failure was created — paused pending approval. Enable it in Automation → Policies. ${outcome.resultSummary}`
          : `Applied now, and a standing rule for this failure was created — paused pending approval. Enable it in Automation → Policies. ${outcome.resultSummary}`,
      });
    } else if (outcome.healsAsset) {
      setResult({
        tone: "success",
        title: "Fix applied",
        detail: `Applied to ${where}. ${outcome.resultSummary} Recorded in Run history and Audit.`,
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
          <h3 className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
            <ListChecks aria-hidden className="size-3.5 shrink-0" />
            What will happen
          </h3>
          <p className="text-sm text-card-foreground">
            {action ? action.label : "Diagnostic runbook"} on{" "}
            <span className="font-bold tabular-nums">{matchCount}</span>{" "}
            {matchCount === 1 ? "asset" : "assets"}.
          </p>
          <p className="text-xs text-muted-foreground">{issue.problem}</p>
        </section>

        {automatable && !result && (
          <ApplyScopeControl
            value={scope}
            onChange={setScope}
            matchCount={matchCount}
            disabled={running}
            policyBreadth={policyBreadth}
            onPolicyBreadthChange={setPolicyBreadth}
            categoryLabel={issue.category}
          />
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
                  ? scope === "always"
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
