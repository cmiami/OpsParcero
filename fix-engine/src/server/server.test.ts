/**
 * Server hardening gates (P1-1 CSRF/origin + unguessable ids + exact-step
 * approval; P2-3 budget clamp). The HTTP server is loopback dev-tooling, but
 * these are the guards that make "if you ever run it" safe — so they're gated.
 */
import { describe, it, expect, afterEach } from "vitest";
import { app } from "./index";
import { SessionStore, deferred, type SessionEntry } from "./store";
import { clampBudget, DEFAULT_BUDGET } from "../loop/budget";
import { DB, resetFleet } from "../shared/fleet";
import type { FixPlanStep, FixSession } from "../types";

// The 201-path POST kicks off a background runSession that can heal the shared
// DB; restore seeded state after each test so the suite stays order-independent (#7).
afterEach(resetFleet);

const APP_ORIGIN = "http://localhost:3000";
const assetId = (DB.assets.find((a) => a.status === "failed") ?? DB.assets[0]).id;

function jsonPost(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("server CSRF / origin guard (P1-1)", () => {
  it("rejects a POST from a non-app Origin with 403", async () => {
    const res = await jsonPost(
      "/sessions",
      { assetId },
      { Origin: "https://evil.example.com" },
    );
    expect(res.status).toBe(403);
  });

  it("rejects a non-JSON POST with 415", async () => {
    const res = await app.request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "text/plain", Origin: APP_ORIGIN },
      body: "assetId=x",
    });
    expect(res.status).toBe(415);
  });

  it("allows a same-origin JSON POST and returns an unguessable, unique id", async () => {
    const r1 = await jsonPost("/sessions", { assetId }, { Origin: APP_ORIGIN });
    expect(r1.status).toBe(201);
    const { id: id1 } = (await r1.json()) as { id: string };
    const r2 = await jsonPost("/sessions", { assetId }, { Origin: APP_ORIGIN });
    const { id: id2 } = (await r2.json()) as { id: string };
    // Random per-create — NOT the old predictable `fix-<asset>-<mode>-<n>`.
    expect(id1).toMatch(/^fix-[0-9a-f-]{36}$/);
    expect(id1).not.toBe(id2);
    expect(id1).not.toContain(assetId);
  });
});

describe("approve decision validation (#4)", () => {
  it("rejects a malformed decision with 400 — never fails open to approve", async () => {
    const r = await jsonPost("/sessions", { assetId }, { Origin: APP_ORIGIN });
    const { id } = (await r.json()) as { id: string };
    const bad = await jsonPost(
      `/sessions/${id}/approve`,
      { stepId: "p1", decision: "rejcet" },
      { Origin: APP_ORIGIN },
    );
    expect(bad.status).toBe(400);
  });

  it("accepts a valid enum decision (not a 400)", async () => {
    const r = await jsonPost("/sessions", { assetId }, { Origin: APP_ORIGIN });
    const { id } = (await r.json()) as { id: string };
    const ok = await jsonPost(
      `/sessions/${id}/approve`,
      { stepId: "p1", decision: "reject" },
      { Origin: APP_ORIGIN },
    );
    // 204 (resolved) or 409 (no open gate) — both prove the enum was accepted.
    expect([204, 409]).toContain(ok.status);
  });
});

describe("in-flight session snapshot (#17)", () => {
  it("GET /sessions/:id returns a populated session (id + state), not {}", async () => {
    const r = await jsonPost("/sessions", { assetId }, { Origin: APP_ORIGIN });
    const { id } = (await r.json()) as { id: string };
    const snap = await app.request(`/sessions/${id}`, { method: "GET" });
    const body = (await snap.json()) as { session?: { id?: string; state?: string } };
    expect(body.session?.id).toBe(id);
    expect(typeof body.session?.state).toBe("string");
  });
});

describe("budget clamp (P2-3)", () => {
  it("clamps an astronomical client budget to <= 4x the mode default", () => {
    const clamped = clampBudget(
      { maxTokens: 1e9, maxToolCalls: 1e9, maxSteps: 1e9, maxWallMs: 1e12 },
      "ai",
    );
    expect(clamped?.maxTokens).toBe(DEFAULT_BUDGET.ai.maxTokens * 4);
    expect(clamped?.maxToolCalls).toBe(DEFAULT_BUDGET.ai.maxToolCalls * 4);
    expect(clamped?.maxSteps).toBe(DEFAULT_BUDGET.ai.maxSteps * 4);
    expect(clamped?.maxWallMs).toBe(DEFAULT_BUDGET.ai.maxWallMs * 4);
  });

  it("leaves omitted fields out so the loop's defaults still apply", () => {
    expect(clampBudget({ maxTokens: 100 }, "guided")).toEqual({ maxTokens: 100 });
  });

  it("passes through a within-bounds budget and ignores undefined", () => {
    expect(clampBudget({ maxSteps: 3 }, "ai")).toEqual({ maxSteps: 3 });
    expect(clampBudget(undefined, "ai")).toBeUndefined();
  });
});

describe("approval matching requires an exact step id (P1-1)", () => {
  it("rejects a blank/mismatched stepId, accepts the exact one", async () => {
    const store = new SessionStore();
    const entry: SessionEntry = {
      id: "s1",
      session: {} as FixSession,
      events: [],
      subscribers: new Set(),
      abort: new AbortController(),
      done: deferred<void>(),
      finished: false,
    };
    store.create(entry);
    const step = { id: "p2" } as FixPlanStep;
    const decision = store.openApproval("s1", step);

    expect(store.resolveApproval("s1", "", "approve")).toBe(false);
    expect(store.resolveApproval("s1", "wrong-step", "approve")).toBe(false);
    expect(store.resolveApproval("s1", "p2", "approve")).toBe(true);
    await expect(decision).resolves.toBe("approve");
  });
});
