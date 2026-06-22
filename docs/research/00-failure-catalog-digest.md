# Product Failure Research — Digest

> Auto-generated from the research workflow. Full structured data in `failure-catalog.json`.

## Datto BCDR (SIRIS / ALTO appliances)

Datto BCDR is an on-premises backup and disaster-recovery appliance line (SIRIS for servers/larger sites, ALTO for small sites/single servers, plus NAS) that takes image-based backups of Windows and Linux machines via agents and agentless VMware/Hyper-V hypervisor integration, stores them on a local ZFS pool, replicates them off-site to the Datto Cloud, and provides recovery via screenshot verification (automated boot tests), local and cloud virtualization for DR, bare metal restore (BMR), and file/folder restore. It uses Inverse Chain Technology to keep each recovery point independently bootable and includes ransomware detection and advanced/local verification. Reputation for the core backup-and-recovery engine is strong: G2 ~4.6/5 and TrustRadius ~9.2/10, with users praising reliable backups, screenshot verification, and fast recovery/virtualization. The most common reliability friction is operational rather than data-loss: storage pools filling up, VSS/ShadowSnap snapshot failures on protected machines, screenshot boot-test failures that are often cosmetic (timing/driver) rather than real DR failures, off-site sync falling behind on bandwidth, and agent communication/pairing breakage after Windows updates or certificate issues. Since the 2022 Kaseya acquisition the dominant non-technical complaint is degraded support, aggressive multi-year contract/price increases, and slower escalations, which amplifies the impact of every technical failure because Tier-1 support is harder to get through. Many failure modes already have Datto-side automation (auto diff-merge after 5 failed screenshots, DBD crash-consistent fallback, auto retry/re-pair) but still frequently require a human to interpret whether a "failure" is real and to click remediation actions.

**Top pain points:**
- Storage pool fills up (retention too loose, large change rate, off-site replication backlog) causing 'backup skipped - not enough free space' and blocked new agents
- VSS/ShadowSnap snapshot failures on the protected machine (writer in bad state, AV/firewall, conflicting backup software) causing failed or crash-consistent (DBD) backups
- Screenshot verification 'failures' that are timing/driver/cosmetic (Getting Devices Ready, sysprep, 0x7B, pending updates) rather than real unbootability, eroding trust in the boot test
- Agent communication / secure pairing breakage (401 unauthorized, blocked port 25568/3260/3262, certificate issues) often after Windows updates or auto-upgrade
- Off-site / cloud sync falling behind schedule due to limited upload bandwidth, large initial fulls, or paused sync
- Driver not loaded / agent pending reboot after Windows feature updates, forcing every backup to run as a slow differential merge
- Post-Kaseya support degradation: slow/closed tickets, KB deflection, contract price increases and multi-year lock-in
- Backup chain / filesystem integrity issues requiring diff-merge or chain rebuild, sometimes long-running and storage-intensive
- Local virtualization and BMR performance/driver problems (VirtIO, storage controller, slow boot, resource contention) during real DR
- Encrypted-agent backups paused after appliance reboot because the dataset re-seals and needs the passphrase re-entered

**Failure modes (22):**

- **ZFS storage pool full - backups skipped, new agents blocked** `[Storage/ZFS]` — freq:very common/sev:high/auto:true
  - actions: Run Force Retention now, Apply suggested retention to heaviest agents, Show top storage consumers, Delete orphaned/archived datasets, Forecast days-until-full, Open appliance upgrade request
- **VSS/ShadowSnap snapshot failure on protected machine** `[Backup Chain]` — freq:very common/sev:high/auto:true
  - actions: Query VSS writer status, Restart/reset VSS writers, Reinstall Datto VSS provider, Detect conflicting backup software, Schedule reboot + retry backup, Force differential merge
- **VSS export error mid-transfer; falls back to crash-consistent DBD** `[Backup Chain]` — freq:common/sev:medium/auto:true
  - actions: Test ports 3260/3262 reachability, Reinstall Datto VSS provider, Check VSS writer health, Alert on repeated DBD fallback, Update ShadowSnap agent
- **Agent communication / secure pairing failure (401 unauthorized)** `[Agent Communication]` — freq:very common/sev:high/auto:true
  - actions: Repair Agent Communications, Probe ports 25568/3260/3262, Restart agent service remotely, Re-pair / regenerate certificate, Retry backup, Reinstall agent (last resort)
- **Add Agent / pairing fails (pairing not allowed / validation could not complete)** `[OAuth/Auth]` — freq:occasional/sev:medium/auto:false
  - actions: Pre-flight CA/cert reachability check, Detect DirectAccess/GPO, Retry Add Agent, Open authorization ticket to Datto
- **Driver not loaded / agent pending reboot after Windows update - backups forced to diff-merge** `[Agent Communication]` — freq:common/sev:medium/auto:true
  - actions: Show agent driver status, Schedule reboot + repair comms, Manually re-run agent upgrade, Repair Agent Communications, Confirm diff-merge cleared
- **Screenshot verification fails on 'Getting Devices Ready' / sysprep timing** `[Screenshot/Local Verification]` — freq:very common/sev:low/auto:true
  - actions: Increase Additional Wait Time +5min, Re-run screenshot, Launch local virtualization to confirm boot, Classify failure as cosmetic vs real, Check pending Windows updates
- **Screenshot verification fails with BSOD / boot error (0x7B, c000021a, BOOTMGR, fsck)** `[Screenshot/Local Verification]` — freq:common/sev:medium/auto:true
  - actions: Force differential merge, Retry virtualization with alternate storage controller, Boot VM in safe mode and re-test, Trigger read-only chkdsk guidance on source, Map stop code to remediation
- **Screenshot verification fails due to hostname length or NIC-required boot** `[Screenshot/Local Verification]` — freq:occasional/sev:low/auto:true
  - actions: Flag hostname length over limit, Suppress known-limitation screenshot failures, Run local virtualization validation instead, Document verified-via-local-virt
- **Off-site / cloud synchronization falling behind schedule** `[Cloud Sync]` — freq:very common/sev:high/auto:true
  - actions: Resume off-site sync, Raise transmit limit, Convert pause window to throttle, Reduce concurrent transfers, Request RoundTrip drive, Show per-agent sync ETA
- **Differential merge / chain rebuild long-running and storage-intensive** `[Diff-Merge / Chain Rebuild]` — freq:common/sev:medium/auto:true
  - actions: Force differential merge, Show merge progress/ETA, Check/fix volume-root permissions, Adjust auto-diff-merge trigger threshold, Take new full backup instead
- **Filesystem / backup integrity verification failure (corruption)** `[Backup Chain]` — freq:common/sev:medium/auto:true
  - actions: Force differential merge, Trigger chkdsk guidance on source, Identify last verified-good recovery point, Re-run advanced verification, Open Support ticket with diagnostics
- **Agentless (VMware/Hyper-V) snapshot or CBT failure** `[Backup Chain]` — freq:common/sev:high/auto:true
  - actions: Consolidate stale snapshots, Reset/refresh CBT, Update VMware Tools (guidance), Detect competing agentless backups, Retry agentless backup
- **Local virtualization slow / unstable / won't boot during DR** `[Local Virtualization]` — freq:common/sev:high/auto:true
  - actions: Run pre-DR readiness check, Pause off-site sync for DR, Throttle/reduce concurrent backups, Warn on >5-system local test, Request off-site DR test, Update VirtIO drivers (guidance)
- **Bare Metal Restore (BMR) fails - missing storage/network drivers or Code 9999** `[BMR]` — freq:occasional/sev:high/auto:false
  - actions: Open BMR driver-injection checklist, Provide matching storage/NIC driver bundle, Collect and upload BMR logs (X:\Windows\Temp), Verify target disk size/RAID, Escalate Code 9999 to Support
- **File/folder restore fails to mount a volume** `[File Restore]` — freq:occasional/sev:medium/auto:true
  - actions: Retry file restore mount, Mount from alternate recovery point, Suggest last verified-good point, Trigger source chkdsk guidance, Open Support ticket
- **Encrypted agent backups paused after appliance reboot (dataset re-sealed)** `[Storage/ZFS]` — freq:occasional/sev:high/auto:true
  - actions: Detect sealed encrypted agents post-reboot, Prompt Decrypt now / unseal, Enable temporary troubleshooting access (6h), Alert immediately after appliance reboot, Document passphrase custody
- **ZFS pool degraded / faulted drive / checksum errors** `[Storage/ZFS]` — freq:occasional/sev:critical/auto:false
  - actions: Show ZFS pool/drive health, Auto-collect diagnostics, Open pre-filled Support ticket for faulted drive, Request scrub, Check RAID controller status
- **Ransomware detection false positive** `[Ransomware Detection]` — freq:common/sev:low/auto:true
  - actions: Mark alert as false positive, Disable ransomware detection for this agent, Correlate with backup/screenshot health, Set re-enable reminder, Identify likely-cause app
- **Backup wasn't taken in over 24 hours / no recent recovery point** `[Backup Chain]` — freq:common/sev:high/auto:true
  - actions: Force backup now, Restart agent service, Kill hung backup job, Show stale-agent fleet view, Correlate to root cause (comms/VSS/offline)
- **Post-Kaseya support degradation, price hikes and multi-year lock-in** `[Licensing/Seats]` — freq:common/sev:medium/auto:false
  - actions: Maximize self-service to avoid Tier-1, Track ticket SLA/aging, Track contract renewal dates/price changes, Surface community fixes, Build migration/exit checklist
- **NAS / network share protection snapshot failure** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: Test share connectivity/credentials, Re-run share backup, Verify storage availability, Re-add share definition

## Datto Endpoint Backup (DEB v1)

Datto Endpoint Backup (DEB) is a cloud-first, direct-to-Datto-Cloud image and file backup agent for Windows/Linux endpoints and servers, with no local appliance required. It is managed from the Datto Partner Portal and deployable/monitorable via Datto RMM. It uses block-level incremental-forever backups, ZFS-backed Inverse Chain technology in the cloud, screenshot verification, cloud virtualization, file restore (SFTP/web browser), and Bare Metal Restore (BMR). Reliability reputation is mixed: the core image/restore engine is generally regarded as solid and DR-capable, but the product has a documented history of agent-side bugs (NTFS corruption on diff-merge-as-first-backup, agent crashes during backup, throttle-set-to-zero deadlocks, an uninstaller that wiped the entire C:\Program Files\Datto directory), a notable multi-region v2 outage where assets reported offline and backups/restores/BMR failed for ~26 hours, and recurring real-world friction around backups stuck at 99% / hash-cache reuploads, VSS writer failures, screenshot verification false alarms, offsite-sync stalls that block retention, and a widely reported decline in support quality post-Kaseya acquisition. Many failure modes are agent-environment-driven (VSS, pending Windows Updates, metered networks, services stopped) and lend themselves well to one-click remediation, while DR-critical events (BMR Code 9999, NTFS-corrupted chains, retention stalls) still need human judgement and often a Datto Support ticket. The DEB v1 agent is being superseded by v2 and partners are nudged to migrate by reinstalling the v2 agent.

**Top pain points:**
- Backups stuck at 99% / not completing, often requiring a full clean uninstall-reinstall and forced re-upload via hash cache validation
- VSS / Volume Shadow Copy writer failures causing failed or crash-consistent (DBD fallback) backups
- Agent communication / offline errors - agent service stopped, unreachable, or not checking in
- Screenshot verification failures and false alarms (pending Windows Update, NIC-required boot, long hostnames, blank screens)
- Cloud / platform outages making assets report offline and blocking scheduled backups, restores, and BMR across regions
- Agent-side reliability bugs in older builds (NTFS corruption on diff-merge-as-first-backup, agent crash during backup, throttle-zero deadlock, destructive uninstaller)
- Offsite/cloud sync stalls that also stall nightly retention, causing storage and recovery-point bloat
- Slow or stalled initial full backup seeding over limited upload bandwidth
- Bare Metal Restore boot failures and the ambiguous Code 9999 error
- Decline in Datto/Kaseya support quality and slow ticket resolution reported in reviews

**Failure modes (22):**

- **Backup stuck at 99% / never completes (hash cache validation)** `[Backup Chain]` — freq:common/sev:high/auto:true
  - actions: run clean agent reinstall (CLEAN_INSTALL=1), purge local agent cache directories, force hash cache re-validation, schedule post-install reboot, trigger manual backup
- **VSS / Volume Shadow Copy writer failure blocks application-consistent backup** `[Storage/ZFS]` — freq:common/sev:high/auto:true
  - actions: run Repair VSS (restart core + failed writer), list VSS writers and flag failed ones, check shadow storage free space, complete pending Windows Updates + reboot, detect competing backup/AV products, disable volume-level shadow copies
- **VSS export error mid-transfer; falls back to DBD (crash-consistent)** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: test ports 3260/3262 reachability, validate/reinstall Datto VSS Provider service, add AV/firewall port exclusions, repair agent installation, trigger backup to confirm VSS mode
- **Backup fails because agent service is stopped or unreachable** `[Agent Communication]` — freq:common/sev:high/auto:true
  - actions: restart Datto agent services (set Automatic), repair agent communications, verify ports 3260/3262, reboot endpoint, trigger manual backup, enable service watchdog/auto-recovery
- **Agent communication error / secure-channel failure to cloud** `[Agent Communication]` — freq:common/sev:high/auto:true
  - actions: repair agent communications, run port reachability check (3260/3262), check free RAM/disk thresholds, collect agent event logs, update agent to latest version, reboot endpoint
- **Screenshot verification failure / false alarm** `[Screenshot/Local Verification]` — freq:common/sev:medium/auto:true
  - actions: re-run screenshot verification on latest point, spin up cloud virtualization to inspect boot, extend production display/power timeout, check pending Windows Updates, flag hostname-length/NIC limitation, report false alarm to support
- **Screenshot verifications not running at all** `[Screenshot/Local Verification]` — freq:occasional/sev:low/auto:true
  - actions: schedule reboot to clear pending updates, enable screenshot verification setting, force a new backup + screenshot, confirm backups are completing
- **Cloud/platform outage: assets offline, backups/restores/BMR fail** `[Cloud Sync]` — freq:rare/sev:critical/auto:true
  - actions: check Datto status page / status feed, correlate alerts to known incident, suppress per-agent alert noise during outage, post client-facing outage notice, verify recovery after incident clears
- **NTFS corruption when differential merge runs as the first backup** `[Backup Chain]` — freq:rare/sev:critical/auto:true
  - actions: upgrade agent to fixed version, force a clean FULL backup, validate recovery point integrity (virtualize + chkdsk), flag suspect points as untrusted
- **Backups deadlock/blocked when bandwidth throttle set to zero** `[Backup Chain]` — freq:occasional/sev:high/auto:true
  - actions: scan agents for throttle=0 misconfig, set safe minimum / nonzero throttle, upgrade agent to fixed build, trigger manual backup
- **Uninstaller deletes entire C:\Program Files\Datto directory** `[Agent Communication]` — freq:rare/sev:high/auto:true
  - actions: version-gate uninstall to v3.0.25.0+, upgrade before uninstall, reinstall affected sibling Datto products, verify Datto component inventory
- **Offsite/cloud sync stall blocks nightly retention (storage bloat)** `[Cloud Sync]` — freq:common/sev:high/auto:true
  - actions: increase off-site transmit limit, convert pause-schedule to throttled window, check connectivity status, request RoundTrip seed, correlate retention stall to sync backlog
- **Slow or stalled initial full backup (cloud seeding)** `[Cloud Sync]` — freq:common/sev:medium/auto:true
  - actions: estimate seed ETA from size + uplink, apply off-hours seeding throttle profile, measure actual uplink throughput, suppress 'slow' alerts while progressing
- **Backups paused because connection is metered** `[Networking]` — freq:common/sev:medium/auto:true
  - actions: toggle off 'Pause while metered' policy, un-mark Windows connection as metered, confirm next backup runs, scope policy override per agent
- **Bare Metal Restore error Code 9999** `[BMR]` — freq:occasional/sev:high/auto:false
  - actions: open pre-filled Datto Support ticket with BMR logs, validate restore point before retry (screenshot/virtualize), run target-hardware BMR readiness checklist, show Code 9999 runbook
- **Bare Metal Restore completes but target won't boot** `[BMR]` — freq:occasional/sev:high/auto:false
  - actions: pre-BMR hardware readiness checklist, re-run HIR (Reboot) for bootability, validate restore point boots in cloud first, driver-injection guidance, open support ticket with BMR logs
- **RMM agent deployment fails with Code 404 / registration token expired** `[API/Authentication]` — freq:occasional/sev:medium/auto:true
  - actions: refresh RMM registration token, validate component version (v1 [WIN]), pre-flight VC++ runtime + OS support check, redeploy agent, schedule post-install reboot
- **No incremental backups / max one backup per day after install (missing reboot)** `[Backup Chain]` — freq:common/sev:medium/auto:true
  - actions: detect missing post-install reboot, schedule one-time reboot via RMM, verify incremental cadence resumes
- **Conflicts from another backup product running alongside the agent** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: scan for competing backup software / VSS providers, guided uninstall of competing product, push AV exclusions for agent + shadow storage, re-run backup to confirm
- **Backup skipped/failed due to insufficient free space (source or cloud)** `[Storage/ZFS]` — freq:occasional/sev:high/auto:true
  - actions: clear stale shadow copies on source, disable volume-level shadow copies, report source/cloud free space, end active restore blocking retention, request cloud storage expansion
- **Backup blocked because a previous backup is still in progress (stale lock)** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: detect zero-throughput stuck job, restart agent service to clear lock, trigger fresh backup, upgrade agent for network-hang fix
- **Slow/declining Datto-Kaseya support on escalated backup issues** `[Licensing/Seats]` — freq:common/sev:medium/auto:true
  - actions: auto-assemble escalation package (logs + version + error + steps tried), deflect common issues via self-service runbooks, track ticket SLA / escalation reminders

## Datto Endpoint Backup v2 (next-gen)

Datto Endpoint Backup v2 (next-gen) is Kaseya/Datto's revamped image-based, direct-to-cloud endpoint protection platform for MSPs. Unlike v1 (managed via Datto Partner Portal), v2 is managed through the UniView console, uses a new agent that takes block-level image backups directly to Datto Cloud (no on-prem SIRIS/ALTO appliance required), and offers customizable backup policies, decoupled retention (90 days to 7 years), granular bandwidth throttling, selective backup with wildcard exclusions, and consumption/storage-pool-based billing (commonly delivered inside the Kaseya 365 Endpoint bundle). It supports cloud and local virtualization (via the Disaster Recovery variant), bare metal recovery (BMR), file restore, and screenshot verification. Reliability reputation is mixed: the core direct-to-cloud model and fast onboarding are praised, but MSPs report friction around VSS/shadow-storage conflicts, screenshot verification failures, AV/EDR blocking the cbtfilter driver (forcing diff-merges), agent communication/check-in alerts, and rigid limitations (no volume expansion after first full, single-active-partition requirements, NTFS/APFS only, no REFS, no network/external drives). Migration from v1 is largely seamless at the agent level but creates a dual-portal situation (Partner Portal vs UniView) with v1 backups retained only ~1 year. There have also been platform-wide incidents (e.g., a 2026 bug that made v2 assets show offline, halting backups/restores/BMR across all regions). Many failures self-heal via automatic diff-merge promotion, but a meaningful subset still require manual chkdsk, reboots, AV exclusions, or Datto Support escalation.

**Top pain points:**
- VSS/shadow-copy conflicts and 'VSS failed to prepare snapshots for backup' errors caused by Windows updates, third-party backup software, or insufficient shadow storage space
- Screenshot verification failures (pending Windows updates, blank/black screen from display timeout, boot failures, long hostnames, missing NIC) that flag backups as unverified even when data is good
- AV/EDR blocking the cbtfilter change-block-tracking driver, forcing every backup to run as a slow differential merge until exclusions are set and the machine is rebooted
- Agent 'not checking in' / communication-error alerts from connectivity, port 443/DNS (mothership.dtc.datto.com) issues, or stopped services
- Rigid product limitations that silently break backups: no volume expansion after first full, NTFS/APFS only (no REFS), single active C: partition, no external/network/removable drives, 10% free space requirement
- BMR failures (Code 9999, network/DHCP, RAID-vs-AHCI, secure boot/boot-mode mismatch, missing NIC/storage drivers, WiFi unsupported) that block disaster recovery
- Dual-portal migration friction from v1 (Partner Portal) to v2 (UniView) with only ~1 year of v1 backup retention and separate management surfaces
- Backup-chain corruption / unrecoverable restore points and bluescreens tied to specific buggy agent versions, mitigated by forced diff-merge promotion
- Slow direct-to-cloud upload/seeding and offsite sync backlog over limited bandwidth, especially for initial full images and large file restores
- Platform-wide outages and incidents (v2 assets reporting offline, offsite sync impacted) that halt backups/restores/BMR with no MSP-side fix
- Consumption/storage-pool billing surprises and forced Kaseya 365 bundling concerns
- Agent registration/deployment failures (Installation failed code 404, expired RMM/deployment token, pairing validation) during onboarding

**Failure modes (21):**

- **VSS failed to prepare snapshots for backup** `[Backup Chain]` — freq:very common/sev:high/auto:true
  - actions: Restart VSS service and affected writers, Clear stale VSS shadow copies, Check/report volume free space, Force differential merge backup, Detect conflicting VSS/backup software, Reinstall Datto agent
- **Agent Screenshot Verification Failed** `[Screenshot/Local Verification]` — freq:very common/sev:medium/auto:true
  - actions: Force screenshot re-verification, Force differential merge, Trigger on-demand virtualization to view boot, Change virtualization storage controller, Push Windows update + reboot via RMM, Adjust display timeout via RMM
- **AV/EDR blocks the cbtfilter driver, forcing slow diff-merges** `[Backup Chain]` — freq:common/sev:medium/auto:true
  - actions: Apply AV/EDR exclusion set, Verify/restore cbtfilter driver, Reboot protected machine via RMM, Check whether backups are stuck in diff-merge mode
- **Agent Not Checking In / communication error** `[Agent Communication]` — freq:very common/sev:high/auto:true
  - actions: Repair agent communications, Restart Datto agent services, Run connectivity/DNS probe (443, mothership.dtc.datto.com), Reinstall agent, Adjust check-in alert threshold
- **Generic Backup Failure Alert (unable to back up agent)** `[Backup Chain]` — freq:very common/sev:high/auto:true
  - actions: Run backup now, Auto-classify underlying failure from logs, Restart agent services, Force differential merge, Open correlated sub-playbook
- **Agent Registration Failed during onboarding** `[OAuth/Auth]` — freq:common/sev:high/auto:true
  - actions: Re-run agent registration, Pre-flight connectivity/DNS check, Show required firewall allowlist, Retry registration with backoff, Escalate to Datto Support
- **RMM/token deployment failure (Installation failed code 404)** `[OAuth/Auth]` — freq:common/sev:high/auto:true
  - actions: Regenerate deployment token, Validate token before deploy, Uninstall + reboot + reinstall agent, Bulk redeploy via RMM, Check firewall/SSL inspection
- **Bare Metal Restore encountered an error (Code 9999)** `[BMR]` — freq:occasional/sev:high/auto:false
  - actions: Pre-validate restore point (screenshot/virtualization), Guided BMR readiness checklist, Auto-collect and upload BMR logs, Open Datto Support case with logs attached
- **BMR network/disk/boot-mode failures in Datto Utilities** `[BMR]` — freq:occasional/sev:high/auto:false
  - actions: BMR hardware readiness pre-check, Driver bundle guidance for NIC/storage, Interactive BMR runbook, Auto-collect RAM-disk logs, Escalate to Datto Support
- **Local/cloud virtualization won't boot (Inaccessible Boot Device / 0x7B)** `[Local Virtualization]` — freq:occasional/sev:high/auto:true
  - actions: Retry virtualization with alternate storage controller, Auto-cycle SATA/SCSI/IDE controllers, Launch full-boot observation, Create Rescue Agent (DR)
- **Local/filesystem verification failure on recovery point** `[Screenshot/Local Verification]` — freq:common/sev:medium/auto:true
  - actions: Force differential merge, Run read-only chkdsk via RMM, Schedule chkdsk /f /r + reboot, Re-verify recovery point, Mark safe restore point
- **Unrecoverable restore points / bluescreens from buggy agent versions** `[Backup Chain]` — freq:occasional/sev:critical/auto:true
  - actions: Audit agent versions vs known-bad list, Push agent update + reboot, Force differential merge, Re-run screenshot verification, Detect concurrent shadow-copy software
- **v1-to-v2 migration: dual portals and v1 retention sunset** `[Licensing/Seats]` — freq:common/sev:medium/auto:true
  - actions: Bulk v2 agent deploy via RMM, Report v1-vs-v2 asset status, Flag v1-only restore history with sunset countdown, Confirm UniView registration after upgrade
- **Unsupported configurations silently break backups** `[Storage/ZFS]` — freq:common/sev:high/auto:true
  - actions: Run supportability/config scan, Detect post-full volume expansion, Re-seed new full backup, Free-space check + alert, Review selective-backup inclusions/exclusions
- **Windows volume-level shadow copies conflict with the agent** `[Storage/ZFS]` — freq:common/sev:medium/auto:true
  - actions: Detect/disable Windows volume shadow copies, Detect concurrent Windows Server Backup schedule, Stagger backup schedules, Report shadow-storage utilization
- **Slow direct-to-cloud seeding and offsite sync backlog** `[Cloud Sync]` — freq:common/sev:medium/auto:true
  - actions: Resume paused cloud sync, Adjust bandwidth throttle schedule, Show backlog/queue depth per agent, Stagger initial full seeds, Apply selective-backup exclusions
- **Platform incident: v2 assets reporting offline (backups/restores/BMR down)** `[Cloud Sync]` — freq:rare/sev:critical/auto:true
  - actions: Correlate mass-offline with Datto status incident, Suppress duplicate per-asset alerts during incident, Post incident banner + ETA to clients, Auto-verify recovery after incident clears
- **macOS agent limitations (FileVault, APFS perms, no virtualization)** `[File Restore]` — freq:occasional/sev:medium/auto:false
  - actions: Detect Full Disk Access denied, Detect FileVault-blocked backups, Verify macOS version/Fusion/RAID supportability, Guide manual encryption-key install
- **File restore is slow / huge ZIP downloads for large recovery points** `[File Restore]` — freq:occasional/sev:low/auto:true
  - actions: Mount recovery point for file restore, Scoped path-level restore, Estimate download size before export, Switch to SFTP for bulk, Use differential restore
- **Storage-pool/consumption billing surprises and bundle concerns** `[Licensing/Seats]` — freq:common/sev:medium/auto:true
  - actions: Show pool usage vs entitlement, Rank assets by storage consumption, Project end-of-cycle overage, Apply retention/exclusion changes, Remove decommissioned asset to free storage
- **Agent high CPU/disk usage slowing the protected machine** `[Agent Communication]` — freq:occasional/sev:medium/auto:true
  - actions: Detect agent as resource hog, Apply cbtfilter AV/EDR exclusions, Check CPU/RAM minimums, Tune backup schedule/throttle, Detect concurrent backup jobs

## Datto Cloud Continuity / DR (Datto BCDR Cloud — SIRIS/ALTO off-site cloud, cloud virtualization, test failover, cloud DR)

Datto Cloud Continuity is the cloud tier of the Datto BCDR platform (SIRIS, ALTO, and Datto Endpoint Backup with DR). Local appliance backups replicate off-site into the Datto Cloud, where partners can spin up cloud virtualizations, run DR test failovers via the Recovery Launchpad, perform cloud file restores and image exports, build networking (IPsec site-to-site VPN, public IP, cloud network groups), and run full cloud DR including 1-Click DR plan cloning and failback/return-to-production. Reputationally the recovery itself is regarded as highly reliable by most MSPs (G2/Capterra reviewers praise restore success and screenshot verification), and Datto layers in meaningful automation: nightly local screenshot verification, automatic differential-merge as a self-healing step for chain/screenshot issues, Cloud Deletion Defense as a cloud recycle-bin, and 1-Click DR to replay a tested config. The most common friction is not catastrophic data loss but operational: off-site replication falling behind (backlog/RoundTrip), screenshot/virtualization boot failures (storage-controller driver, multiple bootloaders, Linux dracut, encryption passphrase, BSOD 0x7B), and the heavily manual, IPsec-knowledge-heavy networking required to make a cloud failover actually usable. Post-Kaseya-acquisition support responsiveness and UI changes are a recurring complaint. Several critical recovery paths (Cloud Deletion Defense recovery, resource increases beyond 8 vCPU/16 GB, reverse-send/failback decisions, BMR driver injection) still require a human and a Datto Support ticket rather than a self-service button.

**Top pain points:**
- Off-site replication falling behind / backlog growing until a RoundTrip seed drive is needed, leaving cloud DR points stale
- Cloud virtualization / screenshot boots to a BSOD 0x0000007B (INACCESSIBLE_BOOT_DEVICE) from a wrong/missing virtual storage controller driver
- Screenshot verification false-failures (black screen, 'Getting Devices Ready', Windows Update pending, login timing) that mask real DR readiness
- Cloud DR networking is manual and IPsec-expert-only: RFC1918/reserved-subnet conflicts, only 1 public IP per VM, FIPS cipher removal breaking tunnels
- Agent communication errors break backups so no fresh point ever reaches the cloud
- Virtualized domain controllers / domain-joined VMs fail authentication ('trust relationship failed') during failover
- 1-Click DR plan gaps: VMs still booted manually in order, encryption passphrases re-entered by hand, VPN tunnels not re-established, IP-overlap blocks cloning
- Encrypted-agent cloud virtualizations stall waiting for a passphrase / fail to unseal
- Cloud Deletion Defense and resource increases require a Datto Support ticket, not a self-service action
- Failback/return-to-production is irreversible, slow (reverse-send/RoundTrip), and needs Support to scope
- File restore / image export fails to mount in the cloud (only one cloud restore of a type at a time; chkdsk/diff-merge needed)
- BMR into hardware fails on missing NIC/MSD drivers in WinPE (Code 9999), logs lost on reboot

**Failure modes (23):**

- **Off-site replication falls behind; backlog grows until a RoundTrip seed is required** `[Cloud Sync]` — freq:common/sev:high/auto:true
  - actions: Resume paused off-site sync, Raise transmit limit / throttle profile, Reprioritize a specific agent's replication, Open RoundTrip request (pre-filled), Show backlog trend & worst-offender agent
- **Cloud synchronization paused, silently stopping new points from reaching the cloud** `[Cloud Sync]` — freq:common/sev:medium/auto:true
  - actions: Resume cloud synchronization, Enable cloud backups toggle, Alert when sync paused > threshold
- **Agent communication failure stops backups so no fresh point reaches the cloud** `[Agent Communication]` — freq:very common/sev:high/auto:true
  - actions: Repair Agent Communications, Restart Datto agent services via RMM, Run port/reachability probe (25568/3262), Force backup & verify off-site replication, Repair/reinstall agent
- **Cloud virtualization / screenshot boots to BSOD 0x0000007B (INACCESSIBLE_BOOT_DEVICE)** `[Local Virtualization]` — freq:common/sev:high/auto:true
  - actions: Cycle storage controller (SATA/SCSI/IDE) & retry, Force differential merge, Take fresh backup & re-screenshot, Flag GPO Device Installation Restrictions on source
- **Screenshot verification false-failure: blank/black image, screensaver, or wait-time too short** `[Screenshot/Local Verification]` — freq:common/sev:medium/auto:true
  - actions: Increase Additional Wait Time & re-screenshot, Recommend source power-plan/screensaver change, Auto-tune wait time after N failures
- **Screenshot stuck on 'Getting Devices Ready' / extended boot** `[Screenshot/Local Verification]` — freq:common/sev:medium/auto:true
  - actions: Increase wait time & retry, Check/clear pending Windows Updates (RMM), Launch local virtualization for Event Viewer diagnostics, Force differential merge
- **Screenshot verification edge cases: long hostname, NIC-required boot, multiple bootloaders** `[Screenshot/Local Verification]` — freq:occasional/sev:medium/auto:false
  - actions: Run DR-readiness lint (hostname length, NIC/bootloader risks), Validate via full virtualization instead of screenshot, Flag domain controllers for special handling
- **Linux cloud virtualization drops to Dracut Emergency Shell (HIR can't reach dracut)** `[Local Virtualization]` — freq:occasional/sev:high/auto:false
  - actions: Force differential merge & retry virtualization, Open guided Linux dracut playbook, Escalate to Datto Support (HIR)
- **Encrypted-agent cloud virtualization stalls on passphrase / fails to unseal** `[Local Virtualization]` — freq:occasional/sev:high/auto:false
  - actions: Prompt for passphrase / unseal agent, Warn before device reboot about sealed encrypted agents, Re-run virtualization on fresh point after unseal
- **Cloud virtualization networking conflicts: reserved subnets, RFC1918 rules, gateway 0.0.0.0** `[Networking]` — freq:occasional/sev:high/auto:true
  - actions: Validate cloud subnet plan (reserved/overlap/RFC1918), Auto-suggest a safe non-conflicting subnet, Pre-map production-to-cloud subnets
- **Site-to-site IPsec VPN to the Datto Cloud won't establish (Phase 1/2 mismatch, FIPS cipher removal)** `[Networking]` — freq:occasional/sev:high/auto:false
  - actions: Show IPsec tunnel status / negotiation logs, Generate matching on-prem config snippet, Run FIPS cipher-compatibility check, Validate WAN reachability
- **Public IP / port-forwarding access to cloud VMs fails or is constrained (1 public IP per VM)** `[Networking]` — freq:occasional/sev:medium/auto:true
  - actions: Configure port-forward for a public service, Warn on RDP/3389 public exposure, Flag VMs exceeding 1-public-IP limit
- **Virtualized domain controller / domain-joined VM fails authentication during failover** `[Local Virtualization]` — freq:occasional/sev:high/auto:false
  - actions: Pre-DR check: local admin account present, Pre-DR check: DC included in failover network, Guided AD trust-repair playbook
- **1-Click DR plan replay has manual gaps: boot order, passphrases, VPN, IP overlap** `[BMR]` — freq:occasional/sev:high/auto:true
  - actions: Orchestrate ordered VM boot, Pre-flight IP overlap / missing-network check, Re-create VPN tunnels from saved config, Prompt for encryption passphrases in sequence
- **Cloud snapshots deleted with agent/share; recovery needs Cloud Deletion Defense + Support** `[Backup Chain]` — freq:occasional/sev:critical/auto:true
  - actions: One-click CDD recovery request (pre-filled), Confirm-before-delete guardrail with CDD reminder, Show remaining CDD window timer, List recently deleted cloud datasets
- **Retention silently expired the cloud DR point you needed** `[Backup Chain]` — freq:occasional/sev:high/auto:true
  - actions: Audit retention vs RPO/compliance, Warn before a critical point expires, Extend retention schedule, Lock/preserve a specific point
- **Cloud file restore / image export fails to mount or only one allowed at a time** `[File Restore]` — freq:occasional/sev:medium/auto:true
  - actions: Unmount existing cloud restore & retry, Retry restore on a previous point, Force differential merge + chkdsk guidance, Open Support ticket to repair mount
- **Bare Metal Restore into hardware fails on missing NIC/MSD drivers in WinPE (Code 9999)** `[BMR]` — freq:occasional/sev:high/auto:false
  - actions: Recommend/serve NIC+MSD driver pack for target hardware, Reminder to capture RAM-disk logs before reboot, Open Code 9999 Support escalation with logs
- **Cloud VM throttled / can't scale past 8 vCPU & 16 GB without a Support request** `[Local Virtualization]` — freq:occasional/sev:medium/auto:true
  - actions: Right-size VM within caps, One-click 'Request resource increase' (pre-filled ticket), Recommend sizing from observed load
- **Cloud virtualization auto-powers-off and is deleted after 30 days / test data wiped** `[Local Virtualization]` — freq:occasional/sev:high/auto:true
  - actions: Toggle 30-day auto power-off, Alert on VM age / pending auto-deletion, Prompt to capture/reverse-send in-cloud data before teardown
- **Failback / return-to-production is slow, manual, and irreversible (reverse-send/RoundTrip)** `[Cloud Sync]` — freq:occasional/sev:high/auto:false
  - actions: Failback readiness check (device online, diff-merge done), Estimate reverse-send/RoundTrip time from data size, Confirmation gate before irreversible conversion, Open Support scoping request
- **Filesystem/integrity check fails on the cloud point; chain needs differential merge** `[Backup Chain]` — freq:common/sev:medium/auto:true
  - actions: Force differential merge, Auto-diff-merge after N integrity/screenshot failures, Push chkdsk guidance to source (RMM), Re-verify on post-merge point
- **Slow support and new-portal UI regressions slow real-time DR troubleshooting** `[Licensing/Seats]` — freq:common/sev:medium/auto:true
  - actions: Compute independent DR-readiness scorecard from API, Template/auto-fill Support escalations, Track open ticket SLAs

## Datto SaaS Protection (Datto SaaS Protect)

Datto SaaS Protection (now under Kaseya, built on the former Backupify platform and using the "Backupify" Azure enterprise app) is a cloud-to-cloud backup service for Microsoft 365 (Exchange Online, SharePoint, OneDrive, Teams) and Google Workspace, sold almost exclusively to MSPs. It performs seat discovery, auto-add/licensing, scheduled backups (typically 1-3x/day), and granular restore/export (in-place restore and PST/file/zip export). It connects via OAuth 2 delegated/app permissions and pulls data through Microsoft Graph/EWS and Google APIs. Reliability reputation is mixed-to-positive: G2 sits around 4.4 stars and many MSPs praise set-and-forget operation, but a persistent thread of complaints centers on Microsoft/Google API throttling stalling SharePoint/Teams backups, slow large-dataset search and restore, opaque error reporting, billing for archived seats, and the very high-stakes EWS-to-Graph reauthorization wave (reauthorize by May 30, 2026 or Exchange backups stop). Datto has added meaningful automation: auto-skip of confirmed-corrupt items, automatic sync-state reset/retry, auto-rescheduling of throttled runs, and reduced backup frequency on overloaded pods. However, many failures still require a human to click Authorize (Global Admin consent), Protect All, force a re-run, or manually unseat/delete archived users. StatusGator has logged thousands of degradation events, mostly Microsoft-throttling-driven SharePoint/Teams slowdowns on specific pods.

**Top pain points:**
- Microsoft Graph/SharePoint/Teams API throttling (429/503) stalling backups in a loop so large repositories never finish within the backup window
- EWS-to-Graph migration forcing a mass OAuth reauthorization (Global Admin consent) by May 30, 2026, with Exchange backups stopping for unauthorized organizations
- Seats silently archived when Microsoft tenant/license/consent errors (AADSTS500014, AADSTS90002, AADSTS500011, 'no valid license') block seat discovery
- Archived/offboarded seats continue to consume a billable license until a human manually unseats and 'delete my data' is typed
- Slow and imprecise search/restore/export on large datasets; exports timing out or failing to load
- Opaque, generic backup error reporting requiring manual report-running and event-log digging to find root cause
- New users not protected because Auto-Add was off, or first Exchange backup failing because the user never logged into the mailbox (ErrorAccessDenied)
- Restore/export usability friction: PST export only supports mail/contacts, large zip exports fail to extract in native Windows (path too long / 0x80010135), 100GB+ downloads time out
- Teams/SharePoint integrations falling out of authorization and needing per-tenant Global Admin reauthorization
- Corrupt or unsupported individual items causing repeated 'unknown error' backup failures until Datto classifies and auto-skips them

**Failure modes (22):**

- **SharePoint/Teams backups throttled by Microsoft (429/503) and stuck in a never-completing loop** `[API Throttling]` — freq:very common/sev:high/auto:true
  - actions: Reschedule backup to low-throttle window, Reduce backup scope / split repository, Open pod incident status, Generate Microsoft throttling support ticket, Throttle-loop watchdog (escalate after N stalls)
- **EWS-to-Graph migration forces mass OAuth reauthorization; Exchange backups stop for unauthorized orgs** `[OAuth/Auth]` — freq:very common/sev:critical/auto:true
  - actions: Launch Global Admin consent flow for tenant, Re-check authorization status, Bulk reauth queue with deadline countdown, Send reauth reminder digest, Verify post-reauth Exchange backup succeeds
- **All seats suddenly archived due to Microsoft tenant/license/consent (AADSTS) errors during seat discovery** `[Licensing/Seats]` — freq:occasional/sev:high/auto:true
  - actions: Force seat re-discovery (RemoteSeatUpdate), Decode AADSTS error to remediation card, Launch reauthorization, Protect All eligible seats, Mass-archive early-warning alert
- **Offboarded/archived seats keep consuming a billable license until manually unseated** `[Licensing/Seats]` — freq:common/sev:medium/auto:true
  - actions: List archived-but-billed seats, Bulk unseat eligible (guarded), Recommend reclaimable licenses, Show retention vs. data-age per seat
- **Newly discovered users not being backed up because Auto-Add is disabled** `[Licensing/Seats]` — freq:common/sev:medium/auto:true
  - actions: Enable Auto-Add per seat type, Protect All eligible seats, Coverage-gap alert (users vs. protected seats), Cost preview before protecting
- **Initial Exchange backup fails with ErrorAccessDenied because the user never logged into the mailbox** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: Classify as uninitialized-mailbox, Send 'log in once' email to user, Retry backup after first login, Flag mailboxes with zero successful backups
- **Teams/SharePoint backup fails with 'FolderEnumerationUnknownError - Access is denied' due to unlicensed/old owner** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: Identify affected team/group, Flag unlicensed/departed owners via Graph, Retry backup after ownership fix, Link to group ownership admin page
- **SharePoint/Teams Site Manager not active; auto-add of sites fails until Global Admin reauthorizes** `[OAuth/Auth]` — freq:occasional/sev:medium/auto:true
  - actions: Launch Site Manager activation consent, Launch Teams reauthorization, Re-check site/Teams authorization status, Add to reauth queue
- **Individual corrupt/oversized/unsupported items cause repeated 'unknown error' backup failures** `[Backup Chain]` — freq:common/sev:low/auto:true
  - actions: Show auto-skipped non-actionable items, Separate fixable vs non-actionable errors, Re-run after item skip, Open event log for item detail
- **Exchange incremental backups fail with ErrorInvalidSyncStateData causing repeated/inconsistent sync cycles** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: Reset sync state / full re-sync, Auto-escalate non-converging mailbox, Show sync-state reset history
- **OneDrive backups fail with OneDriveNotProvisioned / 423 Locked / ResourceDisabled despite valid license** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: Classify OneDrive failure cause, Send 'open OneDrive once' email, Refresh multi-geo URL and retry, Re-run OneDrive backup
- **SharePoint backup fails with 403 FORBIDDEN, lookup-column threshold, or read-only database errors** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: Map SharePoint error to remediation card, Link to SharePoint admin setting, Re-run SharePoint backup, Skip persistently broken list item
- **Google Workspace Mail backups fail with invalid startHistoryId (404) and trigger rate-limiting (429/503)** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: Show historyId reset status, Reschedule Google Mail backup, Alert on reschedule loop, Check Google API quota
- **Google Workspace seat status out of sync (archived in Google still shows Active in Datto)** `[Licensing/Seats]` — freq:occasional/sev:low/auto:true
  - actions: Reconcile Google vs Datto seat status, Flag stale Active seats, Unseat departed Google users, Force seat re-sync
- **PST export fails/disappears or only partially supports content (mail/contacts only)** `[File Restore]` — freq:occasional/sev:medium/auto:true
  - actions: Pre-flight export content check, Recommend restore vs PST export, Auto-retry failed export, Notify on export completion
- **Exported zip fails to extract in native Windows (path too long / 0x80010135) and large downloads time out** `[File Restore]` — freq:common/sev:low/auto:true
  - actions: Warn on large/deep export, Offer segmented/chunked export, Link 7-Zip extraction guide, Provide resumable download link
- **Search and restore are slow/imprecise on large datasets; recovery tabs time out** `[File Restore]` — freq:common/sev:medium/auto:true
  - actions: Suggest scoped/batched restore, Show restore progress/ETA, Restore-stall watchdog, Schedule restore off-peak
- **Generic/opaque backup error reporting forces manual report-running and event-log digging** `[Reporting]` — freq:common/sev:medium/auto:true
  - actions: Auto-aggregate failures into triage queue, Group failures by error class, Auto-link error to remediation playbook, Generate failure report on demand
- **Pod-level backup performance degradation and storage/ZFS export errors affecting many tenants at once** `[Storage/ZFS]` — freq:common/sev:high/auto:true
  - actions: Subscribe to pod status feed, Suppress tenant alerts during pod incident, Show active pod incident banner, Post-incident missed-backup reconciliation
- **Teams backup integration fails with expired sync token / 400 Bad Request after Graph migration** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: Reset Teams sync token / resync, Queue Teams reauthorization, Confirm Teams presence for service, Re-run Teams backup
- **Restored OneDrive/SharePoint data loses sharing permissions; restore lands in unexpected location** `[File Restore]` — freq:occasional/sev:medium/auto:true
  - actions: Preview restore destination, Post-restore validation checklist, Flag unrestored permissions, Offer export alternative for exact-location fidelity
- **Organization not mapped in Partner Portal, breaking billing/backup/reliability reporting** `[Cloud Sync]` — freq:occasional/sev:medium/auto:true
  - actions: Detect unmapped organizations, Reconcile billable vs protected seats, Request billing review, Validate Commitment/Retention settings

## Spanning Backup (Kaseya)

Spanning Backup (now part of Kaseya, formerly Datto/Unitrends) is a cloud-to-cloud SaaS backup platform protecting Salesforce, Microsoft 365, and Google Workspace. It performs automated daily backups of both data and metadata, supports point-in-time restore, cross-user/cross-org restore and export, and Salesforce-specific features like metadata restore and sandbox seeding. It authenticates via OAuth 2.0 (no stored credentials) and integrates with Kaseya VSA/UniView/IT Complete and IT Glue for MSP management. Reputation is mixed-to-positive: review platforms rate it 4.4 (G2), 4.6 (Capterra), 3.8 (TrustRadius), with praise for ease of setup and "set and forget" operation, but recurring complaints about login/authorization friction, opaque backup-status errors that "never stop," slow/unresponsive support, billing problems, and occasional backend reliability incidents. The most notable public reliability event was mid-2023 (reported by Blocks & Files), when some US Google Workspace customers saw backups run only weekly instead of daily due to a backend "long-running backups" issue, plus a re-indexing problem where the system loses access to backup data and requires a support-driven re-index. Most failures are recoverable but many require admin action (re-authorization, license assignment, freeing storage, deactivating duplicate rules) or a support ticket, and a meaningful share are caused by upstream Microsoft Graph / Salesforce / Google API throttling and limits rather than Spanning itself. Overall it is reliable for steady-state backup once configured, but restore operations into Salesforce and authorization/license lifecycle management are the areas most prone to friction and manual intervention.

**Top pain points:**
- Authorization/OAuth friction: tenants needing re-authorization for new Microsoft permissions, tokens revoked after password changes, and 'You need to Authorize Spanning Backup on this tenant to proceed' blocking access
- Opaque backup-status errors that admins find overwhelming - 'multiple errors on backups that never stop', mix of self-healing 'Temporary Errors' vs action-required 'Attention Needed' errors with no clear one-click remediation
- Salesforce restore failures: storage-limit-reached, inactive-owner, duplicate-rule blocks, insufficient access rights, and Request Entity Too Large, each requiring different manual Salesforce-side fixes
- Backend reliability incidents (2023): Google Workspace backups running weekly instead of daily, and a re-index requirement where Spanning 'loses access to data' and needs a support ticket to remediate
- License/seat sync gaps: new users not appearing in License Manager for up to 24h, unlicensed users silently not backed up, and data purge after license unassignment (30d Google / 60d M365)
- Slow/unresponsive support and billing problems (duplicate billing, charges after cancellation) cited across reviews and press coverage
- Initial Salesforce backup exhausting API call allocation (default 15% cap) so large orgs never complete an initial backup
- Microsoft Graph / SharePoint-OneDrive-Teams throttling causing partial backups, restart loops, and generalException 500 errors that Spanning attributes to Microsoft
- Confusing progress indicators (Salesforce backup 'appears stalled' at a percentage) leading techs to think a backup is broken when it is still running
- Teams channel conversation backups limited to a 30-day retention/purge window and require manual enablement, creating restore gaps

**Failure modes (25):**

- **Microsoft 365 tenant shows 'You need to Authorize Spanning Backup on this tenant to proceed'** `[OAuth/Auth]` — freq:common/sev:high/auto:true
  - actions: Re-authorize tenant (OAuth consent deep link), Check & enable IT Complete for client, Show post-deployment sync status / ETA, Validate Global Admin role before retry
- **Microsoft 365 backups require re-authorization for additional/updated Microsoft permissions** `[OAuth/Auth]` — freq:common/sev:medium/auto:true
  - actions: Grant new Microsoft permissions (consent deep link), Notify Global Admin to re-consent, Compare granted vs required scopes
- **Google Workspace automated backups stop after a user password change revokes the OAuth token** `[OAuth/Auth]` — freq:common/sev:high/auto:true
  - actions: Reconnect Google account (re-auth link), Bulk email re-auth links to stale accounts, Flag accounts with revoked tokens
- **Users silently not backed up because no paid Spanning seat/license is assigned** `[Licensing/Seats]` — freq:common/sev:high/auto:true
  - actions: Assign seats to unprotected users, Enable auto-license new users, Alert on seat pool exhaustion, Report all unlicensed/active users
- **New domain users do not appear in License Manager (up to 24h sync delay)** `[Licensing/Seats]` — freq:common/sev:medium/auto:true
  - actions: Force directory sync now, Show last directory sync time, List directory users missing from Spanning
- **Backup data permanently purged after a license is unassigned (30d Google / 60d M365)** `[Licensing/Seats]` — freq:occasional/sev:critical/auto:true
  - actions: Apply Archived License (retain, no new backups), Warn before unassign / show purge countdown, Reapply license within grace window, Alert N days before permanent purge
- **Salesforce initial backup never completes due to API call limit (default 15% cap)** `[API Throttling]` — freq:common/sev:high/auto:true
  - actions: Raise API limit to recommended %, Estimate API calls needed for org, Show Salesforce API usage vs allocation, Schedule backup outside business hours
- **Salesforce backup 'appears stalled' at a percentage although it is still running** `[Backup Chain]` — freq:common/sev:low/auto:true
  - actions: Show per-object-type progress detail, Classify true stall vs normal long-run, Display current object + records processed
- **Salesforce app fails to load/render ('error loading rendering Spanning Backup')** `[File Restore]` — freq:occasional/sev:high/auto:true
  - actions: Run Salesforce config validator, Enable SpanningBackup/SpanningOauth connected apps, Grant VisualForce page access, Set OAuth Permitted Users policy, Check edition/firewall compatibility
- **Salesforce restore halts: 'Salesforce storage limit has been reached'** `[File Restore]` — freq:occasional/sev:high/auto:true
  - actions: Pre-flight restore storage estimate, Check org storage usage, Resume failed records after freeing space, Warn before exceeding storage limit
- **Salesforce restore fails with 'Operation Performed with Inactive User' (record owner deactivated)** `[File Restore]` — freq:occasional/sev:medium/auto:true
  - actions: Bulk reassign owner to active user, Detect inactive-owner records pre-restore, Temporarily reactivate original owner, Re-run restore for skipped records
- **Salesforce restore blocked by Duplicate Management rule ('You're creating a duplicate record')** `[File Restore]` — freq:occasional/sev:medium/auto:true
  - actions: Temporarily disable duplicate rules for restore, Auto re-enable rules after restore, List active matching/duplicate rules, Report records blocked as duplicates
- **Salesforce restore record rejected: 'Insufficient Access Rights'** `[File Restore]` — freq:occasional/sev:medium/auto:true
  - actions: Export per-record restore error log, Re-run failed records only, Run restore as System Administrator, Diagnose missing object/record access
- **Salesforce backup/restore error: 'Request Entity Too Large'** `[API Throttling]` — freq:occasional/sev:medium/auto:true
  - actions: Self-service field-exclusion for object, Auto-suggest excludable fields, Open pre-filled support request for exclusions
- **Salesforce restore of lookup relationships fails beyond 5 levels or on circular references** `[File Restore]` — freq:occasional/sev:medium/auto:true
  - actions: Analyze restore relationship graph, Staged multi-level restore plan, Export ID-mapping + error log, Flag circular relationship records
- **SharePoint/OneDrive site backup partial failure with Microsoft Graph generalException (HTTP 500 / error 14022)** `[Cloud Sync]` — freq:occasional/sev:high/auto:true
  - actions: Force re-backup affected site, Generate pre-filled Microsoft Graph support case, Extract request/client IDs from error, Track partial-error 14022 across runs
- **Microsoft 365 SharePoint/OneDrive/Teams backups throttled - restart loops and incomplete runs** `[API Throttling]` — freq:common/sev:medium/auto:true
  - actions: Enable adaptive backoff / off-hours scheduling, Identify high-churn sites driving throttling, Generate Microsoft quota-increase request, Flag oversized files (>300MB)
- **Google Workspace (Gmail/Drive) backup incomplete or stalled due to API rate limiting** `[API Throttling]` — freq:occasional/sev:medium/auto:true
  - actions: Apply exponential backoff, Classify transient vs persistent throttle, Stagger large-account scheduling, Escalate persistent quota issues to Google
- **Suspended Google Workspace users cannot be backed up (initial backup blocked)** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: Guided reactivate/backup/re-suspend workflow, Flag suspended users with no backup, Verify license stays assigned for retention
- **Teams channel conversation backups limited to 30-day retention and require manual enablement** `[Backup Chain]` — freq:occasional/sev:medium/auto:true
  - actions: Enable Teams conversation backup (Global Admin), Warn before disable (30-day purge), Track permission-apply status, Flag tenants with conversation backup off
- **Spanning loses access to backup data and requires a support-driven re-index** `[Storage/ZFS]` — freq:rare/sev:high/auto:false
  - actions: Open re-index support ticket (pre-categorized), Surface index/data-access health status, Track re-index progress
- **Backups running weekly instead of daily due to backend 'long-running backups' issue** `[Backup Chain]` — freq:rare/sev:high/auto:true
  - actions: Monitor backup cadence / RPO drift, Alert when daily backups slip, Correlate with vendor status page, Report cadence regression to support
- **Overwhelming, opaque backup-status errors ('errors on backups that never stop')** `[Agent Communication]` — freq:common/sev:medium/auto:true
  - actions: Auto-classify errors by remediation type, Collapse/suppress transient error noise, One-click fix per Attention-Needed item, Webhook/API error ingestion to PSA
- **Slow/unresponsive support and billing problems (charges after cancellation, duplicate billing)** `[Licensing/Seats]` — freq:common/sev:medium/auto:false
  - actions: Generate billing-dispute escalation package, Route to assigned account manager, Capture cancellation confirmation records
- **Repeated login/authentication prompts due to stale bookmark or wrong login entry point** `[OAuth/Auth]` — freq:common/sev:low/auto:true
  - actions: Redirect to canonical login URL, Provider-selection helper, Clear stale session/cookies

