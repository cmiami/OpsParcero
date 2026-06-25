"use client";

import * as React from "react";
import { Zap, ChevronUp, ChevronDown, X, ShieldAlert, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ACTION_BY_ID } from "@/mock/reference";
import type { PlaybookStep } from "@/types";

export interface PlaybookStepCardProps {
  /** The chain step (action + params + run-if/halt rules). */
  step: PlaybookStep;
  /** Zero-based position; rendered as a 1-based order number. */
  index: number;
  /** Override the resolved action label (defaults to ACTION_BY_ID lookup). */
  actionLabel?: string;
  /** Remove this step from the chain. */
  onRemove?: () => void;
  /** Move this step earlier in the chain. */
  onMoveUp?: () => void;
  /** Move this step later in the chain. */
  onMoveDown?: () => void;
  /** Render a (visual-only) drag handle affordance. */
  dragHandle?: boolean;
  className?: string;
}

/** Compact, human-readable summary of a step's params. */
function summarizeParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params ?? {});
  if (entries.length === 0) return "Default parameters";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "boolean" ? (v ? "on" : "off") : String(v)}`)
    .join(" · ");
}

/**
 * PlaybookStepCard — one row in a chain/playbook builder.
 *
 * Shows the order number, action label, a Zap automation marker, and a param
 * summary, with up/down reorder buttons (no drag-and-drop dep) and remove.
 * `runIf: "prev-failed"` is surfaced as an error-gated step; `haltOnFailure`
 * is surfaced as an approval/halt gate — both with icon + text, never color
 * alone (M5). Icon-only controls carry aria-labels.
 */
export function PlaybookStepCard({
  step,
  index,
  actionLabel,
  onRemove,
  onMoveUp,
  onMoveDown,
  dragHandle,
  className,
}: PlaybookStepCardProps) {
  const label = actionLabel ?? ACTION_BY_ID[step.actionId]?.label ?? step.actionId;
  const isErrorStep = step.runIf === "prev-failed";
  const isGated = step.haltOnFailure;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border border-border bg-surface p-3",
        className,
      )}
    >
      {dragHandle && (
        <GripVertical
          aria-hidden
          className="size-4 shrink-0 cursor-grab text-faint-foreground"
        />
      )}

      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle font-mono text-xs font-bold text-muted-foreground">
        {index + 1}
      </span>

      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-tint">
        <Zap aria-hidden className="size-4 text-primary" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 truncate text-sm font-bold text-card-foreground">
          {label}
          {isErrorStep && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-tint px-1.5 py-0.5 text-2xs font-bold text-warning">
              <ShieldAlert aria-hidden className="size-3 shrink-0" />
              On failure
            </span>
          )}
          {isGated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-critical-tint px-1.5 py-0.5 text-2xs font-bold text-critical">
              <ShieldAlert aria-hidden className="size-3 shrink-0" />
              Halts on error
            </span>
          )}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {summarizeParams(step.params)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 touch-target"
          aria-label="Move step up"
          disabled={!onMoveUp}
          onClick={onMoveUp}
        >
          <ChevronUp aria-hidden className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 touch-target"
          aria-label="Move step down"
          disabled={!onMoveDown}
          onClick={onMoveDown}
        >
          <ChevronDown aria-hidden className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive touch-target"
          aria-label="Remove step"
          disabled={!onRemove}
          onClick={onRemove}
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  );
}
