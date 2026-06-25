/**
 * @/mock/fixtures — runs the generation DAG ONCE at module load and caches the
 * result in a module-level `DB` object (docs/06 §9.7).
 *
 * The whole dataset is byte-identical across builds, SSR, and Storybook because
 * every generator draws from the seeded PRNG keyed off `SEED` and computes every
 * timestamp from the frozen `NOW_MS` (BUILD-CONTRACT HARD RULE 4). No wall-clock,
 * no `Math.random`.
 *
 * After assembling the DB it runs a referential-integrity pass (every asset/alert/
 * action/incident reference resolves) and throws loudly if anything dangles — the
 * same fail-loud guard the reference layer uses. Consumers should read through
 * `@/mock/query`, not poke at `DB` directly, but `DB` is exported for the query
 * layer + advanced stories.
 */

import type { AssetId } from "@/types";
import { FAILURE_MODES } from "./reference/failure-modes";
import { ACTION_BY_ID } from "./reference/action-catalog";
import {
  generateOrg,
  generateUsers,
  generateClientsSites,
  generateAssets,
  generateRuns,
  generateOffsiteSyncs,
  injectFailures,
  generateIncidents,
  generatePlaybooks,
  generatePolicies,
  generateAutomationHistory,
  recomputeClientRollups,
  recomputeStoragePools,
  type MockDB,
} from "./generators";

/** Assemble the full DB by walking the dependency DAG once. */
function buildDB(): MockDB {
  // 1–2. Org + staff.
  const org = generateOrg();
  const users = generateUsers();

  // 3–5. Clients → sites → appliances + pools.
  const { clients, sites, appliances, storagePools } = generateClientsSites();

  // 6–7. Assets (the spine) + jobs.
  const { assets, jobs } = generateAssets(clients, sites, appliances);

  // 8–10. Run history: embed dot-strips on every asset; deep history for focus set.
  const { runs, recoveryPoints, screenshotVerifications, focusAssetIds } = generateRuns(
    assets,
    jobs,
  );

  // 11. Off-site sync per appliance + a few endpoints.
  const offsiteSyncs = generateOffsiteSyncs(appliances, assets);

  // 12. Inject every failure mode → mutate assets + emit alerts.
  const { alerts } = injectFailures(assets, FAILURE_MODES);

  // 13. Incidents re-parent grouped alerts (and may flip some to auto-resolved).
  const incidents = generateIncidents(alerts);

  // 13b. Prune any alert an incident closed out of each asset's openAlertIds, so
  // a "resolved" alert never lingers in an asset's OPEN list.
  const openAlertIdSet = new Set(
    alerts.filter((a) => a.state === "open").map((a) => a.id),
  );
  for (const asset of assets) {
    if (asset.openAlertIds.some((id) => !openAlertIdSet.has(id))) {
      asset.openAlertIds = asset.openAlertIds.filter((id) =>
        openAlertIdSet.has(id),
      );
    }
  }

  // 14. Recompute denormalized rollups (after mutations).
  const cosmeticAssetIds = new Set<string>(
    alerts.filter((a) => a.isCosmetic && a.assetId).map((a) => a.assetId as string),
  );
  recomputeStoragePools(storagePools, appliances, assets);
  recomputeClientRollups(clients, assets, cosmeticAssetIds);

  // 15. Seeded automation surface + history.
  const playbooks = generatePlaybooks(users);
  const policies = generatePolicies();
  const { actionRuns, approvals, auditLog } = generateAutomationHistory(users, assets, alerts);

  return {
    org,
    users,
    clients,
    sites,
    appliances,
    storagePools,
    offsiteSyncs,
    assets,
    jobs,
    runs,
    recoveryPoints,
    screenshotVerifications,
    alerts,
    incidents,
    playbooks,
    policies,
    actionRuns,
    approvals,
    auditLog,
    focusAssetIds: focusAssetIds as Set<AssetId>,
  };
}

/**
 * Validate referential integrity. Throws on the first dangling reference so a
 * broken generator change can never ship silently.
 */
function assertIntegrity(db: MockDB): void {
  const assetIds = new Set(db.assets.map((a) => a.id));
  const clientIds = new Set(db.clients.map((c) => c.id));
  const alertIds = new Set(db.alerts.map((a) => a.id));
  const modeIds = new Set(FAILURE_MODES.map((m) => m.id));
  const incidentIds = new Set(db.incidents.map((i) => i.id));

  const openAlertIds = new Set(
    db.alerts.filter((a) => a.state === "open").map((a) => a.id),
  );

  // Alerts → asset / client / mode / incident + temporal coherence.
  for (const alert of db.alerts) {
    if (alert.assetId && !assetIds.has(alert.assetId))
      throw new Error(`[fixtures] alert ${alert.id} → unknown asset ${alert.assetId}`);
    if (!clientIds.has(alert.clientId))
      throw new Error(`[fixtures] alert ${alert.id} → unknown client ${alert.clientId}`);
    if (alert.failureModeId && !modeIds.has(alert.failureModeId))
      throw new Error(`[fixtures] alert ${alert.id} → unknown mode ${alert.failureModeId}`);
    if (alert.incidentId && !incidentIds.has(alert.incidentId))
      throw new Error(`[fixtures] alert ${alert.id} → unknown incident ${alert.incidentId}`);
    // firstSeenAt must never be newer than lastSeenAt.
    if (Date.parse(alert.firstSeenAt) > Date.parse(alert.lastSeenAt))
      throw new Error(
        `[fixtures] alert ${alert.id} → firstSeenAt ${alert.firstSeenAt} is after lastSeenAt ${alert.lastSeenAt}`,
      );
  }

  // Assets → client + openAlertIds resolve AND are actually open.
  for (const asset of db.assets) {
    if (!clientIds.has(asset.clientId))
      throw new Error(`[fixtures] asset ${asset.id} → unknown client ${asset.clientId}`);
    for (const aid of asset.openAlertIds) {
      if (!alertIds.has(aid))
        throw new Error(`[fixtures] asset ${asset.id} → unknown openAlert ${aid}`);
      if (!openAlertIds.has(aid))
        throw new Error(
          `[fixtures] asset ${asset.id} → openAlertIds lists a non-open alert ${aid}`,
        );
    }
  }

  // Automation policies → counters must be possible (succeeded ≤ triggered).
  for (const p of db.policies) {
    if (p.stats.succeeded > p.stats.triggered)
      throw new Error(
        `[fixtures] policy ${p.id} → succeeded ${p.stats.succeeded} > triggered ${p.stats.triggered}`,
      );
  }

  // Incidents → alertIds resolve.
  for (const inc of db.incidents) {
    for (const aid of inc.alertIds) {
      if (!alertIds.has(aid))
        throw new Error(`[fixtures] incident ${inc.id} → unknown alert ${aid}`);
    }
  }

  // Playbooks / policies → action + mode ids resolve.
  for (const pb of db.playbooks) {
    for (const step of pb.steps) {
      if (!ACTION_BY_ID[step.actionId])
        throw new Error(`[fixtures] playbook ${pb.id} → unknown action ${step.actionId}`);
    }
    for (const mid of pb.forFailureModeIds ?? []) {
      if (!modeIds.has(mid))
        throw new Error(`[fixtures] playbook ${pb.id} → unknown mode ${mid}`);
    }
  }
  for (const pol of db.policies) {
    if (
      pol.trigger.kind === "failure-mode" &&
      !modeIds.has(pol.trigger.failureModeId)
    )
      throw new Error(
        `[fixtures] policy ${pol.id} → unknown trigger mode ${pol.trigger.failureModeId}`,
      );
    if (pol.action.kind === "action" && !ACTION_BY_ID[pol.action.refId])
      throw new Error(`[fixtures] policy ${pol.id} → unknown action ${pol.action.refId}`);
  }

  // Approvals → action-run refs resolve when they point at one.
  const actionRunIds = new Set(db.actionRuns.map((a) => a.id));
  for (const ap of db.approvals) {
    if (ap.requestedFor.kind === "action-run" && !actionRunIds.has(ap.requestedFor.refId))
      throw new Error(`[fixtures] approval ${ap.id} → unknown action-run ${ap.requestedFor.refId}`);
  }
}

/** The cached, frozen-at-load mock database. */
export const DB: MockDB = buildDB();

assertIntegrity(DB);
