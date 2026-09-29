import { useSyncExternalStore } from "react";
import { createStore, type Entity, type State } from "./store.ts";

export const store = createStore();

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(store.get()));
}

/** Subscribe to one entity (re-renders when the store revision changes). */
export function useEntity(id: string | null | undefined): Entity | undefined {
  useStore((s) => s.rev);
  return store.entity(id);
}

declare global { interface Window { __nexum?: any } }
if (typeof window !== "undefined") window.__nexum = { ...(window.__nexum ?? {}), store };
