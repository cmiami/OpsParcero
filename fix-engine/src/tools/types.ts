/**
 * Tool + execution-backend types. Tools are AI-callable; each wraps a
 * RemediationAction (or a read/diagnostic) and emits real ScriptArtifacts that a
 * simulated ExecutionBackend "runs". Canonical interfaces per the design contract.
 */
import type {
  AssetKind,
  ProductType,
  ProtectedAsset,
  Issue,
  RemediationActionId,
  ActionScope,
} from "../domain";

export type ToolRisk = "read" | "safe-write" | "destructive";

export type BackendKind =
  | "agent-windows"
  | "agent-linux"
  | "agentless-hypervisor"
  | "endpoint-agent"
  | "saas-api";

export type ScriptLang = "powershell" | "bash" | "python" | "http";

export interface ScriptArtifact {
  lang: ScriptLang;
  description: string;
  /** Real, readable source. For `http`, a structured request block as text. */
  source: string;
}

export interface StateDiff {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  note?: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  diff?: StateDiff;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool input (what the model fills in). */
  inputSchema: Record<string, unknown>;
  risk: ToolRisk;
  requiresApproval: boolean;
  reversible: boolean;
  appliesToKinds: AssetKind[];
  productTypes: ProductType[];
  /** Links to the existing catalog when it maps 1:1. */
  actionId?: RemediationActionId;
  backend?: BackendKind;
}

export type ToolProgress = { phase: string; message: string };

export interface ToolContext {
  asset: ProtectedAsset;
  issue?: Issue;
  dryRun: boolean;
  scope: ActionScope;
  emit: (ev: ToolProgress) => void;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  /** Console-style output (stdout) the UI renders. */
  output: string;
  diff?: StateDiff;
  opensTicket?: string;
  healed?: boolean;
  /** The exact artifact that was run (or previewed). */
  artifact?: ScriptArtifact;
}

export interface ToolHandler {
  spec: ToolSpec;
  run: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
  /** Dry-run: same diff, zero mutation. */
  preview: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ExecutionBackend {
  kind: BackendKind;
  exec: (
    script: ScriptArtifact,
    target: ProtectedAsset,
    opts: { dryRun: boolean },
  ) => Promise<ExecResult>;
  capabilities: (target: ProtectedAsset) => string[];
}
