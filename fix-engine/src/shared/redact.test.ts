import { describe, it, expect } from "vitest";
import { redact, redactDeep, redactTurn } from "./redact";
import type { FixTranscriptTurn } from "../types";

describe("fix-engine — secret redaction", () => {
  it("masks the common secret shapes", () => {
    expect(redact("Authorization: Bearer abc123DEF456ghi789xyz")).toBe(
      "Authorization: Bearer [redacted]",
    );
    expect(redact("key = sk-proj-AbCdEf123456GhIjKl")).toContain("sk-[redacted]");
    expect(redact("connect with password=hunter2secret now")).toBe(
      "connect with password=[redacted] now",
    );
    expect(
      redact('{"client_secret":"s3cr3t-value-9999"}'),
    ).toContain('client_secret":"[redacted]');
    expect(
      redact("token eyJhbGciOi.eyJzdWIiOiI.SflKxwRJSMeKKF2QT4"),
    ).toContain("[redacted-jwt]");
    expect(redact("aws AKIAIOSFODNN7EXAMPLE here")).toContain("AKIA[redacted]");
    expect(redact("Server=db;Password=p@ss;Db=x")).toContain("Password=[redacted]");
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
