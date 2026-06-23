# Datto Endpoint Backup (v1 & v2)

Deep dive on Datto's appliance-free, direct-to-cloud endpoint protection — its entities, lifecycle, health semantics, failure modes, and what the Care Center surfaces. Part of the Kaseya Resolution Center spec set — see [INDEX](../INDEX.md).

> Scope: **Datto Endpoint Backup v1 (DEB v1)** and **Datto Endpoint Backup v2 (next-gen)** only. Both are no-appliance, image-based, direct-to-Datto-Cloud agents. For appliance-based image backup (SIRIS/ALTO, ZFS pool, local virt) see [BCDR](bcdr.md); for the cloud-side DR/restore surface they share with BCDR see [Datto Cloud](datto-cloud.md). Failure data is sourced from [`research/failure-catalog.json`](../research/failure-catalog.json) (products index `1` = DEB v1, `2` = DEB v2) and the [digest](../research/00-failure-catalog-digest.md).

---

## 1. Product overview & how it fits the suite

Datto Endpoint Backup is the **appliance-free** corner of the Datto data-protection stack. Where [BCDR](bcdr.md) puts a SIRIS/ALTO box on-prem with a local ZFS pool, DEB runs only a software agent on each Windows/Linux/macOS endpoint and ships **block-level, incremental-forever** image (and file) backups **straight to the Datto Cloud**. The cloud side reuses the same ZFS-backed Inverse Chain technology, screenshot verification, cloud virtualization, file restore, and Bare Metal Restore (BMR) as BCDR — so the *recovery* engine is shared, but the *capture* and *management* surfaces are distinct.

There are two generations, and the split matters because they are managed in **different consoles** and have **different failure surfaces**:

| | **DEB v1** | **DEB v2 (next-gen)** |
|---|---|---|
| Management console | **Datto Partner Portal** | **UniView** |
| Agent | Datto Backup Agent (`3.0.x` builds) | next-gen agent (`cbtfilter` CBT driver) |
| Deploy / monitor | Datto RMM (`Datto Endpoint Backup Agent v1 [WIN]` component) | Datto RMM (token `usrDEBToken`), bulk via UniView |
| Retention | account-plan based | **decoupled, 90 days → 7 years** |
| Billing | per-seat / per-license | **consumption / storage-pool** (5 TB pool in Kaseya 365 Endpoint; 250 GB per standalone license) |
| Backup policies | basic | customizable policies, granular throttle, **selective backup + wildcard exclusions** |
| Virtualization | cloud virt | cloud + local virt (**DR variant**), Rescue Agent |
| Status | mixed; legacy bug history | mixed; rigid config limits; consumption-billing surprises |
| Lifecycle | **being superseded** — v1 retained ~1 year after v2 migration | current direction; commonly inside the Kaseya 365 Endpoint bundle |

**Why this lives in the Care Center.** The agent is the single point of failure and it lives in a hostile environment: pending Windows Updates, third-party AV/EDR, competing backup software, metered laptop links, and stopped services. The catalog shows the dominant DEB failures are **agent-environment-driven** — VSS writer faults, `cbtfilter` blocked by AV, services stopped, metered-pause, missing post-install reboot, throttle misconfig — exactly the class that maps to **one-click, RMM-pushed remediation**. A smaller but high-stakes set (BMR Code 9999, NTFS-corrupted chains, retention stalls, platform outages) needs human judgement and a Datto Support ticket. The Care Center's job is to **auto-classify the noisy umbrella alerts, deflect the self-serve majority, and pre-package the escalations** — see the [troubleshooting & automation engine](../07-troubleshooting-and-automation-engine.md).

**The migration reality.** v1→v2 is seamless at the *agent* level (the v2 installer auto-uninstalls v1, no reboot, begins CBT immediately) but creates a **dual-portal window**: v1 backups stay only in Partner Portal and are retained **~1 year**, while v2 lives in UniView. The Care Center must treat "v1-only restore history with a sunset countdown" as a first-class surfaced state (§5, failure `v1-to-v2-dual-portal-migration`).

---

## 2. Protected-asset model & backup lifecycle

### 2.1 Entity model (DEB-specific)

See the full cross-product [domain model](../05-domain-model.md); the DEB-relevant entities:

```ts
// Sketch — see 05-domain-model.md / 06-data-model for canonical schemas
type DebGeneration = 'v1' | 'v2';

interface DebAgent {              // one per protected endpoint/server
  id: string;                     // mono-rendered
  hostname: string;               // long (>=50 char) names break screenshots — flag
  os: 'windows' | 'linux' | 'macos';
  generation: DebGeneration;
  console: 'partner-portal' | 'uniview';
  agentVersion: string;           // e.g. '3.0.33.0' — checked vs known-bad list
  checkInState: CheckInState;
  cbtState?: 'loaded' | 'blocked' | 'pending-reboot';  // v2 cbtfilter
  vssMode: 'application-consistent' | 'crash-consistent-dbd';
  metered?: boolean;              // laptop/cellular
  postInstallRebooted: boolean;   // false => max 1 backup/day (v1)
  supportability?: SupportabilityFinding[];  // v2 config scan results
  policyId?: string;              // v2 backup policy
}

interface RecoveryPoint {
  id: string;
  agentId: string;
  takenAt: string;
  type: 'full' | 'incremental' | 'diff-merge';
  screenshot?: ScreenshotResult;          // verification image + verdict
  localVerification?: 'passed' | 'failed' | 'not-run';
  integrity: 'verified' | 'suspect' | 'untrusted';  // NTFS-corruption flagging
  syncState: 'synced' | 'queued' | 'stalled';       // offsite/cloud replication
  trusted: boolean;                        // false => exclude from DR selection
}

interface SupportabilityFinding {         // v2 config-scan output
  kind: 'volume-expanded-after-full' | 'refs' | 'dedup' | 'external-drive'
      | 'network-drive' | 'multi-session-os' | 'low-free-space' | 'non-ntfs-apfs';
  volume?: string;
  willSilentlyFail: boolean;
}
```

### 2.2 Backup lifecycle

```
 register agent ──▶ INITIAL FULL (cloud seed, bandwidth-bound)
        │                 │
   [v1: 443 + reg key]    ▼
   [v2: usrDEBToken]   FIRST INCREMENTAL ◀── REQUIRES post-install reboot to arm CBT
        │                 │  (v1: no reboot ⇒ max 1 backup/day; v2: cbtfilter must load)
        ▼                 ▼
   incremental-forever ──▶ block-level deltas ──▶ offsite/cloud replication (ZFS Inverse Chain)
                                │                          │
                       diff-merge (auto-promoted        retention prune
                       on chain divergence /            (BLOCKED until replication
                       cbtfilter blocked /              succeeds — stall ⇒ storage bloat)
                       integrity failure)
                                │
                       screenshot verification (cloud boot-test of a recovery point)
                                │
              ┌─────────────────┼──────────────────────────────┐
              ▼                 ▼                                ▼
       file restore       cloud virtualization              Bare Metal Restore
   (browser / SFTP /     (cloud + local-DR variant,        (Datto Utilities boot
    differential)         Rescue Agent)                      media → target hardware)
```

Key lifecycle facts that drive failures:

- **CBT arming.** v1 needs a one-time **post-install reboot** or it falls back to a max of **one (full-style) backup per day**. v2's `cbtfilter` change-block-tracking driver must load (and survive AV/EDR) or **every backup runs as a slow differential merge**.
- **Diff-merge is the universal self-heal.** When a chain diverges, screenshot/integrity verification fails, or CBT is blocked, the agent auto-promotes the next backup to a **differential merge** to rebuild a consistent point. "Force differential merge" is therefore the single highest-leverage remediation button across DEB.
- **Replication gates retention.** A recovery point flagged for cloud replication **cannot be pruned** until it syncs — so an offsite-sync stall **silently stalls nightly retention** and inflates storage. Never diagnose retention bloat without first checking the sync queue.
- **VSS mode degrades, it doesn't stop.** A VSS export error mid-transfer falls back to **DBD (Datto Block Driver) crash-consistent** capture — protection continues but app/DB consistency is lost until VSS is repaired.

### 2.3 Verification & recovery surfaces

- **Screenshot verification** — boots a recovery point in the cloud and captures a frame. Failures are frequently **cosmetic false alarms** (pending update, blank/black screen from display timeout, NIC-required boot, long hostname) rather than real unbootability. The Care Center must let a tech **distinguish cosmetic from real** (§4).
- **Local/filesystem verification** (v2) — flags chkdsk-level corruption in the chain; remediated by diff-merge → read-only chkdsk → `chkdsk /f /r` + reboot.
- **Cloud virtualization** — spin up a point to observe the real boot; `Inaccessible Boot Device / STOP 0x0000007B` is fixed by cycling the **storage controller** (SATA→SCSI→IDE).
- **File restore** — browser, SFTP (bulk), or differential (changed-portions-only); whole-point ZIPs get huge.
- **BMR** — runs from the offline **Datto Utilities** boot environment; inherently hands-on; `Code 9999` is ambiguous (can appear *while still running*).

---

## 3. Status & health semantics (DEB-specific)

DEB rolls up into the canonical status system in the [design system](../03-design-system.md) (`Protected / Warning / Failed / Paused / Syncing / Offline`, never color-only — always dot+icon+label; severity sort `Failed > Warning > Offline > Syncing > Paused > Protected`). DEB adds product-specific dimensions a single status badge can't carry — surface these as **secondary chips / columns**, not by overloading the status:

| Dimension | States | Why it matters | Token guidance |
|---|---|---|---|
| **Check-in** | checking-in · stale (> threshold) · offline | v2 "Agent Not Checking In" is the #1 noisy alert; threshold is configurable | `Offline` = cold token; stale = `Warning` |
| **VSS mode** | application-consistent · crash-consistent (DBD) | DBD = degraded, not failed; DB/Exchange workloads care | mono "DBD" chip with `Warning` dot |
| **CBT / cbtfilter** (v2) | loaded · blocked · pending-reboot | blocked ⇒ perpetual slow diff-merges + high CPU | `Warning` chip "diff-merge mode" |
| **Verification** | verified · failed-cosmetic · failed-real · not-run | cosmetic ≠ real; never escalate a cosmetic to `Failed` | `failed-real` = `Failed`; cosmetic = muted `Warning` |
| **Sync** | synced · queued · stalled | stalled gates retention; `Syncing` token spins | `Syncing` = primary blue spin; stalled = `Warning` |
| **Integrity** | verified · suspect · untrusted | NTFS-corruption / bad-build flagging; untrusted points excluded from DR | `untrusted` = `Failed` dot on the point |
| **Metered** (laptops) | normal · paused-metered | silent no-backup on laptops | `Paused` desaturated token + reason |
| **Generation** | v1 (Partner Portal) · v2 (UniView) · v1-only-history | dual-portal; sunset countdown | neutral chip; sunset ⇒ `Warning` near deadline |

**Rollup rule (DEB-specific).** A `Paused-metered` agent is **not** a failure — it's a policy state; surface it distinctly so it doesn't inflate "Failed" counts. A `crash-consistent (DBD)` agent rolls up as **Warning, not Protected** for DB/Exchange-tagged workloads. The **fleet/site rollup** still follows the canonical "worst real child state" rule, but **cosmetic screenshot failures and known-limitation suppressions must not dominate the rollup** — they collapse into an advisory.

**Worst-case health ≠ alert volume.** During a platform outage every agent goes `Offline` at once. The rollup must **correlate mass-offline to a known incident** and present a single banner (§4, `cloud-platform-outage` / `platform-outage-assets-offline`) rather than N red rows.

---

## 4. Failure modes & remediation actions

Sourced verbatim-in-spirit from the research JSON. Each row: **symptom signature → root cause → Care Center actions**, tagged **[SS]** self-serve (one-click / RMM-pushable), **[HIL]** human-in-loop (judgement, on-site, or maintenance window), **[AUTO]** auto-remediatable (the "always going forward" scope from the [automation engine](../07-troubleshooting-and-automation-engine.md)). `auto:true` in the catalog means the *detection + offer* can be automated even where the fix needs a reboot/approval.

### 4.1 DEB v1 — 22 failure modes

#### Agent communication & service health
| Failure (`id`) | Freq/Sev | Symptom signature | Root cause | Care Center actions |
|---|---|---|---|---|
| `agent-service-stopped` | common/high | "Unable to start backup because agent service is stopped / unreachable"; offline; backups silently stop | Datto Backup Agent Service (+ DattoProvider pre-3.0) stopped / not Automatic; service crash en masse; port block | **[AUTO]** Restart Datto agent services (set Automatic) · Repair Agent Communications · Verify ports 3260/3262 · Reboot endpoint · Trigger manual backup · **Enable service watchdog/auto-recovery [AUTO]** |
| `agent-comms-secure-channel` | common/high | "problem making a backup request"; Linux "secure communications" failure; agent flaps; pairing blocked by DirectAccess | Ports 3262 (MercuryFTP)/3260 (iSCSI) blocked; DirectAccess/GPO; wrong-IP from dead adapter (fixed v3.0.33.0); timeout too short (raised v3.0.25.0); <1 GB RAM / <20% free | **[SS]** Repair Agent Communications · Port reachability check (3260/3262) · Check free RAM/disk thresholds · Collect agent event logs · Update agent · Reboot. **[HIL]** firewall/DirectAccess exclusions, log reading |
| `destructive-uninstaller` | rare/high | After uninstall, *other* Datto products' files gone under `C:\Program Files\Datto` | Uninstaller wiped entire `…\Datto` dir (fixed **v3.0.25.0**) | **[AUTO]** Version-gate uninstall to v3.0.25.0+ · Upgrade before uninstall · Reinstall affected sibling products · Verify Datto component inventory |

#### Backup chain & job state
| Failure (`id`) | Freq/Sev | Symptom signature | Root cause | Care Center actions |
|---|---|---|---|---|
| `backup-stuck-99-percent` | common/high | Progress hangs at **99%** indefinitely; next backup also hangs; point never finalizes; device load spikes | Hash-cache corruption/desync forcing block re-validation; stale local cache; unstable network on final commit | **[SS/AUTO]** **Clean reinstall (`CLEAN_INSTALL=1`)** — uninstall, purge `C:\Program Files\Datto Backup Agent\`, `C:\.datto`, `…\systemprofile\AppData\Local\Datto Backup Agent\`, reinstall, schedule reboot · Force hash-cache re-validation · Trigger manual backup. **[HIL]** decision to force full re-seed (bandwidth/timing) |
| `ntfs-corruption-diffmerge-first` | rare/**critical** | Restored/virtualized volume shows **NTFS corruption** despite "success"; surfaces only on mount | Bug: **diff-merge ran as the first backup** instead of a full (fixed v3.0.33.0); missed-change snapshot bug (fixed v3.0.19.9) | **[AUTO]** Upgrade agent to fixed build · Force a clean **FULL** · Validate recovery-point integrity (virtualize + chkdsk) · **Flag suspect points as `untrusted`**. **[HIL]** decide which points to distrust / re-seed |
| `throttle-zero-deadlock` | occasional/high | Backups stop entirely after Idle/In-Use limit set to **0**; agent hangs; cloud blocked | Bug: both throttles = 0 blocked cloud indefinitely (fixed by enforcing safe minimum) | **[AUTO]** Scan agents for throttle=0 · Set safe-minimum / nonzero · Upgrade to fixed build · Trigger backup. *Validation rule: warn + auto-substitute safe min when 0 entered* |
| `no-reboot-after-install-daily-only` | common/medium | Only **1 backup/day**; incrementals never run | Required one-time post-install reboot never done ⇒ CBT not armed | **[AUTO]** Detect missing post-install reboot · **Schedule one-time reboot via RMM** · Verify incremental cadence resumes *(clean high-value auto-remediation)* |
| `backup-in-progress-lock` | occasional/medium | "A Backup Is Currently in Progress"; new jobs skipped; agent busy forever | Prior job hung (network/VSS), in-progress lock never released | **[AUTO]** Detect zero-throughput stuck job (N min) · Restart agent service to clear lock · Trigger fresh backup · Upgrade for network-hang fix. **[HIL]** confirm truly stuck vs slow |
| `competing-backup-software-conflict` | occasional/medium | Intermittent failures, no pattern; VSS provider conflicts; shadow copies maxed | >1 backup product competing for VSS; 3rd-party VSS provider precedence; AV locking | **[SS]** Scan for competing backup software / VSS providers · Guided uninstall · Push AV exclusions (agent + shadow storage) · Re-run. **[HIL]** which product to remove + client approval |

#### VSS / shadow storage
| Failure (`id`) | Freq/Sev | Symptom signature | Root cause | Care Center actions |
|---|---|---|---|---|
| `vss-writer-failure` | common/high | VSS error code; falls back to crash-consistent; recurring snapshot fails on DB/Exchange/SQL | Writers failed (`0x80042315/0x80042319`); <10% free (`0x8004231F`); pending-update corrupt XML (`0x80042311/0x80042327`); provider in use (`0x80042307/0x8004230D`); max volumes (`0x80042312`) | **[AUTO]** **Repair VSS** (restart core + the specific failed writer) · List writers & flag failed · Check shadow-storage free space · Complete pending updates + reboot · Detect competing backup/AV · Disable volume-level shadow copies. **[HIL]** which writer / chkdsk/SFC/DISM / reboot window |
| `vss-export-fallback-dbd` | occasional/medium | "VSS Export error… falling back to **DBD**"; backup is crash-consistent | AV/firewall filtering ports 3260/3262 mid-transfer; writers unstable; Datto VSS Provider missing/corrupt | **[AUTO]** Test ports 3260/3262 · Validate/reinstall Datto VSS Provider service · Add AV/firewall port exclusions · Repair agent · Trigger backup to confirm VSS mode |
| `free-space-backup-skipped` | occasional/high | "Backup skipped due to not enough free space"; new agents blocked; shadow storage purging oldest | <20% free source volume (copy-on-write); cloud capacity reached; shadow storage churn; active restore blocking retention | **[SS]** Clear stale shadow copies on source · Disable volume-level shadow copies · Report source/cloud free space · End active restore blocking retention · Request cloud storage expansion. **[HIL]** what to delete / whether to buy storage |

#### Screenshot verification
| Failure (`id`) | Freq/Sev | Symptom signature | Root cause | Care Center actions |
|---|---|---|---|---|
| `screenshot-verification-failed` | common/medium | "Agent Screenshot Verification Failed… may indicate an issue with the backup itself"; blank/black, mid-boot, BSOD — *often false* | Pending update/CHKDSK in VM; screensaver/power blank; NIC-required boot; hostname ≥50 chars (libvirt); genuine boot failure (BOOTMGR, 0x7B) | **[SS/AUTO]** Re-run screenshot on latest point · Spin up cloud virt to inspect boot · Extend display/power timeout (>10 min) · Check pending updates · Flag hostname-length/NIC limitation · Report false alarm. **[HIL]** **classify cosmetic vs real** (model-assisted OCR can pre-classify) |
| `screenshots-not-running` | occasional/low | No screenshot ever produced; column stays empty | Pending update blocks runs; verification disabled; backup not completing; libvirt backlog | **[AUTO]** Schedule reboot to clear pending updates · Enable screenshot verification setting · Force new backup + screenshot · Confirm backups completing |

#### Cloud sync / seeding / networking
| Failure (`id`) | Freq/Sev | Symptom signature | Root cause | Care Center actions |
|---|---|---|---|---|
| `offsite-sync-stall-blocks-retention` | common/high | Points never finish syncing; **nightly retention stalls**, old points not pruned; storage grows | <1 Mbps/TB uplink; pause schedule forces restarts; large points; retention can't prune flagged points | **[AUTO]** Increase off-site transmit limit (≥1 Mbps/TB) · Convert pause-schedule → throttled (~1 MBps) window · Check connectivity · Request RoundTrip seed · **Correlate retention stall to sync backlog** (don't misdiagnose as retention bug) |
| `slow-initial-full-seed` | common/medium | Initial full runs for days / "stalled"; dominates uplink | Initial full is largest upload, bandwidth-bound; aggressive throttle; large dataset | **[AUTO]** Estimate seed ETA from size + uplink · Apply off-hours seeding throttle profile · Measure actual uplink · **Suppress "slow" alerts while progressing** (alert only at ~0 throughput for N hrs) |
| `metered-network-pause` | common/medium | Tray: "Backup is paused because your connection is currently metered"; laptops silently skip | "Pause while metered" policy ON; Windows flagged link metered (incl. mis-flagged Wi-Fi) | **[AUTO]** Toggle off "Pause while metered" policy · Un-mark Windows connection as metered · Confirm next backup runs · **Scope override per agent**. **[HIL]** policy: allow over genuine cellular? |
| `cloud-platform-outage` | rare/**critical** | Assets offline across regions; backups/restores/BMR/registration all fail | Backend incident / bad agent build to prod; region-wide degradation | **[AUTO]** Check Datto status feed · **Correlate alerts to known incident & suppress per-agent noise** · Post client-facing outage notice · Verify recovery after clear. **[HIL]** none fixable MSP-side — detection + comms only |

#### Deployment, BMR, support
| Failure (`id`) | Freq/Sev | Symptom signature | Root cause | Care Center actions |
|---|---|---|---|---|
| `rmm-deploy-404-token` | occasional/medium | "Installation failed with code: 404"; "Failed registration process"; silent fails | RMM registration token refreshed (old expired); wrong/old component (v1 vs v2); missing VC++ runtime; unsupported OS | **[AUTO]** Refresh RMM registration token · Validate component version (`v1 [WIN]`) · Pre-flight VC++ + OS check · Redeploy · Schedule post-install reboot |
| `bmr-code-9999` | occasional/high | "Bare Metal Restore encountered an error. (Code 9999)"; may *still be running* | Can't write attributes / copy files to target; backup-data access problem; **9999 is ambiguous** | **[HIL]** Show Code 9999 runbook · Validate restore point before retry (screenshot/virtualize) · Target-hardware BMR readiness checklist · **Pre-fill Datto Support ticket with BMR logs**. Confirming fatal-vs-in-progress effectively needs Support |
| `bmr-boot-failure` | occasional/high | Restored machine won't boot; BSOD / BOOTMGR missing; dissimilar-hardware mirror fails | UEFI/BIOS or secure-boot mismatch; ATA=RAID not AHCI; missing storage drivers (HIR didn't inject); target disk < Recommended Space; source-image boot problem | **[HIL]** Pre-BMR hardware readiness checklist · Re-run HIR (Reboot) for bootability · Validate restore point boots in cloud first · Driver-injection guidance · Support ticket with logs. *Firmware/driver work is hands-on* |
| `support-quality-decline` | common/medium | Long ticket resolution; perceived post-Kaseya support drop; MSPs forced to self-serve | Documented post-acquisition support decline; DR-critical issues only Datto can confirm | **[AUTO]** **Auto-assemble escalation package** (logs + version + error + steps tried) · Deflect common issues via self-service runbooks · Track ticket SLA / escalation reminders |

### 4.2 DEB v2 — 21 failure modes

v2 inherits the same families but with a new console (UniView), the `cbtfilter` CBT driver, consumption billing, and rigid config limits. Error strings below are from the catalog and drive **log auto-classification**.

#### Agent communication & registration
| Failure (`id`) | Freq/Sev | Symptom signature (error string) | Root cause | Care Center actions |
|---|---|---|---|---|
| `agent-not-checking-in` | very common/high | "Agent Not Checking In… exceeded your configured threshold of [threshold]" | Outbound **443** blocked; DNS can't resolve **`mothership.dtc.datto.com`**; services stopped/crashed; agent unregistered; machine off | **[AUTO]** Repair agent communications · Restart Datto agent services · **Connectivity/DNS probe (443, `mothership.dtc.datto.com`)** · Reinstall agent · **Adjust check-in alert threshold** (tame noise) |
| `agent-registration-failed` | common/high | "Agent Registration Failed. We were unable to register [hostname]…"; "unable to resolve mothership.dtc.datto.com" | No internet / 443 blocked; DNS fail; pairing key file corrupt; system below requirements | **[AUTO]** Re-run agent registration · Pre-flight connectivity/DNS check · Show required firewall allowlist · Retry with backoff · Escalate to Support |
| `rmm-deploy-token-404` | common/high | "Installation failed with code: 404 - … Failed registration process" | Deployment token refreshed (old expired); wrong/stale `usrDEBToken`; **v1↔v2 token confusion**; firewall/SSL inspection | **[AUTO]** Regenerate deployment token · Validate token before deploy · Uninstall+reboot+reinstall · Bulk redeploy via RMM · Check firewall/SSL inspection |
| `high-cpu-slow-machine-during-backup` | occasional/medium | Machine sluggish during backup; high CPU/disk; timeouts; user complaints | `cbtfilter` blocked → full-volume diff-merge reads; many small files; <2 cores / <1 GB free RAM; concurrent shadow-copy; aggressive frequency | **[AUTO]** Detect agent as resource hog · **Apply cbtfilter AV/EDR exclusions** (highest leverage) · Check CPU/RAM minimums · Tune schedule/throttle · Detect concurrent jobs |

#### Backup chain, VSS, CBT
| Failure (`id`) | Freq/Sev | Symptom signature (error string) | Root cause | Care Center actions |
|---|---|---|---|---|
| `vss-snapshot-prepare-failure` | **very common**/high | "VSS failed to prepare snapshots for backup"; failed/timed-out writers | Windows Update broke VSS; conflicting backup/AV using writers; <10–20% free; max shadow copies/volumes; FS damage. Codes: `0x8004231F`, `0x80042312`, `0x80042306`, `0x800423F2`, `0x80042301` | **[AUTO]** Restart VSS service + affected writers · Clear stale shadow copies · Check/report volume free space · **Force differential merge** · Detect conflicting VSS/backup software · Reinstall agent. **[HIL]** remove specific provider / `chkdsk /f /r` reboot |
| `cbtfilter-blocked-diffmerge` | common/medium | Every backup runs as **diff-merge** not incremental; slow; high IO; "filter driver has been blocked, all backups will run as a diffmerge until… rebooted" | AV/EDR blocks/quarantines `cbtfilter` CBT driver; driver partially loaded; missing exclusions | **[AUTO]** Apply AV/EDR exclusion set · Verify/restore `cbtfilter` driver · Reboot via RMM · Check if stuck in diff-merge mode. *For Datto EDR/known AV push exclusions; for 3rd-party show copy-paste list + "reboot now"* |
| `backup-failure-alert-generic` | very common/high | "We were unable to backup [Agent Name] from your Partner Portal account" — **umbrella alert** | Failed check-in; underlying VSS/driver/connectivity; services down; requirement gaps | **[AUTO]** Run backup now · **Auto-classify underlying failure from logs → open the correlated sub-playbook** · Restart agent services · Force differential merge. *This is the router, not a fix — never treat generically* |
| `backup-chain-corruption-bad-agent-version` | occasional/**critical** | Restore points that can't virtualize/restore; bluescreens during screenshot on a specific build; missed-change corruption | Known agent defects (`3.0.19.1` cbtfilter Inaccessible Boot Device / premature finalization; `3.0.19.9` simultaneous shadow-copy); agent stuck on old build; concurrent shadow-copy software | **[AUTO]** **Audit agent versions vs known-bad list** · Push agent update + reboot · Force differential merge · Re-run screenshot verification · Detect concurrent shadow-copy software |
| `unsupported-config-silent-backup-fail` | common/high | Backups stop after a **volume expand**; REFS/network/external/removable not protected; cloud-folder data excluded; multi-session OS incompatible | **No volume expansion after first full** ("backups will not complete"); NTFS/APFS only (no REFS, no dedup/compression); no external/network/removable; single active C:; Win10/11 Enterprise multi-session unsupported; <10% free | **[AUTO]** **Run supportability/config scan** · Detect post-full volume expansion · **Re-seed new full backup** · Free-space check + alert · Review selective-backup inclusions/exclusions. **[HIL]** re-architect volumes/file systems |
| `shadow-storage-conflict-windows` | common/medium | Oversized points / storage growth; old backups destroyed early; VSS errors after Windows fills shadow storage; Windows Server Backup clash | Windows "Previous Versions" shares Datto's shadow storage then deletes oldest; concurrent WSB schedule; near-capacity shadow storage multiplies detected change | **[AUTO]** Detect/disable Windows volume shadow copies · Detect concurrent WSB schedule · Stagger backup schedules · Report shadow-storage utilization |

#### Verification & virtualization
| Failure (`id`) | Freq/Sev | Symptom signature (error string) | Root cause | Care Center actions |
|---|---|---|---|---|
| `screenshot-verification-failed` | **very common**/medium | "Agent Screenshot Verification Failed…"; blank/black, BSOD, CHKDSK, pending-update screen; "Inaccessible Boot Device", "STOP 0x0000007B", "BOOTMGR is missing" | Pending update; display-timeout black screen; missing/incompatible storage-controller driver; NIC-required boot; hostname ≥50 chars; CHKDSK at boot | **[AUTO]** **Force screenshot re-verification** · **Force differential merge** · On-demand virtualization to view boot · **Change virtualization storage controller** · Push Windows update + reboot via RMM · Adjust display timeout via RMM. **[HIL]** interpret boot screen / pick controller / cosmetic-vs-real (OCR pre-classify) |
| `filesystem-local-verification-failed` | common/medium | "Filesystem Check failed" / "local verification failed"; unsure which point is safe | FS errors replicated from source (chkdsk-level); chain divergence from unexpected shutdown/writer conflict; lost/corrupt incremental | **[AUTO]** Force differential merge · Run **read-only chkdsk via RMM** · Schedule `chkdsk /f /r` + reboot · Re-verify recovery point · **Mark safe restore point**. **[HIL]** schedule reboot / repair source corruption |
| `virtualization-boot-failure` | occasional/high | BSOD "Inaccessible Boot Device" reboot loop; "STOP 0x0000007B"; DR VM won't come up; "Virtualization is not supported… (macOS)" | Wrong/missing/corrupt virt storage-controller driver; OS expects different controller; source already unhealthy; macOS virt unsupported | **[AUTO]** Retry with alternate storage controller · **Auto-cycle SATA/SCSI/IDE and report which boots** · Launch full-boot observation · Create **Rescue Agent (DR)**. **[HIL]** is the source OS itself broken? |

#### BMR
| Failure (`id`) | Freq/Sev | Symptom signature (error string) | Root cause | Care Center actions |
|---|---|---|---|---|
| `bmr-code-9999` | occasional/high | "Bare Metal Restore encountered an error. (Code 9999)" mid-restore; aborts before completion | Can't write attributes / copy files to target; backup-data access (connectivity/bandwidth); restore point not viable | **[HIL]** Pre-validate restore point (screenshot/virtualization) · Guided BMR readiness checklist · **Auto-collect & upload BMR logs** (`X:\Windows\Temp\` → `sftp.kaseya.com`) · Open Datto Support case with logs attached |
| `bmr-environment-failures` | occasional/high | No IP / no network in Datto Utilities; disks/RAID not detected; won't boot (boot-mode); resume-vs-restart prompt; "BMR requires Ethernet; WiFi is not supported"; "ATA devices must be set to AHCI mode (not RAID)" | No DHCP / WiFi (unsupported); missing NIC/storage drivers in recovery env; ATA=RAID not AHCI; UEFI/legacy/secure-boot mismatch; USB removed / reboot mid-transfer | **[HIL]** BMR hardware readiness pre-check · Driver bundle guidance (NIC/storage) · Interactive BMR runbook · Auto-collect RAM-disk logs · Escalate to Support. *Firmware/USB/driver work is at the target* |

#### Migration, cloud sync, platform, macOS, restore, billing
| Failure (`id`) | Freq/Sev | Symptom signature (error string) | Root cause | Care Center actions |
|---|---|---|---|---|
| `v1-to-v2-dual-portal-migration` | common/medium | v1 in Partner Portal + v2 in UniView at once; "uninstall can take from 15 minutes to an hour"; "access to your Endpoint Backup v1 backups for approximately one year" | v2 installer uninstalls v1 but **can't migrate backups**; v1 stays in Partner Portal, **~1-year retention**; two surfaces | **[AUTO]** Bulk v2 agent deploy via RMM · **Report v1-vs-v2 asset status** · **Flag v1-only restore history with sunset countdown** · Confirm UniView registration after upgrade |
| `slow-cloud-seed-offsite-backlog` | common/medium | Initial full uploads slowly; agents days behind; "Backlog Count is increasing"; "Off-Site Sync has been paused"; "connection to the offsite storage is marked as bad" | Limited uplink for direct-to-cloud fulls; new asset's full starves others; aggressive throttle; many small files; sync paused/marked bad | **[AUTO]** Resume paused cloud sync · Adjust bandwidth throttle schedule · **Show backlog/queue depth per agent** · Stagger initial full seeds · Apply selective-backup exclusions |
| `platform-outage-assets-offline` | rare/**critical** | Many v2 assets offline across regions; "Endpoint Backup v2 - Assets Reporting Offline; Backups and Restores Unavailable"; "Offsite Sync… impacted" | Cloud-side defect / bad agent build to prod; offsite-sync incident; broad UniView/v2 outage (one lasted ~94 hrs) | **[AUTO]** **Correlate mass-offline with Datto status incident** · Suppress duplicate per-asset alerts · Post incident banner + ETA · **Avoid futile mass reinstalls** · Auto-verify recovery after clear |
| `macos-agent-limitations` | occasional/medium | No backup while disk locked/no login (FileVault); APFS restore loses permissions; can't virtualize Mac; **yellow tray = Full Disk Access denied**; install fails on unsupported macOS/Fusion/RAID | FileVault keeps disk encrypted pre-login; APFS perm caveat; Mac virt unsupported (licensing); FDA not granted; Fusion/RAID & macOS <13.5 unsupported; AV blocks | **[HIL]** Detect Full Disk Access denied · Detect FileVault-blocked backups · Verify macOS version/Fusion/RAID supportability · Guide manual encryption-key install. *Granting macOS perms / FileVault login can't be automated* |
| `file-restore-large-slow-zip` | occasional/low | Whole-point download = huge ZIP; SFTP slow on many small files; long mount wait; "Downloading the entire recovery point can result in very large download sizes" | Whole-point size scales with data; per-file overhead; cloud↔destination bandwidth | **[AUTO]** Mount recovery point for file restore · **Scoped path-level restore** · Estimate download size before export · Switch to SFTP for bulk · Use differential restore |
| `consumption-billing-storage-pool-overage` | common/medium | Per-GB overage when pool exceeded; "billed for the extra consumption on a per-GB basis"; "starter pool of 5 TB"; "250 GB of pooled storage per license"; Kaseya 365 bundling concern | Billing = total protected cloud storage; starter pools easily exceeded; shadow churn / large fulls; bundle delivery | **[AUTO]** **Show pool usage vs entitlement** · Rank assets by storage consumption · Project end-of-cycle overage · Apply retention/exclusion changes · **Remove decommissioned asset to immediately free storage**. **[HIL]** retention/exclusion policy |

### 4.3 What can be auto-remediated vs human-in-loop (summary)

**Safe to auto-remediate (scope = "always going forward", gated by approval per the [automation engine](../07-troubleshooting-and-automation-engine.md)):**
- Restart agent services / Repair Agent Communications + service watchdog (`agent-service-stopped`, `agent-not-checking-in`)
- Schedule post-install reboot to arm CBT (`no-reboot-after-install-daily-only`)
- Toggle off metered-pause / scope per agent (`metered-network-pause`)
- Fix throttle=0 → safe minimum (`throttle-zero-deadlock`) — also a **preventive validation rule**
- Apply cbtfilter AV/EDR exclusions + reboot (`cbtfilter-blocked-diffmerge`, `high-cpu-…`)
- Adjust check-in alert threshold / suppress slow-seed alerts while progressing (noise control)
- Outage correlation + per-asset alert suppression + incident banner (`*-platform-outage`)
- Suppress known-limitation screenshot failures (hostname/NIC) and re-run screenshot (`screenshot-*`)

**Human-in-loop / often needs a Datto Support ticket:**
- **BMR** — `bmr-code-9999`, `bmr-boot-failure`, `bmr-environment-failures` (offline boot media, firmware, driver injection; 9999 ambiguity)
- **NTFS-corrupted / untrusted chains** — `ntfs-corruption-diffmerge-first`, `backup-chain-corruption-bad-agent-version` (deciding which points to distrust + re-seed)
- **macOS** — FileVault login, Full Disk Access, manual key install (`macos-agent-limitations`)
- **Re-architecture** — supported-config remediation (`unsupported-config-silent-backup-fail`)
- **Commercial** — what to delete on a client volume, buy cloud storage, retention policy (`free-space-…`, `consumption-billing-…`)
- The **cosmetic-vs-real screenshot judgement** is assisted (OCR pre-classify) but the final call is human.

---

## 5. Care Center views & product-specific content

The DEB experience plugs into the canonical [information architecture](../04-information-architecture.md) and [page specs](../09-page-specs.md). DEB-specific surfaces:

### 5.1 Fleet / agent table (the core surface)
Per the [design system](../03-design-system.md), the table is the primary surface — dense, sticky header/col, with a **"last 10 backups" dot-strip** per agent and a bulk toolbar. DEB-specific columns:

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ⬡ Hostname ▾   Gen  Ver        Status      Check-in  VSS   CBT   Last 10        Sync │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ⬡ SQL-PRD-01   v2   3.x⚠       ● Failed    2h stale  DBD!  ✓     ●●●●●●●●○●     ⟳ que │
│ ⬡ LAPTOP-23    v2   3.0.40     ◐ Paused     ok       ✓     ✓     ●●●●●●○○○○     —    │  ← metered, reason chip
│ ⬡ DC-OLD-NAME… v1   3.0.18⚠    ▲ Warning    ok       ✓     —     ●●●●●●●●●▲     ✓    │  ← hostname≥50, cosmetic SS fail
└────────────────────────────────────────────────────────────────────────────────────┘
Bulk toolbar: [Restart services] [Repair comms] [Force diff-merge] [Apply AV exclusions] [Update agent] [Add to cart →]
```
- **Status is never color-only** (dot+icon+label). The "last 10" dot-strip uses the status tokens; `untrusted`/`failed-real` points get a `Failed` dot; cosmetic failures get a muted `Warning` marker so the strip doesn't scream.
- `Ver` shows a **warning glyph against known-bad builds** (`3.0.19.1`, `3.0.19.9`, pre-`3.0.25.0` for destructive uninstaller, pre-`3.0.33.0` for NTFS-corruption) sourced from the catalog.
- Filters via [nuqs](../11-tech-architecture.md): generation, console, VSS mode, CBT state, check-in, integrity, sync, metered, version-vs-known-bad.

### 5.2 Agent detail / triage page
- **Diagnosis header** that turns the **umbrella alert into a classified root cause** (`backup-failure-alert-generic` → the specific sub-playbook). Show the matched **error string** in mono and the mapped remediation card.
- **Recovery-point timeline** with per-point `screenshot · localVerification · integrity · syncState`; cosmetic-vs-real screenshot badge; "mark safe restore point" / "flag untrusted".
- **VSS panel** — writer list with failed-writer flags + VSS_E code→remediation mapping; "Repair VSS" one-click.
- **CBT panel** (v2) — `cbtfilter` loaded/blocked/pending-reboot; "apply AV/EDR exclusions" + "reboot via RMM".
- **Action cart / chain** ([Zustand](../11-tech-architecture.md)) — scope each action **once / all matching / always going forward**, save as a **playbook**, gate by approval, audit. See [automation engine](../07-troubleshooting-and-automation-engine.md).

### 5.3 Product-specific dedicated views
- **Migration board (v1→v2)** — v1-vs-v2 asset status, **v1-only restore history with a sunset countdown**, bulk v2 deploy, UniView-registration confirmation. Surface the dual-portal split explicitly (Partner Portal vs UniView).
- **Supportability scan (v2)** — per-asset config audit (NTFS/APFS only, no REFS/dedup/external/network, single active C:, multi-session OS, ≥10% free, **post-full volume expansion**) with "re-seed full" remediation. This catches **silent** failures that never raise a normal alert.
- **Consumption / storage-pool view (v2)** — pool usage vs entitlement (5 TB Kaseya 365 / 250 GB per license), assets ranked by storage, **end-of-cycle overage projection**, one-click apply-exclusion / reduce-retention / remove-decommissioned-asset with cost-impact estimate. Kaseya purple (`--accent-corporate` / `#5E42FF`) is reserved here for the "Powered by Kaseya" / bundle-upsell framing only — never for routine actions.
- **Outage banner** — correlates mass-offline to a Datto status incident; single advisory + client-facing notice; suppresses per-asset noise and **discourages futile reinstalls**.
- **Seed / backlog monitor** — initial-full ETA from size + uplink, per-agent backlog/queue depth, "suppress slow alerts while progressing", stagger seeds, RoundTrip eligibility.

### 5.4 DEB-specific content the Care Center ships
(Authored in [content strategy](../12-content-strategy.md); referenced here for the product surface.)
- **Runbooks** for: clean reinstall (`CLEAN_INSTALL=1` + the three cache dirs), Repair VSS, cbtfilter exclusions, BMR Code 9999, metered-pause, v1→v2 migration, supportability remediation.
- **Error-string → remediation map** keyed on the catalog error strings (e.g. "VSS failed to prepare snapshots for backup", "Installation failed with code: 404", "filter driver has been blocked… diffmerge", "Agent Not Checking In", "Bare Metal Restore encountered an error. (Code 9999)").
- **Known-bad agent-version feed** for the version-warning glyph and "update agent" auto-remediation.
- **Escalation-package template** (logs + agent version + error string + steps tried) for the slow-support reality — pre-staged for every `[HIL]` Support path.
- **Empty/edge states**: a paused-metered agent, an all-offline outage, a v1-only-history asset near sunset, a supportability-failing config — each gets a purpose-built empty/error state, not a generic "no data."

---

## 6. Open decisions / flags
- **Cosmetic-vs-real screenshot classification.** The catalog leans on OCR/model-assist to pre-classify (blank vs pending-update vs BSOD stop code). This is a **front-end mock** — we should mock the classifier output deterministically in [mock data](../06-data-model-and-mock-data.md) rather than implying live OCR. Flagged for the data-model author.
- **Auto-remediation default scope.** Service-restart, throttle-fix, metered-toggle, and cbtfilter-exclusions are strong "always going forward" candidates, but reboots and clean-reinstalls carry user-impact — recommend they default to **approval-gated** rather than fully silent. Defer the final gating matrix to the [automation engine](../07-troubleshooting-and-automation-engine.md).
- **v1 surface depth.** Since v1 is being sunset (~1-year retention post-migration), should the Care Center render v1 agents read-only-plus-migrate rather than offering the full v1 remediation set? Flagged for IA.
