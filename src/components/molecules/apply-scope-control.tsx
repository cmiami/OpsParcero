"use client";

import * as React from "react";
import { Zap, Layers, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { ActionScope } from "@/types";

export interface ApplyScopeControlProps {
  /** Selected scope on the once → all → always spine. */
  value: ActionScope;
  /** Fired when the technician changes scope. */
  onChange: (scope: ActionScope) => void;
  /** How many assets currently match the failure mode (drives the "all" option). */
  matchCount?: number;
  /** Disable the whole control (e.g. while a run is executing). */
  disabled?: boolean;
  className?: string;
}

interface ScopeOption {
  value: ActionScope;
  icon: typeof Zap;
  title: string;
  helper: (matchCount?: number) => string;
  /** Standing-policy scopes get a warning affordance (never color-only). */
  warning?: boolean;
}

const SCOPES: ScopeOption[] = [
  {
    value: "once",
    icon: Zap,
    title: "Fix this once",
    helper: () => "Applies to this asset only.",
  },
  {
    value: "all-matching",
    icon: Layers,
    title: "Apply to all matching",
    helper: (n) =>
      n != null
        ? `Runs now on all ${n} matching ${n === 1 ? "asset" : "assets"}.`
        : "Runs now on every asset matching this issue.",
  },
  {
    value: "always",
    icon: AlertTriangle,
    title: "Always fix this type",
    helper: () => "Creates a standing auto-remediation policy.",
    warning: true,
  },
];

/**
 * ApplyScopeControl — the load-bearing automation-scope picker (docs/07).
 *
 * Captures the once → all-matching → always spine for a remediation. The
 * `always` scope renders a subtle warning affordance (amber border + icon +
 * text) because it creates a standing policy, so the consequence reads without
 * relying on color alone (M5).
 */
export function ApplyScopeControl({
  value,
  onChange,
  matchCount,
  disabled,
  className,
}: ApplyScopeControlProps) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as ActionScope)}
      disabled={disabled}
      aria-label="Apply scope"
      className={cn("gap-2", className)}
    >
      {SCOPES.map((opt) => {
        const selected = value === opt.value;
        const Icon = opt.icon;
        const id = `apply-scope-${opt.value}`;
        const isAll = opt.value === "all-matching";
        return (
          <Label
            key={opt.value}
            htmlFor={id}
            data-state={selected ? "selected" : "idle"}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 transition-colors",
              "hover:bg-subtle",
              selected && "border-primary bg-primary-tint",
              selected && opt.warning && "border-warning bg-warning-tint",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <RadioGroupItem id={id} value={opt.value} className="mt-0.5" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-1.5 text-sm font-bold text-card-foreground">
                <Icon
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0",
                    opt.warning ? "text-warning" : "text-primary",
                  )}
                />
                {opt.title}
                {isAll && matchCount != null && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-2xs font-bold leading-none text-primary-foreground">
                    {matchCount}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {opt.helper(matchCount)}
              </span>
              {opt.warning && selected && (
                <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-warning">
                  <AlertTriangle aria-hidden className="size-3 shrink-0" />
                  Standing policy — runs automatically going forward.
                </span>
              )}
            </div>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
