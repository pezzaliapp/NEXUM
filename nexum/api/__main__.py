"""python3 -m nexum.api serve <world> [--port 8765] [--ui ui/dist]"""

import argparse
import os
import pathlib
import signal

from nexum import worlds

from .server import Service, serve

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORLDS = ("d1", "d2", "d3", "mixed", "d3s", "ubench", "live")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="nexum.api")
    ap.add_argument("command", choices=["serve"])
    ap.add_argument("world", choices=WORLDS)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--ui", default=str(ROOT / "ui" / "dist"))
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--no-cache", action="store_true", help="disable the response cache (API benchmarks)")
    ap.add_argument("--mmap-mb", type=int, default=int(os.environ.get("NEXUM_MMAP_MB", "1024")),
                    help="SQLite memory-mapped I/O per Core worker, MB (0 = off)")
    a = ap.parse_args(argv)
    cfg = getattr(worlds, a.world)()
    svc = Service(cfg, a.world, ui_dir=a.ui, workers=a.workers, response_cache=not a.no_cache,
                  mmap_bytes=a.mmap_mb * 1024 * 1024)
    httpd = serve(svc, a.host, a.port, a.verbose)
    print(f"NEXUM {a.world} → http://{a.host}:{a.port}/", flush=True)
    # SIGTERM/SIGHUP end the service as CTRL-C does: through the finally below, which closes the worker processes
    # (without it the default action ends this process at once and its workers are never told)
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, _stop)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        svc.close()


def _stop(signum, frame):
    for sig in (signal.SIGTERM, signal.SIGHUP):   # a repeated signal must not cut the closing short
        signal.signal(sig, signal.SIG_IGN)
    raise KeyboardInterrupt


if __name__ == "__main__":
    main()
