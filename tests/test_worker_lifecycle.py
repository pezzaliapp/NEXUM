"""P0 (2026-10-04): no worker process outlives the service that started it, and none keeps running past its request's
deadline. Root cause reproduced: a worker busy in pure Python (D2 /insight-summaries: the Core's byte budget halving
small lists inside 50,000 summaries, re-serializing at each cut) never read its pipe, so a service ended by SIGTERM
left it adopted by launchd at 100% CPU. Every check is on the pids this test started, never a kill by name."""

import os
import signal
import socket
import subprocess
import sys
import time

import pytest

from nexum import worlds
from tests.conftest import ROOT

HARNESS = ROOT / "tests" / "proc_harness.py"
pytestmark = pytest.mark.skipif(not os.path.exists(worlds.d1().db_path), reason="D1 world not built")


def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    # a zombie is gone for every purpose but the process table
    st = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    return bool(st) and not st.startswith("Z")


def gone_within(pids, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if not any(alive(p) for p in pids):
            return True
        time.sleep(0.2)
    return not any(alive(p) for p in pids)


def children(pid):
    out = subprocess.run(["pgrep", "-P", str(pid)], capture_output=True, text=True).stdout
    return [int(x) for x in out.split()]


def reap(pids):   # test hygiene only, on this test's own pids, if an assertion failed
    for p in pids:
        try:
            os.kill(p, signal.SIGKILL)
        except ProcessLookupError:
            pass


@pytest.mark.parametrize("sig", [signal.SIGKILL, signal.SIGTERM])
def test_a_busy_worker_ends_with_its_parent(sig):
    """The parent ends while its worker is inside a request that never reads the pipe (worst case SIGKILL: no
    cleanup code runs at all). Before the fix the worker kept spinning, PPID 1."""
    p = subprocess.Popen([sys.executable, str(HARNESS), "busy"], stdout=subprocess.PIPE, text=True, cwd=ROOT)
    pids = [p.pid]
    try:
        worker = int(p.stdout.readline())
        pids += children(p.pid) + [worker]
        time.sleep(1.0)                                   # the worker is spinning
        assert alive(worker)
        os.kill(p.pid, sig)
        p.wait(timeout=10)
        assert gone_within([worker], 5), "orphan worker still running"
        assert gone_within(pids, 5), [x for x in pids if alive(x)]
    finally:
        reap(pids)


def test_a_request_past_its_deadline_is_stopped_and_the_worker_replaced():
    out = subprocess.run([sys.executable, str(HARNESS), "overrun"], capture_output=True, text=True, cwd=ROOT, timeout=60)
    lines = out.stdout.split("\n")
    first = int(lines[0])
    old, new, usable, *outcome = lines[1].split(" ")
    assert int(old) == first and int(new) != first and usable == "True"
    assert outcome[0] == "interrupted" and "reason=deadline" in lines[1]
    assert float(outcome[2].rstrip("s")) < 0.5 + 5 + 2                  # deadline + overrun allowance, not forever
    assert gone_within([int(old), int(new)], 5)


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.mark.parametrize("sig", [signal.SIGTERM, signal.SIGINT, signal.SIGHUP])
def test_the_service_closes_its_workers_on_a_signal(sig):
    port = free_port()
    p = subprocess.Popen([sys.executable, "-m", "nexum.api", "serve", "d1", "--port", str(port), "--workers", "2"],
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, cwd=ROOT)
    pids = [p.pid]
    try:
        assert "NEXUM d1" in p.stdout.readline()
        kids = children(p.pid)
        pids += kids
        assert len(kids) >= 2                              # 2 workers (+ the resource tracker)
        os.kill(p.pid, sig)
        assert p.wait(timeout=15) is not None
        assert gone_within(kids, 5), [x for x in kids if alive(x)]
    finally:
        reap(pids)
