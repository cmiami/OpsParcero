/**
 * Mock provider — a deterministic ModelProvider that drives the full agent loop
 * with zero credentials and byte-identical output. It derives its phase from the
 * number of prior tool results in the conversation, so it needs no internal
 * state: triage(read) → plan+remediate(write) → verify(read) → done.
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
    const readTool = req.tools.find((t) => t.risk === "read");
    const writeTool = req.tools.find((t) => t.risk !== "read");

    // Deterministic, plausible usage per turn.
    const usage = (i: number, o: number): ChatEvent => ({
      type: "usage",
      inputTokens: i,
      outputTokens: o,
    });

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
