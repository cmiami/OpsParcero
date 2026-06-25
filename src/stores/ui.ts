/**
 * ui store — shell-level UI preferences (docs/11 §3c, docs/06 §12).
 *
 * Pure client state. Sidebar collapse, table density default, and the last
 * client the user was scoped to. Theme is handled by next-themes / the
 * Storybook themes addon, so it is intentionally NOT owned here.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ClientId } from "@/types";

export type Density = "comfortable" | "compact";

export interface UiState {
  sidebarCollapsed: boolean;
  density: Density;
  lastClientId?: ClientId;

  toggleSidebar: () => void;
  setDensity: (density: Density) => void;
  setLastClientId: (id: ClientId | undefined) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      density: "comfortable",
      lastClientId: undefined,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setDensity: (density) => set({ density }),

      setLastClientId: (id) => set({ lastClientId: id }),
    }),
    {
      name: "dcc-ui",
      version: 1,
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        density: s.density,
        lastClientId: s.lastClientId,
      }),
      // Validate the rehydrated scalars (#12) — a corrupt density / non-boolean
      // collapse / non-string client falls back to the safe default.
      merge: (persisted, current) => {
        const p = persisted as {
          sidebarCollapsed?: unknown;
          density?: unknown;
          lastClientId?: unknown;
        };
        return {
          ...(current as UiState),
          sidebarCollapsed:
            typeof p?.sidebarCollapsed === "boolean"
              ? p.sidebarCollapsed
              : false,
          density:
            p?.density === "comfortable" || p?.density === "compact"
              ? (p.density as Density)
              : "comfortable",
          lastClientId:
            typeof p?.lastClientId === "string"
              ? (p.lastClientId as ClientId)
              : undefined,
        };
      },
    },
  ),
);
