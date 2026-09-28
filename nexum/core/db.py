"""SQLite schema of the NEXUM WORLD (single file, local-first).

The database is a derived artefact: `rebuild` recreates it from the Raw Store,
the configuration (sources, vocabularies, rules) and the component versions.
"""

import sqlite3
import time

SCHEMA_VERSION = 1

DDL = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT) STRICT;
CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_ms INTEGER) STRICT;

-- type system (loaded from vocabularies)
CREATE TABLE IF NOT EXISTS object_type(type_id TEXT PRIMARY KEY, label TEXT, geometry TEXT,
  identity_schemes TEXT, name_match INTEGER, display_hints TEXT, vocab_hash TEXT) STRICT;
CREATE TABLE IF NOT EXISTS event_type(type_id TEXT PRIMARY KEY, label TEXT, roles TEXT, severity_def TEXT,
  identity_schemes TEXT, display_hints TEXT, vocab_hash TEXT) STRICT;
CREATE TABLE IF NOT EXISTS relation_type(type_id TEXT PRIMARY KEY, label TEXT, nature TEXT, symmetric INTEGER,
  from_types TEXT, to_types TEXT, display_hints TEXT, vocab_hash TEXT) STRICT;
CREATE TABLE IF NOT EXISTS property_def(owner_type TEXT, property TEXT, value_kind TEXT, unit TEXT,
  required INTEGER, PRIMARY KEY(owner_type, property)) STRICT;

-- registry and acquisition
CREATE TABLE IF NOT EXISTS source(source_id TEXT PRIMARY KEY, name TEXT, owner TEXT, verdict TEXT, tier TEXT,
  license_id TEXT, license_url TEXT, attribution TEXT, redistribution TEXT, commercial_use TEXT,
  independence_group TEXT, verified_at TEXT, updates_mode TEXT, registry_hash TEXT) STRICT;
CREATE TABLE IF NOT EXISTS source_health(source_id TEXT PRIMARY KEY REFERENCES source(source_id),
  last_attempt_ms INTEGER, last_success_ms INTEGER, consecutive_errors INTEGER, retry_after_ms INTEGER,
  state TEXT) STRICT;
CREATE TABLE IF NOT EXISTS run(run_id TEXT PRIMARY KEY, kind TEXT, started_ms INTEGER, ended_ms INTEGER,
  core_version TEXT, versions_json TEXT, outcome TEXT) STRICT;
CREATE TABLE IF NOT EXISTS fetch_log(fetch_id TEXT PRIMARY KEY, run_id TEXT, source_id TEXT, url TEXT,
  resource_key TEXT, requested_ms INTEGER, http_status INTEGER, not_modified INTEGER, raw_id TEXT,
  bytes INTEGER, duration_ms INTEGER, user_agent TEXT, conditional INTEGER, error TEXT) STRICT;
CREATE TABLE IF NOT EXISTS raw_record(raw_id TEXT PRIMARY KEY, source_id TEXT REFERENCES source(source_id),
  sha256 TEXT, codec TEXT, size INTEGER, url TEXT, resource_key TEXT, fetched_ms INTEGER, http_status INTEGER,
  etag TEXT, last_modified TEXT, content_type TEXT, path TEXT, UNIQUE(source_id, sha256)) STRICT;
CREATE TABLE IF NOT EXISTS raw_processed(raw_id TEXT PRIMARY KEY, connector_version TEXT, records INTEGER,
  processed_ms INTEGER) STRICT;
CREATE TABLE IF NOT EXISTS connector_state(source_id TEXT PRIMARY KEY, state_json TEXT, updated_ms INTEGER) STRICT;
CREATE TABLE IF NOT EXISTS record(record_id TEXT PRIMARY KEY, source_id TEXT, native_id TEXT,
  native_version TEXT, kind TEXT, type TEXT, raw_id TEXT REFERENCES raw_record(raw_id), raw_locator TEXT,
  parser_version TEXT, quality_flags TEXT, entity_id TEXT) STRICT, WITHOUT ROWID;

-- world
CREATE TABLE IF NOT EXISTS object(object_id TEXT PRIMARY KEY, type TEXT, label TEXT, geometry TEXT,
  lon REAL, lat REAL, min_lon REAL, max_lon REAL, min_lat REAL, max_lat REAL, geo_uncertainty_m REAL,
  cx INTEGER, cy INTEGER, valid_from_ms INTEGER, valid_to_ms INTEGER, status TEXT, merged_into TEXT,
  props_json TEXT, source_id TEXT, band INTEGER, confidence REAL, factors_json TEXT, prov_id INTEGER,
  recorded_at_ms INTEGER, world_version INTEGER) STRICT;
CREATE TABLE IF NOT EXISTS event(event_id TEXT PRIMARY KEY, type TEXT, label TEXT, t_start_ms INTEGER,
  t_end_ms INTEGER, t_precision TEXT, t_uncertainty_s INTEGER, month INTEGER, geometry TEXT,
  lon REAL, lat REAL, min_lon REAL, max_lon REAL, min_lat REAL, max_lat REAL, geo_uncertainty_m REAL,
  cx INTEGER, cy INTEGER, severity REAL, status TEXT, props_json TEXT, source_id TEXT, band INTEGER,
  confidence REAL, factors_json TEXT, prov_id INTEGER, recorded_at_ms INTEGER, world_version INTEGER) STRICT;
CREATE TABLE IF NOT EXISTS relation(relation_id TEXT PRIMARY KEY, type TEXT, nature TEXT, from_kind TEXT,
  from_id TEXT, to_kind TEXT, to_id TEXT, derivation TEXT, attributes_json TEXT, valid_from_ms INTEGER,
  valid_to_ms INTEGER, evidence_count INTEGER, independent_groups INTEGER, confidence REAL,
  factors_json TEXT, prov_id INTEGER, recorded_at_ms INTEGER, world_version INTEGER) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS event_participant(event_id TEXT, object_id TEXT, role TEXT, derivation TEXT,
  distance_m REAL, confidence REAL, factors_json TEXT, prov_id INTEGER, recorded_at_ms INTEGER,
  PRIMARY KEY(event_id, object_id, role)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS claim(claim_id TEXT, subject_kind TEXT, subject_id TEXT,
  property TEXT, value_json TEXT, unit TEXT, valid_from_ms INTEGER, valid_to_ms INTEGER,
  recorded_at_ms INTEGER, record_id TEXT, confidence REAL, superseded_by TEXT, prov_id INTEGER,
  world_version INTEGER,
  PRIMARY KEY(subject_id, property, claim_id)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS identifier(scheme TEXT, value TEXT, entity_kind TEXT, entity_id TEXT,
  strong INTEGER, source_id TEXT, prov_id INTEGER, PRIMARY KEY(scheme, value, entity_id)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS alias(entity_id TEXT, alias_norm TEXT, alias TEXT, entity_type TEXT,
  origin TEXT, PRIMARY KEY(entity_id, alias_norm)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS evidence(supports_id TEXT, support_id TEXT, role TEXT, supports_kind TEXT,
  support_kind TEXT, method TEXT, source_id TEXT, independence_group TEXT, record_id TEXT, locator TEXT,
  distance_m REAL, delta_t_ms INTEGER, weight REAL, factors_json TEXT, prov_id INTEGER,
  PRIMARY KEY(supports_id, support_id, role)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS pending_assertion(pa_id TEXT PRIMARY KEY, record_id TEXT, subject_kind TEXT,
  subject_id TEXT, subject_type TEXT, assertion_json TEXT, source_id TEXT, independence_group TEXT,
  locator TEXT, recorded_at_ms INTEGER, reason TEXT) STRICT;
CREATE TABLE IF NOT EXISTS merge_candidate(candidate_id TEXT PRIMARY KEY, entity_kind TEXT, a_id TEXT,
  b_id TEXT, score REAL, reason_json TEXT, status TEXT, prov_id INTEGER) STRICT;

-- provenance
CREATE TABLE IF NOT EXISTS provenance(prov_id INTEGER PRIMARY KEY, prov_key TEXT UNIQUE, activity TEXT, agent TEXT,
  run_id TEXT, at_ms INTEGER) STRICT;
CREATE TABLE IF NOT EXISTS provenance_input(prov_id INTEGER, input_kind TEXT, input_id TEXT, locator TEXT,
  PRIMARY KEY(prov_id, input_kind, input_id)) STRICT, WITHOUT ROWID;

-- correlation
CREATE TABLE IF NOT EXISTS rule(rule_id TEXT, version TEXT, definition_toml TEXT, definition_hash TEXT,
  PRIMARY KEY(rule_id, version)) STRICT;
CREATE TABLE IF NOT EXISTS insight(insight_id TEXT PRIMARY KEY, kind TEXT, type TEXT, rule_id TEXT,
  rule_version TEXT, anchor_id TEXT, label TEXT, confidence REAL, factors_json TEXT, confidence_text TEXT,
  explanation TEXT, t_start_ms INTEGER, t_end_ms INTEGER, month INTEGER, lon REAL, lat REAL,
  min_lon REAL, max_lon REAL, min_lat REAL, max_lat REAL, cx INTEGER, cy INTEGER, band INTEGER,
  status TEXT, superseded_by TEXT, created_at_ms INTEGER, run_id TEXT, prov_id INTEGER,
  world_version INTEGER, grouping_json TEXT) STRICT;

-- navigation indexes
CREATE TABLE IF NOT EXISTS edge(src_id TEXT, edge_kind TEXT, type TEXT, dst_id TEXT, ref_id TEXT, nature TEXT,
  t_ms INTEGER, confidence REAL, PRIMARY KEY(src_id, edge_kind, type, dst_id, ref_id)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS degree(entity_id TEXT, edge_kind TEXT, type TEXT, direction TEXT, count INTEGER,
  PRIMARY KEY(entity_id, edge_kind, type, direction)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS agg(level INTEGER, period INTEGER, cx INTEGER, cy INTEGER, kind TEXT, type TEXT,
  source TEXT, band INTEGER, geo INTEGER, n INTEGER, maxconf REAL,
  PRIMARY KEY(level, period, cx, cy, kind, type, source, band, geo)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS agg_rel(type TEXT, nature TEXT, n INTEGER, PRIMARY KEY(type, nature)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS change_log(seq INTEGER PRIMARY KEY AUTOINCREMENT, world_version INTEGER,
  entity_kind TEXT, entity_id TEXT, op TEXT, at_ms INTEGER) STRICT;
CREATE TABLE IF NOT EXISTS rid_map(rid INTEGER PRIMARY KEY, entity_kind TEXT, entity_id TEXT UNIQUE) STRICT;

CREATE VIRTUAL TABLE IF NOT EXISTS object_rtree USING rtree(rid, min_lon, max_lon, min_lat, max_lat);
CREATE VIRTUAL TABLE IF NOT EXISTS event_rtree USING rtree(rid, min_lon, max_lon, min_lat, max_lat);
CREATE VIRTUAL TABLE IF NOT EXISTS insight_rtree USING rtree(rid, min_lon, max_lon, min_lat, max_lat);
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(label, aliases, identifiers, text, content='',
  contentless_delete=1, tokenize='unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE IF NOT EXISTS search_vocab USING fts5vocab(search_fts, row);

CREATE VIEW IF NOT EXISTS claim_current AS
  SELECT c.* FROM claim c WHERE c.superseded_by IS NULL;
CREATE VIEW IF NOT EXISTS timeline_entry AS
  SELECT 'event' AS kind, event_id AS id, type, t_start_ms AS t_ms, t_end_ms FROM event
  UNION ALL SELECT 'insight', insight_id, type, t_start_ms, t_end_ms FROM insight
    WHERE status = 'active' AND t_start_ms IS NOT NULL
  UNION ALL SELECT 'claim', claim_id, property, valid_from_ms, valid_to_ms FROM claim
    WHERE valid_from_ms IS NOT NULL
  UNION ALL SELECT 'relation', relation_id, type, valid_from_ms, valid_to_ms FROM relation
    WHERE valid_from_ms IS NOT NULL;
"""

INDEXES = """
CREATE INDEX IF NOT EXISTS ix_raw_resource ON raw_record(source_id, resource_key, fetched_ms);
CREATE INDEX IF NOT EXISTS ix_object_type ON object(type);
CREATE INDEX IF NOT EXISTS ix_event_type_t ON event(type, t_start_ms);
CREATE INDEX IF NOT EXISTS ix_event_t ON event(t_start_ms);
CREATE INDEX IF NOT EXISTS ix_event_tend ON event(t_end_ms);
CREATE INDEX IF NOT EXISTS ix_identifier_entity ON identifier(entity_id);
CREATE INDEX IF NOT EXISTS ix_alias_norm ON alias(entity_type, alias_norm);
CREATE INDEX IF NOT EXISTS ix_evidence_support ON evidence(support_id);
CREATE INDEX IF NOT EXISTS ix_pending_subject ON pending_assertion(subject_id);
CREATE INDEX IF NOT EXISTS ix_insight_rule ON insight(rule_id, status, confidence);
CREATE INDEX IF NOT EXISTS ix_insight_anchor ON insight(rule_id, anchor_id, status);
CREATE INDEX IF NOT EXISTS ix_insight_t ON insight(t_start_ms);
CREATE INDEX IF NOT EXISTS ix_edge_dst ON edge(dst_id, edge_kind, type);
CREATE INDEX IF NOT EXISTS ix_edge_ref ON edge(ref_id) WHERE edge_kind IN ('insight_member', 'hypothesis');
CREATE INDEX IF NOT EXISTS ix_change_version ON change_log(world_version);
CREATE INDEX IF NOT EXISTS ix_fetch_source ON fetch_log(source_id, requested_ms);
"""


def connect(path: str, bulk: bool = False) -> sqlite3.Connection:
    conn = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL" if not bulk else "PRAGMA synchronous=OFF")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA cache_size=-262144")  # 256 MiB page cache
    conn.execute("PRAGMA mmap_size=1073741824")
    return conn


MIGRATIONS = [("insight", "grouping_json", "TEXT")]  # additive columns introduced after schema v1


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(DDL)
    for table, col, typ in MIGRATIONS:
        cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        if col not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
    conn.executescript(INDEXES)
    cur = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
    if cur is None:
        conn.execute("INSERT INTO schema_version VALUES(?, ?)", (SCHEMA_VERSION, int(time.time() * 1000)))
        conn.execute("INSERT OR IGNORE INTO meta VALUES('world_version', '0')")


def get_meta(conn, key, default=None):
    row = conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def set_meta(conn, key, value):
    conn.execute("INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                 (key, str(value)))


# Tables whose content defines the logical world (used by the reproducibility hash).
# Operational columns (run ids, world versions, wall-clock timestamps) are excluded.
LOGICAL_TABLES = {
    "object": ["object_id", "type", "label", "geometry", "lon", "lat", "status", "merged_into",
               "props_json", "source_id", "confidence", "factors_json", "recorded_at_ms"],
    "event": ["event_id", "type", "label", "t_start_ms", "t_end_ms", "t_precision", "t_uncertainty_s",
              "geometry", "severity", "status", "props_json", "source_id", "confidence", "factors_json",
              "recorded_at_ms"],
    "relation": ["relation_id", "type", "nature", "from_id", "to_id", "derivation", "attributes_json",
                 "evidence_count", "independent_groups", "confidence", "factors_json", "recorded_at_ms"],
    "event_participant": ["event_id", "object_id", "role", "derivation", "distance_m", "confidence"],
    "claim": ["claim_id", "subject_id", "property", "value_json", "valid_from_ms", "recorded_at_ms",
              "superseded_by", "confidence"],
    "identifier": ["scheme", "value", "entity_id", "strong", "source_id"],
    "evidence": ["supports_kind", "supports_id", "support_kind", "support_id", "role",
                 "method", "source_id", "independence_group", "record_id", "locator", "distance_m",
                 "delta_t_ms", "weight"],
    "record": ["record_id", "source_id", "native_id", "native_version", "kind", "type", "raw_locator",
               "quality_flags", "entity_id"],
    "insight": ["insight_id", "kind", "type", "rule_id", "rule_version", "anchor_id", "confidence",
                "factors_json", "explanation", "t_start_ms", "t_end_ms", "status", "superseded_by",
                "created_at_ms", "grouping_json"],
    "edge": ["src_id", "dst_id", "edge_kind", "type", "ref_id", "t_ms", "confidence"],
    "merge_candidate": ["candidate_id", "a_id", "b_id", "score", "status"],
    "pending_assertion": ["pa_id", "subject_id", "assertion_json", "reason"],
}


def logical_hash(conn) -> str:
    import hashlib
    h = hashlib.sha256()
    for table, cols in LOGICAL_TABLES.items():
        h.update(table.encode())
        q = f"SELECT {', '.join(cols)} FROM {table} ORDER BY {', '.join(cols)}"
        for row in conn.execute(q):
            h.update(repr(tuple(row)).encode("utf-8"))
    return h.hexdigest()


# World-derived tables: cleared by reset_world(); acquisition tables are kept.
WORLD_TABLES = ("record", "raw_processed", "object", "event", "relation", "event_participant", "claim", "identifier",
                "alias", "evidence", "pending_assertion", "merge_candidate", "provenance", "provenance_input",
                "insight", "edge", "degree", "agg", "agg_rel", "change_log", "rid_map", "object_rtree", "event_rtree",
                "insight_rtree", "search_fts")


def reset_world(conn) -> None:
    """Drop every derived row, keeping raw_record, fetch_log, source_health, connector_state and runs."""
    conn.execute("BEGIN")
    for t in WORLD_TABLES:
        conn.execute(f"DELETE FROM {t}")
    conn.execute("UPDATE meta SET value='0' WHERE key='world_version'")
    conn.execute("COMMIT")
