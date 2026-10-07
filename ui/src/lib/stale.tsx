// STALE CODE (2026-10-06, physical test): a lazy part of an old build that is gone from the host after a deploy. Never a
// crash, never a reload under the finger: the part shows that a new version is needed, with AGGIORNA ORA; optional
// map layers simply wait for it. (vite:preloadError is handled in lib/update.ts.)
import { lazy, useEffect, type ComponentType } from "react";
import { applyNow, updateState } from "./update";

function Stale() {
  useEffect(() => { updateState.needed(); }, []);
  return (
    <div className="xs stale-part" role="status" data-testid="stale-part">Serve la nuova versione di NEXUM per aprire questa parte.{" "}
      <button type="button" className="primary xs" onClick={() => applyNow()}>AGGIORNA ORA</button></div>);
}
/** React.lazy that resolves to the notice above when the module of the running build can no longer be loaded. */
export function lazyStale<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().then((m) => (m?.default ? m : { default: Stale as unknown as T })).catch(() => ({ default: Stale as unknown as T })));
}
