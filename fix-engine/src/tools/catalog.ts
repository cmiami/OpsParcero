/**
 * Showcase remediation tool catalog. Each ToolHandler wraps a real
 * RemediationAction from "@/mock/reference" (ACTION_BY_ID / ACTION_CATALOG),
 * carries a JSON-Schema inputSchema + risk/approval/reversibility/backend
 * metadata, and — in run()/preview() — builds a REAL ScriptArtifact (correct
 * cmdlets / flags / Graph & vSphere endpoints) and dispatches it to its backend
 * via backendFor(spec.backend).exec(artifact, ctx.asset, { dryRun }).
 *
 * ExecResult → ToolResult mapping (contract [fix-engine 03 §4]):
 *   ok      = exitCode === 0
 *   output  = stdout (stderr appended when present)
 *   diff    = ExecResult.diff
 *   healed  = the diff shows recovery (a facet flipped to a healthy value)
 * preview() runs the SAME artifact with { dryRun: true } — same projected diff,
 * zero mutation. Determinism flows from the backends + the seeded clock; this
 * layer never calls Math.random()/Date.now().
 *
 * Backends are written by the peer agent to:  backendFor(kind: BackendKind): ExecutionBackend
 */
import type {
  RemediationActionId,
  RemediationAction,
  ProtectedAsset,
  AgentAsset,
  EndpointAsset,
  SaasSeatAsset,
} from "../domain";
import type {
  ToolHandler,
  ToolSpec,
  ToolResult,
  ToolContext,
  ScriptArtifact,
  ExecResult,
  StateDiff,
  BackendKind,
} from "./types";
import { backendFor } from "../backends";
import { ACTION_BY_ID, DB, applyHeal } from "../shared/fleet";
import {
  AGENTLIKE_KINDS,
  isAgent,
  isEndpoint,
  isSaasSeat,
  isSalesforce,
} from "./diagnostics";

// ──────────────────────────────────────────────────────────────────────────────
// Shared mapping + dispatch
// ──────────────────────────────────────────────────────────────────────────────

/** A small description of one showcase tool, before we synthesize the handler. */
interface RemediationDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Links the tool to a real catalog action (drives risk/reversible/approval). */
  actionId: RemediationActionId;
  /** Primary backend; resolved to agent-linux at run time when os.family==='linux'. */
  backend: BackendKind;
  /** Override the catalog-derived risk when the showcase intent differs. */
  riskOverride?: ToolSpec["risk"];
  /** Override requiresApproval (e.g. destructive showcase tools force a gate). */
  approvalOverride?: boolean;
  /** Builds the real ScriptArtifact for this asset + input. */
  artifact: (
    asset: ProtectedAsset,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ) => ScriptArtifact;
  /** One-line success summary template (asset interpolated). */
  summarize: (asset: ProtectedAsset, res: ExecResult) => string;
}

/** ToolRisk derivation from the catalog action (contract [fix-engine 03 §1.1]). */
function riskFromAction(a: RemediationAction): ToolSpec["risk"] {
  if (a.destructive || !a.reversible) return "destructive";
  return "safe-write";
}

/** Resolve the effective backend for an asset (Windows/Linux split at run time). */
function resolveBackend(primary: BackendKind, asset: ProtectedAsset): BackendKind {
  if (primary === "agent-windows" && isAgent(asset) && asset.os.family === "linux") {
    return "agent-linux";
  }
  // macOS/Linux endpoints emit bash but still route through endpoint-agent.
  return primary;
}

/**
 * Endpoint OS detection — EndpointAsset carries no `os` facet, so macOS is
 * inferred from the host display name / tags (bash artifacts) else Windows
 * (PowerShell). Deterministic, no rng.
 */
function isMacEndpoint(asset: ProtectedAsset): boolean {
  if (!isEndpoint(asset)) return false;
  const hay = `${asset.displayName} ${asset.tags.join(" ")}`.toLowerCase();
  return /\bmac\b|macos|darwin|mbp|imac|macbook/.test(hay);
}

/**
 * Does a before/after diff demonstrate recovery? A successful (exit-0, non-dry)
 * backend run only emits a CHANGED facet when it actually remediated: the failure
 * path and dry-run preview both return after === before (note: "…unchanged"), and
 * the caller already guards `healed` with `!dryRun`. So recovery == at least one
 * facet whose `after` differs from `before`. (A flip to a recognized-healthy
 * token is the strong signal; a status improving failed → warning is a partial
 * heal that still counts.)
 */
function diffShowsRecovery(diff?: StateDiff): boolean {
  if (!diff) return false;
  const before = diff.before as Record<string, unknown>;
  for (const [key, after] of Object.entries(diff.after)) {
    if (after !== before[key]) return true;
  }
  return false;
}

/** Map a backend ExecResult onto the loop's ToolResult contract. */
function toToolResult(
  asset: ProtectedAsset,
  def: RemediationDef,
  res: ExecResult,
  artifact: ScriptArtifact,
  dryRun: boolean,
): ToolResult {
  const ok = res.exitCode === 0;
  const healed = ok && !dryRun && diffShowsRecovery(res.diff);
  const stdout = res.stdout + (res.stderr ? `\n[stderr]\n${res.stderr}` : "");
  const ticket = /DAT-TKT-\d+/.exec(res.stdout)?.[0];
  const summary = ok
    ? dryRun
      ? `[dry-run] ${def.summarize(asset, res)}`
      : def.summarize(asset, res)
    : `${def.name} failed on ${asset.displayName} (exit ${res.exitCode})`;
  return {
    ok,
    healed,
    summary,
    output: stdout,
    diff: res.diff,
    artifact,
    opensTicket: ticket,
  };
}

/** Build a full ToolHandler from a RemediationDef + its linked catalog action. */
function makeRemediation(def: RemediationDef): ToolHandler {
  const action = ACTION_BY_ID[def.actionId];
  if (!action) {
    throw new Error(`[fix-engine] catalog tool "${def.name}" references unknown actionId "${def.actionId}"`);
  }
  const risk = def.riskOverride ?? riskFromAction(action);
  const requiresApproval =
    def.approvalOverride ?? (risk === "destructive" || action.requiresApproval !== "never");

  const spec: ToolSpec = {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    risk,
    requiresApproval,
    reversible: action.reversible,
    appliesToKinds: action.appliesToKinds,
    productTypes: action.productTypes,
    actionId: def.actionId,
    backend: def.backend,
  };

  async function dispatch(
    input: unknown,
    ctx: ToolContext,
    dryRun: boolean,
  ): Promise<ToolResult> {
    const args = (input ?? {}) as Record<string, unknown>;
    const artifact = def.artifact(ctx.asset, args, ctx);
    const backend = backendFor(resolveBackend(def.backend, ctx.asset));
    ctx.emit({
      phase: dryRun ? "preview" : "execute",
      message: `${def.name} → ${backend.kind}: ${artifact.description}`,
    });
    const res = await backend.exec(artifact, ctx.asset, { dryRun });
    const result = toToolResult(ctx.asset, def, res, artifact, dryRun);

    // Heal the SHARED fleet on a real (non-dry) success that demonstrates
    // recovery: apply the projected `after` facets to the live asset so the
    // verify-phase diagnostic re-reads "healthy" and the loop closes visibly.
    // Dry-runs and failures never mutate (reversible-safe). The asset object
    // ctx.asset references is the same identity held by the shared DB.
    if (!dryRun && result.healed && res.diff?.after) {
      applyHeal(ctx.asset.id, res.diff.after as Record<string, unknown>);
    }
    return result;
  }

  return {
    spec,
    run(input, ctx) {
      // Belt-and-suspenders: honor ctx.dryRun even if the loop calls run() in dry mode.
      return dispatch(input, ctx, ctx.dryRun === true);
    },
    preview(input, ctx) {
      return dispatch(input, ctx, true);
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Reusable inputSchema fragments
// ──────────────────────────────────────────────────────────────────────────────

const verifyAfterProp = {
  verifyAfter: {
    type: "boolean",
    default: true,
    description: "Verify the next backup after the fix.",
  },
};
const rebootProp = {
  scheduleReboot: {
    type: "boolean",
    default: false,
    description: "Schedule a reboot after the repair to finalize driver/state changes.",
  },
};
const emptyVerifySchema = {
  type: "object",
  properties: { ...verifyAfterProp },
  additionalProperties: false,
};

/** Agent control-channel UUID env reference used across PowerShell artifacts. */
const AGENT_UUID = "$env:DATTO_AGENT_UUID";

// ──────────────────────────────────────────────────────────────────────────────
// 1. reset_vss_writers — agent-windows · safe-write (restart-service)
// ──────────────────────────────────────────────────────────────────────────────

const reset_vss_writers = makeRemediation({
  name: "reset_vss_writers",
  description:
    "Recover failed VSS writers on a Windows agent/endpoint by bouncing the VSS + COM+ event plumbing and the Datto agent service, then re-querying writer state. Safe-write, reversible (writers re-register). Run get_vss_writers first and again to verify.",
  inputSchema: emptyVerifySchema,
  actionId: "repair-vss-writers",
  backend: "agent-windows",
  artifact: (asset) => ({
    lang: "powershell",
    description: `Restart VSS + COM+ plumbing and the Datto agent on ${asset.displayName}; re-query writers.`,
    source: [
      `# reset_vss_writers | ${asset.displayName} | backend: agent-windows (safe-write, reversible)`,
      `# Diagnose: flag any writer not Stable / No error.`,
      `vssadmin list writers | Select-String -Pattern 'Writer name|State|Last error'`,
      ``,
      `# Reset: bounce the VSS + COM+ event plumbing so writers re-register.`,
      `$services = 'VSS','swprv','EventSystem','COMSysApp'`,
      `foreach ($s in $services) { Restart-Service -Name $s -Force -ErrorAction Continue }`,
      `Restart-Service -Name 'Datto Windows Agent' -ErrorAction Continue`,
      ``,
      `# Post-check: every writer should read State: [1] Stable, Last error: No error.`,
      `vssadmin list writers | Select-String -Pattern 'Writer name|State|Last error'`,
    ].join("\n"),
  }),
  summarize: (asset) =>
    `Reset VSS writers on ${asset.displayName} — writers re-registered Stable, agent service restarted.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. force_diff_merge — agent-windows · destructive (irreversible) → approval
// ──────────────────────────────────────────────────────────────────────────────

const force_diff_merge = makeRemediation({
  name: "force_diff_merge",
  description:
    "Force a differential merge / chain rebuild on a BCDR/endpoint agent whose chain is needs-diff-merge before a re-screenshot. Long-running (~25 min) and storage-intensive; the chain is not destroyed but the operation is gated and irreversible-in-place. Run get_backup_chain first; re-run to verify chainState → ok.",
  inputSchema: {
    type: "object",
    properties: {
      ...verifyAfterProp,
      reason: {
        type: "string",
        description: "Why the merge is needed (surfaced to the approver).",
      },
    },
    additionalProperties: false,
  },
  actionId: "force-merge",
  backend: "agent-windows",
  // force-merge is reversible:false in the catalog → destructive; force the gate.
  riskOverride: "destructive",
  approvalOverride: true,
  artifact: (asset, input) => ({
    lang: "powershell",
    description: `Arm a forced differential merge for ${asset.displayName}'s most recent chain (streams progress %).`,
    source: [
      `# force_diff_merge (ZFS InverseChain diff-merge) | ${asset.displayName} | backend: agent-windows (DESTRUCTIVE, gated, NOT reversible in place)`,
      `# Preconditions surfaced to approver: chainState=needs-diff-merge, pool headroom, ETA ~25 min.`,
      `Get-DattoAgentChain -AgentUuid ${AGENT_UUID} | Select-Object ChainState, PoolFreePct`,
      ``,
      `# Arm the merge for the agent's most recent chain; the engine streams progress %.`,
      `Invoke-DattoAgentTask -AgentUuid ${AGENT_UUID} -Task 'ForceDifferentialMerge' \``,
      `  -Reason '${String(input.reason ?? "rebuild chain before re-screenshot")}'`,
      ``,
      `# Verify (re-run get_backup_chain): expect chainState 'rebuilding' -> 'ok'.`,
      `Get-DattoAgentChain -AgentUuid ${AGENT_UUID} | Select-Object ChainState`,
    ].join("\n"),
  }),
  summarize: (asset) =>
    `Forced differential merge on ${asset.displayName} — chain rebuilt to 'ok'; ready to re-screenshot.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. repair_agent_comms — agent-windows (→ agent-linux when os.family==='linux')
// ──────────────────────────────────────────────────────────────────────────────

const repair_agent_comms = makeRemediation({
  name: "repair_agent_comms",
  description:
    "Repair a BCDR/endpoint agent's secure communications: probe the mothership control ports (25568/3260/3262), then bounce the agent service to clear a 401-unauthorized secure-channel error. Safe-write, self-approving, reversible. Emits PowerShell on Windows and bash on Linux. Run get_agent_comms first and again to verify.",
  inputSchema: emptyVerifySchema,
  actionId: "repair-agent-comms",
  backend: "agent-windows",
  artifact: (asset) => {
    const linux = isAgent(asset) && asset.os.family === "linux";
    if (linux) {
      return {
        lang: "bash",
        description: `Restart the Datto Linux Agent on ${asset.displayName}, re-arm tracking, verify the control channel.`,
        source: [
          `#!/usr/bin/env bash`,
          `# repair_agent_comms | ${asset.displayName} | backend: agent-linux (safe-write, reversible)`,
          `set -euo pipefail`,
          `systemctl restart dla-agent`,
          `journalctl -u dla-agent --since "10 min ago" --no-pager | tail -n 20`,
          `dbdctl reload && echo "dattobd: tracking re-armed"`,
          `# verify the three control ports to mothership.dtc.datto.com`,
          `ss -tnp | grep -E ':(25568|3260|3262)' || echo "no established control sockets yet"`,
        ].join("\n"),
      };
    }
    return {
      lang: "powershell",
      description: `Probe mothership ports and bounce the Datto Windows Agent on ${asset.displayName} to clear the 401.`,
      source: [
        `# repair_agent_comms | ${asset.displayName} | backend: agent-windows (safe-write, reversible)`,
        `$mother = 'mothership.dtc.datto.com'`,
        `foreach ($port in 25568,3260,3262) {`,
        `  $r = Test-NetConnection -ComputerName $mother -Port $port -WarningAction SilentlyContinue`,
        `  '{0}:{1} -> {2}' -f $mother,$port, ($(if($r.TcpTestSucceeded){'OPEN'}else{'BLOCKED'}))`,
        `}`,
        `# Bounce the agent service to re-establish the secure channel (clears 401).`,
        `Restart-Service -Name 'Datto Windows Agent' -ErrorAction Stop`,
        `Start-Sleep -Seconds 3`,
        `Get-Service 'Datto Windows Agent' | Select-Object Status, StartType`,
      ].join("\n"),
    };
  },
  summarize: (asset) =>
    `Repaired agent comms on ${asset.displayName} — secure channel re-established (401 → paired).`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. rebuild_linux_initramfs — agent-linux · safe-write (NOT reversible in place)
// ──────────────────────────────────────────────────────────────────────────────

const rebuild_linux_initramfs = makeRemediation({
  name: "rebuild_linux_initramfs",
  description:
    "Reload the dattobd kernel module and rebuild the initramfs (dracut) so change-block tracking survives the next boot on a Datto Linux agent. Safe-write, gated; not reversible in place (the script backs up the prior initramfs .img first). Run read_event_log (dattobd) first.",
  inputSchema: {
    type: "object",
    properties: {
      kernelVersion: {
        type: "string",
        description: "Target kernel version; defaults to the running kernel (uname -r).",
      },
    },
    additionalProperties: false,
  },
  // Linux agents are kind:"agent" → catalog action's backend is agent-windows;
  // we force agent-linux and emit bash. Use the guided linux dracut action id.
  actionId: "linux-dracut-runbook",
  backend: "agent-linux",
  riskOverride: "safe-write",
  approvalOverride: true,
  artifact: (asset, input) => ({
    lang: "bash",
    description: `Reload dattobd and rebuild the initramfs on ${asset.displayName} (backs up the prior .img).`,
    source: [
      `#!/usr/bin/env bash`,
      `# rebuild_linux_initramfs | ${asset.displayName} | backend: agent-linux (safe-write, gated, NOT reversible in place)`,
      `set -euo pipefail`,
      ``,
      `# Diagnose: is dattobd loaded?`,
      `lsmod | grep -q '^dattobd' || echo "dattobd: NOT LOADED"`,
      `dmesg | grep -i dattobd | tail -n 20 || true`,
      ``,
      `# Reload the module (reversible rmmod/modprobe pair).`,
      `modprobe -r dattobd 2>/dev/null || true`,
      `modprobe dattobd`,
      `lsmod | grep '^dattobd'`,
      ``,
      `# Rebuild initramfs so the module survives the next boot; back it up first.`,
      `KVER="${input.kernelVersion ? String(input.kernelVersion) : '$(uname -r)'}"`,
      `cp -a "/boot/initramfs-\${KVER}.img" "/boot/initramfs-\${KVER}.img.dtc.bak"`,
      `dracut --force --add-drivers dattobd "/boot/initramfs-\${KVER}.img" "\${KVER}"`,
      `echo "initramfs rebuilt for \${KVER}; backup at /boot/initramfs-\${KVER}.img.dtc.bak"`,
    ].join("\n"),
  }),
  summarize: (asset) =>
    `Reloaded dattobd and rebuilt the initramfs on ${asset.displayName} — CBT will persist across reboot.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. reset_cbt — agentless-hypervisor · safe-write (gated) · http
// ──────────────────────────────────────────────────────────────────────────────

const reset_cbt = makeRemediation({
  name: "reset_cbt",
  description:
    "Reset Changed Block Tracking on an agentless VMware/Hyper-V VM (disable → clear stale ctk/snapshots → re-enable). Forces the next backup to be a full; safe-write, gated, reversible. Emits a vSphere management-API request block. Run get_backup_chain / diagnostics first.",
  inputSchema: emptyVerifySchema,
  actionId: "reset-cbt",
  backend: "agentless-hypervisor",
  approvalOverride: true,
  artifact: (asset) => ({
    lang: "http",
    description: `Toggle CBT off→on for ${asset.displayName} via the vSphere API and clear stalled DATTO_ snapshots.`,
    source: [
      `# reset_cbt | ${asset.displayName} | backend: agentless-hypervisor (safe-write, gated, reversible)`,
      `# 1) Disable CBT so per-disk ctk files are dropped.`,
      `POST /sdk/vim25/ResetVirtualMachineCBT`,
      `Host: vcenter.dtc.local`,
      `Authorization: Bearer {{vsphere_session_token}}`,
      `Content-Type: application/json`,
      ``,
      `{ "vm": "{vm-id}", "disableThenEnable": true }`,
      ``,
      `# 2) Remove any stalled Datto snapshot, then re-enable CBT (next backup = full).`,
      `POST /api/vcenter/vm/{vm-id}/snapshot/consolidate`,
      `Authorization: Bearer {{vsphere_session_token}}`,
      ``,
      `{ "reason": "datto agentless: clear stalled DATTO_ snapshot, re-arm CBT" }`,
      `# verify (get_backup_chain): no DATTO_* snapshot remaining, CBT enabled, chain ok.`,
    ].join("\n"),
  }),
  summarize: (asset) =>
    `Reset CBT on ${asset.displayName} — change-tracking re-armed; next backup will be a full.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. force_zfs_retention — agent-windows (appliance) · destructive → approval
// ──────────────────────────────────────────────────────────────────────────────

const force_zfs_retention = makeRemediation({
  name: "force_zfs_retention",
  description:
    "Apply an appliance's retention schedule NOW to reclaim ZFS pool space when the pool is over the skip threshold and backups are being skipped. DESTRUCTIVE (deletes recovery points), gated, not reversible — preview shows which points/agents are affected and the reclaimed space. Run get_zfs_pool first and again to verify capacity dropped below ~85%.",
  inputSchema: {
    type: "object",
    properties: {
      localRetentionDays: {
        type: "integer",
        minimum: 1,
        maximum: 365,
        default: 30,
        description: "Target local retention window in days.",
      },
      dryRun: {
        type: "boolean",
        default: false,
        description: "Preview which recovery points would be removed without deleting.",
      },
    },
    required: ["localRetentionDays"],
    additionalProperties: false,
  },
  actionId: "force-retention",
  backend: "agent-windows",
  artifact: (asset, input) => {
    const days = Number(input.localRetentionDays ?? 30);
    return {
      lang: "bash",
      description: `Enumerate then prune ${asset.displayName}'s recovery points to a ${days}-day window on the appliance pool.`,
      source: [
        `#!/usr/bin/env bash`,
        `# force_zfs_retention | ${asset.displayName} | backend: agent-windows (appliance) | DESTRUCTIVE, gated, NOT reversible`,
        `AGENT="homePool/agents/${asset.displayName.toLowerCase()}"`,
        ``,
        `# PREVIEW (dryRun=true): list snapshots retention WOULD remove — no deletion.`,
        `zfs list -t snapshot -H -o name,used -s creation "$AGENT" | head -n 40`,
        ``,
        `# EXECUTE (dryRun=false, only after approval): apply the retention schedule now.`,
        `datto-retention --agent "$AGENT" --local-days ${days} --apply \\`,
        `  --reason "pool over 85% skip threshold, backups skipped"`,
        ``,
        `# Verify (get_zfs_pool): capacity should drop below the ~85% skip threshold.`,
        `zpool list -H -o capacity homePool`,
      ].join("\n"),
    };
  },
  summarize: (asset) =>
    `Forced retention on ${asset.displayName}'s pool — reclaimed space; capacity back below the skip threshold.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. endpoint_av_exclusion — endpoint-agent · safe-write
// ──────────────────────────────────────────────────────────────────────────────

const endpoint_av_exclusion = makeRemediation({
  name: "endpoint_av_exclusion",
  description:
    "Apply the AV/EDR exclusion set for the Datto Endpoint Backup agent (paths + processes + the cbtfilter driver) so security tooling stops quarantining the change-block filter, then reload the filter and restart the service. Safe-write, gated, reversible. Emits PowerShell (Windows) or bash (macOS). Run read_event_log / get_vss_writers first.",
  inputSchema: {
    type: "object",
    properties: { ...rebootProp, ...verifyAfterProp },
    additionalProperties: false,
  },
  actionId: "apply-av-edr-exclusions",
  backend: "endpoint-agent",
  approvalOverride: true,
  artifact: (asset) => {
    const mac = isMacEndpoint(asset);
    if (mac) {
      return {
        lang: "bash",
        description: `Register Datto Endpoint paths with the macOS security agent on ${asset.displayName} and restart the service.`,
        source: [
          `#!/usr/bin/env bash`,
          `# endpoint_av_exclusion | ${asset.displayName} | backend: endpoint-agent (safe-write, gated, reversible)`,
          `set -euo pipefail`,
          `# Add Datto Endpoint paths to the security agent's allow list (per-EDR template).`,
          `sudo /usr/local/bin/edr-cli exclude add --path "/Library/Application Support/Datto/Endpoint"`,
          `sudo /usr/local/bin/edr-cli exclude add --process "dattoendpoint"`,
          `# Restart the endpoint backup daemon to clear the quarantine.`,
          `sudo launchctl kickstart -k system/com.datto.endpoint`,
          `datto-endpoint --status`,
        ].join("\n"),
      };
    }
    return {
      lang: "powershell",
      description: `Add Datto Endpoint AV/EDR exclusions on ${asset.displayName}, reload cbtfilter, restart the service.`,
      source: [
        `# endpoint_av_exclusion | ${asset.displayName} | backend: endpoint-agent (safe-write, gated, reversible)`,
        `# Diagnose: is the change-block filter present?`,
        `fltmc filters | Select-String 'cbtfilter'`,
        ``,
        `# AV/EDR exclusions so the driver isn't quarantined (paths + processes).`,
        `$paths = @("$env:ProgramFiles\\Datto\\Endpoint Backup", "$env:ProgramData\\Datto")`,
        `Add-MpPreference -ExclusionPath $paths`,
        `Add-MpPreference -ExclusionProcess 'DattoEndpointBackup.exe','cbtfilter.sys'`,
        ``,
        `# Reload the cbtfilter change-block driver and restart the service.`,
        `fltmc unload cbtfilter 2>$null; fltmc load cbtfilter`,
        `Get-Service -Name DattoEndpointBackup | Restart-Service`,
        `fltmc filters | Select-String 'cbtfilter'   # expect Running`,
      ].join("\n"),
    };
  },
  summarize: (asset) =>
    `Applied AV/EDR exclusions on ${asset.displayName} — cbtfilter reloaded, no longer quarantined.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. fix_endpoint_throttle — endpoint-agent · safe-write (throttle=0 deadlock)
// ──────────────────────────────────────────────────────────────────────────────

const fix_endpoint_throttle = makeRemediation({
  name: "fix_endpoint_throttle",
  description:
    "Correct a throttle=0 deadlock on a Datto Endpoint agent by setting a safe non-zero transmit floor so backups can transmit again. Safe-write, self-approving, reversible (prior throttle captured for rollback). Emits PowerShell (Windows) or bash (macOS).",
  inputSchema: {
    type: "object",
    properties: {
      transmitLimitMbps: {
        type: "integer",
        minimum: 1,
        maximum: 1000,
        default: 50,
        description: "Safe non-zero transmit floor in Mbps.",
      },
    },
    additionalProperties: false,
  },
  actionId: "set-safe-throttle",
  backend: "endpoint-agent",
  artifact: (asset, input) => {
    const mbps = Number(input.transmitLimitMbps ?? 50);
    const kbps = mbps * 1024;
    const mac = isMacEndpoint(asset);
    if (mac) {
      return {
        lang: "bash",
        description: `Set a ${mbps} Mbps transmit floor on ${asset.displayName} (currently throttle=0 deadlock).`,
        source: [
          `#!/usr/bin/env bash`,
          `# fix_endpoint_throttle | ${asset.displayName} | backend: endpoint-agent (safe-write, auto, reversible)`,
          `set -euo pipefail`,
          `CUR=$(datto-endpoint config get bandwidthThrottleKbps)`,
          `echo "throttle = $CUR Kbps"   # 0 == deadlock condition`,
          `if [ "$CUR" = "0" ]; then datto-endpoint config set bandwidthThrottleKbps ${kbps}; fi`,
          `datto-endpoint config get bandwidthThrottleKbps`,
        ].join("\n"),
      };
    }
    return {
      lang: "powershell",
      description: `Set a ${mbps} Mbps transmit floor on ${asset.displayName} (currently throttle=0 deadlock).`,
      source: [
        `# fix_endpoint_throttle | ${asset.displayName} | backend: endpoint-agent (safe-write, auto, reversible)`,
        `$thr = (Get-DattoEndpointConfig).BandwidthThrottleKbps`,
        `"throttle = $thr Kbps"   # 0 == deadlock condition`,
        `if ($thr -eq 0) { Set-DattoEndpointConfig -BandwidthThrottleKbps ${kbps} }  # ${mbps} Mbps safe floor`,
        `(Get-DattoEndpointConfig).BandwidthThrottleKbps`,
      ].join("\n"),
    };
  },
  summarize: (asset) =>
    `Cleared the throttle=0 deadlock on ${asset.displayName} — transmit floor set; backups can run.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 9. reauthorize_oauth — saas-api · safe-write (gated, you-step) · http
// ──────────────────────────────────────────────────────────────────────────────

const reauthorize_oauth = makeRemediation({
  name: "reauthorize_oauth",
  description:
    "Launch Microsoft 365 Global-Admin consent to re-authorize the SaaS Protect / Spanning Graph app (EWS→Graph reauth, expired/missing scopes), then verify a mailbox read returns 200. Safe-write, gated (a Global Admin must consent — a you-step), reversible (consent can be revoked). Emits the Graph/OAuth request block. Run get_oauth_grant first.",
  inputSchema: {
    type: "object",
    properties: {
      tenantId: {
        type: "string",
        description: "M365 tenant id/domain to scope the admin-consent flow.",
      },
      ...verifyAfterProp,
    },
    required: ["tenantId"],
    additionalProperties: false,
  },
  actionId: "reauthorize-oauth",
  backend: "saas-api",
  approvalOverride: true,
  artifact: (asset, input) => {
    const upn = isSaasSeat(asset) ? asset.upn : "{mailbox}";
    const tenant = String(input.tenantId ?? "{tenant_id}");
    return {
      lang: "http",
      description: `Generate the M365 Global-Admin consent URL for tenant ${tenant} and verify a Graph mailbox read.`,
      source: [
        `# reauthorize_oauth | ${asset.displayName} | backend: saas-api (safe-write, gated, you-step, reversible)`,
        `# 1) Diagnose: which Graph scopes are granted for this tenant?`,
        `GET https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '{spanning_app_id}'`,
        `Authorization: Bearer {{partner_admin_token}}`,
        ``,
        `# 2) Global-Admin consent (the you-step): admin clicks + approves.`,
        `GET https://login.microsoftonline.com/${tenant}/v2.0/adminconsent`,
        `    ?client_id={spanning_app_id}`,
        `    &scope=https://graph.microsoft.com/.default`,
        `    &redirect_uri=https://app.kaseya.com/fix/oauth/callback`,
        `    &state={fix_session_id}`,
        ``,
        `# 3) Verify: a mailbox read should return 200 once consent lands.`,
        `GET https://graph.microsoft.com/v1.0/users/${upn}/messages?$top=1`,
        `Authorization: Bearer {{tenant_app_token}}`,
        `# 200 => authorized; queue a confirming Exchange backup. 401/403 => re-prompt.`,
      ].join("\n"),
    };
  },
  summarize: (asset) =>
    `Re-authorized M365 Graph consent for ${asset.displayName} — mailbox read 200; backups can resume.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 10. salesforce_reconnect — saas-api · safe-write (gated) · http
// ──────────────────────────────────────────────────────────────────────────────

const salesforce_reconnect = makeRemediation({
  name: "salesforce_reconnect",
  description:
    "Re-enable the SpanningBackup / SpanningOauth connected apps and clear the Salesforce API-usage cap block so metadata + record backups can run again. Safe-write, gated (Salesforce admin config), reversible. Emits the Salesforce REST request block (org limits + connected-app config). Run get_oauth_grant / get_sfdc_api_usage first.",
  inputSchema: emptyVerifySchema,
  actionId: "enable-connected-apps",
  backend: "saas-api",
  approvalOverride: true,
  artifact: (asset) => ({
    lang: "http",
    description: `Enable Spanning connected apps and raise the API-usage cap for ${asset.displayName}.`,
    source: [
      `# salesforce_reconnect | ${asset.displayName} | backend: saas-api (safe-write, gated, reversible)`,
      `# 1) Diagnose: how much of the daily API allocation is left, and is the app authorized?`,
      `GET https://{instance}.salesforce.com/services/data/v60.0/limits`,
      `Authorization: Bearer {{sfdc_oauth_token}}`,
      `# -> DailyApiRequests: { "Max": 100000, "Remaining": 14210 }  (Spanning cap too low for a large org)`,
      ``,
      `# 2) Re-enable the SpanningBackup / SpanningOauth connected apps and raise the cap.`,
      `PATCH https://api.kaseya.com/spanning/v1/orgs/{org_id}/settings`,
      `Authorization: Bearer {{partner_admin_token}}`,
      `Content-Type: application/json`,
      ``,
      `{ "apps": ["SpanningBackup","SpanningOauth"], "enabled": true,`,
      `  "permittedUsers": "admin-approved", "apiCallCapPct": 50,`,
      `  "schedule": "outside-business-hours" }`,
      ``,
      `# 3) Verify: re-poll /limits during the next run; Remaining stays > 0, backup completes.`,
      `GET https://{instance}.salesforce.com/services/data/v60.0/limits`,
      `Authorization: Bearer {{sfdc_oauth_token}}   # expect Remaining > 0`,
    ].join("\n"),
  }),
  summarize: (asset) =>
    `Reconnected ${asset.displayName} — Spanning connected apps enabled and API cap raised; backups can complete.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 11. resume_offsite_sync — agent-windows · safe-write (resume-sync)
// ──────────────────────────────────────────────────────────────────────────────

const resume_offsite_sync = makeRemediation({
  name: "resume_offsite_sync",
  description:
    "Resume a paused/behind off-site cloud sync for an appliance/asset and confirm the backlog begins draining. Safe-write, self-approving, reversible. Run a sync diagnostic first; verify the sync state returns to 'current' or 'behind' (draining).",
  inputSchema: emptyVerifySchema,
  actionId: "resume-offsite-sync",
  backend: "agent-windows",
  artifact: (asset) => {
    const sync = DB.offsiteSyncs.find(
      (s) => s.assetId === asset.id || s.applianceId === asset.applianceId,
    );
    const backlog = sync ? (sync.backlogBytes / 1024 ** 3).toFixed(1) : "—";
    return {
      lang: "powershell",
      description: `Resume off-site sync for ${asset.displayName} and report backlog drain.`,
      source: [
        `# resume_offsite_sync | ${asset.displayName} | backend: agent-windows (safe-write, reversible)`,
        `# Diagnose current off-site sync state + backlog.`,
        `Get-DattoOffsiteSync -AgentUuid ${AGENT_UUID} | Select-Object State, BacklogBytes, OldestUnsyncedPointAt`,
        `# backlog ≈ ${backlog} GB`,
        ``,
        `# Resume the sync (clears 'paused'; sync transitions paused -> behind -> current).`,
        `Resume-DattoOffsiteSync -AgentUuid ${AGENT_UUID}`,
        ``,
        `# Verify the backlog is draining.`,
        `Get-DattoOffsiteSync -AgentUuid ${AGENT_UUID} | Select-Object State, BacklogBytes`,
      ].join("\n"),
    };
  },
  summarize: (asset) =>
    `Resumed off-site sync on ${asset.displayName} — backlog draining toward current.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// 12. repush_agent_update — endpoint-agent · safe-write (re-push known-good)
// ──────────────────────────────────────────────────────────────────────────────

const repush_agent_update = makeRemediation({
  name: "repush_agent_update",
  description:
    "Re-push a known-good Datto Endpoint agent build to a host running a known-bad version (e.g. the build that ran diff-merge as a first backup), gracefully stopping and reinstalling. Safe-write, gated (over-threshold), reversible (prior build kept for rollback). Emits PowerShell (Windows) or bash (macOS). Run get_agent_version diagnostics first.",
  inputSchema: {
    type: "object",
    properties: {
      ...rebootProp,
      targetVersion: {
        type: "string",
        description: "Pinned known-good build to install; defaults to the current GA build.",
      },
    },
    additionalProperties: false,
  },
  actionId: "re-push-agent-update",
  backend: "endpoint-agent",
  artifact: (asset, input) => {
    const good = String(input.targetVersion ?? "3.0.41");
    const cur = isEndpoint(asset) ? asset.agentGen : "v2";
    const mac = isMacEndpoint(asset);
    if (mac) {
      return {
        lang: "bash",
        description: `Re-push known-good Datto Endpoint build ${good} to ${asset.displayName} (keeps prior pkg for rollback).`,
        source: [
          `#!/usr/bin/env bash`,
          `# repush_agent_update | ${asset.displayName} | backend: endpoint-agent (safe-write, gated, reversible)`,
          `set -euo pipefail`,
          `CUR="$(datto-endpoint --version 2>/dev/null || echo unknown)"`,
          `KNOWN_BAD="\${DTC_KNOWN_BAD:-3.0.18 3.0.20}"`,
          `echo "current=$CUR (gen ${cur})  known_bad=[$KNOWN_BAD]"`,
          `for bad in $KNOWN_BAD; do`,
          `  if [ "$CUR" = "$bad" ]; then`,
          `    echo "match -> repushing known-good build ${good}"`,
          `    launchctl unload /Library/LaunchDaemons/com.datto.endpoint.plist`,
          `    installer -pkg "/var/cache/datto/datto-endpoint-${good}.pkg" -target /`,
          `    launchctl load /Library/LaunchDaemons/com.datto.endpoint.plist`,
          `  fi`,
          `done`,
          `# Restart the service and re-read the build — expect it off the known-bad list.`,
          `launchctl kickstart -k system/com.datto.endpoint`,
          `datto-endpoint --version`,
        ].join("\n"),
      };
    }
    return {
      lang: "powershell",
      description: `Re-push known-good Datto Endpoint build ${good} to ${asset.displayName} (keeps prior build for rollback).`,
      source: [
        `# repush_agent_update | ${asset.displayName} | backend: endpoint-agent (safe-write, gated, reversible)`,
        `$cur = (Get-DattoEndpointConfig).AgentVersion`,
        `$knownBad = @('3.0.18','3.0.20')`,
        `"current=$cur (gen ${cur})  known_bad=[$($knownBad -join ', ')]"`,
        `if ($knownBad -contains $cur) {`,
        `  Stop-Service -Name DattoEndpointBackup -Force`,
        `  Start-Process msiexec -ArgumentList '/i','C:\\ProgramData\\Datto\\pkg\\DattoEndpoint-${good}.msi','/qn' -Wait`,
        `}`,
        `# Restart the service and re-read the build — expect it off the known-bad list.`,
        `Restart-Service -Name DattoEndpointBackup`,
        `(Get-DattoEndpointConfig).AgentVersion`,
      ].join("\n"),
    };
  },
  summarize: (asset) =>
    `Re-pushed a known-good agent build to ${asset.displayName} — version off the known-bad list, service healthy.`,
});

// ──────────────────────────────────────────────────────────────────────────────
// buildCatalog + handler list
// ──────────────────────────────────────────────────────────────────────────────

/** All showcase remediation tools (~12) across the five backends. */
export const REMEDIATION_TOOLS: ToolHandler[] = [
  reset_vss_writers,
  force_diff_merge,
  repair_agent_comms,
  rebuild_linux_initramfs,
  reset_cbt,
  force_zfs_retention,
  endpoint_av_exclusion,
  fix_endpoint_throttle,
  reauthorize_oauth,
  salesforce_reconnect,
  resume_offsite_sync,
  repush_agent_update,
];

export {
  reset_vss_writers,
  force_diff_merge,
  repair_agent_comms,
  rebuild_linux_initramfs,
  reset_cbt,
  force_zfs_retention,
  endpoint_av_exclusion,
  fix_endpoint_throttle,
  reauthorize_oauth,
  salesforce_reconnect,
  resume_offsite_sync,
  repush_agent_update,
};

// Re-export the diagnostics so callers can build the whole catalog from one module.
import { DIAGNOSTIC_TOOLS } from "./diagnostics";

/**
 * The full tool catalog: all diagnostic (read) tools + all showcase remediation
 * tools. Hand this to `new ToolRegistry(buildCatalog())` to replace STUB_TOOLS.
 */
export function buildCatalog(): ToolHandler[] {
  return [...DIAGNOSTIC_TOOLS, ...REMEDIATION_TOOLS];
}

// ──────────────────────────────────────────────────────────────────────────────
// failureMode → tool map  (the integration agent uses this)
// ──────────────────────────────────────────────────────────────────────────────

import type { Issue } from "../domain";

export interface ToolsForAsset {
  /** Read tools the agent calls first in triage (and re-calls in verify). */
  diagnostic: ToolHandler[];
  /** The single best-fit remediation for this asset's failure. */
  remediation: ToolHandler;
}

/** A tool's spec applies to an asset when kind + product both match. */
function appliesTo(h: ToolHandler, asset: ProtectedAsset): boolean {
  return (
    h.spec.appliesToKinds.includes(asset.kind) &&
    h.spec.productTypes.includes(asset.productType)
  );
}

/**
 * Choose the right diagnostics + the single best remediation for an asset's
 * failure. Keyed off the asset's failure facets (and the issue's failureModeId
 * when supplied), so the Mock provider / loop pick a coherent, asset-correlated
 * fix per failure. Always returns a remediation that applies to the asset.
 */
export function pickToolsForAsset(asset: ProtectedAsset, issue?: Issue): ToolsForAsset {
  const modeId = issue?.failureModeId ?? "";

  const byName = (name: string): ToolHandler | undefined =>
    [...DIAGNOSTIC_TOOLS, ...REMEDIATION_TOOLS].find((h) => h.spec.name === name);

  // Resolve a remediation by name, falling back to the first applicable tool.
  const remediationByName = (name: string): ToolHandler => {
    const t = byName(name);
    if (t && appliesTo(t, asset)) return t;
    const fallback = REMEDIATION_TOOLS.find((h) => appliesTo(h, asset));
    return fallback ?? reset_vss_writers;
  };
  const diagByNames = (...names: string[]): ToolHandler[] =>
    names
      .map(byName)
      .filter((h): h is ToolHandler => !!h && appliesTo(h, asset));

  // 1) Salesforce / SaaS auth failures.
  if (isSalesforce(asset)) {
    return {
      diagnostic: diagByNames("get_oauth_grant"),
      remediation: remediationByName("salesforce_reconnect"),
    };
  }
  if (isSaasSeat(asset)) {
    return {
      diagnostic: diagByNames("get_oauth_grant"),
      remediation: remediationByName("reauthorize_oauth"),
    };
  }

  // 2) Agentless hypervisor — CBT.
  if (asset.kind === "agentless") {
    return {
      diagnostic: diagByNames("get_backup_chain", "read_event_log"),
      remediation: remediationByName("reset_cbt"),
    };
  }

  // 3) Endpoint failures.
  if (isEndpoint(asset)) {
    if (asset.meteredPaused === false && asset.cbtFilterStatus === "healthy" && asset.status !== "protected") {
      // throttle/transmit deadlock is the most common transmit-side endpoint stall
      return {
        diagnostic: diagByNames("read_event_log"),
        remediation: remediationByName("fix_endpoint_throttle"),
      };
    }
    if (asset.cbtFilterStatus !== "healthy") {
      return {
        diagnostic: diagByNames("get_vss_writers", "read_event_log"),
        remediation: remediationByName("endpoint_av_exclusion"),
      };
    }
    if (asset.supportabilityFlags.length > 0) {
      return {
        diagnostic: diagByNames("read_event_log"),
        remediation: remediationByName("repush_agent_update"),
      };
    }
    return {
      diagnostic: diagByNames("get_vss_writers", "read_event_log"),
      remediation: remediationByName("endpoint_av_exclusion"),
    };
  }

  // 4) Windows / Linux BCDR agent failures — discriminate by facet + failureMode.
  if (isAgent(asset)) {
    const linux = asset.os.family === "linux";
    // 4a) Comms / pairing / sealed.
    if (asset.pairingStatus !== "paired" || /comms|401|driver/.test(modeId)) {
      if (linux && (asset.driverStatus === "pending-reboot" || /driver|dattobd/.test(modeId))) {
        return {
          diagnostic: diagByNames("read_event_log", "get_agent_comms"),
          remediation: remediationByName("rebuild_linux_initramfs"),
        };
      }
      return {
        diagnostic: diagByNames("get_agent_comms", "read_event_log"),
        remediation: remediationByName("repair_agent_comms"),
      };
    }
    // 4b) Linux driver/initramfs.
    if (linux && (asset.driverStatus !== "loaded" || /dracut|initramfs|driver/.test(modeId))) {
      return {
        diagnostic: diagByNames("read_event_log", "get_agent_comms"),
        remediation: remediationByName("rebuild_linux_initramfs"),
      };
    }
    // 4c) VSS writer failure.
    if (asset.vssStatus !== "healthy" || /vss|writer|snapshot/.test(modeId)) {
      return {
        diagnostic: diagByNames("get_vss_writers", "read_event_log"),
        remediation: remediationByName("reset_vss_writers"),
      };
    }
    // 4d) Chain / screenshot / diff-merge.
    if (asset.backupChainState === "needs-diff-merge" || /chain|merge|screenshot/.test(modeId)) {
      return {
        diagnostic: diagByNames("get_backup_chain", "get_screenshot_result"),
        remediation: remediationByName("force_diff_merge"),
      };
    }
    // 4e) Storage pool full → force retention.
    if (/storage|pool|retention/.test(modeId)) {
      return {
        diagnostic: diagByNames("get_zfs_pool"),
        remediation: remediationByName("force_zfs_retention"),
      };
    }
    // 4f) Off-site sync behind.
    if (/offsite|sync|backlog/.test(modeId)) {
      return {
        diagnostic: diagByNames("get_backup_chain"),
        remediation: remediationByName("resume_offsite_sync"),
      };
    }
    // Default agent path: comms repair (safe, broadly applicable).
    return {
      diagnostic: diagByNames("get_agent_comms", "read_event_log"),
      remediation: remediationByName("repair_agent_comms"),
    };
  }

  // 5) Anything else (e.g. share) — generic comms repair fallback.
  return {
    diagnostic: diagByNames("read_event_log"),
    remediation: REMEDIATION_TOOLS.find((h) => appliesTo(h, asset)) ?? reset_vss_writers,
  };
}
