/**
 * automation-policies store — standing "always" auto-remediation rules
 * (docs/11 §3c, docs/06 §12).
 *
 * Pure client state. An "always"-scoped chain at dispatch writes a rule here
 * (orchestrated in the organisms layer); this store just holds the rule list.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AutomationPolicy, AutomationPolicyId } from "@/types";

export interface PoliciesState {
  policies: AutomationPolicy[];
  addPolicy: (policy: AutomationPolicy) => void;
  togglePolicy: (id: AutomationPolicyId, enabled?: boolean) => void;
  removePolicy: (id: AutomationPolicyId) => void;
}

export const usePolicies = create<PoliciesState>()(
  persist(
    (set) => ({
      policies: [],

      addPolicy: (policy) =>
        set((s) => ({ policies: [...s.policies, policy] })),

      togglePolicy: (id, enabled) =>
        set((s) => ({
          policies: s.policies.map((p) =>
            p.id === id
              ? { ...p, enabled: enabled ?? !p.enabled }
              : p,
          ),
        })),

      removePolicy: (id) =>
        set((s) => ({ policies: s.policies.filter((p) => p.id !== id) })),
    }),
    {
      name: "dcc-auto-rules",
      version: 1,
      partialize: (s) => ({ policies: s.policies }),
    },
  ),
);
