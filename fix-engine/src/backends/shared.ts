/**
 * Internal helpers shared by the five simulated ExecutionBackends.
 *
 * Determinism: every draw comes from rng(seed) (mulberry32 off the app SEED) —
 * NO Math.random / Date.now. A backend seeds its stream with a stable string
 * built from (kind, target.id, script.lang, script-shape) so identical inputs
 * always yield byte-identical output.
 *
 * Effect inference: backends are dumb simulators — they don't know the tool. We
 * recover the *intended effect* by scanning the real ScriptArtifact.source for
 * the cmdlet/endpoint signatures the spec mandates (vssadmin, ResetVirtualMachineCBT,
 * adminconsent, …) and synthesise a believable before/after StateDiff for the
 * targeted facet. The tool/loop owns the actual heal of the shared DB.
 */
import { rng, type Rng } from "@/mock/prng";
import type {
  ProtectedAsset,
  AgentAsset,
  AgentlessAsset,
  SaasSeatAsset,
  SalesforceOrgAsset,
} from "@/types";
import type {
  ExecutionBackend,
  ScriptArtifact,
  ExecResult,
  StateDiff,
} from "../tools/types";

/** Narrowing alias — the backends implement the canonical interface verbatim. */
export type Backend = ExecutionBackend;

/** Seed a deterministic stream for one simulated execution. */
export function draw(seed: string): Rng {
  return rng(seed);
}

/** estDurationSec ± 20% jitter, in ms (07 §8.2), drawn deterministically. */
export function jitterMs(r: Rng, baseMs: number): number {
  const factor = 0.8 + r() * 0.4; // [0.8, 1.2)
  return Math.round(baseMs * factor);
}

/** A canonical no-op idempotent success (re-run against a healthy facet). */
export function noop(stdout: string, durationMs: number): ExecResult {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
    durationMs,
    diff: { before: {}, after: {}, note: "already healthy — nothing to do" },
  };
}

/** A seeded failure outcome — facet unchanged, non-zero exit. */
export function failed(
  exitCode: number,
  stdout: string,
  stderr: string,
  durationMs: number,
  diff: StateDiff,
): ExecResult {
  return { exitCode, stdout, stderr, durationMs, diff };
}

/**
 * Dry-run result: exitCode 0, "[dry-run] no changes" stdout, and the SAME diff
 * as the real run but with a "dry-run — no mutation" note. Mutates nothing.
 */
export function dryRunResult(
  projected: StateDiff,
  stdout: string,
  durationMs: number,
): ExecResult {
  return {
    exitCode: 0,
    stdout: stdout.includes("[dry-run]") ? stdout : `[dry-run] no changes\n${stdout}`,
    stderr: "",
    durationMs,
    diff: { before: projected.before, after: projected.after, note: "dry-run — no mutation" },
  };
}

/** A short, stable label for the facet a script most likely touches. */
export function facetTag(target: ProtectedAsset): string {
  switch (target.kind) {
    case "agent":
      return "vssStatus/pairingStatus/backupChainState";
    case "agentless":
      return "cbtStatus/stalledSnapshots";
    case "endpoint":
      return "cbtFilterStatus/meteredPaused";
    case "saas-seat":
      return "authStatus";
    case "salesforce-org":
      return "authStatus/apiUsage";
    case "share":
      return "credentialStatus";
  }
}

export type EffectOp =
  | "reset-vss"
  | "repair-comms"
  | "restart-service"
  | "force-retention"
  | "force-merge"
  | "resume-sync"
  | "unseal"
  | "reload-driver"
  | "rebuild-initramfs"
  | "av-exclusions"
  | "reload-cbt-filter"
  | "set-throttle"
  | "reset-cbt"
  | "consolidate-snapshots"
  | "admin-consent"
  | "seat-rediscovery"
  | "raise-api-cap"
  | "reschedule-throttle"
  | "reset-sync-state"
  | "verify"
  | "generic";

export interface Effect {
  op: EffectOp;
  /** Base duration before jitter (ms), tuned per op class. */
  baseMs: number;
  /** Projected before/after for the targeted facet. */
  diff: StateDiff;
}

/** Source signatures → intended effect. Order matters (most specific first). */
const SIGNATURES: { op: EffectOp; re: RegExp }[] = [
  { op: "reset-vss", re: /vssadmin|VSS\b|Stop-Service\s+-Name\s+VSS/i },
  { op: "reload-cbt-filter", re: /fltmc|cbtfilter/i },
  { op: "av-exclusions", re: /Add-MpPreference|ExclusionPath|ExclusionProcess/i },
  { op: "rebuild-initramfs", re: /dracut|initramfs/i },
  { op: "reload-driver", re: /dattobd|modprobe/i },
  { op: "repair-comms", re: /repair|pair|401|Test-NetConnection|ss -tnp|dbdctl/i },
  { op: "force-retention", re: /retention|zfs list -t snapshot|reclaim/i },
  { op: "force-merge", re: /diff-merge|InverseChain|force[_-]?merge/i },
  { op: "resume-sync", re: /offsite|MercuryFTP|resume.*sync|transmit/i },
  { op: "unseal", re: /unseal|passphrase|sealed/i },
  { op: "set-throttle", re: /Throttle|Bandwidth|PauseWhileMetered/i },
  { op: "reset-cbt", re: /ResetVirtualMachineCBT|reset.*cbt/i },
  { op: "consolidate-snapshots", re: /ConsolidateVMDisks|consolidate/i },
  { op: "admin-consent", re: /adminconsent|adminConsent|oauth2PermissionGrants/i },
  { op: "seat-rediscovery", re: /RemoteSeatUpdate|seat.*rediscover|force_seat/i },
  { op: "raise-api-cap", re: /apiCap|api.*cap|services\/data\/v/i },
  { op: "reschedule-throttle", re: /Retry-After|schedule|throttle|backoff/i },
  { op: "reset-sync-state", re: /syncState|re-?seed|reset.*sync/i },
  { op: "restart-service", re: /Restart-Service|systemctl restart/i },
  { op: "verify", re: /\$top=1|expect 200|verify|messages\?\$top/i },
];

function inferOp(source: string): EffectOp {
  for (const s of SIGNATURES) if (s.re.test(source)) return s.op;
  return "generic";
}

const BASE_MS: Record<EffectOp, number> = {
  "reset-vss": 1180,
  "repair-comms": 2600,
  "restart-service": 1400,
  "force-retention": 9200,
  "force-merge": 1_500_000,
  "resume-sync": 4200,
  unseal: 3100,
  "reload-driver": 2200,
  "rebuild-initramfs": 38_000,
  "av-exclusions": 1700,
  "reload-cbt-filter": 2400,
  "set-throttle": 900,
  "reset-cbt": 5600,
  "consolidate-snapshots": 47_000,
  "admin-consent": 1200,
  "seat-rediscovery": 6400,
  "raise-api-cap": 1100,
  "reschedule-throttle": 800,
  "reset-sync-state": 21_000,
  verify: 700,
  generic: 1500,
};

/**
 * Synthesise the projected StateDiff for an op against a target's real facet
 * values. Backends return this on both run() and (un-mutated) dry-run.
 */
export function effectFor(script: ScriptArtifact, target: ProtectedAsset): Effect {
  const op = inferOp(script.source);
  const baseMs = BASE_MS[op];
  const diff = diffFor(op, target);
  return { op, baseMs, diff };
}

function diffFor(op: EffectOp, target: ProtectedAsset): StateDiff {
  const status = target.status;
  switch (op) {
    case "reset-vss": {
      const a = target as AgentAsset;
      return {
        before: { vssStatus: a.vssStatus ?? "writer-failed", status },
        after: { vssStatus: "healthy", status: "protected" },
        note: "VSS writers recovered; status failed → protected",
      };
    }
    case "repair-comms": {
      const a = target as AgentAsset;
      return {
        before: { pairingStatus: a.pairingStatus ?? "401-unauthorized", status },
        after: { pairingStatus: "paired", status: "protected" },
        note: "agent re-paired over 25568/3260/3262; 401 → paired",
      };
    }
    case "restart-service":
      return {
        before: { status },
        after: { status: status === "failed" ? "warning" : status },
        note: "Datto Backup Agent Service restarted",
      };
    case "force-retention":
      return {
        before: { poolCapacityPct: 92, status },
        after: { poolCapacityPct: 71, status: "protected" },
        note: "homePool 92% → 71%; backups un-skipped",
      };
    case "force-merge": {
      const a = target as AgentAsset;
      return {
        before: { backupChainState: a.backupChainState ?? "needs-diff-merge", status },
        after: { backupChainState: "ok", status: "protected" },
        note: "ZFS Inverse Chain diff-merge complete; chain ok (irreversible)",
      };
    }
    case "resume-sync":
      return {
        before: { offsiteSync: "behind", status },
        after: { offsiteSync: "current", status: "protected" },
        note: "offsite replication resumed; queue draining",
      };
    case "unseal": {
      const a = target as AgentAsset;
      return {
        before: { sealed: a.sealed ?? true, status },
        after: { sealed: false, status: "protected" },
        note: "encrypted agent unsealed",
      };
    }
    case "reload-driver":
      return {
        before: { driverStatus: "pending-reboot", status },
        after: { driverStatus: "loaded", status: "protected" },
        note: "dattobd kernel module re-armed; tracking active",
      };
    case "rebuild-initramfs":
      return {
        before: { initramfs: "missing-dattobd", status },
        after: { initramfs: "includes-dattobd", status: "warning" },
        note: "initramfs rebuilt with dattobd driver (irreversible — prior .img backed up)",
      };
    case "av-exclusions":
    case "reload-cbt-filter": {
      const e = target as { cbtFilterStatus?: string };
      return {
        before: { cbtFilterStatus: e.cbtFilterStatus ?? "needs-reinstall", status },
        after: { cbtFilterStatus: "healthy", status: "protected" },
        note: "AV exclusions applied; cbtfilter loaded and Running",
      };
    }
    case "set-throttle":
      return {
        before: { bandwidthThrottleKbps: 0, meteredPaused: true, status },
        after: { bandwidthThrottleKbps: 51200, meteredPaused: false, status: "protected" },
        note: "throttle 0 → 51200 Kbps; pause-while-metered cleared",
      };
    case "reset-cbt": {
      const a = target as AgentlessAsset;
      return {
        before: { cbtStatus: a.cbtStatus ?? "reset-required", status },
        after: { cbtStatus: "enabled", status: "protected" },
        note: "VM CBT disabled→enabled; full-then-incremental re-armed",
      };
    }
    case "consolidate-snapshots": {
      const a = target as AgentlessAsset;
      return {
        before: { stalledSnapshots: a.stalledSnapshots ?? 3, status },
        after: { stalledSnapshots: 0, status: "protected" },
        note: "stalled snapshots consolidated",
      };
    }
    case "admin-consent": {
      const a = target as SaasSeatAsset;
      return {
        before: { authStatus: a.authStatus ?? "consent-required", status },
        after: { authStatus: "authorized", status: "protected" },
        note: "Global Admin consent granted; Graph scopes authorized",
      };
    }
    case "seat-rediscovery":
      return {
        before: { archived: true, billedWhileArchived: true, status },
        after: { archived: false, billedWhileArchived: false, status: "protected" },
        note: "seat re-discovered (RemoteSeatUpdate); protection re-applied",
      };
    case "raise-api-cap": {
      const a = target as SalesforceOrgAsset;
      return {
        before: { apiCallCapPct: a.apiCallCapPct ?? 15, status },
        after: { apiCallCapPct: 50, status: "protected" },
        note: "Salesforce API cap 15% → 50%; backup window cleared",
      };
    }
    case "reschedule-throttle":
      return {
        before: { throttle: "429/503", status },
        after: { throttle: "low-window+backoff", status: "protected" },
        note: "rescheduled into low-throttle window; adaptive backoff on",
      };
    case "reset-sync-state": {
      const a = target as SaasSeatAsset;
      return {
        before: { authStatus: a.authStatus ?? "reauth-required", syncState: "invalid", status },
        after: { authStatus: "authorized", syncState: "re-seeded", status: "protected" },
        note: "sync state reset; full re-seed from source queued",
      };
    }
    case "verify":
      return { before: { status }, after: { status }, note: "read-only verification — no change" };
    default:
      return {
        before: { status },
        after: { status: status === "failed" ? "protected" : status },
        note: "remediation applied",
      };
  }
}
