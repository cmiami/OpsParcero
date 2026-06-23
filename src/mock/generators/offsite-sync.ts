/**
 * @/mock/generators/offsite-sync — step 11 of the generation DAG.
 *
 * One OffsiteSync per BCDR appliance (plus a few endpoint-level syncs). Most are
 * `current`; a believable minority fall `behind` or are `paused`, seeding the
 * RoundTrip / "convert pause to throttle" remediation paths and the sync-backlog
 * incident (docs/06 §9.4). `daysBehind > 10` is the RoundTrip-suggested signal.
 *
 * Deterministic — `sync` PRNG stream.
 */

import type {
  OffsiteSync,
  Appliance,
  ProtectedAsset,
} from "@/types";
import { rng, weighted, pick, int, isoAgo, bytes, type Rng } from "../prng";
import { NOW_MS } from "../seed";

type SyncState = OffsiteSync["state"];

function backlogFor(r: Rng, state: SyncState): { backlogBytes: number; daysBehind: number } {
  switch (state) {
    case "current":
      return { backlogBytes: 0, daysBehind: 0 };
    case "behind":
      return { backlogBytes: bytes(int(r, 40, 1200) / 10), daysBehind: int(r, 2, 18) };
    case "paused":
      return { backlogBytes: bytes(int(r, 80, 800) / 10), daysBehind: int(r, 1, 9) };
    case "seeding":
      return { backlogBytes: bytes(int(r, 200, 4000) / 10), daysBehind: int(r, 0, 4) };
    case "roundtrip-pending":
      return { backlogBytes: bytes(int(r, 1000, 8000) / 10), daysBehind: int(r, 11, 25) };
    default:
      return { backlogBytes: 0, daysBehind: 0 };
  }
}

/** Build the offsite-sync records for appliances + a few endpoint clients. */
export function generateOffsiteSyncs(
  appliances: Appliance[],
  assets: ProtectedAsset[],
): OffsiteSync[] {
  const r = rng("sync");
  const syncs: OffsiteSync[] = [];

  // Per-appliance sync (the common case).
  for (const app of appliances) {
    const state: SyncState = weighted(r, {
      current: 70,
      behind: 14,
      paused: 8,
      seeding: 5,
      "roundtrip-pending": 3,
    });
    const { backlogBytes, daysBehind } = backlogFor(r, state);
    syncs.push({
      id: `OSS-${app.id.slice(4)}`,
      applianceId: app.id,
      state,
      backlogBytes,
      oldestUnsyncedPointAt:
        daysBehind > 0 ? isoAgo(r, daysBehind * 60 * 24, daysBehind * 60 * 24 + 240) : undefined,
      transmitLimitMbps: state === "paused" ? 0 : pick(r, [25, 50, 100]),
      etaToCurrent:
        state === "behind" || state === "seeding"
          ? new Date(NOW_MS + int(r, 6, 72) * 60 * 60 * 1000).toISOString()
          : undefined,
    });
  }

  // A handful of endpoint-level syncs (direct-to-cloud) for variety.
  const endpoints = assets.filter((a) => a.kind === "endpoint");
  const sampled = endpoints.filter((_, i) => i % 9 === 0).slice(0, 14);
  for (const ep of sampled) {
    const state: SyncState = weighted(r, { current: 60, behind: 22, seeding: 12, paused: 6 });
    const { backlogBytes, daysBehind } = backlogFor(r, state);
    syncs.push({
      id: `OSS-EP-${ep.id.slice(-4)}`,
      assetId: ep.id,
      state,
      backlogBytes,
      oldestUnsyncedPointAt:
        daysBehind > 0 ? isoAgo(r, daysBehind * 60 * 24, daysBehind * 60 * 24 + 240) : undefined,
      transmitLimitMbps: state === "paused" ? 0 : 25,
    });
  }

  return syncs;
}
