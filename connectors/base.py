"""Shared connector helpers (no network, no database)."""

import hashlib
import json


def content_version(obj) -> str:
    """Stable version tag for sources without an explicit version field."""
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
