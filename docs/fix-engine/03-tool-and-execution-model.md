# Fix-Engine 03 — Tool & Execution Model

How every automatable `RemediationAction` plus the diagnostics that precede it become **AI-callable tools** with JSON-Schema inputs, risk/approval/reversibility metadata, and a backend; how the **five simulated `ExecutionBackend`s** "run" a real `ScriptArtifact` and return an `ExecResult` + `StateDiff`; and how the simulated executor derives believable output and **heals the asset in the shared mock state**.

Part of the Kaseya Resolution Center fix-engine spec set — see [INDEX](../INDEX.md). Authoritative source for all interfaces and paths is the fix-engine design contract; this doc obeys it. Reads alongside: [fix-engine 01 — providers & loop](01-providers-and-loop.md), [fix-engine 02 — prompts & session](02-prompts-and-session.md), and the app specs [06 data-model](../06-data-model-and-mock-data.md) and [07 automation-engine](../07-troubleshooting-and-automation-engine.md).

---

## 0. Where this fits

The agent loop (fix-engine 01) reasons in a `triage → plan → execute → verify` cycle. **Tools are the only way the loop touches the world.** A read tool gathers evidence in `triaging` and re-checks the symptom in `verifying`; a write tool emits a real script in `executing`. Every tool routes through one of five `ExecutionBackend`s that *simulate* running the script against the shared seeded fleet and return believable output plus a before/after `StateDiff`.

```
loop step ──▶ ToolHandler.run(input, ctx) ──▶ ScriptArtifact ──▶ ExecutionBackend.exec()
                     │                                                    │
                     │  (read tools query mock DB directly,               │  simulated:
                     │   no script, no backend)                          ▼  believable stdout/exit
                     └────────────────────────◀──────────────── ExecResult + StateDiff
                                                                          │
                                                          heals asset in shared @/mock DB,
                                                          writes ActionRun + AuditLogEntry
```

Three hard rules carry over from the app engine ([07 §1](../07-troubleshooting-and-automation-engine.md#1-philosophy--design-contract)) and the contract:

1. **Dry-run is provably side-effect-free.** Every write tool implements `preview()` (returns `dryRun:true`, mutates nothing) distinct from `run()`.
2. **Reversibility is declared up-front.** A tool's `reversible` flag and its action's `compensatingAction` are surfaced before any approval.
3. **Every execution is auditable.** Each `run()` writes an `ActionRun` + `AuditLogEntry` to the shared mock DB so AI fixes appear in Run History / Audit exactly like manual ones ([06 §7](../06-data-model-and-mock-data.md#7-remediation--automation-schemas), [07 §9](../07-troubleshooting-and-automation-engine.md#9-run-history--audit-log)).

---

## 1. The tool interfaces

All four interfaces are normative (from the contract). Domain types (`AssetKind`, `ProductType`, `ProtectedAsset`, `Issue`, `ActionScope`, `RemediationActionId`, `AssetId`, `ActionRunId`, `ISODateTime`) come from the app's `@/types` — reuse, never redefine.

```ts
// fix-engine/src/tools/types.ts
type ToolRisk = "read" | "safe-write" | "destructive";

interface ToolSpec {
  name: string;                 // snake_case, stable: "get_vss_writers", "reset_vss_writers"
  description: string;          // model-facing: when to call it, what it returns
  inputSchema: object;          // JSON Schema (draft 2020-12) — the model's argument contract
  risk: ToolRisk;
  requiresApproval: boolean;    // gate before run() (preview() is always allowed)
  reversible: boolean;          // can a compensating tool undo it?
  appliesToKinds: AssetKind[];  // filters which tools are offered for a given asset
  productTypes: ProductType[];
  actionId?: RemediationActionId; // link to the existing catalog when it maps 1:1
  backend: BackendKind;         // which executor runs it
}

interface ToolContext {
  asset: ProtectedAsset;        // the live record from the shared mock DB
  issue?: Issue;                // the classified failure (carries failureModeId, evidence)
  dryRun: boolean;              // run() honors this too as a belt-and-suspenders guard
  scope: ActionScope;          // once | all-matching | always (drives blast-radius)
  emit(ev: ToolProgress): void; // streams partial progress into the FixSession transcript
}

interface ToolResult {
  ok: boolean;
  summary: string;              // one-line, mono-rich: "Re-paired ACME-DC01 (401 → paired)"
  output: string;              // console text shown in the ToolCallCard (real stdout)
  diff?: StateDiff;            // before/after facet snapshot
  opensTicket?: string;        // for outcome:'opens-ticket' actions, e.g. "DAT-TKT-88213"
  healed?: boolean;            // true if the asset symptom cleared
}

interface ToolHandler {
  spec: ToolSpec;
  run(input: unknown, ctx: ToolContext): Promise<ToolResult>;
  preview(input: unknown, ctx: ToolContext): Promise<ToolResult>;  // dryRun:true, no mutation
}
```

`ToolProgress` is a lightweight stream event so long tools (diff-merge ~25 min) report mid-flight:

```ts
interface ToolProgress { at: ISODateTime; pct?: number; note: string; }
```

### 1.1 Risk taxonomy and how it maps from the catalog

`ToolRisk` is a three-bucket simplification of the catalog's `RiskLevel`/`destructive`/`reversible` fields ([06 §7](../06-data-model-and-mock-data.md#7-remediation--automation-schemas), [07 §2.3](../07-troubleshooting-and-automation-engine.md#23-risk-level--default-gate-rules)). The derivation is mechanical so it can be code-generated:

| Source (`RemediationAction`) | → `ToolRisk` | → `requiresApproval` |
|---|---|---|
| `category:'diagnostic'` OR `actionType` read-only | `read` | `false` |
| `destructive:false` AND `reversible:true` | `safe-write` | `requiresApproval === 'always'` |
| `destructive:true` OR `reversible:false` OR `requiresApproval === 'always'` | `destructive` | `true` |
| Always-gated actions (`reauthorize-oauth`, `unseal-decrypt`, `force-merge`) | `destructive` | `true` |

`requiresApproval` here is the **tool-intrinsic** gate. The loop layers two more gates on top (contract / [07 §6.2](../07-troubleshooting-and-automation-engine.md#62-auto-gate-injection-rules)): `scope === 'always'` always gates, and `scope === 'all-matching'` with a resolved count over the blast-radius threshold gates. The effective gate is the OR of all three. `read` tools never gate.

### 1.2 Diagnostics vs. remediations

- **`read` tools never produce a `ScriptArtifact` and never call a backend.** They query the shared mock DB (`@/mock` fixtures) directly and synthesize realistic device output (see §4). This keeps triage fast and deterministic, and means a misbehaving model can read freely without any approval surface.
- **`safe-write` / `destructive` tools always emit a `ScriptArtifact`** and route through their declared `backend`. Both `run()` and `preview()` build the *same* artifact; `preview()` calls `backend.exec(script, target, { dryRun: true })` and discards the mutation.

---

## 2. RemediationAction → Tool: the mapping rule

The principle (contract): **every automatable `RemediationAction` in the ~70-action catalog becomes one AI-callable Tool.** The catalog already carries most of what a `ToolSpec` needs; the tool layer adds the JSON Schema, the risk bucket, and the backend binding.

```ts
// fix-engine/src/tools/from-action.ts  (codegen seed — one Tool per automatable action)
function toolFromAction(a: RemediationAction): ToolSpec {
  return {
    name: toToolName(a.id),                    // "force-retention" → "force_retention"
    description: a.description,                  // catalog copy, already model-readable
    inputSchema: schemaFromParams(a.params),    // ActionParamSpec[] → JSON Schema (§2.1)
    risk: riskFromAction(a),                     // §1.1 table
    requiresApproval: a.requiresApproval !== 'never',
    reversible: a.reversible,
    appliesToKinds: a.appliesToKinds,
    productTypes: a.productTypes,
    actionId: a.id,
    backend: backendForAction(a),                // §2.2
  };
}
```

`actionType: 'guidance-runbook'` and `'assemble-support-ticket'` map to tools too, but their handlers don't call a host backend — guidance returns a checklist (`outcome:'guidance-only'`), ticket-assembly opens a `DAT-TKT-*` ref (`outcome:'opens-ticket'`) and leaves the asset unhealed (§4.4). Non-automatable catalog entries (pure manual "You" steps with no scriptable form) are exposed to the loop only as `you`-actor `FixPlanStep`s, not as callable tools.

### 2.1 `ActionParamSpec[]` → JSON Schema

Each tool's `inputSchema` is generated from the action's `params` ([06 §7 `ActionParamSpec`](../06-data-model-and-mock-data.md#7-remediation--automation-schemas)). The model fills these arguments; `asset`/`issue` context is injected by the engine via `ToolContext`, never asked of the model.

| `ActionParamSpec.type` | JSON Schema |
|---|---|
| `number` | `{ "type": "number", "minimum": min, "maximum": max }` |
| `string` | `{ "type": "string" }` |
| `boolean` | `{ "type": "boolean", "default": default }` |
| `enum` | `{ "type": "string", "enum": options }` |
| `duration-min` | `{ "type": "integer", "minimum": 1, "description": "minutes" }` |
| `bandwidth-mbps` | `{ "type": "integer", "minimum": 0, "description": "Mbps" }` |
| `required: true` | added to the schema's `required` array |

Example — the `force-retention` tool:

```json
{
  "name": "force_retention",
  "description": "Run force retention on a BCDR appliance pool to reclaim space by pruning recovery points to a target window. Reversible: prior retention is snapshotted.",
  "risk": "safe-write",
  "requiresApproval": false,
  "reversible": true,
  "appliesToKinds": ["agent", "agentless"],
  "productTypes": ["bcdr"],
  "actionId": "force-retention",
  "backend": "agent-windows",
  "inputSchema": {
    "type": "object",
    "properties": {
      "targetRetentionDays": { "type": "integer", "minimum": 1, "maximum": 365, "default": 14 }
    },
    "required": ["targetRetentionDays"]
  }
}
```

### 2.2 Backend selection

`backend` is chosen from the asset class, not picked by the model (contract asset-class execution model):

```ts
function backendForAction(a: RemediationAction): BackendKind {
  // Resolved per-asset at run time when os.family matters; default from primary kind.
  if (a.productTypes.includes('saas-protect') || a.productTypes.includes('spanning')) return 'saas-api';
  if (a.appliesToKinds.includes('endpoint')) return 'endpoint-agent';
  if (a.appliesToKinds.includes('agentless')) return 'agentless-hypervisor';
  return 'agent-windows';  // overridden to 'agent-linux' when ctx.asset.os.family === 'linux'
}
```

The Windows/Linux split is resolved at execution time from `ctx.asset.os.family` (`AgentAsset.os.family` / `EndpointAsset.os.family`), so one tool spec can target both and the engine swaps in the matching backend. SaaS/Spanning tools never run a host script — they emit `http` artifacts (§3.4).

### 2.3 Selected mapping (FailureMode → likely tools → artifact)

Seeded from the failure catalog's `remediationActionIds` ([06 §6 `FailureMode`](../06-data-model-and-mock-data.md#6-failure--alerting-schemas), [02 failure-catalog](../02-failure-catalog.md)). The agent calls the `read` diagnostics first, then the write tools in priority order.

| FailureMode | Diagnostics (read, first) | Remediation tools (write) | Backend · ScriptLang |
|---|---|---|---|
| `vss-writer-snapshot-failure` | `get_vss_writers`, `read_event_log` | `reset_vss_writers` → `restart_agent_service` | agent-windows · powershell |
| `storage-pool-full-backups-skipped` | `get_zfs_pool`, `get_pool_consumers` | `force_retention` → `force_merge` (gated) | agent-windows · powershell |
| `agent-comms-401-unauthorized` | `get_agent_comms`, `probe_port` | `repair_agent_comms` → `restart_agent_service` | agent-windows/linux · ps/bash |
| `chain-needs-diff-merge` | `get_backup_chain`, `get_screenshot_result` | `force_merge` (gated, irreversible) → `rerun_screenshot` | agent-windows · powershell |
| `screenshot-cosmetic-timeout` | `get_screenshot_result` | `increase_wait_time` → `rerun_screenshot` | agent-windows · powershell |
| `cbt-filter-blocked-by-av` | `get_cbt_filter`, `read_event_log` | `apply_av_exclusions` → `restart_services` | endpoint-agent · ps/bash |
| `endpoint-throttle-zero-deadlock` | `get_backup_config` | `set_throttle` (set non-zero) | endpoint-agent · ps/bash |
| `cbt-reset-needed` (agentless) | `get_cbt_status`, `get_snapshots` | `reset_cbt` → `consolidate_snapshots` | agentless-hypervisor · http |
| `saasp-ews-to-graph-reauth` | `get_oauth_grant` | `launch_oauth_consent` (gated) → `force_seat_rediscovery` → `verify_exchange_backup` | saas-api · http |
| `spanning-sf-api-cap` | `get_sf_api_usage` | `raise_api_cap` → `reschedule_backup` | saas-api · http |
| `offsite-sync-behind` | `get_offsite_sync` | `resume_offsite_sync` → `raise_transmit_limit` | agent-windows · powershell |
| `encrypted-agent-sealed` | `get_agent_comms` | `unseal_encrypted_agent` (gated) | agent-windows · powershell |

---

## 3. Execution backends (simulated, per asset class)

Five backends, one per asset class (contract). Each implements `ExecutionBackend`, "runs" a `ScriptArtifact`, and returns an `ExecResult` + `StateDiff`. **No real host is ever touched** — backends are deterministic simulators (§4).

```ts
// fix-engine/src/backends/types.ts
type BackendKind = "agent-windows" | "agent-linux" | "agentless-hypervisor"
  | "endpoint-agent" | "saas-api";
type ScriptLang = "powershell" | "bash" | "python" | "http";

interface ScriptArtifact {
  lang: ScriptLang;
  source: string;        // the real script / for http: a structured request block
  description: string;   // one line shown above the code in the ToolCallCard
}

interface ExecResult { exitCode: number; stdout: string; stderr: string; durationMs: number; diff?: StateDiff; }
interface StateDiff { before: Record<string, unknown>; after: Record<string, unknown>; note?: string; }

interface ExecutionBackend {
  kind: BackendKind;
  exec(script: ScriptArtifact, target: ProtectedAsset, opts: { dryRun: boolean }): Promise<ExecResult>;
  capabilities(target: ProtectedAsset): string[];   // e.g. ["vssadmin","diskshadow","zfs"]
}
```

`capabilities()` lets a handler assert the target supports the script before emitting it (e.g. `agentless-hypervisor` returns `["vsphere-cbt"]` only when `hypervisor === 'vmware'`), and feeds the model's plan rationale.

### 3.1 `agent-windows` — BCDR Windows agent

Simulates PowerShell over the Datto Windows Agent channel. Realistic surface (contract asset-class model): ports **25568 / 3260 / 3262**, mothership `mothership.dtc.datto.com`, real cmdlets / `vssadmin` / `diskshadow` / `Restart-Service`. Targets `AgentAsset{os.family:'windows'}` and BCDR pool ops.

```powershell
# reset_vss_writers — emitted ScriptArtifact.source
$failed = (vssadmin list writers) -match "State: .*FAILED|Last error: .*[^None]"
Stop-Service -Name VSS -Force; Start-Service -Name VSS
Restart-Service -Name 'Datto Backup Agent Service'
vssadmin list writers | Select-String "Writer name|State"
```

### 3.2 `agent-linux` — BCDR Linux agent

bash / python over the Datto Linux Agent: `dattobd`, `dracut`/initramfs, `fsck`, `journalctl`. Selected when `ctx.asset.os.family === 'linux'`.

```bash
# repair_agent_comms (linux) — ScriptArtifact.source
systemctl restart dla-agent
journalctl -u dla-agent --since "10 min ago" | tail -n 20
dbdctl reload && echo "dattobd: tracking re-armed"
ss -tnp | grep -E ':(25568|3260|3262)'   # verify channel
```

### 3.3 `agentless-hypervisor` — BCDR agentless

VMware/Hyper-V management API (no in-guest script). CBT reset, snapshot consolidation. Emits `http` artifacts against the (simulated) vSphere/Hyper-V endpoint.

```
# reset_cbt — http ScriptArtifact.source (structured block)
POST /sdk/vim25/ResetVirtualMachineCBT
Host: vcenter.acme.local
Body: { "vm": "vm-20451", "disableThenEnable": true }
--- then ---
POST /sdk/vim25/ConsolidateVMDisks  { "vm": "vm-20451" }
```

### 3.4 `endpoint-agent` — Endpoint Backup v1/v2

PowerShell (Windows) or bash (macOS) on the endpoint; **direct-to-cloud, no appliance**. CBT filter, VSS, AV exclusions, throttle. Selected for `EndpointAsset`.

```powershell
# apply_av_exclusions — ScriptArtifact.source
$paths = @("$env:ProgramFiles\Datto\Endpoint", "$env:ProgramData\Datto")
Add-MpPreference -ExclusionPath $paths
Add-MpPreference -ExclusionProcess "dattoendpoint.exe","cbtfilter.sys"
Get-Service -Name DattoEndpointBackup | Restart-Service
```

### 3.5 `saas-api` — SaaS Protect / Spanning

No host script — **HTTP artifacts** against Microsoft Graph / Google Workspace Admin / Salesforce REST. OAuth re-consent, re-seed, throttle backoff.

```
# launch_oauth_consent — http ScriptArtifact.source
GET https://login.microsoftonline.com/{tenantId}/adminconsent
  ?client_id={dattoSaaSAppId}&redirect_uri={callback}&scope=https://graph.microsoft.com/.default
--- on consent, verify ---
GET https://graph.microsoft.com/v1.0/users/{upn}/mailFolders?$top=1   # expect 200
```

For `http` artifacts the method/url/headers/body live inside `source` as a structured block (contract). `saas-api.exec()` simulates the round-trip: it parses the block, returns a realistic JSON body + status line as `stdout`, sets `exitCode` from the simulated HTTP status (0 for 2xx), and computes the `StateDiff` on the asset's `authStatus` / seat fields.

---

## 4. The simulated executor — believable output + asset healing

This is the heart of "real script artifacts, simulated execution." Each backend's `exec()` is a pure function of (script, target's current facet state, a per-run PRNG draw) → `ExecResult`. It reuses the app's deterministic runner model ([06 §11](../06-data-model-and-mock-data.md#11-simulated-action-runner-outcome-model)) so the engine and the in-browser `lib/fix-sim` path produce identical results from the same `SEED`.

### 4.1 Output synthesis

`exec()` builds `stdout`/`stderr` from templates keyed on `(backend, tool, target facet)`, interpolated with the asset's real mono identifiers (hostname, `agentVersion`, pool id, error codes from `06` §9.5). Output reflects the *current* state, so a re-run after a fix reads differently:

```
$ reset_vss_writers  →  ACME-DC01
Stopping VSS... OK
Restarting 'Datto Backup Agent Service'... OK
Writer name: 'SqlServerWriter'   State: [1] Stable   Last error: No error
exit 0  (1,240 ms)
```

`durationMs` is drawn from `RemediationAction.estDurationSec ± 20%` jitter (same rule as [07 §8.2](../07-troubleshooting-and-automation-engine.md#82-simulated-runner-behavior)), and long tools stream `ToolProgress` ticks via `ctx.emit`.

### 4.2 Outcome distribution

Deterministically derived from the targeted `FailureMode` + a seeded draw, mirroring [06 §11](../06-data-model-and-mock-data.md#11-simulated-action-runner-outcome-model):

| Action `outcome` | Typical result | `healed` | `StateDiff` |
|---|---|---|---|
| `self-heal` | `exitCode 0`, success summary; ~10% seeded draw → partial (batch) | `true` | facet flips to healthy |
| `opens-ticket` | `exitCode 0`, summary cites `DAT-TKT-88213` | `false` | none (we assisted, didn't fix) |
| `guidance-only` | `exitCode 0`, checklist summary | `false` | none |
| over-threshold / destructive (no approval yet) | short-circuits to `awaiting-approval` upstream | — | none |

### 4.3 Healing the shared mock state

On a healing `run()` (not `preview()`), after `exec()` succeeds the handler **mutates the target asset in the shared `@/mock` DB** so the fleet the user sees and the asset the agent acts on stay in sync (contract: single source of truth). The mutation is the inverse of the failure-injection that created the symptom ([06 §9.5](../06-data-model-and-mock-data.md#95-failure-injection-every-catalog-mode-represented)):

```ts
// inside ToolHandler.run, after a successful self-heal exec
function healAsset(asset: AgentAsset, tool: string, db: MockDB): StateDiff {
  const before = { vssStatus: asset.vssStatus, status: asset.status };
  asset.vssStatus = 'healthy';
  asset.status = recomputeStatus(asset, db);           // 06 §9.7 step 14 rollup
  db.alerts.byAsset(asset.id).forEach(a => a.state = 'auto-resolved');
  db.appendBackupRun(asset.id, { state: 'success', failureModeId: undefined });
  return { before, after: { vssStatus: asset.vssStatus, status: asset.status },
           note: 'SqlServerWriter recovered; status failed → protected' };
}
```

The verify step (§5) then re-runs the diagnostic read tool, which now reads the healed facet and confirms the symptom cleared — closing the troubleshoot → fix → verify loop visibly.

### 4.4 No-heal paths

- `opens-ticket` tools (faulted ZFS drive, BMR Code 9999, IPsec) leave the facet failed and set `ToolResult.opensTicket = "DAT-TKT-88213"`; the loop reports `escalated`/`partial` and assembles a support package.
- `guidance-only` tools (hostname rename, chkdsk guidance) return a checklist; no facet change.

### 4.5 Idempotency & rollback

- **Idempotent by construction.** A tool re-run against an already-healthy facet produces a benign no-op `ExecResult` (`exitCode 0`, "already healthy — nothing to do", empty `diff`). Re-running `reset_vss_writers` on a `healthy` writer is safe.
- **Rollback** uses the action's `compensatingAction` ([07 §2.1](../07-troubleshooting-and-automation-engine.md#21-typescript-sketch)). Every `reversible` tool's `run()` captures a `preChangeSnapshot` into the `StateDiff.before`; the loop can emit the compensating tool (e.g. `restore_retention_settings`) in reverse order, which restores the snapshotted values and re-runs the diagnostic to verify the revert ([07 §8.6](../07-troubleshooting-and-automation-engine.md#86-rollback--undo)). `reversible:false` tools (`force_merge`) declare it and gate; there is no automatic undo.

### 4.6 Dry-run / preview semantics

`preview()` builds the identical `ScriptArtifact` and calls `backend.exec(script, target, { dryRun: true })`. In dry-run the backend computes the projected `StateDiff` (the "After (est.)" column of [07 §7.1](../07-troubleshooting-and-automation-engine.md#71-dry-run-guarantee)) **without writing to the shared DB**: no facet mutation, no `BackupRun` appended, no alert resolved, no `ActionRun` outcome recorded, and `http` artifacts are rendered but not "sent." The diff lets the model — and the human at an approval gate — see exactly what *would* change before committing.

---

## 5. Worked example — VSS writer failure on a BCDR agent

One full pass through `triage → plan → execute → verify` for `AST-WIN-DC01` (the seeded failing agent from [06 §13.1](../06-data-model-and-mock-data.md#131-agentasset-a-real-failing-bcdr-agent--vss-writer-failure)), `mode:'ai'`.

**Asset (live, from shared DB):** `AST-WIN-DC01` · `displayName: ACME-DC01` · `status: failed` · `vssStatus: writer-failed` · `primaryFailureModeId: vss-writer-snapshot-failure` · open alert `ALR-44210` (`0x80042315 — SqlServerWriter failed`).

### Step 1 — triage (read tools, no backend)

The loop offers tools where `appliesToKinds` ∋ `agent` and `productTypes` ∋ `bcdr`. The model calls diagnostics first:

```
tool_call  get_vss_writers { }
tool_result exitCode 0 · "Writer 'SqlServerWriter'  State: [8] FAILED  Last error: 0x800423f3 (VSS_E_WRITER_ERROR_RETRYABLE)"
tool_call  read_event_log { source: "VSS", lastMinutes: 60 }
tool_result exitCode 0 · "Event 8229: A VSS writer has rejected an event... 12 events in the last hour"
```

Evidence confirms the classified `failureModeId`. No mutation, no approval.

### Step 2 — plan

The model proposes a `FixPlan` (fix-engine 01 interfaces):

```jsonc
{
  "summary": "Recover the failed SqlServerWriter and re-run the backup.",
  "confidencePct": 88,
  "rationale": "VSS_E_WRITER_ERROR_RETRYABLE on SqlServerWriter + 12 event-8229 entries → transient writer fault; reset is safe-write and reversible.",
  "steps": [
    { "id": "s1", "intent": "Reset VSS writers", "toolName": "reset_vss_writers", "input": {},
      "actor": "we", "risk": "safe-write", "requiresApproval": false },
    { "id": "s2", "intent": "Restart agent service", "toolName": "restart_agent_service", "input": {},
      "actor": "we", "risk": "safe-write", "requiresApproval": false },
    { "id": "s3", "intent": "Confirm next backup succeeds", "toolName": "get_vss_writers", "input": {},
      "actor": "we", "risk": "read", "requiresApproval": false }
  ]
}
```

No gated step (all `safe-write`, scope `once`), so AI mode proceeds without pausing.

### Step 3 — preview (dry-run)

`reset_vss_writers.preview({})` builds the PowerShell artifact and calls `agent-windows.exec(script, asset, { dryRun: true })`:

```
StateDiff (projected, no mutation)
  before: { vssStatus: "writer-failed", status: "failed" }
  after:  { vssStatus: "healthy",       status: "protected" }
  note:   "Would stop/start VSS and restart 'Datto Backup Agent Service'. No changes made."
```

### Step 4 — execute

`reset_vss_writers.run({})` → `agent-windows.exec(script, asset, { dryRun: false })`:

```
ExecResult
  exitCode: 0  durationMs: 1180
  stdout: "Stopping VSS... OK\nRestarting 'Datto Backup Agent Service'... OK\n
           Writer name: 'SqlServerWriter'  State: [1] Stable  Last error: No error"
  diff:  before { vssStatus:"writer-failed", status:"failed" }
         after  { vssStatus:"healthy",       status:"protected" }
```

`healAsset()` flips `AST-WIN-DC01.vssStatus → 'healthy'`, recomputes `status → 'protected'`, auto-resolves `ALR-44210`, appends a `success` `BackupRun`, and writes the `ActionRun` + `AuditLogEntry`. `ToolResult.healed = true`.

### Step 5 — observe + verify

`restart_agent_service` returns a benign idempotent success (service already restarted). The loop runs the verify diagnostic `get_vss_writers` again — now reading the healed facet:

```
tool_result exitCode 0 · "Writer 'SqlServerWriter'  State: [1] Stable  Last error: No error  — all writers healthy"
```

Symptom cleared → `FixState: succeeded`. The `FixSession.result`:

```jsonc
{ "healed": true,
  "summary": "Recovered SqlServerWriter on ACME-DC01; status failed → protected; next backup succeeded.",
  "actionRunIds": ["ACT-9F2C", "ACT-9F2D"] }
```

The run appears in Run History / Audit identically to a manual fix, and the fleet table row for `ACME-DC01` transitions `failed → protected`.

---

## 6. Open questions

1. **`verificationSteps` as a first-class action field.** [07 §13.4](../07-troubleshooting-and-automation-engine.md#13-open-decisions) flagged that the post-fix verification step per action type is currently implied. The tool layer needs an explicit `verifyToolName` on each remediation tool (e.g. `force_retention → get_zfs_pool`) so the loop's verify phase is deterministic rather than left to the model. Recommend adding it to the codegen.
2. **HTTP artifact representation.** `ScriptArtifact.source` carries the `http` request as a structured text block. Should `saas-api` instead consume a typed `{ method, url, headers, body }` object (cleaner to simulate, harder to render as one "script") — or keep the text block for visual parity with powershell/bash in the `ToolCallCard`?
3. **Batch tools across `all-matching` scope.** §4.2 partial-failure exercises one asset. For a tool invoked over a resolved multi-asset set, is each asset a separate `ExecutionBackend.exec()` call (per-target `ExecResult`s aggregated into one `ToolResult.diff`), or does the tool gain a batch-aware `exec` signature? Affects blast-radius gating and the per-target results UI.
4. **Capability mismatch handling.** When `capabilities(target)` does not include a script's requirement (e.g. `reset_cbt` on a Hyper-V VM that reports no CBT), should the tool refuse pre-emptively (return `ok:false` before any exec) or attempt and surface the realistic backend error? The former is cleaner for the model; the latter is more faithful to real troubleshooting.
