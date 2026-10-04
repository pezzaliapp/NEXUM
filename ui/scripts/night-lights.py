"""Reference night lights of the Operational Map: NASA Earth Observatory, Black Marble 2016 (VIIRS Day/Night Band),
grayscale 0.1° global composite of cloud-free nights of 2016 — a REFERENCE image, never live observation.
Terms: NASA Images and Media Usage Guidelines (generally not subject to copyright in the US; NASA acknowledged as the
source; no endorsement implied).

Builds ref/night-lights-2016.webp (2700×1350, about 0.133°, WebP q45) for both public folders: the most detail of the
source that fits the opening map's budget (O6 ≤ 1,000 KB); no pixel is invented. Run once by the author; no request to NASA happens at run time. Neutral project User-Agent only."""

import hashlib
import io
import pathlib
import urllib.request

from PIL import Image

SRC = ("https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/"
       "BlackMarble_2016_01deg_gray.jpg")
UA = "NEXUM/0.1.0 (+https://github.com/pezzaliapp/NEXUM; local-first open-data research)"
ROOT = pathlib.Path(__file__).resolve().parent.parent

raw = urllib.request.urlopen(urllib.request.Request(SRC, headers={"User-Agent": UA}), timeout=120).read()
im = Image.open(io.BytesIO(raw)).convert("L")
assert im.size == (3600, 1800), im.size
out = io.BytesIO()
im.resize((2700, 1350), Image.LANCZOS).save(out, "WEBP", quality=45, method=6)
data = out.getvalue()
for d in ("public", "web-public"):
    (ROOT / d / "ref").mkdir(parents=True, exist_ok=True)
    (ROOT / d / "ref" / "night-lights-2016.webp").write_bytes(data)
print("source sha256", hashlib.sha256(raw).hexdigest(), len(raw))
print("asset sha256", hashlib.sha256(data).hexdigest(), len(data))
