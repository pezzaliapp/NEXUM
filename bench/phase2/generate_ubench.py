"""UI-benchmark world (U4, U5, U6): deterministic synthetic fixture, separate from the functional datasets D1/D2/D3.
It creates exactly the load that the frozen UI benchmarks declare; it changes neither the Core nor the UI.

  U4  4,500 points inside a 3.0° × 1.8° rectangle (centre 12°E 41.5°N), fully inside the map view of the 1440 × 900
      workspace at MapLibre zoom 7 (Core z 10, ≈ 4.5° × 2.6° at that latitude) — plus 20,000 background points.
  U5  hub H: 60 'ub.link' children and 5,000 'ub.mention' targets (a group larger than the per-group limit → hub
      summary). Children link to a pool of 1,838 nodes (3,839 distinct links, ≤ 64 per child). The Core's depth-2
      neighbourhood at maximum budget holds 1 + 60 + 100 + 1,838 = 1,999 nodes and 60 + 100 + 3,839 = 3,999 edges
      plus one aggregate node: the workspace renders exactly 2,000 nodes and 4,000 edges (aggregate included).
  U6  3 events in every one of 400 consecutive years (1625–2024): with the Core's automatic bucketing
      (> 3 years → year) the whole-extent timeline has exactly 400 buckets.
Output: data/ubench/inputs/chunk_000.jsonl
"""

import json
import pathlib
import random
import sys
from datetime import datetime, timezone

SEED = 20260929
CENTER = (12.0, 41.5)


def main(out_dir="data/ubench/inputs"):
    rnd = random.Random(SEED)
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    recs = []

    def obj(i, typ, label, geom=None):
        r = {"kind": "object", "type": typ, "id": i, "label": label, "identifiers": [["sid", i]],
             "properties": {"v": round(rnd.random(), 4)}}
        if geom:
            r["geometry"], r["u"] = {"type": "Point", "coordinates": geom}, 100.0
        recs.append(r)

    def rel(n, typ, a, b):
        recs.append({"kind": "relation", "type": typ, "id": f"R{n:06d}",
                     "subject": {"type": "ub.node", "scheme": "sid", "value": a},
                     "object": {"type": "ub.node", "scheme": "sid", "value": b}})

    # U4 — dense area + background
    for i in range(4500):
        obj(f"P{i:05d}", "ub.pt", f"Punto denso {i:05d}",
            [round(CENTER[0] - 1.5 + 3.0 * rnd.random(), 5), round(CENTER[1] - 0.9 + 1.8 * rnd.random(), 5)])
    for i in range(20000):
        obj(f"B{i:05d}", "ub.pt", f"Punto {i:05d}", [round(rnd.uniform(-179, 179), 5), round(rnd.uniform(-60, 75), 5)])
    # U5 — graph with a hub summary
    obj("H", "ub.node", "Hub sintetico")
    n = 0
    children = [f"C{i:02d}" for i in range(60)]
    pool = [f"G{i:04d}" for i in range(1838)]
    for c in children:
        obj(c, "ub.node", f"Nodo {c}")
        rel(n, "ub.link", "H", c)
        n += 1
    for g in pool:
        obj(g, "ub.node", f"Nodo {g}")
    links = [set() for _ in children]
    for j in range(len(pool)):                    # every pool node is reached by one child
        links[j % 60].add(j)
    k = 0
    while sum(len(x) for x in links) < 3839:      # deterministic cross links up to 64 per child
        ci = k % 60
        j = (ci * 131 + k * 37) % len(pool)
        if len(links[ci]) < 64:
            links[ci].add(j)
        k += 1
    for ci, c in enumerate(children):
        for j in sorted(links[ci]):
            rel(n, "ub.link", c, pool[j])
            n += 1
    for m in range(5000):
        obj(f"M{m:04d}", "ub.node", f"Menzione {m:04d}")
        rel(n, "ub.mention", "H", f"M{m:04d}")
        n += 1
    # U6 — 400 consecutive years of events
    obj("T", "ub.node", "Serie temporale sintetica")
    for year in range(1625, 2025):
        for k in range(3):
            t = int(datetime(year, 1 + 4 * k, 15, tzinfo=timezone.utc).timestamp() * 1000)
            recs.append({"kind": "event", "type": "ub.tick", "id": f"E{year}{k}", "label": f"Evento {year}/{k}",
                         "identifiers": [["sid", f"E{year}{k}"]], "t_ms": t, "properties": {"v": round(rnd.random(), 4)},
                         "assertions": [{"kind": "participation", "type": "about",
                                         "target": {"type": "ub.node", "scheme": "sid", "value": "T"}}]})
    (out / "chunk_000.jsonl").write_text("\n".join(json.dumps(r, separators=(",", ":")) for r in recs) + "\n")
    print({"records": len(recs), "relations": n})


if __name__ == "__main__":
    main(*sys.argv[1:])
