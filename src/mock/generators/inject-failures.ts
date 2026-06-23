/**
 * @/mock/generators/inject-failures — step 12 of the generation DAG (docs/06 §9.5).
 *
 * Goal: every one of the 135 catalog FailureModes is realized by ≥1 real-looking
 * asset + a classified Alert, so every remediation action has a live target and
 * every fix-type (End-to-end / Guided / Insights / Unknown) is represented.
 *
 * For each mode we pick an injection count from its frequency, select eligible
 * still-healthy assets (matching productType + applicable kind), flip their facet
 * fields to the failing state, recompute `status`, append a failing BackupRun
 * summary carrying a verbatim error string, and emit a deduped Alert. Cosmetic
 * modes flip to `warning` + `isCosmetic`. Incidents re-parent grouped alerts in
 * the next step. Deterministic — `failures` PRNG stream.
 */

import type {
  FailureMode,
  ProtectedAsset,
  AgentAsset,
  AgentlessAsset,
  EndpointAsset,
  SaasSeatAsset,
  SalesforceOrgAsset,
  ShareAsset,
  Alert,
  BackupRunSummary,
  AssetStatus,
  AssetKind,
  Severity,
  AlertId,
} from "@/types";
import { productTypeToBucket } from "@/types";
import { rng, pick, int, isoAgo, type Rng } from "../prng";
import { NOW_MS } from "../seed";
import { ACTION_BY_ID } from "../reference/action-catalog";

/** Injection-count band per frequency (docs/06 §9.5 step 2). */
function injectionCount(r: Rng, freq: FailureMode["frequency"]): number {
  switch (freq) {
    case "very-common":
      return int(r, 4, 9);
    case "common":
      return int(r, 2, 4);
    case "occasional":
      return int(r, 1, 2);
    case "rare":
    default:
      return 1;
  }
}

/** The asset kinds a mode's actions can apply to (union over its actions). */
function modeKinds(mode: FailureMode): Set<AssetKind> {
  const kinds = new Set<AssetKind>();
  for (const aid of mode.remediationActionIds) {
    const action = ACTION_BY_ID[aid];
    if (!action) continue;
    for (const k of action.appliesToKinds) kinds.add(k);
  }
  return kinds;
}

/**
 * The OS / SaaS seat-family a mode is intrinsically about, inferred from its
 * identity (productType is coarse — `saas-protect` covers both M365 and Google —
 * so seat family lives in the asset's tags). Used to keep an OS- or provider-
 * specific failure from landing on a mismatched asset (a macOS issue on a Windows
 * endpoint, a SharePoint/Graph issue on a Google-Drive seat). Returns null when
 * the mode is family-agnostic.
 */
function modeFamily(
  mode: FailureMode,
): "macos" | "linux" | "m365" | "google" | "salesforce" | null {
  const h = `${mode.id} ${mode.title ?? ""} ${mode.description ?? ""}`.toLowerCase();
  if (/\bmac\s?os\b|\bmacos\b/.test(h)) return "macos";
  if (/\blinux\b/.test(h)) return "linux";
  if (/salesforce|sfdc/.test(h)) return "salesforce";
  if (/m365|microsoft 365|sharepoint|onedrive|\bteams\b|exchange|outlook|graph/.test(h))
    return "m365";
  if (/google|gmail|gdrive|g\s?suite|workspace/.test(h)) return "google";
  return null;
}

/** Whether an asset is a coherent host for a family-specific mode (via its tags/kind). */
function assetMatchesFamily(asset: ProtectedAsset, mode: FailureMode): boolean {
  const fam = modeFamily(mode);
  if (!fam) return true;
  const tags = asset.tags ?? [];
  switch (fam) {
    case "macos":
      return tags.includes("macos");
    case "linux":
      return tags.includes("linux");
    case "salesforce":
      return asset.kind === "salesforce-org";
    case "m365":
      return tags.includes("m365");
    case "google":
      return tags.includes("google");
  }
}

/** Map cosmetic / severity → the visible asset status the mode forces. */
function statusForMode(mode: FailureMode): { status: AssetStatus; isCosmetic: boolean } {
  if (mode.cosmeticByDefault) return { status: "warning", isCosmetic: true };
  if (mode.defaultSeverity === "critical") return { status: "failed", isCosmetic: false };
  return { status: "warning", isCosmetic: false };
}

/** Flip the facet fields on the concrete asset variant for a given mode. */
function applyFacets(asset: ProtectedAsset, mode: FailureMode, r: Rng): void {
  switch (asset.kind) {
    case "agent": {
      const a = asset as AgentAsset;
      switch (mode.category) {
        case "Agent Communication":
          a.pairingStatus = pick(r, ["401-unauthorized", "cert-expired", "port-blocked"]);
          break;
        case "Backup Chain":
          a.vssStatus = r() < 0.5 ? "writer-failed" : "dbd-fallback";
          if (mode.id.includes("driver")) a.driverStatus = "pending-reboot";
          break;
        case "Storage/ZFS":
          if (mode.id.includes("encrypted") || mode.id.includes("resealed")) {
            a.sealed = true;
            a.encrypted = true;
          }
          break;
        case "Diff-Merge/Chain Rebuild":
          a.backupChainState = "rebuilding";
          break;
        case "Screenshot/Local Verification":
          a.backupChainState = r() < 0.4 ? "needs-diff-merge" : "ok";
          break;
        default:
          break;
      }
      break;
    }
    case "agentless": {
      const a = asset as AgentlessAsset;
      if (mode.category === "Backup Chain") {
        a.cbtStatus = r() < 0.5 ? "reset-required" : "disabled";
        a.stalledSnapshots = int(r, 1, 6);
        a.vmwareToolsState = r() < 0.5 ? "out-of-date" : "not-installed";
      }
      if (mode.category === "Diff-Merge/Chain Rebuild") a.backupChainState = "rebuilding";
      break;
    }
    case "endpoint": {
      const a = asset as EndpointAsset;
      switch (mode.category) {
        case "Backup Chain":
          if (mode.id.includes("cbtfilter") || mode.id.includes("cbt"))
            a.cbtFilterStatus = "needs-reinstall";
          a.backupChainState = r() < 0.4 ? "needs-diff-merge" : "ok";
          break;
        case "Agent Communication":
          a.cbtFilterStatus = r() < 0.5 ? "pending-reboot" : "needs-reinstall";
          break;
        case "Networking":
          a.meteredPaused = true;
          break;
        default:
          break;
      }
      if (mode.id.includes("bad-agent-version") || mode.id.includes("version")) {
        a.supportabilityFlags = Array.from(new Set([...a.supportabilityFlags, "known-bad-agent"]));
      }
      break;
    }
    case "saas-seat": {
      const a = asset as SaasSeatAsset;
      switch (mode.category) {
        case "OAuth/Auth":
          a.authStatus = pick(r, ["consent-required", "token-revoked", "reauth-required", "expired"]);
          break;
        case "Licensing/Seats":
          if (mode.id.includes("archived")) {
            a.archived = true;
            a.billedWhileArchived = true;
          } else {
            a.licensed = false;
          }
          break;
        case "API Throttling":
        case "Cloud Sync":
        case "Backup Chain":
          // sync stalls — leave licensing intact, status reflects failure
          break;
        default:
          break;
      }
      break;
    }
    case "salesforce-org": {
      const a = asset as SalesforceOrgAsset;
      if (mode.category === "API Throttling") a.apiUsage = int(r, 92, 100);
      if (mode.category === "OAuth/Auth")
        a.authStatus = pick(r, ["consent-required", "token-revoked", "reauth-required"]);
      break;
    }
    case "share": {
      const a = asset as ShareAsset;
      if (mode.category === "Backup Chain")
        a.credentialStatus = r() < 0.5 ? "expired" : "access-denied";
      break;
    }
    default:
      break;
  }
}

/** Pick a verbatim error string from the mode's match signals (or a fallback). */
function rawErrorFor(mode: FailureMode, r: Rng): string | undefined {
  if (mode.matchSignals.length === 0) return undefined;
  return pick(r, mode.matchSignals).contains;
}

/** Map a mode's source category to the Alert.source channel. */
function sourceFor(mode: FailureMode): Alert["source"] {
  switch (mode.category) {
    case "Storage/ZFS":
      return "storage";
    case "Cloud Sync":
    case "Diff-Merge/Chain Rebuild":
      return "sync";
    case "Agent Communication":
      return "comms";
    case "OAuth/Auth":
    case "Licensing/Seats":
    case "API Throttling":
      return "auth";
    case "Screenshot/Local Verification":
      return "verification";
    default:
      return "backup-run";
  }
}

/** Short human alert title from the mode + asset. */
function alertTitle(mode: FailureMode, asset: ProtectedAsset): string {
  const subject = asset.displayName;
  const head = mode.title.split(/[—(]/)[0].trim();
  return `${head} — ${subject}`;
}

export interface InjectFailuresResult {
  alerts: Alert[];
  /** modeId → injected asset ids (for incident grouping + coverage assertion). */
  injectedByMode: Map<string, string[]>;
}

/**
 * Mutate assets to realize every failure mode and emit the resulting alerts.
 * `modes` should be the full FAILURE_MODES catalog. Assets are mutated in place.
 */
export function injectFailures(
  assets: ProtectedAsset[],
  modes: FailureMode[],
): InjectFailuresResult {
  const r = rng("failures");
  const alerts: Alert[] = [];
  const injectedByMode = new Map<string, string[]>();
  for (const m of modes) injectedByMode.set(m.id, []);
  let alertSeq = 44000;

  const isHealthy = (a: ProtectedAsset) => a.status === "protected" || a.status === "syncing";

  /**
   * Flip one eligible healthy asset to a mode and emit its alert. Returns the
   * chosen asset id, or null if no healthy candidate exists anywhere. Tiers:
   * right bucket + matching kind → right bucket → any healthy (so rare modes can
   * always land their guaranteed first instance).
   */
  function placeOne(mode: FailureMode): string | null {
    const bucket = productTypeToBucket(mode.productType);
    const kinds = modeKinds(mode);
    const { status, isCosmetic } = statusForMode(mode);
    const source = sourceFor(mode);

    // Placement tiers, most-coherent first: right bucket + applicable kind +
    // matching OS/seat family → right bucket + kind → right bucket → any healthy
    // (so a rare mode can always land its guaranteed first instance). The family
    // tier eliminates the cross-injections a reviewer would catch on screen
    // (a macOS issue on a Windows endpoint, a SharePoint/Graph issue on a Google
    // seat). The only residual is a couple of Salesforce-restore modes that can
    // overflow to a mailbox seat when no healthy salesforce-org remains — the
    // guaranteed-first-instance fallback, accepted for this POC seed.
    const inBucket = (a: ProtectedAsset) =>
      productTypeToBucket(a.productType) === bucket && isHealthy(a);
    const ofKind = (a: ProtectedAsset) =>
      kinds.size === 0 || kinds.has(a.kind);
    const tierIdeal = assets.filter(
      (a) => inBucket(a) && ofKind(a) && assetMatchesFamily(a, mode),
    );
    const tierKind = assets.filter((a) => inBucket(a) && ofKind(a));
    const tierBucket = assets.filter(inBucket);
    const pool = tierIdeal.length
      ? tierIdeal
      : tierKind.length
        ? tierKind
        : tierBucket.length
          ? tierBucket
          : assets.filter(isHealthy);
    if (pool.length === 0) return null;

    const asset = pool[int(r, 0, pool.length - 1)];

    // Flip the asset.
    applyFacets(asset, mode, r);
    asset.status = status;
    asset.lastGoodBackupAt = isoAgo(
      r,
      status === "failed" ? 60 * 6 : 60 * 2,
      status === "failed" ? 60 * 24 * 4 : 60 * 24,
    );

    // Overlay the newest dot in the strip with the failing run.
    const newestRun: BackupRunSummary = {
      runId: `RUN-${asset.id.slice(-6)}-FX`,
      state: status === "failed" ? "failed" : isCosmetic ? "success-crash-consistent" : "skipped",
      at: new Date(NOW_MS - int(r, 30, 600) * 60_000).toISOString(),
      isCosmetic,
    };
    asset.recentRuns = [...asset.recentRuns.slice(1), newestRun];

    // Emit the classified alert.
    const alertId: AlertId = `ALR-${alertSeq}`;
    alertSeq += int(r, 1, 4);
    const severity: Severity = mode.defaultSeverity;
    // Draw both timestamps (same order/draws as before), then order them so
    // firstSeenAt is never newer than lastSeenAt — the two independent ranges
    // could previously invert.
    const seenA = Date.parse(
      isoAgo(r, isCosmetic ? 60 : 30, 60 * 24 * (isCosmetic ? 5 : 3)),
    );
    const seenB = NOW_MS - int(r, 5, 240) * 60_000;
    alerts.push({
      id: alertId,
      clientId: asset.clientId,
      assetId: asset.id,
      source,
      subjectRef: { kind: "asset", id: asset.id, label: asset.displayName },
      severity,
      category: mode.category,
      title: alertTitle(mode, asset),
      rawError: rawErrorFor(mode, r),
      failureModeId: mode.id,
      state: "open",
      isCosmetic,
      firstSeenAt: new Date(Math.min(seenA, seenB)).toISOString(),
      lastSeenAt: new Date(Math.max(seenA, seenB)).toISOString(),
      occurrenceCount: int(r, 1, status === "failed" ? 9 : 4),
    });
    asset.openAlertIds = [...asset.openAlertIds, alertId];
    injectedByMode.get(mode.id)!.push(asset.id);
    return asset.id;
  }

  // Pass 1 — coverage: every mode gets exactly one instance (guarantees that
  // each FailureCategory + fix-type is represented + every action has a target).
  for (const mode of modes) placeOne(mode);

  // Pass 2 — frequency-weighted extras, until the healthy budget is nearly spent.
  // Keeps the fleet "mostly healthy" (docs/06 §9.3) by leaving a protected core.
  const minHealthyFloor = Math.floor(assets.length * 0.45);
  for (const mode of modes) {
    const extra = injectionCount(r, mode.frequency) - 1;
    for (let n = 0; n < extra; n += 1) {
      if (assets.filter(isHealthy).length <= minHealthyFloor) break;
      if (placeOne(mode) === null) break;
    }
  }

  return { alerts, injectedByMode };
}
