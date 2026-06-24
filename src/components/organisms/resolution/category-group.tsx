"use client";

import * as React from "react";
import {
  ChevronDown,
  HardDriveDownload,
  Camera,
  KeyRound,
  WifiOff,
  Database,
  Gauge,
  Link2,
  Cloud,
  CloudOff,
  RotateCcw,
  FileWarning,
  Network,
  Bug,
  Receipt,
  FileBarChart,
  OctagonAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import type { FailureCategory } from "@/types";
import type { IssueCategoryGroup } from "@/mock/issues";
import { IssueRow } from "./issue-row";

export interface CategoryGroupProps {
  /** The category bucket of issues. */
  group: IssueCategoryGroup;
  /** Whether the group starts expanded. Defaults to open when it has criticals. */
  defaultOpen?: boolean;
  className?: string;
}

/** A representative lucide glyph per failure category (domain iconography, §10). */
const CATEGORY_ICON: Record<FailureCategory, LucideIcon> = {
  "Storage/ZFS": Database,
  "Backup Chain": Link2,
  "Agent Communication": WifiOff,
  "Screenshot/Local Verification": Camera,
  "Cloud Sync": Cloud,
  "Diff-Merge/Chain Rebuild": RotateCcw,
  "Local Virtualization": HardDriveDownload,
  BMR: FileWarning,
  "File Restore": FileBarChart,
  Networking: Network,
  "Ransomware Detection": Bug,
  "OAuth/Auth": KeyRound,
  "API Throttling": Gauge,
  "Licensing/Seats": Receipt,
  Reporting: FileBarChart,
};

function iconFor(category: FailureCategory): LucideIcon {
  return CATEGORY_ICON[category] ?? CloudOff;
}

/**
 * CategoryGroup — a collapsible card holding one FailureCategory's issues.
 *
 * The Resolution Center's primary grouping unit (docs/00 §3). Header: chevron,
 * category glyph, name, an issue-count badge, an end-to-end-fixable badge, and a
 * critical-count badge (icon + number, never color-only, M5). The body is the
 * IssueRow list. Defaults open when the category has critical issues so the worst
 * surfaces first.
 */
export function CategoryGroup({
  group,
  defaultOpen,
  className,
}: CategoryGroupProps) {
  const startOpen = defaultOpen ?? group.criticalCount > 0;
  const [open, setOpen] = React.useState(startOpen);
  const Icon = iconFor(group.category);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-testid="category-group"
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        )}
      >
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-faint-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-bold text-card-foreground">
          {group.category}
        </span>

        {/* Roll-up badges */}
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-border bg-subtle px-2 py-0.5 text-2xs font-bold tabular-nums text-muted-foreground">
            {group.totalIssues} {group.totalIssues === 1 ? "issue" : "issues"}
          </span>
          {group.endToEndFixable > 0 && (
            <span className="rounded-full bg-fix-endtoend-tint px-2 py-0.5 text-2xs font-bold tabular-nums text-fix-endtoend">
              {group.endToEndFixable} end-to-end
            </span>
          )}
          {group.criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-critical-tint px-2 py-0.5 text-2xs font-bold tabular-nums text-critical">
              <OctagonAlert aria-hidden className="size-3 shrink-0" />
              {group.criticalCount} critical
            </span>
          )}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border">
          {group.issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
