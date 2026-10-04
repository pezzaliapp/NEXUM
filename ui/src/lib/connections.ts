// CONNECTIONS — the first level of OBJECT MODE: what an element is connected to, and why, read from the Core's own
// context of the element (/context/{id}, already normalized in the store). Nothing is computed or inferred here:
// every row is a record the Core returned, ordered by what it is (decision of 2026-09-30):
//   1. insight   — an association or context produced by a rule (support, explanation, WHY)
//   2. relation  — a canonical relation (support, independent sources, WHY)
//   3. role      — the role of a place in an event (as recorded by the vocabulary's roles)
// and, apart, what is only CONTEXT (never presented as a connection):
//   4. events that merely involve the same element ("shares_participant")
//   5. elements within 100 km (geographic proximity)
// Pure functions (no React, no store): unit-tested.

import RELATIONS_CFG from "../config/relations.json" with { type: "json" };

export type ConnCat = "insight" | "relation" | "role";

export interface Conn {
  cat: ConnCat;
  target: string;              // stable ID of the connected element (the pivot)
  phrase: string;              // nature of the connection, in words
  detail?: string | null;      // only what the Core recorded (explanation, distance, time, sources)
  confidence?: number | null;
  why?: string | null;         // element whose WHY explains the connection (insight or relation)
  more?: number;               // further connections of the same group not listed here
  geo?: boolean;               // a plain geographic link (containment, location of an event): context, not a discovery
}

export interface Connections {
  what: string;                // type
  where: string | null;        // place, when recorded (containing element or event participant)
  when: number | null;         // time of an event or insight
  rows: Conn[];                // connections that add information (rule outputs, non-spatial relations)
  geo: Conn[];                 // geographic context: where it is, what it contains, what happened there
  empty: string | null;        // explicit statement when strong connections are missing
  sameTerritory: { via: string | null; items: { id: string; t?: number | null }[] };
  nearby: { id: string; km: number }[];
  nearbyTotal: number;
}

export interface Labels {
  typeLabel: (type: string) => string;
  entityLabel: (id: string) => string | null;
  entityKind: (id: string) => string | null;
  entityType: (id: string) => string | null;
  day: (ms: number) => string;
  km: (n: number) => string;
  duration: (ms: number) => string;
}

export const ROLE_OF_EVENT: Record<string, string> = {
  location: "luogo dell'evento", nearest_location: "luogo più vicino all'evento", affected_area: "area colpita",
  at_volcano: "attività del vulcano",
};
export const ROLE_OF_PLACE: Record<string, string> = {
  location: "evento avvenuto qui", nearest_location: "evento nelle vicinanze (luogo più vicino)", affected_area: "evento con area colpita qui",
  at_volcano: "attività registrata di questo vulcano",
};
export const INSIGHT_KIND: Record<string, string> = {
  event_event_association: "associazione tra eventi", exposure_context: "contesto di esposizione",
  composite_context: "contesto composito",
};
/** The names the rules give to their outputs (GET /types → insight_types), registered at start. */
const RULE_NAMES = new Map<string, { label: string; output?: string }>();
export function setRuleNames(list: { id: string; label: string; output?: string }[]) {
  RULE_NAMES.clear();
  for (const r of list) RULE_NAMES.set(r.id, { label: r.label, output: r.output });
}
/** The name of a rule's output in words: the rule's own label; the three Phase 1 rules keep their names. */
export function insightKind(type: string): string {
  if (INSIGHT_KIND[type]) return INSIGHT_KIND[type];
  const r = RULE_NAMES.get(type);
  if (r) return r.label[0].toLowerCase() + r.label.slice(1);
  return type.replace(/_/g, " ");
}

/** An output of a rule that associates elements (as opposed to a context it describes): by the rule's id. */
export const isAssociation = (type: string | null | undefined) =>
  !!type && (RULE_NAMES.get(type)?.output === "association" || /association/.test(type));
// how a relation reads from its other end (config/relations.json); an unknown type: its label "visto dall'altro lato"
const INVERSE: Record<string, string> = (RELATIONS_CFG as any).inverse;
const NATURE: Record<string, string> = { spatial: "spaziale", temporal: "temporale", functional: "funzionale" };

/** Roles that only say where an event happened (geographic context, never presented as a discovery). */
export const GEO_ROLES = new Set(["location", "nearest_location", "affected_area"]);
const PER_GROUP = 2;   // relations of one type and direction shown before "e altri N"
const PER_ROLE = 3;    // events of a place shown before "e altri N"
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** First sentence of a recorded explanation (a substring: nothing is rewritten). */
export function firstSentence(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/^.*?[.!?](?=\s+[A-ZÀ-Ý]|$)/s);
  return (m ? m[0] : text).trim();
}

/** Label of an edge type in words (graph filters, aggregates, edge panel). */
export function edgeTypeLabel(edgeKind: string, etype: string, typeLabel: (t: string) => string, direction?: string): string {
  if (edgeKind === "relation") return direction === "in" ? (INVERSE[etype] ?? `${typeLabel(etype)} (dall'altro lato)`) : typeLabel(etype);
  if (edgeKind === "participation") return ROLE_OF_EVENT[etype] ?? etype.replace(/_/g, " ");
  if (edgeKind === "insight_member") return "membro di un insight";
  return etype.replace(/_/g, " ");
}

export function buildConnections(id: string, kind: string, type: string, details: any, data: any, L: Labels): Connections {
  const rows: Conn[] = [];
  const d = details ?? {};
  let where: string | null = null;
  let when: number | null = null;
  const what = kind === "insight" ? cap(insightKind(type))
    : kind === "relation" ? `Relazione · ${L.typeLabel(type)}` : L.typeLabel(type);

  // 1. insights — for an element: the rule outputs it belongs to; for an insight: its members
  if (kind === "insight") {
    when = d.t_start_ms ?? null;
    const seen = new Set<string>();
    for (const m of d.members ?? []) {
      const t = m.ref?.$ref;
      if (!t || seen.has(t)) continue;
      seen.add(t);
      // an association's distance and time gap belong to the pair (said once, in its result); a context's members
      // keep each its own distance
      const parts = d.insight_kind === "association" ? [] : [m.distance_km != null ? `a ${L.km(m.distance_km)}` : null,
        m.delta_t_ms != null ? `Δt ${L.duration(m.delta_t_ms)}` : null].filter(Boolean);
      // a context names the event and what lies in its area; an association the events it associates
      const collected = String(m.role ?? "").includes("#");
      const phrase = d.insight_kind === "context" ? (collected ? "nell'area" : "evento all'origine")
        : d.insight_kind === "association" ? "evento associato" : "fa parte di questa connessione";
      rows.push({ cat: "insight", target: t, phrase, detail: parts.join(" · ") || null,
        confidence: m.member_confidence ?? null, why: null });   // the insight's own "Perché?" is in the head
    }
  } else {
    for (const it of data?.insights?.items ?? []) {
      const t = it.ref?.$ref;
      if (!t) continue;
      rows.push({ cat: "insight", target: t, phrase: isAssociation(L.entityType(t)) ? "associazione trovata da una regola"
        : "contesto trovato da una regola",
        detail: firstSentence(it.explanation), confidence: it.confidence, why: t });
    }
    const more = (data?.insights?.total ?? 0) - (data?.insights?.items?.length ?? 0);
    if (more > 0 && rows.length) rows[rows.length - 1].more = more;
  }

  // 2. canonical relations
  if (kind === "relation") {
    const from = d.from?.$ref, to = d.to?.$ref;
    if (from) rows.push({ cat: "relation", target: from, phrase: "da", confidence: null, why: id });
    if (to) rows.push({ cat: "relation", target: to, phrase: L.typeLabel(type), confidence: d.confidence ?? null, why: id,
      detail: d.independent_sources != null ? `${d.independent_sources} fonti indipendenti` : null });
  } else {
    for (const g of data?.relations?.groups ?? []) {
      const phrase = g.direction === "in" ? (INVERSE[g.type] ?? `${L.typeLabel(g.type)} (dall'altro lato)`) : L.typeLabel(g.type);
      const all = g.items ?? [];
      for (const it of all) {
        if (g.type === "located_in" && g.direction === "out" && !where) where = L.entityLabel(it.other?.$ref);
        if (g.type === "near_place" && g.direction === "out" && !where) where = `vicino a ${L.entityLabel(it.other?.$ref) ?? ""}`;
      }
      const items = all.slice(0, PER_GROUP);        // a group is shown by its first elements and its size
      items.forEach((it: any, i: number) => {
        const t = it.other?.$ref;
        if (!t) return;
        const src = it.independent_sources != null ? `${it.independent_sources} ${it.independent_sources === 1 ? "fonte" : "fonti indipendenti"}` : null;
        rows.push({ cat: "relation", target: t, phrase, confidence: it.confidence ?? null, why: it.relation?.$ref ?? null,
          detail: [NATURE[g.nature] ? `relazione ${NATURE[g.nature]}` : null, src].filter(Boolean).join(" · ") || null,
          more: i === items.length - 1 && g.count > items.length ? g.count - items.length : undefined,
          geo: g.nature === "spatial" });
      });
    }
  }

  // 3. roles: a place in an event (from the event's participants, or the place's events)
  const sameItems: { id: string; t?: number | null }[] = [];
  let sameVia: string | null = null;
  if (kind === "event") {
    when = d.t_start_ms ?? null;
    const byRole = [...(d.participants ?? [])].sort((a: any, b: any) =>
      ["location", "affected_area", "nearest_location"].indexOf(a.role) - ["location", "affected_area", "nearest_location"].indexOf(b.role));
    for (const p of byRole) {
      const t = p.object?.$ref;
      if (!t) continue;
      if (!where) where = p.role === "nearest_location" ? `vicino a ${L.entityLabel(t) ?? ""}` : L.entityLabel(t);
      rows.push({ cat: "role", target: t, phrase: ROLE_OF_EVENT[p.role] ?? p.role.replace(/_/g, " "), confidence: p.confidence ?? null,
        detail: p.distance_m ? `a ${L.km(p.distance_m / 1000)}` : null, geo: GEO_ROLES.has(p.role) });
    }
  }
  let roleCount = 0;
  if (kind !== "relation" && kind !== "insight") {
    for (const it of data?.related_events?.items ?? []) {
      const [why, ref] = String(it.reason ?? "").split(":");
      if (why === "participation" && kind === "object") {
        if (++roleCount > PER_ROLE) continue;
        rows.push({ cat: "role", target: it.$ref, phrase: ROLE_OF_PLACE[ref] ?? ref.replace(/_/g, " "),
          detail: it.t != null ? L.day(it.t) : null, confidence: null, geo: GEO_ROLES.has(ref) });
      } else if (why === "shares_participant") {
        sameItems.push({ id: it.$ref, t: it.t });
        sameVia ??= L.entityLabel(ref);
      }
    }
  }

  if (kind === "object") {
    const roles = rows.filter((r) => r.cat === "role");
    const more = (data?.related_events?.total ?? 0) - Math.min(roleCount, PER_ROLE);
    if (roles.length && more > 0) roles[roles.length - 1].more = more;
  }

  // what adds information comes first; plain geography is context (decision of 2026-10-01). A relation shown as the
  // focus itself keeps its two ends.
  const geo = kind === "relation" ? [] : rows.filter((r) => r.geo);
  const main = kind === "relation" ? rows : rows.filter((r) => !r.geo);
  const empty = main.length ? null : `Nessuna connessione supportata trovata per questo ${kind === "event" ? "evento" : "elemento"}.`;

  const g = data?.geography;
  const nearby = (g?.nearby_100km?.items ?? []).map((n: any) => ({ id: n.$ref, km: n.distance_km }));
  return { what, where, when, rows: main, geo, empty, sameTerritory: { via: sameVia, items: sameItems }, nearby,
    nearbyTotal: g?.nearby_100km?.total ?? nearby.length };
}

/** What of the active scope excludes an element from the views (types, confidence, sources, time window), with the
 * scope's own rules (the Core's scope predicate). Only facts known for the element are tested: an unknown
 * confidence or source is never counted as an exclusion. Pure: used to declare connections hidden by filters. */
export interface Scoped { kind: string; type: string; confidence?: number | null; source_id?: string | null; t?: number | null }
export function excludedBy(e: Scoped, sc: { types?: string[] | null; min_confidence?: number | null; sources?: string[] | null;
  time_window?: [number, number] | null }): string[] {
  const out: string[] = [];
  if (Array.isArray(sc.types) && !sc.types.includes(e.type)) out.push("type");
  if (sc.min_confidence && e.confidence != null && e.confidence < sc.min_confidence) out.push("confidence");
  if (Array.isArray(sc.sources) && e.kind !== "insight" && e.source_id && !sc.sources.includes(e.source_id)) out.push("source");
  if (sc.time_window && (e.kind === "event" || e.kind === "insight") && e.t != null &&
    !(sc.time_window[0] <= e.t && e.t <= sc.time_window[1])) out.push("time");
  return out;
}
