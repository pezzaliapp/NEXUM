"""NEXUM command line.

    python3 -m nexum.cli <world> registry-check
    python3 -m nexum.cli <world> fetch [--mode incremental|backfill] [--source ID ...]
    python3 -m nexum.cli <world> process
    python3 -m nexum.cli <world> correlate
    python3 -m nexum.cli <world> rebuild
    python3 -m nexum.cli <world> query <operation> '<json kwargs>'
    python3 -m nexum.cli <world> attributions

<world> is one of: d1, d3, mixed, d2, d3s, live.
"""

import argparse
import json
import sys

from nexum import worlds as configs
from nexum.core.pipeline import Nexum, rebuild
from nexum.core.query import Query, attributions
from nexum.core.registry import admissible, verification_warnings

OPERATIONS = ("get_entity", "context", "relations", "related_events", "related_objects", "neighborhood", "expand",
              "path", "project_map", "project_timeline", "entity_timeline", "timeline_neighbors", "timeline_step",
              "nearby", "containing", "contained", "search", "facets", "insights", "get_insight", "evidence_of",
              "supported", "sources_of", "provenance_chain", "list_sources", "list_types", "locate", "changes_since",
              "trail_context", "list_entities")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="nexum")
    ap.add_argument("world", choices=["d1", "d3", "mixed", "d2", "d3s", "live"])
    ap.add_argument("command", choices=["registry-check", "fetch", "process", "correlate", "rebuild", "query",
                                        "attributions"])
    ap.add_argument("args", nargs="*")
    ap.add_argument("--mode", default="incremental", choices=["incremental", "backfill"])
    ap.add_argument("--source", action="append")
    a = ap.parse_args(argv)
    cfg = getattr(configs, a.world)()
    if a.command == "rebuild":
        nx = rebuild(cfg, cfg.db_path + ".rebuild")
        print(json.dumps({"rebuilt": cfg.db_path + ".rebuild"}))
        return
    nx = Nexum(cfg)
    if a.command == "registry-check":
        out = {s.id: admissible(s, allow_fixture=cfg.allow_fixture) for s in nx.sources.values()}
        print(json.dumps({"admissible": out, "warnings": verification_warnings(nx.sources.values())}, indent=1))
    elif a.command == "fetch":
        print(json.dumps(nx.fetch(a.source, mode=a.mode), indent=1))
    elif a.command == "process":
        print(json.dumps(nx.process(), indent=1, default=str))
    elif a.command == "correlate":
        print(json.dumps(nx.correlate(None), indent=1))
    elif a.command == "attributions":
        print(json.dumps(attributions(nx.conn, nx.sources), indent=1, ensure_ascii=False))
    elif a.command == "query":
        if not a.args or a.args[0] not in OPERATIONS:
            sys.exit(f"operation must be one of: {', '.join(OPERATIONS)}")
        kwargs = json.loads(a.args[1]) if len(a.args) > 1 else {}
        q = Query(nx.conn, nx.sources)
        print(json.dumps(getattr(q, a.args[0])(**kwargs), indent=1, ensure_ascii=False, default=str))
    nx.close()


if __name__ == "__main__":
    main()
