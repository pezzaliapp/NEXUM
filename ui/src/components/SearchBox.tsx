// SEARCH — results grouped by nature and type, from the Core (FTS5). Paste a stable ID to open it directly.
// "Filter all views" puts the text into the shared Scope. Unranked answers are declared, never hidden.

import { useEffect, useRef, useState } from "react";
import { call, isSuperseded } from "../lib/api";
import { colorOf, SHAPE } from "../lib/palette";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { dismissTop } from "../lib/layers";
import { dayLabel, inPeriod } from "../lib/period";
import { matchPlaces, type Place } from "../lib/places";

const ID_RE = /^(obj|evt|rel|ins)_[a-z0-9]{8,40}$/;

/** Order of meaning of a group of results: 0 an exact name · 1 explorable elements · 2 events · 3 other elements and
 *  rule outputs · 4 information about elements (not on the map) · 5 measured series. */
function groupRank(g: any, text: string): number {
  const t = store.get().types.get(g.type);
  const low = text.trim().toLowerCase();
  if (g.items.some((it: any) => (store.entity(it.$ref)?.label ?? "").toLowerCase() === low)) return 0;
  if (t?.explore) return 1;
  if (!t) return 3;
  if (t.kind === "event") return 2;
  if (t.map === false) return t.series || t.wave ? 5 : 4;
  return 3;
}

// PLACES FIRST (integrity gate 2026-10-04): the full-text search ranks thousands of event labels that share a place's
// name ("Sudan: Government · Sudan") above the place itself. A small index of the explorable places (labels and their
// source names, read once on the first search) puts a place named exactly or by prefix first — generic, no exception list.
let placesP: Promise<Place[]> | null = null;
/** The index of places, read once (the first search, or the map naming its places by rank). */
export const loadPlaces = () => (placesP ??= call<any>("/places-index", undefined, { channel: "places-index" })
  .then((r) => r.data.places as Place[], () => { placesP = null; return [] as Place[]; }));
/** The clear name of a place when its source label is abbreviated (null otherwise), from the loaded index. */
export async function clearNameOf(id: string): Promise<string | null> {
  const p = (await loadPlaces()).find((x) => x[0] === id);
  return p?.[4] ?? null;
}
/** `inline`: inside the touch "Cerca" overlay (results listed under the field, always open). */
export function SearchBox({ inline = false }: { inline?: boolean } = {}) {
  const [q, setQ] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [res, setRes] = useState<{ ids: { id: string; group: string }[]; ranked: boolean; est: number | null } | null>(null);
  const [sel, setSel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState<{ id: string; label: string; rest: string } | null>(null);
  const [clear, setClear] = useState<Record<string, string>>({});
  const [ctx, setCtx] = useState<Record<string, string>>({});
  const scope = useStore((s) => s.scope);
  const types = useStore((s) => s.types);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const text = q.trim();
    if (ID_RE.test(text) || text.length < 2) { setRes(null); return; }
    const t = setTimeout(() => {
      // search reaches a focus: it covers the whole time of the world (types and sources still apply); results
      // outside the observed period are marked, never hidden (FOCUS ≠ FILTER)
      const { time_window: _tw, ...s } = scope;
      Promise.all([call<any>("/search", { q: text, s, b: { max_items: 50 } }, { channel: "search" }), loadPlaces()]).then(([r, places]) => {
        const d = store.normalize(r.data);
        // the places named by the text come first, as their own group (never duplicated below)
        const hitPlaces = matchPlaces(places, text);
        for (const h of hitPlaces) if (!store.entity(h.id)) store.upsert({ kind: "object", id: h.id, type: h.type, label: h.label });
        const placeIds = new Set(hitPlaces.map((h) => h.id));
        setClear(Object.fromEntries(hitPlaces.filter((h) => h.label !== store.entity(h.id)?.label).map((h) => [h.id, h.label])));
        setCtx(Object.fromEntries(hitPlaces.filter((h) => h.context).map((h) => [h.id, h.context!])));
        // one group per kind of place (two kinds are never listed under the same heading), in order of the best hit
        const kinds = [...new Set(hitPlaces.map((h) => h.type))];
        d.groups = [...kinds.map((k) => ({ type: k, items: hitPlaces.filter((h) => h.type === k).map((h) => ({ $ref: h.id })), places: true })),
          ...(d.groups ?? []).map((g: any) => ({ ...g, items: g.items.filter((it: any) => !placeIds.has(it.$ref)) })).filter((g: any) => g.items.length)];
        // the Core's groups, read in order of meaning: an exact name, then explorable elements, events, other
        // elements, then measured series — every result kept (the order of the service's answer is unchanged)
        const groups = [...(d.groups ?? [])].map((g: any, i: number) => ({ g, i, r: g.places ? -1 : groupRank(g, text) })).sort((a, b) => a.r - b.r || a.i - b.i);
        const ids: { id: string; group: string }[] = [];
        for (const { g } of groups) for (const it of g.items) ids.push({ id: it.$ref, group: g.type });
        setRes({ ids, ranked: d.ranked !== false, est: d.estimated_matches ?? null });
        setSel(0); setErr(null);
        performance.mark(`nexum:search:${text}`);
      }, (e) => { if (!isSuperseded(e)) setErr((e as Error).message); });
      // "inflazione Italia": one word names an explorable element, the others say what to read in it
      const words = text.split(/\s+/).filter((w) => w.length >= 3);
      const ex = [...store.get().types.values()].filter((t) => t.explore).map((t) => t.id);
      setShortcut(null);
      const allWords = text.split(/\s+/).filter(Boolean);
      if (allWords.length >= 2 && allWords.length <= 6) loadPlaces().then((all) => {
        const places = all.filter((p) => store.get().types.get(p[1])?.explore);   // a section shortcut needs a place's own view
        // the longest run of words that IS a place's name (exact), the remaining words say what to read in it
        // the whole text naming a place ("South Sudan", "Dominican Republic") is the place itself: no shortcut
        if (matchPlaces(places, allWords.join(" "), 1).some((h) => h.score < 1)) return;
        for (let n = Math.min(3, allWords.length - 1); n >= 1; n--) for (let i = 0; i + n <= allWords.length; i++) {
          const hit = matchPlaces(places, allWords.slice(i, i + n).join(" "), 1).find((h) => h.score < 1);
          if (!hit) continue;
          const rest = [...allWords.slice(0, i), ...allWords.slice(i + n)].filter((w) => w.length >= 3).join(" ");
          if (!rest) return;
          if (!store.entity(hit.id)) store.upsert({ kind: "object", id: hit.id, type: hit.type, label: hit.label });
          setShortcut({ id: hit.id, label: hit.label, rest });
          return;
        }
        if (words.length >= 2 && words.length <= 4 && ex.length) ftsShortcut();
      });
      const ftsShortcut = () => {
        // the type filter applies to the best-scored rows (as in the Core): ask enough rows for a place to be among them
        // a word that IS a place's name wins over a word that only begins one ("Sudan" ≠ "S. Sudan", "cost" ≠ "Costa Rica")
        const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        Promise.all(words.map((w) => call<any>("/search", { q: w, s: { types: ex }, b: { max_items: 50 } }, { channel: `search-sc-${w}` })
          .then((r) => {
            const items = ((r.data.groups ?? []) as any[]).flatMap((g) => g.items);
            const exact = items.find((it) => norm(it.label ?? store.entity(it.$ref ?? it.id)?.label ?? "") === norm(w));
            return exact ? { ...exact, exact: true } : items[0] ?? null;
          }, () => null))).then((hits) => {
          const k = hits.findIndex((h) => h?.exact) >= 0 ? hits.findIndex((h) => h?.exact) : hits.findIndex(Boolean);
          if (k < 0) return;
          const rest = words.filter((_, i) => i !== k).join(" ");
          setShortcut({ id: hits[k].id, label: hits[k].label, rest });
        });
      };
    }, 150);
    return () => clearTimeout(t);
  }, [q, JSON.stringify({ ...scope, time_window: null })]);

  const choose = (id: string) => { store.select(id, "search"); setListOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setListOpen(false); input.current?.blur(); if (inline) dismissTop(); return; }
    if (e.key === "Enter") {
      const text = q.trim();
      if (ID_RE.test(text)) return choose(text);
      if (res?.ids[sel]) choose(res.ids[sel].id);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min((res?.ids.length ?? 1) - 1, s + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
  };
  const showList = (listOpen || inline) && q.trim().length > 0;
  let lastGroup = "";
  return (
    <div className={inline ? "search inline" : "search"} role="search">
      <span className="icon" aria-hidden>⌕</span>
      <input ref={input} id="nexum-search" type="search" value={q} placeholder={S.searchPlaceholder} autoComplete="off"
        aria-label={S.views.search} aria-expanded={showList} aria-controls="nexum-results"
        onChange={(e) => { setQ(e.target.value); setListOpen(true); }} onFocus={() => setListOpen(true)} onKeyDown={onKey}
        onBlur={() => { if (!inline) setTimeout(() => setListOpen(false), 150); }} />
      {showList && (
        <div className="results" id="nexum-results" role="listbox" data-testid="search-results" onMouseDown={(e) => e.preventDefault()}>
          {q.trim().length < 2 && !ID_RE.test(q.trim()) && <div className="grp">{S.searchTooShort}</div>}
          {ID_RE.test(q.trim()) && <div className="it" onClick={() => choose(q.trim())}><span className="mono">{q.trim()}</span><span className="dim">↵</span></div>}
          {shortcut && <div className="it shortcut" role="option" aria-selected={false} data-testid="search-shortcut" data-ref={shortcut.id}
            onClick={() => { store.select(shortcut.id, "search", `?${shortcut.rest}`); setListOpen(false); }}>
            <span className="accent">→</span><span className="grow ellipsis"><b>{shortcut.label}</b> · {shortcut.rest}</span></div>}
          {res && !res.ranked && <div className="grp warn" data-testid="search-unranked">{S.searchUnranked(res.est)}</div>}
          {res && !res.ids.length && <div className="grp">{S.searchNone}</div>}
          {res?.ids.map(({ id, group }, i) => {
            const e = store.entity(id)!;
            const head = group !== lastGroup ? (lastGroup = group, <div className="grp" key={`g-${group}`}>{types.get(group)?.label ?? group.replace(/_/g, " ")}</div>) : null;
            return [head, (
              <div key={id} className="it" role="option" aria-selected={i === sel} data-ref={id} onMouseEnter={() => setSel(i)} onClick={() => choose(id)}>
                <span style={{ color: colorOf(types.get(e.type)?.family, e.kind, e.type) }}>{SHAPE[e.kind]}</span>
                <span className="grow ellipsis">{clear[id] ? `${clear[id]} (${e.label})` : e.label}</span>
                {ctx[id] && <span className="xs dim ellipsis" data-testid="search-context">{ctx[id]}</span>}
                {e.t != null && <span className={`xs ${inPeriod(e.t, scope.time_window ?? null) ? "dim" : "accent"}`} data-outside={!inPeriod(e.t, scope.time_window ?? null) || undefined}>
                  {dayLabel(e.t)}</span>}
              </div>)];
          })}
          {err && <div className="grp err">{err}</div>}
        </div>
      )}
    </div>
  );
}
