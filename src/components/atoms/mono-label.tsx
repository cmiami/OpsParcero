"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MonoLabelProps {
  /** The verbatim value — host, asset id, error code, size, port. */
  children: React.ReactNode;
  /** Show a copy affordance (copies `copyValue` or the text content). */
  copyable?: boolean;
  /** Explicit string to copy; falls back to the rendered children. */
  copyValue?: string;
  /** Native title tooltip (e.g. the full untruncated value). */
  title?: string;
  className?: string;
}

/**
 * MonoLabel — monospace chip for machine values (ids, hosts, error codes,
 * ports, sizes) so error strings like `0x0000007B` stay legible and verbatim.
 *
 * When `copyable`, a small icon button copies the value to the clipboard and
 * flips to a check for brief feedback. The button carries an aria-label so the
 * icon-only control has an accessible name (M5).
 */
export function MonoLabel({
  children,
  copyable = false,
  copyValue,
  title,
  className,
}: MonoLabelProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleCopy = React.useCallback(() => {
    const text =
      copyValue ?? (typeof children === "string" ? children : String(children));
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, [children, copyValue]);

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-border bg-subtle px-1.5 py-0.5 font-mono text-xs text-foreground",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy"}
          className="-mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? (
            <Check aria-hidden className="size-3 text-success" />
          ) : (
            <Copy aria-hidden className="size-3" />
          )}
        </button>
      )}
    </span>
  );
}
