/**
 * agent-linux — simulated ExecutionBackend for the BCDR Linux agent. bash / python
 * on the protected host; the Datto Linux Agent uses the `dattobd` kernel module for
 * change-block tracking. Output is bash + journald style: systemctl, journalctl,
 * lsmod, dracut/initramfs, ss on ports 25568/3260/3262. No real host is touched.
 *
 * Pure + deterministic; never mutates the shared DB.
 */
import type { ProtectedAsset } from "../domain";
import type { ExecResult, StateDiff } from "../tools/types";
import {
  type Backend,
  draw,
  jitterMs,
  failed,
  dryRunResult,
  effectFor,
} from "./shared";

const MOTHERSHIP = "mothership.dtc.datto.com";

function capabilities(target: ProtectedAsset): string[] {
  const caps = ["bash", "systemctl", "journalctl", "ss"];
  if (target.kind === "agent") {
    caps.push("dattobd", "dracut", "fsck", "datto-agent");
  }
  return caps;
}

function transcript(
  effect: ReturnType<typeof effectFor>,
  target: ProtectedAsset,
): string {
  const lines: string[] = [`+ exec on ${target.displayName} (datto-linux-agent)`];
  switch (effect.op) {
    case "reload-driver":
      lines.push(
        "+ modprobe -r dattobd",
        "+ modprobe dattobd",
        "+ lsmod | grep '^dattobd'",
        "dattobd               196608  3",
        "journalctl -u dattobd --since '-10 min':",
        "  dattobd: change tracking re-armed on /dev/sda2",
      );
      break;
    case "rebuild-initramfs":
      lines.push(
        "+ KVER=$(uname -r)  # 5.14.0-427.el9.x86_64",
        "+ cp /boot/initramfs-${KVER}.img /boot/initramfs-${KVER}.img.dtc.bak",
        "+ dracut --force --add-drivers dattobd /boot/initramfs-${KVER}.img ${KVER}",
        "dracut: *** Creating initramfs image file '/boot/initramfs-5.14.0-427.el9.x86_64.img' done ***",
        "+ lsinitrd /boot/initramfs-${KVER}.img | grep dattobd",
        "  drivers/block/dattobd.ko",
      );
      break;
    case "repair-comms":
      lines.push(
        "+ systemctl restart datto-agent",
        "+ dbdctl reload",
        "dattobd: tracking re-armed",
        "+ journalctl -u datto-agent --since '-10 min' | tail -n 3",
        "  datto-agent[1183]: pairing OK — 401 cleared, paired",
        `+ ss -tnp | grep -E ':(25568|3260|3262)'`,
        `  ESTAB 0 0 10.0.4.21:48122 ${MOTHERSHIP}:25568 users:(("datto-agent",pid=1183))`,
      );
      break;
    case "restart-service":
      lines.push(
        "+ systemctl restart datto-agent",
        "+ systemctl is-active datto-agent",
        "active",
      );
      break;
    case "force-retention":
      lines.push(
        "+ zfs list -t snapshot -H -o name,used -s creation | head -n 5",
        "+ pruning recovery points beyond target window...",
        "homePool capacity 92% -> 71%; reclaimed 412G; backups un-skipped",
      );
      break;
    default:
      lines.push("+ remediation applied", "OK");
  }
  lines.push("+ echo exit=$?", "exit=0");
  return lines.join("\n");
}

export const agentLinux: Backend = {
  kind: "agent-linux",
  capabilities,
  async exec(script, target, opts): Promise<ExecResult> {
    const r = draw(
      `backend:agent-linux:${target.id}:${script.lang}:${script.source.length}`,
    );
    const effect = effectFor(script, target);
    const projected: StateDiff = effect.diff;

    if (opts.dryRun) {
      return dryRunResult(
        projected,
        [
          `[dry-run] ${target.displayName} (datto-linux-agent)`,
          `[dry-run] would run: ${script.description}`,
          "[dry-run] no changes",
        ].join("\n"),
        jitterMs(r, 850),
      );
    }

    if (r() < 0.1) {
      return failed(
        1,
        `+ exec on ${target.displayName} (datto-linux-agent)`,
        [
          "modprobe: ERROR: could not insert 'dattobd': Operation not permitted",
          "journalctl -k -p err: dattobd: failed to arm tracking (EBUSY)",
          "exit=1",
        ].join("\n"),
        jitterMs(r, effect.baseMs),
        { before: projected.before, after: projected.before, note: "remediation did not complete — facet unchanged" },
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
