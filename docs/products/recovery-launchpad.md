# Datto Cloud (Cloud Continuity / DR)

> Deep dive on the cloud tier of the Datto BCDR platform — its entities, DR lifecycle, health semantics, failure modes, and the remediation surfaces the Care Center exposes for it.
> Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md).

---

## 1. Product overview & how it fits the suite

**Datto Cloud (Cloud Continuity / DR)** is not a separate product you buy in isolation — it is the **cloud tier of [BCDR](bcdr.md) and [Endpoint Backup with DR](endpoint-backup.md)**. Local appliance (SIRIS/ALTO) or direct-to-cloud (DEB-DR) backups replicate **off-site into the Datto Cloud**, and from there partners can:

- spin up **cloud virtualizations** (boot a recovery point as a live VM in Datto's cloud);
- run **DR test failovers** through the **Recovery Launchpad**;
- perform **cloud file restores** and **image exports**;
- build **cloud networking** — IPsec site-to-site VPN, public IPs, port forwards, cloud network groups (VLANs);
- run **full cloud DR** including **1-Click DR** (replay a previously tested config) and **failback / return-to-production**.

Where the on-prem appliance ([BCDR](bcdr.md)) owns *taking* the backup and *local* recovery, **Datto Cloud owns the off-site copy and the away-from-site recovery story**. The two are deeply coupled: a comms failure or paused sync on the appliance is *the* reason a fresh point never reaches the cloud, so the Care Center must correlate appliance-side health with cloud-side DR readiness.

```
[Protected machine] --agent/agentless--> [SIRIS/ALTO appliance | DEB-DR agent]
        local backup chain (ZFS)                    |
                                                     | off-site replication
                                                     v
                                            [ DATTO CLOUD ]
        cloud virtualization · screenshot · file restore · image export
        cloud networking (IPsec/public IP) · 1-Click DR · failback
```

**Datto-side automation already present** (the Care Center surfaces, augments, and reasons about it — it does not replace it):
- Nightly **local screenshot verification** of recovery points.
- **Automatic differential-merge** as a self-heal after repeated screenshot/integrity failures.
- **Cloud Deletion Defense (CDD)** — a time-limited cloud "recycle bin" for deleted datasets.
- **1-Click DR** to replay a tested VM/network configuration.

**Reputation context** (drives our product framing): the recovery itself is regarded as highly reliable. Friction is *operational*, not catastrophic data loss — off-site replication backlog, screenshot/virtualization boot failures, and **heavily manual, IPsec-expert-only networking**. Several critical paths (**CDD recovery, resource increases > 8 vCPU/16 GB, reverse-send/failback, BMR driver injection**) still require a human + a Datto Support ticket, not a self-service button. Post-Kaseya support slowness and new-portal UI regressions amplify every failure — which is exactly why the Care Center computes its **own DR-readiness scorecard** rather than trusting native dashboards.

> Cross-references: the cloud failure set overlaps with [BCDR](bcdr.md) (off-site sync, diff-merge, screenshot, BMR) and [Endpoint Backup](endpoint-backup.md) (DEB-with-DR uses this same cloud tier). The full cross-product action taxonomy lives in [failure-catalog](../02-failure-catalog.md); the action/scope/chaining engine is [07 troubleshooting-and-automation-engine](../07-troubleshooting-and-automation-engine.md).

---

## 2. Protected-asset model & DR lifecycle

### 2.1 Entities (see [domain model](../05-domain-model.md) for canonical schema)

| Entity | What it is | Key fields (sketch) |
|---|---|---|
| **CloudAgent** | An agent/share whose chain is replicated off-site. A cloud-side projection of a BCDR/DEB agent. | `agentId`, `sourceDevice`, `protectionType` (agent/agentless/share), `encrypted: boolean`, `offsiteEnabled: boolean` |
| **CloudRecoveryPoint** | A point-in-time snapshot that exists *in the cloud*. | `pointId`, `takenAt`, `replicatedAt`, `verified: 'screenshot'|'local'|'none'`, `integrityOk`, `retentionExpiresAt`, `isConnectingPoint`, `pendingOffsiteSync` |
| **OffsiteSyncJob** | The replication of local points up to the cloud. | `state` (`syncing|paused|backlog|caught-up`), `backlogCount`, `transmitLimitKBs`, `concurrency`, `etaPerAgent` |
| **CloudVirtualization** | A recovery point booted as a live VM in Datto Cloud. | `virtId`, `agentId`, `pointId`, `vcpu` (≤8), `ramGB` (≤16), `storageController` (SATA/SCSI/IDE), `powerOffAfter30Days`, `ageDays`, `state` |
| **CloudNetwork / NetworkGroup** | Cloud VLANs + routing for virtualized VMs. | `subnet` (RFC1918), `gateway`, `publicIP?` (max 1/VM), `portForwards[]`, `ipsecTunnel?` |
| **IpsecTunnel** | Site-to-site VPN between on-prem and the cloud network group. | `phase1`, `phase2`, `ikeMode`, `psk`, `ciphers`, `state` (`up|negotiating|down`) |
| **DrPlan** | A saved, tested 1-Click DR configuration (VMs + networks). | `planId`, `vms[]`, `bootOrder[]`, `networks[]`, `lastTestedAt` |
| **CloudRestore** | A mounted cloud file-restore / image-export session. | `restoreId`, `type` (`file|image`), `pointId`, `mounted: boolean` — **only one of a given type per system at a time** |
| **CddWindow** | Cloud Deletion Defense recovery window for a deleted dataset. | `datasetId`, `deletedAt`, `windowExpiresAt`, `recoverable: boolean` |

### 2.2 Lifecycle

```
LOCAL BACKUP  ──►  OFF-SITE REPLICATION  ──►  CLOUD RECOVERY POINT  ──►  VERIFICATION  ──►  RETENTION
  (appliance)        (OffsiteSyncJob)          (CloudRecoveryPoint)      (screenshot/        (daily age-out
                      backlogCount,             replicatedAt set          local/integrity)    + CDD window
                      transmit limit                                                          on delete)

                                   ──► RECOVERY PATHS (away-from-site) ──►
                                       • Cloud virtualization (boot a point)
                                       • DR test failover (Recovery Launchpad)
                                       • Cloud file restore / image export
                                       • 1-Click DR (replay tested config)
                                       • Failback / return-to-production (reverse-send/RoundTrip)
```

Key lifecycle facts the UI must encode:
- **A cloud point only exists after successful off-site replication.** New/large agents may have **never seeded** — they have *zero* cloud points and need a **RoundTrip** seed drive.
- **Retention runs daily** and ages out cloud points per schedule. **CDD does NOT protect retention-expired points** — only datasets deleted with the agent/share, and only within a time-limited window.
- **Connecting points** and **points pending off-site sync** are protected from *manual* deletion but still age out under normal retention.
- **Cloud VMs auto-power-off and delete after 30 days** by default; **in-cloud data does not sync back to production** unless explicitly reverse-sent/exported before teardown.
- **Encrypted agents re-seal on every appliance reboot** — every cloud restore/virt action then needs the passphrase re-entered. Datto cannot recover a lost passphrase.

---

## 3. Status & health semantics (product-specific)

Status follows the global system (see [design-system](../03-design-system.md)): **never color-only — always dot + icon + label**, severity sort `Failed > Warning > Offline > Syncing > Paused > Protected`, fleet rollup = worst real child state. Datto Cloud adds these **cloud-specific health dimensions**, each rendered as its own column/tile so a tech reads DR readiness at a glance.

| Dimension | States | Token mapping | Meaning |
|---|---|---|---|
| **Off-site sync** | `Caught-up · Syncing · Backlog · Paused · Never-seeded` | Protected / primary-blue(spin) / Warning / Paused(desaturated) / Failed | Is the cloud copy current? |
| **Cloud RPO age** | green ≤ target, Warning approaching, Failed past SLA | success / Warning / Failed | Age of newest cloud point vs RPO. |
| **Last cloud verification** | `Verified · Stale · Failed · Unverified` | success / Warning / Failed / Paused | Last good screenshot/local/integrity result on a *cloud* point. |
| **DR-readiness score** | 0–100 composite (see below) | banded | Care Center's **independent** scorecard — not native dashboard. |
| **Encryption seal** | `Unsealed · Sealed (passphrase needed)` | Protected / Warning | Sealed = cloud virt/restore blocked until passphrase entered. |
| **CDD window** | `n/a · Active (Td left) · Expired` | — / Warning(countdown) / Failed | Recoverability window after a delete. |

**DR-readiness score** (the antidote to weak native reporting — derived from API, per [failure mode #23](#fm23)):
```
DRReadiness = f(
  freshCloudPointExists,          // off-site not stale
  lastScreenshotVerifiedRecently, // verification green
  integrityOk,                    // no filesystem alert
  encryptionUnsealed,             // not blocked on passphrase
  drTestPassedRecently,           // last failover/virt test
  networkPlanValid                // no reserved-subnet/overlap landmines
)
```
A red DR-readiness score with all-green native status is a **headline insight** the Care Center is built to surface.

---

## 4. Failure modes → causes, symptoms & remediation actions

All 23 failures are drawn from `failure-catalog.json` (product: *Datto Cloud Continuity / DR*). For each: **symptom → cause → the Care Center action(s)**, and whether each is **self-serve (one-click)**, **human-in-loop**, or **auto-remediable**. The columns map directly onto the action engine ([07](../07-troubleshooting-and-automation-engine.md)): scope (`once / all-matching / always`), chaining into playbooks, and approval gates.

**Auto-remediation legend:** ✅ = safe to auto-remediate (idempotent, reversible, low blast radius) · ⚠️ = automatable but gate behind approval · 🔒 = human-only (security/physical/irreversible boundary).

### 4.1 Cloud Sync & replication

<a id="fm1"></a>**FM-1 · Off-site replication falls behind; backlog grows until RoundTrip required** `[Cloud Sync]` — freq: common · sev: high · auto: ✅(partial)
- **Symptoms:** "device has not completely synchronized with Datto's servers in over X days"; Backlog Count climbing; new agents never replicated (zero cloud points); cloud RPO drifting.
- **Causes:** initial full of a large new agent saturates uplink; off-site sync not scheduled daily; chain-restart/diff-merge fulls instead of incrementals; transmit speed < daily change rate (guideline **≥100 KB/s per 1 TB protected**); too many concurrent transfers dividing throughput.
- **Care Center actions:** `Resume paused off-site sync` ✅ · `Raise transmit limit / throttle profile` ⚠️ · `Reprioritize a specific agent's replication` ⚠️ · `Open RoundTrip request (pre-filled)` 🔒(logistics) · `Show backlog trend & worst-offender agent` (read).
- **Self-serve vs human:** resume/boost/reprioritize are one-click; **ordering a physical RoundTrip drive is inherently human + mail logistics** — Care Center pre-fills the ticket and flags "Eligible for RoundTrip" when >10 days behind or never-seeded.
- **Errors:** `Offsite Replication - not completely synchronized`.

<a id="fm2"></a>**FM-2 · Cloud sync paused, silently stopping new points** `[Cloud Sync]` — common · medium · auto: ✅
- **Symptoms:** local backups succeed but no new cloud points; off-site sync shows *Paused*; DR readiness silently degrades.
- **Causes:** operator paused during maintenance and never resumed; cloud-backups toggle disabled; pause auto-triggered and left in place.
- **Actions:** `Resume cloud synchronization` ✅ · `Enable cloud backups toggle` ✅ · `Alert when sync paused > threshold` ✅.
- This is the **purest auto-remediation candidate** in the product: detect-paused → one-click/auto resume. The only human judgment is whether a deliberate pause is still needed.

<a id="fm3"></a>**FM-3 · Agent communication failure → no fresh point reaches the cloud** `[Agent Communication]` — **very common** · high · auto: ✅
- **Symptoms:** "Backup failed because of a problem with making a backup request to the agent"; "Backup Failed Due to a Problem Establishing Secure Communications With the Agent"; "Critical Backup Failure: HTTP Could Not Connect to Host" (agentless); agent not checking in → cloud point ages out.
- **Causes:** Datto agent service stopped/corrupt; ports **25568** (comms) / **3262** (transfer) blocked; production machine unreachable at paired IP/host; broken secure key pair; low resources (<1 GB RAM, <20% disk for COW).
- **Actions:** `Repair Agent Communications` ✅ (recreates key pair, ~15–20s) · `Restart Datto agent services via RMM` ⚠️ · `Run port/reachability probe (25568/3262)` ✅(read) · `Force backup & verify off-site replication` ✅ · `Repair/reinstall agent` 🔒(may need on-site hands).
- **Why it matters here:** this is the #1 root cause that *upstream* breaks the cloud DR point. Care Center should **correlate** comms failures to "stale cloud RPO" rather than alerting on both independently.

<a id="fm21"></a>**FM-21 · Failback / return-to-production is slow, manual, irreversible** `[Cloud Sync]` — occasional · high · auto: 🔒
- **Symptoms:** long delay returning cloud-run data home; "This is an irreversible procedure"; local device must be online/checking in first; cloud-side changes don't sync back automatically.
- **Causes:** reverse-send is a manual three-phase process (compress → transmit → decompress) sized by data/bandwidth; converting a virtualization to image-export/file-restore is irreversible; local device must be replaced/restored first; in-cloud data needs manual snapshot/Support to come home.
- **Actions:** `Failback readiness check (device online, diff-merge done)` ✅(read) · `Estimate reverse-send/RoundTrip time from data size` ✅(read) · `Confirmation gate before irreversible conversion` ⚠️(hard gate) · `Open Support scoping request` 🔒.
- **Human-in-loop:** Support scoping, device replacement, re-IP, and conversion sign-off are all human. Care Center's value is the **readiness check + time estimate + the irreversibility gate**, not the action itself.

### 4.2 Screenshot / verification (cloud-point readiness)

<a id="fm4"></a>**FM-4 · Cloud virt / screenshot boots to BSOD 0x0000007B (INACCESSIBLE_BOOT_DEVICE)** `[Local Virtualization]` — common · high · auto: ✅
- **Symptoms:** "Screenshot Verification failure: Blue screen stop code 0x0000007b"; INACCESSIBLE_BOOT_DEVICE on cloud virt/screenshot.
- **Causes:** wrong/missing/corrupt virtual **storage controller** driver for the guest OS; GPO Device Installation Restrictions blocking the virtual disk driver; stale/corrupt point.
- **Actions:** `Cycle storage controller (SATA/SCSI/IDE) & retry` ✅ (SATA/SCSI for Vista+, IDE for legacy) · `Force differential merge` ⚠️ · `Take fresh backup & re-screenshot` ✅ · `Flag GPO Device Installation Restrictions on source` (read, source-side fix is admin).
- **Auto path:** auto-cycle SATA→SCSI→IDE, retry screenshot, then auto-diff-merge after N failures (Datto already self-heals via diff-merge).

<a id="fm5"></a>**FM-5 · Screenshot false-failure: blank/black image, screensaver, wait-time too short** `[Screenshot]` — common · medium · auto: ✅
- **Symptoms:** "Blank image or image of Windows loading"; black screen (display powered off); captured mid-boot before login.
- **Causes:** source screensaver/power-saving display timeout replicating to the VM; VM not finished booting when captured (wait time too short); slow boot.
- **Actions:** `Increase Additional Wait Time & re-screenshot` ✅ · `Recommend source power-plan/screensaver change` (read) · `Auto-tune wait time after N failures` ✅.
- **Key framing:** these are **false-failures masking real DR readiness** — the Care Center should let techs *classify cosmetic vs real* and auto-tune wait time rather than paging on every cosmetic miss.

<a id="fm6"></a>**FM-6 · Screenshot stuck on "Getting Devices Ready" / extended boot** `[Screenshot]` — common · medium · auto: ✅
- **Symptoms:** "Getting Devices Ready" Windows screen; VM reboots mid-screen; pending Windows Update/chkdsk preventing login.
- **Causes:** boot longer than wait window; **pending Windows Update on source (screenshots won't run with one pending)**; queued chkdsk; hanging startup service.
- **Actions:** `Increase wait time & retry` ✅ · `Check/clear pending Windows Updates (RMM)` ⚠️ · `Launch local virtualization for Event Viewer diagnostics` (read/human) · `Force differential merge` ⚠️.
- **Escalation:** VM rebooting *during* "Getting Devices Ready" → open a Datto Support ticket.

<a id="fm7"></a>**FM-7 · Screenshot edge cases: long hostname, NIC-required boot, multiple bootloaders** `[Screenshot]` — occasional · medium · auto: 🔒(detect only)
- **Symptoms:** fails on hostname ≥50 chars; NIC-required machines fail (screenshot VM attaches no NIC); "Failed Virtualizations with Multiple Bootloaders"; "BOOTMGR is missing"; AD blue screen on virtualized DC.
- **Causes:** hostname length ≥50; screenshot intentionally attaches no NIC; multiple OS bootloaders confuse boot-param detection; DC virtualized without proper handling.
- **Actions:** `Run DR-readiness lint (hostname length, NIC/bootloader risks)` ✅(detect) · `Validate via full virtualization instead of screenshot` (human) · `Flag domain controllers for special handling` (detect).
- **Detection automatable, remediation source-side** (rename host, edit bootloaders). Lint these **before a real failover**, not after.

<a id="fm22"></a>**FM-22 · Filesystem/integrity check fails on cloud point; chain needs diff-merge** `[Backup Chain]` — common · medium · auto: ✅
- **Symptoms:** filesystem integrity alert; screenshot/file-restore fails due to corruption replicated from source; chain at risk of full restart.
- **Causes:** critical filesystem errors in a snapshot (usually replicated from source); source disk corruption (needs chkdsk); chain inconsistency.
- **Actions:** `Force differential merge` ✅ (acts as a consistency check that audits + corrects, lets incrementals continue without a full restart) · `Auto-diff-merge after N integrity/screenshot failures` ✅(policy) · `Push chkdsk guidance to source (RMM)` ⚠️ · `Re-verify on post-merge point` ✅.
- Diff-merge is the **central self-heal primitive** across cloud failures (FM-4, FM-6, FM-16, FM-22) — expose it as a first-class action with progress/ETA.

### 4.3 Cloud virtualization & DR boot

<a id="fm8"></a>**FM-8 · Linux cloud virt drops to Dracut Emergency Shell** `[Local Virtualization]` — occasional · high · auto: 🔒
- **Symptoms:** "Starting Dracut Emergency Shell"; RHEL/CentOS/Fedora VM won't reach login in cloud/local virt.
- **Cause:** `dracut` binary not on the root volume → Hardware Independent Restore (HIR) can't rebuild initramfs for virtual hardware.
- **Actions:** `Force differential merge & retry virtualization` ⚠️ · `Open guided Linux dracut playbook` (human) · `Escalate to Datto Support (HIR)` 🔒.
- **Source-side Linux/root work**; HIR internals may require Support.

<a id="fm9"></a>**FM-9 · Encrypted-agent cloud virt stalls on passphrase / fails to unseal** `[Local Virtualization]` — occasional · high · auto: 🔒
- **Symptoms:** virt waits at passphrase modal; "Windows has not returned any iSCSI disks"; `bk005: Backup failed because backup image files have not been decrypted`; datastore not re-created after power-cycle.
- **Causes:** encrypted agent not unsealed after device reboot (passphrase required for *every* restore/virt action); passphrase not entered at launch; host power-cycled mid-restore.
- **Actions:** `Prompt for passphrase / unseal agent` 🔒(secure entry only — never store/automate) · `Warn before device reboot about sealed encrypted agents` ✅ · `Re-run virtualization on fresh point after unseal` ✅.
- **Hard security boundary:** Datto cannot recover/bypass a passphrase; lost passphrase = unrecoverable. Care Center automates **detection + warning + secure prompt**, never the secret.

<a id="fm12"></a>**FM-12 · Virtualized DC / domain-joined VM fails authentication during failover** `[Local Virtualization]` — occasional · high · auto: 🔒
- **Symptoms:** "The trust relationship between this workstation and the primary domain failed"; "Logon failure: the target account name is incorrect"; "The local device name is already in use"; can't authenticate on cloud VM.
- **Causes:** AD doesn't recognize the virtualization as production; no DC in the isolated test network; machine-account/trust mismatch.
- **Actions:** `Pre-DR check: local admin account present` ✅(detect) · `Pre-DR check: DC included in failover network` ✅(detect) · `Guided AD trust-repair playbook` (human).
- **Pre-DR linting is the win:** flag "domain-only credentials, no DC in test network" *before* a real failover; require a local admin account exists (Datto can't create one or bypass login).

<a id="fm18"></a>**FM-18 · Cloud VM throttled / can't scale past 8 vCPU & 16 GB without Support** `[Local Virtualization]` — occasional · medium · auto: ⚠️
- **Symptoms:** poor I/O performance; can't exceed 8 vCPU / 16 GB self-service; 5+ VMs may need migration with significant setup time.
- **Cause:** default Recovery Launchpad cap; larger requests need Support approval/migration.
- **Actions:** `Right-size VM within caps` ✅ · `One-click 'Request resource increase' (pre-filled ticket)` 🔒 · `Recommend sizing from observed load` ✅(read).
- Sizing *within* caps is self-service; over-cap is a **pre-filled Support ticket** showing current vs desired vCPU/RAM — surface it ahead of a real DR, not during one.

<a id="fm19"></a>**FM-19 · Cloud virt auto-powers-off & deletes after 30 days / test data wiped** `[Local Virtualization]` — occasional · high · auto: ✅
- **Symptoms:** cloud VM unexpectedly powered off after 30 days; virtualization deleted; in-VM work lost; "All test data will be deleted at the conclusion of the test."
- **Causes:** default "Power off after 30 Days"; VMs not supporting an active continuity event auto-deleted; in-cloud data not synced back.
- **Actions:** `Toggle 30-day auto power-off` ✅ · `Alert on VM age / pending auto-deletion` ✅ · `Prompt to capture/reverse-send in-cloud data before teardown` ⚠️.
- **Countdown + capture-before-delete prompt** is the critical safeguard — in-cloud data does *not* flow back automatically.

### 4.4 Cloud networking (IPsec-expert-heavy)

<a id="fm10"></a>**FM-10 · Cloud network conflicts: reserved subnets, RFC1918 rules, gateway 0.0.0.0** `[Networking]` — occasional · high · auto: ✅(validate)
- **Symptoms:** network creation rejected for a reserved subnet; cross-VLAN VMs can't communicate; certain 10.x / 192.168.122.0/24 ranges rejected; gateway/on-prem subnet rejected for 0.0.0.0.
- **Causes:** Datto **reserves specific subnets** (10.30.130.0/24, 10.40.40.0/24, 10.50.15.0/24, 10.82.16.0/24, 10.90.15.0/24, 10.110.15.0/24, 10.160.15.0/24, 10.162.15.0/24, 10.210.15.0/24, 192.168.122.0/24); networks must be RFC1918-compliant; 0.0.0.0 not permitted; IP overlap causes lost access/whole-network shutdown during a test.
- **Actions:** `Validate cloud subnet plan (reserved/overlap/RFC1918)` ✅ · `Auto-suggest a safe non-conflicting subnet` ✅ · `Pre-map production-to-cloud subnets` (planning).
- **A pre-create validator** that blocks reserved/overlapping/non-RFC1918 subnets is a high-value, fully automatable guardrail.

<a id="fm11"></a>**FM-11 · Site-to-site IPsec VPN to Datto Cloud won't establish** `[Networking]` — occasional · high · auto: 🔒
- **Symptoms:** tunnel fails to come up; drops after Recovery Launchpad cipher changes; only one tunnel per Secure Edge gateway + cloud VLAN; "Site to Site VPN not available on SIRIS Private".
- **Causes:** Phase 1/Phase 2 mismatch; PSK / IKEv1-vs-IKEv2 mismatch; **non-FIPS ciphers being removed** break legacy configs; on-prem WAN IP unreachable; feature unavailable on SIRIS Private.
- **Actions:** `Show IPsec tunnel status / negotiation logs` (read) · `Generate matching on-prem config snippet` ✅(generate) · `Run FIPS cipher-compatibility check` ✅ · `Validate WAN reachability` ✅(probe).
- **Expert-only, human-driven:** Datto Support deliberately gives minimal help due to equipment variety. Care Center can't auto-configure arbitrary firewalls but **emits a matching config snippet, shows Phase1/Phase2 negotiation state, and runs a cipher-compatibility check** — turning IPsec from a black box into a guided wizard.

<a id="fm13"></a>**FM-13 · Public IP / port-forward access fails or constrained (1 public IP per VM)** `[Networking]` — occasional · medium · auto: ✅
- **Symptoms:** can't reach a cloud VM's public service; need >1 public IP but limited to one; misconfigured port forwarding; RDP/3389 exposure flagged as brute-force/ransomware risk.
- **Causes:** hard **1-public-IP-per-VM** limit; port-forward misconfig; default deny-all inbound; exposing 3389 invites attacks.
- **Actions:** `Configure port-forward for a public service` ✅ · `Warn on RDP/3389 public exposure` ✅ · `Flag VMs exceeding 1-public-IP limit` ✅(detect).

### 4.5 Data protection, retention & restore

<a id="fm14"></a>**FM-14 · Cloud snapshots deleted with agent/share; recovery needs CDD + Support** `[Backup Chain]` — occasional · **critical** · auto: ✅(request only)
- **Symptoms:** cloud snapshots gone after an agent/share deleted (accidental/malicious); off-site DR points missing; need to know if recoverable within the CDD window.
- **Causes:** deleting an agent/share via Remote Web deletes its cloud snapshots; **CDD provides only a time-limited window** and does *not* protect retention-expired points, SIRIS Private, or old disconnected chains, and requires off-site replication enabled.
- **Actions:** `One-click CDD recovery request (pre-filled)` ⚠️ · `Confirm-before-delete guardrail with CDD reminder` ✅ · `Show remaining CDD window timer` ✅ · `List recently deleted cloud datasets` ✅.
- **No self-service CDD restore button exists** — recovery is gated behind a Support ticket and **speed of human escalation decides success**. Care Center's job: a deletion **guardrail** up front, and a **pre-filled, time-stamped CDD request + countdown** after.

<a id="fm15"></a>**FM-15 · Retention silently expired the cloud DR point you needed** `[Backup Chain]` — occasional · high · auto: ✅(warn)
- **Symptoms:** a specific older point needed for DR/compliance is gone; retention removed cloud points CDD can't bring back; can't manually delete points flagged for off-site sync / connecting points.
- **Causes:** retention runs daily per schedule; **CDD does not prevent retention removal**; connecting points + pending-sync points are protected from *manual* deletion but normal retention still ages them out.
- **Actions:** `Audit retention vs RPO/compliance` ✅ · `Warn before a critical point expires` ✅ · `Extend retention schedule` ⚠️ · `Lock/preserve a specific point` ⚠️(where supported).
- **Proactive modeling:** "point X expires in N days" beats discovering the gap during a DR event. Retention-aged cloud data is generally **unrecoverable** (CDD won't help).

<a id="fm16"></a>**FM-16 · Cloud file restore / image export fails to mount (or only one allowed)** `[File Restore]` — occasional · medium · auto: ✅
- **Symptoms:** "File Restore fails to mount a volume"; "There was a problem starting the restore"; error because one cloud restore of that type already mounted; restore share prompts for credentials.
- **Causes:** **only one cloud restore of a given type per system at a time**; filesystem corruption on the point; SMB2/SMB3 Guest-access GPO blocking the share; agent out of date.
- **Actions:** `Unmount existing cloud restore & retry` ✅ · `Retry restore on a previous point` ✅ · `Force differential merge + chkdsk guidance` ⚠️ · `Open Support ticket to repair mount` 🔒.
- Unmount-and-retry / point-selection / diff-merge are automatable; **persistent unmountable volumes need Support to repair the mount manually**.

<a id="fm17"></a>**FM-17 · BMR into hardware fails on missing NIC/MSD drivers in WinPE (Code 9999)** `[BMR]` — occasional · high · auto: 🔒
- **Symptoms:** "Bare Metal Restore encountered an error. (Code 9999)"; WinPE can't find NIC / Mass Storage Controller drivers; BMR can't see network or target disk; **logs lost after reboot**.
- **Causes:** WinPE missing/wrong-path drivers for NIC or MSD (RAID cards common); drivers need separate injection for dissimilar hardware; BMR logs on RAM disk wiped on reboot.
- **Actions:** `Recommend/serve NIC+MSD driver pack for target hardware` ✅(library) · `Reminder to capture RAM-disk logs before reboot` ✅(prompt) · `Open Code 9999 Support escalation with logs` 🔒.
- **Largely manual + on-site.** Care Center hosts a **hardware→driver-pack lookup**, a **"capture logs before reboot" reminder**, and a pre-filled escalation. (Shared remediation surface with [BCDR](bcdr.md) and [Endpoint Backup](endpoint-backup.md) BMR.)

### 4.6 1-Click DR & orchestration

<a id="fm20"></a>**FM-20 · 1-Click DR plan replay has manual gaps: boot order, passphrases, VPN, IP overlap** `[BMR]` — occasional · high · auto: ✅(partial)
- **Symptoms:** VMs not auto-booted (manual power-on in order); passphrases re-entered by hand; VPN connections not re-established; cloning blocked by IP overlap; deleted source network → VM lands on simple networking and must be re-edited.
- **Causes:** 1-Click DR clones VM + network config from a prior successful test but **does not orchestrate boot order, passphrases, or VPN**; IP-overlap guard prevents cloning onto active assignments; original network deleted.
- **Actions:** `Orchestrate ordered VM boot` ⚠️ (DC first, dependency order) · `Pre-flight IP overlap / missing-network check` ✅ · `Re-create VPN tunnels from saved config` ⚠️ · `Prompt for encryption passphrases in sequence` 🔒.
- **The orchestration gap is the product opportunity:** boot-order sequencing + pre-flight overlap check are automatable; passphrase entry stays a security boundary. This is where the **Care Center playbook engine** ([07](../07-troubleshooting-and-automation-engine.md)) adds the most value — a chained, ordered, gated DR runbook.

### 4.7 Vendor / support friction

<a id="fm23"></a>**FM-23 · Slow support & new-portal UI regressions slow real-time DR troubleshooting** `[Licensing/Seats]` — common · medium · auto: ✅(compensate)
- **Symptoms:** support slow/hard to reach post-Kaseya; "Nothing works on the new platform"/missing features; inconsistent dashboard; weak reporting/alerting (tool worked ~90–92% of the time).
- **Causes:** support/onboarding quality regression; UI changes that removed/broke features; reporting/alerting gaps hiding DR readiness.
- **Actions:** `Compute independent DR-readiness scorecard from API` ✅ · `Template/auto-fill Support escalations` ✅ · `Track open ticket SLAs` ✅.
- **This failure mode is the Care Center's reason to exist for Datto Cloud:** compute our **own** DR-readiness scorecard (last good screenshot, off-site lag, last successful test) from the API rather than trusting native dashboards, and template every Support escalation.

---

## 5. Auto-remediation posture (summary)

How the failures map onto the action engine's scope model (`once / all-matching / always`):

| Posture | Failures | Notes |
|---|---|---|
| **Safe to auto (✅, can be "always")** | FM-2 resume sync · FM-5/FM-6 wait-time auto-tune · FM-4 controller cycle + diff-merge · FM-22 auto-diff-merge · FM-19 age alerts · FM-10 subnet validate · FM-15 expiry warnings · FM-14 deletion guardrail · FM-23 scorecard | Idempotent, reversible, low blast radius. Good candidates for "always going forward" auto-remediation with audit. |
| **Gate behind approval (⚠️)** | FM-1 raise transmit/reprioritize · FM-3 RMM service restart · FM-6 push Windows Update · FM-16/FM-8 force diff-merge + chkdsk · FM-18 right-size · FM-20 ordered boot / VPN re-create | Touch production, change throughput, or reboot — require human approval per [07](../07-troubleshooting-and-automation-engine.md). |
| **Human-only (🔒)** | FM-1 RoundTrip order · FM-9/FM-20 passphrase entry · FM-11 IPsec config · FM-12 AD trust repair · FM-14 CDD recovery (Support) · FM-17 BMR driver injection · FM-18 over-cap request · FM-21 failback/reverse-send | Security boundaries, physical/on-site work, irreversible conversions, or Support-gated. Care Center **prepares** (pre-fills, checks, estimates) but a human executes. |

**Diff-merge is the universal self-heal** (FM-4, FM-6, FM-8, FM-16, FM-22) — model it as a single reusable action with progress/ETA and an "auto after N failures" policy.

---

## 6. Product-specific Care Center views & content

These are the cloud-tier surfaces the Care Center must provide (page-level specs in [09 page-specs](../09-page-specs.md); IA/routes in [04 information-architecture](../04-information-architecture.md); microcopy in [12 content-strategy](../12-content-strategy.md)).

### 6.1 Cloud DR Readiness board (primary cloud surface)
A dense table (TanStack) — one row per CloudAgent — that is the *independent* answer to FM-23. Columns: `Agent · Off-site sync · Cloud RPO age · Last cloud verification · Encryption seal · DR-readiness score · Last DR test`. Sticky header/first column; **"last 10 cloud points" dot-strip** per row; bulk toolbar for `Resume sync / Force diff-merge / Re-screenshot`. Severity-sorted, fleet rollup = worst real child.

```
┌ Cloud DR Readiness ──────────────────────────────────────────── [Bulk: Resume sync ▾] ┐
│ AGENT          OFF-SITE     RPO AGE   VERIFY      SEAL     DR SCORE   LAST 10 PTS  TEST │
│ ● fileserver01  Caught-up    2h        ●Verified   Unsealed   96      ●●●●●●●●●●   12d ✓ │
│ ▲ sql-prod      Backlog 4d   4d ▲      ●Stale      Unsealed   58      ●●●●●○○○●●    —     │
│ ● dc01          Syncing      6h        ✕Failed(7B)  Unsealed   41      ●●●●●●●●✕✕   45d ! │
│ ▲ vault-enc     Caught-up    3h        ●Verified   ⚠Sealed     —       ●●●●●●●●●●    —     │
└─────────────────────────────────────────────────────────────────────────────────────────┘
   (every status: dot + icon + label; never color alone)
```

### 6.2 Off-site Replication panel (FM-1, FM-2)
Backlog trend chart (Recharts) + worst-offender agent list; controls for `Resume`, `Transmit limit`, `Concurrency`, `Reprioritize agent`; an **"Eligible for RoundTrip"** banner (>10 days behind or never-seeded) with a pre-filled request. Show `≥100 KB/s per 1 TB` guideline vs measured uplink.

### 6.3 Recovery Launchpad / cloud virtualization console (FM-4–9, FM-12, FM-18, FM-19)
Per-virtualization: storage-controller cycler, wait-time tuner, vCPU/RAM sizing (capped at 8/16 with "Request increase" affordance), **30-day auto-power-off toggle + age countdown**, secure passphrase prompt for sealed encrypted agents, live screenshot/boot view, "capture in-cloud data before teardown" prompt.

### 6.4 Cloud Networking workspace (FM-10, FM-11, FM-13)
Subnet planner with **reserved-subnet/RFC1918/overlap validator** + safe-subnet suggester; IPsec wizard that emits a matching on-prem config snippet, shows tunnel/Phase1-Phase2 state, runs a FIPS cipher-compatibility check, validates WAN reachability; port-forward editor with **1-public-IP-per-VM** enforcement and RDP/3389 exposure warning.

### 6.5 1-Click DR plan runner (FM-20)
Ordered-boot orchestrator (dependency graph, DC-first), pre-flight IP-overlap/missing-network check, VPN re-creation from saved config, in-sequence passphrase prompts. This is a flagship **playbook** ([07](../07-troubleshooting-and-automation-engine.md)) — chained actions, gated, audited.

### 6.6 Data-protection guardrails (FM-14, FM-15, FM-16)
Delete-confirmation with **CDD reminder + remaining-window countdown**; "recently deleted cloud datasets" list; retention-vs-RPO auditor with "expires in N days" warnings and lock/preserve; cloud-restore mount manager (one-of-type enforcement, unmount-and-retry).

### 6.7 BMR & failback runbooks (FM-17, FM-21)
Hardware→driver-pack lookup, "capture RAM-disk logs before reboot" reminder, pre-filled Code 9999 escalation; failback readiness check (device online + first diff-merge done), reverse-send/RoundTrip time estimator, **irreversible-conversion confirmation gate**, Support scoping request.

### 6.8 Product-specific content (for [12 content-strategy](../12-content-strategy.md))
- Runbook copy per failure keyed to **error strings** (e.g. `0x0000007B`, `bk005`, `Code 9999`, "Getting Devices Ready", "Starting Dracut Emergency Shell").
- The **reserved-subnet list** rendered as reference data in the networking workspace.
- Glossary: RoundTrip, CDD, diff-merge, HIR, reverse-send, connecting point, screenshot verification, Recovery Launchpad, 1-Click DR.
- Empty states: "No cloud points yet — this agent has never seeded off-site" (link to RoundTrip), "No DR test on record" (prompt a test).
- Mono treatment for IDs/IPs/subnets/sizes/error codes per [design-system](../03-design-system.md).

---

## 7. Open decisions / flags for build

1. **DR-readiness score weighting** is asserted but not yet numerically specified — needs a formula + thresholds defined in [06 data-model](../06-data-model-and-mock-data.md) so mock data is deterministic.
2. **Cloud vs appliance entity boundary:** `CloudAgent`/`CloudRecoveryPoint` are projections of BCDR/DEB agents — confirm with [05 domain-model](../05-domain-model.md) whether they are distinct entities or a `cloud` facet of the shared Agent/RecoveryPoint, to avoid duplicate modeling across [bcdr.md](bcdr.md) and [endpoint-backup.md](endpoint-backup.md).
3. **"Always" auto-remediation eligibility:** FM-2 (resume sync) and FM-22 (auto-diff-merge) are the strongest "always-on" candidates — confirm the approval-gate defaults in [07](../07-troubleshooting-and-automation-engine.md) treat sync-resume as auto but production-touching diff-merge as approval-gated.
