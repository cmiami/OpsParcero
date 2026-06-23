/**
 * activity store — the durable record of what the user actually DID this session
 * (docs/06 §11–12, docs/11 §3c).
 *
 * The seed fixtures in @/mock are frozen history. When a user applies a fix
 * (FixModal, RemediationPanel) or an agent run heals an asset (Guided / AI
 * console), the resulting ActionRun + AuditLogEntry are appended HERE, and the
 * affected assets' health is overridden HERE. The read surfaces — Run history,
 * Audit trail, the fleet asset-state — MERGE this store on top of the seed, so
 * activity the user just performed actually shows up (and the success copy that
 * says "Recorded in Run history and Audit" is now true).
 *
 * Delta model: this store holds ONLY runtime activity (never a copy of the seed),
 * so there is no double-seeding and the persisted payload stays small. All writes
 * happen inside event handlers (runtime) — never at module scope or in render —
 * so they are determinism-safe (BUILD-CONTRACT HARD RULE 4).
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ActionRun,
  AuditLogEntry,
  AssetId,
  AssetStatus,
} from "@/types";

/** A runtime override of a seeded asset's health after a fix heals it. */
export interface AssetOverride {
  status: AssetStatus;
  resolvedAt: string;
}

export interface ActivityState {
  /** User/agent-created runs, newest first. Merged ON TOP of getActionRuns(). */
  runs: ActionRun[];
  /** User/agent-created audit entries, newest first. Merged on top of getAuditLog(). */
  audit: AuditLogEntry[];
  /** assetId → new health, applied over the seeded asset's status. */
  assetOverrides: Record<string, AssetOverride>;

  /**
   * Append one apply's records (and optionally heal the targeted assets).
   * Runtime-only (called from an onClick / stream handler).
   */
  record: (input: {
    runs: ActionRun[];
    audit: AuditLogEntry[];
    heal?: { assetIds: AssetId[]; status: AssetStatus };
  }) => void;

  /** Clear all runtime activity (demo reset). */
  reset: () => void;
}

export const useActivity = create<ActivityState>()(
  persist(
    (set) => ({
      runs: [],
      audit: [],
      assetOverrides: {},

      record: ({ runs, audit, heal }) =>
        set((s) => ({
          // Cap the runtime log so a long demo can't grow localStorage unbounded.
          runs: [...runs, ...s.runs].slice(0, 200),
          audit: [...audit, ...s.audit].slice(0, 200),
          assetOverrides: heal
            ? {
                ...s.assetOverrides,
                ...Object.fromEntries(
                  heal.assetIds.map((id) => [
                    id,
                    {
                      status: heal.status,
                      resolvedAt: new Date().toISOString(),
                    },
                  ]),
                ),
              }
            : s.assetOverrides,
        })),

      reset: () => set({ runs: [], audit: [], assetOverrides: {} }),
    }),
    {
      name: "dcc-activity",
      version: 1,
      partialize: (s) => ({
        runs: s.runs,
        audit: s.audit,
        assetOverrides: s.assetOverrides,
      }),
      // Don't trust localStorage verbatim: drop malformed/stale entries so a
      // corrupt payload can't distort Run history / Audit / asset state.
      merge: (persisted, current) => {
        const p = persisted as Partial<ActivityState> | undefined;
        const hasId = (x: unknown): boolean =>
          !!x && typeof (x as { id?: unknown }).id === "string";
        return {
          ...current,
          runs: Array.isArray(p?.runs)
            ? (p!.runs.filter(hasId) as ActionRun[]).slice(0, 200)
            : [],
          audit: Array.isArray(p?.audit)
            ? (p!.audit.filter(hasId) as AuditLogEntry[]).slice(0, 200)
            : [],
          assetOverrides:
            p?.assetOverrides && typeof p.assetOverrides === "object"
              ? p.assetOverrides
              : {},
        };
      },
    },
  ),
);
