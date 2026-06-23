"use client";

import * as React from "react";
import {
  HelpCircle,
  ShieldAlert,
  Clock,
  RotateCcw,
  Gauge,
  PlayCircle,
  Zap,
  BookmarkPlus,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MonoLabel } from "@/components/atoms/mono-label";
import { FixTypeBadge } from "@/components/atoms/fix-type-badge";
import { ApplyScopeControl } from "@/components/molecules/apply-scope-control";
import { WeYouSteps } from "@/components/molecules/we-you-steps";
import { AiInsightCard } from "@/components/molecules/ai-insight-card";
import { getIssues, getActionsForFailureMode } from "@/mock/query";
import { simulateRun, type RunnerOutcome } from "@/mock/runner";
import { useActionCart } from "@/stores/action-cart";
import type {
  Issue,
  ProtectedAsset,
  FailureMode,
  RemediationAction,
  ActionScope,
  EntityRef,
} from "@/types";
import { toast } from "sonner";

export interface RemediationPanelProps {
  /** The focus asset (drives the target ref + "this asset" scope label). */
  asset?: ProtectedAsset;
  /** The issue being diagnosed; defaults to the first seeded issue. */
  issue?: Issue;
  /** Resolved failure mode (for the verbatim error + classification). */
  failureMode?: FailureMode;
  /** Candidate remediation actions; defaults to those for the issue's mode. */
  suggestedActions?: RemediationAction[];
  /** Live count of assets matching the issue (drives the "all matching" scope). */
  matchCount?: number;
  className?: string;
}

type Phase = "suggestion" | "executing" | "success" | "failure";

/** Compact metric row (icon + label) for the suggested-fix card. */
function FixMeta({
  icon: Icon,
  label,
  value,
  tone = "muted",
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone?: "muted" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning"
      : tone === "success"
        ? "text-success"
        : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <Icon aria-hidden className={cn("size-3.5 shrink-0", toneClass)} />
      <span className="text-xs text-muted-foreground">
        {label}: <span className={cn("font-bold", toneClass)}>{value}</span>
      </span>
    </div>
  );
}

/**
 * RemediationPanel — the signature "why is this red → fix it" rail (docs/09 §7.4).
 *
 * Walks a technician from a red status to a scoped, applied fix on one surface:
 * "Why is this red?" (failure mode + verbatim error in MonoLabel + fix
 * classification) → the suggested-fix card (risk · duration · reversible ·
 * confidence) → the We/You runbook → ApplyScopeControl (once → all → always) →
 * the action bar [Dry-run] [Apply once] [Always…] [Save as playbook]. Applying
 * calls the simulated runner and toasts the outcome; "Save as playbook" loads the
 * chain into the action cart. Status reads by icon + text, never color alone (M5).
 */
export function RemediationPanel({
  asset,
  issue: issueProp,
  failureMode,
  suggestedActions,
  matchCount,
  className,
}: RemediationPanelProps) {
  const issue = issueProp ?? getIssues()[0];
  const actions =
    suggestedActions ??
    (issue.failureModeId ? getActionsForFailureMode(issue.failureModeId) : []);

  const primaryAction = actions[0];
  const addAction = useActionCart((s) => s.addAction);
  const setDefaultScope = useActionCart((s) => s.setDefaultScope);
  const addTarget = useActionCart((s) => s.addTarget);

  const [scope, setScope] = React.useState<ActionScope>("once");
  const [phase, setPhase] = React.useState<Phase>("suggestion");
  const [outcome, setOutcome] = React.useState<RunnerOutcome | null>(null);

  const verbatimError = issue.detail || failureMode?.description || issue.problem;
  const targets: EntityRef[] = asset
    ? [{ kind: "asset", id: asset.id, label: asset.displayName }]
    : issue.impactedAssetIds.slice(0, 1).map((id) => ({ kind: "asset" as const, id }));

  const executing = phase === "executing";

  function run(dryRun: boolean) {
    if (!primaryAction) return;
    setPhase("executing");
    setOutcome(null);
    // Simulated latency: runtime-only randomness inside a handler is allowed.
    window.setTimeout(
      () => {
        const result = simulateRun(primaryAction, targets, scope, {}, { dryRun });
        setOutcome(result);
        const ok =
          result.state === "succeeded" ||
          result.state === "partial" ||
          result.preview === true ||
          result.awaitingApproval === true;
        setPhase(ok ? "success" : "failure");
        if (result.awaitingApproval) {
          toast.warning("Approval required", { description: result.resultSummary });
        } else if (result.preview) {
          toast("Dry-run complete", { description: result.resultSummary });
        } else if (ok) {
          toast.success(`${primaryAction.label} applied`, {
            description: result.resultSummary,
          });
        } else {
          toast.error(`${primaryAction.label} failed`, {
            description: result.resultSummary,
          });
        }
      },
      600,
    );
  }

  function applyAlways() {
    setScope("always");
    setDefaultScope("always");
    toast("Graduate to a policy", {
      description: `"${issue.title}" will be set to fix automatically going forward.`,
    });
  }

  function saveAsPlaybook() {
    targets.forEach((t) => addTarget(t.id));
    actions.forEach((a) => addAction(a.id));
    toast.success("Loaded into Action Cart", {
      description: `${actions.length} step${actions.length === 1 ? "" : "s"} ready to save as a playbook.`,
    });
  }

  return (
    <section
      role="region"
      aria-label="Failure diagnosis and remediation"
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      {/* Why is this red? */}
      <div className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-card-foreground">
          <HelpCircle aria-hidden className="size-4 shrink-0 text-critical" />
          Why is this red?
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-card-foreground">
            {failureMode?.title ?? issue.title}
          </span>
          <FixTypeBadge type={issue.fixType} size="sm" />
        </div>
        <p className="text-sm text-muted-foreground">{issue.problem}</p>
        {verbatimError && (
          <MonoLabel copyable title="Verbatim error">
            {verbatimError}
          </MonoLabel>
        )}
      </div>

      <Separator />

      {/* AI insight */}
      <AiInsightCard insight={issue.aiInsight} />

      {/* Suggested fix card */}
      {primaryAction && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
          <div className="flex items-start gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-tint">
              <Zap aria-hidden className="size-4 text-primary" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
                Suggested fix
              </span>
              <span className="text-sm font-bold text-card-foreground">
                {primaryAction.label}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <FixMeta
              icon={Gauge}
              label="Risk"
              value={primaryAction.destructive ? "high" : "low"}
              tone={primaryAction.destructive ? "warning" : "success"}
            />
            <FixMeta
              icon={Clock}
              label="Duration"
              value={
                primaryAction.estDurationSec
                  ? `~${Math.max(1, Math.round(primaryAction.estDurationSec / 60))} min`
                  : "instant"
              }
            />
            <FixMeta
              icon={RotateCcw}
              label="Reversible"
              value={primaryAction.reversible ? "yes" : "no"}
              tone={primaryAction.reversible ? "success" : "warning"}
            />
            <FixMeta
              icon={Gauge}
              label="Confidence"
              value={`${issue.aiInsight.confidencePct}%`}
              tone="success"
            />
          </div>
        </div>
      )}

      {/* We / You runbook */}
      <WeYouSteps
        weSteps={issue.runbook.weSteps}
        youSteps={issue.runbook.youSteps}
      />

      <Separator />

      {/* Scope */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          Apply scope
        </span>
        <ApplyScopeControl
          value={scope}
          onChange={setScope}
          matchCount={matchCount ?? issue.occurrenceCount}
          disabled={executing}
        />
        <p aria-live="polite" className="sr-only">
          {scope === "all-matching"
            ? `Will affect ${matchCount ?? issue.occurrenceCount} matching assets.`
            : scope === "always"
              ? "Will create a standing policy."
              : "Will affect this asset only."}
        </p>
      </div>

      {/* Outcome banner */}
      {outcome && phase !== "executing" && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-md p-3",
            phase === "success" ? "bg-success-tint" : "bg-critical-tint",
          )}
        >
          {phase === "success" ? (
            <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-critical" />
          )}
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "text-sm font-bold",
                phase === "success" ? "text-success" : "text-critical",
              )}
            >
              {outcome.preview
                ? "Dry-run preview"
                : outcome.awaitingApproval
                  ? "Awaiting approval"
                  : phase === "success"
                    ? "Applied"
                    : "Failed"}
            </span>
            <span className="text-xs text-muted-foreground">
              {outcome.resultSummary}
            </span>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={executing || !primaryAction?.supportsDryRun}
          onClick={() => run(true)}
        >
          {executing ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <ShieldAlert aria-hidden className="size-4" />
          )}
          Dry-run
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={executing || !primaryAction}
          onClick={() => run(false)}
        >
          {executing ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <PlayCircle aria-hidden className="size-4" />
          )}
          {scope === "all-matching"
            ? `Apply to ${matchCount ?? issue.occurrenceCount}`
            : "Apply once"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={executing}
          onClick={applyAlways}
        >
          <Zap aria-hidden className="size-4" />
          Always…
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={executing || actions.length === 0}
          onClick={saveAsPlaybook}
        >
          <BookmarkPlus aria-hidden className="size-4" />
          Save as playbook
        </Button>
      </div>
    </section>
  );
}
