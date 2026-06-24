/**
 * agent-windows — simulated ExecutionBackend for the BCDR Windows agent (and the
 * appliance pool ops that run from it). Speaks PowerShell over the Datto Windows
 * Agent control channel: ports 25568 (control) / 3260 (iSCSI) / 3262 (MercuryFTP)
 * to mothership.dtc.datto.com, real cmdlets / vssadmin / diskshadow / zfs / service
 * ops. No real host is touched — output is templated and seeded deterministically.
 *
 * Pure: exec() returns an ExecResult and never mutates the shared DB (the tool/loop
 * owns healing). Same (kind, target, lang, source) ⇒ byte-identical output.
 */
import type { ProtectedAsset } from "../domain";
import type { ExecResult, StateDiff } from "../tools/types";
import {
  type Backend,
  draw,
  jitterMs,
  failed,
  dryRunResult,
  facetTag,
  effectFor,
} from "./shared";

const MOTHERSHIP = "mothership.dtc.datto.com";
const PORTS = [25568, 3260, 3262] as const;

function capabilities(target: ProtectedAsset): string[] {
  const caps = ["powershell", "vssadmin", "diskshadow", "restart-service"];
  if (target.kind === "agent") {
    const a = target;
    caps.push("datto-backup-agent", `ports:${PORTS.join("/")}`);
    if (a.encrypted) caps.push("agent-encryption");
  }
  // The Windows agent backend also fronts appliance ZFS pool ops.
  caps.push("zfs", "zpool");
  return caps;
}

/** Build a believable PowerShell transcript reflecting the script's effect. */
function transcript(
  effect: ReturnType<typeof effectFor>,
  target: ProtectedAsset,
  facet: string,
): string {
  const host = target.displayName;
  const lines: string[] = [
    "**********************",
    `Windows PowerShell transcript — ${host}`,
    `Channel: TLS → ${MOTHERSHIP} :${PORTS[0]}  (iSCSI ${PORTS[1]} · MercuryFTP ${PORTS[2]})`,
    "**********************",
  ];

  switch (effect.op) {
    case "reset-vss":
      lines.push(
        "Stopping service 'VSS'... OK",
        "Starting service 'VSS'... OK",
        "Restarting service 'Datto Backup Agent Service'... OK",
        "vssadmin list writers | Select-String 'Writer name|State'",
        "Writer name: 'SqlServerWriter'   State: [1] Stable   Last error: No error",
        "Writer name: 'ASR Writer'        State: [1] Stable   Last error: No error",
        "Writer name: 'System Writer'     State: [1] Stable   Last error: No error",
      );
      break;
    case "repair-comms":
      lines.push(
        ...PORTS.map(
          (p) =>
            `Test-NetConnection ${MOTHERSHIP} -Port ${p} : TcpTestSucceeded = True`,
        ),
        "Re-pairing agent (POST /agent/pair)... 200 OK  pairingStatus = paired",
        "Restarting service 'Datto Backup Agent Service'... OK",
      );
      break;
    case "restart-service":
      lines.push(
        "Restarting service 'Datto Backup Agent Service'... OK",
        "Get-Service 'Datto Backup Agent Service' : Status = Running",
      );
      break;
    case "force-retention":
      lines.push(
        `zpool list -H -o name,cap,free homePool : homePool 71% 1.84T`,
        "Pruning recovery points beyond target window...",
        "Reclaimed 412 GiB across 9 datasets; homePool capacity 92% → 71%.",
      );
      break;
    case "force-merge":
      lines.push(
        "Beginning ZFS Inverse Chain diff-merge (this can take ~25 min)...",
        "  merging incremental deltas: 100%",
        "Chain rebuilt; backupChainState needs-diff-merge → ok.",
      );
      break;
    case "resume-sync":
      lines.push(
        `Resuming offsite replication to ${MOTHERSHIP} :${PORTS[2]} (MercuryFTP)...`,
        "Transmit limit raised; 14 pending points queued. offsite sync resuming.",
      );
      break;
    case "unseal":
      lines.push(
        "Submitting passphrase to unseal encrypted agent...",
        "Agent unsealed; sealed = false. Resuming backups.",
      );
      break;
    default:
      lines.push(
        `Invoking remediation on facet '${facet}'...`,
        "Operation completed.",
      );
  }
  lines.push(`exit 0`);
  return lines.join("\n");
}

export const agentWindows: Backend = {
  kind: "agent-windows",
  capabilities,
  async exec(script, target, opts): Promise<ExecResult> {
    const r = draw(
      `backend:agent-windows:${target.id}:${script.lang}:${script.source.length}`,
    );
    const effect = effectFor(script, target);
    const facet = facetTag(target);
    const projected: StateDiff = effect.diff;

    if (opts.dryRun) {
      return dryRunResult(
        projected,
        [
          `[dry-run] WhatIf — ${target.displayName}`,
          `[dry-run] Would run: ${script.description}`,
          "[dry-run] no changes",
        ].join("\n"),
        jitterMs(r, 900),
      );
    }

    // Seeded ~10% failure so the loop can exercise partial/failed paths.
    if (r() < 0.1) {
      return failed(
        2,
        [
          `Windows PowerShell transcript — ${target.displayName}`,
          `Channel: TLS → ${MOTHERSHIP} :${PORTS[0]}`,
        ].join("\n"),
        [
          "Restart-Service : Service 'Datto Backup Agent Service' did not respond in a timely fashion.",
          "    + FullyQualifiedErrorId : ServiceCommandException",
          "vssadmin: Last error: 0x800423f3 (VSS_E_WRITER_ERROR_RETRYABLE)",
          "exit 2",
        ].join("\n"),
        jitterMs(r, effect.baseMs),
        { before: projected.before, after: projected.before, note: "remediation did not complete — facet unchanged" },
      );
    }

    return {
      exitCode: 0,
      stdout: transcript(effect, target, facet),
      stderr: "",
      durationMs: jitterMs(r, effect.baseMs),
      diff: projected,
    };
  },
};
