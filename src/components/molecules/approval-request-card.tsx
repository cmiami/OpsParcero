"use client";

import * as React from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  TimerOff,
  Target,
  Check,
  X,
  Wrench,
  Crosshair,
  Layers,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ACTION_BY_ID } from "@/mock/reference";
import type { ActionScope, ApprovalPayload, ApprovalRequest } from "@/types";

export interface ApprovalRequestCardProps {
  /** The pending/decided approval request. */
  request: ApprovalRequest;
  /** Display name for the requester (defaults to a label derived from the id). */
  requesterName?: string;
  /** Whether the current viewer may approve/reject (hides actions if false). */
  canApprove?: boolean;
  /** Fired with the decision when the viewer acts. */
  onDecide?: (id: string, decision: "approved" | "rejected") => void;
  className?: string;
}

const STATE_META: Record<
  ApprovalRequest["state"],
  { label: string; icon: typeof Clock; dot: string; tint: string; text: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    dot: "bg-warning",
    tint: "bg-warning-tint",
    text: "text-warning",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    dot: "bg-success",
    tint: "bg-success-tint",
    text: "text-success",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    dot: "bg-critical",
    tint: "bg-critical-tint",
    text: "text-critical",
  },
  expired: {
    label: "Expired",
    icon: TimerOff,
    dot: "bg-muted-foreground",
    tint: "bg-muted",
    text: "text-muted-foreground",
  },
};

const REASON_LABEL: Record<ApprovalRequest["reason"], string> = {
  destructive: "Destructive action",
  irreversible: "Irreversible action",
  "over-threshold": "Blast radius over threshold",
  "policy-default": "Policy requires approval",
};

const SCOPE_META: Record<ActionScope, { label: string; icon: typeof Target }> = {
  once: { label: "This asset only", icon: Crosshair },
  "all-matching": { label: "All matching assets", icon: Layers },
  always: { label: "Always — standing rule", icon: Repeat },
};

/** What the held payload will actually run, so a viewer never approves blind. */
function dispatchSummary(payload: ApprovalPayload): {
  label: string;
  scope: ActionScope;
  armsPolicy: boolean;
} {
  if (payload.kind === "action") {
    return {
      label: ACTION_BY_ID[payload.actionId]?.label ?? payload.actionId,
      scope: payload.scope,
      armsPolicy: Boolean(payload.policy),
    };
  }
  const n = payload.steps.length;
  return {
    label: `${n}-step remediation chain`,
    scope: payload.scope,
    armsPolicy: Boolean(payload.policy),
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * ApprovalRequestCard — a human-in-the-loop gate for risky remediations.
 *
 * Shows who requested the action, why approval is required, WHAT will run (the
 * action/chain, its scope, and whether it arms a standing rule — so no one
 * approves blind), the blast-radius preview, and a state pill (dot + icon + text,
 * never color-only). When pending and the viewer `canApprove`, exposes Approve /
 * Reject. Decided/read-only states hide the action footer.
 */
export function ApprovalRequestCard({
  request,
  requesterName,
  canApprove,
  onDecide,
  className,
}: ApprovalRequestCardProps) {
  const name = requesterName ?? `User ${request.requestedBy}`;
  const meta = STATE_META[request.state];
  const StateIcon = meta.icon;
  const showActions = request.state === "pending" && canApprove;
  // Present on requests enqueued by the in-app fix surfaces; absent on seeded /
  // historical entries (which only flip state when decided).
  const dispatch = request.payload ? dispatchSummary(request.payload) : null;
  const ScopeIcon = dispatch ? SCOPE_META[dispatch.scope].icon : Target;

  return (
    <Card className={cn("gap-0 overflow-hidden", className)}>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="text-xs font-bold">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold text-card-foreground">
                {name}
              </span>
              <span className="text-xs text-muted-foreground">
                {REASON_LABEL[request.reason]}
              </span>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold",
              meta.tint,
              meta.text,
            )}
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
            <StateIcon aria-hidden className="size-3 shrink-0" />
            {meta.label}
          </span>
        </div>

        {dispatch && (
          <div className="flex items-start gap-2 rounded-md bg-subtle p-2.5">
            <Wrench aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-bold text-card-foreground">
                {dispatch.label}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-2xs font-bold text-muted-foreground">
                  <ScopeIcon aria-hidden className="size-3 shrink-0" />
                  {SCOPE_META[dispatch.scope].label}
                </span>
                {dispatch.armsPolicy && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning-tint px-1.5 py-0.5 text-2xs font-bold text-warning">
                    <Repeat aria-hidden className="size-3 shrink-0" />
                    Arms a standing rule
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md bg-subtle p-2.5">
          <Target aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-bold text-card-foreground">
              Blast radius — {request.blastRadius.assetCount}{" "}
              {request.blastRadius.assetCount === 1 ? "asset" : "assets"}
            </span>
            <span className="text-xs text-muted-foreground">
              {request.blastRadius.preview}
            </span>
          </div>
        </div>

        {request.note && (
          <p className="text-xs italic text-muted-foreground">“{request.note}”</p>
        )}
      </CardContent>

      {showActions && (
        <CardFooter className="gap-2 border-t border-border bg-surface py-3">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onDecide?.(request.id, "approved")}
          >
            <Check aria-hidden className="size-4" />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onDecide?.(request.id, "rejected")}
          >
            <X aria-hidden className="size-4" />
            Reject
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
