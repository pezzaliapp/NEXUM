"""NEXUM MCP server (OSIRIS baseline, 2026-10-04): the stdio protocol, read-only tools, errors said in the result."""

import json
import subprocess
import sys

from tests.conftest import ROOT


def run(lines, world="d1"):
    p = subprocess.run([sys.executable, "-m", "nexum.mcp", world], input="\n".join(json.dumps(x) for x in lines) + "\n",
                       capture_output=True, text=True, cwd=ROOT, timeout=120)
    return [json.loads(l) for l in p.stdout.splitlines() if l.strip()]


def test_mcp_initialize_list_and_call():
    out = run([{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
               {"jsonrpc": "2.0", "method": "notifications/initialized"},
               {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
               {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "search", "arguments": {"q": "Mandalay", "max_items": 5}}},
               {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "table", "arguments": {"name": "nope"}}},
               {"jsonrpc": "2.0", "id": 5, "method": "nope"}])
    assert [m["id"] for m in out] == [1, 2, 3, 4, 5]              # the notification has no answer
    assert out[0]["result"]["serverInfo"]["name"] == "nexum"
    assert {t["name"] for t in out[1]["result"]["tools"]} == {"search", "entity", "relations", "timeline", "evidence", "table"}
    body = json.loads(out[2]["result"]["content"][0]["text"])
    assert out[2]["result"]["isError"] is False and body["data"]["groups"]
    eid = body["data"]["groups"][0]["items"][0]["id"]
    assert out[3]["result"]["isError"] is True                    # unknown table: said, not raised
    assert out[4]["error"]["code"] == -32601
    ev = run([{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "evidence", "arguments": {"id": eid}}}])
    assert ev[0]["result"]["isError"] is False and json.loads(ev[0]["result"]["content"][0]["text"])["data"]["items"]
