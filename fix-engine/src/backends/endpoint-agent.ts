/**
 * endpoint-agent — simulated ExecutionBackend for Endpoint Backup v1/v2. PowerShell
 * (Windows) or bash (macOS/Linux) on the endpoint; direct-to-Datto-Cloud, NO
 * appliance — check-in to mothership.dtc.datto.com over 443. v2 adds the `cbtfilter`
 * change-block driver that AV/EDR frequently quarantines. Language is keyed off the
 * artifact's `lang` (EndpointAsset has no os facet). No real host is touched.
 *
 * Pure + deterministic; never mutates the shared DB.
 */
import type { ProtectedAsset, EndpointAsset } from "@/types";
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
  const caps = ["endpoint-agent", `check-in:${MOTHERSHIP}:443`];
  if (target.kind === "endpoint") {
    const e = target as EndpointAsset;
    caps.push(e.agentGen === "v2" ? "cbtfilter" : "legacy-cbt", "av-exclusions", "throttle");
  }
  return caps;
}

function psTranscript(
  effect: ReturnType<typeof effectFor>,
  target: ProtectedAsset,
): string {
  const host = target.displayName;
  const lines = [`# PowerShell on ${host} (Datto Endpoint Backup → ${MOTHERSHIP}:443)`];
  switch (effect.op) {
    case "av-exclusions":
      lines.push(
        "Add-MpPreference -ExclusionPath 'C:\\Program Files\\Datto\\Endpoint Backup'",
        "Add-MpPreference -ExclusionProcess 'DattoEndpointBackup.exe','cbtfilter.sys'",
        "Get-Service -Name DattoEndpointBackup | Restart-Service  # Status: Running",
      );
      break;
    case "reload-cbt-filter":
      lines.push(
        "fltmc unload cbtfilter",
        "fltmc load cbtfilter",
        "fltmc filters | Select-String 'cbtfilter'",
        "cbtfilter            385000     12   Running",
      );
      break;
    case "set-throttle":
      lines.push(
        "(Get-DattoEndpointConfig).BandwidthThrottleKbps  # 0  (deadlock)",
        "Set-DattoEndpointConfig -BandwidthThrottleKbps 51200   # 50 Mbps floor",
        "Set-DattoEndpointConfig -PauseWhileMetered $false",
        "throttle = 51200 Kbps; pauseWhileMetered = False",
      );
      break;
    default:
      lines.push("Invoke remediation... OK", "Get-Service DattoEndpointBackup : Running");
  }
  lines.push("exit 0");
  return lines.join("\n");
}

function bashTranscript(
  effect: ReturnType<typeof effectFor>,
  target: ProtectedAsset,
): string {
  const host = target.displayName;
  const lines = [`# bash on ${host} (Datto Endpoint Backup → ${MOTHERSHIP}:443)`];
  switch (effect.op) {
    case "av-exclusions":
      lines.push(
        "+ defaults write /Library/Datto/endpoint exclusions -array '/Library/Datto'",
        "+ launchctl kickstart -k system/com.datto.endpoint",
        "  com.datto.endpoint: running",
      );
      break;
    default:
      lines.push(
        "+ launchctl unload /Library/LaunchDaemons/com.datto.endpoint.plist",
        "+ installer -pkg /var/cache/datto/datto-endpoint-3.0.41.pkg -target /",
        "+ launchctl load /Library/LaunchDaemons/com.datto.endpoint.plist",
        "+ datto-endpoint --version",
        "  3.0.41   # no longer in known-bad list",
      );
  }
  lines.push("+ echo exit=$?", "exit=0");
  return lines.join("\n");
}

export const endpointAgent: Backend = {
  kind: "endpoint-agent",
  capabilities,
  async exec(script, target, opts): Promise<ExecResult> {
    const r = draw(
      `backend:endpoint-agent:${target.id}:${script.lang}:${script.source.length}`,
    );
    const effect = effectFor(script, target);
    const projected: StateDiff = effect.diff;
    const isBash = script.lang === "bash";

    if (opts.dryRun) {
      return dryRunResult(
        projected,
        [
          `[dry-run] ${target.displayName} (endpoint)`,
          `[dry-run] would run: ${script.description}`,
          "[dry-run] no changes",
        ].join("\n"),
        jitterMs(r, 800),
      );
    }

    if (r() < 0.1) {
      return failed(
        1,
        `# endpoint ${target.displayName} → ${MOTHERSHIP}:443`,
        isBash
          ? "installer: The install failed (com.datto.endpoint busy). exit=1"
          : "Add-MpPreference : Operation blocked by tamper protection.\n    + CategoryInfo : PermissionDenied\nexit 1",
        jitterMs(r, effect.baseMs),
        { before: projected.before, after: projected.before, note: "remediation did not complete — facet unchanged" },
      );
    }

    return {
      exitCode: 0,
      stdout: isBash ? bashTranscript(effect, target) : psTranscript(effect, target),
      stderr: "",
      durationMs: jitterMs(r, effect.baseMs),
      diff: projected,
    };
  },
};
