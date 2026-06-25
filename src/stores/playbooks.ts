/**
 * playbooks store — user-created/edited playbooks (docs/11 §3c, docs/06 §12).
 *
 * Pure client state. Seeded playbooks live in the fixtures layer (`@/mock/*`);
 * THIS store holds only user-created/mutated playbooks so they survive reloads.
 * Consumers merge fixture + user playbooks in the organisms layer.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { keepValid, playbookSchema } from "@/lib/schemas";
import type { Playbook, PlaybookId } from "@/types";

export interface UserPlaybooksState {
  userPlaybooks: Playbook[];
  addPlaybook: (playbook: Playbook) => void;
  updatePlaybook: (id: PlaybookId, patch: Partial<Playbook>) => void;
  removePlaybook: (id: PlaybookId) => void;
}

export const useUserPlaybooks = create<UserPlaybooksState>()(
  persist(
    (set) => ({
      userPlaybooks: [],

      addPlaybook: (playbook) =>
        set((s) => ({ userPlaybooks: [...s.userPlaybooks, playbook] })),

      updatePlaybook: (id, patch) =>
        set((s) => ({
          userPlaybooks: s.userPlaybooks.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        })),

      removePlaybook: (id) =>
        set((s) => ({
          userPlaybooks: s.userPlaybooks.filter((p) => p.id !== id),
        })),
    }),
    {
      name: "dcc-playbooks",
      version: 1,
      partialize: (s) => ({ userPlaybooks: s.userPlaybooks }),
      // Drop malformed user playbooks on rehydrate (#12).
      merge: (persisted, current) => ({
        ...(current as UserPlaybooksState),
        userPlaybooks: keepValid<Playbook>(
          (persisted as { userPlaybooks?: unknown })?.userPlaybooks,
          playbookSchema,
        ),
      }),
    },
  ),
);
