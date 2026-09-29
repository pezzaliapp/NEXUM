"""Cancellation of obsolete queries.

Every request belongs to a channel (map, timeline, search, graph, …) and
carries an increasing sequence number. When a newer request arrives on the
same channel, older ones are interrupted through SQLite's progress handler;
every request is also interrupted at its deadline.
"""

import multiprocessing
import threading
import time
from collections import deque

SLOTS = 4096   # channels are mapped to slots of a shared array read by the worker processes


class Token:
    __slots__ = ("channel", "seq", "deadline", "reason", "slot", "interrupted_at")

    def __init__(self, channel, seq, deadline, slot=-1):
        self.channel, self.seq, self.deadline, self.reason, self.slot = channel, seq, deadline, None, slot
        self.interrupted_at = None


class Superseded(Exception):
    pass


class CancelRegistry:
    def __init__(self):
        self._lock = threading.Lock()
        self.shared = multiprocessing.Array("q", SLOTS, lock=False)   # latest seq per slot, read by the workers
        for i in range(SLOTS):
            self.shared[i] = -1
        self._slot: dict[str, int] = {}
        self._next_slot = 0
        self._latest: dict[str, int] = {}
        self._arrivals: dict[str, deque] = {}           # channel → (seq, arrival time), recent requests
        self.stats = {"requests": 0, "superseded_interrupted": 0, "superseded_not_started": 0,
                      "superseded_completed": 0, "deadline": 0}
        self.latencies_ms = deque(maxlen=2000)          # newer arrival → older interruption

    def register(self, channel, seq, deadline_s) -> Token:
        now = time.monotonic()   # system-wide clock: comparable with the worker processes' timestamps
        slot = -1
        with self._lock:
            self.stats["requests"] += 1
            if channel and seq is not None:
                slot = self._slot.get(channel, -1)
                if slot < 0:
                    slot = self._slot[channel] = self._next_slot
                    self._next_slot = (self._next_slot + 1) % SLOTS
                    self.shared[slot] = -1
                if seq > self._latest.get(channel, -1):
                    self._latest[channel] = seq
                    self.shared[slot] = seq
                self._arrivals.setdefault(channel, deque(maxlen=256)).append((seq, now))
                if len(self._latest) > 4096:        # page sessions come and go: forget the oldest channels
                    for k in list(self._latest)[:2048]:
                        self._latest.pop(k, None)
                        self._arrivals.pop(k, None)
                        self._slot.pop(k, None)
        return Token(channel, seq, now + deadline_s, slot)

    def superseded(self, tok: Token) -> bool:
        if not tok.channel or tok.seq is None:
            return False
        return self._latest.get(tok.channel, -1) > tok.seq

    def check(self, tok: Token) -> bool:
        """True if the running query must stop (called by the SQLite progress handler)."""
        if self.superseded(tok):
            tok.reason = "superseded"
            return True
        if time.monotonic() > tok.deadline:
            tok.reason = "deadline"
            return True
        return False

    def interrupted(self, tok: Token, at=None):
        now = at if at is not None else time.monotonic()
        with self._lock:
            if tok.reason == "superseded":
                self.stats["superseded_interrupted"] += 1
                newer = [t for s, t in self._arrivals.get(tok.channel, ()) if s > tok.seq]
                if newer:
                    self.latencies_ms.append((now - min(newer)) * 1000)
            elif tok.reason == "deadline":
                self.stats["deadline"] += 1

    def count(self, key):
        with self._lock:
            self.stats[key] += 1

    def snapshot(self):
        with self._lock:
            return dict(self.stats, cancel_latency_ms=list(self.latencies_ms))
