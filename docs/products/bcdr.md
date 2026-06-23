# Datto BCDR (SIRIS / ALTO) — Product Deep Dive

Deep dive on the SIRIS/ALTO appliance line: its entities, backup lifecycle, health semantics, failure modes, and the remediation surface the Care Center exposes for it. Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md).

> Cross-links: [failure catalog](../02-failure-catalog.md) · [domain model](../05-domain-model.md) · [data & mock-data](../06-data-model-and-mock-data.md) · [automation engine](../07-troubleshooting-and-automation-engine.md) · [page specs](../09-page-specs.md) · [content strategy](../12-content-strategy.md). Sibling products: [Datto Cloud DR](datto-cloud.md) (the off-site/cloud half of BCDR), [Endpoint Backup v1/v2](endpoint-backup.md).

---

## 1. Product overview & fit in the suite

Datto BCDR (Business Continuity & Disaster Recovery) is the **on-premises appliance** tier of the Datto data-protection stack. It is the anchor product the Care Center is built around: most failure modes (22 catalogued), the richest entity model, and the deepest remediation surface live here.

| Appliance class | Target | Notes |
|---|---|---|
| **SIRIS** | Servers / multi-agent sites | Full feature set: agent + agentless, ZFS pool (often RAID), local + cloud virtualization, BMR. |
| **ALTO** | Small sites / single server | Same engine, smaller fixed-retention pool; storage-fill pressure is higher. |
| **NAS / share protection** | File shares (SMB/CIFS) | Share snapshots rather than image backups; narrower failure set ([§5.22](#522-nas--network-share-snapshot-failure)). |

**What it does:** image-based backups of Windows/Linux machines via the Datto agent (DWA/DLA, formerly ShadowSnap) **and** agentless VMware/Hyper-V integration → stored on a local **ZFS** pool using **Inverse Chain Technology** (every recovery point is independently bootable, no forward-chain rebuilds) → automatically **verified** by nightly screenshot boot-tests and advanced/local verification → **replicated off-site** to the Datto Cloud. Recovery paths: **screenshot verification**, **local virtualization** (boot the VM on the appliance for DR), **cloud virtualization / test failover** (in [Datto Cloud](datto-cloud.md)), **Bare Metal Restore (BMR)**, and **file/folder restore**. Ransomware detection watches change patterns per agent.

**Where it sits relative to siblings:**
- The **local appliance** is BCDR's job; the **off-site cloud** half (cloud virtualization, test failover, IPsec/VPN, RoundTrip, Cloud Deletion Defense) is documented in [Datto Cloud DR](datto-cloud.md). BCDR *owns* the on-prem failures; off-site sync is the shared seam (covered here as it affects the appliance — [§5.9](#59-off-site--cloud-synchronization-falling-behind)).
- BCDR is appliance-based; [Endpoint Backup](endpoint-backup.md) is the appliance-free, direct-to-cloud alternative. Many concepts (VSS, screenshot, diff-merge, BMR Code 9999) recur there — the Care Center should reuse the same **action vocabulary** but scope it per product.

**Reputation signal that shapes the UX:** the core engine is well-regarded (G2 ~4.6, TrustRadius ~9.2) — failures are overwhelmingly **operational, not data-loss**: pools fill up, VSS writers wobble, screenshots fail *cosmetically*, sync falls behind. Post-Kaseya (2022) support degradation amplifies every failure because Tier-1 is harder to reach — so the Care Center's value is **self-serve deflection**: resolve it before it becomes a ticket ([§5.21](#521-post-kaseya-support--contract-degradation)).

---

## 2. Protected-asset model & backup lifecycle

### 2.1 Entity hierarchy (BCDR-specific)

```
Appliance (SIRIS / ALTO / NAS)
 ├─ ZFS Pool ──────── usedBytes / freeBytes / headroom% / health(ONLINE|DEGRADED|FAULTED) / scrubState
 │    └─ Dataset (one per agent/share) ── encrypted? / sealed? / orphaned?
 ├─ Agent (protected machine)            ← Windows/Linux, agent-based OR agentless(VMware/Hyper-V) OR NAS share
 │    ├─ pairing / certificate / driverState (loaded|notLoaded|pendingReboot)
 │    ├─ backupMode (incremental | differentialMerge | DBD-crashConsistent)
 │    ├─ encryption: { enabled, sealed }
 │    └─ Recovery Point[]                ← independently bootable (Inverse Chain)
 │         ├─ takenAt / type(full|incremental|diffMerge) / sizeBytes
 │         ├─ verification: { screenshot: pass|fail|cosmeticFail|unrun, local: pass|fail|unrun }
 │         ├─ offsite: { state: synced|inTransit|behind|paused, etaMins }
 │         └─ ransomwareFlag?
 ├─ Backup Job (transient run)           ← queued|running|hung|failed|skipped|success
 └─ Recovery Op (transient)              ← localVirt | fileRestore | BMR | screenshotTest
```

See [domain model](../05-domain-model.md) for the canonical cross-product schema and [data-model](../06-data-model-and-mock-data.md) for TS types + seeded mock data. Sketch of the load-bearing types:

```ts
type BcdrAgent = {
  id: string; name: string; hostname: string;          // hostname length matters — §5.8
  kind: 'agent-windows' | 'agent-linux' | 'agentless-vmware' | 'agentless-hyperv' | 'nas-share';
  pairing: { state: 'paired' | 'unpaired' | 'cert-broken'; certExpiresAt?: string };
  driverState: 'loaded' | 'not-loaded' | 'pending-reboot';
  backupMode: 'incremental' | 'diff-merge' | 'dbd-crash-consistent';
  encryption: { enabled: boolean; sealed: boolean };
  lastRecoveryPointAt: string | null;                  // null/stale → §5.20
  status: AssetStatus;                                  // rollup, §3
};
type RecoveryPoint = {
  id: string; agentId: string; takenAt: string; type: 'full' | 'incremental' | 'diff-merge';
  sizeBytes: number;
  screenshot: 'pass' | 'fail' | 'cosmetic-fail' | 'unrun';
  localVerify: 'pass' | 'fail' | 'unrun';
  offsite: 'synced' | 'in-transit' | 'behind' | 'paused';
  ransomware?: { flagged: boolean; falsePositive?: boolean };
};
```

### 2.2 Lifecycle (where each failure attaches)

```
SCHEDULE ─► PREPARE ───► CAPTURE ───────► STORE ─────► VERIFY ───────────► REPLICATE ─► RECOVER
            (VSS/CBT     (transfer to     (ZFS pool,   (nightly screenshot  (off-site     (localVirt /
             snapshot)    appliance)       Inverse      + local/advanced     to Datto      BMR / file
                                           Chain)       verification)        Cloud)        restore)
  │            │            │                │              │                   │              │
 §5.20       §5.2/3/12     §5.3/12          §5.1/17/18     §5.7/8/11          §5.9          §5.14/15/16
 stale     VSS/CBT fail   DBD fallback    pool-full /     screenshot fails   sync behind   BMR / file
 /no point                                encryption /                                     restore /
                                          ransomware                                       virtualization
```

**Key mechanics the Care Center must model:**
- **Inverse Chain** → no forward-chain rebuild; each point is bootable. But corruption/permission issues force a **differential merge** (the appliance recomputes the chain — slow, storage-spiky). Auto-diff-merge fires after **5 consecutive failed screenshots** (IRIS 4.0+).
- **DBD fallback** → if VSS export errors mid-transfer, the appliance falls back to a **crash-consistent (DBD)** backup. The job "succeeds" but is silently *not* application-consistent — dangerous for SQL/Exchange. The Center must surface this, not hide it.
- **Off-site pruning dependency** → recovery points **cannot be pruned** until replicated off-site. So an off-site backlog ([§5.9](#59-off-site--cloud-synchronization-falling-behind)) *causes* pool-full ([§5.1](#51-zfs-storage-pool-full)). These two are correlated and should cross-reference in the UI.
- **Encryption re-seal** → the appliance does **not** cache encryption keys; on reboot, encrypted datasets re-seal and need the passphrase re-entered ([§5.17](#517-encrypted-agent-backups-paused-after-reboot-re-sealed)).

---

## 3. Status & health semantics (BCDR-specific)

Use the canonical status tokens from [design-system](../03-design-system.md) — **never color-only**, always dot + icon + label. BCDR adds product-specific nuances:

| State | Token | BCDR meaning | Caveat the Center must encode |
|---|---|---|---|
| Protected | `success` | Recent point + screenshot pass + off-site synced | "Protected but DBD" is a **half-truth** — flag crash-consistent runs. |
| Warning | `warning` | Cosmetic screenshot fail, off-site behind, diff-merge mode, DBD fallback, pool >80% | The largest bucket — most BCDR noise lives here. |
| Failed | `failed` | Real backup failure, comms 401, VSS hard-fail, no point past RPO, BSOD screenshot | Distinguish **real** vs **cosmetic** screenshot failure (see below). |
| Paused | `paused` | Agent paused, sync paused, encrypted agent sealed | Sealed-after-reboot looks paused but is **urgent** — promote severity. |
| Syncing | `primary` (spin) | Off-site replication in transit, local virtualization booting | — |
| Offline | `offline` | Appliance unreachable / agent machine offline | Mass-offline → suspect platform incident, suppress per-agent noise. |

**Severity sort (fleet rollup = worst real child):** `Failed > Warning > Offline > Syncing > Paused > Protected`. A pool/appliance rollup shows the worst *real* state of its agents — but a **cosmetic** screenshot failure must NOT roll an agent up to Failed. This is the single most important BCDR-specific health rule:

> **Cosmetic-vs-real screenshot classification** is a first-class concept. A screenshot showing "Getting Devices Ready", a too-short wait-time, a blank image, a hostname-length limitation, or a NIC-required boot is **not** a DR failure — it's a `cosmetic-fail`, surfaced as Warning, and the local-virtualization check is the source of truth. A BSOD/0x7B/`fsck`/`BOOTMGR` screenshot **is** a real Failed. The Center should auto-classify via OCR of the stop pattern and let a tech confirm.

**Derived health badges (BCDR):** `DBD-only` (crash-consistent), `perpetual-diff-merge`, `off-site-behind Nd`, `pool N% / full in N days`, `sealed-encrypted`, `stale Nh`, `driver-pending-reboot`. These are the chips that drive triage.

---

## 4. Failure modes — overview & triage model

22 catalogued BCDR failures, from [`failure-catalog.json`](../research/failure-catalog.json). The table is the triage index; [§5](#5-failure-modes--detail) details each with symptoms, causes, error strings, and the **remediation actions** the Care Center exposes.

**Self-serve (✅ one-click) vs human-in-loop (👤) vs auto-remediable (🤖 can run unattended as a standing rule)** are the three orthogonal dimensions that feed the [automation engine](../07-troubleshooting-and-automation-engine.md). `🤖` means the action is safe to chain into an **always / auto-remediation** scope; `👤` means an approval gate or a hands-on-hardware/business step is mandatory.

| # | Failure | Category | Freq | Sev | Auto | Posture |
|---|---|---|---|---|---|---|
| 5.1 | ZFS storage pool full | Storage/ZFS | very common | high | 🤖 | ✅ self-serve; 👤 retention/upgrade judgement |
| 5.2 | VSS/ShadowSnap snapshot failure | Backup Chain | very common | high | 🤖 | ✅ mostly; 👤 reboot window |
| 5.3 | VSS export → DBD fallback | Backup Chain | common | medium | 🤖 | ✅ self-serve |
| 5.4 | Agent secure-comms 401 | Agent Comms | very common | high | 🤖 | ✅ self-serve; 👤 firewall/GPO |
| 5.5 | Add Agent / pairing fails | OAuth/Auth | occasional | medium | ❌ | 👤 Datto authorization |
| 5.6 | Driver not loaded / pending reboot | Agent Comms | common | medium | 🤖 | ✅ self-serve; 👤 reboot window |
| 5.7 | Screenshot fail — devices-ready/timing | Screenshot | very common | low | 🤖 | ✅ cosmetic, auto-tune |
| 5.8 | Screenshot fail — BSOD/boot (0x7B…) | Screenshot | common | medium | 🤖 | ✅ self-serve; 👤 source repair |
| 5.9 | Screenshot fail — hostname/NIC limit | Screenshot | occasional | low | 🤖 | ✅ suppress as known-limitation |
| 5.10 | Off-site sync falling behind | Cloud Sync | very common | high | 🤖 | ✅ self-serve; 👤 RoundTrip/circuit |
| 5.11 | Diff-merge / chain rebuild long | Diff-Merge | common | medium | 🤖 | ✅ self-serve |
| 5.12 | Filesystem/integrity verification fail | Backup Chain | common | medium | 🤖 | ✅ self-serve; 👤 source chkdsk |
| 5.13 | Agentless (VMware/Hyper-V) snapshot/CBT | Backup Chain | common | high | 🤖 | ✅ self-serve; 👤 vSphere admin |
| 5.14 | Local virtualization slow/won't boot | Local Virt | common | high | 🤖 | ✅ pre-DR prep; 👤 DR decisions |
| 5.15 | BMR fails — drivers / Code 9999 | BMR | occasional | high | ❌ | 👤 hands-on hardware |
| 5.16 | File/folder restore mount fails | File Restore | occasional | medium | 🤖 | ✅ self-serve |
| 5.17 | Encrypted agent re-sealed after reboot | Storage/ZFS | occasional | high | 🤖 | ✅ unseal (passphrase 👤) |
| 5.18 | ZFS pool degraded / faulted drive | Storage/ZFS | occasional | **critical** | ❌ | 👤 Datto Support-led |
| 5.19 | Ransomware detection false positive | Ransomware | common | low | 🤖 | ✅ acknowledge/suppress |
| 5.20 | No backup in 24h / stale point | Backup Chain | common | high | 🤖 | ✅ self-serve |
| 5.21 | Post-Kaseya support/contract degradation | Licensing | common | medium | ❌ | 👤 business/contract |
| 5.22 | NAS / share snapshot failure | Backup Chain | occasional | medium | 🤖 | ✅ self-serve |

**Auto-remediation candidates (safe for an `always` standing rule):** §5.7 (auto-bump wait time + re-screenshot), §5.3/§5.6 (alert on DBD/driver state), §5.10 (resume + raise transmit on detected lag), §5.17 (alert on reboot), §5.19 (pre-classify likely FP), §5.20 (force-backup on stale). **Never auto-remediate without a gate:** §5.5, §5.15, §5.18, §5.21 (hardware / authorization / business).

---

## 5. Failure modes — detail

Each entry: **Symptoms → Causes → Error strings (mono) → Care Center actions → Posture**. Actions map 1:1 to the catalogue's `candidateActions` and become composable [actions/chains/playbooks](../07-troubleshooting-and-automation-engine.md). Error strings are the OCR/log signatures the auto-classifier keys on.

### 5.1 ZFS storage pool full
*Storage/ZFS · very common · high · 🤖*
- **Symptoms:** backup *skipped — not enough free space (Full Device)*; "Local storage has less than (amount) available"; can't add new agents; ZFS perf degrades near full.
- **Causes:** retention too loose/long · large daily change rate · **off-site backlog keeping unprunable snapshots** (correlate to [§5.10](#510-off-site--cloud-synchronization-falling-behind)) · appliance under-sized · protecting >~50% of fixed retention size.
- **Error strings:** `Backup skipped due to not enough free space (Full Device)` · `BKP0615/BAK1615 Insufficient disk space` · `BKP2618 Not enough space for full backup` · `Final error (-8 Not enough storage…)`.
- **Actions:** Run Force Retention now · Apply suggested retention to heaviest agents · Show top storage consumers · Delete orphaned/archived datasets · **Forecast days-until-full** · Open appliance upgrade request.
- **Posture:** ✅ Force Retention / prune are one-click & 🤖; 👤 owns *which* points are safe to cut (RPO/compliance) and the buy/upgrade decision. Center surfaces a "full in N days" forecast + space-freed calculator.

### 5.2 VSS / ShadowSnap snapshot failure on protected machine
*Backup Chain · very common · high · 🤖*
- **Symptoms:** backup fails or completes crash-consistent only; "VSS failed to prepare snapshots for backup"; writers in failed state; reboot clears it then it returns.
- **Causes:** a VSS writer in failed state (often post-Windows-update) · competing 2nd backup product on VSS · AV/firewall on ports 3260/3262 · server OOM (`VSS_E_WRITERERROR_OUTOFRESOURCES`) · Datto VSS provider missing/corrupt · backups too frequent (`VSS_E_WRITER_ALREADY_SUBSCRIBED`).
- **Error strings:** `VSS failed to prepare snapshots for backup` · `VSS_E_WRITER_ALREADY_SUBSCRIBED` · `VSS_E_WRITERERROR_OUTOFRESOURCES` · `VSS_E_WRITERERROR_RECOVERY_FAILED` · `BKP1410 VSS Promised more data than received` · `BKP1660 VSS snapshot timeout`.
- **Actions:** Query VSS writer status (red/green table) · Restart/reset VSS writers · Reinstall Datto VSS provider · Detect conflicting backup software · Schedule reboot + retry backup · Force differential merge.
- **Posture:** ✅ writer query/reset and provider reinstall are one-click; 👤 owns the reboot maintenance window and removing a conflicting product.

### 5.3 VSS export error mid-transfer; falls back to crash-consistent DBD
*Backup Chain · common · medium · 🤖*
- **Symptoms:** "VSS Export error occurred mid-transfer on previous attempt; falling back to DBD"; backup completes but **crash-consistent**; repeated transient mid-transfer failures.
- **Causes:** AV/firewall on 3260/3262 · unstable VSS writers · DattoProvider/Datto VSS Provider missing/corrupt · network lag during ShadowSnap transfer · old ShadowSnap/ShadowProtect.
- **Error strings:** `VSS Export error occurred mid-transfer on previous attempt; falling back to DBD` · `BKP0203/BAK0203 VSS export failure mid-transfer` · `BKP1201 Export error occurred mid-transfer`.
- **Actions:** Test ports 3260/3262 reachability · Reinstall Datto VSS provider · Check VSS writer health · **Alert on repeated DBD fallback** · Update ShadowSnap agent.
- **Posture:** ✅ self-serve; the critical Center value is *making the silent DBD visible* — a standing 🤖 alert when N consecutive runs are crash-consistent. 👤 confirms DBD is acceptable for app servers until VSS is fixed.

### 5.4 Agent communication / secure pairing failure (401 unauthorized)
*Agent Communication · very common · high · 🤖*
- **Symptoms:** "Backup failed due to a problem establishing secure communications with the agent"; error 401; red banner on Protect tab, backups stop; agent offline.
- **Causes:** cert-based trust broke · port 25568 (DWA) or 3260/3262 blocked · machine offline / service stopped · DirectAccess/GPO interfering · re-paired/reinstalled without repairing comms.
- **Error strings:** `Error 401 (unauthorized)` · `AGT2016 Unable to get agent due to error 401` · `AGT0900 Agent pairing failed, will re-attempt` · `AGT0910/AGT0915 Agent pairing permanently failed` · `AGT1340 HTTP error from agent communication` · `BKP1670/1675 Agent communication failure` · `BKP0013/BAK0013 Cannot connect to the host`.
- **Actions:** **Repair Agent Communications** · Probe ports 25568/3260/3262 · Restart agent service remotely · Re-pair / regenerate certificate · Retry backup · Reinstall agent (last resort).
- **Posture:** ✅ "Repair Agent Communications" is the flagship one-click playbook (probe ports → restart service → re-pair → retry). Auto-detect `AGT09xx` and offer the chain. 👤 owns firewall/GPO changes and the reinstall-vs-repair call.

### 5.5 Add Agent / pairing fails (pairing not allowed / validation could not complete)
*OAuth/Auth · occasional · medium · ❌*
- **Symptoms:** "Add Agent failed: pairing not allowed to this device" / "…validation could not be completed"; new system never starts backing up.
- **Causes:** device not authorized in the partner portal · CA/cert validation failure in handshake · DirectAccess policy blocking pairing · agent-type change (ShadowSnap→DLA/DWA) without re-pair.
- **Error strings:** `Add Agent failed: pairing not allowed to this device` · `Add Agent failed: pairing validation could not be completed` · `We have detected an agent type change on your protected system`.
- **Actions:** Pre-flight CA/cert reachability check · Detect DirectAccess/GPO · Retry Add Agent · **Open authorization ticket to Datto**.
- **Posture:** 👤 / human-in-loop — Center pre-flights and surfaces the exact remediation, but final device authorization needs Datto. Pair this with the [support-escalation package builder](#521-post-kaseya-support--contract-degradation).

### 5.6 Driver not loaded / agent pending reboot after Windows update → forced diff-merge
*Agent Communication · common · medium · 🤖*
- **Symptoms:** driver not loaded after a Windows feature update; **every backup runs as slow differential merge**; "Backup wasn't taken" warning; occasional BSOD after agent install/update.
- **Causes:** Windows feature update unloaded the Datto Volume Filter / cbtfilter driver · Windows Driver Disk Cleanup removed it · pending reboot needed to finish install · failed agent auto-upgrade.
- **Error strings:** `BKP4000/4010 Backup wasn't taken in over 24 hours` · `BKP0022/BAK0022 Agent driver not loaded`.
- **Actions:** Show agent driver status · **Schedule reboot + repair comms** · Manually re-run agent upgrade · Repair Agent Communications · Confirm diff-merge cleared.
- **Posture:** ✅ detect `driver-pending-reboot` and offer one-click "schedule reboot + repair"; auto-retry the agent upgrade when auto-upgrade is detected as failed. 👤 schedules the production reboot.

### 5.7 Screenshot verification fails on "Getting Devices Ready" / sysprep timing
*Screenshot/Local Verification · very common · low · 🤖 — COSMETIC*
- **Symptoms:** screenshot shows "Getting Devices Ready" / Windows loading instead of login; marked failed though the VM is actually booting; blank image.
- **Causes:** virtualization boots slower on the appliance than production · first-boot Sysprep adds time · **Additional Wait Time set too low** · pending Windows update during boot test.
- **Error strings:** `Screenshot Verification failure: Getting Devices Ready` · `…: Blank image or image of Windows loading` · `…: The system is pending an update`.
- **Actions:** **Increase Additional Wait Time +5min** · Re-run screenshot · Launch local virtualization to confirm boot · **Classify failure as cosmetic vs real** · Check pending Windows updates.
- **Posture:** ✅ prime auto-remediation candidate: OCR the "Getting Devices Ready" pattern → auto-bump wait time → re-screenshot, all as a standing `always` rule. Classify as `cosmetic-fail` (Warning, not Failed). 👤 only to confirm via local virt if it never resolves.

### 5.8 Screenshot verification fails with BSOD / boot error (0x7B, c000021a, BOOTMGR, fsck)
*Screenshot/Local Verification · common · medium · 🤖 — REAL*
- **Symptoms:** STOP `0x0000007B` (INACCESSIBLE_BOOT_DEVICE); STOP `c000021a` {Fatal System Error}; `BOOTMGR is missing`; fsck/filesystem corruption / "Device not ready"; DC boot BSOD.
- **Causes:** wrong virtual storage controller (SATA/SCSI vs IDE) / GPO forcing controller · Winlogon/Csrss failure (corrupt system files) · NTFS corruption from unclean shutdown · post-update changes not captured · bootloader problem in source.
- **Error strings:** `STOP 0x0000007b (INACCESSIBLE_BOOT_DEVICE)` · `STOP Code c000021a` · `BOOTMGR is missing` · `Screenshot Verification failure: fsck failure` · `…: Device not ready` · `…: Filesystem corruption`.
- **Actions:** Force differential merge · **Retry virtualization with alternate storage controller** · Boot VM in safe mode and re-test · Trigger read-only chkdsk guidance on source · **Map stop code to remediation**.
- **Posture:** ✅ OCR the stop code → map to a known-fix chain (controller swap / force diff-merge / chkdsk guidance). This is a *real* Failed, not cosmetic. 👤 owns source-machine repair (chkdsk / system file fix) and interpreting ambiguous codes.

### 5.9 Screenshot verification fails due to hostname length or NIC-required boot
*Screenshot/Local Verification · occasional · low · 🤖 — KNOWN LIMITATION*
- **Symptoms:** consistent screenshot failure for one machine with no boot error; hostname ≥50 (agent) / ≥42 (agentless) chars; machine needs a NIC to boot but the screenshot VM has none.
- **Causes:** libvirt hostname-length API limit · screenshot VM intentionally has no NIC · app/service hangs waiting on network at boot.
- **Error strings:** `Screenshot verification fails for hostnames >=50 (agent) / >=42 (agentless) characters`.
- **Actions:** **Flag hostname length over limit** · **Suppress known-limitation screenshot failures** · Run local virtualization validation instead · Document verified-via-local-virt.
- **Posture:** ✅ auto-flag offending hostnames and relabel their screenshot failures as `known-limitation` (Warning, suppressed from Failed rollup); substitute the local-virt check as source of truth. 👤 only if a host rename is contemplated.

### 5.10 Off-site / cloud synchronization falling behind
*Cloud Sync · very common · high · 🤖*
- **Symptoms:** "Offsite Replication — not completely synchronized"; sync many days behind (points exist locally, not in cloud); one agent stuck sending a large backup; sync paused & not resuming.
- **Causes:** insufficient upload bandwidth vs change rate · a new agent's initial full saturating the link · Off-Site Default Transmit Limit too conservative · sync schedule paused/throttled · too many concurrent off-site ops.
- **Error strings:** `Offsite Replication - not completely synchronized` · `Off-Site Sync paused`.
- **Actions:** **Resume off-site sync** · Raise transmit limit · Convert pause window to throttle · Reduce concurrent transfers · **Request RoundTrip drive** · Show per-agent sync ETA.
- **Posture:** ✅ resume / raise-transmit are one-click & 🤖 (auto-resume on detected lag is a safe standing rule). Detect "initial full saturating link" → recommend RoundTrip. **This is the upstream cause of [§5.1](#51-zfs-storage-pool-full)** — link the two. 👤 owns the RoundTrip purchase / circuit upgrade (physical constraint). Deeper cloud-side handling: [Datto Cloud DR](datto-cloud.md).

### 5.11 Differential merge / chain rebuild long-running and storage-intensive
*Diff-Merge / Chain Rebuild · common · medium · 🤖*
- **Symptoms:** every backup runs as diff-merge (slow); merge runs for hours, looks stalled; triggered automatically after repeated failed screenshots/backups; temporary storage spike.
- **Causes:** agent lacks create/delete/read/modify on the **volume root** so it can't compute incrementals → perpetual diff-merge · auto-diff-merge after 5 failed screenshots (IRIS 4.0+) · used to recover from verification/corruption · driver not loaded forcing diff-merge.
- **Error strings:** `Every backup runs as a differential merge` · `Auto diff-merge after 5 consecutive failed screenshots`.
- **Actions:** Force differential merge · **Show merge progress/ETA** · **Check/fix volume-root permissions** · Adjust auto-diff-merge trigger threshold · Take new full backup instead.
- **Posture:** ✅ self-serve. Detect `perpetual-diff-merge` and check/remediate root-volume permissions; expose the 5-fail auto-trigger as a tunable. 👤 decides wait-out-merge vs take-new-full.

### 5.12 Filesystem / backup integrity verification failure (corruption)
*Backup Chain · common · medium · 🤖*
- **Symptoms:** advanced/local verification reports filesystem corruption; "Exception caught during backup run: File system not recognized"; "Invalid Root File System"; CRC (Error 23) failures.
- **Causes:** NTFS metadata damage from unclean shutdown · underlying disk issues on the source · inconsistencies in the recovered image · unsupported/unrecognized filesystem on a volume.
- **Error strings:** `Exception caught during backup run: File system not recognized` · `Invalid Root File System` · `cyclic redundancy check (Error 23)` · `Screenshot Verification failure: Filesystem corruption`.
- **Actions:** Force differential merge · Trigger chkdsk guidance on source · **Identify last verified-good recovery point** · Re-run advanced verification · Open Support ticket with diagnostics.
- **Posture:** ✅ auto-correlate corruption alerts to a "chkdsk + force diff-merge" chain; always surface the **last known-good verified point**. 👤 owns chkdsk/hardware diagnostics on the production machine and judging point trustworthiness.

### 5.13 Agentless (VMware/Hyper-V) snapshot or CBT failure
*Backup Chain · common · high · 🤖*
- **Symptoms:** "Failed to create VM snapshot at second attempt — aborting"; quiesced snapshot fails so the job won't run; unexpected recurring full backups (CBT reset); silent missing changed blocks.
- **Causes:** VMware quiescing / in-guest VSS failure · out-of-date VMware Tools · **CBT silently failing to report changes** · a 2nd agentless product corrupting CBT · vSphere snapshot-chain problems / leftover snapshots.
- **Error strings:** `Failed to create VM snapshot at second attempt - aborting`.
- **Actions:** **Consolidate stale snapshots** · Reset/refresh CBT · Update VMware Tools (guidance) · Detect competing agentless backups · Retry agentless backup.
- **Posture:** ✅ detect repeated snapshot-create failures, surface stale-snapshot count from vCenter, one-click consolidate / CBT-reset via API, flag competing products. 👤 owns vSphere/Hyper-V administration.

### 5.14 Local virtualization slow / unstable / won't boot during DR
*Local Virtualization · common · high · 🤖*
- **Symptoms:** VM boots very slowly / hangs on the appliance; appliance becomes unstable running virtualizations; DC domain-join issues; need to reboot VM after virtual-hardware driver install.
- **Causes:** out-of-date VirtIO drivers in guest · concurrent backups/off-site sync starving IO/CPU · over-allocated VM resources degrading appliance core functions · running >~5 protected systems in a local DR test · insufficient free space (need 15–20% headroom).
- **Error strings:** `Disaster Recovery: Virtualization Domain Joining Issues`.
- **Actions:** **Run pre-DR readiness check** · Pause off-site sync for DR · Throttle/reduce concurrent backups · Warn on >5-system local test · Request off-site DR test · Update VirtIO drivers (guidance).
- **Posture:** ✅ a "prepare for DR" chain (free-space + concurrent-load + VirtIO + system-count check → pause sync → throttle backups). 👤 owns real DR sizing/decisions and validating apps inside the VM. Cloud failover/test: [Datto Cloud DR](datto-cloud.md).

### 5.15 Bare Metal Restore (BMR) fails — missing storage/network drivers or Code 9999
*BMR · occasional · high · ❌ — HANDS-ON*
- **Symptoms:** "Bare Metal Restore encountered an error. (Code 9999)"; BMR env can't see target disks (storage driver missing); no network to reach appliance (NIC driver missing); RAID not recognized / target too small.
- **Causes:** missing storage-controller/RAID drivers in the BMR boot env · missing NIC drivers · RAID not configured/recognized · target disks smaller than source / disconnected · dissimilar hardware needing injected drivers.
- **Error strings:** `Bare Metal Restore encountered an error. (Code 9999)`.
- **Actions:** Open BMR driver-injection checklist · **Provide matching storage/NIC driver bundle** · Collect & upload BMR logs (`X:\Windows\Temp`) · Verify target disk size/RAID · Escalate Code 9999 to Support.
- **Posture:** 👤 inherently hands-on at the physical box. Center hosts a **driver-bundle library** + guided checklist + one-click log uploader, and pre-fills the Code-9999 escalation — but cannot run the restore. Mirror this with [Endpoint Backup BMR](endpoint-backup.md) and [Cloud BMR](datto-cloud.md).

### 5.16 File/folder restore fails to mount a volume
*File Restore · occasional · medium · 🤖*
- **Symptoms:** a volume/drive missing from the mounted file restore; mount fails / shows incomplete files; restore network share won't mount or is empty.
- **Causes:** corrupted backup clone / recovery point · corrupted source files at backup time · source-volume filesystem errors · out-of-date agent.
- **Error strings:** `File Restore fails to mount a volume` · `Volume or drive missing from restored files`.
- **Actions:** Retry file restore mount · **Mount from alternate recovery point** · **Suggest last verified-good point** · Trigger source chkdsk guidance · Open Support ticket.
- **Posture:** ✅ one-click "retry mount from a different point" + auto-suggest last verified-good; surface corrupt-clone detection so the tech doesn't guess.

### 5.17 Encrypted agent backups paused after appliance reboot (re-sealed)
*Storage/ZFS · occasional · high · 🤖 (passphrase 👤)*
- **Symptoms:** "Backup failed because backup image files have not been decrypted" (bk005); after an appliance reboot, encrypted agents stop backing up; restores/virtualizations blocked on those agents.
- **Causes:** appliance does **not** cache encryption keys → on reboot decrypted datasets **re-seal** · nobody re-entered the passphrase / clicked Decrypt now · lost passphrase (catastrophic, unrecoverable).
- **Error strings:** `Backup failed because backup image files have not been decrypted` · `bk005`.
- **Actions:** **Detect sealed encrypted agents post-reboot** · Prompt Decrypt now / unseal · Enable temporary troubleshooting access (6h) · **Alert immediately after appliance reboot** · Document passphrase custody.
- **Posture:** 🤖 reboot detection + immediate "encrypted agents need re-unseal" alert is a high-value standing rule; guided one-click unseal. **Passphrase entry stays with the partner** — the Center never stores it and **cannot** recover a lost one. Treat sealed-after-reboot as elevated severity even though the UI state looks like Paused.

### 5.18 ZFS pool degraded / faulted drive / checksum errors
*Storage/ZFS · occasional · **critical** · ❌ — SUPPORT-LED*
- **Symptoms:** drive in faulted state in Advanced Device Status; read/write/checksum errors on the pool; "File System could not properly remount" / "Dataset is not mounted"; `ZFS4150` snapshot failed.
- **Causes:** failing/failed physical disk · RAID-controller-reported errors / degraded array · ZFS checksum errors needing a scrub · filesystem mount/remount failure.
- **Error strings:** `ZFS4150 ZFS snapshot failed` · `ZFS3985/ZFS3987 Filesystem mount issues` · `File System could not properly remount - contact Support` · `Dataset is not mounted`.
- **Actions:** **Show ZFS pool/drive health** · Auto-collect diagnostics · **Open pre-filled Support ticket for faulted drive** · Request scrub · Check RAID controller status.
- **Posture:** 👤 largely *not* partner-self-serviceable — drive replacement/scrub are Datto-Support operations. Center's job: poll pool/drive health, surface it prominently (critical), auto-open a pre-filled diagnostic ticket the moment a drive faults. The only `critical`-severity BCDR failure.

### 5.19 Ransomware detection false positive
*Ransomware Detection · common · low · 🤖*
- **Symptoms:** ransomware infection alert on a clean machine; repeated false alerts on the same agent; alerts triggered by legit bulk-encryption apps.
- **Causes:** detection keys on **change patterns** (not file contents) · legit local-encryption apps (e.g., Dropbox) mimic ransomware patterns · bulk legit file rewrites resembling encryption.
- **Error strings:** `Ransomware detected (false positive)`.
- **Actions:** **Mark alert as false positive** · Disable ransomware detection for this agent · **Correlate with backup/screenshot health** · Set re-enable reminder · Identify likely-cause app.
- **Posture:** ✅ pre-classify likely FPs by correlating with screenshot/backup health and a known-FP-app list; one-click acknowledge + per-agent toggle with a re-enable reminder so detection isn't left off forever. 👤 must confirm it's truly an FP before suppressing.

### 5.20 Backup wasn't taken in over 24 hours / no recent recovery point
*Backup Chain · common · high · 🤖*
- **Symptoms:** "Backup wasn't taken in over 24 hours"; agent shows no recent point; scheduled backups silently not running.
- **Causes:** agent service stopped / machine offline in the window · schedule misconfig or paused agent · upstream comms/VSS failures · backup hung & couldn't stop (`BKP3031`).
- **Error strings:** `BKP4000/4010 Backup wasn't taken in over 24 hours` · `BKP3031 Backup hung and cannot stop` · `Unable to start backup because agent service is stopped`.
- **Actions:** **Force backup now** · Restart agent service · Kill hung backup job · **Show stale-agent fleet view** · **Correlate to root cause (comms/VSS/offline)**.
- **Posture:** ✅ this is the **fleet triage entry point** — a "stale agents" view with one-click force-backup / restart-service, auto-escalation when an agent passes RPO, and correlation to the real underlying cause (often [§5.2](#52-vss--shadowsnap-snapshot-failure-on-protected-machine)/[§5.4](#54-agent-communication--secure-pairing-failure-401-unauthorized)). 👤 decides to kill a hung production job / reboot.

### 5.21 Post-Kaseya support & contract degradation
*Licensing/Seats · common · medium · ❌ — BUSINESS*
- **Symptoms:** tickets closed without comment / ignored; Tier-1 runaround; KB deflection for known issues; BCDR Concierge / sales unreachable; renewal quotes 25–50% up; forced 3-year minimums.
- **Causes:** Kaseya acquisition changed support model & pricing · shift to multi-year minimums · roadmap blended into Kaseya 365 · support staffing/process changes.
- **Error strings:** *(none — business/operational)*.
- **Actions:** **Maximize self-service to avoid Tier-1** · Track ticket SLA/aging · Track contract renewal dates/price changes · Surface community fixes · Build migration/exit checklist.
- **Posture:** 👤 / business — the Center **cannot fix the vendor relationship**, but it *is* the mitigation: every self-served fix above is one fewer Tier-1 ticket. Provide SLA/renewal trackers and a Support-escalation package builder (logs + version + error + steps-tried) that feeds §5.5/§5.15/§5.18 tickets.

### 5.22 NAS / network share protection snapshot failure
*Backup Chain · occasional · medium · 🤖*
- **Symptoms:** share snapshot failure alerts (`SNS003/005/006`); "Cannot load share" (`SNS020`); protected NAS share backups not completing.
- **Causes:** share inaccessible / permissions changed · share no longer exists / path changed · insufficient storage for the share snapshot · connectivity loss to the share host.
- **Error strings:** `SNS003/SNS005 Share snapshot failure` · `SNS006 NAS share snapshot failed` · `SNS020 Cannot load share`.
- **Actions:** **Test share connectivity/credentials** · Re-run share backup · Verify storage availability · Re-add share definition.
- **Posture:** ✅ probe share reachability/credentials, surface the exact failing share, one-click test + re-run. 👤 fixes share permissions/paths on the customer NAS.

---

## 6. Care Center views & product-specific content

These are the BCDR-specific surfaces. They reuse the shared [page specs](../09-page-specs.md) and [component inventory](../10-component-inventory.md); below is what BCDR *adds*. All status uses dot+icon+label tokens; tables are the core surface (dense, sticky header/first-column, "last 10 backups" dot-strip, bulk toolbar). Follow the impeccable bans — no nested cards, side-stripe borders, identical card grids, or hero-metric template.

### 6.1 Appliance overview (per device)
Health header (worst real child rollup) + ZFS pool gauge with the **"full in N days" forecast** ([§5.1](#51-zfs-storage-pool-full)) and off-site backlog trend. Below: the agents table.

```
┌ SIRIS-CHI-01 ───────────────── ● Warning ─ pool 84% (full in ~9d) ─ off-site 2d behind ─┐
│  [ Force Retention ] [ Resume off-site sync ] [ Prepare for DR ]            (bulk toolbar)│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ▢ Agent          State      Last point  Last 10  Screenshot  Off-site  Mode      Storage   │
│ ▢ ● dc01         Failed     3h ago      ●●●○●●●●●● BSOD 0x7B  synced    incr      120 GB    │
│ ▢ ▲ sql01        Warning    1h ago      ●●●●●●●●●● cosmetic   2d behind DBD ⚠     410 GB    │
│ ▢ ⏸ files01(enc) Paused     —           ●●●●●●●●●○ —          synced    sealed 🔒 88 GB     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
Mono for IDs/IPs/sizes/error codes. The `Mode` column exposes `DBD ⚠` (crash-consistent) and perpetual `diff-merge` — BCDR-specific health that's invisible in stock Datto UIs.

### 6.2 Agent detail / triage drawer
Tabs: **Recovery points** (Inverse-Chain list with per-point screenshot/local-verify/off-site state + "last verified-good" marker), **Backups** (job history + error-code chips that deep-link the matching [§5](#5-failure-modes--detail) runbook), **Verification** (screenshot gallery with cosmetic-vs-real classification + "Increase Wait Time / Launch local virt"), **Comms & driver** (pairing/cert/port-probe/driver state), **Recovery** (launch local virt / file restore / BMR checklist). Each detected condition shows its remediation **actions** that can be added to the [action cart](../07-troubleshooting-and-automation-engine.md).

### 6.3 Screenshot verification board (BCDR-unique)
A dedicated screen because screenshot noise is the #1 trust-eroder. Group by `cosmetic-fail` vs `real-fail` vs `known-limitation`; OCR'd stop-code chip per tile; bulk "increase wait time + re-screenshot" and "validate via local virt." This is where §5.7/§5.8/§5.9 converge.

### 6.4 Storage & retention planner
Pool gauge, top consumers, days-until-full forecast, retention "what-if" calculator (space freed per policy change), orphaned-dataset prune, RoundTrip recommender when an initial full is saturating the link. Surfaces the §5.1 ↔ §5.10 correlation explicitly.

### 6.5 Fleet stale-agents / RPO view
The §5.20 triage entry point: every agent past its RPO, sorted by severity, with root-cause correlation (comms/VSS/offline) and one-click force-backup / restart-service / repair-comms across a selection.

### 6.6 DR readiness & recovery launchpad
Pre-DR readiness lint (free space, concurrent load, VirtIO, >5-system warning, hostname/NIC limits, encrypted-sealed check) → "Prepare for DR" chain → launch local virtualization. Hands off to [Datto Cloud DR](datto-cloud.md) for cloud failover/test.

### 6.7 Product-specific content the Center ships
- **Error-code dictionary** (mono): every `BKP/BAK/AGT/ZFS/SNS/VSS_E_*` string from [§5](#5-failure-modes--detail) → human cause → linked runbook → action chain. This is the auto-classifier's lookup table; see [content strategy](../12-content-strategy.md).
- **Runbooks** for each failure: "Repair Agent Communications", "Fix VSS writers", "Resolve a real screenshot BSOD", "Plan retention before the pool fills", "Unseal encrypted agents after reboot", "BMR Code 9999 escalation."
- **Saved playbooks** (BCDR defaults): *Comms-fix* (probe→restart→re-pair→retry), *VSS-fix* (query→reset→reinstall provider→retry), *Screenshot auto-tune* (`always`-scoped: bump wait time + re-screenshot on cosmetic OCR), *Pool guardrail* (force-retention when forecast < N days), *Post-reboot unseal* (alert + guided unseal).
- **Correlation rules** the engine should ship: off-site-behind → unprunable snapshots → pool-full; repeated DBD → "backups are silently crash-consistent"; 5 failed screenshots → auto-diff-merge; mass-offline agents → suspect platform incident (suppress per-agent noise).

---

## 7. Open decisions / flags

- **Off-site/cloud ownership seam:** §5.10 (off-site falling behind) is documented here as it blocks the *appliance* (pool pruning), but cloud virtualization, test failover, RoundTrip mechanics, and Cloud Deletion Defense live in [Datto Cloud DR](datto-cloud.md). Confirm the page-spec split so we don't duplicate the off-site action set across two product docs.
- **Cosmetic-vs-real classification confidence:** auto-suppressing §5.7/§5.9 as Warning (not Failed) is high-value but risks masking a genuine boot problem if OCR misreads. Recommend: auto-classify + always run the local-virt fallback before suppressing, and never auto-suppress §5.8 BSOD patterns. Needs a confidence threshold decision in the [automation engine](../07-troubleshooting-and-automation-engine.md).
- **Encrypted passphrase custody (§5.17):** the Center must *never* persist passphrases (front-end mock should model "prompt only, hold in session, never store"). Flag for the data-model so the mock doesn't accidentally seed a stored passphrase field.
