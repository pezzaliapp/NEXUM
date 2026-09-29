// OBJECT MODE — the context around any element, in the same workspace. One call (/context/{id}), twelve sections;
// every reference is a pivot that becomes the new focus.

import { Fragment, useEffect, useLayoutEffect, useState } from "react";
import { call, plain } from "../lib/api";
import { recompute } from "../lib/confidence";
import { conf, duration, km, num, utc } from "../lib/format";
import { S } from "../lib/strings";
import { store, useEntity, useStore } from "../store";
import { Conf, ErrorNote, Ref, Section, useFetch, WhyButton } from "../components/common";

const KIND_TITLE: Record<string, string> = S.kinds;

export function ObjectMode({ id }: { id: string }) {
  const wv = useStore((s) => s.worldVersion);
  const scope = useStore((s) => s.scope);
  const ctx = useFetch(JSON.stringify(["ctx", id, wv]), async () => {
    const r = await call<any>(`/context/${id}`, undefined, { channel: "context" });
    const data = store.normalize(r.data);
    store.set({ context: { id, data } });
    return { ...r, data };
  });
  const e = useEntity(id);
  const d = e?.details;
  useLayoutEffect(() => { if (ctx.data) performance.mark(`nexum:context:${id}`); }, [ctx.data, id]);
  void scope;
  return (
    <>
      <div className="focushead" data-testid="focus-head" data-focus={id}>
        <div className="kindline row">
          <span>{KIND_TITLE[e?.kind ?? ""] ?? ""}</span><span>·</span>
          <span className="ellipsis">{store.get().types.get(e?.type ?? "")?.label ?? e?.type ?? ""}</span>
          <span className="grow" />
          <button type="button" className="tab-only" onClick={() => store.set({ inspectorOpen: false })}>{S.closePanel}</button>
        </div>
        <h1>{e?.label ?? id}</h1>
        <div className="row small">
          <Conf value={d?.confidence ?? e?.confidence} text={d?.confidence_text} />
          <span className="dim">{S.bandLabel[d?.confidence >= 0.8 ? 2 : d?.confidence >= 0.5 ? 1 : 0]}</span>
          <span className="grow" />
          {(e?.kind === "insight" || e?.kind === "relation") && <WhyButton id={id} />}
        </div>
        <div className="idline"><span className="ellipsis">{id}</span>
          <button type="button" className="xs" title={S.copy} onClick={() => navigator.clipboard?.writeText(id)}>⧉</button></div>
      </div>
      <div className="pbody" data-testid="object-mode" key={id}>
        {ctx.loading && !ctx.data && <p className="note" style={{ padding: 12 }}>{S.loading}</p>}
        <ErrorNote error={ctx.error} />
        {ctx.data && <Sections id={id} data={ctx.data.data} />}
      </div>
    </>
  );
}

function Sections({ id, data }: { id: string; data: any }) {
  const e = store.entity(id);
  const d = e?.details ?? {};
  const kind = e?.kind;
  return (
    <>
      <Section title={S.sections.identity} name="identity" open={false}>
        <dl className="kv">
          <dt>ID</dt><dd className="mono small">{id}</dd>
          {(d.identifiers ?? []).map((x: any) => (
            <Fragment key={`${x.scheme}-${x.value}`}><dt>{x.scheme}</dt><dd className="mono small">{x.value}{x.strong ? "" : " ·"}</dd></Fragment>
          ))}
          {d.aliases?.length > 0 && <><dt>alias</dt><dd className="small">{d.aliases.slice(0, 12).join(" · ")}</dd></>}
        </dl>
      </Section>
      <Section title={S.sections.type} name="type" open={false}>
        <dl className="kv">
          <dt>natura</dt><dd>{KIND_TITLE[kind ?? ""]}</dd>
          <dt>tipo</dt><dd className="mono small">{e?.type}</dd>
          {store.get().types.get(e?.type ?? "")?.family && <><dt>famiglia</dt><dd>{store.get().types.get(e!.type)!.family}</dd></>}
          {kind === "insight" && <><dt>{S.whyRule}</dt><dd className="mono small">{d.rule_id} v{d.rule_version}</dd>
            <dt>output</dt><dd>{d.insight_kind}</dd></>}
          {kind === "relation" && <><dt>natura rel.</dt><dd>{d.nature}</dd><dt>{S.derivation}</dt><dd>{d.derivation}</dd></>}
        </dl>
      </Section>
      <Properties id={id} d={d} kind={kind} />
      <Section title={S.sections.sources} count={data.sources?.length ?? 0} name="sources">
        <ul className="list">{(data.sources ?? []).map((s: any) => (
          <li key={s.source_id}><div>{s.name}</div><div className="xs dim">{s.attribution} · {s.license_id}</div></li>))}</ul>
      </Section>
      <Evidence data={data.evidence} />
      <Relations id={id} data={data.relations} kind={kind} />
      <Related id={id} title={S.sections.relatedObjects} name="related-objects" sec={data.related_objects} path="objects" />
      <Related id={id} title={S.sections.relatedEvents} name="related-events" sec={data.related_events} path="events" />
      <TimelineSec id={id} data={data.timeline} kind={kind} />
      <Geography data={data.geography} />
      <Section title={S.sections.insights} count={data.insights?.total ?? 0} name="insights">
        {!data.insights?.items?.length && <p className="note">{S.none}</p>}
        <ul className="list">{(data.insights?.items ?? []).map((it: any) => (
          <li key={it.ref.$ref}>
            <div className="row"><Conf value={it.confidence} text={it.confidence_text} />
              <span className="grow"><Ref id={it.ref.$ref} /></span><WhyButton id={it.ref.$ref} /></div>
            {it.explanation && <div className="xs dim" style={{ marginTop: 2 }}>{it.explanation}</div>}
          </li>))}</ul>
      </Section>
      <Provenance id={id} />
    </>
  );
}

function Properties({ id, d, kind }: { id: string; d: any; kind?: string }) {
  const props = Object.entries(d.properties ?? {}).filter(([, v]) => v !== null && v !== "");
  const conflicts = new Map<string, number>((d.conflicts ?? []).map((c: any) => [c.property, c.values]));
  return (
    <Section title={S.sections.properties} name="properties">
      <dl className="kv">
        {kind === "event" && <>
          <dt>tempo</dt><dd className="mono small">{utc(d.t_start_ms, "second")}{d.t_uncertainty_s ? ` ±${d.t_uncertainty_s} s` : ""}</dd>
          {d.t_end_ms && d.t_end_ms !== d.t_start_ms && <><dt>fine</dt><dd className="mono small">{utc(d.t_end_ms)}</dd></>}
          {d.severity != null && <><dt>severità</dt><dd className="mono small">{conf(d.severity)}</dd></>}
        </>}
        {kind === "insight" && <>
          <dt>spiegazione</dt><dd className="small">{d.explanation}</dd>
          {d.t_start_ms && <><dt>tempo</dt><dd className="mono small">{utc(d.t_start_ms)}</dd></>}
        </>}
        {kind === "relation" && <>
          <dt>da</dt><dd>{d.from && <Ref id={d.from.$ref} />}</dd>
          <dt>a</dt><dd>{d.to && <Ref id={d.to.$ref} />}</dd>
          <dt>evidenze</dt><dd className="small">{S.independentOf(d.independent_sources ?? 0, d.evidence_count ?? 0)}</dd>
        </>}
        {props.map(([k, v]) => (
          <Fragment key={k}><dt>{k}</dt><dd className="small">
            {typeof v === "number" ? num(Math.round(v * 1000) / 1000) : typeof v === "boolean" ? (v ? "sì" : "no") : String(v)}
            {conflicts.has(k) && <span className="warn"> · {S.conflicts(conflicts.get(k)!)}</span>}</dd></Fragment>
        ))}
      </dl>
      {kind === "insight" && d.members?.length > 0 && (
        <><div className="group-h">{S.sections.members}</div>
          <ul className="list">{d.members.slice(0, 40).map((m: any) => (
            <li key={`${m.role}-${m.ref?.$ref}`} className="row"><span className="mono xs dim" style={{ minWidth: 70 }}>{m.role}</span>
              <span className="grow">{m.ref && <Ref id={m.ref.$ref} />}</span>
              {m.distance_km != null && <span className="mono xs dim">{km(m.distance_km)}</span>}</li>))}</ul></>
      )}
      {kind === "event" && d.participants?.length > 0 && (
        <><div className="group-h">{S.sections.participants}</div>
          <ul className="list">{d.participants.map((p: any) => (
            <li key={`${p.role}-${p.object?.$ref}`} className="row"><span className="mono xs dim" style={{ minWidth: 70 }}>{p.role}</span>
              <span className="grow">{p.object && <Ref id={p.object.$ref} />}</span>
              {p.distance_m != null && <span className="mono xs dim">{km(p.distance_m / 1000)}</span>}</li>))}</ul></>
      )}
      <span className="sr">{id}</span>
    </Section>
  );
}

function Evidence({ data }: { data: any }) {
  const items = data?.items ?? [];
  return (
    <Section title={S.sections.evidence} count={`${data?.independent_sources ?? 0} / ${data?.total ?? 0}`} name="evidence" open={false}>
      <p className="note">{S.independentOf(data?.independent_sources ?? 0, data?.total ?? 0)}</p>
      <ul className="list">{items.map((ev: any) => <EvidenceItem key={ev.evidence_id} ev={ev} />)}</ul>
    </Section>
  );
}

export function EvidenceItem({ ev }: { ev: any }) {
  const [raw, setRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const s = ev.support ?? {};
  const f = ev.factors;
  return (
    <li data-evidence={ev.evidence_id}>
      <div className="row">
        <span className="mono xs dim">{ev.role}</span>
        <span className="grow ellipsis small">{s.$ref ? <Ref id={s.$ref} /> : <>{s.source_id} · <span className="mono">{s.native_id}</span></>}</span>
        <span className="mono xs dim" title="gruppo di indipendenza">{ev.independence_group}</span>
        {ev.weight != null && <span className="badge">{conf(ev.weight)}</span>}
      </div>
      {f?.method === "product" && <div className="xs faint mono">{Object.entries(f.factors).map(([k, v]) => `${k} ${conf(v as number)}`).join(" × ")}
        {" = "}{conf(recompute(f))}</div>}
      {s.kind === "record" && (
        <div className="xs dim">
          {s.locator} · raw {s.raw_id} · sha {String(s.raw_sha256).slice(0, 10)}… · {S.fetched} {utc(s.fetched_ms, "day")}
          {" "}<button type="button" className="xs" data-raw={s.raw_id} onClick={() => {
            if (raw) return setRaw(null);
            plain<any>(`/raw/${s.raw_id}`, {}, { path: s.locator }).then((r) => setRaw(r.data), (e) => setErr(e.message));
          }}>{raw ? S.rawHide : S.rawOpen}</button>
        </div>
      )}
      {err && <div className="err">{err}</div>}
      {raw && (<div data-testid="raw-record"><div className="xs dim">{S.rawRecord} · {raw.source_id} · {S.licence}: {raw.licence?.license_id} · {raw.licence?.attribution}</div>
        <pre className="raw">{typeof raw.record === "string" ? raw.record : JSON.stringify(raw.record, null, 1)}</pre></div>)}
    </li>
  );
}

function Relations({ id, data, kind }: { id: string; data: any; kind?: string }) {
  // extra pages per group, loaded with the Core's paginated expand (relations() lists at most 50 per group)
  const [extra, setExtra] = useState<Record<string, { items: any[]; cursor: string | null }>>({});
  useEffect(() => setExtra({}), [id]);
  if (kind === "relation") return (
    <Section title={S.sections.relations} name="relations" open={false}><p className="note">{S.notApplicable}</p></Section>);
  const groups = data?.groups ?? [];
  const more = async (g: any) => {
    const key = `${g.type}-${g.direction}`;
    const cur = extra[key];
    const r = await call<any>("/graph/expand", { node: id, edge_kind: "relation", type: g.type, dir: g.direction,
      cursor: cur?.cursor ?? undefined, b: { max_nodes: 100 } });
    const d = store.normalize(r.data);
    const seen = new Set([...g.items.map((i: any) => i.other.$ref), ...(cur?.items ?? []).map((i: any) => i.other.$ref)]);
    const add = d.items.filter((it: any) => !seen.has(it.node.$ref)).map((it: any) => ({
      relation: { $ref: it.edge.ref_id }, other: it.node, confidence: it.edge.confidence }));
    setExtra((x) => ({ ...x, [key]: { items: [...(cur?.items ?? []), ...add], cursor: r.cursor_next } }));
  };
  return (
    <Section title={S.sections.relations} count={num(data?.total ?? 0)} name="relations">
      {!groups.length && <p className="note">{S.none}</p>}
      {groups.map((g: any) => {
        const key = `${g.type}-${g.direction}`;
        const items = [...g.items, ...(extra[key]?.items ?? [])];
        return (
          <div key={key}>
            <div className="group-h">{g.type} · {g.nature} · {g.direction === "in" ? "←" : "→"} <span className="mono">{num(g.count)}</span></div>
            <ul className="list">{items.map((it: any) => (
              <li key={it.relation.$ref} className="row" data-relation={it.relation.$ref}>
                <span className="grow"><Ref id={it.other.$ref} /></span>
                {it.evidence_count != null && <span className="mono xs dim" title="fonti indipendenti / evidenze">{it.independent_sources}/{it.evidence_count}</span>}
                <Conf value={it.confidence} />
                <WhyButton id={it.relation.$ref} />
              </li>))}</ul>
            {g.count > items.length && extra[key]?.cursor !== null && <button type="button" className="primary small" data-testid="relations-more"
              onClick={() => more(g)}>{S.showMore} ({S.more(g.count - items.length)})</button>}
          </div>
        );
      })}
      <span className="sr">{id}</span>
    </Section>
  );
}

function Related({ id, title, name, sec, path }: { id: string; title: string; name: string; sec: any; path: string }) {
  const [extra, setExtra] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  useEffect(() => { setExtra([]); setCursor(undefined); }, [id]);
  const items = [...(sec?.items ?? []), ...extra];
  const total = sec?.total ?? 0;
  const more = async () => {
    const r = await call<any>(`/entities/${id}/${path}`, { b: { max_items: 50 }, cursor: cursor ?? undefined });
    const d = store.normalize(r.data);
    const seen = new Set(items.map((x) => x.$ref));
    setExtra((x) => [...x, ...d.items.filter((i: any) => !seen.has(i.$ref))]);
    setCursor(r.cursor_next);
  };
  return (
    <Section title={title} count={num(total)} name={name}>
      {sec?.counts_by_type && <div className="xs dim">{Object.entries(sec.counts_by_type).map(([t, n]) =>
        `${store.get().types.get(t)?.label ?? t} ${num(n as number)}`).join(" · ")}</div>}
      {!items.length && <p className="note">{S.none}</p>}
      <ul className="list">{items.map((it: any) => (
        <li key={it.$ref} className="row"><span className="grow"><Ref id={it.$ref} /></span>
          {it.reason && <span className="xs faint ellipsis" style={{ maxWidth: 120 }} title={it.reason}>{it.reason.split(":")[0]}</span>}</li>))}</ul>
      {total > items.length && cursor !== null && <button type="button" className="primary small" onClick={more}>{S.showMore} ({S.more(total - items.length)})</button>}
    </Section>
  );
}

function TimelineSec({ id, data, kind }: { id: string; data: any; kind?: string }) {
  const entries = data?.entries ?? [];
  const step = (dir: "next" | "prev") => call<any>(`/entities/${id}/timeline/step`, { dir }).then((r) => {
    const d = store.normalize(r.data);
    const target = d?.step?.$ref;
    if (target) store.select(target, "timeline");
  }).catch(() => {});
  return (
    <Section title={S.sections.timeline} count={num(data?.total ?? 0)} name="timeline" open={false}>
      {kind === "event" && <div className="row" style={{ marginBottom: 4 }}>
        <button type="button" className="primary small" onClick={() => step("prev")}>◂ {S.prev}</button>
        <button type="button" className="primary small" onClick={() => step("next")}>{S.next} ▸</button></div>}
      {!entries.length && <p className="note">{S.none}</p>}
      <ul className="list">{entries.map((t: any) => (
        <li key={`${t.ref?.$ref}-${t.t_ms}`} className="row"><span className="mono xs dim" style={{ minWidth: 86 }}>{utc(t.t_ms, "day")}</span>
          <span className="grow">{t.ref && <Ref id={t.ref.$ref} origin="timeline" />}</span></li>))}</ul>
    </Section>
  );
}

function Geography({ data }: { data: any }) {
  if (!data || data.not_applicable) return (
    <Section title={S.sections.geography} name="geography" open={false}><p className="note" data-testid="geo-na">{S.geographyNA}</p></Section>);
  return (
    <Section title={S.sections.geography} name="geography" open={false}>
      <dl className="kv"><dt>punto</dt><dd className="mono small">{data.point?.map((x: number) => x.toFixed(4)).join(", ")}</dd>
        <dt>geometria</dt><dd className="small">{data.geometry_type}</dd>
        {data.containing?.length > 0 && <><dt>{S.contains}</dt><dd>{data.containing.map((c: any) => <Ref key={c.$ref} id={c.$ref} />)}</dd></>}</dl>
      {data.nearby_100km && <><div className="group-h">{S.nearby(data.nearby_100km.total)}</div>
        <ul className="list">{data.nearby_100km.items.map((n: any) => (
          <li key={n.$ref} className="row"><span className="grow"><Ref id={n.$ref} /></span><span className="mono xs dim">{km(n.distance_km)}</span></li>))}</ul></>}
    </Section>
  );
}

function Provenance({ id }: { id: string }) {
  const [provOpen, setProvOpen] = useState(false);
  const p = useFetch(provOpen ? `prov-${id}` : null, () => call<any>(`/provenance/${id}`).then((r) => ({ ...r, data: store.normalize(r.data) })));
  return (
    <details className="sec" data-section="provenance" onToggle={(e) => setProvOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{S.sections.provenance}{p.data && <span className="count">{p.data.data.complete ? "completa" : "incompleta"}</span>}</summary>
      <div className="body tree">
        {p.loading && <p className="note">{S.loading}</p>}
        <ErrorNote error={p.error} />
        {p.data && <ul style={{ borderLeft: 0, paddingLeft: 0 }}><ProvNode node={p.data.data.chain} /></ul>}
      </div>
    </details>
  );
}

function ProvNode({ node, depth = 0 }: { node: any; depth?: number }) {
  if (!node) return null;
  return (
    <li>
      {node.ref?.$ref ? <Ref id={node.ref.$ref} /> : <span className="mono xs">{node.ref?.id}</span>}
      {node.cycle_or_depth_limit && <span className="xs faint"> (già mostrato)</span>}
      {node.evidence?.length > 0 && (
        <ul>{node.evidence.slice(0, 30).map((ev: any, i: number) => (
          <li key={i}><span className="mono xs dim">{ev.role} · {ev.method}</span>
            {ev.record && <div className="xs dim">{ev.record.source_id} · {ev.record.locator} · raw {ev.record.raw_id} ·
              {" "}{ev.licence?.license_id} · {ev.licence?.attribution}</div>}
            {ev.chain && depth < 5 && <ul><ProvNode node={ev.chain} depth={depth + 1} /></ul>}</li>))}
          {node.evidence.length > 30 && <li className="xs faint">{S.more(node.evidence.length - 30)}</li>}</ul>
      )}
    </li>
  );
}

export { duration };
