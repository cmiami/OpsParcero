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
import { redact, redactDeep, redactTurn } from "../shared/redact";
import { getAsset, getIssue, primaryIssueForAsset } from "../shared/fleet";
import { pickToolsForAsset, type ToolsForAsset } from "../tools/catalog";
import type { ToolHandler } from "../tools/types";
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
  /** Abort signal — when fired, the loop halts and the in-flight model call is cancelled. */
  signal?: AbortSignal;
}

const SYSTEM_PREAMBLE = (mode: string) =>
  `You are the Kaseya Resolution Center remediation agent (${mode} mode). Triage the failure by ` +
  `reading diagnostics first, propose a minimal fix, dry-run it, then execute and verify. ` +
  `Never take a destructive action without approval. Stop when the asset is healthy or you cannot proceed.`;

/**
 * The system prompt carries a machine-parseable plan directive derived from the
 * asset's failure (via pickToolsForAsset). A real provider would read the tool
 * catalog + this directive and converge on the same tools; the deterministic
 * Mock provider parses it directly. Format (one tool per line):
 *
 *   <fix-plan>
 *   triage: get_vss_writers {}
 *   triage: read_event_log {"source":"VSS"}
 *   remediate: reset_vss_writers {"verifyAfter":true}
 *   verify: get_vss_writers {}
 *   </fix-plan>
 */
const PLAN_OPEN = "<fix-plan>";
const PLAN_CLOSE = "</fix-plan>";

interface PlannedCall {
  phase: "triage" | "remediate" | "verify";
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * Run a tool handler so a thrown error becomes a redacted FAILED ToolResult the
 * loop already records (result.ok === false → run "failed"), instead of escaping
 * runSession to the server's terminal catch — where its message, possibly echoing
 * a raw auth header / connection string, would be emitted. The success path is
 * untouched, so this only adds behaviour on the (otherwise-unhandled) throw path.
 */
async function runHandlerSafely(
  fn: () => Promise<ToolResult>,
  what: string,
): Promise<ToolResult> {
  try {
    return await fn();
  } catch (e) {
    return {
      ok: false,
      summary: `${what} failed`,
      output: redact((e as Error)?.message ?? String(e)),
    };
  }
}

/** Supply valid default inputs for tools whose inputSchema marks fields required. */
function defaultInputFor(handler: ToolHandler, asset: ProtectedAsset): Record<string, unknown> {
  const schema = handler.spec.inputSchema as {
    properties?: Record<string, { type?: string; default?: unknown }>;
    required?: string[];
  };
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const input: Record<string, unknown> = {};
  for (const key of required) {
    const def = props[key]?.default;
    if (def !== undefined) {
      input[key] = def;
      continue;
    }
    // Synthesize a deterministic, plausible value for the required field.
    switch (key) {
      case "tenantId":
        input[key] =
          asset.kind === "saas-seat"
            ? `${(asset as { upn?: string }).upn?.split("@")[1] ?? "contoso.onmicrosoft.com"}`
            : "contoso.onmicrosoft.com";
        break;
      case "localRetentionDays":
        input[key] = 30;
        break;
      case "rationale":
      case "reason":
        input[key] = "Primary remediation for the classified failure mode.";
        break;
      default:
        input[key] = props[key]?.type === "boolean" ? true : "";
    }
  }
  return input;
}

/**
 * Build the ordered plan-call list for an asset. The asset-correct tools come
 * from pickToolsForAsset, but each call is resolved against the REGISTRY actually
 * in use: a planned tool absent from the registry falls back to the registry's
 * first read (diagnostics/verify) or first write (remediation). This keeps the
 * plan coherent whether the loop runs the full catalog or a minimal/stub set.
 */
function plannedCalls(
  picked: ToolsForAsset,
  asset: ProtectedAsset,
  reg: ToolRegistry,
): PlannedCall[] {
  const has = (name: string) => reg.get(name) !== undefined;
  const firstRead = reg.list().find((h) => h.spec.risk === "read");
  const firstWrite = reg.list().find((h) => h.spec.risk !== "read");
  const handlerFor = (name: string): ToolHandler | undefined => reg.get(name);

  const calls: PlannedCall[] = [];

  // Diagnostics (triage): keep those present in the registry; if none are, use
  // the registry's first read tool so triage still happens.
  const diags = picked.diagnostic.filter((d) => has(d.spec.name));
  if (diags.length > 0) {
    for (const d of diags) {
      calls.push({ phase: "triage", toolName: d.spec.name, input: defaultInputFor(d, asset) });
    }
  } else if (firstRead) {
    calls.push({ phase: "triage", toolName: firstRead.spec.name, input: defaultInputFor(firstRead, asset) });
  }

  // Remediation: the picked tool if present, else the registry's first write.
  const rem = has(picked.remediation.spec.name) ? picked.remediation : firstWrite;
  if (rem) {
    calls.push({ phase: "remediate", toolName: rem.spec.name, input: defaultInputFor(rem, asset) });
  }

  // Verify: re-read the first triage tool we actually scheduled.
  const firstTriage = calls.find((c) => c.phase === "triage");
  const verifyTool = firstTriage ? handlerFor(firstTriage.toolName) : firstRead;
  if (verifyTool) {
    calls.push({ phase: "verify", toolName: verifyTool.spec.name, input: defaultInputFor(verifyTool, asset) });
  }
  return calls;
}

/** Render the plan directive block the Mock provider parses. */
function planDirective(calls: PlannedCall[]): string {
  const lines = calls.map((c) => `${c.phase}: ${c.toolName} ${JSON.stringify(c.input)}`);
  return [PLAN_OPEN, ...lines, PLAN_CLOSE].join("\n");
}

function userPrompt(asset: ProtectedAsset, issue?: Issue): string {
  return (
    `Asset ${asset.id} (${asset.displayName}, kind=${asset.kind}, status=${asset.status}). ` +
    (issue
      ? `Issue: ${issue.title} — ${issue.problem ?? issue.detail ?? ""}`
      : `No classified issue; investigate and remediate.`)
  );
}

/** A plan derived from the asset's failure (pickToolsForAsset) — the real tools. */
function buildPlan(
  calls: PlannedCall[],
  reg: ToolRegistry,
  issue?: Issue,
): FixPlan {
  const steps: FixPlanStep[] = calls.map((c, i) => {
    const spec = reg.get(c.toolName)?.spec;
    const intent =
      c.phase === "triage"
        ? "Gather evidence (diagnostics)"
        : c.phase === "remediate"
          ? "Apply primary remediation"
          : "Verify protection restored";
    return {
      id: `p${i + 1}`,
      intent,
      toolName: c.toolName,
      input: c.input,
      actor: c.phase === "remediate" && spec?.requiresApproval ? "you" : "we",
      risk: spec?.risk ?? "read",
      requiresApproval: spec?.requiresApproval ?? false,
    };
  });
  return {
    summary: issue ? `Resolve: ${issue.title}` : "Triage and remediate the asset",
    rationale:
      "Diagnose with the asset-correct read tools, apply the single best-fit remediation, then re-read to verify the symptom cleared.",
    confidencePct: issue?.aiInsight?.confidencePct ?? 72,
    steps,
  };
}

export async function runSession(
  req: RunSessionRequest,
  deps: RunDeps,
): Promise<FixSession> {
  const clock = deps.clock ?? new SeededClock();
  const { provider, registry, signal } = deps;
  const approve = deps.approve ?? (async () => "approve" as const);

  const asset = getAsset(req.assetId);
  if (!asset) throw new Error(`[fix-engine] unknown asset: ${req.assetId}`);
  const issue = req.issueId ? getIssue(req.issueId) : primaryIssueForAsset(req.assetId);

  const budget = { ...DEFAULT_BUDGET[req.mode], ...req.budget };
  // The loop is a PER-ASSET executor: it diagnoses and fixes req.assetId only.
  // `scope` is recorded on each run for traceability, but the loop never fans
  // out — applying a fix across all matching assets / promoting it to an
  // "always" policy is orchestrated by the app + policy layer (FixModal /
  // RemediationPanel target every impacted asset; an "always" apply writes an
  // AutomationPolicy). targetRefs below therefore honestly lists the single
  // asset the loop acted on, never an unexecuted cohort.
  const scope = req.scope ?? "once";
  const dryRun = req.dryRun ?? false;

  // Derive the asset-correct tools (diagnostics + the single best remediation)
  // and the ordered plan-call sequence the provider will be steered through.
  const picked = pickToolsForAsset(asset, issue);
  const calls = plannedCalls(picked, asset, registry);

  const session: FixSession = {
    id: req.sessionId ?? `fix-${req.assetId}-${req.mode}`,
    mode: req.mode,
    assetId: req.assetId,
    issueId: issue?.id,
    model: req.model,
    triageModel: req.triageModel,
    scope,
    state: "triaging",
    budget,
    plan: buildPlan(calls, registry, issue),
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
    // Redact secrets at the single chokepoint — covers the transcript, the SSE
    // projection (onTurn), and the returned session in one place.
    const full = redactTurn({ at: clock.tick(), ...turn } as FixTranscriptTurn);
    session.transcript.push(full);
    deps.onTurn?.(full);
  }
  function setState(s: FixState) {
    session.state = s;
    push({ kind: "status", state: s, text: `→ ${s}` });
  }

  push({ kind: "status", state: "triaging", text: "Session started." });

  const budgeter = new Budgeter(budget, clock.ms());
  const system = `${SYSTEM_PREAMBLE(req.mode)}\n\n${planDirective(calls)}`;
  const messages: ChatMessage[] = [{ role: "user", content: userPrompt(asset, issue) }];
  const toolSpecs = registry.specs();

  while (!TERMINAL_STATES.has(session.state)) {
    // Operator abort: stop the loop before the next model turn.
    if (signal?.aborted) {
      push({ kind: "status", text: "Aborted by operator." });
      setState("halted");
      break;
    }
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
      for await (const ev of provider.chat(
        {
          model: req.model.model,
          system,
          messages,
          tools: toolSpecs,
        },
        signal,
      )) {
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
      setState(
        dryRun && anyWrite
          ? "succeeded" // dry-run preview completed — nothing mutated
          : healed
            ? "succeeded"
            : anyWrite
              ? "partial"
              : "escalated",
      );
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

      // Scope / applicability enforcement — the agent may only run a tool that
      // declares it applies to THIS asset's kind AND product type.
      const applies =
        handler.spec.appliesToKinds.includes(asset.kind) &&
        handler.spec.productTypes.includes(asset.productType);
      if (!applies) {
        push({
          kind: "observation",
          text: `Tool "${call.name}" does not apply to ${asset.kind}/${asset.productType} — refused.`,
        });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: `ERROR: tool not applicable to asset kind=${asset.kind} product=${asset.productType}`,
        });
        continue;
      }

      const isRead = handler.spec.risk === "read";
      const step = session.plan?.steps.find((s) => s.toolName === call.name);
      setState(isRead ? (anyWrite ? "verifying" : "triaging") : "executing");
      budgeter.toolUsed();
      session.usage.toolCalls += 1;
      push({ kind: "tool_call", toolCall: { id: call.id, name: call.name, input: call.input } });

      const ctx: ToolContext = { asset, issue, dryRun, scope, emit: () => {} };

      if (isRead) {
        const result = await runHandlerSafely(() => handler.run(call.input, ctx), call.name);
        push({ kind: "tool_result", toolResult: result });
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: redact(result.output) });
        continue;
      }

      // ── Write tool ──
      // 1) PREVIEW (dry-run) first so the diff / blast-radius is on the record
      //    BEFORE any approval decision (approvers approve evidence, not intent).
      const preview = await runHandlerSafely(
        () => handler.preview(call.input, { ...ctx, dryRun: true }),
        call.name,
      );
      push({ kind: "observation", text: `Dry-run preview: ${preview.summary}`, toolResult: preview });

      // 2) Gate AFTER the preview. Destructive + over-threshold + guided "you"
      //    steps require approval. Dry-run sessions never mutate, so no gate.
      const gated =
        !dryRun &&
        ((step?.requiresApproval ?? handler.spec.requiresApproval) ||
          handler.spec.risk === "destructive" ||
          (req.mode === "guided" && step?.actor === "you"));
      if (gated) {
        setState("awaiting-approval");
        const planStep: FixPlanStep = step ?? {
          id: mk("step"),
          intent: handler.spec.description,
          toolName: call.name,
          input: call.input,
          actor: req.mode === "guided" ? "you" : "we",
          risk: handler.spec.risk,
          requiresApproval: true,
        };
        const decision = await approve(
          { ...planStep, input: redactDeep(planStep.input) },
          redactDeep(preview),
        );
        push({ kind: "approval", text: `Approval for "${call.name}" (preview shown above): ${decision}` });
        if (decision === "reject") {
          push({ kind: "status", text: "Approval rejected — halting (nothing was changed)." });
          setState("halted");
          messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: "REJECTED by approver — not executed" });
          break;
        }
      }

      // 3) Execute — UNLESS this is a dry-run session (then the preview IS the
      //    result and nothing is mutated/healed).
      anyWrite = true;
      const result = dryRun
        ? preview
        : await runHandlerSafely(() => handler.run(call.input, ctx), call.name);
      if (!dryRun && result.healed) healed = true;

      const auditId = mk("aud");
      const runId = mk("act") as unknown as ActionRunId;
      const runState = !result.ok ? "failed" : "succeeded";
      const run: ActionRun = {
        id: runId,
        actionId: (handler.spec.actionId ?? (`ai:${call.name}` as unknown)) as ActionRun["actionId"],
        triggeredBy: { kind: "ai", refId: session.id },
        scope,
        targetRefs: [{ kind: "asset", id: asset.id, label: asset.displayName }],
        paramsUsed: redactDeep((call.input ?? {}) as Record<string, unknown>),
        state: runState,
        dryRun,
        startedAt: session.startedAt,
        finishedAt: clock.now(),
        resultSummary: redact(
          dryRun ? `[dry-run] ${result.summary}` : result.summary,
        ),
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
        outcome: runState,
        detail: redact(dryRun ? `[dry-run] ${result.summary}` : result.summary),
      });
      push({
        kind: dryRun ? "observation" : "verification",
        text: dryRun ? `[dry-run] ${result.summary}` : result.summary,
        toolResult: result,
      });
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: redact(result.output) });
    }
  }

  session.finishedAt = clock.now();
  session.result = {
    healed,
    summary: dryRun
      ? `Dry-run preview complete — no changes applied to ${asset.displayName}.`
      : session.state === "succeeded"
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
