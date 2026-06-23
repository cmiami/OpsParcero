import Link from "next/link";
import { getFleetStats, getIncidents } from "@/mock/query";
import { FleetRollup } from "@/components/organisms/fleet-rollup";
import { IssueCharts } from "@/components/organisms/resolution/issue-charts";
import { KpiTile } from "@/components/molecules/kpi-tile";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Overview · Kaseya Resolution Center" };

/** Fleet health at a glance — read-only manager/NOC dashboard. */
export default function OverviewPage() {
  const s = getFleetStats();
  const incidents = getIncidents().filter((i) => i.status === "active");
  const protectedPct = s.totalAssets
    ? Math.round((s.protectedAssets / s.totalAssets) * 100)
    : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-display text-xl font-bold tracking-tight">
          Overview
        </h1>
        <p className="text-sm text-muted-foreground">
          Fleet health, active incidents, and what&apos;s trending worse — every
          number drills into its cohort.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
        <FleetRollup />

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Active incidents</CardTitle>
              <CardDescription>
                {incidents.length} root cause
                {incidents.length === 1 ? "" : "s"} affecting the fleet right now
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {incidents.length ? (
                incidents.map((i) => (
                  <Link
                    key={i.id}
                    href={`/incidents/${i.id}`}
                    className="block rounded-md border border-border p-3 transition-colors hover:bg-subtle"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {i.bannerText ?? i.kind}
                      </span>
                      <Badge variant="outline" className="capitalize">
                        {i.scope}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {i.alertIds.length} alerts grouped · {i.kind}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  All clear — no active incidents.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <KpiTile
              label="Protected"
              value={`${protectedPct}%`}
              sublabel={`${s.protectedAssets} of ${s.totalAssets}`}
            />
            <KpiTile
              label="Failed assets"
              value={s.failedAssets}
              sublabel="need attention"
            />
            <KpiTile
              label="Open issues"
              value={s.openIssues}
              sublabel={`${s.criticalIssues} critical`}
            />
            <KpiTile
              label="Resolved today"
              value={s.resolvedToday}
              sublabel={
                s.lastResolvedRelative
                  ? `last ${s.lastResolvedRelative}`
                  : "across the fleet"
              }
            />
          </div>
        </div>

        <IssueCharts />
      </div>
    </div>
  );
}
