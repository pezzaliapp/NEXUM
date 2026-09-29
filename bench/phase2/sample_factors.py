"""W21 fixture: 1,000 stored confidence decompositions sampled (fixed seed) from D1, D2 and D3, with the Core's
recomputed value. The TypeScript formula must reproduce each one (ui/tests/unit/confidence.test.ts)."""

import json
import pathlib
import random
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from nexum.core import confidence as cf  # noqa: E402

OUT = ROOT / "data" / "reports" / "phase2" / "factors.json"


def main():
    rnd = random.Random(20260929)
    pools = {}
    for world in ("d1", "d2", "d3"):
        conn = sqlite3.connect((ROOT / "data" / world / "nexum.db").resolve().as_uri() + "?mode=ro", uri=True)
        rows = []
        for table in ("object", "event", "relation", "insight", "evidence"):
            col = "weight" if table == "evidence" else "confidence"
            rows += [(table, v, f) for v, f in conn.execute(
                f"SELECT {col}, factors_json FROM {table} WHERE factors_json IS NOT NULL LIMIT 3000")]
        pools[world] = [r for r in rows if any(k in json.loads(r[2]) for k in ("p", "g", "method"))]
    take = {"d3": min(200, len(pools["d3"]))}
    take["d1"] = (1000 - take["d3"]) // 2
    take["d2"] = 1000 - take["d3"] - take["d1"]
    out = []
    for world in ("d1", "d2", "d3"):
        for table, v, f in rnd.sample(pools[world], take[world]):
            fac = json.loads(f)
            out.append({"world": world, "table": table, "factors": fac, "expanded": cf.expand(fac),
                        "core": cf.recompute(fac), "stored": v})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out))
    print(f"{len(out)} factor decompositions → {OUT}")


if __name__ == "__main__":
    main()
