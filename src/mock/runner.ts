/**
 * @/mock/runner — the simulated action runner (docs/06 §11).
 *
 * Actions never touch a backend. `simulateRun(action, targets, scope, params)`
 * deterministically derives a `RunnerOutcome` from the action's `outcome` class +
 * a per-run PRNG draw, so demos are repeatable yet not all-success:
 *
 *   - self-heal     → mostly `succeeded`, ~10% `partial` (batch "7 of 9");
 *                     heals the asset toward protected + auto-resolves the alert.
 *   - opens-ticket  → `succeeded`, no heal, returns a DAT-TKT reference.
 *   - guidance-only → `succeeded` with a checklist summary, no mutation.
 *   - destructive / over-threshold → short-circuits to `awaiting-approval` with a
 *                     blastRadius preview (unless already approved).
 *   - dryRun        → preview only (blastRadius), no mutation, no audit outcome.
 *
 * Randomness comes from `rng("runner:<namespace>")` so a given (action, targets)
 * pair always produces the same outcome — deterministic-ish, fine for a mock.
 * The runner is PURE: it computes an outcome; it does not mutate the DB. Callers
 * (stores) apply the optimistic heal to their own copy.
 */

import type {
  RemediationAction,
  ActionScope,
  ActionRunState,
  EntityRef,
  AssetStatus,
} from "@/types";
import { rng, int, type Rng } from "./prng";
import { formatBytes } from "@/lib/format";
import { SUPPORT_TICKET_PREFIX } from "./pools";

/** Per-target result line. */
export interface RunnerTargetResult {
  ref: EntityRef;
  state: ActionRunState;
  note?: string;
}

/** The deterministic outcome of a simulated dispatch (docs/06 §11). */
export interface RunnerOutcome {
  state: ActionRunState;
  resultSummary: string;
  perTarget: RunnerTargetResult[];
  /** If true, callers should mutate targets back toward `protected` + resolve alert. */
  healsAsset: boolean;
  /** The status a healed asset should move to (usually `protected`, sometimes `syncing`). */
  healedStatus?: AssetStatus;
  /** For opens-ticket actions. */
  opensTicketRef?: string;
  /** For approval / dry-run flows: the blast-radius preview. */
  blastRadius?: { assetCount: number; preview: string };
  /** Whether this is a preview only (dry run). */
  preview?: boolean;
  /** Whether the outcome is gated on a pending approval. */
  awaitingApproval?: boolean;
}

export interface SimulateOptions {
  /** Treat as a dry run regardless of param (preview only). */
  dryRun?: boolean;
  /** Caller already cleared approval — skip the approval short-circuit. */
  approved?: boolean;
}

/** Build a stable per-run rng from the action + first target + scope. */
function runRng(actionId: string, targets: EntityRef[], scope: ActionScope): Rng {
  const key = `runner:${actionId}:${scope}:${targets.map((t) => t.id).join(",")}`;
  return rng(key);
}

/** Whether the action needs an approval short-circuit before running. */
function needsApproval(action: RemediationAction, targetCount: number): boolean {
  // An irreversible or destructive MUTATION always gates — you cannot undo it, so
  // a human must confirm, regardless of the action's declared requiresApproval /
  // threshold. (The catalog has self-heal actions that are reversible:false yet
  // requiresApproval:'never' — force-merge, unseal-encrypted-agent,
  // reset-sync-state full re-sync — which previously ran straight through.)
  // Ticket-opening / guidance-only actions make no change to the asset, so their
  // irreversibility is benign and is not gated here.
  const mutates = action.outcome === "self-heal";
  if (mutates && (!action.reversible || action.destructive)) return true;
  if (action.requiresApproval === "always") return true;
  if (action.requiresApproval === "over-threshold") return targetCount >= 5 || action.destructive;
  return false;
}

function blastRadiusPreview(action: RemediationAction, targetCount: number): string {
  return `${action.label} across ${targetCount} asset${targetCount === 1 ? "" : "s"}${
    action.destructive ? " (destructive — not reversible)" : ""
  }${action.reversible ? "" : action.destructive ? "" : " (irreversible)"}`;
}

/**
 * Simulate a single action dispatch. Pure + deterministic (given the same inputs).
 */
export function simulateRun(
  action: RemediationAction,
  targets: EntityRef[],
  scope: ActionScope,
  params: Record<string, unknown> = {},
  opts: SimulateOptions = {},
): RunnerOutcome {
  const r = runRng(action.id, targets, scope);
  const count = Math.max(1, targets.length);
  const isDry = Boolean(opts.dryRun || params.dryRun === true);

  // 1. Dry-run → preview only.
  if (isDry) {
    return {
      state: "skipped",
      preview: true,
      resultSummary: `Preview: ${blastRadiusPreview(action, count)}. No changes made.`,
      perTarget: targets.map((ref) => ({ ref, state: "skipped", note: "preview" })),
      healsAsset: false,
      blastRadius: { assetCount: count, preview: blastRadiusPreview(action, count) },
    };
  }

  // 2. Approval short-circuit (unless already approved).
  if (!opts.approved && needsApproval(action, count)) {
    return {
      state: "awaiting-approval",
      awaitingApproval: true,
      resultSummary: `Awaiting approval: ${blastRadiusPreview(action, count)}.`,
      perTarget: targets.map((ref) => ({ ref, state: "awaiting-approval" })),
      healsAsset: false,
      blastRadius: { assetCount: count, preview: blastRadiusPreview(action, count) },
    };
  }

  // 3. Outcome by class.
  switch (action.outcome) {
    case "opens-ticket": {
      const ticket = `${SUPPORT_TICKET_PREFIX}-${int(r, 80000, 89999)}`;
      return {
        state: "succeeded",
        opensTicketRef: ticket,
        resultSummary: `Assembled support package; opened ${ticket}. The affected ${
          count === 1 ? "asset stays" : "assets stay"
        } in the current state until Support responds.`,
        perTarget: targets.map((ref) => ({ ref, state: "succeeded", note: ticket })),
        healsAsset: false,
      };
    }

    case "guidance-only": {
      return {
        state: "succeeded",
        resultSummary: `${action.label}: checklist completed for ${count} target${
          count === 1 ? "" : "s"
        }. No changes were applied automatically.`,
        perTarget: targets.map((ref) => ({ ref, state: "succeeded", note: "checklist completed" })),
        healsAsset: false,
      };
    }

    case "self-heal":
    default: {
      // ~10% of batches come back partial to exercise partial-state UI.
      const partial = count > 1 && r() < 0.1;
      if (partial) {
        const stuck = int(r, 1, Math.max(1, Math.floor(count / 3)));
        const healed = count - stuck;
        const perTarget: RunnerTargetResult[] = targets.map((ref, i) => ({
          ref,
          state: i < healed ? "succeeded" : "failed",
          note: i < healed ? undefined : "still failing — escalate",
        }));
        return {
          state: "partial",
          resultSummary: healSummary(action, r, healed, count, true),
          perTarget,
          healsAsset: true,
          healedStatus: "protected",
        };
      }
      return {
        state: "succeeded",
        resultSummary: healSummary(action, r, count, count, false),
        perTarget: targets.map((ref) => ({ ref, state: "succeeded" })),
        healsAsset: true,
        healedStatus: action.actionType === "resume-sync" ? "syncing" : "protected",
      };
    }
  }
}

/** A mono-rich result summary for a self-heal outcome. */
function healSummary(
  action: RemediationAction,
  r: Rng,
  healed: number,
  total: number,
  partial: boolean,
): string {
  if (action.actionType === "force-retention") {
    const freed = formatBytes(Math.round(int(r, 4, 18) / 10 * 1024 ** 4));
    return `Freed ${freed}; retention applied to ${healed} of ${total} agents.`;
  }
  if (action.actionType === "force-merge") {
    return `Differential merge complete; chain rebuilt on ${healed} of ${total} agents.`;
  }
  if (action.actionType === "re-pair-auth" || action.actionType === "repair") {
    return partial
      ? `Re-paired ${healed} of ${total} agents — ${total - healed} still offline.`
      : `${action.label} succeeded on ${healed} of ${total} agents; next backup verified.`;
  }
  if (action.actionType === "reauthorize-oauth") {
    return `Consent re-granted for ${healed} of ${total} tenants; Exchange backups resumed.`;
  }
  if (action.actionType === "resume-sync") {
    return `Off-site sync resumed on ${healed} of ${total} appliances; backlog draining.`;
  }
  return partial
    ? `${action.label}: succeeded on ${healed} of ${total} targets — ${total - healed} need attention.`
    : `${action.label} succeeded on ${healed} of ${total} target${total === 1 ? "" : "s"}; verified.`;
}

// ── Chains ────────────────────────────────────────────────────────────────────

/** One resolved step in a chain (an action + its params). */
export interface ChainStepInput {
  action: RemediationAction;
  params?: Record<string, unknown>;
  runIf?: "always" | "prev-succeeded" | "prev-failed";
  haltOnFailure?: boolean;
  /** Per-step scope override; falls back to the chain `scope` when unset. */
  scope?: ActionScope;
}

/** The aggregate outcome of running a chain of steps over the same targets. */
export interface ChainOutcome {
  state: ActionRunState;
  steps: Array<{ actionId: string; outcome: RunnerOutcome; ran: boolean }>;
  resultSummary: string;
  healsAsset: boolean;
  healedStatus?: AssetStatus;
}

/** Did a step state count as a success for the runIf gate? */
function isSuccess(state: ActionRunState): boolean {
  return state === "succeeded" || state === "partial";
}

/**
 * Run a chain (saved playbook or ad-hoc cart) over a target set. Honors per-step
 * `runIf` gates + `haltOnFailure`. The chain heals if any self-heal step healed.
 */
export function runChain(
  steps: ChainStepInput[],
  targets: EntityRef[],
  scope: ActionScope,
  opts: SimulateOptions = {},
): ChainOutcome {
  const results: ChainOutcome["steps"] = [];
  let prevSuccess = true;
  let anyHeal = false;
  let healedStatus: AssetStatus | undefined;
  let halted = false;
  let awaiting = false;

  for (const step of steps) {
    const gate = step.runIf ?? "always";
    const shouldRun =
      halted || awaiting
        ? false
        : gate === "always" ||
          (gate === "prev-succeeded" && prevSuccess) ||
          (gate === "prev-failed" && !prevSuccess);

    if (!shouldRun) {
      results.push({
        actionId: step.action.id,
        ran: false,
        outcome: skippedOutcome(step.action, targets),
      });
      continue;
    }

    const outcome = simulateRun(
      step.action,
      targets,
      step.scope ?? scope,
      step.params ?? {},
      opts,
    );
    results.push({ actionId: step.action.id, ran: true, outcome });

    if (outcome.awaitingApproval) {
      awaiting = true;
    }
    prevSuccess = isSuccess(outcome.state);
    if (outcome.healsAsset) {
      anyHeal = true;
      healedStatus = outcome.healedStatus ?? healedStatus;
    }
    if (!prevSuccess && (step.haltOnFailure ?? false)) {
      halted = true;
    }
  }

  const ranSteps = results.filter((s) => s.ran);
  const failed = ranSteps.filter((s) => !isSuccess(s.outcome.state) && !s.outcome.awaitingApproval);
  const state: ActionRunState = awaiting
    ? "awaiting-approval"
    : failed.length === 0
      ? "succeeded"
      : failed.length === ranSteps.length
        ? "failed"
        : "partial";

  return {
    state,
    steps: results,
    healsAsset: anyHeal && state !== "failed",
    healedStatus,
    resultSummary: awaiting
      ? `Chain paused — a step needs approval before it can run.`
      : `Chain ${state}: ${ranSteps.length - failed.length} of ${ranSteps.length} steps succeeded across ${Math.max(
          1,
          targets.length,
        )} target${targets.length === 1 ? "" : "s"}.`,
  };
}

function skippedOutcome(action: RemediationAction, targets: EntityRef[]): RunnerOutcome {
  return {
    state: "skipped",
    resultSummary: `${action.label} skipped (run-if condition not met).`,
    perTarget: targets.map((ref) => ({ ref, state: "skipped" })),
    healsAsset: false,
  };
}
