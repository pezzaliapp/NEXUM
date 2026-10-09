// FILTRI — categories a person understands, not the world's catalogue (2026-10-02):
//   EVENTI · LUOGHI E INFRASTRUTTURE (categories named by the vocabulary's display hints, only those with results in
//   the current period) · CONNESSIONI NEXUM (one switch) · PERIODO · FONTI · AVANZATE (the rules one by one, the
//   categories without results, the confidence). Filtering semantics are unchanged: they write Scope.types/sources.
import { useMemo } from "react";
import { call } from "../lib/api";
import { num } from "../lib/format";
import { colorOf, SHAPE } from "../lib/palette";
import { insightKind } from "../lib/connections";
import { S } from "../lib/strings";
import type { Kind } from "../lib/types";
import { store, useStore } from "../store";
import { mapScope } from "../store/store";
import { useFetch } from "./common";
import { isTouch } from "../lib/layers";
import { PeriodChip, ResetChip } from "./Period";

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
interface Cat { key: string; label: string; kind: Kind; family: string; ids: string[]; n: number }

export function Rail() {
  const types = useStore((s) => s.types);
  const status = useStore((s) => s.status);
  const scope = useStore((s) => s.scope);
  const wv = useStore((s) => s.worldVersion);
  const { types: _t, ...rest } = scope;
  const facets = useFetch(JSON.stringify(["facets", rest, wv]), () => call<any>("/facets", { s: rest }, { channel: "facets" }));
  const counts: Record<string, number> = facets.data?.data.facets.type ?? status?.by_type ?? {};

  // categories: types grouped by the vocabulary's "group" hint (their own label otherwise); rule outputs apart
  const { events, places, rules } = useMemo(() => {
    const cats = new Map<string, Cat>();
    for (const t of types.values()) {
      if (t.kind === "relation" || t.map === false) continue;   // information about other elements, not a layer
      const label = t.group ?? t.label;
      const key = `${t.kind}:${label}`;
      const c = cats.get(key) ?? { key, label, kind: t.kind, family: t.family, ids: [], n: 0 };
      c.ids.push(t.id);
      c.n += counts[t.id] ?? 0;
      cats.set(key, c);
    }
    const ruleIds = Object.keys(status?.by_type ?? {}).filter((k) => !types.has(k)).sort();
    const rules: Cat[] = ruleIds.map((id) => ({ key: id, label: cap(insightKind(id)), kind: "insight" as Kind, family: "", ids: [id],
      n: counts[id] ?? 0 }));
    const sorted = (k: Kind) => [...cats.values()].filter((c) => c.kind === k).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    return { events: sorted("event"), places: sorted("object"), rules };
  }, [types, status, JSON.stringify(counts)]);

  const all = [...events, ...places, ...rules].flatMap((c) => c.ids);
  // the categories are what the MAP draws (display only, 2026-10-03): the other views keep the person's scope
  const mapTypes = useStore((s) => s.mapTypes);
  const defaults = useStore((s) => s.defaults);
  const shownOnMap = mapScope({ scope, mapTypes }).types;
  const visible = new Set(shownOnMap ?? all);
  // a category turned OFF is a filter of every view (as always: its connections are then declared hidden); turned ON
  // it is shown again everywhere and drawn on the map. The quiet start (cities only), Tutto and Nessuno are what the
  // MAP draws — display, never a filter of the other views.
  const setIds = (ids: string[], on: boolean) => {
    if (on) {
      if (Array.isArray(scope.types)) {
        const t = new Set([...scope.types, ...ids]);
        store.setScope({ types: t.size >= all.length ? null : [...t] });
      }
      if (Array.isArray(mapTypes)) {
        const m = new Set([...mapTypes, ...ids]);
        store.setMapTypes(m.size >= all.length ? null : [...m]);
      }
    } else {
      const t = new Set(scope.types ?? all);
      for (const id of ids) t.delete(id);
      store.setScope({ types: [...t] });
    }
  };
  const isDefault = JSON.stringify(mapTypes) === JSON.stringify(defaults.mapTypes);
  const zonesOn = useStore((s) => s.mapZones);
  const ruleIds = rules.map((r) => r.ids[0]);
  const rulesOn = ruleIds.filter((id) => visible.has(id)).length;
  const band = scope.min_confidence ?? 0;
  const floor = useStore((s) => s.mapFloor);
  const touch = isTouch();
  const fmt = (v: number) => (v === 0 ? "≥ 0" : `≥ ${String(v).replace(".", ",")}`);
  const srcSel = new Set(scope.sources ?? status?.sources.map((s) => s.source_id) ?? []);
  const shown = (c: Cat) => c.n > 0 || !c.ids.every((id) => visible.has(id));   // a category turned off stays visible
  const empty = [...events, ...places].filter((c) => !shown(c));

  const row = (c: Cat) => {
    const on = c.ids.filter((id) => visible.has(id)).length;
    return (
      <label key={c.key} className={`typerow${on ? "" : " off"}`} data-type={c.ids[0]} data-group={c.label}>
        <input type="checkbox" checked={on === c.ids.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < c.ids.length; }}
          onChange={() => setIds(c.ids, on < c.ids.length)} />
        <span style={{ color: colorOf(c.family, c.kind, c.ids[0]) }} aria-hidden>{SHAPE[c.kind]}</span>
        <span className="ellipsis">{c.label}</span>
        <span className="n">{num(c.n)}</span>
      </label>);
  };

  return (
    <aside className="rail" aria-label={S.railTitle} data-testid="rail">
      <div className="ctl rail-top"><ResetChip /></div>
      <div className="ctl map-sel" data-testid="map-select">
        <span className="xs dim">{S.filters.onMap}</span>
        <div className="seg" role="group" aria-label={S.filters.onMap}>
          <button type="button" data-testid="map-all" aria-pressed={visible.size === all.length} onClick={() => { if (Array.isArray(scope.types)) store.setScope({ types: null }); store.setMapTypes(null); }}>{S.filters.all}</button>
          <button type="button" data-testid="map-none" aria-pressed={visible.size === 0} onClick={() => store.setMapTypes([])}>{S.filters.none}</button>
          <button type="button" data-testid="map-default" aria-pressed={isDefault} title={S.filters.defaultTitle} onClick={() => { if (Array.isArray(scope.types)) store.setScope({ types: null }); store.setMapTypes(defaults.mapTypes); }}>{S.filters.byDefault}</button>
        </div>
      </div>
      <label className={`typerow${zonesOn ? "" : " off"}`} data-testid="map-zones">
        <input type="checkbox" checked={zonesOn} onChange={() => store.set({ mapZones: !zonesOn })} />
        <span className="zone-dot red" aria-hidden />
        <span className="ellipsis">{S.filters.zones}</span>
      </label>
      <h3>{S.filters.events}</h3>
      <div className="fam" data-testid="filters-events">{events.filter(shown).map(row)}</div>
      <h3>{S.filters.places}</h3>
      <div className="fam" data-testid="filters-places">{places.filter(shown).map(row)}</div>
      <h3>{S.filters.connections}</h3>
      <div className="fam">
        <label className={`typerow${rulesOn ? "" : " off"}`} data-testid="filters-connections">
          <input type="checkbox" checked={rulesOn === ruleIds.length}
            ref={(el) => { if (el) el.indeterminate = rulesOn > 0 && rulesOn < ruleIds.length; }}
            onChange={() => setIds(ruleIds, rulesOn < ruleIds.length)} />
          <span style={{ color: colorOf(undefined, "insight") }} aria-hidden>{SHAPE.insight}</span>
          <span className="ellipsis">{S.filters.showConnections}</span>
          <span className="n">{num(rules.reduce((a, r) => a + r.n, 0))}</span>
        </label>
      </div>
      <h3>{S.period.label}</h3>
      <div className="ctl" data-testid="rail-period"><PeriodChip /></div>
      <details className="rail-more">
        <summary>{S.railSources}</summary>
        <div className="fam">
          {status?.sources.map((s) => (
            <label key={s.source_id} className={`typerow${srcSel.has(s.source_id) ? "" : " off"}`} title={s.attribution}>
              <input type="checkbox" checked={srcSel.has(s.source_id)} onChange={() => {
                const next = new Set(srcSel);
                next.has(s.source_id) ? next.delete(s.source_id) : next.add(s.source_id);
                store.setScope({ sources: next.size === status.sources.length ? null : [...next] });
              }} />
              <span className="ellipsis">{s.name}</span>
            </label>
          ))}
        </div>
      </details>
      <details className="rail-more" data-testid="filters-advanced">
        <summary>{S.filters.advanced}</summary>
        {touch ? (
          <>
            <h3>{S.m.mapFloor}</h3>
            <div className="ctl">
              <div className="seg" role="group" data-testid="map-floor">
                {[0, 0.5, 0.8].map((v, i) => (
                  <button key={v} type="button" aria-pressed={floor === v} title={S.confBands[i]} data-floor={v}
                    onClick={() => store.set({ mapFloor: v })}>{fmt(v)}</button>
                ))}
              </div>
              <p className="xs dim" style={{ margin: 0 }}>{S.m.mapFloorNote}</p>
              {band > 0 && <div className="row small">{S.m.scopeConf(fmt(band).slice(2))}<span className="grow" />
                <button type="button" className="primary" onClick={() => store.setScope({ min_confidence: null as any })}>{S.m.remove}</button></div>}
            </div>
          </>
        ) : (
          <>
            <h3>{S.railConfidence}</h3>
            <div className="ctl">
              <div className="seg" role="group">
                {[0, 0.5, 0.8].map((v, i) => (
                  <button key={v} type="button" aria-pressed={band === v} title={S.confBands[i]}
                    onClick={() => store.setScope({ min_confidence: v || null as any })}>{fmt(v)}</button>
                ))}
              </div>
            </div>
          </>
        )}
        <h3>{S.filters.rules}</h3>
        <div className="fam" data-testid="filters-rules">{rules.filter((r) => r.n > 0 || !visible.has(r.ids[0])).map(row)}</div>
        {empty.length > 0 && <>
          <h3>{S.filters.empty}</h3>
          <div className="fam" data-testid="filters-empty">{empty.map(row)}</div></>}
      </details>
      <div className="ctl" style={{ paddingTop: 8 }}><ResetChip always /></div>
    </aside>
  );
}
