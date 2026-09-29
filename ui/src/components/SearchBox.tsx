// SEARCH — results grouped by nature and type, from the Core (FTS5). Paste a stable ID to open it directly.
// "Filter all views" puts the text into the shared Scope. Unranked answers are declared, never hidden.

import { useEffect, useRef, useState } from "react";
import { call, isSuperseded } from "../lib/api";
import { colorOf, SHAPE } from "../lib/palette";
import { S } from "../lib/strings";
import { store, useStore } from "../store";

const ID_RE = /^(obj|evt|rel|ins)_[a-z0-9]{8,40}$/;

export function SearchBox() {
  const [q, setQ] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [res, setRes] = useState<{ ids: { id: string; group: string }[]; ranked: boolean; est: number | null } | null>(null);
  const [sel, setSel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const scope = useStore((s) => s.scope);
  const types = useStore((s) => s.types);
  const tab = useStore((s) => s.mobileTab);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const text = q.trim();
    if (ID_RE.test(text) || text.length < 2) { setRes(null); return; }
    const t = setTimeout(() => {
      const s = scope;
      call<any>("/search", { q: text, s, b: { max_items: 50 } }, { channel: "search" }).then((r) => {
        const d = store.normalize(r.data);
        const ids: { id: string; group: string }[] = [];
        for (const g of d.groups ?? []) for (const it of g.items) ids.push({ id: it.$ref, group: g.type });
        setRes({ ids, ranked: d.ranked !== false, est: d.estimated_matches ?? null });
        setSel(0); setErr(null);
        performance.mark(`nexum:search:${text}`);
      }, (e) => { if (!isSuperseded(e)) setErr((e as Error).message); });
    }, 150);
    return () => clearTimeout(t);
  }, [q, JSON.stringify(scope)]);

  const choose = (id: string) => { store.select(id, "search"); setListOpen(false); if (tab === "search") store.set({ mobileTab: "focus" }); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setListOpen(false); input.current?.blur(); return; }
    if (e.key === "Enter") {
      const text = q.trim();
      if (ID_RE.test(text)) return choose(text);
      if (res?.ids[sel]) choose(res.ids[sel].id);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min((res?.ids.length ?? 1) - 1, s + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
  };
  const showList = (listOpen || tab === "search") && q.trim().length > 0;
  let lastGroup = "";
  return (
    <div className="search m-hidden" role="search">
      <span className="icon" aria-hidden>⌕</span>
      <input ref={input} id="nexum-search" type="search" value={q} placeholder={S.searchPlaceholder} autoComplete="off"
        aria-label={S.views.search} aria-expanded={showList} aria-controls="nexum-results"
        onChange={(e) => { setQ(e.target.value); setListOpen(true); }} onFocus={() => setListOpen(true)} onKeyDown={onKey}
        onBlur={() => setTimeout(() => setListOpen(false), 150)} />
      {showList && (
        <div className="results" id="nexum-results" role="listbox" data-testid="search-results" onMouseDown={(e) => e.preventDefault()}>
          {q.trim().length < 2 && !ID_RE.test(q.trim()) && <div className="grp">{S.searchTooShort}</div>}
          {ID_RE.test(q.trim()) && <div className="it" onClick={() => choose(q.trim())}><span className="mono">{q.trim()}</span><span className="dim">↵</span></div>}
          {res && !res.ranked && <div className="grp warn" data-testid="search-unranked">{S.searchUnranked(res.est)}</div>}
          {res && !res.ids.length && <div className="grp">{S.searchNone}</div>}
          {res?.ids.map(({ id, group }, i) => {
            const e = store.entity(id)!;
            const head = group !== lastGroup ? (lastGroup = group, <div className="grp" key={`g-${group}`}>{types.get(group)?.label ?? group.replace(/_/g, " ")}</div>) : null;
            return [head, (
              <div key={id} className="it" role="option" aria-selected={i === sel} data-ref={id} onMouseEnter={() => setSel(i)} onClick={() => choose(id)}>
                <span style={{ color: colorOf(types.get(e.type)?.family, e.kind) }}>{SHAPE[e.kind]}</span>
                <span className="grow ellipsis">{e.label}</span>
              </div>)];
          })}
          {err && <div className="grp err">{err}</div>}
        </div>
      )}
    </div>
  );
}
