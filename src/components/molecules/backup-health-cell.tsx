import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Last10DotStrip } from "./last10-dot-strip";
import type { AssetStatus, BackupRun, ISODateTime } from "@/types";

export interface BackupHealthCellProps {
  /** Current rolled-up health for the asset. */
  status: AssetStatus;
  /** When the last good (successful) backup completed, if ever. */
  lastGoodBackupAt?: ISODateTime;
  /** Recent runs feeding the "last 10" strip. */
  runs: BackupRun[];
  className?: string;
}

/**
 * BackupHealthCell — the composite health column for an asset table.
 *
 * Stacks the StatusBadge, a "last good backup" relative time, and the
 * Last10DotStrip so an operator reads current state, recency, and trend in one
 * cell. "Never run" is a first-class state (no last-good time, empty strip).
 */
export function BackupHealthCell({
  status,
  lastGoodBackupAt,
  runs,
  className,
}: BackupHealthCellProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2">
        <StatusBadge state={status} size="sm" />
        <span className="text-xs text-muted-foreground">
          {lastGoodBackupAt
            ? `Last good ${relativeTime(lastGoodBackupAt)}`
            : "Never run"}
        </span>
      </div>
      <Last10DotStrip runs={runs} />
    </div>
  );
}
