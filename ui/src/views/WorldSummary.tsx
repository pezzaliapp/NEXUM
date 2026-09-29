import { Fragment } from "react";
import { call } from "../lib/api";
import { num, utc } from "../lib/format";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { Conf, ErrorNote, Ref, Section, useFetch, WhyButton } from "../components/common";

/** Inspector without a focus: the world as seen through the current scope (and map viewport, if any). */
export function WorldSummary() {
  const scope = useStore((s) => s.scope);
  const viewport = useStore((s) => s.viewport);
  const stage = useStore((s) => s.stage);
  const status = useStore((s) => s.status);
  const wv = useStore((s) => s.worldVersion);
  const info = useStore((s) => s.mapInfo);
  const spatial = status?.has_geometry && stage !== "graph" && viewport ? { viewport } : {};
  const empty = Array.isArray(scope.types) && scope.types.length === 0;
  const f = useFetch(empty ? null : JSON.stringify(["wsf", scope, wv]),
    () => call<any>("/facets", { s: scope }, { channel: "summary-facets" }));
  const ins = useFetch(empty ? null : JSON.stringify(["wsi", scope, spatial, wv]),
    () => call<any>("/insights", { s: { ...scope, ...spatial }, b: { max_items: 50 } }, { channel: "summary-insights" })
      .then((r) => ({ ...r, data: store.normalize(r.data) })));
  const kinds = f.data?.data.facets.kind ?? {};
  const geo = f.data?.data.facets.geometry;
  return (
    <div className="pbody" data-testid="world-summary">
      <Section title={S.counts} name="summary">
        <dl className="kv">
          {["object", "event", "insight"].map((k) => (
            <Fragment key={k}><dt>{S.kindsPlural[k]}</dt><dd className="mono">{num(kinds[k] ?? 0)}</dd></Fragment>
          ))}
          <dt>{S.railTime}</dt>
          <dd className="mono small">{scope.time_window ? `${utc(scope.time_window[0], "day")} → ${utc(scope.time_window[1], "day")}` : S.railTimeAll}</dd>
        </dl>
        {geo && geo.without_geometry > 0 && <p className="note" data-testid="no-geo-note">{S.noGeometryNotice(geo.without_geometry)}</p>}
        {info && info.noGeometry > 0 && !geo && <p className="note">{S.noGeometryNotice(info.noGeometry)}</p>}
        <ErrorNote error={f.error} />
      </Section>
      <Section title={S.relevantInsights} count={ins.data ? num(ins.data.total ?? 0) : undefined} name="insights">
        <ErrorNote error={ins.error} />
        <ul className="list">
          {(ins.data?.data.items ?? []).map((it: any) => (
            <li key={it.ref.$ref} className="row">
              <Conf value={it.confidence} text={it.confidence_text} />
              <span className="grow"><Ref id={it.ref.$ref} origin="summary" /></span>
              <WhyButton id={it.ref.$ref} />
            </li>
          ))}
        </ul>
        {ins.data && (ins.data.total ?? 0) > (ins.data.returned ?? 0) &&
          <p className="note">{S.more((ins.data.total ?? 0) - (ins.data.returned ?? 0))} {S.moreInsights}</p>}
      </Section>
      <Section title={S.sources} count={status?.sources.length} name="sources">
        <ul className="list">
          {status?.sources.map((s) => (
            <li key={s.source_id}>
              <div className="row"><span style={{ color: s.health === "ok" ? "#86A07A" : "var(--accent)" }}>●</span>
                <span className="grow ellipsis">{s.name}</span><span className="xs dim">{S.health[s.health] ?? s.health}</span></div>
              <div className="xs dim">{s.attribution} · {s.license_id}{s.last_success_ms ? ` · ${S.lastUpdate} ${utc(s.last_success_ms, "day")}` : ""}</div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
