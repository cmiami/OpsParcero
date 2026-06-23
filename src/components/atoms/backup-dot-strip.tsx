import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RunState, ISODateTime } from "@/types";

export interface BackupDotRun {
  state: RunState;
  /** A failure that is cosmetic only (e.g. >15-char hostname screenshot). */
  isCosmetic?: boolean;
  /** When the run occurred — drives the tooltip relative time. */
  at?: ISODateTime;
}

export interface BackupDotStripProps {
  /** Recent runs, newest last. Padded/truncated to `max`. */
  runs: BackupDotRun[];
  /** How many slots to show (default 10 — the "last 10 backups" strip). */
  max?: number;
  className?: string;
}

interface DotVisual {
  dotClass: string;
  label: string;
}

/**
 * Map a run to its dot color + a human label. Real failures read red; failures
 * flagged cosmetic desaturate to amber so an operator can tell a true data
 * failure from a benign screenshot/hostname quirk at a glance.
 */
function visualFor(run: BackupDotRun): DotVisual {
  switch (run.state) {
    case "success":
      return { dotClass: "bg-status-protected", label: "Success" };
    case "success-crash-consistent":
      return {
        dotClass: "bg-status-protected",
        label: "Success (crash-consistent)",
      };
    case "failed":
      return run.isCosmetic
        ? {
            dotClass: "bg-status-warning/50",
            label: "Failed (cosmetic — screenshot only)",
          }
        : { dotClass: "bg-status-failed", label: "Failed" };
    case "stuck":
      return { dotClass: "bg-status-offline", label: "Stuck" };
    case "skipped":
      return { dotClass: "bg-status-offline", label: "Skipped" };
    case "cancelled":
      return { dotClass: "bg-status-offline", label: "Cancelled" };
    case "running":
      return { dotClass: "bg-status-syncing", label: "Running" };
    case "queued":
      return { dotClass: "bg-status-syncing", label: "Queued" };
    default:
      return { dotClass: "bg-status-offline", label: "Unknown" };
  }
}

/**
 * BackupDotStrip — the "last N backups" sparkline of run outcomes.
 *
 * Pads on the left with empty slots and truncates to the most recent `max`
 * runs. Each real run is a tooltip-wrapped dot showing state + relative time;
 * the tooltip text is also the dot's accessible name so the history is
 * screen-reader navigable (M5), not color-only.
 */
export function BackupDotStrip({
  runs,
  max = 10,
  className,
}: BackupDotStripProps) {
  const recent = runs.slice(-max);
  const padCount = Math.max(0, max - recent.length);

  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      role="group"
      aria-label={`Last ${max} backups`}
    >
      {Array.from({ length: padCount }).map((_, i) => (
        <span
          key={`pad-${i}`}
          aria-hidden
          className="size-2 rounded-full border border-dashed border-border"
        />
      ))}
      {recent.map((run, i) => {
        const v = visualFor(run);
        const when = run.at ? relativeTime(run.at) : "no timestamp";
        const labelText = `${v.label} — ${when}`;
        return (
          <Tooltip key={`run-${i}`}>
            <TooltipTrigger asChild>
              <span
                role="img"
                aria-label={labelText}
                className={cn("size-2 shrink-0 rounded-full", v.dotClass)}
              />
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-bold">{v.label}</span>
              <span className="text-muted-foreground"> · {when}</span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
