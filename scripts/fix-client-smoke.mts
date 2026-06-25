/**
 * FixClient seam smoke — proves the SimFixClient's engine dependency graph is
 * BROWSER-SAFE (no node-only / SDK imports) and that one Mock session runs to a
 * terminal state through the exact modules SimFixClient pulls in.
 *
 * It imports the engine via the SAME `@fix-engine/*` + `@/*` aliases the app uses
 * (resolved from the app tsconfig), so a regression that drags a node/SDK module
 * into the sim path (e.g. importing @fix-engine/index or a real provider) fails
 * here immediately. It does NOT import @fix-engine/index, /providers/registry,
 * /providers/{anthropic,openai,google,local}, /cli, or /server.
 *
 * Run:  npm run smoke:fix-client
 *   (uses the engine's tsx + the app tsconfig path mappings)
 */
import { runSession } from "@fix-engine/loop/session";
import { MockProvider } from "@fix-engine/providers/mock";
import { defaultRegistry } from "@fix-engine/tools/registry";
import type { FixPlanStep, FixSessionEvent, FixTranscriptTurn } from "@fix-engine/types";
import { TERMINAL_STATES } from "@fix-engine/types";
import { DB } from "@/mock/fixtures";
import { SimFixClient } from "@/lib/fix-client/sim";
import { isLoopbackUrl } from "@/lib/fix-client";

// Re-run the exact onTurn → queue + ApprovalResolver bridge the SimFixClient uses,
// inline, so the smoke proves the *integration*, not just the imports.
function pickAssetWithIssue(): string {
  // Prefer a non-healthy asset so the loop has something to remediate.
  const broken = DB.assets.find((a) => a.status !== "protected");
  return (broken ?? DB.assets[0]).id;
}

async function main(): Promise<void> {
  const assetId = pickAssetWithIssue();
  const events: FixSessionEvent[] = [];
  const turns: FixTranscriptTurn[] = [];
  let approvals = 0;

  const session = await runSession(
    {
      assetId: assetId as never,
      mode: "ai",
      model: { provider: "mock", model: "mock-fixer-1" },
      scope: "once",
    },
    {
      provider: new MockProvider(),
      registry: defaultRegistry(),
      approve: async (step: FixPlanStep) => {
        approvals += 1;
        events.push({ type: "approval-request", step });
        return "approve" as const;
      },
      onTurn: (turn: FixTranscriptTurn) => {
        turns.push(turn);
        events.push({ type: "turn", turn });
        if (turn.kind === "status" && turn.state) {
          events.push({ type: "state", state: turn.state });
        }
      },
    },
  );
  if (session.plan) events.push({ type: "plan", plan: session.plan });
  events.push({ type: "done", session });

  // ── Assertions ──
  const fail = (msg: string): never => {
    console.error(`SMOKE FAIL: ${msg}`);
    process.exit(1);
  };

  if (!TERMINAL_STATES.has(session.state)) {
    fail(`session did not reach a terminal state (got "${session.state}")`);
  }
  if (turns.length === 0) fail("no transcript turns emitted");
  const hasToolCall = turns.some((t) => t.kind === "tool_call");
  if (!hasToolCall) fail("no tool_call turn emitted (loop never used a tool)");
  const stateEvents = events.filter((e) => e.type === "state");
  if (stateEvents.length === 0) fail("no state events derived from status turns");
  const planEvents = events.filter((e) => e.type === "plan");
  if (planEvents.length !== 1) fail(`expected exactly 1 plan event, got ${planEvents.length}`);
  if (!session.plan || session.plan.steps.length === 0) fail("session has no plan steps");

  console.log("SMOKE OK — phase 1 (raw loop / browser-safe imports)");
  console.log(`  asset           : ${assetId}`);
  console.log(`  terminal state  : ${session.state}`);
  console.log(`  transcript turns: ${turns.length}`);
  console.log(`  session events  : ${events.length} (state=${stateEvents.length}, plan=${planEvents.length}, approvals=${approvals})`);
  console.log(`  plan steps      : ${session.plan!.steps.length}  (confidence ${session.plan!.confidencePct}%)`);
  console.log(`  result          : ${session.result?.summary ?? "(none)"}`);
  console.log(`  actionRunIds    : ${session.result?.actionRunIds.length ?? 0}`);

  await phase2(gatedAssetId() ?? assetId, fail);
  phase3(fail);
  await phase4Abort(fail);
}

/**
 * Phase 4 — #2: aborting a Sim session must CANCEL the engine loop (via the
 * AbortController signal), not just fail the UI queue. Proven by: an aborted
 * session must not heal the shared in-browser fleet. Aborting before the stream
 * starts the loop means the loop sees an already-aborted signal and bails before
 * any write — so the target asset's status is unchanged.
 */
async function phase4Abort(fail: (msg: string) => never): Promise<void> {
  const candidate = DB.assets.find((a) => a.status === "failed");
  if (!candidate) {
    console.log("SMOKE OK — phase 4 (#2 abort) SKIPPED — no failed asset left");
    return;
  }
  const before = candidate.status;
  const client = new SimFixClient();
  const handle = await client.createSession({
    assetId: candidate.id as never,
    mode: "ai",
    model: { provider: "mock", model: "mock-fixer-1" },
    scope: "once",
  });
  await handle.abort();
  try {
    for await (const ev of handle.stream()) {
      void ev; // drain — abort already failed the queue, so this won't iterate far
    }
  } catch {
    // FixAbortError is expected after abort.
  }
  const after = DB.assets.find((a) => a.id === candidate.id)!.status;
  if (after !== before) {
    fail(
      `phase4: aborted sim healed ${candidate.id} (${before} -> ${after}) — loop not cancelled`,
    );
  }
  console.log("SMOKE OK — phase 4 (#2 abort cancels the loop — no post-abort heal)");
  console.log(`  asset           : ${candidate.id}`);
  console.log(`  status before/after abort: ${before} / ${after}`);
}

/**
 * Phase 3 — P3-2 loopback guard: the factory only honors a non-loopback engine
 * URL behind an explicit opt-in, so isLoopbackUrl must classify hosts correctly.
 */
function phase3(fail: (msg: string) => never): void {
  const loopback = [
    "http://127.0.0.1:8787",
    "http://localhost:3000",
    "http://[::1]:8787",
    "https://localhost/api/",
  ];
  const remote = [
    "https://evil.example.com",
    "http://10.0.0.5:8787",
    "http://attacker.test",
    "not a url",
  ];
  for (const u of loopback) {
    if (!isLoopbackUrl(u)) fail(`phase3: ${u} should be loopback`);
  }
  for (const u of remote) {
    if (isLoopbackUrl(u)) fail(`phase3: ${u} should NOT be loopback`);
  }
  console.log("SMOKE OK — phase 3 (P3-2 loopback guard classifies hosts)");
}

/** Find an asset whose primary remediation is approval-gated, to exercise the gate. */
function gatedAssetId(): string | undefined {
  // Known destructive/gated remediation target in the seeded fleet.
  const known = DB.assets.find((a) => a.id === "AST-AGT-0030");
  return known?.id;
}

/**
 * Phase 2 — drive the REAL SimFixClient end-to-end (createSession → stream →
 * approve), proving the AsyncQueue/Deferred push→pull bridge + the handle work.
 * Guided mode so any gated/"you" step opens an approval gate we auto-approve.
 */
async function phase2(
  assetId: string,
  fail: (msg: string) => never,
): Promise<void> {
  const client = new SimFixClient();
  const handle = await client.createSession({
    assetId: assetId as never,
    mode: "guided",
    model: { provider: "mock", model: "mock-fixer-1" },
    scope: "once",
  });

  const seen: FixSessionEvent["type"][] = [];
  let gates = 0;
  let finalState = "";

  for await (const ev of handle.stream()) {
    seen.push(ev.type);
    if (ev.type === "approval-request") {
      gates += 1;
      // Resolve the open gate through the client's id-keyed approve().
      await client.approve(handle.id, ev.step.id, "approve");
    } else if (ev.type === "done") {
      finalState = ev.session.state;
    }
  }

  if (!seen.includes("turn")) fail("phase2: stream yielded no turn events");
  if (!seen.includes("state")) fail("phase2: stream yielded no state events");
  if (!seen.includes("done")) fail("phase2: stream never reached done");
  if (!TERMINAL_STATES.has(finalState as never)) {
    fail(`phase2: done carried non-terminal state "${finalState}"`);
  }

  // Models list (sim → single Mock model).
  const models = await client.listModels();
  if (models.length !== 1 || models[0].provider !== "mock") {
    fail(`phase2: listModels() expected 1 mock model, got ${JSON.stringify(models.map((m) => m.id))}`);
  }

  // Abort is idempotent / safe after completion.
  await handle.abort();

  console.log("SMOKE OK — phase 2 (SimFixClient createSession/stream/approve)");
  console.log(`  session id      : ${handle.id}`);
  console.log(`  events streamed : ${seen.length}`);
  console.log(`  approval gates  : ${gates}`);
  console.log(`  final state     : ${finalState}`);
  console.log(`  models          : ${models.map((m) => m.id).join(", ")}`);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err);
  process.exit(1);
});
