"""LRU cache of serialized responses, keyed by request and world_version."""

import threading
from collections import OrderedDict


class ResponseCache:
    def __init__(self, max_items=256, max_bytes=64 * 1024 * 1024):
        self.max_items, self.max_bytes = max_items, max_bytes
        self._d: OrderedDict = OrderedDict()
        self._bytes = 0
        self._lock = threading.Lock()
        self.hits = self.misses = 0

    def get(self, key):
        with self._lock:
            v = self._d.get(key)
            if v is None:
                self.misses += 1
                return None
            self._d.move_to_end(key)
            self.hits += 1
            return v

    def put(self, key, body: bytes):
        if len(body) > self.max_bytes // 8:
            return
        with self._lock:
            if key in self._d:
                self._bytes -= len(self._d.pop(key))
            self._d[key] = body
            self._bytes += len(body)
            while len(self._d) > self.max_items or self._bytes > self.max_bytes:
                _, old = self._d.popitem(last=False)
                self._bytes -= len(old)
