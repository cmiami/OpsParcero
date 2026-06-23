import { PlaybookList } from "@/components/organisms/automation/playbook-list";

export const metadata = { title: "Playbooks · Kaseya Resolution Center" };

/** The playbook library — saved remediation chains, fix-once-then-forever. */
export default function PlaybooksPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-display text-xl font-bold tracking-tight">
          Playbooks
        </h1>
        <p className="text-sm text-muted-foreground">
          Named, reusable remediation chains — your fixes, saved for the next
          time they&apos;re needed.
        </p>
      </header>
      <div className="min-h-0 flex-1 p-6">
        <PlaybookList grouped />
      </div>
    </div>
  );
}
