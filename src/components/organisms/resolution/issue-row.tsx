"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MonoLabel } from "@/components/atoms/mono-label";
import { ProductChip } from "@/components/atoms/product-chip";
import { SeverityBadge } from "@/components/atoms/severity-badge";
import { OccurrenceCount } from "@/components/atoms/occurrence-count";
import { AiButton } from "@/components/atoms/ai-badge";
import { Sparkles, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AiFixConsole } from "@/components/organisms/fix/ai-fix-console";
import { GuidedFixPanel } from "@/components/organisms/fix/guided-fix-panel";
import { getAsset } from "@/mock/query";
import { FIX_META } from "@/lib/status";
import type { Issue } from "@/types";
import { IssueDetailPanel } from "./issue-detail-panel";
import { ImpactedAssetsPanel } from "./impacted-assets-panel";
import { FixModal } from "./fix-modal";

export interface IssueRowProps {
  /** The issue to render. */
  issue: Issue;
  /** Controlled expanded state; omit for self-managed expansion. */
  expanded?: boolean;
  /** Fired when the row toggles; required for controlled use. */
  onToggle?: (expanded: boolean) => void;
  className?: string;
}

/**
 * IssueRow — one issue in a category group's table.
 *
 * Shows name + mono detail, product chip, severity, occurrence count (→ impacted
 * panel), and the fix classification, plus a primary Fix button and a purple AI
 * affordance. Expands in place to the IssueDetailPanel. Works controlled
 * (expanded/onToggle) or uncontrolled. Severity/status read by icon + label, not
 * color (M5); purple is confined to the AI button (M4).
 */
export function IssueRow({
  issue,
  expanded,
  onToggle,
  className,
}: IssueRowProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = expanded !== undefined;
  const open = isControlled ? expanded : internalOpen;

  const [impactOpen, setImpactOpen] = React.useState(false);
  const [fixOpen, setFixOpen] = React.useState(false);
  const [guidedOpen, setGuidedOpen] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);

  // The interactive AI/guided panels act on one concrete asset; the issue's first
  // impacted asset is the canonical focus (the convention ImpactedAssetsPanel and
  // FixModal already use). Insights-only issues may have none → Ask AI disables.
  const focusAsset = getAsset(issue.impactedAssetIds[0]);

  const fix = FIX_META[issue.fixType];
  const automatable = issue.fixType === "full" || issue.fixType === "partial";
  // The primary button is the SINGLE fix affordance: its icon + label carry the
  // classification (so no separate, non-clickable "Guided fix" tag), and it opens
  // what it names — Guided fix → the streaming GuidedFixPanel; End-to-end → the
  // FixModal confirm; Insights → the runbook.
  const opensGuidedPanel = issue.fixType === "partial" && Boolean(focusAsset);
  const fixLabel =
    issue.fixType === "full"
      ? "End-to-end fix"
      : issue.fixType === "partial"
        ? "Guided fix"
        : "Runbook";
  const onPrimaryFix = () =>
    opensGuidedPanel ? setGuidedOpen(true) : setFixOpen(true);
  const detailId = `issue-detail-${issue.id}`;

  function toggle() {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onToggle?.(next);
  }

  return (
    <div
      id={`issue-${issue.id}`}
      className={cn(
        "scroll-mt-24 border-b border-border last:border-b-0",
        open && "bg-subtle/60",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap">
        {/* Expand toggle + name/detail */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={detailId}
          className="flex min-w-0 flex-1 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "mt-0.5 size-4 shrink-0 text-faint-foreground transition-transform",
              open && "rotate-180",
            )}
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-bold text-card-foreground">
              {issue.title}
            </span>
            <MonoLabel className="truncate text-faint-foreground">
              {issue.detail}
            </MonoLabel>
          </span>
        </button>

        {/* Meta chips */}
        <div className="flex shrink-0 items-center gap-2">
          <ProductChip bucket={issue.productBucket} size="sm" />
          <SeverityBadge severity={issue.severity} size="sm" />
          <OccurrenceCount
            count={issue.impactedAssetIds.length}
            onClick={() => setImpactOpen(true)}
          />
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <AiButton
            aria-label={`Ask AI about ${issue.title}`}
            onClick={() => setAiOpen(true)}
            disabled={!focusAsset}
          />
          <Button
            type="button"
            size="sm"
            variant={automatable ? "default" : "outline"}
            onClick={onPrimaryFix}
          >
            <fix.icon aria-hidden className="size-4" />
            {fixLabel}
          </Button>
        </div>
      </div>

      {open && (
        <div id={detailId}>
          <IssueDetailPanel issue={issue} />
        </div>
      )}

      <ImpactedAssetsPanel
        issue={issue}
        open={impactOpen}
        onOpenChange={setImpactOpen}
      />
      <FixModal issue={issue} open={fixOpen} onOpenChange={setFixOpen} />

      {/* Guided fix → the existing streaming GuidedFixPanel (records + heals via
          its own recordAgentRun). The button labeled "Guided fix" opens THIS. */}
      <Dialog open={guidedOpen} onOpenChange={(o) => !o && setGuidedOpen(false)}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="size-4 text-primary" aria-hidden /> Guided fix —{" "}
              {issue.title}
            </DialogTitle>
          </DialogHeader>
          {focusAsset && (
            <GuidedFixPanel
              asset={focusAsset}
              issue={issue}
              matchCount={issue.impactedAssetIds.length}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Ask AI → the existing autonomous AI fix console (records as triggeredBy:ai
          and heals the asset via its own recordAgentRun — no recording here). */}
      <Dialog open={aiOpen} onOpenChange={(o) => !o && setAiOpen(false)}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-ai" aria-hidden /> Fix with AI —{" "}
              {issue.title}
            </DialogTitle>
          </DialogHeader>
          {focusAsset && (
            <AiFixConsole
              asset={focusAsset}
              issue={issue}
              onSwitchToGuided={() => {
                setAiOpen(false);
                if (opensGuidedPanel) setGuidedOpen(true);
                else setFixOpen(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
