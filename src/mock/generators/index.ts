/**
 * @/mock/generators — barrel for the generation DAG steps.
 *
 * `fixtures.ts` imports these in dependency order. Each generator is pure given
 * the seeded PRNG; none reads the wall clock. See docs/06 §9.7 for the DAG.
 */

export { ORG_ID, generateOrg, generateUsers, defaultApprover, techByIndex } from "./org-users";
export { generateClientsSites, type ClientsSitesResult } from "./clients-sites";
export { generateAssets } from "./assets";
export { generateRuns, type RunsResult } from "./runs";
export { generateOffsiteSyncs } from "./offsite-sync";
export { injectFailures, type InjectFailuresResult } from "./inject-failures";
export { generateIncidents } from "./incidents";
export {
  generatePlaybooks,
  generatePolicies,
  generateAutomationHistory,
  type AutomationHistory,
} from "./automation";
export { recomputeClientRollups, recomputeStoragePools } from "./rollups";
export { indexById, groupBy, type MockDB } from "./db";
