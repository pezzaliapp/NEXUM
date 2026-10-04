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
  // idrank(rid): the rank of the element's ID (rid_map's join and order). Packed array (3 bytes per rid, value
  // rank + 1, 0 = no element); an older snapshot's rid_rank table gives the same function.
  const exec = (sql: string) => db.exec({ sql, returnValue: "resultRows", rowMode: "array" }) as any[][];
  const tables = new Set(exec("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r[0]));
  let rank: (rid: number) => number | null;
  if (tables.has("rid_rank_packed")) {
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
