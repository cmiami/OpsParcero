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
  Alert,
  AlertId,
  AssetId,
  AssetStatus,
  Issue,
  ProtectedAsset,
} from "@/types";

/** A runtime override of a seeded asset's health after a fix heals it. */
export interface AssetOverride {
  status: AssetStatus;
  resolvedAt: string;
}

/** A runtime override of a seeded alert's state after a fix resolves it. */
export interface AlertOverride {
  state: "resolved";
  resolvedAt: string;
}

/**
 * Overlay runtime heal overrides onto a seeded asset list, so EVERY surface that
 * shows asset health (fleet table, product lens, KPI tallies) reflects a fix the
 * user just applied — not only the asset-detail page. Pure; call under a
 * useHasHydrated(useActivity) gate to avoid an SSR/CSR status mismatch.
 */
export function applyOverrides(
  assets: ProtectedAsset[],
  overrides: Record<string, AssetOverride>,
): ProtectedAsset[] {
  return assets.map((a) =>
    overrides[a.id] ? { ...a, status: overrides[a.id].status } : a,
  );
}

/**
 * Overlay runtime alert-resolution onto a seeded alert list, so a fix that heals
 * an asset also closes that asset's open alerts everywhere they are listed (the
 * Alerts page, the asset-detail Alerts tab + count) — not just the asset's
 * status badge. Pure; hydration-gate like {@link applyOverrides}.
 */
export function applyAlertOverrides(
  alerts: Alert[],
  overrides: Record<string, AlertOverride>,
): Alert[] {
  return alerts.map((a) =>
    overrides[a.id] ? { ...a, state: overrides[a.id].state } : a,
  );
}

/**
 * Drop issues whose every impacted asset has been healed this session — so a
 * resolved issue stops showing in the Resolution Center after its fix lands
 * (the seeded ISSUES list is frozen; this overlays the heal on read). Pure;
 * hydration-gate like {@link applyOverrides}.
 */
export function applyIssueResolution(
  issues: Issue[],
  overrides: Record<string, AssetOverride>,
): Issue[] {
  return issues.filter(
    (i) =>
      i.impactedAssetIds.length === 0 ||
      !i.impactedAssetIds.every((id) => overrides[id]),
  );
}

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
          alertOverrides:
            p?.alertOverrides && typeof p.alertOverrides === "object"
              ? p.alertOverrides
              : {},
        };
      },
    },
  ),
);
