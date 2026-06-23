/**
 * useHasHydrated — gate persistence-sensitive UI behind rehydration so the
 * server-rendered markup (empty cart / default density) matches the first client
 * paint, then flips to the persisted value (docs/11 §3c, docs/06 §12).
 *
 * Without this, the persisted cart-count badge causes a hydration mismatch:
 * the server renders 0 but localStorage already has steps. Render the
 * persisted-dependent bit only when this returns `true`.
 *
 * Pass any persisted store (its `.persist` API); defaults to the action cart.
 */
"use client";

import { useEffect, useState } from "react";
import { useActionCart } from "./action-cart";

/** Minimal shape of a Zustand store augmented with the persist middleware. */
interface PersistApi {
  persist: {
    hasHydrated: () => boolean;
    onHydrate: (fn: () => void) => () => void;
    onFinishHydration: (fn: () => void) => () => void;
  };
}

export function useHasHydrated(store: PersistApi = useActionCart): boolean {
  // SSR / prerender safe: the persist API may not be attached during a static
  // render — treat that as "not hydrated yet" (matches the empty-state paint).
  const [hydrated, setHydrated] = useState<boolean>(
    () => store?.persist?.hasHydrated?.() ?? false,
  );

  useEffect(() => {
    if (!store?.persist) return;
    // Already finished before the effect ran (fast rehydrate / re-mount).
    if (store.persist.hasHydrated()) {
      setHydrated(true);
    }
    const unsubFinish = store.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    return () => {
      unsubFinish();
    };
  }, [store]);

  return hydrated;
}
