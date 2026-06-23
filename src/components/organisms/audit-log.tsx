"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  User as UserIcon,
  Cog,
  Cpu,
  Play,
  Check,
  X,
  FilePlus2,
  Power,
  BellOff,
  ShieldAlert,
  Undo2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { AuditLogEntry, AuditVerb } from "@/types";
import { getAuditLog, getUser } from "@/mock/query";
import { MonoLabel } from "@/components/atoms/mono-label";
import { SearchField } from "@/components/molecules/search-field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { DataTable } from "./data-table/data-table";

export interface AuditLogProps {
  /** Entries to render. Defaults to the full seeded log, newest first. */
  entries?: AuditLogEntry[];
  density?: "default" | "compact";
  isLoading?: boolean;
  error?: string;
  className?: string;
}

const VERB_META: Record<
  AuditVerb,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "ran-action": { label: "Ran action", icon: Play },
  approved: { label: "Approved", icon: Check },
  rejected: { label: "Rejected", icon: X },
  "created-playbook": { label: "Created playbook", icon: FilePlus2 },
  "enabled-policy": { label: "Enabled policy", icon: Power },
  "suppressed-alert": { label: "Suppressed alert", icon: BellOff },
  overrode: { label: "Overrode", icon: ShieldAlert },
  "rolled-back": { label: "Rolled back", icon: Undo2 },
};

const ACTOR_KIND_META: Record<
  AuditLogEntry["actor"]["kind"],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  user: { label: "User", icon: UserIcon },
  policy: { label: "Policy", icon: Cog },
  system: { label: "System", icon: Cpu },
};

function actorName(entry: AuditLogEntry): string {
  if (entry.actor.kind === "user") {
    return getUser(entry.actor.refId)?.name ?? entry.actor.refId;
  }
  return ACTOR_KIND_META[entry.actor.kind].label;
}

interface OutcomeVisual {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  textClass: string;
  dotClass: string;
}

function outcomeVisual(
  outcome: AuditLogEntry["outcome"],
): OutcomeVisual | undefined {
  switch (outcome) {
    case "succeeded":
      return { label: "Succeeded", icon: CheckCircle2, textClass: "text-success", dotClass: "bg-success" };
    case "failed":
      return { label: "Failed", icon: XCircle, textClass: "text-critical", dotClass: "bg-critical" };
    case "partial":
      return { label: "Partial", icon: AlertTriangle, textClass: "text-warning", dotClass: "bg-warning" };
    default:
      return undefined;
  }
}

const COLUMNS: ColumnDef<AuditLogEntry>[] = [
  {
    id: "at",
    accessorKey: "at",
    header: "Time",
    meta: { label: "Time" },
    cell: ({ row }) => (
      <MonoLabel title={row.original.at}>{formatDateTime(row.original.at)}</MonoLabel>
    ),
  },
  {
    id: "actor",
    accessorFn: (e) => actorName(e),
    header: "Actor",
    meta: { label: "Actor" },
    cell: ({ row }) => {
      const m = ACTOR_KIND_META[row.original.actor.kind];
      const Icon = m.icon;
      return (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Icon aria-hidden className="size-3.5 shrink-0 text-faint-foreground" />
          <span className="truncate">{actorName(row.original)}</span>
        </span>
      );
    },
  },
  {
    id: "verb",
    accessorKey: "verb",
    header: "Action",
    meta: { label: "Action" },
    cell: ({ row }) => {
      const m = VERB_META[row.original.verb];
      const Icon = m.icon;
      return (
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          {m.label}
        </span>
      );
    },
  },
  {
    id: "subject",
    accessorFn: (e) => e.subjectRef.label ?? e.subjectRef.id,
    header: "Subject",
    meta: { label: "Subject" },
    cell: ({ row }) => (
      <MonoLabel
        title={row.original.subjectRef.id}
        className="max-w-xs"
      >
        {row.original.subjectRef.label ?? row.original.subjectRef.id}
      </MonoLabel>
    ),
  },
  {
    id: "outcome",
    accessorKey: "outcome",
    header: "Outcome",
    meta: { label: "Outcome" },
    cell: ({ row }) => {
      const v = outcomeVisual(row.original.outcome);
      if (!v) return <span className="text-xs text-faint-foreground">—</span>;
      const Icon = v.icon;
      return (
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold", v.textClass)}>
          <span aria-hidden className={cn("size-1.5 rounded-full", v.dotClass)} />
          <Icon aria-hidden className="size-3.5 shrink-0" />
          {v.label}
        </span>
      );
    },
  },
  {
    id: "detail",
    accessorKey: "detail",
    header: "Detail",
    enableSorting: false,
    meta: { label: "Detail" },
    cell: ({ row }) => (
      <span className="block max-w-md truncate text-sm text-muted-foreground" title={row.original.detail}>
        {row.original.detail}
      </span>
    ),
  },
];

/**
 * AuditLog — append-only, time-ordered audit trail (DataTable preset).
 *
 * Columns: time (mono) · actor (icon+name) · action verb (icon+label) · subject
 * (mono ref) · outcome (dot+icon+label, M5) · detail. A built-in actor Select +
 * free-text search filter the rows client-side; the underlying log is read-only
 * and newest-first. No drag/calendar deps — a preset Select drives the actor lens.
 */
export function AuditLog({
  entries,
  density = "default",
  isLoading,
  error,
  className,
}: AuditLogProps) {
  const source = React.useMemo(() => entries ?? getAuditLog(), [entries]);
  const [actor, setActor] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");

  const actorOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of source) {
      const id = e.actor.kind === "user" ? e.actor.refId : e.actor.kind;
      if (!seen.has(id)) seen.set(id, actorName(e));
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [source]);

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return source.filter((e) => {
      if (actor !== "all") {
        const id = e.actor.kind === "user" ? e.actor.refId : e.actor.kind;
        if (id !== actor) return false;
      }
      if (q) {
        const hay = `${actorName(e)} ${VERB_META[e.verb].label} ${e.subjectRef.label ?? e.subjectRef.id} ${e.detail}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [source, actor, search]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search audit log…"
          aria-label="Search audit log"
          className="w-full max-w-xs"
        />
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger className="w-48" aria-label="Filter by actor">
            <SelectValue placeholder="All actors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            {actorOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable<AuditLogEntry>
        columns={COLUMNS}
        data={rows}
        isLoading={isLoading}
        error={error}
        density={density}
        getRowId={(e: AuditLogEntry) => e.id}
        caption="Audit log — append-only, newest first"
        emptyTitle="No matching audit entries"
        emptyHint="Adjust the actor filter or clear the search to see more history."
      />
    </div>
  );
}
