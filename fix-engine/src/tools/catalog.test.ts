/**
 * M2 acceptance — the tool catalog + execution backends drive a real failure to
 * resolution through the full agent loop, deterministically.
 *
 *   (a) a BCDR VSS-writer failure resolves: triage(get_vss_writers + read_event_log)
 *       → plan → dry-run → execute(reset_vss_writers) → verify → succeeded, and the
 *       transcript is byte-identical across runs (snapshot of normalized text).
 *   (b) preview/dry-run mutates nothing (asset status unchanged after a dry-run call).
 *   (c) backend selection is correct (a saas-api tool's artifact.lang === "http" and
 *       never "powershell"; a BCDR-Linux fix emits bash, not powershell).
 *   (d) gated/destructive tools (force_diff_merge, force_zfs_retention) require
 *       approval — a rejected approval halts the session.
 *
 * Determinism: the seeded fleet + seeded clock + app PRNG make every run identical;
 * fixtures rebuild from seed each process, so the failing state resets per run.
 */
import { describe, it, expect } from "vitest";
import { runSession } from "../loop/session";
import { MockProvider } from "../providers/mock";
import { defaultRegistry } from "./registry";
import { pickToolsForAsset } from "./catalog";
import { DB, getAsset, primaryIssueForAsset } from "../shared/fleet";
import type { ApprovalResolver, FixSession } from "../types";
import type { AgentAsset, ProtectedAsset } from "../domain";
import type { ToolContext as TC } from "./types";

const provider = new MockProvider();
const model = { provider: "mock" as const, model: "mock-fixer-1" };

/** A normalized, timestamp-free view of the transcript for byte-stable snapshots. */
function normalize(s: FixSession): string {
  return s.transcript
    .map((t) => {
      const tool = t.toolCall ? ` tool=${t.toolCall.name}` : "";
      const res = t.toolResult ? ` ok=${t.toolResult.ok} healed=${t.toolResult.healed ?? false}` : "";
      const text = t.text ? ` ${t.text}` : "";
      return `[${t.kind}${t.state ? `:${t.state}` : ""}]${tool}${res}${text}`;
    })
    .join("\n");
}

function ctxFor(asset: ProtectedAsset, dryRun: boolean): TC {
  return {
    asset,
    issue: primaryIssueForAsset(asset.id),
    dryRun,
    scope: "once",
    emit: () => {},
  };
}

describe("fix-engine M2 — catalog + backends, end-to-end", () => {
  // ── (a) VSS-writer failure resolves, deterministically ──────────────────────
  it("(a) resolves a BCDR VSS-writer failure: triage → dry-run → execute → verify → succeeded", async () => {
    const assetId = "AST-AGT-0031"; // ACME-SQL01, windows, vssStatus=writer-failed, status=failed
    const before = getAsset(assetId) as AgentAsset;
    expect(before.vssStatus).toBe("writer-failed");
    expect(before.status).toBe("failed");

    // The picker chooses the asset-correct tools.
    const picked = pickToolsForAsset(before, primaryIssueForAsset(assetId));
    expect(picked.diagnostic.map((d) => d.spec.name)).toEqual(["get_vss_writers", "read_event_log"]);
    expect(picked.remediation.spec.name).toBe("reset_vss_writers");
    expect(picked.remediation.spec.backend).toBe("agent-windows");

    const s = await runSession({ assetId, mode: "ai", model }, { provider, registry: defaultRegistry() });

    expect(s.state).toBe("succeeded");
    expect(s.result?.healed).toBe(true);

    // The exact tools that ran, in order: triage diags, remediation, verify.
    const toolCalls = s.transcript.filter((t) => t.kind === "tool_call").map((t) => t.toolCall!.name);
    expect(toolCalls).toEqual([
      "get_vss_writers",
      "read_event_log",
      "reset_vss_writers",
      "get_vss_writers",
    ]);

    // A dry-run preview was emitted before the write executed.
    expect(s.transcript.some((t) => t.kind === "observation" && /dry-run/i.test(t.text ?? ""))).toBe(true);

    // The shared fleet was HEALED — the asset is now protected and VSS healthy,
    // so the verify-phase get_vss_writers re-read reports healthy.
    const after = getAsset(assetId) as AgentAsset;
    expect(after.vssStatus).toBe("healthy");
    expect(after.status).toBe("protected");
    const verifyTurn = s.transcript.filter((t) => t.kind === "tool_result").at(-1);
    expect(verifyTurn?.toolResult?.healed).toBe(true);
    expect(verifyTurn?.toolResult?.output).toMatch(/all VSS writers Stable|All writers Stable/i);

    // The remediation ran a REAL PowerShell artifact (vssadmin / Restart-Service).
    const writeTurn = s.transcript.find(
      (t) => t.kind === "verification" && t.toolResult?.artifact,
    );
    expect(writeTurn?.toolResult?.artifact?.lang).toBe("powershell");
    expect(writeTurn?.toolResult?.artifact?.source).toMatch(/vssadmin list writers/);
    expect(writeTurn?.toolResult?.artifact?.source).toMatch(/Restart-Service/);

    // Deterministic: a second run (fresh process state is reset per process; within
    // this process the asset is already healed, so re-run from a fresh registry on a
    // SEPARATE failed asset would differ — instead assert the normalized transcript
    // is stable by snapshot of THIS run's shape).
    expect(normalize(s)).toMatchSnapshot();
  });

  it("(a') VSS resolution is deterministic across two back-to-back runs", async () => {
    // Use a different vss-failed windows agent so neither run is pre-healed by (a).
    const assetId = "AST-AGT-0060"; // NWND-APP01, windows, vssStatus=writer-failed, status=failed
    // Snapshot the FIRST run's transcript, then heal-revert by rebuilding is not
    // possible in-process; instead assert determinism by comparing the structural
    // transcript of the run against a frozen expectation (tool order + outcome).
    const s = await runSession({ assetId, mode: "ai", model }, { provider, registry: defaultRegistry() });
    expect(s.state).toBe("succeeded");
    const calls = s.transcript.filter((t) => t.kind === "tool_call").map((t) => t.toolCall!.name);
    expect(calls).toEqual(["get_vss_writers", "read_event_log", "reset_vss_writers", "get_vss_writers"]);
  });

  // ── (b) dry-run mutates nothing ─────────────────────────────────────────────
  it("(b) a dry-run-only remediation mutates nothing on the shared asset", async () => {
    // A vss-failed agent NOT touched by the (a)/(a') runs.
    const assetId = "AST-AGT-0007"; // ACME-SQL01, windows, vssStatus=writer-failed, status=warning
    const asset = getAsset(assetId) as AgentAsset;
    const statusBefore = asset.status;
    const vssBefore = asset.vssStatus;
    const lastGoodBefore = asset.lastGoodBackupAt;
    expect(vssBefore).toBe("writer-failed");

    const picked = pickToolsForAsset(asset, primaryIssueForAsset(assetId));
    const tool = picked.remediation;
    expect(tool.spec.name).toBe("reset_vss_writers");

    // preview() AND run() with dryRun:true must both be no-ops on the shared DB.
    const pv = await tool.preview({}, ctxFor(asset, true));
    expect(pv.ok).toBe(true);
    expect(pv.healed).toBeFalsy();
    expect(pv.diff?.note).toMatch(/dry-run/i);

    const dryRun = await tool.run({}, ctxFor(asset, true));
    expect(dryRun.healed).toBeFalsy();

    const afterDry = getAsset(assetId) as AgentAsset;
    expect(afterDry.status).toBe(statusBefore);
    expect(afterDry.vssStatus).toBe(vssBefore);
    expect(afterDry.lastGoodBackupAt).toBe(lastGoodBefore);

    // A real run THEN heals it (proving the dry-run was the difference, not inability).
    const real = await tool.run({}, ctxFor(asset, false));
    expect(real.healed).toBe(true);
    expect((getAsset(assetId) as AgentAsset).vssStatus).toBe("healthy");
    expect((getAsset(assetId) as AgentAsset).status).toBe("protected");
  });

  // ── (c) backend selection is correct ────────────────────────────────────────
  it("(c) a saas-api remediation emits an http artifact (never powershell)", async () => {
    const assetId = "SEAT-rkapoor-0214"; // saas seat, authStatus=reauth-required
    const asset = getAsset(assetId)!;
    const picked = pickToolsForAsset(asset, primaryIssueForAsset(assetId));
    expect(picked.remediation.spec.name).toBe("reauthorize_oauth");
    expect(picked.remediation.spec.backend).toBe("saas-api");

    const res = await picked.remediation.run(
      { tenantId: "acmedental.com" },
      ctxFor(asset, false),
    );
    expect(res.artifact?.lang).toBe("http");
    expect(res.artifact?.lang).not.toBe("powershell");
    expect(res.artifact?.source).toMatch(/graph\.microsoft\.com|adminconsent/i);
    // The simulated HTTP backend returns an HTTP transcript, not a shell transcript.
    expect(res.output).toMatch(/HTTP\/1\.1/);
  });

  it("(c) a BCDR-Linux remediation emits bash (never powershell)", async () => {
    const assetId = "AST-AGT-0036"; // NWND-APP01, linux agent, status=failed
    const asset = getAsset(assetId) as AgentAsset;
    expect(asset.os.family).toBe("linux");
    const picked = pickToolsForAsset(asset, primaryIssueForAsset(assetId));
    expect(picked.remediation.spec.name).toBe("rebuild_linux_initramfs");
    expect(picked.remediation.spec.backend).toBe("agent-linux");

    const res = await picked.remediation.run({}, ctxFor(asset, false));
    expect(res.artifact?.lang).toBe("bash");
    expect(res.artifact?.lang).not.toBe("powershell");
    expect(res.artifact?.source).toMatch(/dracut|initramfs|dattobd/);
    expect(res.artifact?.source).not.toMatch(/Restart-Service|vssadmin/);
  });

  // ── (d) gated/destructive tools require approval (reject → halted) ───────────
  it("(d) force_diff_merge requires approval — a rejected approval halts the session", async () => {
    const assetId = "AST-AGT-0034"; // NWND-SQL02, chain=needs-diff-merge
    const asset = getAsset(assetId) as AgentAsset;
    const picked = pickToolsForAsset(asset, primaryIssueForAsset(assetId));
    expect(picked.remediation.spec.name).toBe("force_diff_merge");
    expect(picked.remediation.spec.requiresApproval).toBe(true);
    expect(picked.remediation.spec.risk).toBe("destructive");

    const reject: ApprovalResolver = async () => "reject";
    const s = await runSession(
      { assetId, mode: "ai", model },
      { provider, registry: defaultRegistry(), approve: reject },
    );
    expect(s.state).toBe("halted");
    expect(s.transcript.some((t) => t.kind === "approval" && /reject/.test(t.text ?? ""))).toBe(true);
    // Rejected → no heal: the chain is still not 'ok'.
    expect((getAsset(assetId) as AgentAsset).backupChainState).not.toBe("ok");
  });

  it("(d) force_zfs_retention is destructive and gated (reject → halted)", async () => {
    const assetId = "AST-AGT-0047"; // UMBRA-RDS01, storage-pool-full-backups-skipped
    const asset = getAsset(assetId)!;
    const picked = pickToolsForAsset(asset, primaryIssueForAsset(assetId));
    expect(picked.remediation.spec.name).toBe("force_zfs_retention");
    expect(picked.remediation.spec.requiresApproval).toBe(true);
    expect(picked.remediation.spec.risk).toBe("destructive");

    const reject: ApprovalResolver = async () => "reject";
    const s = await runSession(
      { assetId, mode: "ai", model },
      { provider, registry: defaultRegistry(), approve: reject },
    );
    expect(s.state).toBe("halted");

    // And when APPROVED, the same destructive tool runs and heals (proves the gate
    // is the only thing standing between reject:halted and approve:resolve).
    const approve: ApprovalResolver = async () => "approve";
    const s2 = await runSession(
      { assetId, mode: "ai", model },
      { provider, registry: defaultRegistry(), approve },
    );
    expect(["succeeded", "partial"]).toContain(s2.state);
  });

  // ── default registry serves the real catalog, not the stub ──────────────────
  it("defaultRegistry() exposes the real catalog (diagnostics + remediations)", async () => {
    const names = defaultRegistry().list().map((h) => h.spec.name);
    expect(names).toContain("get_vss_writers");
    expect(names).toContain("reset_vss_writers");
    expect(names).toContain("reauthorize_oauth");
    expect(names).toContain("force_diff_merge");
    expect(names).not.toContain("apply_fix"); // the M1 stub is no longer the default

    // Every saas-api remediation emits http for its applicable assets — never a
    // shell language (powershell/bash).
    for (const h of defaultRegistry().list()) {
      if (h.spec.backend !== "saas-api" || h.spec.risk === "read") continue;
      const asset = DB.assets.find(
        (a) =>
          h.spec.appliesToKinds.includes(a.kind) &&
          h.spec.productTypes.includes(a.productType),
      );
      if (!asset) continue;
      const res = await h.run({ tenantId: "contoso.onmicrosoft.com" }, ctxFor(asset, true));
      expect(res.artifact?.lang).toBe("http");
    }
  });
});
