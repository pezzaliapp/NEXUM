import { useMemo } from "react";
import { call } from "../lib/api";
import { num, utc } from "../lib/format";
import { colorOf, SHAPE } from "../lib/palette";
import { S } from "../lib/strings";
import type { Kind } from "../lib/types";
import { store, useStore } from "../store";
import { useFetch } from "./common";

const pretty = (k: string) => k.replace(/[._]/g, " ");

export function Rail() {
  const types = useStore((s) => s.types);
  const status = useStore((s) => s.status);
  const scope = useStore((s) => s.scope);
  const wv = useStore((s) => s.worldVersion);
  const { types: _t, ...rest } = scope;
  const key = JSON.stringify(["facets", rest, wv]);
  const facets = useFetch(key, () => call<any>("/facets", { s: rest }, { channel: "facets" }));
  const counts: Record<string, number> = facets.data?.data.facets.type ?? status?.by_type ?? {};

  const groups = useMemo(() => {
    const g = new Map<string, { id: string; label: string; kind: Kind; family: string }[]>();
    for (const t of types.values()) {
      if (t.kind === "relation") continue;
      const k = t.family || "altro";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push({ id: t.id, label: t.label, kind: t.kind, family: t.family });
    }
    const ins = Object.keys(status?.by_type ?? {}).filter((k) => !types.has(k)).sort();
    if (ins.length) g.set("insight", ins.map((id) => ({ id, label: pretty(id), kind: "insight" as Kind, family: "" })));
    return [...g.entries()].sort((a, b) => (a[0] === "insight" ? 1 : b[0] === "insight" ? -1 : a[0].localeCompare(b[0])));
  }, [types, status]);
  const all = groups.flatMap(([, l]) => l.map((t) => t.id));
  const visible = new Set(scope.types ?? all);
  const toggle = (id: string) => {
    const next = new Set(visible);
    next.has(id) ? next.delete(id) : next.add(id);
    store.setScope({ types: next.size === all.length ? null : [...next] });
  };
  const band = scope.min_confidence ?? 0;
  const srcSel = new Set(scope.sources ?? status?.sources.map((s) => s.source_id) ?? []);
  return (
    <aside className="rail" aria-label={S.railTitle} data-testid="rail">
      <h3>{S.railTypes}
        <button type="button" onClick={() => store.setScope({ types: null })}>{S.railAll}</button>
        <button type="button" onClick={() => store.setScope({ types: [] })}>{S.railNone}</button></h3>
      {groups.map(([fam, list]) => (
        <div className="fam" key={fam}>
          <div className="fam-h">{pretty(fam)}</div>
          {list.map((t) => (
            <label key={t.id} className={`typerow${visible.has(t.id) ? "" : " off"}`} data-type={t.id}>
              <input type="checkbox" checked={visible.has(t.id)} onChange={() => toggle(t.id)} />
              <span style={{ color: colorOf(t.family, t.kind) }} aria-hidden>{SHAPE[t.kind]}</span>
              <span className="ellipsis">{t.label}</span>
              <span className="n">{num(counts[t.id] ?? 0)}</span>
            </label>
          ))}
        </div>
      ))}
      <h3>{S.railConfidence}</h3>
      <div className="ctl">
        <div className="seg" role="group">
          {[0, 0.5, 0.8].map((v, i) => (
            <button key={v} type="button" aria-pressed={band === v} title={S.confBands[i]}
              onClick={() => store.setScope({ min_confidence: v || null as any })}>{i === 0 ? "≥ 0" : `≥ ${String(v).replace(".", ",")}`}</button>
          ))}
        </div>
      </div>
      <h3>{S.railTime}</h3>
      <div className="ctl">
        <span className="mono small">{scope.time_window ? `${utc(scope.time_window[0], "day")} → ${utc(scope.time_window[1], "day")}` : S.railTimeAll}</span>
        {scope.time_window && <button type="button" className="primary" onClick={() => store.setScope({ time_window: null })}>{S.railTimeClear}</button>}
      </div>
      <h3>{S.railSources}</h3>
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
    </aside>
  );
}
