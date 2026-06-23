/** Fix-engine public API. */
export { runSession } from "./loop/session";
export type { RunDeps } from "./loop/session";
export { MockProvider } from "./providers/mock";
export { AnthropicProvider } from "./providers/anthropic";
export { OpenAIProvider } from "./providers/openai";
export { GoogleProvider } from "./providers/google";
export { LocalProvider } from "./providers/local";
export {
  ProviderRegistry,
  defaultProviderRegistry,
} from "./providers/registry";
export type { ModelRef, ProviderListing } from "./providers/registry";
export {
  ToolRegistry,
  defaultRegistry,
  stubRegistry,
  STUB_TOOLS,
} from "./tools/registry";
export {
  buildCatalog,
  pickToolsForAsset,
  REMEDIATION_TOOLS,
} from "./tools/catalog";
export type { ToolsForAsset } from "./tools/catalog";
export { DIAGNOSTIC_TOOLS } from "./tools/diagnostics";
export { SeededClock } from "./shared/clock";
export { DEFAULT_BUDGET, Budgeter } from "./loop/budget";
export * as fleet from "./shared/fleet";
export type {
  FixSession,
  FixState,
  FixMode,
  FixPlan,
  FixPlanStep,
  FixTranscriptTurn,
  FixSessionEvent,
  RunSessionRequest,
  ApprovalResolver,
} from "./types";
export type {
  ModelProvider,
  ProviderId,
  ModelInfo,
  ChatRequest,
  ChatEvent,
  ChatMessage,
} from "./providers/types";
export type {
  ToolSpec,
  ToolHandler,
  ToolResult,
  ToolContext,
  ToolRisk,
  ExecutionBackend,
  BackendKind,
  ScriptArtifact,
  ScriptLang,
  ExecResult,
  StateDiff,
} from "./tools/types";
