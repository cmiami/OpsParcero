/**
 * Single import point for the app's domain types — the engine reuses the app's
 * @/types verbatim (one source of truth) and never redefines them.
 */
export type {
  AssetId,
  AssetKind,
  ProductType,
  ProtectedAsset,
  AgentAsset,
  AgentlessAsset,
  EndpointAsset,
  SaasSeatAsset,
  SalesforceOrgAsset,
  ShareAsset,
  Issue,
  IssueRunbook,
  RunbookStep,
  AiInsight,
  FailureMode,
  RemediationAction,
  RemediationActionId,
  ActionScope,
  ActionRun,
  ActionRunId,
  AuditLogEntry,
  Alert,
  ISODateTime,
} from "@/types";
