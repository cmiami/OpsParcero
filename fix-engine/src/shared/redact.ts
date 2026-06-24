/**
 * Secret redaction (fix-engine 01 §security). Tool output, artifacts, and the
 * model's reasoning can echo credentials (OAuth/Bearer tokens, API keys, JWTs,
 * connection-string passwords). Everything that reaches the transcript / SSE /
 * UI passes through here first, so a secret is masked at the single chokepoint
 * (the loop's `push`) rather than relying on every call site to remember.
 *
 * Conservative by design: mask the VALUE, keep the surrounding key/scheme so the
 * record stays readable ("Authorization: Bearer [redacted]").
 */
import type { FixTranscriptTurn } from "../types";
import type { ToolResult } from "../tools/types";

const RULES: Array<[RegExp, (...args: string[]) => string]> = [
  // PEM private-key blocks (SSH / RSA / EC / PGP / service-account keys dumped to
  // stdout). Runs FIRST so the whole block is masked before any base64-body rule
  // could partial-match inside it. Bounded label + LAZY body between the two
  // fixed delimiters → linear, no catastrophic backtracking on untrusted output.
  [
    /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]{0,40}PRIVATE KEY-----/g,
    () => "[redacted-private-key]",
  ],
  // Credentials in URI userinfo: scheme://user:PASSWORD@host (postgres://, redis://,
  // mongodb+srv://, amqp://, jdbc:…://, https:// basic-auth, git remotes). The kv
  // rule never fires here — the password sits between ':' and '@' with no key word.
  // Mask only the password; keep scheme/user/host. Userinfo segments are length-
  // bounded so a long no-'@' run can't backtrack quadratically.
  [
    /\b([a-z][a-z0-9+.-]{0,30}:\/\/)([^\s:@/]{1,256}):([^\s@/]{1,256})@/gi,
    (_m, prefix, user) => `${prefix}${user}:[redacted]@`,
  ],
  // Provider-prefixed opaque tokens that carry no key word / scheme in stdout:
  // GitHub (ghp_/gho_/ghu_/ghs_/ghr_), Slack (xoxb-/xoxp-/xoxa-/xoxr-/xoxs-),
  // Google OAuth access tokens (ya29.…). In scope for SaaS (M365/Google/Salesforce)
  // and Git remediation, where a reconnect/diagnostic echoes a refreshed token.
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, () => "[redacted]"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, () => "[redacted]"],
  [/\bya29\.[A-Za-z0-9._-]{10,}/g, () => "[redacted]"],
  // Cookie / Set-Cookie header values (authenticated HTTP probes echo them).
  [
    /\b((?:set-)?cookie\s{0,4}:\s{0,4})([^;\r\n]{1,4096})/gi,
    (_m, key) => `${key}[redacted]`,
  ],
  // authorization / auth = <credential>, with an OPTIONAL scheme word kept for
  // readability. One rule (not the generic kv list + the scheme rule) so the
  // scheme word is never itself mistaken for the value and double-masked:
  //   "Authorization: Bearer <tok>" → "Authorization: Bearer [redacted]"
  //   "authorization=<opaque>"      → "authorization=[redacted]"   (no leak)
  // Bounded `\s{0,4}` in the separator → no O(n²) backtracking on long runs.
  [
    /\b(authorization|auth)(\s{0,4}["']?\s{0,4}[:=]\s{0,4}["']?)(?:(Bearer|Basic|Digest)\s+)?([^\s"',;&)]{3,})/gi,
    (_m, key, sep, scheme) => `${key}${sep}${scheme ? `${scheme} ` : ""}[redacted]`,
  ],
  // Standalone HTTP auth schemes: Bearer / Basic / Digest <credential>
  // (no preceding authorization key — e.g. a raw header value in a log line).
  [
    /\b((?:Bearer|Basic|Digest)\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
    (_m, p) => `${p}[redacted]`,
  ],
  // JWT (three base64url segments)
  [
    /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
    () => "[redacted-jwt]",
  ],
  // OpenAI-style secret keys (incl. sk-proj-… with hyphens/underscores)
  [/\bsk-[A-Za-z0-9_-]{8,}/g, () => "sk-[redacted]"],
  // AWS access key id
  [/\bAKIA[0-9A-Z]{16}\b/g, () => "AKIA[redacted]"],
  // key = value / key: value secrets (also covers connection-string Password=…;,
  // since the value stops at whitespace / ; / quote). The separator uses BOUNDED
  // whitespace (\s{0,4}) — two unbounded \s* blocks would backtrack O(n²) on a
  // long whitespace run after a key word (ReDoS over untrusted tool output).
  // `authorization`/`auth` are intentionally NOT here: their credentials carry a
  // scheme word (Bearer/Basic/Digest) handled above, and listing them as kv keys
  // would re-match the scheme word ("Authorization: Bearer" → mask "Bearer").
  // They remain in SECRET_KEY for exact object-key matching in redactDeep.
  [
    /\b(password|passwd|pwd|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|access[_-]?key|session[_-]?id|sessionid|csrf[_-]?token|xsrf[_-]?token)(\s{0,4}["']?\s{0,4}[:=]\s{0,4}["']?)([^\s"',;&)]{3,})/gi,
    (_m, key, sep) => `${key}${sep}[redacted]`,
  ],
];

/** Object keys whose VALUE is a secret regardless of its shape. */
const SECRET_KEY =
  /^(password|passwd|pwd|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|access[_-]?key|authorization|auth|session[_-]?id|sessionid|csrf[_-]?token|xsrf[_-]?token|cookie)$/i;

/** Mask secrets in a string. Idempotent and safe on already-redacted text. */
export function redact(input: string): string {
  let s = input;
  for (const [re, fn] of RULES) s = s.replace(re, fn as (m: string) => string);
  return s;
}

/**
 * Deep-redact a value. Strings are pattern-redacted; an object value whose KEY
 * names a secret (token, password, …) is masked whole, since the key→value
 * association is lost once the value is a bare string.
 */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map(redactDeep) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        SECRET_KEY.test(k) && typeof v === "string" ? "[redacted]" : redactDeep(v);
    }
    return out as T;
  }
  return value;
}

function redactResult(r: ToolResult): ToolResult {
  return {
    ...r,
    summary: redact(r.summary),
    output: redact(r.output),
    opensTicket: r.opensTicket ? redact(r.opensTicket) : r.opensTicket,
    artifact: r.artifact
      ? {
          ...r.artifact,
          source: redact(r.artifact.source),
          description: redact(r.artifact.description),
        }
      : r.artifact,
    diff: r.diff ? (redactDeep(r.diff) as ToolResult["diff"]) : r.diff,
  };
}

/** Return a copy of a transcript turn with all secret-bearing fields masked. */
export function redactTurn(turn: FixTranscriptTurn): FixTranscriptTurn {
  return {
    ...turn,
    text: turn.text !== undefined ? redact(turn.text) : turn.text,
    toolCall: turn.toolCall
      ? { ...turn.toolCall, input: redactDeep(turn.toolCall.input) }
      : turn.toolCall,
    toolResult: turn.toolResult ? redactResult(turn.toolResult) : turn.toolResult,
  };
}
