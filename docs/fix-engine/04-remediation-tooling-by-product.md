# Fix Engine 04 — Remediation Tooling by Product (per asset class)

> The concrete tool catalog of the AI-remediation harness, grounded in the real [failure catalog](../02-failure-catalog.md). For each **execution backend** (asset class) it maps representative `FailureMode → diagnostic Tool(s) → remediation Tool(s) → real ScriptArtifact sketch`, marks every artifact's **risk / reversibility / approval**, and shows believable PowerShell / bash / HTTP that the simulated executors run.
>
> Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md). Part of the fix-engine sub-set: [00 — AI remediation overview](00-ai-remediation-overview.md) · [01 — provider abstraction](01-provider-abstraction.md) · [02 — tool catalog & schemas](02-tool-catalog.md) · [03 — execution backends](03-execution-backends.md) · **04 — remediation tooling by product** · [05 — agent loop & session](05-agent-loop-and-session.md).

---

## 0. How to read this doc

This is the **content layer** that fills the structures defined in the fix-engine sub-set. The shape of every artifact here is fixed by the [FIX-ENGINE design contract](00-ai-remediation-overview.md#design-contract):

- **`ExecutionBackend`** — a simulated executor, one per asset class. `BackendKind = "agent-windows" | "agent-linux" | "agentless-hypervisor" | "endpoint-agent" | "saas-api"` ([03 §1](03-execution-backends.md)). Linux vs Windows is chosen from `asset.os.family` / `asset.kind` (see [domain model](../05-domain-model.md#8-key-enums)).
- **`ToolSpec` / `ToolHandler`** — an AI-callable tool that wraps a `RemediationAction` (or adds a read/diagnostic) and emits a `ScriptArtifact` for its declared `backend` ([02 §2](02-tool-catalog.md)). Every automatable action in the [reference action catalog](../06-data-model-and-mock-data.md) becomes a tool; this doc names the **diagnostic** read-tools the agent must call *first*.
- **`ScriptArtifact`** — `{ lang: "powershell" | "bash" | "python" | "http"; source; description }`. **Execution is simulated** — the backend returns believable `stdout`/`exitCode` + a `StateDiff`. No real machine is touched ([contract decision 4](00-ai-remediation-overview.md#locked-decisions)).
- **`ToolRisk`** — `"read" | "safe-write" | "destructive"`, plus `requiresApproval` and `reversible` flags. The [agent loop](05-agent-loop-and-session.md) pauses at every gated step (`awaiting-approval`) and always runs a `preview` (dry-run `StateDiff`) before a `safe-write`/`destructive` `execute`.

### 0.1 Reading the per-backend tables

Each backend section below carries one table with these columns:

| Column | Meaning |
|---|---|
| **FailureMode** | The catalog `id` from [02 — failure catalog](../02-failure-catalog.md) the tooling targets. |
| **Diagnostic tool(s)** | `read` tools the agent calls in `triage` to gather evidence (and again in `verify`). |
| **Remediation tool(s)** | `safe-write` / `destructive` tools that mutate the (simulated) target. |
| **Artifact** | The `ScriptArtifact.lang` + a one-line gist of the real script the tool emits. |
| **Risk / approval / reversible** | `ToolRisk` · gated? · does it declare a compensating action? |

> **Convention (matches the design system):** risk is never color-only in the UI — `ToolCallCard` renders dot + icon + label per [03-design-system](../03-design-system.md). In these tables we use `R` = read, `SW` = safe-write, `D` = destructive; `gate` = `requiresApproval: true`; `rev` = `reversible: true`.

### 0.2 The universal triage-first rule

The agent **must** gather evidence before it plans. For every backend the first turn(s) in the [transcript](05-agent-loop-and-session.md#fixtranscriptturn) are `read` tools. Read tools are never gated, never mutate, and are the same tools re-run in `verify` to prove the symptom cleared (`ToolResult.healed`). A plan that jumps straight to a `safe-write` without a supporting `read` observation is rejected by the loop's plan validator.

---

## 1. Backend `agent-windows` — BCDR agent (Windows)

**Targets:** `ProtectedAsset` where `kind: "agent"`, `productType: "bcdr"`, `os.family: "windows"`. **Channel (simulated):** PowerShell over the Datto Windows Agent control channel; agent comms over ports **25568** (control) / **3260** (iSCSI) / **3262** (MercuryFTP) to **`mothership.dtc.datto.com`**. **Real cmdlets / `vssadmin` / `diskshadow` / service ops** — execution simulated.

### 1.1 Tooling map

| FailureMode | Diagnostic tool(s) | Remediation tool(s) | Artifact | Risk / approval / reversible |
|---|---|---|---|---|
| `vss-writer-snapshot-failure` | `get_vss_writers`, `read_event_log` (VSS source), `get_conflicting_backup_sw` | `restart_vss_writers`, `reinstall_datto_vss_provider`, `force_diff_merge` | PowerShell | `restart_vss_writers` **SW · gate · rev** (restarts services); `reinstall_provider` **SW · gate · rev**; `force_diff_merge` **SW · gate · rev** |
| `vss-export-mid-transfer-dbd-fallback` | `test_agent_ports` (3260/3262), `get_vss_writers`, `get_agent_version` | `reinstall_datto_vss_provider`, `update_shadowsnap` | PowerShell | both **SW · gate · rev** |
| `agent-secure-comms-401` | `get_agent_comms`, `test_agent_ports` (25568/3260/3262), `get_agent_service` | `repair_agent_comms`, `restart_agent_service`, `repair_pairing_cert` | PowerShell | `repair_agent_comms` **SW · auto · rev**; `restart_agent_service` **SW · gate · rev**; `repair_pairing_cert` **SW · gate · rev** |
| `driver-not-loaded-pending-reboot` | `get_agent_driver_status`, `get_pending_reboot` | `schedule_reboot_and_repair`, `rerun_agent_upgrade`, `repair_agent_comms` | PowerShell | `schedule_reboot…` **D · gate · NOT rev** (reboots prod); `rerun_agent_upgrade` **SW · gate · rev** |
| `screenshot-bsod-boot-failure` | `get_screenshot_result`, `get_chain_state` | `force_diff_merge`, `retry_screenshot_alt_controller` (storage-controller cycle), `classify_screenshot_failure` | PowerShell | `force_diff_merge` **SW · gate · rev**; `retry_screenshot…` **SW · auto · rev** |
| `diff-merge-chain-rebuild-long` | `get_chain_state`, `get_volume_root_perms` | `fix_volume_root_perms`, `force_diff_merge` | PowerShell | `fix_volume_root_perms` **SW · gate · rev** |
| `backup-stale-24h-no-recent` | `get_last_recovery_point`, `get_agent_service`, `get_running_jobs` | `force_backup_now`, `kill_hung_backup`, `restart_agent_service` | PowerShell | `force_backup_now` **SW · auto · rev**; `kill_hung_backup` **D · gate · NOT rev** |
| `storage-pool-full-backups-skipped` (appliance ZFS — see §4) | `get_zfs_pool`, `get_top_storage_consumers`, `forecast_days_until_full` | `force_retention`, `apply_suggested_retention`, `delete_orphaned_datasets` | PowerShell / bash | `force_retention` **D · gate · NOT rev**; `delete_orphaned_datasets` **D · gate · NOT rev** |
| `encrypted-agent-resealed-after-reboot` | `get_sealed_agents` | `unseal_agent` (passphrase = `you` step) | PowerShell | `unseal_agent` **SW · gate(you) · rev**; passphrase entry is a human `you` step |

> **Halt note:** the appliance can never recover a **lost passphrase** and must never auto-`force_retention` past an off-site backlog that still pins snapshots. Both conditions are **escalation** outcomes, not auto-fixes ([02 §1.17, §1.18](../02-failure-catalog.md)).

### 1.2 Artifact sketch — VSS writer reset (`restart_vss_writers`)

Risk **safe-write**, **approval-gated** (restarts services on a prod box), **reversible** (writers re-register; compensating action is a no-op + re-query). Diagnostic `get_vss_writers` runs first and again in `verify`.

```powershell
# tool: restart_vss_writers  | backend: agent-windows | risk: safe-write (gated, reversible)
# Diagnose: list writers and flag any not in a stable/no-error state.
$bad = vssadmin list writers |
  Select-String -Pattern 'Writer name|State|Last error' -Context 0,0
$failed = (Get-CimInstance Win32_ShadowCopy -ErrorAction SilentlyContinue) # context only

# Reset path: bounce the VSS plumbing so writers re-register as Stable / No error.
$services = 'VSS','swprv','EventSystem','COMSysApp'   # core VSS + COM+ event plumbing
foreach ($s in $services) {
  Restart-Service -Name $s -Force -ErrorAction Continue
}
# Re-register the VSS/COM components writers depend on (idempotent).
vssadmin list writers   # post-check: every writer should read 'State: Stable', 'Last error: No error'
```

Simulated `ExecResult` returns a `StateDiff` like `{ before: { writersFailed: ["Microsoft Exchange Writer"] }, after: { writersFailed: [] }, note: "5 writers Stable, 0 errors" }`.

### 1.3 Artifact sketch — agent comms repair + cert re-pair (`repair_agent_comms` / `repair_pairing_cert`)

`repair_agent_comms` is **safe-write, self-approving, reversible** (probe + restart). `repair_pairing_cert` is **safe-write, gated, reversible** (regenerates the pairing certificate; compensating action restores the prior cert thumbprint captured in the `StateDiff.before`).

```powershell
# tool: repair_agent_comms | backend: agent-windows | risk: safe-write (auto, reversible)
# 1) Confirm the agent host can reach the mothership on the three control ports.
$mother = 'mothership.dtc.datto.com'
foreach ($port in 25568,3260,3262) {
  $r = Test-NetConnection -ComputerName $mother -Port $port -WarningAction SilentlyContinue
  '{0}:{1} -> {2}' -f $mother,$port, ($(if($r.TcpTestSucceeded){'OPEN'}else{'BLOCKED'}))
}
# 2) Bounce the agent service to re-establish the secure channel (clears Error 401).
Restart-Service -Name 'Datto Windows Agent' -ErrorAction Stop
Start-Sleep -Seconds 3
Get-Service 'Datto Windows Agent' | Select-Object Status, StartType
```

If ports report `BLOCKED`, the agent escalates with a firewall/GPO `you` step (human-in-loop per [02 §1.4](../02-failure-catalog.md)) rather than looping. `repair_pairing_cert` only arms when comms are reachable but the channel still returns 401 after a restart.

### 1.4 Artifact sketch — force differential merge / chain rebuild (`force_diff_merge`)

**Safe-write, gated, reversible** — a merge is storage-intensive and long-running, so it gates on approval and reports an ETA in `ToolProgress`; the chain is not destroyed, so it declares "abort merge, resume normal incrementals" as its compensating action.

```powershell
# tool: force_diff_merge | backend: agent-windows | risk: safe-write (gated, reversible)
# Preconditions surfaced to the approver: chain state + free space headroom.
#   chainState=needs-diff-merge | poolFreePct=22 | est=01:40:00
# Arm the merge for the agent's most recent chain; engine streams progress %.
Invoke-DattoAgentTask -AgentUuid $env:DATTO_AGENT_UUID -Task 'ForceDifferentialMerge' `
  -Reason 'screenshot BSOD 0x7B — rebuild chain before re-screenshot'
# verify step (re-run get_chain_state): expect chainState 'rebuilding' -> 'ok'
```

> `Invoke-DattoAgentTask` / `Get-DattoAgent*` are the engine's **simulated** control-channel cmdlet surface. They stand in for the real agent task API; the `agent-windows` backend resolves them to seeded fleet state, never a live device.

---

## 2. Backend `agent-linux` — BCDR agent (Linux)

**Targets:** `kind: "agent"`, `productType: "bcdr"`, `os.family: "linux"`. **Channel (simulated):** bash / python on the protected Linux host; the Datto Linux Agent uses the **`dattobd`** kernel module for change-block tracking. Recovery-side boot failures surface as `dracut` emergency shell ([02 §4.8](../02-failure-catalog.md)).

### 2.1 Tooling map

| FailureMode | Diagnostic tool(s) | Remediation tool(s) | Artifact | Risk / approval / reversible |
|---|---|---|---|---|
| `agent-secure-comms-401` (Linux) / `cloud-agent-comms-no-fresh-point` | `get_agent_comms`, `test_agent_ports`, `get_dla_service` | `restart_dla_service`, `repair_agent_comms` | bash | `restart_dla_service` **SW · gate · rev**; `repair_agent_comms` **SW · auto · rev** |
| `driver-not-loaded-pending-reboot` (Linux equiv: `dattobd` not loaded) | `get_dattobd_status`, `read_journald` (kernel/dla units) | `reload_dattobd`, `rebuild_initramfs_dracut` | bash | `reload_dattobd` **SW · gate · rev**; `rebuild_initramfs_dracut` **SW · gate · NOT rev** (rebuilds boot image) |
| `cloud-linux-dracut-shell` | `get_screenshot_result`, `read_journald` (boot) | `force_diff_merge`, `open_dracut_playbook` (guided), `assemble_support_package` | bash / python | `force_diff_merge` **SW · gate · rev**; `assemble_support_package` **SW · auto · rev** (read-collect) |
| `filesystem-verification-corruption` | `get_chain_state`, `run_fsck_readonly` | `run_fsck_repair` (guided `you`), `force_diff_merge` | bash | `run_fsck_readonly` **R · auto**; `run_fsck_repair` **D · gate(you) · NOT rev** |
| `backup-stale-24h-no-recent` (Linux) | `get_last_recovery_point`, `get_dla_service` | `force_backup_now`, `restart_dla_service` | bash | `force_backup_now` **SW · auto · rev** |

### 2.2 Artifact sketch — `dattobd` reload + initramfs/dracut rebuild

Diagnostic `get_dattobd_status` is **read**. `reload_dattobd` is **safe-write, gated, reversible**. `rebuild_initramfs_dracut` is **safe-write, gated, NOT reversible** (it overwrites the boot initramfs; compensating action would be restoring the backed-up `.img`, which the script captures first).

```bash
#!/usr/bin/env bash
# tool: reload_dattobd / rebuild_initramfs_dracut | backend: agent-linux | risk: safe-write (gated)
set -euo pipefail

# --- diagnose (get_dattobd_status, read) ---
if ! lsmod | grep -q '^dattobd'; then echo "dattobd: NOT LOADED"; fi
dmesg | grep -i dattobd | tail -n 20 || true
systemctl status dattobd 2>/dev/null | sed -n '1,3p' || true

# --- reload module (reversible: rmmod/modprobe pair) ---
modprobe -r dattobd 2>/dev/null || true
modprobe dattobd
lsmod | grep '^dattobd'    # expect a row -> loaded

# --- rebuild initramfs so the module survives the next boot (NOT reversible in place) ---
KVER="$(uname -r)"
cp -a "/boot/initramfs-${KVER}.img" "/boot/initramfs-${KVER}.img.dtc.bak"   # capture for rollback
dracut --force --add-drivers dattobd "/boot/initramfs-${KVER}.img" "${KVER}"
echo "initramfs rebuilt for ${KVER}; backup at /boot/initramfs-${KVER}.img.dtc.bak"
```

### 2.3 Artifact sketch — fsck + journald inspection

`run_fsck_readonly` is a **read** diagnostic (no `-y`, no repair). The repair variant `run_fsck_repair` is **destructive, gated as a `you` step**, because it must run on an unmounted/quiesced volume — a human window per [02 §1.12](../02-failure-catalog.md).

```bash
#!/usr/bin/env bash
# tool: run_fsck_readonly | backend: agent-linux | risk: read (auto)
# Inspect the agent + kernel journals for FS/IO errors, then dry-run fsck.
journalctl -k -p err --since "-24h" --no-pager | tail -n 40
journalctl -u dattobd -u datto-agent --since "-24h" --no-pager | tail -n 40
TARGET="${DTC_VOLUME:-/dev/sda2}"
fsck -fn "$TARGET"     # -n = answer 'no' to all => read-only audit, never writes
# verify: a clean exit (0) and 'clean' summary clears filesystem-verification-corruption
```

---

## 3. Backend `agentless-hypervisor` — BCDR agentless (VMware / Hyper-V)

**Targets:** `kind: "agentless"`, `productType: "bcdr"`. **Channel (simulated):** the hypervisor management API (VMware vSphere / Hyper-V), addressed in a **PowerCLI-style** surface for VMware and CIM/WMI for Hyper-V. No in-guest agent. Primary failures are **CBT** breakage and **stalled snapshots** ([02 §1.13](../02-failure-catalog.md)).

### 3.1 Tooling map

| FailureMode | Diagnostic tool(s) | Remediation tool(s) | Artifact | Risk / approval / reversible |
|---|---|---|---|---|
| `agentless-snapshot-cbt-failure` | `get_cbt_status`, `get_vm_snapshots`, `get_vmware_tools_version` | `reset_cbt`, `consolidate_snapshots`, `update_vmware_tools_guidance` | http (vSphere API) / powershell (PowerCLI-style) | `reset_cbt` **SW · gate · rev** (toggles CBT, forces one full); `consolidate_snapshots` **SW · gate · rev**; `update_vmware_tools_guidance` **R/guided · auto** |
| `agentless-snapshot-cbt-failure` (stalled snapshot) | `get_vm_snapshots` | `consolidate_snapshots` | powershell | `consolidate_snapshots` **SW · gate · rev** |
| `screenshot-bsod-boot-failure` (agentless) | `get_screenshot_result` | `retry_screenshot_alt_controller`, `force_diff_merge` | powershell | both **SW · auto/gate · rev** |

### 3.2 Artifact sketch — CBT reset (`reset_cbt`)

**Safe-write, gated, reversible.** Resetting CBT forces the *next* backup to be a full (a cost the approver sees), but it is reversible — CBT is re-enabled afterward, and the prior state is captured in `StateDiff.before`. Diagnostic `get_cbt_status` runs first.

```powershell
# tool: reset_cbt | backend: agentless-hypervisor | risk: safe-write (gated, reversible)
# PowerCLI-style surface; resolved by the simulated hypervisor backend, not a live vCenter.
$vm = Get-DtcVM -Uuid $env:DTC_VM_UUID
"ctkEnabled(before) = $($vm.ExtensionData.Config.ChangeTrackingEnabled)"

# 1) Disable CBT and remove stale snapshots so the per-disk ctk files are dropped.
Set-DtcVM -VM $vm -ChangeTrackingEnabled:$false -Confirm:$false
Get-DtcSnapshot -VM $vm | Where-Object { $_.Name -like 'DATTO_*' } |
  Remove-DtcSnapshot -Confirm:$false        # clears any stalled Datto snapshot

# 2) Re-enable CBT; next backup will be a full (surfaced to approver as est. impact).
Set-DtcVM -VM $vm -ChangeTrackingEnabled:$true -Confirm:$false
"ctkEnabled(after)  = $((Get-DtcVM -Uuid $env:DTC_VM_UUID).ExtensionData.Config.ChangeTrackingEnabled)"
```

### 3.3 Artifact sketch — stalled-snapshot consolidation (HTTP form)

For the HTTP variant, the `ScriptArtifact.source` carries a structured request block (the contract's `lang: "http"` convention). **Safe-write, gated, reversible.**

```http
# tool: consolidate_snapshots | backend: agentless-hypervisor | risk: safe-write (gated, reversible)
# diagnose first (get_vm_snapshots, read): GET .../snapshot returns the snapshot tree
POST https://vcenter.dtc.local/api/vcenter/vm/{vm-id}/snapshot/consolidate
Authorization: Bearer {{vsphere_session_token}}
Content-Type: application/json

{ "reason": "datto agentless: clear stalled DATTO_ snapshot, free quiesce lock" }
# expect 204; verify via get_vm_snapshots -> no DATTO_* snapshot remaining, CBT intact
```

VMware Tools is **guidance-only** — the engine cannot push an in-guest install on an agentless target, so `update_vmware_tools_guidance` emits a `you` runbook step rather than a script.

---

## 4. ZFS pool (`agent-windows` backend, appliance scope)

**Targets:** the SIRIS/ALTO **appliance** that owns the `StoragePool` (ZFS) for `kind: "agent"` / `"agentless"` assets. Pool tooling runs on the **appliance** over the `agent-windows` control channel (the appliance hosts the Windows-side control surface) and shells out to ZFS utilities. The defining failure is `storage-pool-full-backups-skipped` ([02 §1.1](../02-failure-catalog.md)).

### 4.1 Tooling map

| FailureMode | Diagnostic tool(s) | Remediation tool(s) | Artifact | Risk / approval / reversible |
|---|---|---|---|---|
| `storage-pool-full-backups-skipped` | `get_zfs_pool`, `get_top_storage_consumers`, `forecast_days_until_full` | `force_retention`, `apply_suggested_retention`, `prune_orphaned_datasets` | bash | `force_retention` **D · gate · NOT rev**; `apply_suggested_retention` **SW · gate · rev** (policy change); `prune_orphaned_datasets` **D · gate · NOT rev** |
| `zfs-pool-faulted-disk` | `get_zfs_pool` (health), `get_raid_controller` | `assemble_support_package`, `open_support_ticket` | bash / http | **read + escalate only** — never auto-repair a faulted pool |

> `zfs-pool-faulted-disk` is **`automatable: false`** in the catalog ([02 §1.18](../02-failure-catalog.md)): drive replacement + scrub are Datto-Support-led. The agent collects diagnostics and **escalates** — it must not emit any `zpool replace` / scrub mutation.

### 4.2 Artifact sketch — pool inspection + days-until-full forecast (read)

`get_zfs_pool` / `forecast_days_until_full` are **read** diagnostics. The forecast is computed from recent daily deltas; it produces the number the approver sees before any retention action.

```bash
#!/usr/bin/env bash
# tool: get_zfs_pool + forecast_days_until_full | backend: agent-windows (appliance) | risk: read
zpool list -H -o name,size,alloc,free,capacity,health
zpool status -x                       # 'all pools are healthy' or a faulted vdev
# top consumers (used by retention planning)
zfs list -H -o name,used,usedsnap -s used | tail -n 10
# days-until-full: free / mean(daily growth over last 14 snapshots)
FREE=$(zpool list -Hp -o free homePool)
GROWTH=$(zfs get -Hp -o value written homePool)   # simplified; backend seeds a 14d mean
echo "days_until_full=$(( FREE / (GROWTH==0?1:GROWTH) ))"
```

### 4.3 Artifact sketch — force retention / prune (`force_retention`, `prune_orphaned_datasets`)

**Destructive, gated, NOT reversible** — these delete recovery points. The approver sees *which* points/agents are affected and the reclaimed-space estimate in the `preview` `StateDiff`. The catalog's human-in-loop boundary — "which points/RPO are safe to cut" — is the approval gate ([02 §1.1](../02-failure-catalog.md)).

```bash
#!/usr/bin/env bash
# tool: force_retention | backend: agent-windows (appliance) | risk: DESTRUCTIVE (gated, NOT reversible)
# PREVIEW (dryRun=true): enumerate snapshots that retention WOULD remove — no deletion.
AGENT="${DTC_AGENT_DATASET:-homePool/agents/win-sql01}"
zfs list -t snapshot -H -o name,used -s creation "$AGENT" | head -n 40   # candidates + reclaim

# EXECUTE (dryRun=false, only after approval): apply the agent's retention schedule now.
datto-retention --agent "$AGENT" --apply --reason "pool 96% full, backups skipped"
# verify (get_zfs_pool): capacity should drop below the skip threshold (~85%)
zpool list -H -o capacity homePool
```

`apply_suggested_retention` is the **reversible** sibling: it changes the retention *policy* (an `AutomationPolicy`, [domain model](../05-domain-model.md)) rather than deleting now, so its compensating action restores the prior schedule.

---

## 5. Backend `endpoint-agent` — Endpoint Backup v1 / v2

**Targets:** `kind: "endpoint"`, `productType: "endpoint-v1" | "endpoint-v2"`. **Channel (simulated):** PowerShell (Windows) or bash (macOS/Linux) on the endpoint, often driven via **Datto RMM** in production; **direct-to-Datto-Cloud, no appliance**. v2 adds the **`cbtfilter`** change-block driver that AV/EDR frequently quarantines, and check-in to **`mothership.dtc.datto.com`** over **443**.

### 5.1 Tooling map

| FailureMode | Diagnostic tool(s) | Remediation tool(s) | Artifact | Risk / approval / reversible |
|---|---|---|---|---|
| `v2-avedr-blocks-cbtfilter` | `get_cbtfilter_status`, `get_chain_state` (diff-merge stuck?) | `apply_av_exclusions`, `reload_cbtfilter`, `reboot_via_rmm` | PowerShell | `apply_av_exclusions` **SW · gate · rev**; `reload_cbtfilter` **SW · gate · rev**; `reboot_via_rmm` **D · gate · NOT rev** |
| `vss-writer-failure` / `v2-vss-prepare-snapshots-failed` | `get_vss_writers`, `get_shadow_storage`, `read_event_log` | `restart_vss_writers`, `clear_stale_shadow_copies`, `force_diff_merge` | PowerShell | `restart_vss_writers` **SW · gate · rev**; `clear_stale_shadow_copies` **SW · gate · rev** |
| `throttle-zero-deadlock` | `get_agent_throttle`, `get_running_jobs` | `set_throttle_floor` (throttle=0 → safe nonzero), `force_backup_now` | PowerShell / bash | `set_throttle_floor` **SW · auto · rev**; `force_backup_now` **SW · auto · rev** |
| `metered-connection-pause` | `get_metered_policy`, `get_network_profile` | `toggle_pause_while_metered`, `unmark_metered_connection` | PowerShell | both **SW · gate · rev** |
| `v2-unrecoverable-points-buggy-agent` / `competing-backup-product` | `get_agent_version` (vs known-bad list), `scan_competing_backup_sw` | `repush_agent_version` (known-good), `guided_uninstall_competitor` | PowerShell / bash | `repush_agent_version` **SW · gate · rev** (re-installable); `guided_uninstall_competitor` **D · gate(you) · NOT rev** |
| `backup-stuck-99-percent` | `get_running_jobs`, `get_hash_cache_state` | `clean_reinstall_agent` (CLEAN_INSTALL=1), `force_backup_now` | PowerShell | `clean_reinstall_agent` **D · gate · NOT rev** (purges cache dirs) |

### 5.2 Artifact sketch — cbtfilter reload + AV exclusions + throttle fix (Windows)

`apply_av_exclusions` / `reload_cbtfilter` are **safe-write, gated** (reboot needed; security team confirms exclusions — a `you` consideration). `set_throttle_floor` is **safe-write, self-approving, reversible** — it only corrects an illegal `0` value that deadlocks the agent ([02 §2.10](../02-failure-catalog.md)).

```powershell
# tool: reload_cbtfilter + set_throttle_floor | backend: endpoint-agent | risk: safe-write
# --- diagnose (read) ---
fltmc filters | Select-String 'cbtfilter'           # present & running?
$thr = (Get-DattoEndpointConfig).BandwidthThrottleKbps
"throttle = $thr Kbps"                               # 0 == deadlock condition

# --- AV/EDR exclusions so the driver isn't quarantined (gated) ---
Add-MpPreference -ExclusionPath 'C:\Program Files\Datto\Endpoint Backup'
Add-MpPreference -ExclusionProcess 'DattoEndpointBackup.exe'
# (Defender shown; real fleets template per-EDR exclusion sets in the artifact.)

# --- reload the change-block filter driver (gated; reboot finalizes) ---
fltmc unload cbtfilter 2>$null; fltmc load cbtfilter
fltmc filters | Select-String 'cbtfilter'           # expect Running

# --- fix throttle=0 deadlock (auto, reversible) ---
if ($thr -eq 0) { Set-DattoEndpointConfig -BandwidthThrottleKbps 51200 }  # 50 Mbps safe floor
```

### 5.3 Artifact sketch — VSS + pause-while-metered

```powershell
# tool: toggle_pause_while_metered + unmark_metered_connection | backend: endpoint-agent
# risk: safe-write (gated, reversible)
# diagnose: is the active connection metered AND is the pause policy on?
$cost = (Get-NetConnectionProfile).NetworkCategory   # context
$paused = (Get-DattoEndpointConfig).PauseWhileMetered
"pauseWhileMetered = $paused"

# remediate: stop pausing on metered links (reversible — flip back to re-enable)
Set-DattoEndpointConfig -PauseWhileMetered $false
# optionally un-mark the Windows connection as metered (per-adapter; reversible)
Set-NetConnectionProfile -InterfaceAlias 'Ethernet' -
# verify (force_backup_now): next backup should start instead of 'paused (metered)'
```

### 5.4 Artifact sketch — known-bad agent re-push (bash, macOS/Linux endpoint)

`repush_agent_version` is **safe-write, gated, reversible** (an agent is re-installable; the prior version is recorded for rollback). It only arms when `get_agent_version` matches the seeded **known-bad list** (e.g. the build that ran diff-merge-as-first-backup, [02 §2.9](../02-failure-catalog.md)).

```bash
#!/usr/bin/env bash
# tool: repush_agent_version | backend: endpoint-agent | risk: safe-write (gated, reversible)
set -euo pipefail
CUR="$(datto-endpoint --version 2>/dev/null || echo unknown)"
KNOWN_BAD="${DTC_KNOWN_BAD:-3.0.18 3.0.20}"
echo "current=$CUR  known_bad=[$KNOWN_BAD]"

for bad in $KNOWN_BAD; do
  if [ "$CUR" = "$bad" ]; then
    echo "match -> repushing known-good build ${DTC_GOOD_VER:-3.0.41}"
    # graceful stop, install pinned-good build, restart (prior pkg kept for rollback)
    launchctl unload /Library/LaunchDaemons/com.datto.endpoint.plist
    installer -pkg "/var/cache/datto/datto-endpoint-${DTC_GOOD_VER:-3.0.41}.pkg" -target /
    launchctl load /Library/LaunchDaemons/com.datto.endpoint.plist
  fi
done
datto-endpoint --version    # verify: version no longer in known-bad list
```

---

## 6. Backend `saas-api` — SaaS Protect / Spanning (Microsoft Graph · Google Workspace · Salesforce)

**Targets:** `kind: "saas-seat" | "salesforce-org"`, `productType: "saas-protect" | "spanning"`. **No host, no script** — every artifact is an **HTTP** request against **Microsoft Graph**, the **Google Workspace Admin SDK**, or the **Salesforce REST API**. Auth is **OAuth 2** ([domain `AuthStatus`](../05-domain-model.md#8-key-enums)). The defining failures are **throttling** (429/503), **OAuth re-consent**, and **license/seat lifecycle**.

### 6.1 Tooling map

| FailureMode | Diagnostic tool(s) | Remediation tool(s) | Artifact | Risk / approval / reversible |
|---|---|---|---|---|
| `saasp-ews-to-graph-reauth` | `get_oauth_grant` (tenant), `check_authorization_status` | `launch_admin_consent` (Global Admin = `you`), `verify_exchange_backup` | http (Graph / OAuth) | `launch_admin_consent` **SW · gate(you) · rev**; `verify_exchange_backup` **R · auto** |
| `spanning-m365-authorize-tenant` / `-reauth-new-permissions` | `get_oauth_grant`, `compare_scopes` (granted vs required) | `launch_admin_consent` (deep link), `recheck_authorization` | http | `launch_admin_consent` **SW · gate(you) · rev** |
| `saasp-sharepoint-teams-throttled-loop` / `spanning-m365-throttle-restart-loops` | `get_throttle_state` (429/503 history), `get_pod_status` | `reschedule_low_throttle_window`, `enable_adaptive_backoff`, `reduce_backup_scope` | http | all **SW · auto/gate · rev** |
| `saasp-seats-archived-aadsts` | `get_oauth_grant`, `decode_aadsts` | `force_seat_rediscovery` (RemoteSeatUpdate), `protect_all_eligible` | http | `force_seat_rediscovery` **SW · auto · rev**; `protect_all_eligible` **SW · gate · rev** (cost) |
| `saasp-exchange-invalid-syncstate` | `get_sync_state` | `reset_sync_state` (full re-sync = re-seed) | http | `reset_sync_state` **SW · gate · rev** (re-seeds from source) |
| `spanning-google-token-revoked-password` | `get_oauth_grant` (revoked?), `list_revoked_tokens` | `send_reauth_link` (user/admin = `you`), `reconnect_google_account` | http | `send_reauth_link` **SW · auto · rev**; `reconnect_google_account` **SW · gate(you) · rev** |
| `spanning-sfdc-initial-api-limit` | `get_sfdc_api_usage` (vs 15% cap), `get_connected_app_status` | `raise_sfdc_api_cap`, `reauth_connected_app`, `schedule_off_hours` | http (Salesforce REST) | `raise_sfdc_api_cap` **SW · gate · rev**; `reauth_connected_app` **SW · gate(you) · rev** |
| `spanning-sfdc-app-wont-render` | `run_sfdc_config_validator` | `enable_connected_apps`, `set_oauth_permitted_users`, `grant_visualforce_access` | http | each **SW · gate · rev** (admin config) |

### 6.2 Artifact sketch — M365 Graph admin re-consent / EWS→Graph reauth (OAuth flow)

**Safe-write, gated as a `you` step** — only a tenant **Global Admin** can consent; the engine launches the flow and polls. Reversible in the sense that consent can be revoked. This is the highest-stakes SaaS fix: orgs that miss the EWS→Graph deadline stop backing up Exchange ([02 §5.2](../02-failure-catalog.md)).

```http
# tool: launch_admin_consent | backend: saas-api | risk: safe-write (gated, you-step, reversible)
# Step 1 — diagnose (get_oauth_grant, read): which Graph scopes are missing for this tenant?
GET https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '{spanning_app_id}'
Authorization: Bearer {{partner_admin_token}}
# -> returns oauth2PermissionGrants; engine diffs granted vs required (Mail.Read, Sites.Read.All …)

# Step 2 — generate the Global Admin consent URL (the 'you' step: admin clicks + approves)
#   admin-consent endpoint (tenant-scoped); state carries the FixSession id for the callback
GET https://login.microsoftonline.com/{tenant_id}/v2.0/adminconsent
    ?client_id={spanning_app_id}
    &scope=https://graph.microsoft.com/.default
    &redirect_uri=https://app.kaseya.com/fix/oauth/callback
    &state={fix_session_id}

# Step 3 — verify (check_authorization_status -> verify_exchange_backup, read)
GET https://graph.microsoft.com/v1.0/users/{mailbox}/messages?$top=1
Authorization: Bearer {{tenant_app_token}}
# 200 => authorized; queue a confirming Exchange backup. 401/403 => still unauthorized, re-prompt.
```

In the [agent loop](05-agent-loop-and-session.md), `launch_admin_consent` parks the session in `awaiting-approval` until the human completes the external consent; the loop **polls** `check_authorization_status` (read) on a backoff and resumes on success or escalates on timeout.

### 6.3 Artifact sketch — SharePoint/Teams 429/503 throttle backoff

**Safe-write, self-approving, reversible** (a schedule change). Diagnostic `get_throttle_state` reads recent 429/503 + any `Retry-After`. The remediation respects Microsoft's `Retry-After` and reschedules into a low-throttle window rather than hammering ([02 §5.1, §6.17](../02-failure-catalog.md)).

```http
# tool: reschedule_low_throttle_window + enable_adaptive_backoff | backend: saas-api
# risk: safe-write (auto, reversible)
# diagnose: read the most recent throttled response for this drive/site
GET https://graph.microsoft.com/v1.0/drives/{drive_id}/root/children?$top=1
Authorization: Bearer {{tenant_app_token}}
# observed -> HTTP/1.1 503 Service Unavailable
#             Retry-After: 1200            (honor this; do not retry sooner)

# remediate: move this repository's backup to the seeded low-throttle window + adaptive backoff
PATCH https://api.kaseya.com/saas/v1/backups/{backup_job_id}/schedule
Authorization: Bearer {{partner_admin_token}}
Content-Type: application/json

{ "window": "01:00-05:00", "backoff": "adaptive", "maxConcurrency": 2,
  "reason": "Graph 429/503 loop on large SharePoint repo — split + off-peak" }
# verify (get_throttle_state): a completed run with no 429/503 within the window
```

### 6.4 Artifact sketch — Salesforce connected-app reauth + API-cap raise

`raise_sfdc_api_cap` is **safe-write, gated** (raising the cap consumes more of the org's daily API allocation — a judgement the admin confirms). `reauth_connected_app` is a **`you`** step (SFDC admin). Diagnostic `get_sfdc_api_usage` reads the org limits first ([02 §6.7, §6.9](../02-failure-catalog.md)).

```http
# tool: raise_sfdc_api_cap | backend: saas-api | risk: safe-write (gated, reversible)
# diagnose (get_sfdc_api_usage, read): how much of the daily API allocation is left?
GET https://{instance}.salesforce.com/services/data/v60.0/limits
Authorization: Bearer {{sfdc_oauth_token}}
# -> DailyApiRequests: { "Max": 1000000, "Remaining": 120000 }
#    Spanning default cap = 15% of Max; too low for the initial backup of a large org.

# remediate: raise Spanning's API-usage cap for this org (reversible — lower it back later)
PATCH https://api.kaseya.com/spanning/v1/orgs/{org_id}/settings
Authorization: Bearer {{partner_admin_token}}
Content-Type: application/json

{ "apiCallCapPct": 40, "schedule": "outside-business-hours",
  "reason": "initial SFDC backup never completes at 15% cap (large org)" }
# verify: re-poll /limits during the next run -> Remaining stays > 0; initial backup completes
```

`reset_sync_state` / **re-seed** (used for `saasp-exchange-invalid-syncstate` and large-mailbox recovery) is **safe-write, gated, reversible**: it discards the corrupt incremental sync cursor and forces a fresh full sync from the source — no customer data is destroyed, but the run is heavy, so the approver sizes it first.

---

## 7. Cross-backend conventions

These rules apply to **every** backend so the catalog stays coherent with the loop and the UI.

### 7.1 Risk → approval defaults

| `ToolRisk` | Default `requiresApproval` | Default in loop | Examples |
|---|---|---|---|
| `read` | `false` | runs freely in `triage` + `verify` | `get_vss_writers`, `get_zfs_pool`, `get_oauth_grant`, `get_cbt_status` |
| `safe-write` | `false` unless blast-radius > threshold **or** declared gated | `preview` (dry-run diff) → `execute` | `repair_agent_comms`, `reschedule_low_throttle_window`, `set_throttle_floor` |
| `safe-write` (gated) | `true` | `awaiting-approval` → `preview` → `execute` | `force_diff_merge`, `reset_cbt`, `launch_admin_consent`, `raise_sfdc_api_cap` |
| `destructive` | `true` (always) | `awaiting-approval` → `preview` → `execute` | `force_retention`, `prune_orphaned_datasets`, `kill_hung_backup`, `clean_reinstall_agent`, `run_fsck_repair`, `reboot_via_rmm` |

The mapping mirrors the existing engine's risk-tiered approvals ([07 §1, §ApprovalRule](../07-troubleshooting-and-automation-engine.md)) and `ActionScope` (`once` / `all-matching` / `always`): a tool applied across `all-matching` raises blast radius and therefore tends to gate even when the single-asset form would self-approve.

### 7.2 Reversibility & compensating actions

Every `safe-write` tool declares either a compensating action or, if none exists, sets `reversible: false` and surfaces that to the approver **before** execution (the contract's rollback-declared-up-front rule, [07 §1.6](../07-troubleshooting-and-automation-engine.md)). Representative compensations:

| Tool | Reversible? | Compensating action |
|---|---|---|
| `repair_pairing_cert` | yes | restore prior cert thumbprint from `StateDiff.before` |
| `reset_cbt` | yes | restore prior `ChangeTrackingEnabled` (next backup re-fulls regardless) |
| `apply_suggested_retention` | yes | restore prior retention `AutomationPolicy` |
| `set_throttle_floor` | yes | restore prior throttle value |
| `launch_admin_consent` | yes | revoke the OAuth grant |
| `force_retention` / `prune_orphaned_datasets` | **no** | deletes recovery points — irreversible; gated + previewed |
| `rebuild_initramfs_dracut` | **no** in place | restores from the `.img.dtc.bak` the script captures first |
| `reboot_via_rmm` / `kill_hung_backup` | **no** | none — disruptive prod action; gated |

### 7.3 Diagnostic (read) tools the agent always has

The agent **must** call the relevant read tool(s) in `triage` and re-call them in `verify`. The canonical read set across backends:

`get_vss_writers` · `read_event_log` · `get_agent_comms` · `test_agent_ports` · `get_agent_service` / `get_dla_service` · `get_agent_driver_status` / `get_dattobd_status` · `get_chain_state` · `get_last_recovery_point` · `get_screenshot_result` · `get_zfs_pool` · `get_top_storage_consumers` · `forecast_days_until_full` · `get_raid_controller` · `get_cbt_status` · `get_vm_snapshots` · `get_vmware_tools_version` · `get_cbtfilter_status` · `get_shadow_storage` · `get_agent_throttle` · `get_metered_policy` · `get_agent_version` · `scan_competing_backup_sw` · `get_oauth_grant` · `check_authorization_status` · `get_throttle_state` · `get_pod_status` · `get_sync_state` · `decode_aadsts` · `get_sfdc_api_usage` · `get_connected_app_status` · `run_sfdc_config_validator`.

### 7.4 Escalation outcomes (no auto-fix exists)

Some catalog modes are `automatable: false` — the agent gathers evidence, assembles a support package, and **escalates** (`FixState: "escalated"`) rather than mutating. These never emit a `safe-write`/`destructive` artifact:

| Backend | Mode | Why escalate |
|---|---|---|
| `agent-windows` (appliance) | `zfs-pool-faulted-disk` | drive replacement + scrub are Support-led |
| `agent-windows` | `bmr-driver-failure` (Code 9999) | hands-on at hardware; driver sourcing |
| `agent-linux` | `cloud-linux-dracut-shell` | HIR/boot expertise; Support |
| `saas-api` | `spanning-loses-access-reindex` | backend re-index is Support-driven |
| any | post-Kaseya support / billing / contract modes | inherently human/business |

The escalation artifact is `assemble_support_package` (a **read**-only collector: logs + agent version + error strings + steps tried), which writes an `ActionRun` of type `assemble-support-ticket` so the AI fix appears in Run history exactly like a manual one ([domain model](../05-domain-model.md), [contract](00-ai-remediation-overview.md#locked-decisions)).

---

## 8. Open design questions

Tracked rather than guessed — see `openQuestions` in the build notes:

1. **Per-EDR exclusion templates.** `apply_av_exclusions` shows Defender; production needs templated exclusion sets per EDR product. Which EDRs do we seed in mock data, and do we name them generically (mandate M7 bans competitor names — applies to security vendors too)?
2. **Appliance backend label.** ZFS/appliance tools currently reuse `agent-windows` (the appliance hosts the Windows control surface). Should the contract add a distinct `appliance` `BackendKind`, or is overloading `agent-windows` acceptable for the mock?
3. **OAuth consent polling bound.** `launch_admin_consent` parks in `awaiting-approval` and polls externally — what is the `maxWallMs` for a human-completed consent before the loop escalates, and does it count against `FixBudget`?
4. **`reboot_via_rmm` blast radius.** A reboot is destructive + irreversible; under `ActionScope: all-matching` it could reboot many prod endpoints. Should fleet-wide reboots be hard-blocked (force `once`/staged) regardless of approval?
