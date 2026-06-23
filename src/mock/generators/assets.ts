/**
 * @/mock/generators/assets — step 6–7 of the generation DAG (the spine).
 *
 * Builds ~290 ProtectedAssets across all six kinds, assigned to clients/sites/
 * appliances by product mix, plus one BackupJob per asset (SaaS seats get one per
 * active service collapsed to a single job for the mock). Every asset starts in a
 * healthy baseline state; `inject-failures.ts` later flips a believable tail to
 * the catalog modes (docs/06 §9.3/§9.4/§9.5). Lead product is BCDR (densest).
 *
 * Deterministic — draws only from the `assets` / `jobs` PRNG streams and pools.
 */

import type {
  ProtectedAsset,
  AgentAsset,
  AgentlessAsset,
  EndpointAsset,
  SaasSeatAsset,
  SalesforceOrgAsset,
  ShareAsset,
  BackupJob,
  Client,
  Site,
  Appliance,
  ProductType,
  SaasSeatType,
  AssetStatus,
} from "@/types";
import { rng, pick, int, weighted, isoAgo, shuffle, type Rng } from "../prng";
import {
  HOSTNAMES,
  LONG_HOSTNAME,
  ENDPOINT_NAMES,
  OS_LIST_WINDOWS,
  OS_LIST_LINUX,
  OS_LIST_MACOS,
  SHADOWSNAP_VERSIONS,
  DWA_VERSIONS,
  LINUX_AGENT_VERSIONS,
  DEB_AGENT_VERSIONS,
  USER_LOCALPARTS,
  M365_DOMAINS,
  GOOGLE_DOMAINS,
  SF_ORG_SLUGS,
  TAGS,
} from "../pools";

/** Baseline status distribution (docs/06 §9.3) — mostly healthy. */
const BASELINE_STATUS: Record<AssetStatus, number> = {
  protected: 82,
  warning: 9,
  failed: 0, // real failures only via injection; baseline keeps the wall honest
  syncing: 3,
  paused: 4,
  offline: 2,
};

/** Per-product asset counts (scaled to ~290 for instant in-memory). */
interface AssetPlan {
  kind: ProtectedAsset["kind"];
  productType: ProductType;
  count: number;
}

const ASSET_PLAN: AssetPlan[] = [
  { kind: "agent", productType: "bcdr", count: 90 },
  { kind: "agentless", productType: "bcdr", count: 34 },
  { kind: "share", productType: "bcdr", count: 12 },
  { kind: "endpoint", productType: "endpoint-v1", count: 28 },
  { kind: "endpoint", productType: "endpoint-v2", count: 46 },
  { kind: "saas-seat", productType: "saas-protect", count: 44 },
  { kind: "saas-seat", productType: "spanning", count: 22 },
  { kind: "salesforce-org", productType: "spanning", count: 8 },
];

/** Pick 1–3 tags relevant to a kind/os, deterministic. */
function pickTags(r: Rng, base: string[]): string[] {
  const extra = shuffle(r, TAGS).slice(0, int(r, 1, 2));
  return Array.from(new Set([...base, ...extra]));
}

/** Draw a baseline status (no `failed` — injection owns reds). */
function baselineStatus(r: Rng): AssetStatus {
  return weighted(r, BASELINE_STATUS);
}

/** lastGood recency consistent with status. */
function lastGoodFor(r: Rng, status: AssetStatus): string | undefined {
  switch (status) {
    case "protected":
    case "syncing":
      return isoAgo(r, 30, 60 * 14); // <14h
    case "warning":
      return isoAgo(r, 60 * 6, 60 * 30);
    case "paused":
      return isoAgo(r, 60 * 24, 60 * 24 * 10);
    case "offline":
      return isoAgo(r, 60 * 24 * 2, 60 * 24 * 7);
    default:
      return isoAgo(r, 60, 60 * 24);
  }
}

interface AssetsResult {
  assets: ProtectedAsset[];
  jobs: BackupJob[];
}

/**
 * Build all assets + jobs. `recentRuns`, `openAlertIds`, and full run history are
 * filled by later steps; here they start empty (runs) / empty (alerts).
 */
export function generateAssets(
  clients: Client[],
  sites: Site[],
  appliances: Appliance[],
): AssetsResult {
  const r = rng("assets");
  const assets: ProtectedAsset[] = [];
  const jobs: BackupJob[] = [];

  const byClient = (predicate: (c: Client) => boolean) => clients.filter(predicate);
  const sitesFor = (clientId: string) => sites.filter((s) => s.clientId === clientId);
  const appliancesFor = (clientId: string) => {
    const siteIds = new Set(sitesFor(clientId).map((s) => s.id));
    return appliances.filter((a) => siteIds.has(a.siteId));
  };

  // Cursor per hostname/endpoint pool so names stay varied + mono-realistic.
  let hostCursor = 0;
  let endpointCursor = 0;
  let seatCursor = 0;
  let longHostUsed = false;

  for (const plan of ASSET_PLAN) {
    const eligible = byClient((c) => c.products.includes(plan.productType));
    if (eligible.length === 0) continue;

    for (let i = 0; i < plan.count; i += 1) {
      const client = eligible[i % eligible.length];
      const status = baselineStatus(r);
      const protectionEnabled = status !== "paused";
      const idTail = String(assets.length + 1).padStart(4, "0");

      let asset: ProtectedAsset;

      if (plan.kind === "agent") {
        const clientAppliances = appliancesFor(client.id);
        const appliance = clientAppliances.length ? pick(r, clientAppliances) : undefined;
        const isLinux = r() < 0.22;
        // Reserve exactly one long-hostname agent for the cosmetic screenshot case.
        let host: string;
        if (!longHostUsed && plan.productType === "bcdr" && i === 3) {
          host = LONG_HOSTNAME;
          longHostUsed = true;
        } else {
          host = HOSTNAMES[hostCursor % HOSTNAMES.length];
          hostCursor += 1;
        }
        const a: AgentAsset = {
          id: `AST-AGT-${idTail}`,
          kind: "agent",
          productType: "bcdr",
          clientId: client.id,
          siteId: appliance?.siteId,
          applianceId: appliance?.id,
          displayName: host,
          status,
          lastGoodBackupAt: lastGoodFor(r, status),
          protectionEnabled,
          recentRuns: [],
          openAlertIds: [],
          tags: pickTags(r, isLinux ? ["linux"] : ["windows"]),
          os: isLinux
            ? { family: "linux", version: pick(r, OS_LIST_LINUX) }
            : { family: "windows", version: pick(r, OS_LIST_WINDOWS) },
          agentVersion: isLinux ? pick(r, LINUX_AGENT_VERSIONS) : pick(r, SHADOWSNAP_VERSIONS),
          driverStatus: "loaded",
          vssStatus: "healthy",
          encrypted: r() < 0.4,
          sealed: false,
          pairingStatus: "paired",
          backupChainState: "ok",
        };
        // A few use the newer Datto Windows Agent.
        if (!isLinux && r() < 0.3) a.agentVersion = pick(r, DWA_VERSIONS);
        asset = a;
      } else if (plan.kind === "agentless") {
        const clientAppliances = appliancesFor(client.id);
        const appliance = clientAppliances.length ? pick(r, clientAppliances) : undefined;
        const host = HOSTNAMES[hostCursor % HOSTNAMES.length];
        hostCursor += 1;
        const a: AgentlessAsset = {
          id: `AST-AGL-${idTail}`,
          kind: "agentless",
          productType: "bcdr",
          clientId: client.id,
          siteId: appliance?.siteId,
          applianceId: appliance?.id,
          displayName: `${host}-vm`,
          status,
          lastGoodBackupAt: lastGoodFor(r, status),
          protectionEnabled,
          recentRuns: [],
          openAlertIds: [],
          tags: pickTags(r, [r() < 0.5 ? "vmware" : "hyperv"]),
          hypervisor: r() < 0.55 ? "vmware" : "hyperv",
          cbtStatus: "enabled",
          vmwareToolsState: "running",
          stalledSnapshots: 0,
          backupChainState: "ok",
        };
        asset = a;
      } else if (plan.kind === "share") {
        const clientAppliances = appliancesFor(client.id);
        const appliance = clientAppliances.length ? pick(r, clientAppliances) : undefined;
        const host = HOSTNAMES[hostCursor % HOSTNAMES.length];
        hostCursor += 1;
        const protocol = r() < 0.7 ? "smb" : "nfs";
        const a: ShareAsset = {
          id: `AST-SHR-${idTail}`,
          kind: "share",
          productType: "bcdr",
          clientId: client.id,
          siteId: appliance?.siteId,
          applianceId: appliance?.id,
          displayName: `\\\\${host}\\${pick(r, ["finance", "shared", "engineering", "archive"])}`,
          status,
          lastGoodBackupAt: lastGoodFor(r, status),
          protectionEnabled,
          recentRuns: [],
          openAlertIds: [],
          tags: pickTags(r, ["file-server"]),
          protocol,
          sharePath: `\\\\${host}\\${pick(r, ["finance", "shared", "engineering"])}`,
          credentialStatus: "valid",
        };
        asset = a;
      } else if (plan.kind === "endpoint") {
        const gen = plan.productType === "endpoint-v2" ? "v2" : "v1";
        const name = ENDPOINT_NAMES[endpointCursor % ENDPOINT_NAMES.length];
        endpointCursor += 1;
        const a: EndpointAsset = {
          id: `AST-EP-${idTail}`,
          kind: "endpoint",
          productType: plan.productType,
          clientId: client.id,
          displayName: `${name}-${idTail.slice(-2)}`,
          status,
          lastGoodBackupAt: lastGoodFor(r, status),
          protectionEnabled,
          recentRuns: [],
          openAlertIds: [],
          tags: pickTags(r, gen === "v2" ? ["windows"] : ["windows"]),
          agentGen: gen,
          consoleSurface: gen === "v2" ? "uniview" : "partner-portal",
          cbtFilterStatus: "healthy",
          meteredPaused: false,
          supportabilityFlags: [],
          backupChainState: "ok",
        };
        // A couple run a known-bad DEB build to seed the version-audit failure.
        if (gen === "v2" && r() < 0.12) {
          a.supportabilityFlags.push(`deb-${pick(r, DEB_AGENT_VERSIONS)}`);
        }
        // A small share of v2 endpoints are macOS (no virtualization support).
        if (gen === "v2" && r() < 0.1) {
          a.tags = pickTags(r, ["macos"]);
          a.supportabilityFlags.push(`os:${pick(r, OS_LIST_MACOS)}`);
        }
        asset = a;
      } else if (plan.kind === "saas-seat") {
        const seatType = weighted<SaasSeatType>(r, {
          exchange: 30,
          onedrive: 22,
          sharepoint: 14,
          teams: 12,
          gmail: 12,
          gdrive: 10,
        });
        const google = seatType === "gmail" || seatType === "gdrive";
        const local = USER_LOCALPARTS[seatCursor % USER_LOCALPARTS.length];
        seatCursor += 1;
        const domain = google
          ? (client.saasTenant?.googleDomain ?? pick(r, GOOGLE_DOMAINS))
          : pick(r, M365_DOMAINS);
        const upn = `${local}@${domain}`;
        const tenantAuth = client.saasTenant?.authStatus ?? "authorized";
        const a: SaasSeatAsset = {
          id: `SEAT-${local}-${idTail}`,
          kind: "saas-seat",
          productType: plan.productType,
          clientId: client.id,
          displayName: upn,
          status,
          lastGoodBackupAt: lastGoodFor(r, status),
          protectionEnabled,
          recentRuns: [],
          openAlertIds: [],
          tags: pickTags(r, [google ? "google" : "m365", seatType]),
          seatType,
          upn,
          licensed: true,
          archived: false,
          billedWhileArchived: false,
          authStatus: tenantAuth,
          lastBackupRunPerService: { [seatType]: lastGoodFor(r, status) ?? "" },
        };
        asset = a;
      } else {
        // salesforce-org
        const orgType = r() < 0.7 ? "production" : "sandbox";
        const a: SalesforceOrgAsset = {
          id: `SFO-${idTail}`,
          kind: "salesforce-org",
          productType: "spanning",
          clientId: client.id,
          displayName: `${client.name.split(" ")[0]} ${SF_ORG_SLUGS[i % SF_ORG_SLUGS.length]}`,
          status,
          lastGoodBackupAt: lastGoodFor(r, status),
          protectionEnabled,
          recentRuns: [],
          openAlertIds: [],
          tags: pickTags(r, ["compliance"]),
          sfOrgType: orgType,
          apiCallCapPct: pick(r, [15, 30, 50]),
          apiUsage: int(r, 20, 80),
          metadataBackup: r() < 0.6,
          authStatus: client.saasTenant?.authStatus ?? "authorized",
        };
        asset = a;
      }

      assets.push(asset);
      jobs.push(buildJob(r, asset));
    }
  }

  return { assets, jobs };
}

/** One BackupJob per asset, cadence/retention scaled by kind. */
function buildJob(r: Rng, asset: ProtectedAsset): BackupJob {
  const isSaas = asset.kind === "saas-seat" || asset.kind === "salesforce-org";
  const isEndpoint = asset.kind === "endpoint";
  const cadence: BackupJob["schedule"]["cadence"] = isSaas
    ? "daily"
    : isEndpoint
      ? "hourly"
      : pick(r, ["continuous", "hourly"]);
  return {
    id: `JOB-${asset.id.replace(/^(AST|SEAT|SFO)-/, "")}`,
    assetId: asset.id,
    schedule: {
      cadence,
      windows: isSaas ? undefined : [{ start: "22:00", end: "06:00" }],
    },
    retention: isSaas
      ? { cloudDays: pick(r, [365, 2555]) }
      : { localDays: pick(r, [14, 30, 60]), cloudDays: pick(r, [90, 180, 365]) },
    throttle: isEndpoint ? { transmitLimitMbps: pick(r, [10, 25, 50]) } : undefined,
    pauseWhileMetered: isEndpoint ? r() < 0.3 : undefined,
  };
}
