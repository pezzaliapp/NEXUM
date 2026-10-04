import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { useViewportClass } from "../App";
import { SearchBox } from "./SearchBox";
import { Freshness, PeriodChip, ResetChip } from "./Period";

export function CommandBar() {
  const stage = useStore((s) => s.stage);
  const status = useStore((s) => s.status);
  const size = useViewportClass();
  const stages: ("map" | "graph" | "split")[] = size === "desk" ? ["map", "graph", "split"] : ["map", "graph"];
  return (
    <header className="cmd">
      <span className="wordmark" title={S.motto}>NEX<b>U</b>M</span>
      {size !== "desk" && (
        <button type="button" className="primary" onClick={() => store.set({ railOpen: !store.get().railOpen })}
          aria-label={S.openRail}>☰<span className="desk"> {S.openRail}</span></button>
      )}
      <button type="button" className="primary home-btn" data-testid="home" title={S.homeTitle} onClick={() => store.home()}>⌂ {S.home}</button>
      <SearchBox />
      <PeriodChip />
      <ResetChip />
      {size !== "phone" && (
        <div className="seg desk" role="group" aria-label="stage">
          {stages.map((v) => (
            <button key={v} type="button" aria-pressed={stage === v} data-stage-btn={v}
              onClick={() => store.set({ stage: v, mobileTab: v === "split" ? "map" : v })}>{S.views[v]}</button>
          ))}
        </div>
      )}
      <Freshness className="desk xs dim" />
      <span className="chip desk mono" title={S.status.version}>{status?.world_id}</span>
    </header>
  );
}
