"""Fixed lists for Phase 2 E2E tests and benchmarks (seed 20260929), written BEFORE any measurement (§P).
Every ID is a stable NEXUM ID; the file is versioned so that runs are comparable."""

import json
import pathlib
import random
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "bench" / "phase2" / "fixtures.json"
SEED = 20260929


def ro(world):
    c = sqlite3.connect((ROOT / "data" / world / "nexum.db").resolve().as_uri() + "?mode=ro", uri=True)
    return c


def ident(c, scheme, value):
    return c.execute("SELECT entity_id FROM identifier WHERE scheme=? AND value=? ORDER BY strong DESC",
                     (scheme, value)).fetchone()[0]


def main():
    rnd = random.Random(SEED)
    d1, d2, d3 = ro("d1"), ro("d2"), ro("d3")
    act = ident(d1, "cems", "EMSR798")
    quake = ident(d1, "usgs", "us7000pn9s")
    r2 = d1.execute("SELECT insight_id FROM insight WHERE rule_id='event_event_association' AND anchor_id=? AND "
                    "status='active'", (act,)).fetchone()[0]
    r3 = d1.execute("SELECT i.insight_id FROM insight i JOIN evidence e ON e.supports_id=i.insight_id WHERE "
                    "i.rule_id='composite_context' AND i.status='active' AND e.support_id=?", (r2,)).fetchone()[0]
    r1 = d1.execute("SELECT insight_id FROM insight WHERE rule_id='exposure_context' AND anchor_id=? AND "
                    "status='active'", (quake,)).fetchone()[0]
    myanmar = {"mm": ident(d1, "iso3166a3", "MMR"), "vymd": ident(d1, "icao", "VYMD"), "quake": quake,
               "m67": ident(d1, "usgs", "us7000pn9z"), "act": act, "r2": r2, "r3": r3, "r1": r1}
    n1 = d3.execute("SELECT insight_id FROM insight WHERE rule_id='independently_supported_temporal_association'"
                    ).fetchone()[0]
    d3ids = {"vuln": ident(d3, "vulnid", "VULN-TEST-0001"), "org": ident(d3, "orgid", "ORG-ALPHA"), "n1": n1}

    def sample(c, sql, k):
        rows = [r[0] for r in c.execute(sql)]
        return rnd.sample(rows, min(k, len(rows)))

    linked = (sample(d1, "SELECT object_id FROM object ORDER BY object_id", 14) +
              sample(d1, "SELECT event_id FROM event ORDER BY event_id", 14) +
              sample(d1, "SELECT insight_id FROM insight WHERE status='active' ORDER BY insight_id", 6) +
              sample(d1, "SELECT relation_id FROM relation ORDER BY relation_id", 6))
    linked_d3 = (sample(d3, "SELECT object_id FROM object ORDER BY object_id", 4) +
                 sample(d3, "SELECT event_id FROM event ORDER BY event_id", 3) +
                 sample(d3, "SELECT insight_id FROM insight ORDER BY insight_id", 2) +
                 sample(d3, "SELECT relation_id FROM relation ORDER BY relation_id", 1))
    relations = (sample(d1, "SELECT relation_id FROM relation ORDER BY relation_id", 15) +
                 sample(d3, "SELECT relation_id FROM relation ORDER BY relation_id", 5))
    events = [r[0] for r in d1.execute("SELECT event_id FROM event ORDER BY event_id")]
    objects = [r[0] for r in d1.execute("SELECT object_id FROM object WHERE type='place.country' ORDER BY object_id")]
    pairs = [[rnd.choice(events), rnd.choice(objects)] for _ in range(30)]
    hubs = [r[0] for r in d2.execute("SELECT entity_id FROM degree GROUP BY entity_id ORDER BY MAX(count) DESC, "
                                     "entity_id LIMIT 10")]
    hub_groups = [list(r) for r in d2.execute("SELECT entity_id, edge_kind, type, direction FROM degree WHERE "
                                              f"entity_id IN ({','.join('?' * len(hubs))}) ORDER BY count DESC",
                                              hubs)][:10]
    centers = []
    for _ in range(10):
        lon, lat = d2.execute("SELECT lon, lat FROM event WHERE lon IS NOT NULL LIMIT 1 OFFSET ?",
                              (rnd.randint(0, 500000),)).fetchone()
        centers.append([round(lon, 4), round(lat, 4)])
    words = sorted({w for (l,) in d2.execute("SELECT label FROM object ORDER BY object_id LIMIT 2000")
                    for w in l.split() if len(w) >= 4})
    terms = rnd.sample(words, 10) if len(words) >= 10 else words
    pivots_d1 = sample(d1, "SELECT event_id FROM event ORDER BY event_id", 25) + \
        sample(d1, "SELECT object_id FROM object ORDER BY object_id", 25)
    pivots_d2 = sample(d2, "SELECT event_id FROM event ORDER BY event_id LIMIT 200000", 25) + \
        sample(d2, "SELECT object_id FROM object ORDER BY object_id", 25)
    r2_all = [r[0] for r in d1.execute("SELECT insight_id FROM insight WHERE rule_id='event_event_association' AND "
                                       "status='active' ORDER BY insight_id")]
    # raw locators are no longer frozen (raw ids change at every acquisition; A10 resolves them from current data);
    # the draw is kept so that the seeded sequence of the fixtures that follow stays identical
    raws = [[r[0], r[1]] for r in d1.execute("SELECT raw_id, raw_locator FROM record ORDER BY record_id LIMIT 5000")]
    rnd.sample(raws, 49)
    t_min, t_max = d1.execute("SELECT MIN(t_start_ms), MAX(t_start_ms) FROM event").fetchone()
    types = [r[0] for r in d1.execute("SELECT type_id FROM object_type UNION SELECT type_id FROM event_type")]
    scopes = []
    for _ in range(100):
        s = {}
        if rnd.random() < 0.5:
            s["types"] = rnd.sample(types, rnd.randint(1, len(types)))
        if rnd.random() < 0.4:
            s["min_confidence"] = rnd.choice([0.5, 0.8])
        if rnd.random() < 0.5:
            a = rnd.randint(t_min, t_max)
            s["time_window"] = [a, min(t_max, a + rnd.choice([30, 365, 1500]) * 86400000)]
        scopes.append(s)
    doc = {"seed": SEED, "myanmar": myanmar, "d3": d3ids, "linked_d1": linked, "linked_d3": linked_d3,
           "relations": relations, "path_pairs": pairs, "d2_hubs": hubs, "d2_hub_groups": hub_groups,
           "d2_centers": centers, "d2_terms": terms, "pivots_d1": pivots_d1, "pivots_d2": pivots_d2,
           "r2_insights": r2_all, "scopes_d1": scopes}
    OUT.write_text(json.dumps(doc, indent=1))
    print({k: (len(v) if isinstance(v, list) else "·") for k, v in doc.items()})


if __name__ == "__main__":
    main()
