"use client";

import * as React from "react";
import {
  MoreHorizontal,
  Play,
  ShoppingCart,
  Workflow,
  Zap,
  Clock,
  TrendingUp,
  Library,
  PenLine,
  Copy,
  History,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ProductChip } from "@/components/atoms/product-chip";
import { relativeTime } from "@/lib/format";
import { ACTION_BY_ID } from "@/mock/reference";
import { productTypeToBucket } from "@/types";
import type { Playbook, ProductBucket } from "@/types";

export interface PlaybookCardProps {
  /** The playbook to render. */
  playbook: Playbook;
  /** Success-rate percent (0–100); omit when unknown. */
  successRate?: number;
  /** Trigger pattern label, e.g. "manual" or "auto-merge eligible". */
  trigger?: string;
  /** Source attribution. */
  source?: "curated" | "msp-authored";
  /** Load this playbook's steps into the action cart. */
  onLoadIntoCart?: (playbook: Playbook) => void;
  /** Run the playbook now (opens the execute flow). */
  onRunNow?: (playbook: Playbook) => void;
  onEdit?: (playbook: Playbook) => void;
  onDuplicate?: (playbook: Playbook) => void;
  onRollback?: (playbook: Playbook) => void;
  onDelete?: (playbook: Playbook) => void;
  className?: string;
}

/** Derive the distinct product buckets a playbook's steps touch. */
function playbookBuckets(playbook: Playbook): ProductBucket[] {
  const buckets = new Set<ProductBucket>();
  for (const step of playbook.steps) {
    const action = ACTION_BY_ID[step.actionId];
    action?.productTypes.forEach((p) => buckets.add(productTypeToBucket(p)));
  }
  return [...buckets];
}

/**
 * PlaybookCard — a saved, reusable remediation chain (docs/09 §9).
 *
 * Surfaces the playbook name, the product buckets it touches, its trigger
 * pattern, success rate, last-run recency, and source — plus three actions:
 * Load into cart, Run now, and an overflow menu (Edit → draft, Duplicate,
 * Rollback version, Delete). Source/version read as text + icon, never color
 * alone (M5). "use client" for the menu + handlers.
 */
export function PlaybookCard({
  playbook,
  successRate,
  trigger = "manual",
  source = "msp-authored",
  onLoadIntoCart,
  onRunNow,
  onEdit,
  onDuplicate,
  onRollback,
  onDelete,
  className,
}: PlaybookCardProps) {
  const buckets = playbookBuckets(playbook);
  const isCurated = source === "curated";

  return (
    <Card
      role="article"
      aria-label={playbook.name}
      className={cn("flex flex-col gap-0 overflow-hidden", className)}
    >
      <CardContent className="flex flex-1 flex-col gap-3 pt-6">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-tint">
                <Workflow aria-hidden className="size-4 text-primary" />
              </span>
              <div className="flex min-w-0 flex-col">
                <h3 className="truncate text-sm font-bold text-card-foreground">
                  {playbook.name}
                </h3>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {isCurated ? (
                    <Library aria-hidden className="size-3 shrink-0" />
                  ) : (
                    <PenLine aria-hidden className="size-3 shrink-0" />
                  )}
                  {isCurated ? "Curated template" : "MSP-authored"}
                </span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 touch-target"
                  aria-label="Playbook actions"
                >
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.(playbook)}>
                  <PenLine aria-hidden className="size-4" />
                  {isCurated ? "Duplicate to edit" : "Edit (creates draft)"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate?.(playbook)}>
                  <Copy aria-hidden className="size-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRollback?.(playbook)}>
                  <History aria-hidden className="size-4" />
                  Rollback version
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isCurated}
                  onClick={() => onDelete?.(playbook)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 aria-hidden className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {playbook.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {playbook.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {buckets.map((b) => (
              <ProductChip key={b} bucket={b} size="sm" />
            ))}
          </div>

          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <Zap aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <dt className="sr-only">Trigger</dt>
              <dd className="text-muted-foreground">{trigger}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Workflow aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <dt className="sr-only">Steps</dt>
              <dd className="text-muted-foreground tabular-nums">
                {playbook.steps.length} step{playbook.steps.length === 1 ? "" : "s"}
              </dd>
            </div>
            {successRate != null && (
              <div className="flex items-center gap-1.5">
                <TrendingUp aria-hidden className="size-3.5 shrink-0 text-success" />
                <dt className="sr-only">Success rate</dt>
                <dd className="font-bold text-success tabular-nums">
                  {successRate}%
                </dd>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <dt className="sr-only">Last run</dt>
              <dd className="text-muted-foreground">
                {playbook.lastRunAt ? relativeTime(playbook.lastRunAt) : "never run"}
              </dd>
            </div>
          </dl>
        </CardContent>

        <CardFooter className="gap-2 border-t border-border bg-surface py-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onLoadIntoCart?.(playbook)}
          >
            <ShoppingCart aria-hidden className="size-4" />
            Load into cart
          </Button>
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onRunNow?.(playbook)}
          >
            <Play aria-hidden className="size-4" />
            Run now
          </Button>
        </CardFooter>
    </Card>
  );
}
