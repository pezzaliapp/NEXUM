// The element an indicator is about, when its source does not name it (2026-10-05): said plainly, and beside it — as a
// separate fact with its own value, source and definition — NEXUM's most populous element of that type in the place,
// linked to its card. Never presented as the identity behind the source's number. Config: config/indicator-context.json.
import { store } from "../store";

export interface Leader { id: string; label: string; value: number | null; source: string; property: string }
export interface IndCtx { unnamed: string; leaderLabel: string; leaderPrefix?: string; leaderUnit?: string; caveat: string; leader?: Leader | null }

export function IndContext({ c }: { c: IndCtx | undefined }) {
  if (!c) return null;
  const v = c.leader?.value;
  return (
    <span className="ind-ctx xs" data-testid="ind-context" onClick={(e) => e.stopPropagation()}>
      <span className="dim" data-testid="ind-unnamed">{c.unnamed}</span>
      {c.leader && <span data-testid="ind-leader"> {c.leaderLabel}:{" "}
        <button type="button" className="linklike xs" data-testid="ind-leader-link" data-ref={c.leader.id}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); store.select(c.leader!.id, "indicator"); }}>{c.leader.label}</button>
        {v != null && <> — {c.leaderPrefix ?? ""}{Math.round(v).toLocaleString("it-IT")}{c.leaderUnit ? ` ${c.leaderUnit}` : ""}</>}
        <span className="faint"> ({c.leader.source}; {c.caveat})</span></span>}
    </span>);
}
