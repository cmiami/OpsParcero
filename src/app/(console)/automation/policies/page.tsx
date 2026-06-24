import { PoliciesView } from "./policies-view";
import { PageShell } from "@/components/templates/page-shell";

export const metadata = { title: "Policies · Kaseya Resolution Center" };

/** Auto-remediation policies — the top of the fix-once-then-forever ladder. */
export default function PoliciesPage() {
  return (
    <PageShell
      title="Auto-remediation policies"
      description="Standing rules that fix a recurring failure automatically — gated, observable, and reversible."
      scroll
      contentClassName="space-y-6"
    >
      <PoliciesView />
    </PageShell>
  );
}
