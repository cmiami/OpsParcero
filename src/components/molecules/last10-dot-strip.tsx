import { cn } from "@/lib/utils";
import { BackupDotStrip, type BackupDotRun } from "@/components/atoms/backup-dot-strip";
import type { BackupRun, RunState } from "@/types";

export interface Last10DotStripProps {
  /** Recent backup runs, newest last. */
  runs: BackupRun[];
  /** How many slots to render (default 10). */
  max?: number;
  className?: string;
}

const SUCCESS_STATES: ReadonlySet<RunState> = new Set([
  "success",
  "success-crash-consistent",
]);

/** A cosmetic-only failure (benign screenshot/hostname quirk) flagged via failureModeId. */
function isCosmetic(run: BackupRun): boolean {
  return run.state === "failed" && run.failureModeId === "fm-cosmetic-screenshot";
}

function toDotRun(run: BackupRun): BackupDotRun {
  return {
    state: run.state,
    at: run.finishedAt ?? run.startedAt,
    isCosmetic: isCosmetic(run),
  };
}

/**
 * Last10DotStrip — the table-cell "last N backups" sparkline.
 *
 * Thin wrapper over the BackupDotStrip atom that (1) adapts BackupRun records to
 * the atom's dot shape and (2) renders a visually-hidden summary
 * ("7 of 10 backups succeeded") so the dot row is never the only signal (M5).
 */
export function Last10DotStrip({ runs, max = 10, className }: Last10DotStripProps) {
  const recent = runs.slice(-max);
  const dotRuns = recent.map(toDotRun);
  const total = recent.length;
  const succeeded = recent.filter((r) => SUCCESS_STATES.has(r.state)).length;

  const summary =
    total === 0
      ? "No backups recorded yet."
      : `${succeeded} of ${total} backup${total === 1 ? "" : "s"} succeeded.`;

  return (
    <div className={cn("inline-flex items-center", className)}>
      <BackupDotStrip runs={dotRuns} max={max} />
      <span className="sr-only">{summary}</span>
    </div>
  );
}
