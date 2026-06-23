/**
 * @/mock/reference — barrel for the static reference-data layer.
 *
 * Re-exports the typed failure catalog and remediation-action library plus their
 * byId lookups and the Issue-builder classifier. Downstream generators import
 * the catalogs from here; UI never imports the research JSON directly.
 */

export {
  FAILURE_MODES,
  FAILURE_MODE_BY_ID,
  fixTypeForMode,
  fixTypeForModeId,
  catalogToSeverity,
} from "./failure-modes";

export {
  ACTION_CATALOG,
  ACTION_BY_ID,
  ACTION_IDS,
} from "./action-catalog";
