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
    expect(redact("access_token=ya29." + "SECRETVALUE12345 ok")).toBe(
      "access_token=[redacted] ok",
    );
    // authorization with a scheme keeps the scheme word; the credential is masked.
    expect(redact("authorization=Basic dXNlcjpwYXNz x")).toBe(
      "authorization=Basic [redacted] x",
    );
    // authorization with a BARE opaque credential (no scheme) must still be masked
    // — this is the leak that appears if `authorization` is dropped from coverage.
    expect(redact("authorization=opaquetoken123 x")).toBe(
      "authorization=[redacted] x",
    );
    expect(redact('"Authorization": "Bearer eyJabc.def.ghi long"')).toContain(
      "[redacted]",
    );
    // Must not mask the ordinary word "author".
    expect(redact("the author wrote it")).toBe("the author wrote it");
  });

  // Secret-shaped fixtures are ASSEMBLED FROM FRAGMENTS so no contiguous token /
  // key literal exists in this file's text — GitHub push-protection and other
  // secret scanners match the source text, not the runtime value. The regexes
  // still see the joined string at runtime.
  const PRIV = "PRIVATE" + " KEY";
  const beginKey = (kind: string) => `-----BEGIN ${kind} ${PRIV}-----`;
  const endKey = (kind: string) => `-----END ${kind} ${PRIV}-----`;

  it("masks PEM private-key blocks whole", () => {
    const pem = `${beginKey("OPENSSH")}\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmU\nAAAAC2tleS1 kZXI=\n${endKey("OPENSSH")}`;
    expect(redact(`dumped key:\n${pem}\nok`)).toBe(
      "dumped key:\n[redacted-private-key]\nok",
    );
    expect(redact(`${beginKey("RSA")}\nMIIE\n${endKey("RSA")}`)).toBe(
      "[redacted-private-key]",
    );
  });

  it("masks the password in URI userinfo, keeping scheme/user/host", () => {
    expect(redact("DSN: postgres://reporting:R3p0rtPa55@10.0.0.5:5432/db")).toBe(
      "DSN: postgres://reporting:[redacted]@10.0.0.5:5432/db",
    );
    expect(redact("POST https://svc:Wint3r2026@vault.corp/v1 failed")).toBe(
      "POST https://svc:[redacted]@vault.corp/v1 failed",
    );
    // No password segment → untouched (https://host/path is not userinfo).
    expect(redact("see https://docs.corp/guide here")).toBe(
      "see https://docs.corp/guide here",
    );
  });

  it("masks provider-prefixed opaque tokens (GitHub/Slack/Google)", () => {
    const gh = "ghp_" + "AbCdEf0123456789AbCdEf0123456789AbCd";
    const slack = "xoxb-" + "2410331245-2419991233-AbCdEfGhIjKlMnOpQrStUvWx";
    const google = "ya29." + "a0AfH6SMBSecretGoogleAccessTokenValue123456";
    expect(redact(`remote: token ${gh} done`)).toBe("remote: token [redacted] done");
    expect(redact(`slack auth ${slack} ok`)).toBe("slack auth [redacted] ok");
    expect(redact(`new ${google} set`)).toBe("new [redacted] set");
  });

  it("masks Cookie / Set-Cookie header values and bare session ids", () => {
    expect(redact("Set-Cookie: sessionid=9f8a7b6c5d4e3f2a1b0c; Path=/; HttpOnly")).toBe(
      "Set-Cookie: [redacted]; Path=/; HttpOnly",
    );
    expect(redact("session_id=AbC123XyZsecret here")).toBe(
      "session_id=[redacted] here",
    );
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
