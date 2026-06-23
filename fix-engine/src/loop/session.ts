/**
 * The agent loop — drives a FixSession through the state machine using a
 * ModelProvider's tool-calling stream, against the tool registry, bounded by a
 * FixBudget, honoring approval gates, emitting a transcript + ActionRun/Audit.
 *
 *   triaging → planning → [awaiting-approval] → executing → verifying →
 *     succeeded | partial | failed | escalated | halted
 */
import type { ChatMessage, ModelProvider } from "../providers/types";
import type { ToolRegistry } from "../tools/registry";
import type { ToolContext, ToolResult } from "../tools/types";
import type {
  FixSession,
  FixState,
  FixPlan,
  FixPlanStep,
  FixTranscriptTurn,
  RunSessionRequest,
  ApprovalResolver,
} from "../types";
import { TERMINAL_STATES } from "../types";
import { DEFAULT_BUDGET, Budgeter } from "./budget";
import { SeededClock } from "../shared/clock";
import { getAsset, getIssue, primaryIssueForAsset } from "../shared/fleet";
import type {
  ActionRun,
  ActionRunId,
  AuditLogEntry,
  ProtectedAsset,
  Issue,
} from "../domain";

export interface RunDeps {
  provider: ModelProvider;
  registry: ToolRegistry;
  /** Resolves approval gates; defaults to auto-approve. */
  approve?: ApprovalResolver;
  clock?: SeededClock;
  /** Optional sink for streaming (server/sim wire this). */
  onTurn?: (turn: FixTranscriptTurn) => void;
}

const SYSTEM = (mode: string) =>
  `You are the Kaseya Resolution Center remediation agent (${mode} mode). Triage the failure by ` +
  `reading diagnostics first, propose a minimal fix, dry-run it, then execute and verify. ` +
  `Never take a destructive action without approval. Stop when the asset is healthy or you cannot proceed.`;

function userPrompt(asset: ProtectedAsset, issue?: Issue): string {
  return (
    `Asset ${asset.id} (${asset.displayName}, kind=${asset.kind}, status=${asset.status}). ` +
    (issue
      ? `Issue: ${issue.title} — ${issue.problem ?? issue.detail ?? ""}`
      : `No classified issue; investigate and remediate.`)
  );
}

/** A plan derived from the registry + issue, shown alongside the agentic run. */
function derivePlan(reg: ToolRegistry, issue?: Issue): FixPlan {
  const read = reg.list().find((h) => h.spec.risk === "read");
  const write = reg.list().find((h) => h.spec.risk !== "read");
  const steps: FixPlanStep[] = [];
  if (read)
    steps.push({
      id: "p1",
      intent: "Gather evidence (diagnostics)",
      toolName: read.spec.name,
      input: {},
      actor: "we",
      risk: read.spec.risk,
      requiresApproval: read.spec.requiresApproval,
    });
  if (write)
    steps.push({
      id: "p2",
      intent: "Apply primary remediation",
      toolName: write.spec.name,
      input: {},
      actor: "we",
      risk: write.spec.risk,
      requiresApproval: write.spec.requiresApproval,
    });
  if (read)
    steps.push({
      id: "p3",
      intent: "Verify protection restored",
      toolName: read.spec.name,
      input: {},
      actor: "we",
      risk: read.spec.risk,
      requiresApproval: read.spec.requiresApproval,
    });
  return {
    summary: issue ? `Resolve: ${issue.title}` : "Triage and remediate the asset",
    rationale:
      "Diagnose with read-only tools, apply the minimal remediation, then verify the symptom cleared.",
    confidencePct: issue?.aiInsight?.confidencePct ?? 72,
    steps,
  };
}

export async function runSession(
  req: RunSessionRequest,
  deps: RunDeps,
): Promise<FixSession> {
  const clock = deps.clock ?? new SeededClock();
  const { provider, registry } = deps;
  const approve = deps.approve ?? (async () => "approve" as const);

  const asset = getAsset(req.assetId);
  if (!asset) throw new Error(`[fix-engine] unknown asset: ${req.assetId}`);
  const issue = req.issueId ? getIssue(req.issueId) : primaryIssueForAsset(req.assetId);

  const budget = { ...DEFAULT_BUDGET[req.mode], ...req.budget };
  const scope = req.scope ?? "once";

  const session: FixSession = {
    id: `fix-${req.assetId}-${req.mode}`,
    mode: req.mode,
    assetId: req.assetId,
    issueId: issue?.id,
    model: req.model,
    triageModel: req.triageModel,
    scope,
    state: "triaging",
    budget,
    plan: derivePlan(registry, issue),
    transcript: [],
    usage: { inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0 },
    startedAt: clock.now(),
  };

  let idN = 0;
  const mk = (p: string) => `${p}-${idN++}`;
  const actionRunIds: ActionRunId[] = [];
  const actionRuns: ActionRun[] = [];
  const auditLog: AuditLogEntry[] = [];
  let healed = false;
  let anyWrite = false;

  function push(turn: Omit<FixTranscriptTurn, "at">) {
    const full: FixTranscriptTurn = { at: clock.tick(), ...turn };
    session.transcript.push(full);
    deps.onTurn?.(full);
  }
  function setState(s: FixState) {
    session.state = s;
    push({ kind: "status", state: s, text: `→ ${s}` });
  }

  push({ kind: "status", state: "triaging", text: "Session started." });

  const budgeter = new Budgeter(budget, clock.ms());
  const system = SYSTEM(req.mode);
  const messages: ChatMessage[] = [{ role: "user", content: userPrompt(asset, issue) }];
  const toolSpecs = registry.specs();

  while (!TERMINAL_STATES.has(session.state)) {
    const limit = budgeter.exceeded(clock.ms());
    if (limit) {
      push({ kind: "status", text: `Budget exhausted: ${limit}` });
      setState("halted");
      break;
    }
    budgeter.stepUsed();
    session.usage.steps += 1;

    // ── one model turn ──
    let text = "";
    const calls: { id: string; name: string; input: unknown }[] = [];
    try {
      for await (const ev of provider.chat({
        model: req.model.model,
        system,
        messages,
        tools: toolSpecs,
      })) {
        if (ev.type === "text") text += ev.delta;
        else if (ev.type === "tool_call") calls.push({ id: ev.id, name: ev.name, input: ev.input });
        else if (ev.type === "usage") {
          budgeter.addTokens(ev.inputTokens + ev.outputTokens);
          session.usage.inputTokens += ev.inputTokens;
          session.usage.outputTokens += ev.outputTokens;
        } else if (ev.type === "error") {
          push({ kind: "status", text: `Provider error: ${ev.message}` });
          setState("failed");
        }
      }
    } catch (e) {
      push({ kind: "status", text: `Provider threw: ${(e as Error).message}` });
      setState("halted");
      break;
    }
    if (text) push({ kind: "model", text });

    if (calls.length === 0) {
      // The model is done. Outcome from what happened.
      setState(healed ? "succeeded" : anyWrite ? "partial" : "escalated");
      break;
    }

    messages.push({ role: "assistant", content: text, toolCalls: calls });

    for (const call of calls) {
      const handler = registry.get(call.name);
      if (!handler) {
        push({ kind: "observation", text: `Unknown tool "${call.name}" — skipped.` });
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: "ERROR: unknown tool" });
        continue;
      }
      const step = session.plan?.steps.find((s) => s.toolName === call.name);
      const gated =
        (step?.requiresApproval ?? handler.spec.requiresApproval) ||
        (req.mode === "guided" && step?.actor === "you");

      if (gated) {
        setState("awaiting-approval");
        const planStep: FixPlanStep = step ?? {
          id: mk("step"),
          intent: handler.spec.description,
          toolName: call.name,
          input: call.input,
          actor: "we",
          risk: handler.spec.risk,
          requiresApproval: true,
        };
        const decision = await approve(planStep);
        push({ kind: "approval", text: `Approval for "${call.name}": ${decision}` });
        if (decision === "reject") {
          push({ kind: "status", text: "Approval rejected — halting." });
          setState("halted");
          messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: "REJECTED by approver" });
          break;
        }
      }

      const isRead = handler.spec.risk === "read";
      setState(isRead ? (anyWrite ? "verifying" : "triaging") : "executing");
      budgeter.toolUsed();
      session.usage.toolCalls += 1;
      push({ kind: "tool_call", toolCall: { id: call.id, name: call.name, input: call.input } });

      const ctx: ToolContext = { asset, issue, dryRun: false, scope, emit: () => {} };

      // Dry-run preview first for any write (zero mutation), then execute.
      let result: ToolResult;
      if (!isRead) {
        const preview = await handler.preview(call.input, { ...ctx, dryRun: true });
        push({ kind: "observation", text: `dry-run: ${preview.summary}`, toolResult: preview });
        result = await handler.run(call.input, ctx);
        anyWrite = true;
        if (result.healed) healed = true;
        // Attribute the run to the AI agent.
        const auditId = mk("aud");
        const runId = mk("act") as unknown as ActionRunId;
        const run: ActionRun = {
          id: runId,
          actionId: (handler.spec.actionId ?? (`ai:${call.name}` as unknown)) as ActionRun["actionId"],
          triggeredBy: { kind: "ai", refId: session.id },
          scope,
          targetRefs: [{ kind: "asset", id: asset.id, label: asset.displayName }],
          paramsUsed: (call.input ?? {}) as Record<string, unknown>,
          state: result.ok ? "succeeded" : "failed",
          dryRun: false,
          startedAt: session.startedAt,
          finishedAt: clock.now(),
          resultSummary: result.summary,
          auditLogEntryIds: [auditId as unknown as AuditLogEntry["id"]],
        };
        actionRuns.push(run);
        actionRunIds.push(runId);
        auditLog.push({
          id: auditId as unknown as AuditLogEntry["id"],
          at: clock.now(),
          actor: { kind: "ai", refId: session.id },
          verb: "ran-action",
          subjectRef: { kind: "asset", id: asset.id, label: asset.displayName },
          scope,
          outcome: result.ok ? "succeeded" : "failed",
          detail: result.summary,
        });
        push({ kind: "verification", text: result.summary, toolResult: result });
      } else {
        result = await handler.run(call.input, ctx);
        push({ kind: "tool_result", toolResult: result });
      }

      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: result.output });
    }
  }

  session.finishedAt = clock.now();
  session.result = {
    healed,
    summary:
      session.state === "succeeded"
        ? `Resolved ${asset.displayName} — protection restored.`
        : session.state === "partial"
          ? `Partial: remediation ran on ${asset.displayName} but health not fully confirmed.`
          : session.state === "halted"
            ? `Halted before resolving ${asset.displayName}.`
            : `Could not auto-resolve ${asset.displayName} — escalated.`,
    actionRunIds,
  };
  // Expose the constructed records for persistence by the server/app (M3/M4).
  (session as FixSession & { actionRuns?: ActionRun[]; auditLog?: AuditLogEntry[] }).actionRuns = actionRuns;
  (session as FixSession & { actionRuns?: ActionRun[]; auditLog?: AuditLogEntry[] }).auditLog = auditLog;
  return session;
}
