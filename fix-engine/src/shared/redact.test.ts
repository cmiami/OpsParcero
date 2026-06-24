import { describe, it, expect } from "vitest";
import { redact, redactDeep, redactTurn } from "./redact";
import type { FixTranscriptTurn } from "../types";

describe("fix-engine — secret redaction", () => {
  it("masks the common secret shapes (full-string, no trailing leak)", () => {
    expect(redact("Authorization: Bearer abc123DEF456ghi789xyz")).toBe(
      "Authorization: Bearer [redacted]",
    );
    expect(redact("key = sk-proj-AbCdEf123456GhIjKl tail")).toBe(
      "key = sk-[redacted] tail",
    );
    expect(redact("connect with password=hunter2secret now")).toBe(
      "connect with password=[redacted] now",
    );
    expect(redact('{"client_secret":"s3cr3t-value-9999"}')).toBe(
      '{"client_secret":"[redacted]"}',
    );
    expect(redact("token eyJhbGciOi.eyJzdWIiOiI.SflKxwRJSMeKKF2QT4 end")).toBe(
      "token [redacted-jwt] end",
    );
    expect(redact("aws AKIAIOSFODNN7EXAMPLE here")).toBe(
      "aws AKIA[redacted] here",
    );
    expect(redact("Server=db;Password=p@ss;Db=x")).toBe(
      "Server=db;Password=[redacted];Db=x",
    );
    // Inline access_token (was leaking — only object KEYS were masked).
    expect(redact("access_token=ya29.SECRETVALUE12345 ok")).toBe(
      "access_token=[redacted] ok",
    );
    // Basic/Digest credentials are masked by the scheme rule (scheme word kept).
    expect(redact("authorization=Basic dXNlcjpwYXNz x")).toBe(
      "authorization=Basic [redacted] x",
    );
    // Must not mask the ordinary word "author".
    expect(redact("the author wrote it")).toBe("the author wrote it");
  });

  it("is not vulnerable to ReDoS on a long whitespace run after a key word", () => {
    const start = performance.now();
    redact("password" + " ".repeat(64_000) + "x");
    const ms = performance.now() - start;
    // Bounded separator → linear; the old two-\s* group was ~4400ms here.
    expect(ms).toBeLessThan(100);
  });

  it("does NOT over-redact non-secret short ids", () => {
    // sk- + <6 chars is a snapshot/session id, not an OpenAI key.
    expect(redact("snapshot sk-7741 ok")).toBe("snapshot sk-7741 ok");
    expect(redact("nothing sensitive here")).toBe("nothing sensitive here");
  });

  it("deep-redacts nested objects", () => {
    const out = redactDeep({
      host: "fs01",
      auth: { token: "abcdef123456789", note: "ok" },
    }) as { host: string; auth: { token: string; note: string } };
    expect(out.host).toBe("fs01");
    expect(out.auth.token).toContain("[redacted]");
    expect(out.auth.note).toBe("ok");
  });

  it("redacts a transcript turn's text + toolResult + toolCall input", () => {
    const turn: FixTranscriptTurn = {
      at: "2026-06-24T00:00:00Z",
      kind: "tool_result",
      text: "ran with Bearer SECRETTOKEN12345",
      toolCall: { id: "1", name: "x", input: { password: "myp@ssword" } },
      toolResult: {
        ok: true,
        summary: "ok, api_key=ABCDEF123456",
        output: "stdout sk-proj-LongEnoughKey123",
      },
    };
    const r = redactTurn(turn);
    expect(r.text).toBe("ran with Bearer [redacted]");
    expect((r.toolCall!.input as { password: string }).password).toContain(
      "[redacted]",
    );
    expect(r.toolResult!.summary).toContain("api_key=[redacted]");
    expect(r.toolResult!.output).toContain("sk-[redacted]");
  });
});
