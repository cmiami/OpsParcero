/**
 * fix-state-meta — presentation metadata for the FixSession state machine.
 *
 * Maps each FixState to a label, lucide icon, and token-bound utility classes
 * (never raw colors — M1). Status is never color-only (M5): consumers render a
 * dot + icon + text. Neutral/blue register only — this is reused by both the
 * Guided (blue) and AI (purple) surfaces, so it asserts no purple of its own.
 *
 * Pure data — no hooks, no "use client".
 */
import {
  Search,
  ListChecks,
  PauseCircle,
  Play,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  LifeBuoy,
  OctagonX,
  type LucideIcon,
} from "lucide-react";
import type { FixState } from "@/lib/fix-client";

export interface FixStateMeta {
  label: string;
  icon: LucideIcon;
  /** Solid dot color utility, e.g. "bg-primary". */
  dotClass: string;
  /** Soft tinted background utility. */
  tintClass: string;
  /** Text color utility. */
  textClass: string;
  /** Border color utility. */
  borderClass: string;
  /** True for non-terminal "in flight" states (the badge animates its icon). */
  active?: boolean;
}

export const FIX_STATE_META: Record<FixState, FixStateMeta> = {
  triaging: {
    label: "Triaging",
    icon: Search,
    dotClass: "bg-primary",
    tintClass: "bg-primary-tint",
    textClass: "text-primary-accent",
    borderClass: "border-primary",
    active: true,
  },
  planning: {
    label: "Planning",
    icon: ListChecks,
    dotClass: "bg-primary",
    tintClass: "bg-primary-tint",
    textClass: "text-primary-accent",
    borderClass: "border-primary",
    active: true,
  },
  "awaiting-approval": {
    label: "Awaiting approval",
    icon: PauseCircle,
    dotClass: "bg-warning",
    tintClass: "bg-warning-tint",
    textClass: "text-warning",
    borderClass: "border-warning",
    active: true,
  },
  executing: {
    label: "Executing",
    icon: Play,
    dotClass: "bg-primary",
    tintClass: "bg-primary-tint",
    textClass: "text-primary-accent",
    borderClass: "border-primary",
    active: true,
  },
  verifying: {
    label: "Verifying",
    icon: ShieldCheck,
    dotClass: "bg-primary",
    tintClass: "bg-primary-tint",
    textClass: "text-primary-accent",
    borderClass: "border-primary",
    active: true,
  },
  succeeded: {
    label: "Resolved",
    icon: CheckCircle2,
    dotClass: "bg-success",
    tintClass: "bg-success-tint",
    textClass: "text-success",
    borderClass: "border-success",
  },
  partial: {
    label: "Partially resolved",
    icon: AlertTriangle,
    dotClass: "bg-warning",
    tintClass: "bg-warning-tint",
    textClass: "text-warning",
    borderClass: "border-warning",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    dotClass: "bg-critical",
    tintClass: "bg-critical-tint",
    textClass: "text-critical",
    borderClass: "border-critical",
  },
  escalated: {
    label: "Escalated to a human",
    icon: LifeBuoy,
    dotClass: "bg-warning",
    tintClass: "bg-warning-tint",
    textClass: "text-warning",
    borderClass: "border-warning",
  },
  halted: {
    label: "Halted",
    icon: OctagonX,
    dotClass: "bg-muted-foreground",
    tintClass: "bg-muted",
    textClass: "text-muted-foreground",
    borderClass: "border-border",
  },
};
