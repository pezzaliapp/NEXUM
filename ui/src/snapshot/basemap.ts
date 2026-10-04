// Compact basemap of the snapshot (nexum.snapshot.build.encode_polygons): the basemap provider's GeoJSON, with its
// 0.01° coordinates stored as zig-zag varint deltas. Decoding returns the identical GeoJSON (same features, same
// coordinates, same keys); about a third of the bytes of the gzip'ed GeoJSON.

export function decodePolygons(b: Uint8Array): any {
  let pos = 0;
  const rd = (): number => {
    let n = 0, mul = 1;
    for (;;) {
      const c = b[pos++];
      n += (c & 0x7f) * mul;
      if (!(c & 0x80)) return n;
      mul *= 128;
    }
  };
  const zz = (n: number) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);
  const ml = rd();
  const meta = JSON.parse(new TextDecoder().decode(b.subarray(pos, pos + ml)));
  pos += ml;
  const feats: any[] = [];
  const nf = rd();
  for (let i = 0; i < nf; i++) {
    const multi = rd();
    const polys: number[][][][] = [];
    const np = rd();
    for (let p = 0; p < np; p++) {
      const poly: number[][][] = [];
      const nr = rd();
      for (let r = 0; r < nr; r++) {
        const ring: number[][] = [];
        let x = 0, y = 0;
        const n = rd();
        for (let k = 0; k < n; k++) {
          x += zz(rd());
          y += zz(rd());
          ring.push([x / 100, y / 100]);
        }
        poly.push(ring);
      }
      polys.push(poly);
    }
    feats.push({ type: "Feature", properties: meta.props[i],
      geometry: multi ? { type: "MultiPolygon", coordinates: polys } : { type: "Polygon", coordinates: polys[0] } });
  }
  const { type, ...rest } = meta.head;
  return { type, features: feats, ...rest };
}
