/**
 * Provider abstraction — the model-flexible layer. Every adapter (Anthropic,
 * OpenAI-compatible, Google, Local, Mock) normalizes its native tool-calling +
 * streaming into the unified ChatEvent stream. Canonical interfaces per contract.
 */
import type { ToolSpec } from "../tools/types";

export type ProviderId = "anthropic" | "openai" | "google" | "local" | "mock";

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  label: string;
  contextWindow: number;
  supportsTools: boolean;
  costPer1kIn?: number;
  costPer1kOut?: number;
  local?: boolean;
}

export type ChatMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "assistant"; content: string; toolCalls: ChatToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface ChatToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  toolChoice?: "auto" | "required" | "none";
  temperature?: number;
  maxTokens?: number;
}

export type ChatStopReason = "end" | "tool_use" | "max_tokens" | "stop";

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; stopReason: ChatStopReason }
  | { type: "error"; message: string };

export interface ModelProvider {
  id: ProviderId;
  label: string;
  /** Whether the provider is usable (e.g. a real one needs its API key). */
  available: () => boolean;
  listModels: () => Promise<ModelInfo[]> | ModelInfo[];
  chat: (req: ChatRequest, signal?: AbortSignal) => AsyncIterable<ChatEvent>;
}
