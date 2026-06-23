import { ApprovalQueue } from "@/components/organisms/triage/approval-queue";

export const metadata = { title: "Approvals · Kaseya Resolution Center" };

/** Approval queue — gated destructive / over-threshold remediations. */
export default function ApprovalsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-display text-xl font-bold tracking-tight">
          Approvals
        </h1>
        <p className="text-sm text-muted-foreground">
          Human-in-the-loop gates for destructive, irreversible, or large
          blast-radius fixes.
        </p>
      </header>
      <div className="min-h-0 flex-1 p-6">
        <ApprovalQueue canApprove />
      </div>
    </div>
  );
}
