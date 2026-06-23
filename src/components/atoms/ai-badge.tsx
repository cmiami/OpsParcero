"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiBadgeProps {
  /** Label text; defaults to "AI". */
  children?: React.ReactNode;
  className?: string;
}

/**
 * AiBadge — the purple AI-assist marker (Sparkles + ai tint).
 *
 * Purple (`ai*` tokens) is reserved exclusively for AI surfaces (M4); this is
 * the only place it appears. Static, non-interactive — use {@link AiButton} for
 * an actionable AI affordance.
 */
export function AiBadge({ children = "AI", className }: AiBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-ai-tint px-2 py-0.5 text-xs font-bold text-ai",
        className,
      )}
    >
      <Sparkles aria-hidden className="size-3 shrink-0" />
      <span>{children}</span>
    </span>
  );
}

export interface AiButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Label; defaults to "Ask AI". */
  children?: React.ReactNode;
}

/**
 * AiButton — an actionable AI affordance (e.g. "Explain", "Ask AI").
 *
 * Same purple AI register as {@link AiBadge}, rendered as a real keyboard-
 * operable button. If no visible text is supplied, callers must pass an
 * `aria-label` for the icon-only control (M5).
 */
export function AiButton({
  children = "Ask AI",
  className,
  ...props
}: AiButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-ai-tint px-2.5 py-1 text-xs font-bold text-ai transition-colors hover:bg-ai hover:text-ai-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...props}
    >
      <Sparkles aria-hidden className="size-3.5 shrink-0" />
      {children}
    </button>
  );
}
