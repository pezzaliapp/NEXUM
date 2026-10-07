"""GDELT 2.0 — the world's news events of the LAST HOUR, geolocated (OSIRIS baseline, 2026-10-04: the "intel feed").
GDELT reads news media worldwide and codes each reported action (CAMEO event codes) with the place it names; every
15 minutes it publishes an "events export". NEXUM fetches the four exports of the last hour and publishes them as one
table (GET /tables/newsevents), drawn on request: what was REPORTED, where, the article that reported it — automatic
coding of news, not verified facts, never NEXUM events. Actors' NAMES are dropped (they may be persons): of each actor only
its country code and its ROLE code remain (government, police, protesters, business… — CAMEO type codes, never a name),
with the kind of action, the place, the time, the tone, how many sources and articles reported it, and the source
article. The "mentions" export of the same slots adds the other articles that reported each event (2026-10-06,
physical acceptance: the card says who reported it, not only one link).

Licence: "The GDELT Project is an open platform… all datasets released by the GDELT Project are available for
unlimited and unrestricted use for any academic, commercial, or governmental use of any kind without fee", with
citation of the GDELT Project. https, no key; one request per export (15 minutes), minimum interval 15 minutes."""

import csv
import datetime as dt
import io
import zipfile

from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
BASE = "https://data.gdeltproject.org/gdeltv2/{}.export.CSV.zip"
MENTIONS = "https://data.gdeltproject.org/gdeltv2/{}.mentions.CSV.zip"
LINKS = 8                     # articles kept per event (the first ones GDELT lists)
SLOTS = 4                     # the last hour


def describe():
    return {"connector_version": VERSION, "produces": []}


def slots(now=None):
    """The four most recent 15-minute exports surely published (GDELT posts each about 5 minutes after its slot)."""
    now = now or dt.datetime.now(dt.timezone.utc)
    t = now.replace(second=0, microsecond=0) - dt.timedelta(minutes=8)
    t = t.replace(minute=t.minute - t.minute % 15)
    return [(t - dt.timedelta(minutes=15 * i)).strftime("%Y%m%d%H%M%S") for i in range(SLOTS)]


def plan(mode, state, source, today=None):
    return [FetchRequest(BASE.format(s), f"gdelt_export_{s}") for s in slots()] + \
        [FetchRequest(MENTIONS.format(s), f"gdelt_mentions_{s}") for s in slots()]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    return iter(())


def rows(data):
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        text = z.read(z.namelist()[0]).decode("utf-8", errors="replace")
    except (zipfile.BadZipFile, IndexError, KeyError):
        return []
    return list(csv.reader(io.StringIO(text), delimiter="\t"))


def _latest(payloads, kind):
    return sorted((p for p in payloads if p[0].startswith(f"gdelt_{kind}_")), key=lambda p: p[0])[-SLOTS:]


FIELDS = ["lon", "lat", "root", "code", "place", "added_utc", "goldstein", "articles", "tone", "url",
          "event_id", "quad", "actor1_country", "actor1_role", "actor1_group", "actor2_country", "actor2_role", "actor2_group",
          "feature_id", "sources", "mentions", "links"]


def table(payloads):
    """One row per root event with a place, of the most recent hour: FIELDS (actors as country/role/group CODES only;
    links = the web articles the mentions export lists for the event, the event's own source URL first)."""
    exports, mentions = _latest(payloads, "export"), _latest(payloads, "mentions")
    if not exports:            # payloads stored before the export/mentions split (keys without a kind)
        exports = sorted(payloads, key=lambda p: p[0])[-SLOTS:]
    out, seen, added, index = [], set(), [], {}
    for _key, data, _fetched, _url in exports:
        for r in rows(data):
            if len(r) < 61 or not r[56] or not r[57] or r[25] != "1":    # root events with a place only
                continue
            url = r[60]
            k = (r[28], r[52], url)
            if k in seen:
                continue
            seen.add(k)
            try:
                lat, lon = round(float(r[56]), 3), round(float(r[57]), 3)
                gold, arts, tone = float(r[30]), int(r[33]), round(float(r[34]), 1)
                ment, srcs = int(r[31] or 0), int(r[32] or 0)
            except ValueError:
                continue
            a = r[59]
            when = f"{a[:4]}-{a[4:6]}-{a[6:8]}T{a[8:10]}:{a[10:12]}"
            added.append(when)
            row = [lon, lat, r[28], r[26], r[52], when, gold, arts, tone, url,
                   r[0], r[29], r[7], r[12], r[8], r[17], r[22], r[18], r[58], srcs, ment, [url] if url else []]
            index[r[0]] = row
            out.append(row)
    # the other web articles that reported each event (mention type 1 = web), in GDELT's order, without repeats
    for _key, data, _fetched, _url in mentions:
        for m in rows(data):
            if len(m) < 6 or m[3] != "1":
                continue
            row = index.get(m[0])
            if row is not None and m[5] not in row[-1] and len(row[-1]) < LINKS:
                row[-1].append(m[5])
    return {"fields": FIELDS, "rows": out,
            "notes": {"from": min(added, default=None), "to": max(added, default=None), "mentions": bool(mentions)}}
