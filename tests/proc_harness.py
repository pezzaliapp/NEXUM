"""Harness for tests/test_worker_lifecycle.py: a service-side parent with one worker process kept busy in pure Python
(the case the SQLite progress handler cannot interrupt). With the spawn start method the worker imports this file as
its main module, so the operation registered below exists in the worker too.

    python3 tests/proc_harness.py busy       → prints the worker pid, then waits on a request that never ends
    python3 tests/proc_harness.py overrun    → a request with a 0.5 s deadline: prints old pid, new pid, outcome
"""

import json
import multiprocessing
import pathlib
import sqlite3
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from nexum import worlds  # noqa: E402
from nexum.api import server  # noqa: E402
from nexum.api.cancel import CancelRegistry  # noqa: E402


def spin(q):
    big = {"x": [list(range(50)) for _ in range(2000)]}
    while True:   # serialization only: no SQLite statement, so no progress handler call
        json.dumps(big)


server.API_OPS["spin"] = spin


def main(mode):
    cfg = worlds.d1()
    root = pathlib.Path(cfg.root)
    reg = CancelRegistry()
    w = server.ProcWorker(multiprocessing.get_context("spawn"), cfg.db_path, [str(root / d) for d in cfg.source_dirs],
                          reg, 4096, 0)
    w.q._world_version()                                   # the worker is up
    print(w.proc.pid, flush=True)
    if mode == "busy":
        w.call("spin", (), {})                             # never returns: the test ends this process
    elif mode == "overrun":
        old = w.proc.pid
        w.token = reg.register("t", 1, 0.5)
        t0 = time.monotonic()
        try:
            w.call("spin", (), {})
            outcome = "returned"
        except sqlite3.OperationalError as e:
            outcome = f"{e} after {time.monotonic() - t0:.1f}s reason={w.token.reason}"
        w.token = None
        print(old, w.proc.pid, w.q._world_version() is not None, outcome, flush=True)
        w.close()


if __name__ == "__main__":
    main(sys.argv[1])
