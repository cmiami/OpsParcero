/**
 * action-cart store — the centerpiece "intent" plane (docs/11 §3c, docs/06 §12).
 *
 * Pure client state ONLY: it holds the ordered remediation chain a user is
 * assembling and the target asset set. It does NOT import fixtures (`@/mock/*`)
 * and does NOT dispatch/run anything — dispatch + runner orchestration lives in
 * the organisms layer later. "Save as playbook" / "Run playbook" read/write this
 * store from that layer.
 *
 * Scope spine uses the canonical {@link ActionScope} from `@/types`
 * ("once" | "all-matching" | "always").
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  keepValid,
  cartStepSchema,
  actionScopeSchema,
} from "@/lib/schemas";
import type {
  ActionScope,
  AssetId,
  RemediationActionId,
} from "@/types";
import { makeUid } from "./uid";

/** An action instanced into the cart/chain. An action may appear more than once. */
export interface CartStep {
  /** Instance id (runtime-generated). */
  uid: string;
  actionId: RemediationActionId;
  params: Record<string, unknown>;
  /** Per-step override of the cart default scope. */
  scope: ActionScope;
}

export interface ActionCartState {
  /** Selected asset ids — the scope target set the chain applies to. */
  targets: AssetId[];
  /** Ordered remediation chain. */
  steps: CartStep[];
  /** Default scope applied to newly added steps. */
  defaultScope: ActionScope;

  addAction: (actionId: RemediationActionId) => void;
  removeStep: (uid: string) => void;
  reorder: (from: number, to: number) => void;
  setStepScope: (uid: string, scope: ActionScope) => void;
  setStepParams: (uid: string, params: Record<string, unknown>) => void;
  setDefaultScope: (scope: ActionScope) => void;
  setTargets: (ids: AssetId[]) => void;
  addTarget: (id: AssetId) => void;
  clear: () => void;
}

const DEFAULT_SCOPE: ActionScope = "once";

export const useActionCart = create<ActionCartState>()(
  persist(
    (set) => ({
      targets: [],
      steps: [],
      defaultScope: DEFAULT_SCOPE,

      addAction: (actionId) =>
        set((s) => ({
          steps: [
            ...s.steps,
            {
              uid: makeUid("step"),
              actionId,
              params: {},
              scope: s.defaultScope,
            },
          ],
        })),

      removeStep: (uid) =>
        set((s) => ({ steps: s.steps.filter((step) => step.uid !== uid) })),

      reorder: (from, to) =>
        set((s) => {
          if (
            from === to ||
            from < 0 ||
            to < 0 ||
            from >= s.steps.length ||
            to >= s.steps.length
          ) {
            return s;
          }
          const next = s.steps.slice();
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return { steps: next };
        }),

      setStepScope: (uid, scope) =>
        set((s) => ({
          steps: s.steps.map((step) =>
            step.uid === uid ? { ...step, scope } : step,
          ),
        })),

      setStepParams: (uid, params) =>
        set((s) => ({
          steps: s.steps.map((step) =>
            step.uid === uid ? { ...step, params } : step,
          ),
        })),

      setDefaultScope: (scope) => set({ defaultScope: scope }),

      setTargets: (ids) => set({ targets: ids }),

      addTarget: (id) =>
        set((s) =>
          s.targets.includes(id) ? s : { targets: [...s.targets, id] },
        ),

      clear: () => set({ targets: [], steps: [], defaultScope: DEFAULT_SCOPE }),
    }),
    {
      name: "dcc-action-cart",
      version: 1,
      partialize: (s) => ({
        targets: s.targets,
        steps: s.steps,
        defaultScope: s.defaultScope,
      }),
      // Drop malformed cart state on rehydrate (#12): non-string targets, steps
      // that aren't valid CartSteps, and a bad defaultScope fall back to safe.
      merge: (persisted, current) => {
        const p = persisted as {
          targets?: unknown;
          steps?: unknown;
          defaultScope?: unknown;
        };
        const scope = actionScopeSchema.safeParse(p?.defaultScope);
        return {
          ...(current as ActionCartState),
          targets: Array.isArray(p?.targets)
            ? (p.targets.filter((t) => typeof t === "string") as AssetId[])
            : [],
          steps: keepValid<CartStep>(p?.steps, cartStepSchema),
          defaultScope: scope.success
            ? (p.defaultScope as ActionScope)
            : DEFAULT_SCOPE,
        };
      },
    },
  ),
);
