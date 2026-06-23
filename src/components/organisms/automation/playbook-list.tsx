"use client";

import * as React from "react";
import { Library, PenLine, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlaybookCard } from "./playbook-card";
import { getPlaybooks } from "@/mock/query";
import type { Playbook } from "@/types";

export interface PlaybookListProps {
  /** Playbooks to render; defaults to the seeded library. */
  playbooks?: Playbook[];
  /** Split into "My playbooks" vs "Curated templates" sections. */
  grouped?: boolean;
  onLoadIntoCart?: (playbook: Playbook) => void;
  onRunNow?: (playbook: Playbook) => void;
  className?: string;
}

/** Stable, deterministic per-playbook meta derived from its id length (no RNG). */
function metaFor(pb: Playbook, index: number) {
  const isCurated = index % 3 === 0;
  return {
    source: (isCurated ? "curated" : "msp-authored") as "curated" | "msp-authored",
    successRate: 80 + ((pb.steps.length * 7 + pb.name.length) % 20),
    trigger: pb.forFailureModeIds?.length ? "failure-mode triggered" : "manual",
  };
}

function Grid({
  items,
  onLoadIntoCart,
  onRunNow,
}: {
  items: Playbook[];
  onLoadIntoCart?: (p: Playbook) => void;
  onRunNow?: (p: Playbook) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((pb, i) => {
        const m = metaFor(pb, i);
        return (
          <PlaybookCard
            key={pb.id}
            playbook={pb}
            source={m.source}
            successRate={m.successRate}
            trigger={m.trigger}
            onLoadIntoCart={onLoadIntoCart}
            onRunNow={onRunNow}
          />
        );
      })}
    </div>
  );
}

/**
 * PlaybookList — a responsive grid of PlaybookCards (docs/09 §9).
 *
 * Defaults to the seeded playbook library. When `grouped`, splits into "My
 * playbooks" (MSP-authored) and "Curated templates" (read-only), each under a
 * labeled heading with an icon. Renders a first-class empty state. "use client".
 */
export function PlaybookList({
  playbooks: playbooksProp,
  grouped,
  onLoadIntoCart,
  onRunNow,
  className,
}: PlaybookListProps) {
  const playbooks = playbooksProp ?? getPlaybooks();

  if (playbooks.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center",
          className,
        )}
      >
        <FolderOpen aria-hidden className="size-8 text-faint-foreground" />
        <p className="text-sm font-bold text-card-foreground">No playbooks yet</p>
        <p className="text-xs text-muted-foreground">
          Save your first from the action cart, or duplicate a curated template.
        </p>
      </div>
    );
  }

  if (grouped) {
    const mine = playbooks.filter((_, i) => metaFor(playbooks[i], i).source !== "curated");
    const curated = playbooks.filter((_, i) => metaFor(playbooks[i], i).source === "curated");
    return (
      <div className={cn("flex flex-col gap-6", className)}>
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-base font-bold text-card-foreground">
            <PenLine aria-hidden className="size-4 shrink-0 text-primary" />
            My playbooks
          </h2>
          {mine.length ? (
            <Grid items={mine} onLoadIntoCart={onLoadIntoCart} onRunNow={onRunNow} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Save your first from the action cart.
            </p>
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-base font-bold text-card-foreground">
            <Library aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            Curated templates
          </h2>
          <Grid items={curated} onLoadIntoCart={onLoadIntoCart} onRunNow={onRunNow} />
        </section>
      </div>
    );
  }

  return (
    <div className={className}>
      <Grid items={playbooks} onLoadIntoCart={onLoadIntoCart} onRunNow={onRunNow} />
    </div>
  );
}
