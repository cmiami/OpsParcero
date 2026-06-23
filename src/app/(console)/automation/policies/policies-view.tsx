"use client";

import * as React from "react";
import { getPolicies } from "@/mock/query";
import { usePolicies } from "@/stores/automation-policies";
import { useHasHydrated } from "@/stores/use-has-hydrated";
import { AutomationPolicyEditor } from "@/components/organisms/automation/automation-policy-editor";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * PoliciesView — the policy grid + editor, merging the seeded policies with the
 * standing rules the user created this session via an "always"-scoped fix
 * (usePolicies store), so a just-created policy actually appears here.
 */
export function PoliciesView() {
  const hydrated = useHasHydrated(usePolicies);
  const storePolicies = usePolicies((s) => s.policies);
  const policies = React.useMemo(
    () => [...(hydrated ? storePolicies : []), ...getPolicies()],
    [storePolicies, hydrated],
  );
  const first = policies[0];

  return (
    <>
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
    </>
  );
}
