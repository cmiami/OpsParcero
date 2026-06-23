/**
 * Diagnostic (read) tools — the evidence-gathering surface the agent calls FIRST
 * in `triage` and re-calls in `verify`. Per the contract ([fix-engine 03 §1.2]),
 * read tools NEVER emit a ScriptArtifact and NEVER call a backend: they query the
 * shared seeded mock DB directly and synthesize believable device output that is
 * ASSET-CORRELATED (a failing BCDR agent's get_vss_writers shows the failed
 * SqlServerWriter; a SaaS seat with an expired Graph grant shows AADSTS700082).
 *
 * Determinism: every variable draw comes from `rng("<assetId>:<tool>")` (the app
 * PRNG) or stable asset facets — never Math.random()/Date.now(). Output reflects
 * the CURRENT facet state, so a re-run after a heal reads "healthy" and the loop
 * closes the troubleshoot → fix → verify loop visibly.
 */
import { rng, int, pick } from "@/mock/prng";
import type {
  AssetKind,
  ProductType,
  ProtectedAsset,
  AgentAsset,
  AgentlessAsset,
  EndpointAsset,
  SaasSeatAsset,
  SalesforceOrgAsset,
} from "../domain";
import type { ToolHandler, ToolResult, ToolContext } from "./types";
import { DB } from "../shared/fleet";

const ALL_KINDS: AssetKind[] = [
  "agent",
  "agentless",
  "endpoint",
  "saas-seat",
  "salesforce-org",
  "share",
];
const ALL_PRODUCTS: ProductType[] = [
  "bcdr",
  "endpoint-v1",
  "endpoint-v2",
  "datto-cloud",
  "saas-protect",
  "spanning",
];
const AGENTLIKE_KINDS: AssetKind[] = ["agent", "agentless", "endpoint"];
const BCDR_HOST_KINDS: AssetKind[] = ["agent", "agentless"];
const SAAS_KINDS: AssetKind[] = ["saas-seat", "salesforce-org"];

// ── helpers ──────────────────────────────────────────────────────────────────

/** A stable per-(asset,tool) PRNG stream, so diagnostics are byte-identical. */
function stream(ctx: ToolContext, tool: string) {
  return rng(`fix-engine:diag:${ctx.asset.id}:${tool}`);
}

/** A read result helper — read tools never mutate, so before === after. */
function readResult(
  ctx: ToolContext,
  summary: string,
  lines: string[],
  facetBefore: Record<string, unknown>,
  note: string,
  healed?: boolean,
): ToolResult {
  return {
    ok: true,
    healed,
    summary,
    output: lines.join("\n"),
    diff: { before: facetBefore, after: facetBefore, note },
  };
}

function isAgent(a: ProtectedAsset): a is AgentAsset {
  return a.kind === "agent";
}
function isAgentless(a: ProtectedAsset): a is AgentlessAsset {
  return a.kind === "agentless";
}
function isEndpoint(a: ProtectedAsset): a is EndpointAsset {
  return a.kind === "endpoint";
}
function isSaasSeat(a: ProtectedAsset): a is SaasSeatAsset {
  return a.kind === "saas-seat";
}
function isSalesforce(a: ProtectedAsset): a is SalesforceOrgAsset {
  return a.kind === "salesforce-org";
}

/** Open alerts on the asset, for correlating raw error strings into evidence. */
function alertsFor(assetId: string) {
  return DB.alerts.filter((al) => al.assetId === assetId && al.state === "open");
}

/** A short, mono device hostname for output headers. */
function host(a: ProtectedAsset): string {
  return a.displayName;
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. get_vss_writers — VSS writer state (agent-windows / endpoint)
// ──────────────────────────────────────────────────────────────────────────────

const WINDOWS_WRITERS = [
  "Task Scheduler Writer",
  "VSS Metadata Store Writer",
  "Performance Counters Writer",
  "ASR Writer",
  "Registry Writer",
  "COM+ REGDB Writer",
  "System Writer",
  "WMI Writer",
] as const;

const getVssWriters: ToolHandler = {
  spec: {
    name: "get_vss_writers",
    description:
      "List Volume Shadow Copy Service writers on a Windows agent/endpoint and flag any writer not in [1] Stable / 'No error' state. Read-only. Call first when triaging snapshot/VSS failures, and again to verify a reset cleared the fault.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    risk: "read",
    requiresApproval: false,
    reversible: true,
    appliesToKinds: AGENTLIKE_KINDS,
    productTypes: ALL_PRODUCTS,
    actionId: "query-vss-writer-status",
  },
  async run(_input, ctx): Promise<ToolResult> {
    const a = ctx.asset;
    const r = stream(ctx, "vss");
    // A Windows agent with vssStatus 'writer-failed' shows a failed app writer.
    const failed =
      (isAgent(a) && a.vssStatus !== "healthy") ||
      (isEndpoint(a) && a.status === "failed");
    const dbdFallback = isAgent(a) && a.vssStatus === "dbd-fallback";
    const appWriter = pick(r, [
      "SqlServerWriter",
      "Microsoft Exchange Writer",
      "Microsoft Hyper-V VSS Writer",
    ] as const);
    const errCode = pick(r, [
      "0x800423f3 (VSS_E_WRITER_ERROR_RETRYABLE)",
      "0x80042315 (VSS_E_WRITER_INFRASTRUCTURE)",
      "0x800423f4 (VSS_E_WRITER_ERROR_NON_RETRYABLE)",
    ] as const);

    const lines: string[] = [`PS> vssadmin list writers    # ${host(a)}`, ""];
    for (const w of WINDOWS_WRITERS) {
      lines.push(`Writer name: '${w}'`);
      lines.push(`   State: [1] Stable`);
      lines.push(`   Last error: No error`);
    }
    lines.push(`Writer name: '${appWriter}'`);
    if (failed && !dbdFallback) {
      lines.push(`   State: [8] Failed`);
      lines.push(`   Last error: ${errCode}`);
      lines.push("");
      lines.push(
        `>> 1 writer FAILED — '${appWriter}' blocks application-consistent snapshots.`,
      );
    } else if (dbdFallback) {
      lines.push(`   State: [9] Failed during PrepareSnapshot`);
      lines.push(`   Last error: ${errCode}`);
      lines.push("");
      lines.push(
        `>> '${appWriter}' failed mid-transfer — backups fell back to crash-consistent (DBD).`,
      );
    } else {
      lines.push(`   State: [1] Stable`);
      lines.push(`   Last error: No error`);
      lines.push("");
      lines.push(`>> All writers Stable, 0 errors.`);
    }
    return readResult(
      ctx,
      failed || dbdFallback
        ? `${host(a)}: '${appWriter}' writer ${dbdFallback ? "in DBD fallback" : "FAILED"} (${errCode.split(" ")[0]})`
        : `${host(a)}: all VSS writers Stable, no errors`,
      lines,
      { vssStatus: isAgent(a) ? a.vssStatus : "n/a" },
      "read-only — vssadmin list writers, no change",
      !failed && !dbdFallback,
    );
  },
  async preview(input, ctx) {
    return this.run(input, ctx);
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// 2. get_zfs_pool — appliance ZFS pool health + capacity (agent-windows appliance)
// ──────────────────────────────────────────────────────────────────────────────

const getZfsPool: ToolHandler = {
  spec: {
    name: "get_zfs_pool",
    description:
      "Read the SIRIS/ALTO appliance ZFS pool that backs a BCDR agent/agentless asset: size, allocation, capacity %, health, top consumers, and a days-until-full forecast. Read-only. Call before any retention/prune action.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    risk: "read",
    requiresApproval: false,
    reversible: true,
    appliesToKinds: BCDR_HOST_KINDS,
    productTypes: ["bcdr", "datto-cloud"],
    actionId: "show-zfs-pool-health",
  },
  async run(_input, ctx): Promise<ToolResult> {
    const a = ctx.asset;
    const r = stream(ctx, "zfs");
    const appliance = a.applianceId
      ? DB.appliances.find((ap) => ap.id === a.applianceId)
      : undefined;
    const pool =
      appliance &&
      DB.storagePools.find((p) => p.id === appliance.storagePoolId);
    // Fall back to a seeded pool view if the asset has no resolvable appliance pool.
    const capacityBytes = pool?.capacityBytes ?? 24 * 1024 ** 4; // 24 TiB
    const usedBytes =
      pool?.usedBytes ?? Math.round(capacityBytes * (0.86 + r() * 0.12));
    const freeBytes = capacityBytes - usedBytes;
    const capPct = Math.round((usedBytes / capacityBytes) * 100);
    const health = pool?.health ?? (capPct >= 95 ? "degraded" : "online");
    const tib = (b: number) => (b / 1024 ** 4).toFixed(1);
    const poolName = "homePool";

    const consumers = (pool?.topConsumers ?? []).slice(0, 4);
    const dailyGrowthGb = int(r, 120, 480);
    const daysToFull = Math.max(1, Math.floor(freeBytes / 1024 ** 3 / dailyGrowthGb));

    const lines: string[] = [
      `$ zpool list -H -o name,size,alloc,free,capacity,health    # appliance ${appliance?.serial ?? a.applianceId ?? "—"}`,
      `${poolName}\t${tib(capacityBytes)}T\t${tib(usedBytes)}T\t${tib(freeBytes)}T\t${capPct}%\t${health.toUpperCase()}`,
      "",
      `$ zpool status -x`,
      health === "online"
        ? `all pools are healthy`
        : `pool: ${poolName}\n state: ${health.toUpperCase()} — capacity over skip threshold (85%)`,
      "",
      `$ zfs list -H -o name,used -s used | tail -n 5    # top consumers`,
    ];
    if (consumers.length) {
      for (const c of consumers) {
        const asset = DB.assets.find((x) => x.id === c.assetId);
        lines.push(
          `${poolName}/agents/${(asset?.displayName ?? c.assetId).toLowerCase()}\t${tib(c.bytes)}T`,
        );
      }
    } else {
      lines.push(`${poolName}/agents/${host(a).toLowerCase()}\t${tib(usedBytes * 0.31)}T`);
    }
    lines.push("");
    lines.push(
      `days_until_full=${daysToFull}    (free ${tib(freeBytes)}T / ~${dailyGrowthGb} GB·day mean over 14d)`,
    );
    if (capPct >= 85) {
      lines.push("");
      lines.push(
        `>> Pool ${capPct}% full (≥85% skip threshold) — new backups are being SKIPPED. Reclaim space (force retention / prune) before next backup window.`,
      );
    }

    return readResult(
      ctx,
      `${poolName} ${capPct}% full · ${health} · ~${daysToFull}d to full`,
      lines,
      { poolCapacityPct: capPct, poolHealth: health },
      "read-only — zpool list/status, no deletion",
      capPct < 85 && health === "online",
    );
  },
  async preview(input, ctx) {
    return this.run(input, ctx);
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// 3. get_agent_comms — secure channel / pairing / port reachability
// ──────────────────────────────────────────────────────────────────────────────

const MOTHERSHIP = "mothership.dtc.datto.com";
const AGENT_PORTS = [25568, 3260, 3262] as const;

const getAgentComms: ToolHandler = {
  spec: {
    name: "get_agent_comms",
    description:
      "Probe a BCDR/endpoint agent's secure communications: control-channel reachability to the mothership on ports 25568/3260/3262, pairing/cert state, sealed/encrypted state, and last check-in. Read-only. Call when triaging 401-unauthorized, stale, or sealed-agent failures.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    risk: "read",
    requiresApproval: false,
    reversible: true,
    appliesToKinds: AGENTLIKE_KINDS,
    productTypes: ALL_PRODUCTS,
    actionId: "probe-comms-ports",
  },
  async run(_input, ctx): Promise<ToolResult> {
    const a = ctx.asset;
    const r = stream(ctx, "comms");
    const pairing = isAgent(a) ? a.pairingStatus : "paired";
    const sealed = isAgent(a) && a.sealed;
    const portBlocked = pairing === "port-blocked";
    const lastCheckIn = a.recentRuns[0]?.at ?? a.lastGoodBackupAt ?? "unknown";

    const lines: string[] = [
      `PS> foreach ($p in 25568,3260,3262) { Test-NetConnection ${MOTHERSHIP} -Port $p }    # ${host(a)}`,
    ];
    for (const port of AGENT_PORTS) {
      // Only the iSCSI/Mercury data ports flip when the agent reports port-blocked.
      const blocked = portBlocked && (port === 3260 || port === 3262);
      lines.push(
        `${MOTHERSHIP}:${port} -> ${blocked ? "BLOCKED (TcpTestSucceeded: False)" : "OPEN"}`,
      );
    }
    lines.push("");
    lines.push(`PS> Get-DattoAgent | Select-Object PairingStatus, Sealed, LastCheckIn`);
    lines.push(
      `PairingStatus : ${pairing === "paired" ? "Paired" : pairing === "401-unauthorized" ? "401 Unauthorized" : pairing === "cert-expired" ? "Certificate expired" : "Port blocked"}`,
    );
    lines.push(`Sealed        : ${sealed ? "True (passphrase required)" : "False"}`);
    lines.push(`LastCheckIn   : ${lastCheckIn}`);

    const alerts = alertsFor(a.id);
    if (alerts.length && alerts[0].rawError) {
      lines.push("");
      lines.push(`Recent alert raw error: ${alerts[0].rawError}`);
    }

    let summary: string;
    if (sealed) summary = `${host(a)}: agent SEALED after reboot — passphrase required (cannot auto-unseal blindly)`;
    else if (pairing === "401-unauthorized")
      summary = `${host(a)}: secure channel returning 401 Unauthorized — pairing token stale`;
    else if (pairing === "cert-expired")
      summary = `${host(a)}: pairing certificate expired — re-pair required`;
    else if (portBlocked)
      summary = `${host(a)}: data ports 3260/3262 BLOCKED — firewall/GPO escalation (you-step)`;
    else summary = `${host(a)}: channel OPEN, paired, checked in`;

    const _ = int(r, 0, 1); // keep stream advancing deterministically
    void _;
    return readResult(
      ctx,
      summary,
      lines,
      { pairingStatus: pairing, sealed },
      "read-only — Test-NetConnection + agent query, no change",
      pairing === "paired" && !sealed,
    );
  },
  async preview(input, ctx) {
    return this.run(input, ctx);
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// 4. get_backup_chain — ZFS Inverse Chain state + last recovery point
// ──────────────────────────────────────────────────────────────────────────────

const getBackupChain: ToolHandler = {
  spec: {
    name: "get_backup_chain",
    description:
      "Read the image backup chain (ZFS Inverse Chain) state for a BCDR/endpoint asset: chain condition (ok/needs-diff-merge/rebuilding/corrupt), most-recent recovery point, local/cloud storage, and recent run outcomes. Read-only. Call before a force diff-merge and again to verify the chain returned to 'ok'.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    risk: "read",
    requiresApproval: false,
    reversible: true,
    appliesToKinds: AGENTLIKE_KINDS,
    productTypes: ["bcdr", "datto-cloud", "endpoint-v1", "endpoint-v2"],
    actionId: "show-merge-progress",
  },
  async run(_input, ctx): Promise<ToolResult> {
    const a = ctx.asset;
    const chainState =
      isAgent(a) || isAgentless(a) || isEndpoint(a) ? a.backupChainState : "ok";
    const rp = DB.recoveryPoints
      .filter((p) => p.assetId === a.id)
      .sort((x, y) => (x.takenAt < y.takenAt ? 1 : -1))[0];
    const recent = a.recentRuns
      .slice(0, 6)
      .map((run) => `${run.state}@${run.at.slice(11, 16)}`)
      .join("  ");

    const lines: string[] = [
      `PS> Get-DattoAgentChain -AgentUuid <uuid>    # ${host(a)}`,
      `chainState      : ${chainState}`,
      `lastRecoveryPt  : ${rp ? `${rp.id} @ ${rp.takenAt}` : a.lastGoodBackupAt ?? "none"}`,
      `bootable        : ${rp?.bootable ?? "—"}`,
      `localStored     : ${rp?.localStored ?? "—"}    cloudStored: ${rp?.cloudStored ?? "—"}`,
      `recentRuns      : ${recent || "—"}`,
    ];
    if (chainState === "needs-diff-merge") {
      lines.push("");
      lines.push(
        `>> Chain needs a differential merge — incrementals cannot apply until merged. Run force_diff_merge (gated, ~25 min), then re-screenshot.`,
      );
    } else if (chainState === "corrupt") {
      lines.push("");
      lines.push(
        `>> Chain CORRUPT — escalate / take a new full; auto diff-merge will not recover this.`,
      );
    } else if (chainState === "rebuilding") {
      lines.push("");
      lines.push(`>> Chain currently rebuilding — merge in progress.`);
    }

    return readResult(
      ctx,
      `${host(a)}: chain ${chainState}${rp ? `, last RP ${rp.takenAt.slice(0, 16)}` : ""}`,
      lines,
      { backupChainState: chainState },
      "read-only — chain query, no merge",
      chainState === "ok",
    );
  },
  async preview(input, ctx) {
    return this.run(input, ctx);
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// 5. get_oauth_grant — SaaS OAuth grant / scopes / consent (saas-api)
// ──────────────────────────────────────────────────────────────────────────────

const M365_REQUIRED_SCOPES = [
  "Mail.Read",
  "Mail.ReadWrite",
  "Sites.Read.All",
  "Files.Read.All",
  "User.Read.All",
] as const;

const getOauthGrant: ToolHandler = {
  spec: {
    name: "get_oauth_grant",
    description:
      "Read the OAuth 2 grant for a SaaS seat or Salesforce org: authorization status, granted-vs-required Microsoft Graph / Google / Salesforce scopes, and the AADSTS/error code behind a consent failure. Read-only (Microsoft Graph servicePrincipals / oauth2PermissionGrants). Call first for any re-auth/consent failure.",
    inputSchema: {
      type: "object",
      properties: {
        tenantId: {
          type: "string",
          description:
            "Optional tenant/domain to scope the grant lookup; defaults to the seat's tenant.",
        },
      },
      additionalProperties: false,
    },
    risk: "read",
    requiresApproval: false,
    reversible: true,
    appliesToKinds: SAAS_KINDS,
    productTypes: ["saas-protect", "spanning"],
    actionId: "recheck-authorization-status",
  },
  async run(_input, ctx): Promise<ToolResult> {
    const a = ctx.asset;
    const authStatus = isSaasSeat(a) || isSalesforce(a) ? a.authStatus : "authorized";
    const google = isSaasSeat(a) && (a.seatType === "gmail" || a.seatType === "gdrive");
    const salesforce = isSalesforce(a);
    const ok = authStatus === "authorized";

    const lines: string[] = [];
    if (salesforce) {
      lines.push(
        `GET https://{instance}.salesforce.com/services/oauth2/userinfo    # ${host(a)}`,
      );
      lines.push(
        ok
          ? `HTTP/1.1 200 OK   { "active": true, "connected_app": "SpanningBackup" }`
          : `HTTP/1.1 401 Unauthorized   { "error": "invalid_grant", "error_description": "expired access/refresh token" }`,
      );
      lines.push("");
      lines.push(
        `connectedApp(SpanningBackup) : ${ok ? "Enabled" : "Disabled / not visible to user"}`,
      );
    } else if (google) {
      lines.push(`GET https://www.googleapis.com/oauth2/v3/tokeninfo    # ${host(a)}`);
      lines.push(
        ok
          ? `HTTP/1.1 200 OK   { "scope": "https://www.googleapis.com/auth/drive ...", "expires_in": 3210 }`
          : `HTTP/1.1 400 Bad Request   { "error": "invalid_token" }   # token revoked (password change / admin revoke)`,
      );
    } else {
      lines.push(
        `GET https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '{spanning_app_id}'`,
      );
      lines.push(`Authorization: Bearer <partner_admin_token>`);
      lines.push(
        ok
          ? `HTTP/1.1 200 OK   oauth2PermissionGrants: [ all required scopes granted ]`
          : `HTTP/1.1 200 OK   oauth2PermissionGrants: [ MISSING: ${M365_REQUIRED_SCOPES.slice(2).join(", ")} ]`,
      );
      lines.push("");
      lines.push(`Required scopes : ${M365_REQUIRED_SCOPES.join(", ")}`);
      lines.push(
        `Granted scopes  : ${ok ? M365_REQUIRED_SCOPES.join(", ") : M365_REQUIRED_SCOPES.slice(0, 2).join(", ")}`,
      );
      if (!ok) {
        const aadsts = authStatus === "token-revoked" ? "AADSTS700082" : "AADSTS500014";
        lines.push(
          `Verify mailbox  : GET /users/${isSaasSeat(a) ? a.upn : "<upn>"}/messages?$top=1 -> 401 (${aadsts})`,
        );
      }
    }
    lines.push("");
    lines.push(`authStatus : ${authStatus}`);
    if (!ok) {
      lines.push(
        `>> ${salesforce ? "Salesforce connected app disabled/expired" : google ? "Google token revoked" : "M365 Graph consent missing/expired"} — re-authorization required (Global Admin = you-step).`,
      );
    }

    return readResult(
      ctx,
      `${host(a)}: auth ${authStatus}${ok ? "" : " — re-consent required"}`,
      lines,
      { authStatus },
      "read-only — OAuth grant inspection, no consent written",
      ok,
    );
  },
  async preview(input, ctx) {
    return this.run(input, ctx);
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// 6. read_event_log — Windows event log / journald around the failure window
// ──────────────────────────────────────────────────────────────────────────────

const readEventLog: ToolHandler = {
  spec: {
    name: "read_event_log",
    description:
      "Read the host event log (Windows Event Log on Windows agents/endpoints, journald on Linux agents) for a source/provider over a recent window — VSS (8229/12289), Datto agent, disk/IO, or kernel/dattobd events. Read-only. Use to corroborate a VSS, comms, driver, or filesystem failure.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description:
            "Event source/provider to filter, e.g. 'VSS', 'Datto', 'disk', 'dattobd'.",
          default: "VSS",
        },
        lastMinutes: {
          type: "integer",
          minimum: 1,
          maximum: 1440,
          default: 60,
          description: "How far back to read, in minutes.",
        },
      },
      additionalProperties: false,
    },
    risk: "read",
    requiresApproval: false,
    reversible: true,
    appliesToKinds: AGENTLIKE_KINDS,
    productTypes: ALL_PRODUCTS,
  },
  async run(input, ctx): Promise<ToolResult> {
    const a = ctx.asset;
    const r = stream(ctx, "evtlog");
    const args = (input ?? {}) as { source?: string; lastMinutes?: number };
    const source = args.source ?? "VSS";
    const mins = args.lastMinutes ?? 60;
    const linux = isAgent(a) && a.os.family === "linux";
    const failing = a.status === "failed" || a.status === "warning";
    const count = failing ? int(r, 6, 18) : 0;

    const lines: string[] = [];
    if (linux) {
      lines.push(
        `$ journalctl -k -u dattobd -u datto-agent --since "-${mins}min" -p err --no-pager | tail`,
      );
      if (failing) {
        lines.push(
          `kernel: dattobd: snapshot device /dev/dla-snap0 returned EIO while tracking /dev/sda2`,
        );
        lines.push(`datto-agent[2210]: backup transfer aborted: change-tracking reset required`);
        lines.push(`-- ${count} matching entries in the last ${mins} min --`);
      } else {
        lines.push(`-- no error-level entries for dattobd/datto-agent in the last ${mins} min --`);
      }
    } else {
      lines.push(
        `PS> Get-WinEvent -FilterHashtable @{ ProviderName='${source}'; StartTime=(Get-Date).AddMinutes(-${mins}) }`,
      );
      if (failing && source.toUpperCase() === "VSS") {
        lines.push(
          `Event 8229 (Warning): A VSS writer has rejected an event with error 0x800423f3 (VSS_E_WRITER_ERROR_RETRYABLE).`,
        );
        lines.push(
          `Event 12289 (Error):  Volume Shadow Copy Service error: Unexpected error querying for the IVssWriterCallback interface.`,
        );
        lines.push(`-- ${count} ${source} events in the last ${mins} min --`);
      } else if (failing && /datto/i.test(source)) {
        lines.push(
          `Event 401 (Error): Datto agent could not establish secure channel to ${MOTHERSHIP} (HTTP 401).`,
        );
        lines.push(`-- ${count} ${source} events in the last ${mins} min --`);
      } else if (failing) {
        lines.push(
          `Event 51 (Warning): An error was detected on device \\Device\\Harddisk1\\DR1 during a paging operation.`,
        );
        lines.push(`-- ${count} ${source} events in the last ${mins} min --`);
      } else {
        lines.push(`-- no ${source} error/warning events in the last ${mins} min --`);
      }
    }

    return readResult(
      ctx,
      `${host(a)}: ${count} ${source} event(s) in ${mins} min`,
      lines,
      { eventSource: source, windowMin: mins },
      "read-only — event log query, no change",
      count === 0,
    );
  },
  async preview(input, ctx) {
    return this.run(input, ctx);
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// 7. get_screenshot_result — local-verification / screenshot boot test
// ──────────────────────────────────────────────────────────────────────────────

const getScreenshotResult: ToolHandler = {
  spec: {
    name: "get_screenshot_result",
    description:
      "Read the most recent screenshot/local-verification result for a BCDR asset's recovery point: pass/fail, classification (verified / cosmetic-failure / real-boot-failure / indeterminate), the boot signal, and wait time. Read-only. Use to decide whether a screenshot failure is cosmetic (increase wait) or real (rebuild chain / escalate).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    risk: "read",
    requiresApproval: false,
    reversible: true,
    appliesToKinds: BCDR_HOST_KINDS,
    productTypes: ["bcdr", "datto-cloud"],
    actionId: "classify-screenshot-failure",
  },
  async run(_input, ctx): Promise<ToolResult> {
    const a = ctx.asset;
    const r = stream(ctx, "shot");
    const rpIds = new Set(
      DB.recoveryPoints.filter((p) => p.assetId === a.id).map((p) => p.id),
    );
    const verif = DB.screenshotVerifications
      .filter((v) => rpIds.has(v.recoveryPointId))
      .sort((x, y) => (x.ranAt < y.ranAt ? 1 : -1))[0];

    const classification =
      verif?.classification ??
      (a.status === "warning"
        ? "cosmetic-failure"
        : a.status === "failed"
          ? "real-boot-failure"
          : "verified");
    const outcome = verif?.outcome ?? (classification === "verified" ? "passed" : "failed");
    const signal =
      verif?.signal ??
      (classification === "cosmetic-failure"
        ? "Login screen reached but OCR timed out (Ctrl-Alt-Del prompt)"
        : classification === "real-boot-failure"
          ? "STOP 0x0000007B INACCESSIBLE_BOOT_DEVICE"
          : "Desktop reached");
    const waitSec = verif?.waitTimeSec ?? int(r, 60, 180);

    const lines: string[] = [
      `PS> Get-DattoScreenshot -RecoveryPoint <latest>    # ${host(a)}`,
      `outcome        : ${outcome}`,
      `classification : ${classification}`,
      `bootSignal     : ${signal}`,
      `waitTimeSec    : ${waitSec}`,
    ];
    if (classification === "cosmetic-failure") {
      lines.push("");
      lines.push(
        `>> Cosmetic — the VM booted but verification timed out. Increase wait time and re-screenshot; do NOT rebuild the chain.`,
      );
    } else if (classification === "real-boot-failure") {
      lines.push("");
      lines.push(
        `>> Real boot failure (${signal}). Force a diff-merge / rebuild the chain, or cycle the storage controller, then re-screenshot.`,
      );
    }

    return readResult(
      ctx,
      `${host(a)}: screenshot ${outcome} (${classification})`,
      lines,
      { screenshotClassification: classification },
      "read-only — screenshot result query, no re-run",
      outcome === "passed",
    );
  },
  async preview(input, ctx) {
    return this.run(input, ctx);
  },
};

/** All diagnostic (read) tools — the canonical evidence set across backends. */
export const DIAGNOSTIC_TOOLS: ToolHandler[] = [
  getVssWriters,
  getZfsPool,
  getAgentComms,
  getBackupChain,
  getOauthGrant,
  readEventLog,
  getScreenshotResult,
];

export {
  getVssWriters,
  getZfsPool,
  getAgentComms,
  getBackupChain,
  getOauthGrant,
  readEventLog,
  getScreenshotResult,
};

export {
  ALL_KINDS,
  ALL_PRODUCTS,
  AGENTLIKE_KINDS,
  BCDR_HOST_KINDS,
  SAAS_KINDS,
  isAgent,
  isAgentless,
  isEndpoint,
  isSaasSeat,
  isSalesforce,
};
