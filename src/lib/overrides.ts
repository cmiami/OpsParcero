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
 * Drop issues whose every impacted asset has been healed this session — so a
 * resolved issue stops showing (and stops counting) after its fix lands (the
 * seeded ISSUES list is frozen; this overlays the heal on read). Pure;
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
