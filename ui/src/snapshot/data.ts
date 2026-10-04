// Snapshot data access: every artifact is fetched once, decompressed (gzip, `.jgz`) and kept for the session.
// The transport is injected (browser: fetch + DecompressionStream; tests: the file system).

export type Fetcher = (path: string) => Promise<Uint8Array | null>;   // null = not found (404)

export interface Manifest {
  format: number;
  version: string;
  world: string;
  world_version: number;
  built_utc: string;
  sources: Record<string, { attribution: string; license_id: string; name: string }>;
  shards: { ent: number; refs: number; edges: number; raw: number; sdoc: number; sdoc_files: number; ind?: number };
  tiles: { level: number; levels?: Record<string, number>; cols: string[]; types: Record<string, number>; cells: Record<string, [number, number, number][]> };
  agg_levels: number[];
  file_count: number;
  bytes: number;
}

export class NotFound extends Error {}

/** FNV-1a 32-bit over UTF-8 (same shard function as nexum.snapshot.build). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

export async function gunzip(b: Uint8Array): Promise<Uint8Array> {
  if (!isGzip(b)) return b;   // a host that already decoded the content
  const ds = new DecompressionStream("gzip");
  const out = new Response(new Blob([b as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

export class SnapshotData {
  private cache = new Map<string, Promise<any>>();
  manifest!: Manifest;
  bytesLoaded = 0;
  filesLoaded = 0;

  private fetcher: Fetcher;
  private decompress: (b: Uint8Array) => Promise<Uint8Array>;

  constructor(fetcher: Fetcher, decompress: (b: Uint8Array) => Promise<Uint8Array> = gunzip) {
    this.fetcher = fetcher;
    this.decompress = decompress;
  }

  async init(): Promise<Manifest> {
    this.manifest = await this.json("manifest.json");
    return this.manifest;
  }

  /** Raw bytes of an artifact (decompressed), not cached. */
  async bytes(path: string): Promise<Uint8Array> {
    const b = await this.fetcher(path);
    if (b === null) throw new NotFound(path);
    this.bytesLoaded += b.length;
    this.filesLoaded += 1;
    return this.decompress(b);
  }

  /** Parsed JSON artifact, cached for the session (null when the file does not exist and `optional`). */
  json(path: string, optional = false): Promise<any> {
    let p = this.cache.get(path);
    if (!p) {
      p = this.bytes(path).then((b) => JSON.parse(new TextDecoder().decode(b)), (e) => {
        if (optional && e instanceof NotFound) return null;
        this.cache.delete(path);
        throw e;
      });
      this.cache.set(path, p);
    }
    return p;
  }

  world(): Promise<any> { return this.json("world.jgz"); }
  /** Insight rows: their own file since 2026-10-01 (earlier snapshots keep them in world.jgz). */
  async insightRows(): Promise<{ insight_cols: string[]; insights: any[][] }> {
    const w = await this.world();
    return w.insights ? w : this.json("insights.jgz");
  }
  /** Explanations, confidence texts and members of the insights (only the insights listing reads them). Snapshots
   * built before 2026-10-01 keep them in world.jgz. */
  async insightTexts(): Promise<{ texts: Record<string, [string | null, string | null]> | null; insight_members: string[][] }> {
    const w = await this.world();
    if (w.insight_members) return { texts: null, insight_members: w.insight_members };
    return this.json("insight_texts.jgz");
  }
  /** Aggregation rows of a level: period-0 rows (objects, all-time totals) and, when asked, the dated periods. */
  async agg(level: number, dated = true, zero = true): Promise<any[][]> {
    const parts = await Promise.all([zero ? this.json(`agg/${level}-0.jgz`) : [], dated ? this.json(`agg/${level}-t.jgz`) : []]);
    return [...parts[0], ...parts[1]];
  }
  events(): Promise<{ cols: string[]; rows: any[][] }> { return this.json("events.jgz"); }
  adjacency(): Promise<{ ids: string[]; nb: number[][] }> { return this.json("adj.jgz"); }
  rules(): Promise<Record<string, [number, any]>> { return this.json("rules.jgz"); }

  objectTile(ti: number, x: number, y: number): Promise<any[][]> { return this.json(`otiles/${ti}/${x}_${y}.jgz`); }

  async ref(id: string): Promise<any | undefined> {
    const sh = await this.json(`refs/${fnv1a(id) % this.manifest.shards.refs}.jgz`);
    return sh[id];
  }
  async node(id: string): Promise<any | undefined> {
    const sh = await this.json(`edges/${fnv1a(id) % this.manifest.shards.edges}.jgz`);
    return sh[id];
  }
  async bundle(id: string): Promise<any | undefined> {
    const sh = await this.json(`ent/${fnv1a(id) % this.manifest.shards.ent}.jgz`);
    return sh[id];
  }
  private sdocPrefetch: Promise<void> | null = null;
  /** Every search-document shard, read once in the background with at most four requests in flight (O9: the following
   *  searches then need no network); a failed shard is simply read again when a search needs it. */
  prefetchSdoc(): Promise<void> {
    if (!this.sdocPrefetch) {
      const n = this.manifest.shards.sdoc_files ?? 0;
      let next = 0;
      const lane = async () => {
        while (next < n) {
          const k = next++;
          await this.json(`sdoc/${k}.jgz`).catch(() => undefined);
        }
      };
      this.sdocPrefetch = new Promise((r) => setTimeout(r, 0)).then(() => Promise.all([lane(), lane(), lane(), lane()])).then(() => undefined);
    }
    return this.sdocPrefetch;
  }

  /** rid_map row of the search index with type, label, insight status and whether the element's row exists. */
  async sdoc(rid: number): Promise<[string, string, string | null, string | null, string | null, boolean] | null> {
    const n = this.manifest.shards.sdoc, k = Math.floor(rid / n);
    if (k < 0 || k >= this.manifest.shards.sdoc_files) return null;   // outside rid_map
    const sh = await this.json(`sdoc/${k}.jgz`);
    return sh[rid % n] ?? null;
  }
  /** The indicators of one place (exact service response), or undefined for a place without any (a data gap). */
  async indicators(id: string): Promise<any | undefined> {
    const n = this.manifest.shards.ind;
    if (!n) return undefined;
    const sh = await this.json(`ind/${fnv1a(id) % n}.jgz`);
    return sh[id];
  }
  async raw(rawId: string, locator: string): Promise<[number, any] | undefined> {
    const key = `${rawId}|${locator}`;
    const sh = await this.json(`raw/${fnv1a(key) % this.manifest.shards.raw}.jgz`);
    return sh[key];
  }
}
