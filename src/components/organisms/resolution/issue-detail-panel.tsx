"use client";

import * as React from "react";
import { FileText, Wrench, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FixTypeBadge } from "@/components/atoms/fix-type-badge";
import { AiButton } from "@/components/atoms/ai-badge";
import { WeYouSteps } from "@/components/molecules/we-you-steps";
import { AiInsightCard } from "@/components/molecules/ai-insight-card";
import { FIX_META } from "@/lib/status";
import type { Issue } from "@/types";
import { FixModal } from "./fix-modal";
import { ImpactedAssetsPanel } from "./impacted-assets-panel";

export interface IssueDetailPanelProps {
  /** The issue to expand. */
  issue: Issue;
  className?: string;
}

/**
 * IssueDetailPanel — the expanded fix surface for a single issue.
 *
 * The signature troubleshooting flow on one panel: plain-language problem →
 * We/You runbook split → AI insight (the only purple surface) → a fix CTA row
 * that opens the FixModal. The CTA wording follows the fix classification —
 * "End-to-end fix all" / "Run guided fix" / "View runbook" — so the action reads
 * by label, not color (M5). Composes existing molecules only (M2).
 */
export function IssueDetailPanel({ issue, className }: IssueDetailPanelProps) {
  const fix = FIX_META[issue.fixType];
  const [fixOpen, setFixOpen] = React.useState(false);
  const [impactOpen, setImpactOpen] = React.useState(false);

  const automatable = issue.fixType === "full" || issue.fixType === "partial";
  const ctaLabel =
    issue.fixType === "full"
      ? "End-to-end fix all"
      : issue.fixType === "partial"
        ? "Run guided fix"
        : "View runbook";

  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-t border-border bg-subtle p-4 sm:p-5",
        className,
      )}
    >
      {/* Problem — plain language */}
      <section className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          <FileText aria-hidden className="size-3.5 shrink-0" />
          What&apos;s wrong
        </h3>
        <p className="text-sm text-card-foreground">{issue.problem}</p>
        <p className="text-xs text-muted-foreground">{issue.detail}</p>
      </section>

      <Separator />

      {/* We / You runbook */}
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          <Wrench aria-hidden className="size-3.5 shrink-0" />
          How it gets fixed
        </h3>
        <WeYouSteps
          weSteps={issue.runbook.weSteps}
          youSteps={issue.runbook.youSteps}
        />
      </section>

      {/* AI insight — the single purple surface */}
      <AiInsightCard insight={issue.aiInsight} />

      <Separator />

      {/* Fix CTA row */}
      <div className="flex flex-wrap items-center gap-2">
        <FixTypeBadge type={issue.fixType} size="sm" />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setImpactOpen(true)}
          >
            <Users aria-hidden className="size-4" />
            View {issue.impactedAssetIds.length} impacted
          </Button>
          <AiButton aria-label="Ask AI about this issue">Ask AI</AiButton>
          <Button
            type="button"
            size="sm"
            variant={automatable ? "default" : "outline"}
            onClick={() => setFixOpen(true)}
          >
            <fix.icon aria-hidden className="size-4" />
            {ctaLabel}
          </Button>
        </div>
      </div>

      <FixModal issue={issue} open={fixOpen} onOpenChange={setFixOpen} />
      <ImpactedAssetsPanel
        issue={issue}
        open={impactOpen}
        onOpenChange={setImpactOpen}
      />
    </div>
  );
}
