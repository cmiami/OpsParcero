/**
 * Local HTTP + SSE server for the fix-engine (fix-engine 01 §7 / 07 §M3).
 *
 * Localhost-only, single-MSP, no auth (POC: the engine runs on the demoer's
 * machine; the static app reaches it via NEXT_PUBLIC_FIX_ENGINE_URL). Every body
 * is JSON; the session stream is `text/event-stream`. The Mock provider is the
 * always-on default so the server demos fully offline with zero credentials.
 *
 * Endpoints
 *   GET  /healthz                 → liveness + per-provider readiness
 *   GET  /models                  → every available model (registry, key-free = mock only)
 *   GET  /tools                   → the AI-callable tool catalog specs
 *   POST /sessions                → create + background-run a FixSession; returns { id }
 *   GET  /sessions/:id            → current FixSession snapshot
 *   GET  /sessions/:id/stream     → SSE of FixSessionEvents (replays buffer, then live)
 *   POST /sessions/:id/approve    → resolve the open approval gate
 *   POST /sessions/:id/abort      → abort the run (loop → halted)
 *
 * The loop (runSession) only surfaces a FixTranscriptTurn sink (onTurn) and an
 * ApprovalResolver. This server PROJECTS those into the FixSessionEvent union:
 *   - the initial state + the proposed plan are emitted up front,
 *   - every transcript turn becomes a `turn` event (and a `status` turn that
 *     carries a state also re-emits a `state` event),
 *   - the ApprovalResolver emits an `approval-request` event and blocks on a
 *     per-session deferred the /approve route resolves,
 *   - when the background run settles, a terminal `done` event carries the
 *     final FixSession snapshot and closes every stream.
 *
 * No secrets ever appear in a response: provider keys live only in env and are
 * surfaced as "ready" | "unconfigured" booleans, never values.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";

import { runSession } from "../loop/session";
import { defaultProviderRegistry } from "../providers/registry";
import { defaultRegistry } from "../tools/registry";
import { SeededClock } from "../shared/clock";
import { getAsset } from "../shared/fleet";
import type { ProviderId } from "../providers/types";
import type {
  FixMode,
  FixModelRef,
  FixSession,
  FixSessionEvent,
  FixPlanStep,
  RunSessionRequest,
} from "../types";
import type { AssetId, ActionScope } from "../domain";
import { SessionStore, deferred, type SessionEntry } from "./store";

// ── Configuration (env only; never hardcoded secrets) ──────────────────────
const PORT = Number(process.env.PORT ?? process.env.FIX_ENGINE_PORT ?? 8787);
const HOST = "127.0.0.1";
/** CORS allow-list: the static app origin (override with FIX_ENGINE_APP_ORIGIN). */
const APP_ORIGIN = process.env.FIX_ENGINE_APP_ORIGIN ?? "http://localhost:3000";

const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "google", "local", "mock"];

// ── Shared singletons ──────────────────────────────────────────────────────
const providers = defaultProviderRegistry();
const tools = defaultRegistry();
const store = new SessionStore();

// ── Request body shapes (validated leniently; this is a POC localhost API) ──
interface CreateSessionBody {
  assetId?: string;
  issueId?: string;
  mode?: FixMode;
  model?: { provider?: ProviderId; model?: string };
  triageModel?: { provider?: ProviderId; model?: string };
  scope?: ActionScope;
  dryRun?: boolean;
  budget?: RunSessionRequest["budget"];
}
interface ApproveBody {
  stepId?: string;
  decision?: "approve" | "reject";
}

// ── App ─────────────────────────────────────────────────────────────────────
export const app = new Hono();

app.use(
  "*",
  cors({
    origin: APP_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/healthz", (c) => {
  const providersReady: Record<string, "ready" | "unconfigured"> = {};
  for (const id of PROVIDER_IDS) {
    providersReady[id] = providers.isAvailable(id) ? "ready" : "unconfigured";
  }
  return c.json({ ok: true, providers: providersReady });
});

app.get("/models", async (c) => {
  const models = await providers.listAvailableModels();
  const listings = await providers.listings();
  return c.json({ models, providers: listings });
});

app.get("/tools", (c) => {
  return c.json({ tools: tools.specs() });
});

app.post("/sessions", async (c) => {
  let body: CreateSessionBody;
  try {
    body = (await c.req.json()) as CreateSessionBody;
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const assetId = body.assetId;
  if (!assetId) return c.json({ error: "assetId is required" }, 400);
  if (!getAsset(assetId as AssetId)) {
    return c.json({ error: `unknown asset: ${assetId}` }, 404);
  }

  const mode: FixMode = body.mode === "guided" ? "guided" : "ai";
  // Default provider=mock so the server demos offline with no keys.
  const model: FixModelRef = {
    provider: body.model?.provider ?? "mock",
    model: body.model?.model ?? "mock-fixer-1",
  };
  const triageModel: FixModelRef | undefined = body.triageModel?.provider
    ? {
        provider: body.triageModel.provider,
        model: body.triageModel.model ?? model.model,
      }
    : undefined;
  const scope: ActionScope = body.scope ?? "once";

  // Resolve the provider through the registry (never throws on a missing key;
  // an unavailable provider falls back to Mock inside the registry's chat()).
  let provider;
  try {
    const resolved = await providers.resolveProvider(model);
    provider = resolved.provider;
    // If the named provider isn't configured, transparently fall back to Mock so
    // a no-key demo never dead-ends (fix-engine 02 §7 always-available fallback).
    if (!provider.available()) {
      provider = providers.getProvider("mock");
      model.provider = "mock";
      model.model = "mock-fixer-1";
    }
  } catch {
    return c.json({ error: `unknown provider: ${model.provider}` }, 400);
  }

  // ── Build the session entry + its event projection ──
  const sessionId = `fix-${assetId}-${mode}-${store.ids().length}`;
  const abort = new AbortController();
  const entry: SessionEntry = {
    id: sessionId,
    // Placeholder until runSession constructs the real session; replaced below.
    session: {} as FixSession,
    events: [],
    subscribers: new Set(),
    abort,
    done: deferred<void>(),
    finished: false,
  };
  store.create(entry);

  let planEmitted = false;
  let lastState: FixSession["state"] | undefined;

  const runReq: RunSessionRequest = {
    assetId: assetId as AssetId,
    issueId: body.issueId,
    mode,
    model,
    triageModel,
    scope,
    dryRun: body.dryRun ?? false,
    budget: body.budget,
    // The loop's session.id must equal the id we already returned to the client.
    sessionId,
  };

  // Run the loop in the background; project its turns onto the SSE event stream.
  void (async () => {
    try {
      const session = await runSession(runReq, {
        provider,
        registry: tools,
        clock: new SeededClock(),
        // POST /sessions/:id/abort fires this controller — now the loop observes
        // it and cancels the in-flight model call, not just a pending gate.
        signal: abort.signal,
        // Approval gate over the wire: announce the request, then block on the
        // store's per-session deferred until /approve (or abort) resolves it.
        approve: async (step: FixPlanStep, preview) => {
          store.emit(sessionId, { type: "approval-request", step, preview });
          return store.openApproval(sessionId, step);
        },
        // Every transcript turn → a `turn` event; emit the plan once it exists
        // and re-emit a `state` event whenever a status turn carries a new state.
        onTurn: (turn) => {
          const live = store.get(sessionId)?.session;
          if (!planEmitted && live?.plan) {
            planEmitted = true;
            store.emit(sessionId, { type: "plan", plan: live.plan });
          }
          if (turn.state && turn.state !== lastState) {
            lastState = turn.state;
            store.emit(sessionId, { type: "state", state: turn.state });
          }
          store.emit(sessionId, { type: "turn", turn });
        },
      });

      // runSession returns the final session; expose the live object + terminal.
      entry.session = session;
      if (!planEmitted && session.plan) {
        store.emit(sessionId, { type: "plan", plan: session.plan });
      }
      store.emit(sessionId, { type: "done", session });
    } catch (err) {
      // Surface a terminal done with a halted/failed snapshot so streams close.
      const snapshot: FixSession = {
        ...(entry.session as FixSession),
        state: "halted",
        finishedAt: new Date().toISOString(),
      };
      store.emit(sessionId, {
        type: "turn",
        turn: {
          at: new Date().toISOString(),
          kind: "status",
          text: `Server error running session: ${(err as Error).message}`,
        },
      });
      store.emit(sessionId, { type: "done", session: snapshot });
    } finally {
      entry.done.resolve();
    }
  })();

  // The session id is the only thing the create call returns; clients then open
  // GET /sessions/:id/stream to watch it run.
  return c.json({ id: sessionId }, 201);
});

app.get("/sessions/:id", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "unknown session" }, 404);
  return c.json({ session: entry.session });
});

app.get("/sessions/:id/stream", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "unknown session" }, 404);

  return streamSSE(c, async (stream) => {
    let closed = false;
    const send = async (event: FixSessionEvent) => {
      await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
    };

    // 1) Replay the buffered events so a late/reconnecting client never loses
    //    the story (idempotent: clients key on the turn's at+kind).
    for (const event of entry.events) {
      await send(event);
      if (event.type === "done") closed = true;
    }
    if (closed) return; // already terminal — nothing live to wait for.

    // 2) Go live: forward each newly-appended event. Resolve when `done` arrives
    //    (or the client disconnects via the abort signal).
    await new Promise<void>((resolve) => {
      const unsubscribe = store.subscribe(id, (event) => {
        void send(event)
          .then(() => {
            if (event.type === "done") {
              unsubscribe();
              resolve();
            }
          })
          .catch(() => {
            unsubscribe();
            resolve();
          });
      });
      // Client disconnected → stop streaming.
      stream.onAbort(() => {
        unsubscribe();
        resolve();
      });
    });
  });
});

app.post("/sessions/:id/approve", async (c) => {
  const id = c.req.param("id");
  if (!store.has(id)) return c.json({ error: "unknown session" }, 404);
  let body: ApproveBody;
  try {
    body = (await c.req.json()) as ApproveBody;
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const decision = body.decision === "reject" ? "reject" : "approve";
  const matched = store.resolveApproval(id, body.stepId ?? "", decision);
  if (!matched) return c.json({ error: "no pending approval for that step" }, 409);
  return c.body(null, 204);
});

app.post("/sessions/:id/abort", (c) => {
  const id = c.req.param("id");
  if (!store.has(id)) return c.json({ error: "unknown session" }, 404);
  store.abort(id);
  return c.body(null, 204);
});

// ── Boot (only when run directly, not when imported by tests) ───────────────
function isMain(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("server/index.ts") || entry.endsWith("server/index.js");
}

if (isMain()) {
  serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
    // eslint-disable-next-line no-console
    console.log(
      `[fix-engine] server listening on http://${HOST}:${info.port} ` +
        `(CORS origin: ${APP_ORIGIN}, default provider: mock)`,
    );
  });
}
