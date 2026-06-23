"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface SearchFieldProps {
  /** Controlled value. */
  value: string;
  /** Change handler (receives the raw string). */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional keyboard hint, e.g. "⌘K" — rendered as a keycap. */
  shortcut?: string;
  /** Accessible name for the field (defaults to the placeholder or "Search"). */
  "aria-label"?: string;
  className?: string;
}

/**
 * SearchField — an input with a leading search icon and an optional keycap hint.
 *
 * Controlled: the parent owns `value`. The leading icon is decorative
 * (`aria-hidden`); the field's accessible name comes from `aria-label` /
 * placeholder. The shortcut hint is a styled `<kbd>`.
 */
export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  shortcut,
  className,
  ...props
}: SearchFieldProps) {
  const label = props["aria-label"] ?? placeholder ?? "Search";

  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        role="searchbox"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn("pl-8", shortcut && "pr-12")}
      />
      {shortcut && (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground"
        >
          {shortcut}
        </kbd>
      )}
    </div>
  );
}
