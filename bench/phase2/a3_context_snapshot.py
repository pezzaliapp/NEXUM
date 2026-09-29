"""A3 evidence: snapshot of context() outputs (and of the two optimized sections called directly) for a fixed set of
elements, to prove the Core optimization leaves the logical output identical.
    python3 bench/phase2/a3_context_snapshot.py <out.json>"""

import hashlib
import json
import pathlib
import sqlite3
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from nexum import worlds  # noqa: E402
from nexum.core import db as dbm  # noqa: E402
from nexum.core.query import Query  # noqa: E402
from nexum.core.registry import load_registry  # noqa: E402

FX = json.loads((ROOT / "bench" / "phase2" / "fixtures.json").read_text())


def strip(env):
    env = dict(env)
    env.pop("timing_ms", None)
    return env


def main(out):
    res = {}
    for world, ids in (("d2", FX["d2_hubs"] + FX["pivots_d2"]),
                       ("d1", FX["pivots_d1"] + list(FX["myanmar"].values())),
                       ("d3", None)):
        cfg = getattr(worlds, world)()
        conn = dbm.connect(cfg.db_path)
        q = Query(conn, load_registry([ROOT / d for d in cfg.source_dirs]))
        if ids is None:
            ids = [r[0] for r in conn.execute("SELECT object_id FROM object UNION ALL SELECT event_id FROM event "
                                              "UNION ALL SELECT insight_id FROM insight ORDER BY 1")]
        for i in ids:
            t = time.perf_counter()
            ctx = strip(q.context(i))
            ms = (time.perf_counter() - t) * 1000
            extra = {}
            if not i.startswith("rel_"):
                extra = {"related_events": strip(q.related_events(i, None, {"max_items": 500})),
                         "entity_timeline": strip(q.entity_timeline(i, None, {"max_items": 500})),
                         "related_events_scoped": strip(q.related_events(i, {"min_confidence": 0.5,
                                                                              "time_window": [1500000000000, 1700000000000]},
                                                                         {"max_items": 50}, cursor="3"))}
            blob = json.dumps({"context": ctx, **extra}, sort_keys=True, default=str)
            res[f"{world}:{i}"] = {"sha256": hashlib.sha256(blob.encode()).hexdigest(), "context_ms": round(ms, 1)}
        conn.close()
    pathlib.Path(out).write_text(json.dumps(res, indent=1))
    print(len(res), "elements snapshotted →", out)


if __name__ == "__main__":
    main(sys.argv[1])
