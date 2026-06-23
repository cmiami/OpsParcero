/**
 * Fleet adapter — the engine's view of the app's seeded fleet (single source of
 * truth). Reads the cached DB + reference catalogs directly (no lucide/React).
 */
import { DB } from "@/mock/fixtures";
import { buildIssues } from "@/mock/issues";
import {
  FAILURE_MODE_BY_ID,
  ACTION_BY_ID,
  ACTION_CATALOG,
} from "@/mock/reference";
import type {
  AssetId,
  ProtectedAsset,
  Issue,
  FailureMode,
  RemediationAction,
} from "../domain";

let _issues: Issue[] | null = null;
function allIssues(): Issue[] {
  return (_issues ??= buildIssues(DB));
}

export function getAsset(id: AssetId): ProtectedAsset | undefined {
  return DB.assets.find((a) => a.id === id);
}

export function getIssue(id: string): Issue | undefined {
  return allIssues().find((i) => i.id === id);
}

export function getIssuesForAsset(id: AssetId): Issue[] {
  return allIssues().filter((i) => i.impactedAssetIds.includes(id));
}

export function primaryIssueForAsset(id: AssetId): Issue | undefined {
  return getIssuesForAsset(id)[0];
}

export function getFailureMode(id: string): FailureMode | undefined {
  return FAILURE_MODE_BY_ID[id];
}

export function getAction(id: string): RemediationAction | undefined {
  return ACTION_BY_ID[id];
}

export { DB, ACTION_CATALOG, FAILURE_MODE_BY_ID, ACTION_BY_ID };
