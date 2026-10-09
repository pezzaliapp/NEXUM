// THE LATEST OBSERVATIONS of an element (2026-10-09, oceanographic network): the row of the source's published table
// (vocabulary hint "latest": the table of the element's own source, read only when the card opens) whose identifier is one of the element's —
// every value with its unit, the UTC time of the observation and its age said plainly ("recente" only within the type's
// threshold, never "live"), the quality the source gives, the unit conversions and the source. No row: the element's
// own note (why there is none) or "none in the source's latest file". Generic: nothing here knows what is measured.
import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { ageOf } from "../lib/age";
import { S } from "../lib/strings";
import { fmtValue } from "../lib/summary";
import { store, useStore } from "../store";

interface Table { fields: string[]; rows: any[][]; notes?: any; attribution?: string }
const tables = new Map<string, Promise<Table | null>>();
const load = (name: string) => {
  if (!tables.has(name)) tables.set(name, call<any>(`/tables/${name}`, undefined, { channel: `latest-${name}` })
    .then((r) => r.data as Table, () => { tables.delete(name); return null; }));
  return tables.get(name)!;
};

export function LatestObs({ id, d }: { id: string; d: any }) {
  const e = store.entity(id);
  const t = useStore((s) => s.types.get(e?.type ?? ""));
  const hint = t?.latest;
  const [found, setFound] = useState<{ table: Table; row: any[] }[] | null | undefined>(undefined);
  const [unavailable, setUnavailable] = useState(false);
  const idents: { scheme: string; value: string; source_id?: string }[] = d?.identifiers ?? [];
  const key = idents.map((x) => `${x.scheme}:${x.value}`).join("|");
  useEffect(() => {
    if (!hint) return;
    let live = true;
    setFound(undefined); setUnavailable(false);
    // the tables of the sources that state the element (the same station may be named by two networks: one row each)
    const names = [...new Set([hint.tables[e?.source_id ?? ""], ...idents.map((x) => hint.schemes?.[x.scheme])].filter((x): x is string => !!x))];
    if (!names.length) { setFound(null); return; }
    Promise.all(names.map(load)).then((ts) => {
      if (!live) return;
      if (ts.every((t) => t === null)) { setUnavailable(true); return; }
      const rows = ts.flatMap((table) => {
        if (!table) return [];
        const si = table.fields.indexOf("scheme"), ii = table.fields.indexOf("id");
        const row = table.rows.find((r) => idents.some((x) => x.scheme === r[si] && String(x.value) === String(r[ii])));
        return row ? [{ table, row }] : [];
      });
      setFound(rows.length ? rows : null);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, hint]);
  if (!hint) return null;
  const note = hint.note_property ? d?.properties?.[hint.note_property] : null;
  return (
    <section className="latest" data-testid="latest-obs">
      <div className="conn-h">{S.latest.title}</div>
      {found === undefined && !unavailable && <p className="xs dim conn-pad">{S.latest.loading}</p>}
      {unavailable && <p className="xs dim conn-pad">{S.latest.error}</p>}
      {found === null && <p className="xs dim conn-pad" data-testid="latest-none">{note || S.latest.none}</p>}
      {found && found.map((f, i) => <Row key={i} table={f.table} row={f.row} recentH={hint.recent_h ?? 3} />)}
    </section>);
}

function Row({ table, row, recentH }: { table: Table; row: any[]; recentH: number }) {
  const at = (f: string) => row[table.fields.indexOf(f)];
  const observed = at("observed_utc") as string;
  const age = ageOf(observed, Date.now(), recentH);
  const params: Record<string, [string, string, number]> = table.notes?.params ?? {};
  const values = Object.entries(params).map(([p, [label, unit, digits]]) => [p, label, unit, digits, at(p)] as const)
    .filter(([, , , , v]) => v !== null && v !== undefined);
  const quality = at("quality") || table.notes?.quality;
  // a unit conversion is said only for a value shown (notes.conversions: parameter → text; or one text for all)
  const conv = table.notes?.conversions;
  const conversions: string[] = typeof conv === "string" ? [conv]
    : [...new Set(values.map(([p]) => conv?.[p]).filter((x): x is string => !!x))];
  return (
    <div className="conn-pad">
      <p className="latest-at" data-testid="latest-at" data-recent={age?.recent ? "1" : "0"}>
        {S.latest.at(observed.replace("T", " ").replace("Z", " UTC"), age ? `${age.text} (${age.recent ? S.latest.recent : S.latest.notRecent})` : "—")}
      </p>
      {values.length > 0 && <p className="facts-line">
        {values.map(([p, label, unit, digits, v]) => (
          <span key={p} className="fact" data-latest={p}><span className="fk">{label}</span> <span>{fmtValue(v as number, digits)}{unit ? (unit === "°" ? unit : ` ${unit}`) : ""}</span></span>))}
      </p>}
      {quality && <p className="xs dim">{S.latest.quality}: {quality}</p>}
      {conversions.length > 0 && <p className="xs dim">{S.latest.conversions}: {conversions.join(" · ")}</p>}
      <p className="xs dim">{S.latest.source}: {[table.notes?.source, table.attribution].filter(Boolean).join(" · ")}</p>
    </div>);
}
