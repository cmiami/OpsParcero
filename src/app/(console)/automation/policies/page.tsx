import { getPolicies } from "@/mock/query";
import { AutomationPolicyEditor } from "@/components/organisms/automation/automation-policy-editor";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Policies · Kaseya Resolution Center" };

/** Auto-remediation policies — the top of the fix-once-then-forever ladder. */
export default function PoliciesPage() {
  const policies = getPolicies();
  const first = policies[0];

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
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {policies.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm">{p.name}</CardTitle>
                  <Badge variant={p.enabled ? "default" : "outline"}>
                    {p.enabled ? "Enabled" : "Paused"}
                  </Badge>
                </div>
                <CardDescription>
                  Triggered {p.stats.triggered} · succeeded {p.stats.succeeded}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        {first ? <AutomationPolicyEditor policy={first} /> : null}
      </div>
    </div>
  );
}
