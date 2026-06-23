import { getFleetStats } from "@/mock/query";
import { FleetRollup } from "@/components/organisms/fleet-rollup";
import { IssueCharts } from "@/components/organisms/resolution/issue-charts";
import { KpiTile } from "@/components/molecules/kpi-tile";

export const metadata = { title: "Reports · Kaseya Resolution Center" };

/** Reports — SLA/RPO posture, issue trends, and fix-classification breakdown. */
export default function ReportsPage() {
  const s = getFleetStats();
  const selfServePct =
    s.openIssues > 0
      ? Math.round(((s.endToEndFixable + s.guidedFixable) / s.openIssues) * 100)
      : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-display text-xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Posture and trends — exportable views of fleet health and remediation.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile
            label="Self-serviceable"
            value={`${selfServePct}%`}
            sublabel="of open issues have a fix path"
          />
          <KpiTile
            label="End-to-end fixable"
            value={s.endToEndFixable}
            sublabel="one-click"
          />
          <KpiTile
            label="Guided fixes"
            value={s.guidedFixable}
            sublabel="We + You steps"
          />
          <KpiTile
            label="Insights only"
            value={s.insightsOnly}
            sublabel="not auto-fixable"
          />
        </div>
        <IssueCharts />
        <FleetRollup />
      </div>
    </div>
  );
}
