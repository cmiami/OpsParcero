/**
 * Mock provider — a deterministic ModelProvider that drives the full agent loop
 * with zero credentials and byte-identical output. It derives its phase from the
 * number of prior tool results in the conversation, so it needs no internal
 * state: triage(read…) → remediate(write) → verify(read) → done.
 *
 * Tool SELECTION is asset-correct: the loop derives the right tools for the
 * failure via pickToolsForAsset and embeds them as a <fix-plan> directive in the
 * system prompt. The provider PARSES that directive and walks one planned call
 * per turn (not "first read / first write"), so a SaaS-auth seat gets
 * get_oauth_grant → reauthorize_oauth and a VSS-failed agent gets
 * get_vss_writers + read_event_log → reset_vss_writers. If no directive is
 * present (back-compat / smoke), it falls back to the first read / first write.
 *
 * Modeled on the *hardest* normalization (single text + a tool call per turn,
 * ending `tool_use` or `end`) so the real M3 adapters can all collapse into it.
 */
import type {
  ModelProvider,
  ChatRequest,
  ChatEvent,
  ModelInfo,
} from "./types";

interface PlannedCall {
  phase: "triage" | "remediate" | "verify";
  toolName: string;
  input: Record<string, unknown>;
}

/** Parse the <fix-plan> directive embedded in the system prompt (if present). */
function parsePlan(system: string): PlannedCall[] {
  const open = system.indexOf("<fix-plan>");
  const close = system.indexOf("</fix-plan>");
  if (open === -1 || close === -1 || close < open) return [];
  const body = system.slice(open + "<fix-plan>".length, close);
  const calls: PlannedCall[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(triage|remediate|verify):\s+(\S+)\s*(\{.*\})?$/.exec(line);
    if (!m) continue;
    let input: Record<string, unknown> = {};
    if (m[3]) {
      try {
        input = JSON.parse(m[3]) as Record<string, unknown>;
      } catch {
        input = {};
      }
    }
    calls.push({ phase: m[1] as PlannedCall["phase"], toolName: m[2], input });
  }
  return calls;
}

/** Narrate the phase for a planned call (deterministic, plausible). */
function narration(call: PlannedCall, idx: number, total: number): string {
  switch (call.phase) {
    case "triage":
      return idx === 0
        ? `Triaging the failure. First I'll read the asset's current health signals with ${call.toolName} to confirm the root cause.`
        : `Corroborating with ${call.toolName} before choosing a remediation.`;
    case "remediate":
      return `Evidence confirms the classified failure. Plan: apply ${call.toolName} (dry-run first), then re-verify protection.`;
    case "verify":
    default:
      return `Remediation applied. Verifying the asset is healthy again with ${call.toolName}.`;
  }
}

const MODEL: ModelInfo = {
  id: "mock-fixer-1",
  provider: "mock",
  label: "Mock Fixer (deterministic)",
  contextWindow: 200_000,
  supportsTools: true,
  local: true,
};

export class MockProvider implements ModelProvider {
  id = "mock" as const;
  label = "Mock (deterministic)";

  available() {
    return true;
  }
  listModels(): ModelInfo[] {
    return [MODEL];
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatEvent> {
    const toolResults = req.messages.filter((m) => m.role === "tool").length;

    // Deterministic, plausible usage per turn (varies by phase, byte-stable).
    const usage = (i: number, o: number): ChatEvent => ({
      type: "usage",
      inputTokens: i,
      outputTokens: o,
    });

    const plan = parsePlan(req.system);

    if (plan.length > 0) {
      // Asset-correct path: walk one planned call per turn, in order.
      if (toolResults < plan.length) {
        const call = plan[toolResults];
        // Only emit tools the catalog actually advertised this turn.
        const advertised = req.tools.some((t) => t.name === call.toolName);
        if (advertised) {
          yield { type: "text", delta: narration(call, toolResults, plan.length) };
          yield usage(420 + toolResults * 60, 56 + toolResults * 8);
          yield {
            type: "tool_call",
            id: `tc-${call.phase}-${toolResults}`,
            name: call.toolName,
            input: call.input,
          };
          yield { type: "done", stopReason: "tool_use" };
          return;
        }
      }
      yield {
        type: "text",
        delta: "Verification passed — the asset is protected again. Resolution complete.",
      };
      yield usage(300, 40);
      yield { type: "done", stopReason: "end" };
      return;
    }

    // Fallback (no directive): the original first-read / first-write smoke path.
    const readTool = req.tools.find((t) => t.risk === "read");
    const writeTool = req.tools.find((t) => t.risk !== "read");

    if (toolResults === 0 && readTool) {
      yield {
        type: "text",
        delta:
          "Triaging the failure. First I'll read the asset's current health signals to confirm the root cause.",
      };
      yield usage(420, 64);
      yield { type: "tool_call", id: "tc-triage", name: readTool.name, input: { checks: ["status", "recentRuns"] } };
      yield { type: "done", stopReason: "tool_use" };
      return;
    }

    if (toolResults === 1 && writeTool) {
      yield {
        type: "text",
        delta:
          "Evidence confirms the classified failure. Plan: apply the primary remediation, then re-verify protection.",
      };
      yield usage(540, 88);
      yield {
        type: "tool_call",
        id: "tc-fix",
        name: writeTool.name,
        input: { rationale: "Primary remediation for the classified failure mode." },
      };
      yield { type: "done", stopReason: "tool_use" };
      return;
    }

    if (toolResults === 2 && readTool) {
      yield {
        type: "text",
        delta: "Remediation applied. Verifying the asset is healthy again.",
      };
      yield usage(610, 52);
      yield { type: "tool_call", id: "tc-verify", name: readTool.name, input: { checks: ["status"] } };
      yield { type: "done", stopReason: "tool_use" };
      return;
    }

    yield {
      type: "text",
      delta:
        "Verification passed — the asset is protected again. Resolution complete.",
    };
    yield usage(300, 40);
    yield { type: "done", stopReason: "end" };
  }
}
