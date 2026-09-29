import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { ObjectMode } from "./ObjectMode";
import { WhyView } from "./WhyView";
import { WorldSummary } from "./WorldSummary";

export function Inspector() {
  const panel = useStore((s) => s.panel);
  const focus = useStore((s) => s.focus);
  const whyId = useStore((s) => s.whyId);
  return (
    <aside className="insp" aria-label="inspector" data-testid="inspector" data-panel={panel}>
      {panel === "why" && whyId ? <WhyView id={whyId} /> : focus ? <ObjectMode id={focus} /> : (
        <>
          <div className="phead"><h2>{S.worldSummary}</h2><span className="grow" />
            <button type="button" className="tab-only" onClick={() => store.set({ inspectorOpen: false })}>{S.closePanel}</button></div>
          <WorldSummary />
        </>
      )}
    </aside>
  );
}
