import { PlaybookList } from "@/components/organisms/automation/playbook-list";
import { PageShell } from "@/components/templates/page-shell";

export const metadata = { title: "Playbooks · Kaseya Resolution Center" };

/** The playbook library — saved remediation chains, fix-once-then-forever. */
export default function PlaybooksPage() {
  return (
    <PageShell
      title="Playbooks"
      description="Named, reusable remediation chains — your fixes, saved for the next time they're needed."
    >
      <PlaybookList grouped />
    </PageShell>
  );
}
