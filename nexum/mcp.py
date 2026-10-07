"""NEXUM MCP SERVER (OSIRIS baseline, 2026-10-04): the Model Context Protocol over stdio, so a local AI client can read
the NEXUM world the way the workspace does — search, an element with its sources, its connections, its timeline, its
evidence, the published tables. Read-only, local (the same in-process read model as the snapshot builder: no network,
no port, no key, no account). Nothing is written, nothing leaves the machine except what the client itself sends on.

    python3 -m nexum.mcp live            (world: live, d1, d2, d3, mixed…)

JSON-RPC 2.0, one message per line (MCP stdio transport); methods: initialize, ping, tools/list, tools/call."""

import json
import sys

PROTOCOL = "2025-06-18"
TOOLS = [
    {"name": "search", "description": "Search the NEXUM world (places, events, objects, connections). Returns groups of matches with their IDs.",
     "inputSchema": {"type": "object", "properties": {"q": {"type": "string"}, "types": {"type": "array", "items": {"type": "string"}},
                                                        "max_items": {"type": "integer", "default": 20}}, "required": ["q"]}},
    {"name": "entity", "description": "One element by ID (obj_…, evt_…, rel_…, ins_…): its type, label, properties, confidence and sources.",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}},
    {"name": "relations", "description": "The connections of an element, grouped by relation type, each with the element at the other end.",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}},
    {"name": "timeline", "description": "The dated entries (events, changes) around an element.",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}},
    {"name": "evidence", "description": "The evidence (source records) that supports an element or a relation.",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}},
    {"name": "table", "description": "A table a source publishes as is: orbits, hotspots, newsevents, sanctions, kev, oui, torexits, spaceweather, commodities.",
     "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}, "max_rows": {"type": "integer", "default": 200}}, "required": ["name"]}},
]


class Server:
    def __init__(self, world="live"):
        from nexum.snapshot.service import LocalService   # the read model of the snapshot builder (in-process)
        self.ls = LocalService(world)
        self.world = world

    def call(self, name, a):
        g = self.ls.get
        if name == "search":
            s = {"types": a["types"]} if a.get("types") else None
            return g("/search", {"q": a["q"], "s": s, "b": {"max_items": int(a.get("max_items", 20))}})
        if name == "entity":
            return g(f"/entities/{a['id']}")
        if name in ("relations", "timeline", "evidence"):
            return g(f"/entities/{a['id']}/{name}")
        if name == "table":
            st, body = g(f"/tables/{a['name']}")
            if st == 200:
                d = body["data"]
                d["rows_total"] = len(d.get("rows", []))
                d["rows"] = d.get("rows", [])[: int(a.get("max_rows", 200))]
            return st, body
        return 404, {"error": {"code": "unknown_tool", "message": name}}

    def handle(self, msg):
        mid, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
        if method == "initialize":
            res = {"protocolVersion": PROTOCOL, "capabilities": {"tools": {"listChanged": False}},
                   "serverInfo": {"name": "nexum", "version": "0.1.0"},
                   "instructions": f"NEXUM world '{self.world}', read-only. Facts carry their sources: cite them; say 'not in NEXUM' when a fact is missing."}
        elif method == "ping":
            res = {}
        elif method == "tools/list":
            res = {"tools": TOOLS}
        elif method == "tools/call":
            try:
                st, body = self.call(params.get("name"), params.get("arguments") or {})
                res = {"content": [{"type": "text", "text": json.dumps(body, ensure_ascii=False)}], "isError": st >= 400}
            except Exception as e:   # a bad argument is the client's error, said in the result
                res = {"content": [{"type": "text", "text": f"{type(e).__name__}: {e}"}], "isError": True}
        elif mid is None:
            return None                                      # a notification (e.g. notifications/initialized)
        else:
            return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"method not found: {method}"}}
        return {"jsonrpc": "2.0", "id": mid, "result": res}


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    srv = Server(argv[0] if argv else "live")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            out = srv.handle(json.loads(line))
        except json.JSONDecodeError:
            out = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "parse error"}}
        if out is not None:
            sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
