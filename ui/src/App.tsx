import { useEffect, useState } from "react";
import { call, lastWorldVersion } from "./lib/api";
import { setFamilies } from "./lib/palette";
import { S } from "./lib/strings";
import type { Kind, TypeInfo, WorldStatus } from "./lib/types";
import { store, useStore } from "./store";
import { CommandBar } from "./components/CommandBar";
import { TrailBar } from "./components/TrailBar";
import { Rail } from "./components/Rail";
import { StatusBar } from "./components/StatusBar";
import { Inspector } from "./views/Inspector";
import { MapView } from "./views/MapView";
import { GraphView } from "./views/GraphView";
import { Timeline } from "./views/Timeline";
import type { MobileTab } from "./store/store";

async function bootstrap() {
  const [st, ty] = await Promise.all([call<WorldStatus>("/status"), call<any>("/types")]);
  const types = new Map<string, TypeInfo>();
  const add = (list: any[], kind: Kind) => list.forEach((t) => types.set(t.id, {
    id: t.id, label: t.label, kind, family: t.display_hints?.family ?? "", count: t.count ?? 0,
    density_priority: t.display_hints?.density_priority ?? 9, geometry: t.geometry, nature: t.nature }));
  add(ty.data.object_types, "object");
  add(ty.data.event_types, "event");
  add(ty.data.relation_types, "relation");
  setFamilies([...types.values()]);
  const initial = st.data.has_geometry ? "map" : "graph";   // D8
  store.set({ status: st.data, types, stage: initial, mobileTab: initial === "map" ? "map" : "graph",
    worldVersion: st.world_version });
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
      else if (e.key === "Escape") store.set({ railOpen: false, panel: st.focus ? "object" : "world" });
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
const classOf = (): SizeClass => (innerWidth >= 1280 ? "desk" : innerWidth >= 768 ? "tab" : "phone");
export function useViewportClass(): SizeClass {
  const [c, setC] = useState<SizeClass>(classOf);
  useEffect(() => {
    const on = () => setC(classOf());
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return c;
}

const TABS: { id: MobileTab; label: string; glyph: string }[] = [
  { id: "map", label: S.views.map, glyph: "▦" }, { id: "graph", label: S.views.graph, glyph: "⋰" },
  { id: "time", label: S.views.time, glyph: "▁▃▅" }, { id: "search", label: S.views.search, glyph: "⌕" },
  { id: "focus", label: S.views.focus, glyph: "◉" },
];

export function App() {
  const [err, setErr] = useState<string | null>(null);
  const stage = useStore((s) => s.stage);
  const status = useStore((s) => s.status);
  const railOpen = useStore((s) => s.railOpen);
  const inspOpen = useStore((s) => s.inspectorOpen);
  const tab = useStore((s) => s.mobileTab);
  const size = useViewportClass();
  useEffect(() => { bootstrap().catch((e) => setErr(String(e?.message ?? e))); }, []);
  useHashFocus();
  useKeyboard();
  useWorldVersion();
  if (err) return <div className="overlay-center"><div><div className="wordmark">NEXUM</div><p className="err">{err}</p></div></div>;
  if (!status) return <div className="overlay-center"><div className="wordmark">NEXUM</div></div>;
  // desktop: stage as chosen; tablet: one view (no split); phone: the view of the active tab
  const eff = size === "desk" ? stage : size === "tab" ? (stage === "split" ? "map" : stage) : (tab === "graph" ? "graph" : "map");
  const showMap = eff === "map" || eff === "split";
  const showGraph = eff === "graph" || eff === "split";
  const cls = ["app", railOpen ? "rail-open" : "", inspOpen ? "insp-open" : "", `m-${tab}`].join(" ");
  return (
    <div className={cls} data-stage={stage}>
      <CommandBar />
      <TrailBar />
      <Rail />
      <main className="stage" aria-label="stage">
        {showMap && <div className="view" data-view="map"><MapView /></div>}
        {showGraph && <div className="view" data-view="graph"><GraphView /></div>}
      </main>
      <Inspector />
      <Timeline />
      <StatusBar />
      <nav className="tabs" aria-label="viste">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id}
            onClick={() => store.set({ mobileTab: t.id, ...(t.id === "map" || t.id === "graph" ? { stage: t.id } : {}) })}>
            <span aria-hidden>{t.glyph}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
