"""Load D2 through the standard pipeline and report timings, memory and size (B28, B14)."""

import json
import os
import resource
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from nexum.worlds import d2  # noqa: E402
from nexum.core.pipeline import Nexum  # noqa: E402


def main():
    for p in ("data/d2/nexum.db", "data/d2/nexum.db-wal", "data/d2/nexum.db-shm"):
        if os.path.exists(p):
            os.remove(p)
    shutil.rmtree("data/d2/raw", ignore_errors=True)
    t0 = time.time()
    nx = Nexum(d2(), defer_indexes=True)
    fetch = nx.fetch(mode="backfill")
    t1 = time.time()
    st = nx.process(correlate=False)
    t2 = time.time()
    corr = nx.correlate(None)
    t3 = time.time()
    nx.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    size_before = os.path.getsize("data/d2/nexum.db")
    t4 = time.time()
    compact = nx.compact()
    t5 = time.time()
    c = nx.conn
    counts = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("object", "event", "relation", "event_participant", "evidence", "insight", "edge")}
    no_geo = c.execute("SELECT (SELECT COUNT(*) FROM object WHERE geometry IS NULL) + "
                       "(SELECT COUNT(*) FROM event WHERE geometry IS NULL)").fetchone()[0]
    hubs = c.execute("SELECT entity_id, SUM(count) AS n FROM degree GROUP BY entity_id ORDER BY n DESC LIMIT 10").fetchall()
    out = {"load_s_excluding_generation": round(t2 - t0, 1), "fetch_to_raw_s": round(t1 - t0, 1),
           "materialize_s": round(t2 - t1, 1), "correlate_s": round(t3 - t2, 1), "counts": counts,
           "without_geometry_ratio": round(no_geo / (counts["object"] + counts["event"]), 4),
           "hub_degrees": [r[1] for r in hubs],
           "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024, 1),
           "db_mb_before_compact": round(size_before / 1e6, 1),
           "db_mb": round(os.path.getsize("data/d2/nexum.db") / 1e6, 1), "compact_s": round(t5 - t4, 1),
           "raw_mb": round(nx.raw.size_bytes() / 1e6, 1), "correlation": corr, "process": st}
    print(json.dumps(out, indent=1))
    json.dump(out, open("data/d2/load_report.json", "w"), indent=1)


if __name__ == "__main__":
    main()
