"""Generic normalized record produced by connectors (no domain knowledge)."""

from dataclasses import dataclass, field

STATUSES = ("preliminary", "reviewed", "updated", "retracted")
KINDS = ("object", "event", "relation")


@dataclass
class Target:
    """Reference to another entity, not yet resolved.

    Resolution order: identifier (scheme, value) → name among entities of `type`.
    """
    type: str
    scheme: str | None = None
    value: str | None = None
    name: str | None = None


@dataclass
class Assertion:
    """A relation or participation stated by the source about the record's entity."""
    kind: str                  # "relation" | "participation"
    type: str                  # relation type or participation role
    target: Target
    direction: str = "out"     # relation: out = entity→target, in = target→entity
    attributes: dict = field(default_factory=dict)


@dataclass
class NormalizedRecord:
    source_id: str
    native_id: str
    kind: str                          # "object" | "event" | "relation"
    type: str                          # entity type, or relation type for kind="relation"
    label: str = ""
    native_version: str = ""
    identifiers: list = field(default_factory=list)   # [(scheme, value)]
    aliases: list = field(default_factory=list)       # extra names
    properties: dict = field(default_factory=dict)
    geometry: dict | None = None
    geo_uncertainty_m: float | None = None
    t_start_ms: int | None = None
    t_end_ms: int | None = None
    t_precision: str | None = None
    t_uncertainty_s: int = 0
    valid_from_ms: int | None = None
    valid_to_ms: int | None = None
    status: str = "reviewed"
    method: str = "asserted"
    assertions: list = field(default_factory=list)
    subject: Target | None = None      # kind="relation": from-endpoint
    obj: Target | None = None          # kind="relation": to-endpoint
    raw_locator: str = ""
    quality_flags: list = field(default_factory=list)
    text: str = ""                     # short searchable description (never full third-party text)
