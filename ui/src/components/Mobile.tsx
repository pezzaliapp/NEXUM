// Touch layouts (< 1120 px): one top bar, the overlays (one at a time, over a scrim), the bottom navigation and the
// strip that stands for the focus card when it is not open. THE FOCUS CARD IS THE INTERFACE: Map, Graph and Time are
// the surfaces behind it. Same world, stable IDs, focus, trail and semantics as the desktop workspace.

import { useEffect, useRef } from "react";
import { SHAPE, colorOf } from "../lib/palette";
import { S } from "../lib/strings";
import { dismissTop, isSheet, openOverlay } from "../lib/layers";
import { store, useEntity, useStore } from "../store";
import type { MobileTab } from "../store/store";
import { Rail } from "./Rail";
import { SearchBox } from "./SearchBox";
import { TrailSheet } from "./TrailBar";
import { SnapshotAge } from "./WebNotes";
import { SNAPSHOT } from "../lib/api";
import { Freshness, PeriodSheet, ResetChip, useChanges } from "./Period";
import { Discovery, useHighlights } from "./Highlights";
export { FiltersChip } from "./Period";

/** ← · current focus · Percorso ▾ · ⋯ */
export function TopBar() {
  const trail = useStore((s) => s.trail);
  const focus = useStore((s) => s.focus);
  const overlay = useStore((s) => s.overlay);
  const e = useEntity(focus);
  const types = useStore((s) => s.types);
  return (
    <header className="cmd topbar" data-testid="topbar">
      <button type="button" className="tb-back" aria-label={S.m.back} title={S.m.back} data-testid="tb-back"
        disabled={trail.index <= 0} onClick={() => store.back()}>←</button>
      <button type="button" className="tb-home" aria-label={S.home} title={S.homeTitle} data-testid="tb-home"
        disabled={!focus} onClick={() => store.home()}>⌂</button>
      <div className="tb-title" data-testid="tb-title">
        {focus && e ? (
          <button type="button" className="tb-focus" onClick={() => store.set({ sheet: "peek", inspectorOpen: true, overlay: null })}>
            <span className="shape" style={{ color: colorOf(types.get(e.type)?.family, e.kind) }} aria-hidden>{SHAPE[e.kind]}</span>
            <span className="tb-name">{e.label}</span>
          </button>
        ) : <span className="wordmark">NEX<b>U</b>M</span>}
      </div>
      <button type="button" className="tb-path" aria-expanded={overlay === "trail"} data-testid="tb-path"
        onClick={() => openOverlay("trail")}>{S.m.path}{trail.steps.length ? ` ${trail.steps.length}` : ""} ▾</button>
      <button type="button" className="tb-more" aria-label={S.m.more} title={S.m.more} aria-expanded={overlay === "menu"}
        data-testid="tb-more" onClick={() => openOverlay("menu")}>⋯</button>
    </header>
  );
}

const TABS: { id: MobileTab | "search"; label: string; glyph: string }[] = [
  { id: "map", label: S.views.map, glyph: "▦" }, { id: "graph", label: S.views.graph, glyph: "⋰" },
  { id: "time", label: S.views.time, glyph: "▁▃▅" }, { id: "search", label: S.views.search, glyph: "⌕" },
];

/** Mappa · Grafo · Tempo · Cerca. The views change the surface; the focus card stays. */
export function BottomNav() {
  const mtab = useStore((s) => s.mobileTab);
  const stage = useStore((s) => s.stage);
  const tab = mtab === "time" ? "time" : stage === "graph" ? "graph" : "map";
  const overlay = useStore((s) => s.overlay);
  const focus = useStore((s) => s.focus);
  const go = (id: MobileTab | "search") => {
    if (id === "search") return openOverlay("search");
    const sheet = store.get().sheet;
    // Graph and Time tell the connections themselves: the card steps back to its name line (never hidden)
    const next = !focus ? sheet : id === "map" ? (sheet === "mini" ? "peek" : sheet) : "mini";
    store.set({ mobileTab: id, overlay: null, sheet: next === "full" ? "mini" : next,
      ...(id === "map" || id === "graph" ? { stage: id } : {}) });
  };
  return (
    <nav className="tabs" aria-label="viste" data-testid="bottom-nav">
      {TABS.map((t) => {
        const on = t.id === "search" ? overlay === "search" : !overlay && tab === t.id;
        return (
          <button key={t.id} type="button" aria-pressed={on} data-tab={t.id} onClick={() => go(t.id)}>
            <span aria-hidden>{t.glyph}</span>{t.label}
          </button>);
      })}
    </nav>
  );
}

/** Filtri · menu · Percorso · Cerca · info: one at a time, over a scrim that closes it. */
export function Overlays() {
  const overlay = useStore((s) => s.overlay);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (overlay === "search") (document.getElementById("nexum-search") as HTMLInputElement | null)?.focus();
    else panel.current?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
  }, [overlay]);
  if (!overlay) return null;
  return (
    <>
      <div className="scrim" data-testid="scrim" aria-hidden onPointerDown={(e) => { e.preventDefault(); dismissTop(); }} />
      <div ref={panel} className={`ov ov-${overlay}`} role="dialog" aria-modal="true" data-testid={`overlay-${overlay}`}
        aria-label={overlay === "filters" ? S.m.filters : overlay === "menu" ? S.m.more : overlay === "trail" ? S.m.path
          : overlay === "search" ? S.views.search : overlay === "period" ? S.period.label : S.m.info}>
        {overlay === "filters" && <><OvHead title={S.m.filters} /><Rail /></>}
        {overlay === "trail" && <><OvHead title={S.m.path} /><TrailSheet /></>}
        {overlay === "search" && <><OvHead title={S.views.search} /><SearchBox inline /></>}
        {overlay === "menu" && <Menu />}
        {overlay === "info" && <><OvHead title={S.m.info} /><Info /></>}
        {overlay === "period" && <><OvHead title={S.period.title} /><PeriodSheet /></>}
      </div>
    </>
  );
}

function OvHead({ title }: { title: string }) {
  return (
    <div className="ov-head"><strong>{title}</strong><span className="grow" />
      <button type="button" className="primary" onClick={() => dismissTop()} data-testid="overlay-close">{S.m.close}</button></div>);
}

function Menu() {
  const ch = useChanges();
  return (
    <ul className="menu" role="menu">
      <li><button type="button" role="menuitem" onClick={() => openOverlay("period")}>{S.period.label}</button></li>
      <li><button type="button" role="menuitem" onClick={() => openOverlay("filters")}>{ch.filters ? `${S.m.filters} · ${ch.filters}` : S.m.filters}</button></li>
      {(ch.period || ch.filters) ? <li><ResetChip /></li> : null}
      <li><button type="button" role="menuitem" onClick={() => openOverlay("trail")}>{S.m.path}</button></li>
      <li><button type="button" role="menuitem" onClick={() => openOverlay("info")}>{S.m.info}</button></li>
    </ul>);
}

function Info() {
  const status = useStore((s) => s.status);
  const attrs = [...new Set([...(status?.sources ?? []).map((s) => s.attribution), status?.basemap?.["nexum:attribution"],
    status?.has_geometry ? S.legend.lightsCredit : null].filter(Boolean))];   // + the map's reference night lights
  return (
    <div className="ov-body small">
      <p>{S.motto}</p>
      <p><Freshness /></p>
      {SNAPSHOT && <p className="dim"><SnapshotAge /></p>}
      <p className="dim">{S.status.data}: {attrs.join(" · ")}</p>
      <p className="dim">{S.web.trailLocal}</p>
    </div>);
}

/** Without a focus (or with the side card closed): what to do, and where NEXUM's own connections are. */
export function CardStrip() {
  const focus = useStore((s) => s.focus);
  const e = useEntity(focus);
  if (focus && e) {
    return (
      <div className="card-strip" data-testid="card-strip">
        <button type="button" className="strip-focus" onClick={() => store.set({ inspectorOpen: true, sheet: "peek" })}>
          <span className="tb-name">{e.label}</span> ▸</button>
      </div>);
  }
  return <HomeStrip />;
}


/** WORLD MODE on touch, map first: the most recent thing NEXUM found (one, compact; it opens) and the way to the whole
 * feed ("Cosa sta succedendo", the sheet or the side panel). The map stays the main surface. */
function HomeStrip() {
  const h = useHighlights();
  useStore((s) => s.rev);
  const conns: any[] = h.data?.data.connections ?? [];
  const types = useStore((s) => s.types);
  const hint = [...types.values()].find((t) => t.explore)?.explore;
  const sugg: [string, string][] = h.data?.data.explore ?? [];
  const short = innerHeight <= 500;     // a short screen (phone in landscape): the way in on the title line, no extra row
  return (
    <div className="card-strip home-strip" data-testid="card-strip">
      <div className="hs-head"><strong>{S.hl.found}</strong>
        <button type="button" className="primary hs-all" data-testid="strip-found"
          onClick={() => store.set({ inspectorOpen: true, panel: "world", sheet: isSheet() ? "full" : "peek" })}>{S.hl.feed} ▴</button>
        {hint && short && <button type="button" className="chip hs-ex hs-ex-head" data-testid="home-explore-head"
          onClick={() => store.set({ inspectorOpen: true, panel: "world", sheet: isSheet() ? "full" : "peek" })}>{hint.label} ▴</button>}</div>
      {conns.length > 0 && <ul className="hl-list" data-testid="home-discoveries">
        <Discovery id={conns[0].ref.$ref} compact /></ul>}
      {/* the world's explorable elements, one tap away (the panel's search, or a starting point with data) */}
      {hint && !short && <div className="hs-explore" data-testid="home-explore">
        <button type="button" className="chip hs-ex" data-testid="home-explore-open"
          onClick={() => store.set({ inspectorOpen: true, panel: "world", sheet: isSheet() ? "full" : "peek" })}>{hint.label} ▴</button>
        {sugg.slice(0, 3).map(([id, label]) => <button key={id} type="button" className="chip" data-ref={id} onClick={() => store.select(id, "explore")}>{label}</button>)}
      </div>}
    </div>);
}