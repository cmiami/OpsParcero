/**
 * @/mock/issues — the Issue view builder (docs/00 §3).
 *
 * `buildIssues(DB)` collapses open, non-cosmetic-dominated Alerts that share a
 * FailureMode into the product-model Issue: one fixable thing carrying a fix
 * classification (via `fixTypeForMode`), a plain-language problem statement, a
 * We/You runbook (automated "We" steps vs manual "You" steps derived from the
 * mode's actions), and a purple AI insight. The Resolution Center home groups the
 * resulting issues by FailureCategory.
 *
 * Pure + deterministic — derived entirely from the cached `DB` + reference data.
 */

import type {
  Issue,
  IssueRunbook,
  RunbookStep,
  AiInsight,
  Alert,
  FailureMode,
  FailureCategory,
  FixType,
  ProductBucket,
  AssetId,
  RemediationAction,
} from "@/types";
import { productTypeToBucket } from "@/types";
import type { MockDB } from "./generators/db";
import { FAILURE_MODE_BY_ID, fixTypeForMode } from "./reference/failure-modes";
import { ACTION_BY_ID } from "./reference/action-catalog";

/** Resolve a mode's ordered actions (primary-first), dropping any unknown ids. */
function resolveActions(mode: FailureMode): RemediationAction[] {
  return mode.remediationActionIds
    .map((id) => ACTION_BY_ID[id])
    .filter((a): a is RemediationAction => Boolean(a));
}

/**
 * Split a mode's actions into We (automated self-heal) vs You (manual guidance /
 * external) runbook steps. Self-heal → "We"; guidance/opens-ticket → "You".
 */
function buildRunbook(mode: FailureMode, actions: RemediationAction[]): IssueRunbook {
  const weSteps: RunbookStep[] = [];
  const youSteps: RunbookStep[] = [];

  for (const action of actions) {
    if (action.outcome === "self-heal") {
      weSteps.push({
        actor: "we",
        text: weText(action),
        actionId: action.id,
      });
    } else if (action.outcome === "opens-ticket") {
      youSteps.push({
        actor: "you",
        text: `Review and submit: ${action.label}. We pre-fill the support package; you confirm and send.`,
        actionId: action.id,
      });
    } else {
      // guidance-only
      youSteps.push({
        actor: "you",
        text: `${action.label} — follow the guided checklist on the affected device.`,
        actionId: action.id,
      });
    }
  }

  // Make sure every issue has at least one You step (the human owns confirmation).
  if (youSteps.length === 0) {
    youSteps.push({
      actor: "you",
      text: "Confirm the next backup succeeds, then close the issue.",
    });
  }

  return { weSteps, youSteps, stepsAuto: weSteps.length };
}

/** Verb-forward "We" step copy for a self-heal action. */
function weText(action: RemediationAction): string {
  switch (action.actionType) {
    case "restart-service":
      return `Restart the affected service (${action.label}).`;
    case "repair":
      return `${action.label} — applied automatically across matching assets.`;
    case "re-pair-auth":
      return `Re-establish the secure pairing (${action.label}).`;
    case "reauthorize-oauth":
      return `Launch and complete the consent flow (${action.label}).`;
    case "force-merge":
      return "Run a differential merge to rebuild the chain.";
    case "force-retention":
      return `${action.label} to reclaim storage.`;
    case "resume-sync":
      return "Resume off-site sync and clear the backlog.";
    case "throttle-adjust":
      return `${action.label} to a safe non-zero rate.`;
    case "run-now":
      return `${action.label} and verify the result.`;
    default:
      return action.label;
  }
}

/** Plain-language problem statement for an issue. */
function problemFor(mode: FailureMode, count: number, assetCount: number): string {
  const scope =
    assetCount > 1 ? `${assetCount} assets are` : "An asset is";
  return `${scope} affected: ${mode.title.split(/[—(]/)[0].trim().toLowerCase()}. Seen ${count} time${count > 1 ? "s" : ""} in the current window.`;
}

/** A confidence percentage derived deterministically from the mode + count. */
function confidenceFor(mode: FailureMode, fixType: FixType, count: number): number {
  let base =
    fixType === "full" ? 90 : fixType === "partial" ? 78 : fixType === "external" ? 64 : 52;
  if (mode.frequency === "very-common") base += 4;
  if (mode.frequency === "rare") base -= 6;
  if (mode.cosmeticByDefault) base += 3;
  // Nudge by occurrence so the number isn't static, clamp to a believable band.
  base += Math.min(6, Math.floor(count / 2));
  return Math.max(40, Math.min(98, base));
}

/** AI insight: root cause + recommendation + confidence. */
function aiInsightFor(
  mode: FailureMode,
  fixType: FixType,
  actions: RemediationAction[],
  count: number,
): AiInsight {
  const primary = actions[0];
  const recommendation =
    fixType === "full"
      ? `Run ${primary?.label ?? "the recommended fix"} now — this resolves the issue end-to-end with no manual steps.`
      : fixType === "partial"
        ? `Run the automated steps, then complete the short on-device checklist to close the loop.`
        : fixType === "external"
          ? `We can assemble a pre-filled support package; a human confirms and submits it.`
          : `Open the guided runbook — this one needs hands-on steps we can't safely automate.`;
  return {
    rootCause: mode.description,
    recommendation,
    confidencePct: confidenceFor(mode, fixType, count),
    classificationRationale:
      fixType === "full"
        ? "Every offered remediation self-heals and the mode is self-serviceable."
        : fixType === "partial"
          ? "The remediation mixes automated self-heal steps with manual confirmation."
          : fixType === "external"
            ? "The path assists a support ticket rather than auto-fixing."
            : fixType === "manual"
              ? "Resolution is hands-on guidance only."
              : "No automatable remediation is mapped yet.",
  };
}

/** Severity rank for ordering issues worst-first. */
function severityRank(a: Alert["severity"]): number {
  return a === "critical" ? 0 : a === "warning" ? 1 : a === "info" ? 2 : 3;
}

/**
 * Build the Issue list from the DB. Groups OPEN alerts (acknowledged included;
 * resolved / auto-resolved excluded) by failureModeId.
 */
export function buildIssues(db: MockDB): Issue[] {
  const openAlerts = db.alerts.filter(
    (a) => a.state === "open" || a.state === "acknowledged" || a.state === "suppressed",
  );

  const byMode = new Map<string, Alert[]>();
  for (const alert of openAlerts) {
    if (!alert.failureModeId) continue;
    const arr = byMode.get(alert.failureModeId);
    if (arr) arr.push(alert);
    else byMode.set(alert.failureModeId, [alert]);
  }

  const issues: Issue[] = [];

  for (const [modeId, alerts] of byMode) {
    const mode = FAILURE_MODE_BY_ID[modeId];
    if (!mode) continue;

    const actions = resolveActions(mode);
    const fixType = fixTypeForMode(mode, actions);
    const bucket: ProductBucket = productTypeToBucket(mode.productType);

    const impactedAssetIds = Array.from(
      new Set(alerts.map((a) => a.assetId).filter(Boolean)),
    ) as AssetId[];
    const occurrenceCount = alerts.reduce((sum, a) => sum + a.occurrenceCount, 0);

    // Severity = worst among grouped alerts.
    const severity = alerts
      .map((a) => a.severity)
      .sort((x, y) => severityRank(x) - severityRank(y))[0];

    const firstSeenAt = alerts
      .map((a) => a.firstSeenAt)
      .sort()[0];
    const lastSeenAt = alerts
      .map((a) => a.lastSeenAt)
      .sort()
      .slice(-1)[0];

    const incidentId = alerts.find((a) => a.incidentId)?.incidentId;
    const isCosmetic = alerts.every((a) => a.isCosmetic);

    issues.push({
      id: `ISS-${modeId}`,
      title: mode.title.split(/[—(]/)[0].trim(),
      detail: mode.title,
      productBucket: bucket,
      category: mode.category,
      severity,
      fixType,
      occurrenceCount,
      impactedAssetIds,
      problem: problemFor(mode, occurrenceCount, impactedAssetIds.length),
      runbook: buildRunbook(mode, actions),
      aiInsight: aiInsightFor(mode, fixType, actions, occurrenceCount),
      failureModeId: modeId,
      alertIds: alerts.map((a) => a.id),
      incidentId,
      isCosmetic,
      firstSeenAt,
      lastSeenAt,
    });
  }

  // Worst-first: critical before warning, then by occurrence count.
  issues.sort((a, b) => {
    const s = severityRank(a.severity) - severityRank(b.severity);
    if (s !== 0) return s;
    return b.occurrenceCount - a.occurrenceCount;
  });

  return issues;
}

/** A category bucket for the Resolution Center home. */
export interface IssueCategoryGroup {
  category: FailureCategory;
  issues: Issue[];
  /** Roll-ups for the category header. */
  totalIssues: number;
  totalOccurrences: number;
  endToEndFixable: number;
  criticalCount: number;
}

/** Group issues by FailureCategory, worst category first. */
export function groupIssuesByCategory(issues: Issue[]): IssueCategoryGroup[] {
  const byCat = new Map<FailureCategory, Issue[]>();
  for (const issue of issues) {
    const arr = byCat.get(issue.category);
    if (arr) arr.push(issue);
    else byCat.set(issue.category, [issue]);
  }

  const groups: IssueCategoryGroup[] = [];
  for (const [category, catIssues] of byCat) {
    groups.push({
      category,
      issues: catIssues,
      totalIssues: catIssues.length,
      totalOccurrences: catIssues.reduce((s, i) => s + i.occurrenceCount, 0),
      endToEndFixable: catIssues.filter((i) => i.fixType === "full").length,
      criticalCount: catIssues.filter((i) => i.severity === "critical").length,
    });
  }

  groups.sort((a, b) => {
    if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
    return b.totalOccurrences - a.totalOccurrences;
  });

  return groups;
}
