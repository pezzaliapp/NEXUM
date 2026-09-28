"""Identifiers: deterministic IDs for world entities, ULIDs for operational rows."""

import base64
import hashlib
import os
import time

_B32 = "0123456789abcdefghjkmnpqrstvwxyz"  # Crockford base32 (lowercase)


def det_id(prefix: str, *parts) -> str:
    """Deterministic ID: prefix + base32(sha256(parts))[:26] (128 bits)."""
    h = hashlib.sha256("\x1f".join("" if p is None else str(p) for p in parts).encode("utf-8"))
    enc = base64.b32encode(h.digest()[:16]).decode("ascii").rstrip("=").lower()
    return f"{prefix}_{enc}"


def ulid(now_ms: int | None = None) -> str:
    """ULID: 48-bit millisecond timestamp + 80 random bits, Crockford base32."""
    t = int(time.time() * 1000) if now_ms is None else int(now_ms)
    value = (t << 80) | int.from_bytes(os.urandom(10), "big")
    out = []
    for _ in range(26):
        out.append(_B32[value & 31])
        value >>= 5
    return "".join(reversed(out))


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
