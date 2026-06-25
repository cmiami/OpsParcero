import { describe, it, expect, beforeEach } from "vitest";
import {
  executeRemediation,
  resumeApprovedRun,
  recordApprovalRejected,
  createPolicyFromSpec,
  recordPolicyToggled,
  recordAgentRun,
  recordAlertTriage,
  healedAssetIds,
  buildActivityRecords,
} from "@/lib/activity-record";
import { useActivity } from "@/stores/activity";
import { useApprovals } from "@/stores/approvals";
import { usePolicies } from "@/stores/automation-policies";
import { simulateRun, type RunnerOutcome } from "@/mock/runner";
import { getIssues, getActionsForFailureMode } from "@/mock/query";
import type { EntityRef, RemediationAction } from "@/types";

// Deterministic seed fixtures — find a real (action, asset) combo for each shape
// rather than hard-coding ids, so the tests survive catalog reshuffles.
function findCombo(
  predicate: (r: RunnerOutcome) => boolean,
  pick: (a: RemediationAction) => boolean,
): { action: RemediationAction; assetId: string } {
  for (const issue of getIssues()) {
    if (!issue.failureModeId) continue;
    const assetId = issue.impactedAssetIds[0];
    if (!assetId) continue;
    for (const a of getActionsForFailureMode(issue.failureModeId)) {
      if (!pick(a)) continue;
      const r = simulateRun(a, [{ kind: "asset", id: assetId }], "once", {});
      if (predicate(r)) return { action: a, assetId };
    }
  }
  throw new Error("no matching combo in seed");
}

const heal = findCombo(
  (r) => !r.awaitingApproval && r.healsAsset && r.state === "succeeded",
  (a) => a.outcome === "self-heal" && !a.destructive && a.reversible,
);
const gated = findCombo((r) => r.awaitingApproval === true, () => true);

const ref = (id: string): EntityRef => ({ kind: "asset", id });

beforeEach(() => {
  useActivity.setState({
    runs: [],
    audit: [],
    assetOverrides: {},
    alertOverrides: {},
  });
  useApprovals.setState({ requests: [] });
  usePolicies.setState({ policies: [] });
});

describe("healedAssetIds", () => {
  it("returns only the succeeded asset targets (partial-safe)", () => {
    const outcome = {
      state: "partial",
      resultSummary: "",
      perTarget: [
        { ref: ref("a"), state: "succeeded" },
        { ref: ref("b"), state: "failed" },
        { ref: { kind: "alert", id: "x" }, state: "succeeded" },
      ],
      healsAsset: true,
    } as unknown as RunnerOutcome;
    expect(healedAssetIds(outcome)).toEqual(["a"]);
  });
});

describe("buildActivityRecords", () => {
  it("builds a run + audit with the full consumer contract", () => {
    const outcome: RunnerOutcome = {
      state: "succeeded",
      resultSummary: "ok",
      perTarget: [{ ref: ref("a"), state: "succeeded" }],
      healsAsset: true,
    };
    const { run, audit } = buildActivityRecords({
      actionId: heal.action.id,
      actionLabel: heal.action.label,
      targets: [ref("a")],
      scope: "once",
      outcome,
    });
    expect(run.triggeredBy.kind).toBe("user");
    expect(run.targetRefs).toHaveLength(1);
    expect(run.scope).toBe("once");
    expect(audit.verb).toBe("ran-action");
    expect(audit.subjectRef.id).toBe("a");
  });
});

describe("executeRemediation — action", () => {
  it("records a run and heals on a non-gated apply", () => {
    const r = executeRemediation({
      kind: "action",
      action: heal.action,
      targets: [ref(heal.assetId)],
      scope: "once",
    });
    expect(r.awaitingApproval).toBe(false);
    expect(r.healed).toContain(heal.assetId);
    expect(useActivity.getState().runs.length).toBe(1);
    expect(useActivity.getState().assetOverrides[heal.assetId]).toBeDefined();
  });

  it("enqueues a resumable approval (recording nothing) on a gated apply", () => {
    const r = executeRemediation({
      kind: "action",
      action: gated.action,
      targets: [ref(gated.assetId)],
      scope: "once",
    });
    expect(r.awaitingApproval).toBe(true);
    expect(useActivity.getState().runs.length).toBe(0);
    const req = useApprovals.getState().requests[0];
    expect(req?.payload?.kind).toBe("action");
  });

  it("carries the policy spec onto a gated payload (#6)", () => {
    executeRemediation({
      kind: "action",
      action: gated.action,
      targets: [ref(gated.assetId)],
      scope: "always",
      policy: { category: "Storage/ZFS", actionId: gated.action.id },
    });
    const payload = useApprovals.getState().requests[0]?.payload;
    expect(payload?.policy?.actionId).toBe(gated.action.id);
  });
});

describe("executeRemediation — chain", () => {
  it("records a run per step that ran", () => {
    const r = executeRemediation({
      kind: "chain",
      steps: [
        { action: heal.action, scope: "once" },
        { action: heal.action, scope: "once" },
      ],
      targets: [ref(heal.assetId)],
      scope: "once",
    });
    expect(r.awaitingApproval).toBe(false);
    expect(useActivity.getState().runs.length).toBeGreaterThan(0);
  });
});

describe("resumeApprovedRun", () => {
  it("runs + heals the held action on approval", () => {
    resumeApprovedRun({
      kind: "action",
      actionId: heal.action.id,
      targetRefs: [ref(heal.assetId)],
      scope: "once",
      params: {},
    });
    expect(useActivity.getState().runs.length).toBe(1);
    expect(useActivity.getState().assetOverrides[heal.assetId]).toBeDefined();
  });

  it("creates the standing policy a gated 'always' deferred (#6)", () => {
    resumeApprovedRun({
      kind: "action",
      actionId: heal.action.id,
      targetRefs: [ref(heal.assetId)],
      scope: "always",
      params: {},
      policy: { category: "Storage/ZFS", actionId: heal.action.id },
    });
    expect(usePolicies.getState().policies.length).toBe(1);
    expect(
      useActivity.getState().audit.some((a) => a.verb === "enabled-policy"),
    ).toBe(true);
  });
});

describe("audit-only records", () => {
  it("recordApprovalRejected audits a refusal and runs nothing", () => {
    recordApprovalRejected(
      {
        kind: "action",
        actionId: heal.action.id,
        targetRefs: [ref(heal.assetId)],
        scope: "once",
        params: {},
      },
      "not now",
    );
    expect(useActivity.getState().runs.length).toBe(0);
    expect(
      useActivity.getState().audit.some((a) => a.verb === "rejected"),
    ).toBe(true);
  });

  it("createPolicyFromSpec adds a paused policy + audits it", () => {
    const p = createPolicyFromSpec({
      category: "Storage/ZFS",
      actionId: heal.action.id,
    });
    expect(p.enabled).toBe(false);
    expect(usePolicies.getState().policies).toHaveLength(1);
    expect(
      useActivity.getState().audit.some((a) => a.verb === "enabled-policy"),
    ).toBe(true);
  });

  it("recordPolicyToggled audits enable vs pause with distinct verbs (#16)", () => {
    recordPolicyToggled({ policyId: "pol-1", policyName: "P", enabled: true });
    recordPolicyToggled({ policyId: "pol-1", policyName: "P", enabled: false });
    const verbs = useActivity.getState().audit.map((a) => a.verb);
    expect(verbs).toContain("enabled-policy");
    expect(verbs).toContain("disabled-policy");
  });

  it("recordAgentRun records a single-asset terminal run", () => {
    recordAgentRun({
      assetId: heal.assetId,
      actionLabel: "AI fix",
      scope: "once",
      state: "succeeded",
      summary: "done",
      heal: { status: "protected" },
    });
    expect(useActivity.getState().runs.length).toBe(1);
    expect(useActivity.getState().assetOverrides[heal.assetId]).toBeDefined();
  });

  it("recordAlertTriage resolves an alert and audits it", () => {
    recordAlertTriage({
      alertId: "alr-1",
      alertTitle: "noisy",
      assetId: heal.assetId,
      verb: "resolved",
    });
    expect(useActivity.getState().alertOverrides["alr-1"]).toBeDefined();
    expect(
      useActivity.getState().audit.some((a) => a.verb === "suppressed-alert"),
    ).toBe(true);
  });
});
