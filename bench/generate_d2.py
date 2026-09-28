"""D2 generator — deterministic synthetic high-density world (never committed).

200,000 objects · 1,000,000 events · 2,000,000 relations · 30 types · 40 % without geometry ·
10 hub objects with more than 50,000 edges each · ~50,000 planted event pairs for correlation.
Output: JSON Lines chunks of 100,000 records under data/d2/inputs/.
"""

import json
import math
import pathlib
import random
import sys

SEED = 20260928
N_OBJ, N_EVT, N_REL = 200_000, 1_000_000, 2_000_000
N_HUB, N_PAIRS, CHUNK = 10, 50_000, 100_000
T0 = 1_483_228_800_000          # 2017-01-01
SPAN = 10 * 365 * 86_400_000    # 10 years


def ident(i):
    return {"type": None, "scheme": "sid", "value": i}


def main(out_dir="data/d2/inputs"):
    rnd = random.Random(SEED)
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("chunk_*.jsonl"):
        f.unlink()
    centers = [(rnd.uniform(-170, 170), rnd.uniform(-60, 70)) for _ in range(500)]
    buf, chunk = [], 0

    def emit(rec):
        nonlocal buf, chunk
        buf.append(json.dumps(rec, separators=(",", ":")))
        if len(buf) == CHUNK:
            (out / f"chunk_{chunk:03d}.jsonl").write_text("\n".join(buf) + "\n")
            buf, chunk = [], chunk + 1

    def point():
        cx, cy = centers[rnd.randrange(len(centers))]
        lon = max(-179.9, min(179.9, rnd.gauss(cx, 1.5)))
        lat = max(-89.0, min(89.0, rnd.gauss(cy, 1.0)))
        return {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]}

    obj_type = []
    for i in range(N_OBJ):
        t = i % 10 if i >= N_HUB else 0          # hubs are syn.o00 (with geometry)
        obj_type.append(t)
        rec = {"kind": "object", "type": f"syn.o{t:02d}", "id": f"O{i:06d}", "label": f"Oggetto {i:06d}",
               "identifiers": [["sid", f"O{i:06d}"]], "properties": {"v": round(rnd.random(), 4)}}
        if t < 6:
            rec["geometry"] = point()
            rec["u"] = 1000.0
        emit(rec)
    pairs = 0
    for i in range(N_EVT):
        if pairs < N_PAIRS and i % 20 == 1:
            # planted pair: syn.e02 then syn.e01 nearby (correlation benchmark)
            g = point()
            t = T0 + rnd.randrange(SPAN)
            a = {"kind": "event", "type": "syn.e02", "id": f"E{i:07d}", "label": f"Evento {i:07d}",
                 "identifiers": [["sid", f"E{i:07d}"]], "t_ms": t, "properties": {"v": round(rnd.random(), 4)},
                 "geometry": g, "u": 500.0,
                 "assertions": [{"kind": "participation", "type": "at",
                                 "target": {"type": "syn.o00", "scheme": "sid", "value": f"O{rnd.randrange(N_HUB):06d}"}}]}
            emit(a)
            lon, lat = g["coordinates"]
            b = dict(a, type="syn.e01", id=f"E{i:07d}b", label=f"Evento {i:07d}b", identifiers=[["sid", f"E{i:07d}b"]],
                     t_ms=t + rnd.randrange(2 * 3_600_000),
                     geometry={"type": "Point", "coordinates": [round(lon + rnd.uniform(-0.05, 0.05), 5),
                                                                round(lat + rnd.uniform(-0.05, 0.05), 5)]})
            emit(b)
            pairs += 1
            continue
        # 40 % of all elements (objects + events) without geometry: 80,000 objects are non-geographic and the
        # 100,000 planted events are geographic, so 420,000 of the remaining 950,000 events must be non-geographic
        if rnd.random() < 420_000 / 950_000:
            t_idx = 12 + rnd.randrange(8)
        else:
            t_idx = rnd.choice([0] + list(range(3, 12)))
        rec = {"kind": "event", "type": f"syn.e{t_idx:02d}", "id": f"E{i:07d}", "label": f"Evento {i:07d}",
               "identifiers": [["sid", f"E{i:07d}"]], "t_ms": T0 + rnd.randrange(SPAN),
               "properties": {"v": round(rnd.random(), 4)}}
        if t_idx < 12:
            rec["geometry"] = point()
            rec["u"] = 500.0
        # 60 % of events relate to one of the 10 hubs: hubs get more than 50,000 edges each
        if rnd.random() < 0.6:
            tgt, ttype = f"O{rnd.randrange(N_HUB):06d}", "syn.o00"
        else:
            j = rnd.randrange(N_HUB, N_OBJ)
            tgt, ttype = f"O{j:06d}", f"syn.o{obj_type[j]:02d}"
        rec["assertions"] = [{"kind": "participation", "type": "at" if t_idx < 12 else "about",
                              "target": {"type": ttype, "scheme": "sid", "value": tgt}}]
        emit(rec)
    seen = set()
    n = 0
    while n < N_REL:
        a, b = rnd.randrange(N_OBJ), rnd.randrange(N_OBJ)
        r = rnd.randrange(10)
        if a == b or (r, a, b) in seen:
            continue
        seen.add((r, a, b))
        emit({"kind": "relation", "type": f"syn.r{r:02d}", "id": f"R{n:07d}",
              "subject": {"type": f"syn.o{obj_type[a]:02d}", "scheme": "sid", "value": f"O{a:06d}"},
              "object": {"type": f"syn.o{obj_type[b]:02d}", "scheme": "sid", "value": f"O{b:06d}"}})
        n += 1
    if buf:
        (out / f"chunk_{chunk:03d}.jsonl").write_text("\n".join(buf) + "\n")
        chunk += 1
    print({"objects": N_OBJ, "events": N_EVT + pairs, "relations": N_REL, "chunks": chunk, "planted_pairs": pairs})


if __name__ == "__main__":
    main(*sys.argv[1:])
