// The Core's full-text index (FTS5 + fts5vocab + the rank of rid_map's IDs) opened read-only in memory by SQLite compiled to
// WebAssembly (@sqlite.org/sqlite-wasm, decision E4). Loaded on the first search only.

export interface SearchEngine { run: (sql: string, args: any[]) => any[][]; version: string }

export async function openSearch(bytes: Uint8Array, init?: (opts?: any) => Promise<any>, opts: any = {}): Promise<SearchEngine> {
  const sqlite3InitModule = init ?? (await import("@sqlite.org/sqlite-wasm")).default;
  const sqlite3: any = await sqlite3InitModule({ print: () => {}, printErr: () => {}, ...opts });
  const capi = sqlite3.capi;
  const p = sqlite3.wasm.allocFromTypedArray(bytes);
  const db = new sqlite3.oo1.DB();
  const rc = capi.sqlite3_deserialize(db.pointer, "main", p, bytes.length, bytes.length,
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_READONLY);
  if (rc !== 0) throw new Error(`search index could not be opened (sqlite rc ${rc})`);
  // idrank(rid): the rank of the element's ID (rid_map's join and order). Bit array (byte 0 = width w, then w bits per
  // rid, big-endian, value rank + 1, 0 = no element); an older snapshot's 3-byte array or rid_rank table gives the same
  // function.
  const exec = (sql: string) => db.exec({ sql, returnValue: "resultRows", rowMode: "array" }) as any[][];
  const tables = new Set(exec("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r[0]));
  let rank: (rid: number) => number | null;
  if (tables.has("rid_rank_bits")) {
    const b = exec("SELECT b FROM rid_rank_bits")[0][0] as Uint8Array;
    rank = (rid) => rankFromBits(b, rid);
  } else if (tables.has("rid_rank_packed")) {
    const b = exec("SELECT b FROM rid_rank_packed")[0][0] as Uint8Array;
    rank = (rid) => {
      const i = 3 * rid;
      if (!(rid >= 0) || i + 2 >= b.length) return null;
      const v = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
      return v === 0 ? null : v - 1;
    };
  } else {
    const m = new Map<number, number>(exec("SELECT rid, idrank FROM rid_rank").map((r) => [r[0], r[1]]));
    rank = (rid) => m.get(rid) ?? null;
  }
  db.createFunction("idrank", (_ctx: any, rid: number) => rank(rid), { arity: 1, deterministic: true });
  return {
    version: sqlite3.version.libVersion,
    run: (sql, args) => db.exec({ sql, bind: args, returnValue: "resultRows", rowMode: "array" }) as any[][],
  };
}

/** The value of `rid` in a rid_rank_bits array (byte 0 = width w; w bits per rid, big-endian): rank, or null when the rid
 *  has no element or lies outside the array. */
export function rankFromBits(b: Uint8Array, rid: number): number | null {
  const w = b[0];
  if (!(rid >= 0) || !w || 8 + (rid + 1) * w > b.length * 8) return null;
  let bit = 8 + rid * w, v = 0;
  for (let i = 0; i < w; i++, bit++) v = v * 2 + ((b[bit >> 3] >> (7 - (bit & 7))) & 1);
  return v === 0 ? null : v - 1;
}
