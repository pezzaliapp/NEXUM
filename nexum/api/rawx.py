"""Extract a single source record from the Raw Store (never the whole payload).

The record is located by the raw_id and the locator recorded in provenance
(`$.features[79]`, `row:1234`, `shape:12`, `line:5`, `zline:5`). The raw_id → sha256
mapping comes from the Raw Store's append-only manifest, and the payload is
verified against its hash when read.
"""

import csv
import io
import json
import re
import threading
import zipfile
from collections import OrderedDict

from connectors import shapefile
from nexum.core.raw import RawStore

MAX_RECORD_BYTES = 256 * 1024
_JSON_PATH = re.compile(r"^\$((?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])+)$")
_STEP = re.compile(r"\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]")


class RawError(ValueError):
    pass


class RawExtractor:
    def __init__(self, raw_dir):
        self.store = RawStore(raw_dir)
        self._lock = threading.Lock()
        self._manifest = None
        self._parsed: OrderedDict = OrderedDict()   # sha → parsed payload (small LRU)

    def _entry(self, raw_id):
        with self._lock:
            if self._manifest is None or raw_id not in self._manifest:
                self._manifest = {e["raw_id"]: e for e in self.store.read_manifest()}
            return self._manifest.get(raw_id)

    def _parsed_payload(self, entry, kind):
        key = (entry["sha256"], kind)
        with self._lock:
            if key in self._parsed:
                self._parsed.move_to_end(key)
                return self._parsed[key]
        data = self.store.get(entry["sha256"])  # verifies the hash
        if kind == "json":
            obj = json.loads(data)
        elif kind == "lines":
            obj = data.decode("utf-8").splitlines()
        elif kind == "zlines":   # a zipped text file of JSON lines (its first member)
            z = zipfile.ZipFile(io.BytesIO(data))
            obj = z.read(z.namelist()[0]).decode("utf-8").splitlines()
        elif kind == "csv":
            obj = list(csv.reader(io.StringIO(data.decode("utf-8"))))
        else:  # zipped shapefile: attribute table only
            z = zipfile.ZipFile(io.BytesIO(data))
            dbf = next(n for n in z.namelist() if n.lower().endswith(".dbf"))
            cpg = [n for n in z.namelist() if n.lower().endswith(".cpg")]
            enc = z.read(cpg[0]).decode("ascii").strip().lower() if cpg else "utf-8"
            obj = shapefile.read_dbf(z.read(dbf), "utf-8" if "utf" in enc else enc)
        with self._lock:
            self._parsed[key] = obj
            while len(self._parsed) > 3:
                self._parsed.popitem(last=False)
        return obj

    def extract(self, raw_id: str, locator: str) -> dict:
        entry = self._entry(raw_id)
        if entry is None:
            raise RawError(f"raw payload {raw_id} not in this world's Raw Store")
        m = _JSON_PATH.match(locator or "")
        if m:
            node = self._parsed_payload(entry, "json")
            for key, idx in _STEP.findall(m.group(1)):
                try:
                    node = node[key] if key else node[int(idx)]
                except (KeyError, IndexError, TypeError):
                    raise RawError(f"locator {locator} not found in payload") from None
            record, fmt = node, "json"
        elif re.fullmatch(r"row:\d+", locator or ""):
            rows = self._parsed_payload(entry, "csv")
            n = int(locator[4:])  # file line number, header = line 1
            if not 2 <= n <= len(rows):
                raise RawError(f"locator {locator} not found in payload")
            record, fmt = dict(zip(rows[0], rows[n - 1])), "csv_row"
        elif re.fullmatch(r"line:\d+", locator or ""):
            lines = self._parsed_payload(entry, "lines")
            n = int(locator[5:])
            if not 0 <= n < len(lines):
                raise RawError(f"locator {locator} not found in payload")
            record, fmt = json.loads(lines[n]), "json_line"
        elif re.fullmatch(r"zline:\d+", locator or ""):
            lines = self._parsed_payload(entry, "zlines")
            n = int(locator[6:])
            if not 0 <= n < len(lines):
                raise RawError(f"locator {locator} not found in payload")
            record, fmt = json.loads(lines[n]), "json_line"
        elif re.fullmatch(r"shape:\d+", locator or ""):
            rows = self._parsed_payload(entry, "shp")
            n = int(locator[6:])
            if not 0 <= n < len(rows) or rows[n] is None:
                raise RawError(f"locator {locator} not found in payload")
            record, fmt = rows[n], "shapefile_attributes"
        else:
            raise RawError(f"unsupported locator {locator!r}")
        body = json.dumps(record, ensure_ascii=False, default=str)
        truncated = len(body.encode()) > MAX_RECORD_BYTES
        if truncated:
            record = body.encode()[:MAX_RECORD_BYTES].decode("utf-8", "ignore")
        return {"raw_id": raw_id, "source_id": entry["source_id"], "sha256": entry["sha256"], "url": entry["url"],
                "fetched_ms": entry["fetched_ms"], "locator": locator, "format": fmt, "record": record,
                "truncated": truncated,
                "note": "geometria omessa: solo attributi" if fmt == "shapefile_attributes" else None}
