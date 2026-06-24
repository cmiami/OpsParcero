import { AlertTriageList } from "@/components/organisms/triage/alert-triage-list";
import { PageShell } from "@/components/templates/page-shell";

export const metadata = { title: "Alerts · Kaseya Resolution Center" };

/** Triage queue — open alerts grouped by failure category, severity-sorted. */
export default function AlertsPage() {
  return (
    <PageShell
      title="Alerts"
      description="Deduped and grouped by root cause — cosmetic noise sorts below real failures."
    >
      <AlertTriageList groupBy="category" />
    </PageShell>
  );
}
