/**
 * approvals store — pending/decided approval requests (docs/11 §3c, docs/06 §12).
 *
 * Pure client state. Approval-gated steps land here (instead of dispatching)
 * from the organisms layer; this store just records the decision.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ApprovalRequest, ApprovalRequestId } from "@/types";

export interface ApprovalsState {
  requests: ApprovalRequest[];
  /**
   * Enqueue a pending request raised by an approval-gated dispatch (e.g. the
   * action cart), so the Approval queue surfaces it instead of the dispatch being
   * a dead end. Runtime-only (event handler), never module scope or render.
   */
  enqueue: (request: ApprovalRequest) => void;
  /**
   * Decide a request. Stamps `decidedAt` at decision time — this runs only inside
   * an event-driven action handler (runtime), never at module scope or render,
   * so it is determinism-safe (BUILD-CONTRACT HARD RULE 4).
   */
  decide: (
    id: ApprovalRequestId,
    decision: "approved" | "rejected",
    note?: string,
  ) => void;
}

export const useApprovals = create<ApprovalsState>()(
  persist(
    (set) => ({
      requests: [],

      enqueue: (request) =>
        set((s) =>
          s.requests.some((r) => r.id === request.id)
            ? s
            : { requests: [request, ...s.requests] },
        ),

      decide: (id, decision, note) =>
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? {
                  ...r,
                  state: decision,
                  note,
                  decidedAt: new Date().toISOString(),
                }
              : r,
          ),
        })),
    }),
    {
      name: "dcc-approvals",
      version: 1,
      partialize: (s) => ({ requests: s.requests }),
    },
  ),
);
