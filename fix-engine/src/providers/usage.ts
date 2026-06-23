/**
 * Token estimation fallback (docs/fix-engine/02-provider-abstraction.md §5).
 *
 * When a provider does not return usage (some self-hosted vLLM/Ollama builds),
 * adapters estimate with a cheap, tokenizer-agnostic heuristic (≈ chars/4) so the
 * loop's FixBudget.maxTokens halt condition still has something to count. This is
 * a budget guardrail, NEVER billing — real providers that report usage always win.
 */
import type { ChatRequest } from "./types";

/** Rough char→token estimate (≈ 4 chars/token). Always ≥ 1 for non-empty text. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Render the full prompt (system + messages) to a flat string for estimation. */
export function renderPromptForEstimate(req: ChatRequest): string {
  const parts: string[] = [req.system];
  for (const m of req.messages) {
    if (m.role === "tool") {
      parts.push(`tool:${m.name}:${m.content}`);
    } else if ("toolCalls" in m && m.toolCalls.length > 0) {
      parts.push(m.content);
      for (const tc of m.toolCalls) parts.push(`${tc.name}:${JSON.stringify(tc.input ?? {})}`);
    } else {
      parts.push(m.content);
    }
  }
  // Tool schemas contribute to the input the model sees.
  for (const t of req.tools) parts.push(`${t.name}:${t.description}`);
  return parts.join("\n");
}
