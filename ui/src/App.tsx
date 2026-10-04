import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { call, lastWorldVersion } from "./lib/api";
import { setFamilies } from "./lib/palette";
import { setRuleNames } from "./lib/connections";
import type { Kind, TypeInfo, WorldStatus } from "./lib/types";
import { store, useStore } from "./store";
import { DEFAULT_MAP_TYPES } from "./store/store";
import { CommandBar } from "./components/CommandBar";
import { TrailBar } from "./components/TrailBar";
import { Rail } from "./components/Rail";
import { StatusBar } from "./components/StatusBar";
import { NewSnapshotBanner } from "./components/WebNotes";
import { Inspector } from "./views/Inspector";
import { MapView } from "./views/MapView";
// the graph (Sigma) is downloaded when the graph is first shown: the opening map never pays for it (O6)
const GraphView = lazy(() => import("./views/GraphView").then((m) => ({ default: m.GraphView })));
import { Timeline } from "./views/Timeline";
import { BottomNav, CardStrip, Overlays, TopBar } from "./components/Mobile";
import { TimeView } from "./views/TimeView";
import { dismissTop, installBackHandling, isSheet, layoutOf, DESK_W } from "./lib/layers";
import { DEFAULT_PERIOD, monthIndex, windowOf } from "./lib/period";

async function bootstrap() {
  const [st, ty] = await Promise.all([call<WorldStatus>("/status"), call<any>("/types")]);
  const types = new Map<string, TypeInfo>();
  const add = (list: any[], kind: Kind) => list.forEach((t) => types.set(t.id, {
    id: t.id, label: t.label, kind, family: t.display_hints?.family ?? "", count: t.count ?? 0,
    density_priority: t.display_hints?.density_priority ?? 9, geometry: t.geometry, nature: t.nature,
    group: t.display_hints?.group, headline: t.display_hints?.headline, facts: t.display_hints?.facts,
    media: t.display_hints?.media, map: t.display_hints?.map, series: t.display_hints?.series, wave: t.display_hints?.wave, indicator: t.display_hints?.indicator, digest: t.display_hints?.digest, subtypes: t.display_hints?.subtypes, nearby_media_km: t.display_hints?.nearby_media_km,
    tenure: t.display_hints?.tenure, rates: t.display_hints?.rates, rated: t.display_hints?.rated,
    explore: t.display_hints?.explore }));
  add(ty.data.object_types, "object");
  add(ty.data.event_types, "event");
  add(ty.data.relation_types, "relation");
  setFamilies([...types.values()]);
  setRuleNames(ty.data.insight_types ?? []);
  const initial = st.data.has_geometry ? "map" : "graph";   // D8
  // starting state (2026-09-30/10-01): touch maps draw elements and events ≥ 0.8 (insights excluded); every layout
  // observes the last 12 months of the published world's data (its most recent data is the reference, not the device)
  const floor = innerWidth < DESK_W ? 0.8 : 0;
  // the map opens with the cities only (2026-10-03, less noise at the start); a world without cities shows everything
  const mapTypes = DEFAULT_MAP_TYPES.every((t) => types.has(t)) ? DEFAULT_MAP_TYPES : null;
  const ext = st.data.time_extent;
  // "Dati aggiornati al …": the last time the world received data from its sources (not the device, not the snapshot)
  const fetched = Math.max(0, (st.data as any).data_received_ms ?? 0, ...st.data.sources.map((s) => s.last_success_ms ?? 0));
  const clock = ext ? { anchor: monthIndex(ext[1]), first: monthIndex(ext[0]), latestMs: fetched || ext[1] } : null;
  const w = clock ? windowOf(DEFAULT_PERIOD, clock.anchor, clock.first) : null;
  store.set({ status: st.data, types, stage: initial, mobileTab: initial === "map" ? "map" : "graph",
    worldVersion: st.world_version, mapFloor: floor, defaults: { mapFloor: floor, mapTypes }, mapTypes, clock, period: DEFAULT_PERIOD,
    scope: w ? { ...store.get().scope, time_window: w } : store.get().scope });
  if (!st.data.has_geometry && !store.get().focus) {
    // D8: a world without geometry opens on GRAPH around the strongest insight's members
    const ins = await call<any>("/insights", { b: { max_items: 1 } });
    const first = ins.data.items?.[0]?.ref;
    if (first) { store.normalize(ins.data); store.select(first.id, "init"); }
  }
}

function useHashFocus() {
  const focus = useStore((s) => s.focus);
  useEffect(() => {
    const m = location.hash.match(/#\/f\/((?:obj|evt|rel|ins)_[a-z0-9]+)/);
    if (m && !store.get().focus) store.select(m[1], "url");
  }, []);
  useEffect(() => { history.replaceState(null, "", focus ? `#/f/${focus}` : location.pathname); }, [focus]);
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const st = store.get();
      if (e.key === "/") { e.preventDefault(); (document.getElementById("nexum-search") as HTMLInputElement)?.focus(); }
      else if (e.key === "[") store.back();
      else if (e.key === "]") store.forward();
      else if ((e.key === "w" || e.key === "W") && st.focus && /^(ins|rel)_/.test(st.focus)) store.why(st.focus);
      else if (e.key === "m" || e.key === "M") store.set({ stage: "map", mobileTab: "map" });
      else if (e.key === "g" || e.key === "G") store.set({ stage: "graph", mobileTab: "graph" });
      else if (e.key === "Escape") { if (!dismissTop()) store.set({ railOpen: false, panel: st.focus ? "object" : "world" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function useWorldVersion() {
  useEffect(() => {
    const on = (v: number) => store.setWorldVersion(v);
    lastWorldVersion.listeners.add(on);
    const t = setInterval(() => { call("/status", undefined, { noCache: true }).catch(() => {}); }, 30000);
    return () => { lastWorldVersion.listeners.delete(on); clearInterval(t); };
  }, []);
}

export type SizeClass = "desk" | "tab" | "phone";
const classOf = (): SizeClass => (innerWidth >= DESK_W ? "desk" : innerWidth >= 768 ? "tab" : "phone");
export function useViewportClass(): SizeClass {
  const [c, setC] = useState<SizeClass>(classOf);
  useEffect(() => {
    const on = () => setC(classOf());
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return c;
}

export function App() {
  const [err, setErr] = useState<string | null>(null);
  const stage = useStore((s) => s.stage);
  const status = useStore((s) => s.status);
  const railOpen = useStore((s) => s.railOpen);
  const inspOpen = useStore((s) => s.inspectorOpen);
  const size = useViewportClass();
  useEffect(() => { bootstrap().catch((e) => setErr(String(e?.message ?? e))); }, []);
  useHashFocus();
  useKeyboard();
  useWorldVersion();
  if (err) return <div className="overlay-center"><div><div className="wordmark">NEXUM</div><p className="err">{err}</p></div></div>;
  if (!status) return <div className="overlay-center"><div className="wordmark">NEXUM</div></div>;
  if (size !== "desk") return <TouchApp />;
  // desktop: the Phase 2 workspace
  const eff = stage;
  const showMap = eff === "map" || eff === "split";
  const showGraph = eff === "graph" || eff === "split";
  const cls = ["app", railOpen ? "rail-open" : "", inspOpen ? "insp-open" : ""].join(" ");
  return (
    <div className={cls} data-stage={stage}>
      <CommandBar />
      <NewSnapshotBanner />
      <TrailBar />
      <Rail />
      <main className="stage" aria-label="stage">
        {showMap && <div className="view" data-view="map"><MapView /></div>}
        {showGraph && <div className="view" data-view="graph"><Suspense fallback={null}><GraphView /></Suspense></div>}
      </main>
      <Inspector />
      <Timeline />
      <StatusBar />
      <Overlays />
    </div>
  );
}

/** Touch layouts (< 1120 px): one top bar, one surface (Map, Graph or Time), the focus card, the bottom navigation. */
function TouchApp() {
  const tab = useStore((s) => s.mobileTab);
  const stage = useStore((s) => s.stage);
  const focus = useStore((s) => s.focus);
  const inspOpen = useStore((s) => s.inspectorOpen);
  const panel = useStore((s) => s.panel);
  const sheet = useStore((s) => s.sheet);
  useEffect(() => installBackHandling(), []);
  const [, relayout] = useState(0);
  useEffect(() => { const on = () => relayout((n) => n + 1); addEventListener("resize", on); return () => removeEventListener("resize", on); }, []);
  const asSheet = isSheet();
  const layout = layoutOf();
  // Fold open / tablet: at home the side panel holds "Cosa sta succedendo" (closed with Chiudi, it stays closed)
  const homeTick = useStore((s) => s.homeTick);
  useEffect(() => {
    if (layout === "tablet" && !store.get().focus) store.set({ inspectorOpen: true, panel: "world" });
  }, [layout, homeTick, focus]);
  // --card-h: the height of the card (or of its strip) over the surface, so that nothing important stays under it
  const appRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const app = appRef.current;
    const el = app?.querySelector<HTMLElement>(".insp, .card-strip");
    if (!app || !el) return;
    const put = () => app.style.setProperty("--card-h", `${asSheet ? el.offsetHeight : 0}px`);
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => ro.disconnect();
  });
  // one source of truth for Map/Graph (stage, as on desktop and with the M/G keys); Time is the third surface
  const surface = tab === "time" ? "time" : stage === "graph" ? "graph" : "map";
  // the card: always there as a sheet when there is a focus (or the world is opened); a side panel from 700 px
  const cardOpen = asSheet ? (!!focus || (panel === "world" && inspOpen && sheet === "full")) : inspOpen && (!!focus || panel === "world");
  const cls = ["app", "touch", `lay-${layout}`, asSheet ? "as-sheet" : "as-side", cardOpen ? "card-open" : "", `surf-${surface}`,
    `sheet-${asSheet && cardOpen ? sheet : "none"}`].join(" ");
  return (
    <div className={cls} data-stage={stage} ref={appRef}>
      <TopBar />
      <NewSnapshotBanner />
      <main className="stage" aria-label="stage">
        {surface === "map" && <div className="view" data-view="map"><MapView /></div>}
        {surface === "graph" && <div className="view" data-view="graph"><Suspense fallback={null}><GraphView /></Suspense></div>}
        {surface === "time" && <div className="view" data-view="time"><TimeView /></div>}
      </main>
      {cardOpen ? <Inspector /> : <CardStrip />}
      <BottomNav />
      <Overlays />
    </div>
  );
}
