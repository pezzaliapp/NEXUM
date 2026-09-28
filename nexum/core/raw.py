"""Raw Store: immutable, content-addressed payloads plus an append-only manifest.

The manifest lets the whole world be rebuilt even if the database is deleted.
"""

import gzip
import json
import pathlib
import threading

from .ids import sha256_hex

CODEC = "gzip"


class RawStore:
    def __init__(self, root):
        self.root = pathlib.Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.manifest = self.root / "manifest.jsonl"
        self._lock = threading.Lock()

    def path_for(self, sha: str) -> pathlib.Path:
        return self.root / sha[:2] / sha[2:4] / f"{sha}.gz"

    def put(self, data: bytes) -> tuple[str, str]:
        """Store bytes; never rewrites an existing file. Returns (sha256, relative path)."""
        sha = sha256_hex(data)
        p = self.path_for(sha)
        if not p.exists():
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_suffix(".tmp")
            with open(tmp, "wb") as raw_fh, gzip.GzipFile(fileobj=raw_fh, mode="wb", compresslevel=6, mtime=0) as fh:
                fh.write(data)
            tmp.replace(p)
        return sha, str(p.relative_to(self.root))

    def get(self, sha: str) -> bytes:
        with gzip.open(self.path_for(sha), "rb") as fh:
            data = fh.read()
        if sha256_hex(data) != sha:
            raise IOError(f"raw payload {sha} failed integrity check")
        return data

    def append_manifest(self, entry: dict) -> None:
        with self._lock, open(self.manifest, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, sort_keys=True) + "\n")

    def read_manifest(self) -> list[dict]:
        if not self.manifest.exists():
            return []
        with open(self.manifest, encoding="utf-8") as fh:
            return [json.loads(line) for line in fh if line.strip()]

    def size_bytes(self) -> int:
        return sum(p.stat().st_size for p in self.root.rglob("*.gz"))
