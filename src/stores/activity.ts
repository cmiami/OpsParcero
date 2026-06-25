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
import {
  actionRunEntrySchema,
  auditLogEntrySchema,
  assetOverrideSchema,
  alertOverrideSchema,
} from "@/lib/schemas";
import type {
  ActionRun,
  AuditLogEntry,
  AlertId,
  AssetId,
  AssetStatus,
} from "@/types";
// The overlay helpers + their types live in a PURE module (no zustand) so the
// mock query layer can be overlay-aware without importing this client store.
// Re-exported here so the many call sites that import from @/stores/activity are
// unchanged.
export {
  applyOverrides,
  applyAlertOverrides,
  applyIssueResolution,
  type AssetOverride,
  type AlertOverride,
} from "@/lib/overrides";
import type { AssetOverride, AlertOverride } from "@/lib/overrides";

export interface ActivityState {
  /** User/agent-created runs, newest first. Merged ON TOP of getActionRuns(). */
  runs: ActionRun[];
  /** User/agent-created audit entries, newest first. Merged on top of getAuditLog(). */
  audit: AuditLogEntry[];
  /** assetId → new health, applied over the seeded asset's status. */
  assetOverrides: Record<string, AssetOverride>;
  /** alertId → resolved, applied over the seeded alert's state. */
  alertOverrides: Record<string, AlertOverride>;

  /**
   * Append one apply's records (and optionally heal the targeted assets +
   * resolve their alerts). Runtime-only (called from an onClick / stream handler).
   */
  record: (input: {
    runs: ActionRun[];
    audit: AuditLogEntry[];
    heal?: { assetIds: AssetId[]; status: AssetStatus };
    /** Alert ids to mark resolved (typically the healed assets' open alerts). */
    resolveAlertIds?: AlertId[];
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
      alertOverrides: {},

      record: ({ runs, audit, heal, resolveAlertIds }) =>
        set((s) => {
          const now = new Date().toISOString();
          return {
            // Cap the runtime log so a long demo can't grow localStorage unbounded.
            runs: [...runs, ...s.runs].slice(0, 200),
            audit: [...audit, ...s.audit].slice(0, 200),
            assetOverrides: heal
              ? {
                  ...s.assetOverrides,
                  ...Object.fromEntries(
                    heal.assetIds.map((id) => [
                      id,
                      { status: heal.status, resolvedAt: now },
                    ]),
                  ),
                }
              : s.assetOverrides,
            alertOverrides: resolveAlertIds?.length
              ? {
                  ...s.alertOverrides,
                  ...Object.fromEntries(
                    resolveAlertIds.map((id) => [
                      id,
                      { state: "resolved" as const, resolvedAt: now },
                    ]),
                  ),
                }
              : s.alertOverrides,
          };
        }),

      reset: () =>
        set({ runs: [], audit: [], assetOverrides: {}, alertOverrides: {} }),
    }),
    {
      name: "dcc-activity",
      version: 1,
      partialize: (s) => ({
        runs: s.runs,
        audit: s.audit,
        assetOverrides: s.assetOverrides,
        alertOverrides: s.alertOverrides,
      }),
      // Don't trust localStorage verbatim: DEEP-validate each rehydrated entry
      // against its zod schema (P2-5/P3-6) and drop anything malformed, so a
      // corrupt/spoofed payload can't distort Run history / Audit / asset state.
      merge: (persisted, current) => {
        const p = persisted as Partial<ActivityState> | undefined;
        const keepArray = <T>(
          arr: unknown,
          schema: { safeParse: (v: unknown) => { success: boolean } },
        ): T[] =>
          Array.isArray(arr)
            ? (arr.filter((x) => schema.safeParse(x).success) as T[]).slice(
                0,
                200,
              )
            : [];
        const keepRecord = <T>(
          obj: unknown,
          schema: { safeParse: (v: unknown) => { success: boolean } },
        ): Record<string, T> => {
          if (!obj || typeof obj !== "object") return {};
          const out: Record<string, T> = {};
          for (const [k, v] of Object.entries(obj)) {
            if (schema.safeParse(v).success) out[k] = v as T;
          }
          return out;
        };
        return {
          ...current,
          runs: keepArray<ActionRun>(p?.runs, actionRunEntrySchema),
          audit: keepArray<AuditLogEntry>(p?.audit, auditLogEntrySchema),
          assetOverrides: keepRecord<AssetOverride>(
            p?.assetOverrides,
            assetOverrideSchema,
          ),
          alertOverrides: keepRecord<AlertOverride>(
            p?.alertOverrides,
            alertOverrideSchema,
          ),
        };
      },
    },
  ),
);
