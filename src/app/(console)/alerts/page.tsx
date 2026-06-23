import { AlertTriageList } from "@/components/organisms/triage/alert-triage-list";

export const metadata = { title: "Alerts · Kaseya Resolution Center" };

/** Triage queue — open alerts grouped by failure category, severity-sorted. */
export default function AlertsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-display text-xl font-bold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Deduped and grouped by root cause — cosmetic noise sorts below real
          failures.
        </p>
      </header>
      <div className="min-h-0 flex-1 p-6">
        <AlertTriageList groupBy="category" />
      </div>
    </div>
  );
}
