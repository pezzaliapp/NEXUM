// WHY THIS RELATION? — only what the Core recorded (Query.explain, D1). Fields a rule or element does not own are
// shown as "non registrato" / "non applicabile" with the Core's reason, never filled in.

import { Fragment, useLayoutEffect, useState } from "react";
import { call, plain } from "../lib/api";
import { recompute } from "../lib/confidence";
import { conf, duration, km, num } from "../lib/format";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { Conf, ErrorNote, Ref, Support, useFetch, WhyButton } from "../components/common";
import { typeLabelOf, useSummaries } from "../components/Highlights";
import { sentence, summaryOf } from "../lib/summary";
import { EvidenceItem } from "./ObjectMode";

const isNA = (x: any) => x && typeof x === "object" && (x.status === "not_recorded" || x.status === "not_applicable");

function NA({ x }: { x: any }) {
  return <p className="na" data-na={x.status}>{x.status === "not_recorded" ? S.notRecorded : S.notApplicable} — {x.reason}</p>;
}

function Block({ title, children, name }: { title: string; children: React.ReactNode; name: string }) {
  return <section data-why-block={name} style={{ padding: "0 12px" }}><h3>{title}</h3>{children}</section>;
}

function constraintText(c: any): string {
  const parts = [c.op, c.a && c.b ? `${c.a}–${c.b}` : ""];
  for (const k of ["min", "max", "km", "roles", "penalty"]) if (c[k] !== undefined) parts.push(`${k} ${Array.isArray(c[k]) ? c[k].join("/") : c[k]}`);
  if (c.optional) parts.push("opzionale");
  return parts.filter(Boolean).join(" · ");
}

export function WhyView({ id }: { id: string }) {
  const wv = useStore((s) => s.worldVersion);
  const focus = useStore((s) => s.focus);
  const [ruleText, setRuleText] = useState<string | null>(null);
  const r = useFetch(JSON.stringify(["why", id, wv]), () => call<any>(`/explain/${id}`, undefined, { channel: "why" })
    .then((x) => ({ ...x, data: store.normalize(x.data) })));
  useLayoutEffect(() => { if (r.data) performance.mark(`nexum:why:${id}`); }, [r.data, id]);
  const d = r.data?.data;
  const e = store.entity(id);
  const det = e?.details;
  const factors = det?.confidence_factors;
  let recomputed: number | null = null;
  try { if (factors) recomputed = recompute(factors); } catch { recomputed = null; }
  const stored = det?.confidence ?? e?.confidence ?? null;
  const match = recomputed != null && stored != null && Math.abs(recomputed - stored) <= 1e-9;
  useSummaries(id.startsWith("ins_") ? [id] : []);
  const sent = id.startsWith("ins_") ? sentence(summaryOf(id), typeLabelOf) : null;
  return (
    <div className="why" data-testid="why" data-why={id} style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div className="phead">
        <button type="button" onClick={() => store.set({ panel: focus ? "object" : "world", whyId: null })}>← {S.whyBack}</button>
        <h2 className="grow" style={{ textAlign: "right", color: "var(--accent)" }}>{S.whyTitle}</h2>
      </div>
      <div className="pbody" key={id}>
        {r.loading && !d && <p className="note" style={{ padding: 12 }}>{S.loading}</p>}
        <div style={{ padding: "0 12px" }}><ErrorNote error={r.error} /></div>
        {d && (
          <>
            <div className="stmt">
              <div className="xs dim" style={{ textTransform: "uppercase", letterSpacing: ".06em" }}>
                {d.kind === "insight" ? S.whyFound : `${S.kinds.relation} · ${det?.nature ?? ""}`}
              </div>
              <div style={{ margin: "4px 0" }}><Ref id={id} origin="why" /></div>
              {sent && <p className="ins-sentence" data-testid="why-sentence">{sent}</p>}
              <blockquote data-testid="why-explanation">{d.explanation?.text}</blockquote>
              {d.explanation?.origin === "generated_from_refs" && <div className="xs faint">{S.explanationGenerated}</div>}
              <div className="row small"><Support value={stored} /></div>
              <div className="caution" data-testid="why-caution">⚠ {S.causal}</div>
            </div>

            {d.kind === "insight" && (
              <Block title={S.whyLinked} name="linked">
                <ul className="list" data-testid="why-linked">{(d.evidence?.members ?? []).filter((m: any) => m.ref).map((m: any) => (
                  <li key={`l-${m.role}-${m.ref.$ref}`} className="row"><span className="grow"><Ref id={m.ref.$ref} origin="why" /></span>
                    <span className="xs dim">{[m.distance_km != null ? `a ${km(m.distance_km)}` : null, m.delta_t_ms != null ? duration(m.delta_t_ms) : null].filter(Boolean).join(" · ")}</span></li>))}</ul>
              </Block>
            )}
            <Block title={S.whyIndependent} name="independent">
              <p className="small" data-testid="why-independent-count">{d.independent_sources?.count} gruppi indipendenti</p>
              <table><thead><tr><th style={{ width: 110 }}>gruppo</th><th>fonti</th><th className="n">migliore</th><th className="n">evid.</th></tr></thead>
                <tbody>{(d.independent_sources?.groups ?? []).map((g: any) => (
                  <Fragment key={g.independence_group}>
                    <tr><td className="mono xs">{g.independence_group}</td><td className="xs">{g.sources.join(", ")}</td>
                      <td className="n">{conf(g.best_value)}</td><td className="n">{g.evidence_count}</td></tr>
                    {g.not_independent.map((n: any) => (
                      <tr key={n.source_id} data-not-independent={n.source_id}><td /><td colSpan={3} className="xs faint">
                        <s>{n.source_id}</s> — {S.notIndependent}: {n.reason}</td></tr>))}
                  </Fragment>))}</tbody></table>
            </Block>

            <Block title={S.whyEvidence} name="evidence">
              {d.kind === "relation" ? (
                <ul className="list">{(d.evidence ?? []).map((ev: any) => <EvidenceItem key={ev.evidence_id} ev={ev} />)}</ul>
              ) : (
                <>
                  {(d.evidence?.members ?? []).filter((m: any) => m.ref && !m.role.includes("~group") && !m.role.includes("#"))
                    .map((m: any) => <MemberEvidence key={`${m.role}-${m.ref.$ref}`} role={m.role} id={m.ref.$ref} />)}
                  {(d.evidence?.relation_evidence ?? []).map((re: any) => (
                    <div key={re.relation.$ref}><div className="row"><Ref id={re.relation.$ref} origin="why" /><WhyButton id={re.relation.$ref} /></div>
                      <ul className="list">{re.items.map((ev: any) => <EvidenceItem key={ev.evidence_id} ev={ev} />)}</ul></div>))}
                </>
              )}
              <p className="xs dim">provenienza {d.provenance_complete ? "completa fino al dato grezzo e alla licenza" : "incompleta"}</p>
            </Block>

            <Block title={d.kind === "relation" ? S.whyUsedBy : S.whyComponents} name="components">
              {d.kind === "relation" ? (
                <ul className="list">{(d.used_by?.items ?? []).map((u: any) => u.ref?.$ref && (
                  <li key={u.ref.$ref} className="row"><span className="grow"><Ref id={u.ref.$ref} origin="why" /></span>{u.ref.$ref.startsWith("ins_") && <WhyButton id={u.ref.$ref} />}</li>))}
                  {!d.used_by?.items?.length && <li className="dim">{S.none}</li>}</ul>
              ) : isNA(d.components) ? <NA x={d.components} /> : (
                <ul className="list">{d.components.map((c: any) => (
                  <li key={c.ref.$ref}><div className="row"><Conf value={c.confidence} /><span className="grow"><Ref id={c.ref.$ref} origin="why" /></span><WhyButton id={c.ref.$ref} /></div>
                    <div className="xs dim">{c.explanation}</div></li>))}
                  {!d.components.length && <li className="dim">{S.none}</li>}</ul>
              )}
            </Block>

            <Block title={S.whyLimitations} name="limitations">
              <ul className="list" data-testid="why-limitations">{(d.limitations ?? []).map((l: string) => <li key={l} className="small">{l}</li>)}</ul>
            </Block>
            <details className="why-tech" data-testid="why-technical">
              <summary>{S.whyTechnical}</summary>
            <Block title={S.whyRule} name="rule">
              {isNA(d.rule) ? <><NA x={d.rule} />{d.derivation && <p className="small">{S.derivation}: <span className="mono">{d.derivation}</span></p>}</> : (
                <>
                  <div className="row"><span className="mono small" data-testid="why-rule">{d.rule.id}</span>
                    <span className="tag acc">v{d.rule_version}</span>
                    <span className="xs dim">{d.rule.newer_versions?.length ? S.whyRuleNewer(d.rule.newer_versions.join(", ")) : S.whyRuleActive}</span></div>
                  <div className="small">{d.rule.label} · output {d.rule.output} · forza {conf(d.rule.strength)} · soglia {conf(d.rule.emit_threshold)} · ancora {d.rule.anchor}</div>
                  <ul className="list">
                    {(d.rule.variables ?? []).map((v: any) => <li key={v.name} className="xs"><span className="mono">{v.name}</span> · {v.kind} · {Array.isArray(v.types) ? v.types.join(", ") : v.types ?? ""}</li>)}
                    {(d.rule.constraints ?? []).map((c: any, i: number) => <li key={i} className="xs mono">{constraintText(c)}</li>)}
                    {d.rule.group && <li className="xs mono">raggruppamento di {d.rule.group.var}: {(d.rule.group.link ?? []).map(constraintText).join(" + ")} · supporto {d.rule.group.support} · rappresentante {(d.rule.group.representative ?? []).map((o: any) => o.join(" ")).join(", ")}</li>}
                  </ul>
                  <button type="button" className="xs" onClick={() => ruleText ? setRuleText(null) :
                    plain<any>(`/rules/${d.rule.id}`, {}, { version: d.rule_version }).then((x) => setRuleText(x.data.definition_toml), () => setRuleText("—"))}>
                    {ruleText ? S.rawHide : "Definizione della regola"}</button>
                  {ruleText && <pre className="raw">{ruleText}</pre>}
                </>
              )}
            </Block>

            {d.kind === "insight" && (
              <Block title={S.whyMembers} name="members">
                <table><thead><tr><th>ruolo</th><th>elemento</th><th className="n">dist.</th><th className="n">Δt</th><th className="n">conf.</th></tr></thead>
                  <tbody>{(d.evidence?.members ?? []).map((m: any) => (
                    <tr key={`${m.role}-${m.ref?.$ref}`}><td className="mono xs">{m.role}</td><td>{m.ref && <Ref id={m.ref.$ref} origin="why" />}</td>
                      <td className="n">{m.distance_km != null ? km(m.distance_km) : ""}</td><td className="n">{m.delta_t_ms != null ? duration(m.delta_t_ms) : ""}</td>
                      <td className="n">{conf(m.member_confidence)}</td></tr>))}</tbody></table>
              </Block>
            )}

            <Block title={S.whyCandidates} name="candidates">
              {isNA(d.candidates) ? <NA x={d.candidates} /> : (
                <>
                  <table data-testid="why-candidates"><thead><tr><th>grp</th><th>candidato ({d.candidates.var})</th><th className="n">sev.</th><th className="n">punt.</th><th className="n">dist.</th><th className="n">Δt</th><th className="n" /></tr></thead>
                    <tbody>{d.candidates.items.map((c: any) => (
                      <tr key={c.id} data-candidate={c.id}><td className="n">{c.group}</td><td><Ref id={c.ref.$ref} origin="why" /></td>
                        <td className="n">{conf(c.severity)}</td><td className="n">{conf(c.score)}</td>
                        <td className="n">{c.distance_km != null ? km(c.distance_km) : ""}</td><td className="n">{c.delta_t_ms != null ? duration(c.delta_t_ms) : ""}</td>
                        <td>{d.representative?.$ref === c.id && <span className="tag acc">RAPPR.</span>}{" "}
                          {d.group_support?.support_member?.$ref === c.id && <span className="tag">SUPP.</span>}</td></tr>))}</tbody></table>
                  {d.candidates.truncated && <p className="warn">candidati registrati: {d.candidates.items.length} su {num(d.candidates.total)}</p>}
                </>
              )}
            </Block>

            <Block title={S.whyGrouping} name="grouping">
              {isNA(d.candidate_groups) ? <NA x={d.candidate_groups} /> : (
                <>
                  <p className="small">criteri: {(d.candidate_groups.criteria ?? []).map(constraintText).join(" + ")} · metodo del supporto: {d.group_support?.method}</p>
                  <ul className="list">{d.candidate_groups.items.map((g: any) => (
                    <li key={g.index} className="small" data-group={g.index}>
                      <span className={`tag${g.index === d.candidate_groups.chosen_group ? " acc" : ""}`}>gruppo {g.index}{g.index === d.candidate_groups.chosen_group ? " · scelto" : ""}</span>{" "}
                      {g.members.length} membri · supporto <span className="mono" data-testid={`group-support-${g.index}`}>{conf(g.support)}</span>
                    </li>))}</ul>
                  {d.group_support?.support_member && <p className="small">{S.groupSupportBy(conf(d.group_support.value))} <Ref id={d.group_support.support_member.$ref} origin="why" /></p>}
                </>
              )}
            </Block>

            <Block title={S.whyRepresentative} name="representative">
              {isNA(d.representative) ? <NA x={d.representative} /> : (
                <><div data-testid="why-representative" data-ref={d.representative.$ref}><Ref id={d.representative.$ref} origin="why" /></div>
                  <p className="small dim">{d.representative_reason?.text}</p></>
              )}
            </Block>

            <Block title={S.whyRejected} name="rejected">
              {isNA(d.rejected_candidates) ? <NA x={d.rejected_candidates} /> : (
                <>
                  {!d.rejected_candidates.items.length && <p className="note">{S.none}</p>}
                  <ul className="list" data-testid="why-rejected">{d.rejected_candidates.items.map((x: any) => (
                    <li key={x.id} data-rejected={x.id}><Ref id={x.ref.$ref} origin="why" /><div className="xs dim">gruppo {x.group} · {x.reason}</div></li>))}</ul>
                  {d.rejection_reasons?.length > 0 && <p className="xs faint">{d.rejection_reasons.map((r: any) => `${r.reason}: ${r.count}`).join(" · ")}</p>}
                </>
              )}
            </Block>

            <Block title={S.whyConfidence} name="confidence">
              <div className="formula" data-testid="why-formula">
                {factors?.method === "insight" && <>forza {conf(factors.relation_strength)} × membro meno sostenuto {conf(factors.members_min)}
                  {Object.keys(factors.scored ?? {}).sort().map((k) => <Fragment key={k}> × {k} {conf(factors.scored[k])}</Fragment>)}</>}
                {factors?.method === "independent_groups" && <>1 − Π(1 − cᵍ) su {Object.keys(factors.groups).length} gruppi indipendenti:{" "}
                  {Object.entries(factors.groups).map(([g, v]) => `${g} ${conf(v as number)}`).join(" · ")}</>}
                {factors?.method === "product" && <>{Object.entries(factors.factors).map(([k, v]) => `${k} ${conf(v as number)}`).join(" × ")}</>}
                {" "}= <strong>{recomputed != null ? recomputed.toFixed(6) : "—"}</strong>
              </div>
              <p className={match ? "small" : "err"} data-testid="why-recompute" data-match={String(match)}>
                {match ? S.recomputedOk(recomputed!.toFixed(6)) : S.recomputedKo(String(recomputed), String(stored))}</p>
              {d.confidence?.text && <p className="xs dim">{d.confidence.text}</p>}
            </Block>

            </details>
            <div style={{ height: 24 }} />
          </>
        )}
      </div>
    </div>
  );
}

function MemberEvidence({ role, id }: { role: string; id: string }) {
  const r = useFetch(`mev-${id}`, () => call<any>(`/entities/${id}/evidence`, { b: { max_items: 10 } })
    .then((x) => ({ ...x, data: store.normalize(x.data) })));
  if (id.startsWith("ins_")) return null;
  return (
    <div data-member-evidence={id}>
      <div className="row small" title={role}><Ref id={id} origin="why" /></div>
      <ul className="list">{(r.data?.data.items ?? []).map((ev: any) => <EvidenceItem key={ev.evidence_id} ev={ev} />)}</ul>
    </div>
  );
}
