/**
 * saas-api — simulated ExecutionBackend for SaaS Protect / Spanning. NO host, NO
 * script: every artifact is an HTTP request against Microsoft Graph, the Google
 * Workspace Admin SDK, or the Salesforce REST API. exec() parses the structured
 * `http` block in ScriptArtifact.source, simulates the round-trip, and returns a
 * realistic request/response transcript with a JSON body + status line. exitCode is
 * 0 for 2xx; the StateDiff lands on authStatus / seat / api-cap facets.
 *
 * Pure + deterministic; never mutates the shared DB. No network is ever touched.
 */
import type { ProtectedAsset, SaasSeatAsset, SalesforceOrgAsset } from "@/types";
import type { ExecResult, StateDiff } from "../tools/types";
import {
  type Backend,
  draw,
  jitterMs,
  dryRunResult,
  effectFor,
} from "./shared";

function capabilities(target: ProtectedAsset): string[] {
  if (target.kind === "salesforce-org") return ["salesforce-rest", "oauth2", "connected-app"];
  if (target.kind === "saas-seat") {
    const s = target as SaasSeatAsset;
    const provider = s.seatType?.toString().toLowerCase() ?? "";
    const caps = ["oauth2"];
    if (provider.includes("google") || provider.includes("gws")) caps.push("google-admin-sdk");
    else caps.push("microsoft-graph");
    return caps;
  }
  return ["oauth2"];
}

/** Pull the first method+URL out of the structured http block (best-effort). */
function firstRequest(source: string): { method: string; url: string } {
  const m = source.match(
    /\b(GET|POST|PATCH|PUT|DELETE)\s+(https?:\/\/\S+|\/\S+)/i,
  );
  if (m) return { method: m[1].toUpperCase(), url: m[2] };
  return { method: "POST", url: "https://graph.microsoft.com/v1.0/" };
}

function upn(target: ProtectedAsset): string {
  if (target.kind === "saas-seat") return (target as SaasSeatAsset).upn;
  return target.displayName;
}

function responseFor(
  effect: ReturnType<typeof effectFor>,
  target: ProtectedAsset,
): { status: string; code: number; body: string } {
  switch (effect.op) {
    case "admin-consent":
      return {
        status: "200 OK",
        code: 200,
        body: JSON.stringify(
          { tenantAdminConsent: "granted", grantedScopes: ["Mail.Read", "Sites.Read.All", "User.Read.All"], state: "fix-session" },
          null,
          2,
        ),
      };
    case "verify":
      return {
        status: "200 OK",
        code: 200,
        body: JSON.stringify({ value: [{ id: "AAMkAD-001", subject: "Connectivity probe" }], "@odata.count": 1 }, null, 2),
      };
    case "seat-rediscovery":
      return {
        status: "200 OK",
        code: 200,
        body: JSON.stringify({ operation: "RemoteSeatUpdate", upn: upn(target), archived: false, protected: true }, null, 2),
      };
    case "raise-api-cap": {
      const a = target as SalesforceOrgAsset;
      return {
        status: "200 OK",
        code: 200,
        body: JSON.stringify({ org: a.displayName, apiCallCapPct: 50, dailyApiRequests: { max: 100000, used: 14210 } }, null, 2),
      };
    }
    case "reschedule-throttle":
      return {
        status: "200 OK",
        code: 200,
        body: JSON.stringify({ scheduleWindow: "01:00-05:00 UTC", adaptiveBackoff: true, honoredRetryAfter: 1200 }, null, 2),
      };
    case "reset-sync-state":
      return {
        status: "202 Accepted",
        code: 202,
        body: JSON.stringify({ syncState: "reset", reseed: "queued", upn: upn(target) }, null, 2),
      };
    default:
      return {
        status: "200 OK",
        code: 200,
        body: JSON.stringify({ result: "ok" }, null, 2),
      };
  }
}

function transcript(
  effect: ReturnType<typeof effectFor>,
  target: ProtectedAsset,
  source: string,
): { stdout: string; code: number } {
  const { method, url } = firstRequest(source);
  const res = responseFor(effect, target);
  const stdout = [
    `> ${method} ${url}`,
    "> Authorization: Bearer {{tenant_app_token}}",
    method !== "GET" ? "> Content-Type: application/json" : "",
    "",
    `< HTTP/1.1 ${res.status}`,
    "< Content-Type: application/json",
    "<",
    res.body,
  ]
    .filter((l) => l !== "")
    .join("\n");
  return { stdout, code: res.code };
}

export const saasApi: Backend = {
  kind: "saas-api",
  capabilities,
  async exec(script, target, opts): Promise<ExecResult> {
    const r = draw(
      `backend:saas-api:${target.id}:${script.lang}:${script.source.length}`,
    );
    const effect = effectFor(script, target);
    const projected: StateDiff = effect.diff;

    if (opts.dryRun) {
      const { method, url } = firstRequest(script.source);
      return dryRunResult(
        projected,
        [
          `[dry-run] would send: ${method} ${url}`,
          `[dry-run] ${script.description}`,
          "[dry-run] no changes (request rendered, not sent)",
        ].join("\n"),
        jitterMs(r, 700),
      );
    }

    // Seeded ~10% transient API failure (429/503) so the loop exercises retries.
    if (r() < 0.1) {
      const { method, url } = firstRequest(script.source);
      return {
        exitCode: 1,
        stdout: [
          `> ${method} ${url}`,
          "> Authorization: Bearer {{tenant_app_token}}",
          "",
          "< HTTP/1.1 503 Service Unavailable",
          "< Retry-After: 1200",
          "<",
          JSON.stringify({ error: { code: "serviceNotAvailable", message: "Server is busy. Honor Retry-After." } }, null, 2),
        ].join("\n"),
        stderr: "saas-api: throttled (503) — honor Retry-After before retry",
        durationMs: jitterMs(r, effect.baseMs),
        diff: { before: projected.before, after: projected.before, note: "API throttled — facet unchanged" },
      };
    }

    const { stdout, code } = transcript(effect, target, script.source);
    return {
      exitCode: code >= 200 && code < 300 ? 0 : 1,
      stdout,
      stderr: "",
      durationMs: jitterMs(r, effect.baseMs),
      diff: projected,
    };
  },
};
