/**
 * @/mock/generators/runs — steps 8–10 of the generation DAG.
 *
 * Two-tier run history (docs/06 §9.4, contract scale note):
 *   - EVERY asset gets ~10 embedded `recentRuns` (the dot-strip) that trend toward
 *     its current status — a healthy tail then 2–4 failed/amber for a failing
 *     asset, alternating for a flapper, all `skipped` for offline/paused.
 *   - ~30 "focus" assets additionally get a full BackupRun[] + RecoveryPoint[] +
 *     ScreenshotVerification[] history for the detail drill-down.
 *
 * Failures here are baseline texture; `inject-failures.ts` overlays the catalog
 * modes with verbatim error codes afterward. Deterministic — `runs` PRNG stream.
 */

import type {
  ProtectedAsset,
  BackupJob,
  BackupRun,
  BackupRunSummary,
  RecoveryPoint,
  ScreenshotVerification,
  RunState,
  AssetStatus,
  AssetId,
} from "@/types";
import { rng, pick, int, weighted, bytes, type Rng } from "../prng";
import { NOW_MS } from "../seed";

/** How many image-chain assets get full history (the deep drill-down). */
const FOCUS_COUNT = 30;
/** Deep-history sample size for non-BCDR kinds (endpoint, saas-seat, share, …). */
const PER_KIND_FOCUS = 14;
/** Recent-run strip length per asset. */
const STRIP_LEN = 10;

/** A run state with timing, for the embedded strip. */
function stripStateForStatus(r: Rng, status: AssetStatus, position: number, total: number): RunState {
  const isTail = position >= total - 4; // last 4 dots carry the current trend
  switch (status) {
    case "protected":
      return weighted(r, { success: 88, "success-crash-consistent": 10, skipped: 2 });
    case "warning":
      return isTail
        ? weighted(r, { success: 50, "success-crash-consistent": 30, skipped: 20 })
        : weighted(r, { success: 80, "success-crash-consistent": 18, skipped: 2 });
    case "failed":
      return isTail
        ? weighted(r, { failed: 70, "success-crash-consistent": 18, stuck: 12 })
        : weighted(r, { success: 70, "success-crash-consistent": 22, failed: 8 });
    case "syncing":
      return isTail
        ? weighted(r, { running: 55, success: 35, queued: 10 })
        : weighted(r, { success: 90, "success-crash-consistent": 10 });
    case "paused":
      return weighted(r, { skipped: 80, cancelled: 20 });
    case "offline":
      return isTail
        ? weighted(r, { skipped: 60, stuck: 30, failed: 10 })
        : weighted(r, { success: 60, skipped: 40 });
    default:
      return "success";
  }
}

/** Cadence → minutes between runs for the strip spacing. */
function cadenceStepMin(job: BackupJob | undefined): number {
  switch (job?.schedule.cadence) {
    case "continuous":
      return 60;
    case "hourly":
      return 60;
    case "weekly":
      return 60 * 24 * 7;
    case "daily":
    default:
      return 60 * 24;
  }
}

function isFailState(s: RunState): boolean {
  return s === "failed" || s === "stuck";
}

export interface RunsResult {
  /** Full history for focus assets only. */
  runs: BackupRun[];
  recoveryPoints: RecoveryPoint[];
  screenshotVerifications: ScreenshotVerification[];
  focusAssetIds: Set<AssetId>;
}

/**
 * Mutates each asset's `recentRuns` in place and returns the deep history for the
 * focus set. Assets are passed by reference (the strip is part of the asset).
 */
export function generateRuns(
  assets: ProtectedAsset[],
  jobs: BackupJob[],
): RunsResult {
  const r = rng("runs");
  const jobByAsset = new Map<string, BackupJob>();
  for (const j of jobs) jobByAsset.set(j.assetId, j);

  const runs: BackupRun[] = [];
  const recoveryPoints: RecoveryPoint[] = [];
  const screenshotVerifications: ScreenshotVerification[] = [];

  // Focus set: a representative sample of EVERY asset kind gets full deep history
  // + recovery points (not just BCDR image-chain), so every product surface has
  // restore-point coverage to drill into (SaaS seats → saas-set points, endpoint
  // / share → image-chain). Within each kind, bias toward non-protected assets so
  // the drill-down has substance.
  const byKind = new Map<string, ProtectedAsset[]>();
  for (const a of assets) {
    const list = byKind.get(a.kind);
    if (list) list.push(a);
    else byKind.set(a.kind, [a]);
  }
  const focusAssetIds = new Set<AssetId>();
  for (const [kind, list] of byKind) {
    const ranked = list
      .map((a, i) => ({ a, key: (a.status === "protected" ? 1 : 0) + i / 10000 }))
      .sort((x, y) => x.key - y.key)
      .map((x) => x.a);
    // BCDR machine kinds keep the larger share; everything else gets a solid sample.
    const take =
      kind === "agent" || kind === "agentless"
        ? FOCUS_COUNT
        : Math.min(list.length, PER_KIND_FOCUS);
    for (const a of ranked.slice(0, take)) focusAssetIds.add(a.id);
  }

  for (const asset of assets) {
    const job = jobByAsset.get(asset.id);
    const stepMin = cadenceStepMin(job);
    const strip: BackupRunSummary[] = [];

    // Build oldest → newest; the asset's last lastGoodBackupAt anchors the newest.
    for (let p = 0; p < STRIP_LEN; p += 1) {
      const minutesAgo = (STRIP_LEN - 1 - p) * stepMin + int(r, 0, stepMin / 4);
      const at = new Date(NOW_MS - minutesAgo * 60_000).toISOString();
      const state = stripStateForStatus(r, asset.status, p, STRIP_LEN);
      const runId = `RUN-${asset.id.slice(-6)}-${String(p).padStart(2, "0")}`;
      // Warning assets carry cosmetic-flavored failures sometimes.
      const isCosmetic =
        asset.status === "warning" && isFailState(state) && r() < 0.45;
      strip.push({ runId, state, at, isCosmetic });
    }
    asset.recentRuns = strip;

    if (!focusAssetIds.has(asset.id)) continue;

    // Deep history: ~15 runs, each successful one mints a recovery point; image
    // points get a screenshot verification.
    const total = 15;
    for (let p = 0; p < total; p += 1) {
      const minutesAgo = (total - 1 - p) * stepMin + int(r, 0, stepMin / 4);
      const startedMs = NOW_MS - minutesAgo * 60_000;
      const state: RunState =
        p < total - STRIP_LEN
          ? weighted(r, { success: 85, "success-crash-consistent": 12, failed: 3 })
          : stripStateForStatus(r, asset.status, p - (total - STRIP_LEN), STRIP_LEN);
      const durationSec = int(r, 90, 1800);
      const success = state === "success" || state === "success-crash-consistent";
      const runId = `RUN-${asset.id.slice(-6)}-H${String(p).padStart(2, "0")}`;
      const rpId = `RP-${asset.id.slice(-6)}-${String(p).padStart(2, "0")}`;

      const run: BackupRun = {
        id: runId,
        jobId: job?.id ?? `JOB-${asset.id}`,
        assetId: asset.id,
        startedAt: new Date(startedMs).toISOString(),
        // Never finish in the future relative to the frozen NOW (a recent run
        // with a long duration could otherwise overshoot).
        finishedAt: new Date(
          Math.min(startedMs + durationSec * 1000, NOW_MS),
        ).toISOString(),
        state,
        mode: weighted(r, { incremental: 80, full: 8, "differential-merge": 12 }),
        consistency: state === "success-crash-consistent" ? "crash-consistent-dbd" : "application",
        bytesTransferred: success ? bytes(int(r, 1, 80) / 10) : 0,
        recoveryPointId: success ? rpId : undefined,
      };
      runs.push(run);

      if (success) {
        const verifId = `SSV-${asset.id.slice(-6)}-${String(p).padStart(2, "0")}`;
        const rp: RecoveryPoint = {
          id: rpId,
          assetId: asset.id,
          takenAt: run.finishedAt!,
          pointKind:
            asset.kind === "saas-seat" || asset.kind === "salesforce-org"
              ? "saas-set"
              : "image-chain",
          bootable: true,
          chainState: "ok",
          localStored: true,
          cloudStored: r() < 0.85,
          locked: false,
        };

        // Newer image points get a screenshot verification.
        if (p >= total - 8) {
          const outcome: ScreenshotVerification["outcome"] = weighted(r, {
            passed: 82,
            failed: 14,
            "not-run": 4,
          });
          const classification: ScreenshotVerification["classification"] =
            outcome === "passed"
              ? "verified"
              : outcome === "failed"
                ? weighted(r, {
                    "cosmetic-failure": 60,
                    "real-boot-failure": 30,
                    indeterminate: 10,
                  })
                : "indeterminate";
          const verif: ScreenshotVerification = {
            id: verifId,
            recoveryPointId: rpId,
            ranAt: run.finishedAt!,
            outcome,
            imageUrl: "/mock/screenshots/win-login.png",
            classification,
            signal:
              classification === "cosmetic-failure"
                ? pick(r, ["Getting Devices Ready", "Blank image or image of Windows loading"])
                : classification === "real-boot-failure"
                  ? pick(r, ["0x7B INACCESSIBLE_BOOT_DEVICE", "BOOTMGR is missing"])
                  : undefined,
            waitTimeSec: int(r, 60, 600),
          };
          rp.verification = {
            outcome,
            classification,
            signal: verif.signal,
            ranAt: verif.ranAt,
          };
          screenshotVerifications.push(verif);
        }
        recoveryPoints.push(rp);
      }
    }
  }

  return { runs, recoveryPoints, screenshotVerifications, focusAssetIds };
}
