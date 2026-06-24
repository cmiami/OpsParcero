import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageShellProps {
  /** Page title (rendered as the h1). */
  title: React.ReactNode;
  /** Optional one-line description under the title. */
  description?: React.ReactNode;
  /** Optional right-aligned header slot (buttons, filters, a tenant chip…). */
  actions?: React.ReactNode;
  /** Scroll the content region (long, free-flowing pages). Tables manage their
   *  own scroll, so leave this off for them. */
  scroll?: boolean;
  /** Extra classes on the content region (e.g. `space-y-6`). */
  contentClassName?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * PageShell — the console page TEMPLATE.
 *
 * Every `(console)` route is the same shape: a hairline-bordered header (display
 * title + muted description + optional actions) above a `min-h-0 flex-1` content
 * region inside the shell's scroll context. Pages compose this template with
 * organisms + mock data instead of hand-assembling the markup, so the page
 * frame stays single-sourced (atomic design: Templates → Pages). All values are
 * tokens; the title uses the display font (M4).
 */
export function PageShell({
  title,
  description,
  actions,
  scroll = false,
  contentClassName,
  className,
  children,
}: PageShellProps) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-xl font-bold tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </header>
      <div
        className={cn(
          "min-h-0 flex-1 p-6",
          scroll && "overflow-auto",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
