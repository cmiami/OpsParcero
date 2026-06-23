/**
 * @/mock/generators/clients-sites — steps 3–5 of the generation DAG.
 *
 * Builds the 6 client tenants, their ~40 sites, and the ~22 SIRIS/ALTO/NAS
 * appliances + one StoragePool each (docs/06 §9.2/§9.7). Datto Cloud is a facet
 * of BCDR assets, not a separate tenant. SaaS tenants carry an `authStatus` that
 * the EWS→Graph reauth incident later cascades from.
 *
 * Health rollups (`Client.healthRollup`) and pool usage are placeholders here and
 * recomputed in `rollups.ts` once assets/failures exist. Deterministic — draws
 * only from the `clients` / `appliances` PRNG streams + curated pools.
 */

import type {
  Client,
  Site,
  Appliance,
  StoragePool,
  StatusRollup,
  AuthStatus,
  ProductType,
} from "@/types";
import { rng, pick, int, isoAgo, bytes, weighted, type Rng } from "../prng";
import {
  CLIENT_NAMES,
  CLIENT_CODES,
  APPLIANCE_NAMES,
  APPLIANCE_MODELS,
  IMAGE_VERSIONS,
  M365_DOMAINS,
  GOOGLE_DOMAINS,
} from "../pools";
import { ORG_ID } from "./org-users";

/** Six tenants, each with the product mix they exercise (docs/06 §9.2). */
interface ClientPlan {
  name: string;
  code: string;
  products: ProductType[];
  /** Number of physical sites (cloud-only clients get few). */
  siteCount: number;
  saas?: { m365?: string; google?: string; authStatus: AuthStatus };
}

const EMPTY_ROLLUP: StatusRollup = {
  status: "protected",
  protected: 0,
  warning: 0,
  failed: 0,
  paused: 0,
  syncing: 0,
  offline: 0,
  total: 0,
};

/** The six client plans, in fixed order so ids are stable. */
const CLIENT_PLANS: ClientPlan[] = [
  {
    name: CLIENT_NAMES[0], // Acme Dental Group
    code: CLIENT_CODES[0],
    products: ["bcdr", "datto-cloud", "endpoint-v2", "saas-protect", "spanning"],
    siteCount: 4,
    saas: { m365: M365_DOMAINS[0], google: GOOGLE_DOMAINS[0], authStatus: "authorized" },
  },
  {
    name: CLIENT_NAMES[1], // Contoso Health
    code: CLIENT_CODES[1],
    products: ["bcdr", "datto-cloud", "saas-protect"],
    siteCount: 6,
    saas: { m365: M365_DOMAINS[1], authStatus: "reauth-required" },
  },
  {
    name: CLIENT_NAMES[2], // Northwind Traders
    code: CLIENT_CODES[2],
    products: ["bcdr", "endpoint-v1", "endpoint-v2"],
    siteCount: 5,
  },
  {
    name: CLIENT_NAMES[6], // Globex Manufacturing
    code: CLIENT_CODES[6],
    products: ["bcdr", "datto-cloud", "endpoint-v2"],
    siteCount: 7,
  },
  {
    name: CLIENT_NAMES[7], // Initech Systems
    code: CLIENT_CODES[7],
    products: ["endpoint-v2", "spanning"],
    siteCount: 2,
    saas: { google: GOOGLE_DOMAINS[1], authStatus: "authorized" },
  },
  {
    name: CLIENT_NAMES[8], // Umbra Logistics
    code: CLIENT_CODES[8],
    products: ["bcdr", "endpoint-v2", "spanning"],
    siteCount: 4,
    saas: { google: GOOGLE_DOMAINS[2], authStatus: "expired" },
  },
];

const SITE_SUFFIXES = ["HQ", "DR", "Branch", "Datacenter", "Annex", "Remote", "Lab", "Warehouse"];
const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Australia/Sydney",
];

/** A short hex token for serials / ids, deterministic from the rng. */
function hex(r: Rng, len: number): string {
  const chars = "0123456789ABCDEF";
  let out = "";
  for (let i = 0; i < len; i += 1) out += chars[int(r, 0, 15)];
  return out;
}

export interface ClientsSitesResult {
  clients: Client[];
  sites: Site[];
  appliances: Appliance[];
  storagePools: StoragePool[];
}

/**
 * Build clients → sites → appliances + pools. Appliances only attach to clients
 * whose product mix includes a BCDR product; SaaS/endpoint-only sites get none.
 */
export function generateClientsSites(): ClientsSitesResult {
  const r = rng("clients");
  const ra = rng("appliances");

  const clients: Client[] = [];
  const sites: Site[] = [];
  const appliances: Appliance[] = [];
  const storagePools: StoragePool[] = [];

  let applianceCursor = 0;

  CLIENT_PLANS.forEach((plan) => {
    const clientId = `CLI-${plan.code}`;
    const hasBcdr = plan.products.some((p) => p === "bcdr" || p === "datto-cloud");

    const clientSites: Site[] = [];
    for (let s = 0; s < plan.siteCount; s += 1) {
      const siteId = `SITE-${plan.code}-${String(s + 1).padStart(2, "0")}`;
      const suffix = SITE_SUFFIXES[s % SITE_SUFFIXES.length];
      const site: Site = {
        id: siteId,
        clientId,
        name: `${plan.name.split(" ")[0]} — ${suffix}`,
        timezone: pick(r, TIMEZONES),
        applianceIds: [],
      };
      clientSites.push(site);
      sites.push(site);
    }

    // Attach appliances to BCDR clients: roughly one per 1–2 sites, capped.
    if (hasBcdr) {
      const applianceCount = Math.max(1, Math.ceil(plan.siteCount / 2));
      for (let a = 0; a < applianceCount; a += 1) {
        const site = clientSites[a % clientSites.length];
        const applianceId = `APP-${hex(ra, 6)}`;
        const poolId = `POOL-${applianceId.slice(4)}`;
        const model = pick(ra, APPLIANCE_MODELS);
        const isAlto = model.startsWith("ALTO");
        const isNas = model.startsWith("NAS");
        const _baseName =
          APPLIANCE_NAMES[(applianceCursor + a) % APPLIANCE_NAMES.length];

        // Pool capacity scales with model class; usage filled in later.
        const capacityGb = isAlto ? 2_000 : isNas ? 12_000 : pick(ra, [8_000, 16_000, 32_000]);
        const capacity = bytes(capacityGb);
        const usedPct0 = int(ra, 38, 78) / 100;
        const used = Math.round(capacity * usedPct0);

        const pool: StoragePool = {
          id: poolId,
          applianceId,
          kind: "zfs-local",
          capacityBytes: capacity,
          usedBytes: used,
          freeBytes: capacity - used,
          health: "online",
          topConsumers: [],
        };
        storagePools.push(pool);

        const deviceStatus = weighted(ra, { online: 88, degraded: 8, offline: 4 });
        const appliance: Appliance = {
          id: applianceId,
          siteId: site.id,
          model: isNas ? "NAS" : isAlto ? "ALTO" : "SIRIS",
          hardwareModel: model,
          serial: `DAT-${model.replace(/\s+/g, "")}-${hex(ra, 4)}`,
          imageVersion: pick(ra, IMAGE_VERSIONS),
          status: deviceStatus,
          lastCheckIn:
            deviceStatus === "offline"
              ? isoAgo(ra, 60 * 24 * 2, 60 * 24 * 6)
              : isoAgo(ra, 2, 90),
          storagePoolId: poolId,
        };
        site.applianceIds.push(applianceId);
        appliances.push(appliance);
      }
      applianceCursor += applianceCount;
    }

    clients.push({
      id: clientId,
      orgId: ORG_ID,
      name: plan.name,
      externalRef: `ITG-${hex(r, 5)}`,
      products: plan.products,
      healthRollup: { ...EMPTY_ROLLUP },
      saasTenant: plan.saas
        ? {
            m365TenantId: plan.saas.m365 ? `${hex(r, 8)}-${hex(r, 4)}-tenant` : undefined,
            googleDomain: plan.saas.google,
            authStatus: plan.saas.authStatus,
          }
        : undefined,
    });
  });

  // ~8 cloud-consumption pools for endpoint clients (no appliance).
  const endpointClients = clients.filter((c) =>
    c.products.some((p) => p === "endpoint-v1" || p === "endpoint-v2"),
  );
  endpointClients.forEach((c) => {
    const poolId = `POOL-CLOUD-${c.id.slice(4)}`;
    const capacityGb = pick(ra, [5_000, 10_000, 20_000]);
    const capacity = bytes(capacityGb);
    const used = Math.round(capacity * (int(ra, 30, 70) / 100));
    storagePools.push({
      id: poolId,
      kind: "cloud-consumption",
      capacityBytes: capacity,
      usedBytes: used,
      freeBytes: capacity - used,
      health: "online",
      topConsumers: [],
    });
  });

  return { clients, sites, appliances, storagePools };
}
