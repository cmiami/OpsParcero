/**
 * @/mock/generators/rollups — step 14 of the generation DAG (docs/06 §9.4).
 *
 * Post-injection recomputation so denormalized rollups match the mutated assets:
 *   - `Client.healthRollup`: per-status counts + worst REAL child state (cosmetic
 *     warnings and intentional pauses never escalate a client to failed).
 *   - StoragePool `topConsumers` + a pool-full cascade: pools driven over 92% force
 *     their hosted agents to show `skipped` runs ("not enough free space").
 *
 * Mutates clients, pools, and (for the cascade) a few assets in place.
 * Deterministic — `rollups` PRNG stream.
 */

import type {
  Client,
  ProtectedAsset,
  StoragePool,
  Appliance,
  StatusRollup,
  AssetStatus,
} from "@/types";
import { rng, int, type Rng } from "../prng";
import { NOW_MS } from "../seed";
import { compareStatus } from "@/lib/status";

/** Build a StatusRollup (counts + worst real state) from a set of statuses. */
function rollup(statuses: AssetStatus[], realStatuses: AssetStatus[]): StatusRollup {
  const counts: Record<AssetStatus, number> = {
    protected: 0,
    warning: 0,
    failed: 0,
    paused: 0,
    syncing: 0,
    offline: 0,
  };
  for (const s of statuses) counts[s] += 1;

  // Worst REAL child state (excludes cosmetic-only warnings + intentional pause).
  let worst: AssetStatus = "protected";
  for (const s of realStatuses) {
    if (compareStatus(s, worst) < 0) worst = s;
  }

  return {
    status: worst,
    protected: counts.protected,
    warning: counts.warning,
    failed: counts.failed,
    paused: counts.paused,
    syncing: counts.syncing,
    offline: counts.offline,
    total: statuses.length,
  };
}

/**
 * Recompute every client's health rollup. An asset counts toward the "real" worst
 * state unless it's intentionally paused or all its open alerts are cosmetic.
 */
export function recomputeClientRollups(
  clients: Client[],
  assets: ProtectedAsset[],
  cosmeticAssetIds: Set<string>,
): void {
  const byClient = new Map<string, ProtectedAsset[]>();
  for (const a of assets) {
    const arr = byClient.get(a.clientId);
    if (arr) arr.push(a);
    else byClient.set(a.clientId, [a]);
  }

  for (const client of clients) {
    const owned = byClient.get(client.id) ?? [];
    const statuses = owned.map((a) => a.status);
    const real = owned
      .filter((a) => a.protectionEnabled && !cosmeticAssetIds.has(a.id))
      .map((a) => a.status);
    client.healthRollup = rollup(statuses, real);
  }
}

/**
 * Pool-full cascade + top consumers. A deterministic minority of zfs-local pools
 * are pushed over 92% used; their hosted agents get a trailing `skipped` run.
 */
export function recomputeStoragePools(
  pools: StoragePool[],
  appliances: Appliance[],
  assets: ProtectedAsset[],
): void {
  const r: Rng = rng("rollups");
  const applianceByPool = new Map(appliances.map((a) => [a.storagePoolId, a]));

  pools.forEach((pool, idx) => {
    // Force ~1 in 5 zfs-local pools to a near-full state to seed the storage mode.
    if (pool.kind === "zfs-local" && idx % 5 === 0) {
      const usedPct = int(r, 93, 99) / 100;
      pool.usedBytes = Math.round(pool.capacityBytes * usedPct);
      pool.freeBytes = pool.capacityBytes - pool.usedBytes;
      pool.health = usedPct >= 0.97 ? "degraded" : "online";

      const appliance = applianceByPool.get(pool.id);
      if (appliance) {
        const hosted = assets.filter(
          (a) => a.applianceId === appliance.id && (a.kind === "agent" || a.kind === "agentless"),
        );
        for (const a of hosted.slice(0, 3)) {
          if (a.status === "protected") a.status = "warning";
          const skipped = {
            runId: `RUN-${a.id.slice(-6)}-SK`,
            state: "skipped" as const,
            at: new Date(NOW_MS - int(r, 60, 720) * 60_000).toISOString(),
            isCosmetic: false,
          };
          a.recentRuns = [...a.recentRuns.slice(1), skipped];
        }
      }
    }

    // Top consumers: pick a few hosted assets, weighted by id for stability.
    const appliance = applianceByPool.get(pool.id);
    const hosted = appliance
      ? assets.filter((a) => a.applianceId === appliance.id)
      : assets.filter((a) => a.kind === "endpoint").slice(0, 6);
    const consumers = hosted.slice(0, 5).map((a) => ({
      assetId: a.id,
      bytes: Math.round((pool.usedBytes / Math.max(hosted.length, 1)) * (int(r, 7, 18) / 10)),
    }));
    pool.topConsumers = consumers.sort((x, y) => y.bytes - x.bytes);
  });
}
