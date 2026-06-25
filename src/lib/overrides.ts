/**
 * Runtime heal overlays — PURE helpers (no zustand, no React, no "use client").
 *
 * A fix applied this session writes overrides into the activity store; these
 * functions overlay those overrides onto the frozen seed data on READ, so every
 * surface (lists AND aggregate counts) reflects the heal. Kept in a dependency-
 * free module so the mock query layer (getFleetStats) can be overlay-aware
 * WITHOUT importing the client store — avoiding an SSR/layering hazard. The
 * activity store re-exports these for the many call sites that import from it.
 */
import type { ProtectedAsset, Alert, Issue, AssetStatus } from "@/types";

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
 * Alerts page, the asset-detail Alerts tab + count, nav badges) — not just the
 * asset's status badge. Pure; hydration-gate like {@link applyOverrides}.
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
 * Overlay session heals onto the seeded ISSUES list (which is frozen). An issue
 * is PROJECTED onto the assets that are still impacted: healed assets are removed
 * from impactedAssetIds, and the issue is dropped only once that set is empty.
 *
 * Filtering whole-issue (drop iff EVERY asset healed) made a partially-healed
 * issue keep listing already-fixed assets and overcount everywhere it aggregated
 * (#8) — e.g. the "top problem" card and category charts. Projecting keeps the
 * issue visible while its tallies shrink to what's actually still broken.
 * occurrenceCount is scaled with the remaining share (floored at one per
 * still-impacted asset) so "{n} occurrences · {m} assets" stays self-consistent.
 * Pure; hydration-gate like {@link applyOverrides}.
 */
export function applyIssueResolution(
  issues: Issue[],
  overrides: Record<string, AssetOverride>,
): Issue[] {
  return issues.flatMap((i) => {
    const total = i.impactedAssetIds.length;
    if (total === 0) return [i];
    const remaining = i.impactedAssetIds.filter((id) => !overrides[id]);
    if (remaining.length === total) return [i]; // nothing healed — unchanged
    if (remaining.length === 0) return []; // fully healed — drop
    // Partially healed — project onto the still-impacted assets.
    const occurrenceCount = Math.max(
      remaining.length,
      Math.round((i.occurrenceCount * remaining.length) / total),
    );
    return [{ ...i, impactedAssetIds: remaining, occurrenceCount }];
  });
}
