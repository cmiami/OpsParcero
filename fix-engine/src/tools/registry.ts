/**
 * Tool registry. M1 ships a minimal stub set (one read/diagnostic tool + one
 * remediation tool) to prove the loop's tool dispatch, dry-run, and approval
 * gating. M2 replaces this with the full catalog + simulated execution backends.
 */
import type { AssetKind, ProductType } from "../domain";
import type { ToolHandler, ToolResult, ToolContext } from "./types";
import { buildCatalog } from "./catalog";

const ALL_KINDS: AssetKind[] = [
  "agent",
  "agentless",
  "endpoint",
  "saas-seat",
  "salesforce-org",
  "share",
];
const ALL_PRODUCTS: ProductType[] = [
  "bcdr",
  "endpoint-v1",
  "endpoint-v2",
  "saas-protect",
  "spanning",
];

/** Read-only evidence gathering — the agent calls this first during triage. */
const getDiagnostics: ToolHandler = {
  spec: {
    name: "get_diagnostics",
    description:
      "Read current health signals for the asset (status, last-good backup, recent run outcomes). Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        checks: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of specific signals to read.",
        },
      },
    },
    risk: "read",
    requiresApproval: false,
    reversible: true,
    appliesToKinds: ALL_KINDS,
    productTypes: ALL_PRODUCTS,
  },
  async run(_input, ctx): Promise<ToolResult> {
    const a = ctx.asset;
    const recent = a.recentRuns.map((r) => r.state).join(", ");
    const lastGood = a.lastGoodBackupAt ?? "never";
    return {
      ok: true,
      summary: `Diagnostics for ${a.displayName}: status=${a.status}`,
      output: [
        `asset=${a.id} (${a.displayName})`,
        `status=${a.status}  protectionEnabled=${a.protectionEnabled}`,
        `lastGoodBackupAt=${lastGood}`,
        `recentRuns=[${recent}]`,
        `openAlerts=${a.openAlertIds.length}`,
      ].join("\n"),
      diff: {
        before: { status: a.status },
        after: { status: a.status },
        note: "read-only — no change",
      },
    };
  },
  async preview(input, ctx) {
    return this.run(input, ctx);
  },
};

/** Stub remediation — proves the write path, dry-run, and (in M2) real exec. */
const applyFix: ToolHandler = {
  spec: {
    name: "apply_fix",
    description:
      "Apply the primary remediation for the asset's failure and re-check. (M1 stub — M2 wires real script artifacts + simulated execution.)",
    inputSchema: {
      type: "object",
      properties: {
        rationale: { type: "string", description: "Why this fix resolves the failure." },
      },
      required: ["rationale"],
    },
    risk: "safe-write",
    requiresApproval: false,
    reversible: true,
    appliesToKinds: ALL_KINDS,
    productTypes: ALL_PRODUCTS,
  },
  async run(_input, ctx): Promise<ToolResult> {
    const a = ctx.asset;
    if (ctx.dryRun) return this.preview(_input, ctx);
    return {
      ok: true,
      healed: true,
      summary: `Applied remediation on ${a.displayName} — asset returning to protected.`,
      output: `Remediation dispatched to ${a.id}. Re-running protection check…\nResult: protected.`,
      diff: {
        before: { status: a.status },
        after: { status: "protected" },
        note: "simulated heal",
      },
    };
  },
  async preview(_input, ctx): Promise<ToolResult> {
    const a = ctx.asset;
    return {
      ok: true,
      healed: false,
      summary: `Dry-run: remediation would return ${a.displayName} to protected.`,
      output: `[dry-run] Would dispatch remediation to ${a.id}. No changes made.`,
      diff: {
        before: { status: a.status },
        after: { status: "protected" },
        note: "dry-run preview — no mutation",
      },
    };
  },
};

export const STUB_TOOLS: ToolHandler[] = [getDiagnostics, applyFix];

export class ToolRegistry {
  private map = new Map<string, ToolHandler>();
  constructor(handlers: ToolHandler[]) {
    for (const h of handlers) this.map.set(h.spec.name, h);
  }
  get(name: string): ToolHandler | undefined {
    return this.map.get(name);
  }
  list(): ToolHandler[] {
    return [...this.map.values()];
  }
  specs() {
    return this.list().map((h) => h.spec);
  }
}

/**
 * The default registry now serves the full M2 catalog (diagnostics + showcase
 * remediations, each wired to a real ScriptArtifact + simulated backend). The M1
 * STUB_TOOLS remain exported for the minimal smoke path / back-compat.
 */
export function defaultRegistry(): ToolRegistry {
  return new ToolRegistry(buildCatalog());
}

/** Registry built from only the M1 stub tools (kept for the minimal loop test). */
export function stubRegistry(): ToolRegistry {
  return new ToolRegistry(STUB_TOOLS);
}
