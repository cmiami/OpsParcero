"use client";

import * as React from "react";
import { ShieldCheck, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApprovalRequestCard } from "@/components/molecules/approval-request-card";
import { useApprovals } from "@/stores/approvals";
import { getPendingApprovals, getUsers } from "@/mock/query";
import type { ApprovalRequest } from "@/types";

export interface ApprovalQueueProps {
  /** Requests to render; defaults to the store's pending queue, seeded if empty. */
  requests?: ApprovalRequest[];
  /** Whether the current viewer may approve/reject. */
  canApprove?: boolean;
  className?: string;
}

/**
 * ApprovalQueue — the human-in-the-loop review surface (docs/10 §4.5).
 *
 * Lists ApprovalRequestCards. When uncontrolled, it reads pending requests from
 * the `approvals` Zustand store (seeded from `getPendingApprovals()` on first
 * mount) and wires Approve / Reject through `decide`, so decisions persist and
 * the card flips state in place. Renders a first-class empty state. "use client".
 */
export function ApprovalQueue({
  requests: requestsProp,
  canApprove = true,
  className,
}: ApprovalQueueProps) {
  const storeRequests = useApprovals((s) => s.requests);
  const decide = useApprovals((s) => s.decide);

  const users = React.useMemo(() => getUsers(), []);
  const nameFor = React.useCallback(
    (id: string) => users.find((u) => u.id === id)?.name ?? `User ${id}`,
    [users],
  );

  const controlled = requestsProp != null;
  const requests = controlled ? requestsProp! : storeRequests;

  // Seed the store from the mock query on first mount when uncontrolled + empty.
  React.useEffect(() => {
    if (!controlled && storeRequests.length === 0) {
      useApprovals.setState({ requests: getPendingApprovals() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (requests.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center",
          className,
        )}
      >
        <ShieldCheck aria-hidden className="size-8 text-success" />
        <p className="text-sm font-bold text-card-foreground">No approvals waiting</p>
        <p className="text-xs text-muted-foreground">
          Risky remediations that need a human will queue up here.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Approval queue" className={cn("flex flex-col gap-3", className)}>
      <h3 className="flex items-center gap-1.5 text-base font-bold text-card-foreground">
        <Inbox aria-hidden className="size-4 shrink-0 text-primary" />
        Approval queue
        <span className="rounded-full bg-warning-tint px-1.5 py-0.5 text-[10px] font-bold text-warning tabular-nums">
          {requests.filter((r) => r.state === "pending").length} pending
        </span>
      </h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {requests.map((req) => (
          <ApprovalRequestCard
            key={req.id}
            request={req}
            requesterName={nameFor(req.requestedBy)}
            canApprove={canApprove}
            onDecide={
              controlled
                ? undefined
                : (id, decision) => decide(id, decision)
            }
          />
        ))}
      </div>
    </section>
  );
}
