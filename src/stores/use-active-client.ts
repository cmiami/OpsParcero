/**
 * useActiveClientId — the tenant the user is currently scoped to (the sidebar
 * switcher writes it to {@link useUiStore}). Returns undefined until the persist
 * store has hydrated (so SSR/first paint render the unscoped "all tenants" view
 * and avoid a hydration mismatch), then the persisted client id.
 */
"use client";

import { useUiStore } from "./ui";
import { useHasHydrated } from "./use-has-hydrated";
import type { ClientId } from "@/types";

export function useActiveClientId(): ClientId | undefined {
  const hydrated = useHasHydrated(useUiStore);
  const id = useUiStore((s) => s.lastClientId);
  return hydrated ? id : undefined;
}
