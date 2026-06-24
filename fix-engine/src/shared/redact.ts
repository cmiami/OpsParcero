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
  // Authorization: Bearer <token>
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, (_m, p) => `${p}[redacted]`],
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
  // since the value stops at whitespace / ; / quote).
  [
    /\b(password|passwd|pwd|secret|client[_-]?secret|token|api[_-]?key|access[_-]?key|refresh[_-]?token)(\s*["']?\s*[:=]\s*["']?)([^\s"',;&)]{3,})/gi,
    (_m, key, sep) => `${key}${sep}[redacted]`,
  ],
];

/** Object keys whose VALUE is a secret regardless of its shape. */
const SECRET_KEY =
  /^(password|passwd|pwd|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|access[_-]?key|authorization|auth)$/i;

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
    artifact: r.artifact
      ? { ...r.artifact, source: redact(r.artifact.source) }
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
