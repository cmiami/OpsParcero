import { ApprovalQueue } from "@/components/organisms/triage/approval-queue";
import { PageShell } from "@/components/templates/page-shell";

export const metadata = { title: "Approvals · Kaseya Resolution Center" };

/** Approval queue — gated destructive / over-threshold remediations. */
export default function ApprovalsPage() {
  return (
    <PageShell
      title="Approvals"
      description="Human-in-the-loop gates for destructive, irreversible, or large blast-radius fixes."
    >
      <ApprovalQueue canApprove />
    </PageShell>
  );
}
