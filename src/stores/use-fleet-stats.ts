"use client";
/**
 * useFleetStats — overlay-aware fleet KPIs (#4).
 *
 * getFleetStats is a pure module fn that reads the frozen seed; on its own the
 * KPI tiles / charts / nav counts stay stale after a fix heals an asset, while
 * the LISTS (overlaid in Wave 2/4) already update — a visible contradiction. This
 * hook feeds the activity store's overrides into getFleetStats once hydrated, so
 * counts and lists move in lockstep. Hydration-gated to avoid an SSR/CSR mismatch.
 */
import * as React from "react";
import { getFleetStats, type FleetStats } from "@/mock/query";
import { useActivity } from "./activity";
import { useHasHydrated } from "./use-has-hydrated";
import type { ClientId } from "@/types";

export function useFleetStats(clientId?: ClientId): FleetStats {
  const hydrated = useHasHydrated(useActivity);
  const assetOverrides = useActivity((s) => s.assetOverrides);
  const alertOverrides = useActivity((s) => s.alertOverrides);
  return React.useMemo(
    () =>
      getFleetStats(
        clientId,
        hydrated ? { assetOverrides, alertOverrides } : undefined,
      ),
    [clientId, hydrated, assetOverrides, alertOverrides],
  );
}
