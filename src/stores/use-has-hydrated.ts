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
  // ALWAYS start false on the very first render — both on the server (no window)
  // AND on the client. With synchronous localStorage, zustand has already
  // hydrated by the time the client renders, so reading hasHydrated() in the
  // initializer would return true on the client but false on the server →
  // hydration mismatch. Starting false on both sides keeps the first paint
  // identical; the effect below flips it true after mount.
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    if (!store?.persist) return;
    // Already finished before the effect ran (sync storage / fast rehydrate).
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
