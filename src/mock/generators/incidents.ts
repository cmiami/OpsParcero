/**
 * @/mock/generators/incidents — step 13 of the generation DAG (docs/06 §9.6).
 *
 * The five seeded incidents, one per IncidentKind. Each one re-parents a batch of
 * already-injected alerts (by failure-mode family) under a single banner so the UI
 * shows one outage strip instead of N alerts. INC-EWS-2026 counts down to a
 * deadline already passed relative to NOW (shown overdue); INC-V2-OFFLINE is a
 * resolved post-incident reconciliation demo.
 *
 * Mutates the matched alerts' `incidentId` in place. Deterministic — `incidents`
 * PRNG stream (used only for tie-breaking selection).
 */

import type { Alert, Incident, AlertId } from "@/types";
import { rng, type Rng } from "../prng";
import { NOW_MS } from "../seed";
import { VENDOR_INCIDENT_PREFIX } from "../pools";

interface IncidentPlan {
  id: string;
  kind: Incident["kind"];
  scope: Incident["scope"];
  status: Incident["status"];
  vendorStatusRef: string;
  bannerText: string;
  openedAtMin: number; // minutes before NOW
  resolvedAtMin?: number;
  /** Which failure-mode ids' alerts this incident groups. */
  modeIds: string[];
  /** Cap on how many alerts to absorb. */
  cap: number;
}

const PLANS: IncidentPlan[] = [
  {
    id: "INC-EWS-2026",
    kind: "mass-reauth",
    scope: "fleet",
    status: "active",
    vendorStatusRef: `${VENDOR_INCIDENT_PREFIX}-20260530-EWS`,
    bannerText:
      "EWS-to-Graph migration requires Global Admin reauthorization. Exchange backups are stopped for unauthorized organizations — deadline May 30 2026 (overdue).",
    openedAtMin: 60 * 24 * 24,
    modeIds: ["ews-graph-reauthorization-deadline", "seats-archived-tenant-api-errors"],
    cap: 18,
  },
  {
    id: "INC-POD-EU3",
    kind: "pod-throttling",
    scope: "pod",
    status: "active",
    vendorStatusRef: `${VENDOR_INCIDENT_PREFIX}-20260619-EU3`,
    bannerText:
      "Microsoft is throttling SharePoint / Teams (429 / 503) on the EU-3 pod. Affected backups are retrying with adaptive backoff.",
    openedAtMin: 60 * 36,
    modeIds: ["graph-sharepoint-teams-throttling-loop", "m365-graph-throttling"],
    cap: 12,
  },
  {
    id: "INC-APP-RESEAL",
    kind: "appliance-reboot",
    scope: "appliance",
    status: "monitoring",
    vendorStatusRef: `${VENDOR_INCIDENT_PREFIX}-20260621-RESEAL`,
    bannerText:
      "A SIRIS appliance rebooted; encrypted agent datasets are re-sealed and paused (bk005) until passphrases are re-entered.",
    openedAtMin: 60 * 20,
    modeIds: ["encrypted-agent-resealed-after-reboot"],
    cap: 9,
  },
  {
    id: "INC-SYNC-BACKLOG",
    kind: "sync-backlog",
    scope: "appliance",
    status: "active",
    vendorStatusRef: `${VENDOR_INCIDENT_PREFIX}-20260618-SYNC`,
    bannerText:
      "Off-site sync backlog on one appliance is stalling nightly retention, bloating the local ZFS pool. RoundTrip seed suggested.",
    openedAtMin: 60 * 24 * 4,
    modeIds: ["offsite-sync-behind", "offsite-replication-backlog-roundtrip", "offsite-sync-stall-blocks-retention"],
    cap: 10,
  },
  {
    id: "INC-V2-OFFLINE",
    kind: "platform-outage",
    scope: "fleet",
    status: "resolved",
    vendorStatusRef: `${VENDOR_INCIDENT_PREFIX}-20260610-V2`,
    bannerText:
      "Resolved: Endpoint Backup v2 assets reported offline; backups and restores were briefly unavailable. Post-incident reconciliation complete.",
    openedAtMin: 60 * 24 * 12,
    resolvedAtMin: 60 * 24 * 11,
    modeIds: ["platform-outage-assets-offline", "cloud-platform-outage"],
    cap: 14,
  },
];

function minToIso(min: number): string {
  return new Date(NOW_MS - min * 60_000).toISOString();
}

/**
 * Build the five incidents and re-parent matching alerts. Resolved incidents flip
 * their absorbed alerts to `auto-resolved`. Returns the incidents; alerts mutated.
 */
export function generateIncidents(alerts: Alert[]): Incident[] {
  const r: Rng = rng("incidents");
  void r; // selection is deterministic by alert order; rng kept for future tie-breaks
  const incidents: Incident[] = [];

  for (const plan of PLANS) {
    const matched: AlertId[] = [];
    for (const alert of alerts) {
      if (matched.length >= plan.cap) break;
      if (alert.incidentId) continue;
      if (alert.failureModeId && plan.modeIds.includes(alert.failureModeId)) {
        alert.incidentId = plan.id;
        if (plan.status === "resolved") alert.state = "auto-resolved";
        matched.push(alert.id);
      }
    }

    incidents.push({
      id: plan.id,
      kind: plan.kind,
      scope: plan.scope,
      alertIds: matched,
      status: plan.status,
      vendorStatusRef: plan.vendorStatusRef,
      bannerText: plan.bannerText,
      openedAt: minToIso(plan.openedAtMin),
      resolvedAt: plan.resolvedAtMin ? minToIso(plan.resolvedAtMin) : undefined,
    });
  }

  return incidents;
}
