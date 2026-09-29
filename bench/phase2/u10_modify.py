"""U10 helper: ingest 1,000 modifications into a CLONE of D2 (APFS `cp -c`), exactly as benchmark B25 does.
    python3 bench/phase2/u10_modify.py clone <dir>     # clone data/d2 into <dir>
    python3 bench/phase2/u10_modify.py modify <dir>    # 1,000 event updates through the pipeline (writes the clone)
"""

import dataclasses
import json
import pathlib
import random
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from nexum import worlds  # noqa: E402
from nexum.core.pipeline import Nexum  # noqa: E402


def clone(d):
    d = pathlib.Path(d)
    d.mkdir(parents=True, exist_ok=True)
    for name in ("nexum.db", "raw"):
        subprocess.run(["cp", "-c", "-R", str(ROOT / "data" / "d2" / name), str(d / name)], check=True)


def modify(d):
    d = pathlib.Path(d)
    cfg = dataclasses.replace(worlds.d2(), db_path=str(d / "nexum.db"), raw_dir=str(d / "raw"))
    nx = Nexum(cfg)
    rows = [r[0] for r in nx.conn.execute("SELECT native_id FROM record WHERE kind='event' AND type='syn.e05' "
                                          "ORDER BY record_id LIMIT 20000")]
    ids = random.Random(10).sample(rows, 1000)
    recs = [json.dumps({"kind": "event", "type": "syn.e05", "id": e, "label": f"Evento aggiornato U10 {i}",
                        "identifiers": [["sid", e]], "t_ms": 1_600_000_000_000 + i, "version": "3",
                        "properties": {"v": 0.98}}) for i, e in enumerate(ids)]
    blob = ("\n".join(recs) + "\n").encode()
    sha, rel = nx.raw.put(blob)
    nx.conn.execute("INSERT INTO raw_record VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    ("01BENCHU10ZZZZZZZZZZZZZZZZ", "fixture.scale", sha, "gzip", len(blob), "file:///u10", "u10",
                     int(time.time() * 1000), 200, None, None, None, rel))
    st = nx.process(correlate=False)
    v = nx.conn.execute("SELECT value FROM meta WHERE key='world_version'").fetchone()[0]
    nx.close()
    print(json.dumps({"world_version": int(v), "processed": {k: st[k] for k in list(st)[:5]}}, default=str))


if __name__ == "__main__":
    {"clone": clone, "modify": modify}[sys.argv[1]](sys.argv[2])
