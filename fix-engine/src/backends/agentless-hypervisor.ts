/**
 * agentless-hypervisor — simulated ExecutionBackend for BCDR agentless protection.
 * No in-guest script: it drives the VMware vSphere / Hyper-V management API. Emits
 * `http` artifacts (CBT reset, snapshot consolidation) and renders a hypervisor API
 * request/response with JSON bodies. No real vCenter is touched.
 *
 * Pure + deterministic; never mutates the shared DB.
 */
import type { ProtectedAsset, AgentlessAsset } from "@/types";
import type { ExecResult, StateDiff } from "../tools/types";
import {
  type Backend,
  draw,
  jitterMs,
  failed,
  dryRunResult,
  effectFor,
} from "./shared";

function capabilities(target: ProtectedAsset): string[] {
  const caps = ["hypervisor-api"];
  if (target.kind === "agentless") {
    const a = target as AgentlessAsset;
    if (a.hypervisor === "vmware") caps.push("vsphere-cbt", "vmware-tools", "snapshot-consolidate");
    else caps.push("hyperv-rct", "checkpoint-merge");
  }
  return caps;
}

/** A stable mono VM moref for the target (deterministic, not random). */
function vmRef(target: ProtectedAsset): string {
  const n = Array.from(target.id).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return `vm-${20000 + (n % 9000)}`;
}

function host(target: ProtectedAsset): string {
  return target.kind === "agentless" && (target as AgentlessAsset).hypervisor === "hyperv"
    ? "scvmm.acme.local"
    : "vcenter.acme.local";
}

function transcript(
  effect: ReturnType<typeof effectFor>,
  target: ProtectedAsset,
): string {
  const vm = vmRef(target);
  const h = host(target);
  const isVmware = !(target.kind === "agentless" && (target as AgentlessAsset).hypervisor === "hyperv");
  const lines: string[] = [];

  switch (effect.op) {
    case "reset-cbt":
      if (isVmware) {
        lines.push(
          `POST https://${h}/sdk/vim25/ResetVirtualMachineCBT`,
          `> { "vm": "${vm}", "disableThenEnable": true }`,
          "HTTP/1.1 200 OK",
          `< { "vm": "${vm}", "changeTrackingEnabled": false, "task": "task-7741" }`,
          `POST https://${h}/sdk/vim25/EnableChangeTracking`,
          `> { "vm": "${vm}", "enabled": true }`,
          "HTTP/1.1 200 OK",
          `< { "vm": "${vm}", "changeTrackingEnabled": true, "ctkReset": true }`,
        );
      } else {
        lines.push(
          `POST https://${h}/api/v2/vms/${vm}/rct:reset`,
          "HTTP/1.1 200 OK",
          `< { "vm": "${vm}", "resilientChangeTracking": "reset", "nextBackup": "full" }`,
        );
      }
      break;
    case "consolidate-snapshots":
      lines.push(
        `POST https://${h}/sdk/vim25/ConsolidateVMDisks`,
        `> { "vm": "${vm}" }`,
        "HTTP/1.1 200 OK",
        `< { "vm": "${vm}", "task": "task-7742", "state": "running" }`,
        "GET  /sdk/vim25/task-7742",
        `< { "state": "success", "consolidatedDisks": 2, "stalledSnapshots": 0 }`,
      );
      break;
    default:
      lines.push(
        `POST https://${h}/sdk/vim25/Reconfigure`,
        `> { "vm": "${vm}" }`,
        "HTTP/1.1 200 OK",
        `< { "vm": "${vm}", "state": "success" }`,
      );
  }
  return lines.join("\n");
}

export const agentlessHypervisor: Backend = {
  kind: "agentless-hypervisor",
  capabilities,
  async exec(script, target, opts): Promise<ExecResult> {
    const r = draw(
      `backend:agentless-hypervisor:${target.id}:${script.lang}:${script.source.length}`,
    );
    const effect = effectFor(script, target);
    const projected: StateDiff = effect.diff;

    if (opts.dryRun) {
      return dryRunResult(
        projected,
        [
          `[dry-run] ${host(target)} — ${vmRef(target)}`,
          `[dry-run] would call: ${script.description}`,
          "[dry-run] no changes",
        ].join("\n"),
        jitterMs(r, 950),
      );
    }

    if (r() < 0.1) {
      return failed(
        1,
        `POST https://${host(target)}/sdk/vim25/ResetVirtualMachineCBT  ${vmRef(target)}`,
        [
          "HTTP/1.1 503 Service Unavailable",
          `< { "fault": "vim.fault.TaskInProgress", "msg": "snapshot operation already in progress on ${vmRef(target)}" }`,
        ].join("\n"),
        jitterMs(r, effect.baseMs),
        { before: projected.before, after: projected.before, note: "hypervisor task conflict — facet unchanged" },
      );
    }

    return {
      exitCode: 0,
      stdout: transcript(effect, target),
      stderr: "",
      durationMs: jitterMs(r, effect.baseMs),
      diff: projected,
    };
  },
};
