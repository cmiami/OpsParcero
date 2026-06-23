import { PoliciesView } from "./policies-view";

export const metadata = { title: "Policies · Kaseya Resolution Center" };

/** Auto-remediation policies — the top of the fix-once-then-forever ladder. */
export default function PoliciesPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-display text-xl font-bold tracking-tight">
          Auto-remediation policies
        </h1>
        <p className="text-sm text-muted-foreground">
          Standing rules that fix a recurring failure automatically — gated,
          observable, and reversible.
        </p>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
        <PoliciesView />
      </div>
    </div>
  );
}
