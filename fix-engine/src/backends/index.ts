/**
 * Backend registry — resolves a BackendKind to its simulated ExecutionBackend.
 *
 * The five backends are pure deterministic simulators: each "runs" a real
 * ScriptArtifact against the seeded fleet and returns an ExecResult + StateDiff
 * without touching any host or the shared DB (the tool/loop owns healing). Tool
 * specs declare their `backend`; the loop resolves the Windows/Linux split at
 * exec time from the asset's os.family and calls backendFor(kind).
 */
import type { BackendKind, ExecutionBackend } from "../tools/types";
import { agentWindows } from "./agent-windows";
import { agentLinux } from "./agent-linux";
import { agentlessHypervisor } from "./agentless-hypervisor";
import { endpointAgent } from "./endpoint-agent";
import { saasApi } from "./saas-api";

const REGISTRY: Record<BackendKind, ExecutionBackend> = {
  "agent-windows": agentWindows,
  "agent-linux": agentLinux,
  "agentless-hypervisor": agentlessHypervisor,
  "endpoint-agent": endpointAgent,
  "saas-api": saasApi,
};

/** Resolve a backend by kind. Throws on an unknown kind (programmer error). */
export function backendFor(kind: BackendKind): ExecutionBackend {
  const b = REGISTRY[kind];
  if (!b) throw new Error(`No execution backend registered for kind '${kind}'`);
  return b;
}

/** All five backends — handy for capability tables and tests. */
export function allBackends(): ExecutionBackend[] {
  return Object.values(REGISTRY);
}

export {
  agentWindows,
  agentLinux,
  agentlessHypervisor,
  endpointAgent,
  saasApi,
};
