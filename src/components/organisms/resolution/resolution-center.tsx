"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { OutageBanner } from "@/components/molecules/outage-banner";
import {
  getFleetStats,
  getIssueCategories,
  getActiveOutage,
  type FleetStats,
} from "@/mock/query";
import { useActiveClientId } from "@/stores/use-active-client";
import type { Incident, Issue } from "@/types";
import type { IssueCategoryGroup } from "@/mock/issues";
import { StatBar } from "./stat-bar";
import { SummaryCardsRow } from "./summary-cards-row";
import { IssueCharts } from "./issue-charts";
import { CategoryGroup } from "./category-group";
import { ImpactedAssetsPanel } from "./impacted-assets-panel";

export interface ResolutionCenterProps {
  className?: string;
}

/**
 * ResolutionCenter — the product's signature home surface (docs/00 §3 spine).
 *
 * Composes the full troubleshooting home top-to-bottom: StatBar → outage banner
 * (when active) → SummaryCardsRow → charts row → the collapsible CategoryGroup
 * list of issues grouped by failure category, worst category first. Reads from
 * the deterministic mock layer (getFleetStats / getIssueCategories /
 * getActiveOutage). The top-problem card opens the impacted-assets panel.
 */
export function ResolutionCenter({ className }: ResolutionCenterProps) {
  const activeClientId = useActiveClientId();
  const stats: FleetStats = React.useMemo(
    () => getFleetStats(activeClientId),
    [activeClientId],
  );
  const groups: IssueCategoryGroup[] = React.useMemo(
    () => getIssueCategories(activeClientId),
    [activeClientId],
  );
  const outage: Incident | undefined = React.useMemo(
    () => getActiveOutage(),
    [],
  );

  const [panelIssue, setPanelIssue] = React.useState<Issue | null>(null);

  // Deep-link from the command palette (/resolution?issue=…): expand that issue's
  // category and scroll it into view. Read-only URL state via next's
  // useSearchParams (mocked by the Storybook nextjs framework — no extra adapter).
  const focusIssueId = useSearchParams().get("issue");
  const focusCategory = React.useMemo(
    () =>
      focusIssueId
        ? groups.find((g) => g.issues.some((i) => i.id === focusIssueId))
            ?.category
        : undefined,
    [focusIssueId, groups],
  );
  React.useEffect(() => {
    if (!focusIssueId) return;
    document
      .getElementById(`issue-${focusIssueId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusIssueId]);

  return (
    <div className={cn("flex flex-col", className)}>
      <StatBar stats={stats} outage={outage ?? null} />

      <div className="flex flex-col gap-5 p-4 sm:p-5">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-card-foreground">
            Resolution Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Issues grouped by category — understand why each failed, and fix it
            once or forever.
          </p>
        </header>

        {outage && <OutageBanner incident={outage} />}

        <SummaryCardsRow
          stats={stats}
          clientId={activeClientId}
          onSelectTopProblem={setPanelIssue}
        />

        <IssueCharts stats={stats} clientId={activeClientId} />

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-card-foreground">
            Issues by category
          </h2>
          {groups.length > 0 ? (
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <CategoryGroup
                  key={group.category}
                  group={group}
                  defaultOpen={group.category === focusCategory ? true : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-10 text-center">
              <ShieldCheck aria-hidden className="size-8 text-success" />
              <p className="text-sm font-bold text-card-foreground">
                Nothing needs you right now
              </p>
              <p className="text-sm text-muted-foreground">
                Every protected asset is healthy. New failures will appear here,
                grouped and explained.
              </p>
            </div>
          )}
        </section>
      </div>

      {panelIssue && (
        <ImpactedAssetsPanel
          issue={panelIssue}
          open={Boolean(panelIssue)}
          onOpenChange={(o) => {
            if (!o) setPanelIssue(null);
          }}
        />
      )}
    </div>
  );
}
