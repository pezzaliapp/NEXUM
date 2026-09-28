"""Source Registry: declarative source files with licence, access and politeness.

A connector can run only if its source is registered and admissible.
"""

import datetime as _dt
import hashlib
import pathlib
import tomllib
from dataclasses import dataclass, field

VERDICTS = ("adopt", "adopt_with_conditions", "opt_in", "reject", "fixture")
TIERS = {"T1": 0.95, "T2": 0.85, "T3": 0.75, "T4": 0.60, "T5": 0.50, "T6": 0.35}
ACCESS_TYPES = ("geojson", "json", "csv", "zip", "rss", "atom", "cap", "local")
WARN_AFTER_DAYS = 180
BLOCK_AFTER_DAYS = 365


class RegistryError(ValueError):
    pass


@dataclass
class Source:
    id: str
    name: str
    owner: str
    verdict: str
    tier: str
    verified_at: str
    independence_group: str
    license_id: str
    license_url: str
    attribution: str
    redistribution: str
    commercial_use: str
    access_type: str
    auth: str
    allowed_hosts: list
    connector: str
    min_interval_s: float = 60.0
    max_rps: float = 0.2
    conditional_get: bool = True
    respect_retry_after: bool = True
    updates_mode: str = "none"
    min_poll_interval_s: float = 3600.0
    local_path: str | None = None
    options: dict = field(default_factory=dict)
    registry_hash: str = ""
    path: str = ""

    @property
    def reliability(self) -> float:
        return TIERS[self.tier]


def _req(d, key, where):
    if key not in d or d[key] in (None, ""):
        raise RegistryError(f"{where}: missing '{key}'")
    return d[key]


def load_source(path: pathlib.Path) -> Source:
    raw = path.read_bytes()
    d = tomllib.loads(raw.decode("utf-8"))
    where = str(path)
    lic = _req(d, "license", where)
    acc = _req(d, "access", where)
    pol = d.get("politeness", {})
    upd = d.get("updates", {})
    s = Source(
        id=_req(d, "id", where),
        name=_req(d, "name", where),
        owner=_req(d, "owner", where),
        verdict=_req(d, "verdict", where),
        tier=_req(d, "reliability_tier", where),
        verified_at=_req(d, "verified_at", where),
        independence_group=_req(d, "independence_group", where),
        license_id=_req(lic, "id", where + " [license]"),
        license_url=lic.get("url", ""),
        attribution=_req(lic, "attribution", where + " [license]"),
        redistribution=_req(lic, "redistribution", where + " [license]"),
        commercial_use=_req(lic, "commercial_use", where + " [license]"),
        access_type=_req(acc, "type", where + " [access]"),
        auth=_req(acc, "auth", where + " [access]"),
        allowed_hosts=list(acc.get("allowed_hosts", [])),
        connector=_req(d, "connector", where),
        min_interval_s=float(pol.get("min_interval_s", 60.0)),
        max_rps=float(pol.get("max_rps", 0.2)),
        conditional_get=bool(pol.get("conditional_get", True)),
        respect_retry_after=bool(pol.get("respect_retry_after", True)),
        updates_mode=upd.get("mode", "none"),
        min_poll_interval_s=float(upd.get("min_poll_interval_s", 3600.0)),
        local_path=acc.get("path"),
        options=d.get("options", {}),
        registry_hash=hashlib.sha256(raw).hexdigest(),
        path=str(path),
    )
    validate(s)
    return s


def validate(s: Source) -> None:
    if s.verdict not in VERDICTS:
        raise RegistryError(f"{s.id}: invalid verdict {s.verdict!r}")
    if s.tier not in TIERS:
        raise RegistryError(f"{s.id}: invalid reliability_tier {s.tier!r}")
    if s.access_type not in ACCESS_TYPES:
        raise RegistryError(f"{s.id}: invalid access type {s.access_type!r}")
    if s.auth not in ("none", "free_key", "free_account"):
        raise RegistryError(f"{s.id}: invalid auth {s.auth!r}")
    if s.access_type == "local":
        if s.verdict != "fixture":
            raise RegistryError(f"{s.id}: local access is reserved to fixture sources")
        if not s.local_path:
            raise RegistryError(f"{s.id}: local access requires access.path")
    elif not s.allowed_hosts:
        raise RegistryError(f"{s.id}: allowed_hosts must not be empty")
    if s.max_rps <= 0:
        raise RegistryError(f"{s.id}: max_rps must be positive")
    _dt.date.fromisoformat(s.verified_at)


def verification_age_days(s: Source, today: _dt.date | None = None) -> int:
    today = today or _dt.date.today()
    return (today - _dt.date.fromisoformat(s.verified_at)).days


def admissible(s: Source, allow_fixture: bool = False, today: _dt.date | None = None) -> tuple[bool, str]:
    """Can this source run now? Returns (ok, reason)."""
    if s.verdict == "reject":
        return False, "verdict reject"
    if s.verdict == "opt_in":
        return False, "opt_in sources are excluded from Phase 1"
    if s.verdict == "fixture" and not allow_fixture:
        return False, "fixture sources are allowed only in tests and benchmarks"
    if s.auth != "none":
        return False, "Phase 1 admits only sources without credentials"
    if s.verdict != "fixture":
        age = verification_age_days(s, today)
        if age > BLOCK_AFTER_DAYS:
            return False, f"licence verification is {age} days old (> {BLOCK_AFTER_DAYS})"
    return True, "ok"


def verification_warnings(sources, today=None) -> list[str]:
    out = []
    for s in sources:
        if s.verdict != "fixture" and verification_age_days(s, today) > WARN_AFTER_DAYS:
            out.append(f"{s.id}: licence verification older than {WARN_AFTER_DAYS} days")
    return out


def load_registry(dirs) -> dict[str, Source]:
    out: dict[str, Source] = {}
    for d in dirs:
        for p in sorted(pathlib.Path(d).glob("*.toml")):
            s = load_source(p)
            if s.id in out:
                raise RegistryError(f"duplicate source id {s.id}")
            out[s.id] = s
    return out
