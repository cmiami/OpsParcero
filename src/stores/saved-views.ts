/**
 * saved-views store — named filter/sort snapshots per route (docs/11 §3b–§3c).
 *
 * Pure client state. A saved view is a named snapshot of URL (nuqs) params;
 * applying one pushes the params back onto the URL (handled by consumers).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { keepValid, savedViewSchema } from "@/lib/schemas";
import type { SavedView, SavedViewId } from "@/types";

export interface SavedViewsState {
  views: SavedView[];
  addView: (view: SavedView) => void;
  removeView: (id: SavedViewId) => void;
}

export const useSavedViews = create<SavedViewsState>()(
  persist(
    (set) => ({
      views: [],

      addView: (view) => set((s) => ({ views: [...s.views, view] })),

      removeView: (id) =>
        set((s) => ({ views: s.views.filter((v) => v.id !== id) })),
    }),
    {
      name: "dcc-saved-views",
      version: 1,
      partialize: (s) => ({ views: s.views }),
      // Drop malformed saved views on rehydrate (#12).
      merge: (persisted, current) => ({
        ...(current as SavedViewsState),
        views: keepValid<SavedView>(
          (persisted as { views?: unknown })?.views,
          savedViewSchema,
        ),
      }),
    },
  ),
);
