"""More public webcams (2026-10-04, completion of the observation coverage): official and openly licensed camera lists
of Europe and Italy, each source with its own terms, verified one by one (research of 2026-10-04, NEXUM's neutral
User-Agent, no key, no Referer, no login). Image bytes are never fetched, copied or archived here.

CURRENT IMAGE (the publisher allows its current still image elsewhere; loaded by the browser on request):
  uk.tfl_jamcams      Transport for London JamCams — TfL transport data licence (OGL v2 based), "Powered by TfL Open Data"
  lu.cita             CITA, Administration des ponts et chaussées (Luxembourg) — data.public.lu, CC0
  es.meteogalicia     MeteoGalicia (Xunta de Galicia) weather cameras — CC BY-SA 4.0
  es.euskadi_traffic  Open Data Euskadi traffic cameras — CC BY 4.0 (https images only; the others: link only)
  eu.foto_webcam      foto-webcam.eu network (AT, DE, IT, CH…) — "Eine Live-Einbindung des Kamerabildes ist erlaubt, wenn
                      bei einem Klick auf das Bild obiger Link geöffnet wird" + clickable credit www.foto-webcam.eu, whole
                      16:9 image (no crop, no stretch): the viewer opens the camera page on click and links the credit
  it.meteotrentino    Meteotrentino, Provincia autonoma di Trento — CC BY 4.0 (station positions: its open station list)
  it.venezia_maree    Comune di Venezia, Centro Previsioni e Segnalazioni Maree — CC BY 3.0 IT

  tw.thb_cctv         Highway Bureau (公路局), Taiwan — Open Government Data License v1 (CC BY 4.0 compatible); /snapshot
  tw.wra_cctv         Water Resources Agency (水利署), Taiwan — Open Government Data License v1
  us.iowa_dot         Iowa DOT traffic and road-weather cameras — CC BY 4.0
  us.wsdot            Washington State DOT highway cameras — KML offered on WSDOT's public traveler API page
  ca.toronto          City of Toronto traffic cameras — Open Government Licence – Toronto
  ca.ontario_mto      Ontario Ministry of Transportation cameras (511on images) — Open Government Licence – Ontario

LINK ONLY (the list is open, the images are not licensed for reuse, or not served over https):
  ca.quebec_mtmd      Québec Ministère des Transports et de la Mobilité durable — CC BY 4.0 list, viewer page only
  es.dgt              DGT, Dirección General de Tráfico (Spain) — positions from the National Access Point (CC BY);
                      the DGT legal notice reserves the images: link to the publisher's image only
  es.catalonia_sct    Servei Català de Trànsit — images served over http only
  es.vigo             Concello de Vigo — ODC-BY list, images over http only
  it.odh_webcams      Open Data Hub Südtirol / NOI — CC0 list; "links … may be covered by a different licence"
  it.arpa_fvg         ARPA FVG – OSMER webcam list — CC BY-SA 3.0 IT; images of third-party publishers
  it.ingv_oe          INGV Osservatorio Etneo webcams (Etna, Stromboli, Vulcano) — no stable image URL: link only"""

import csv
import hashlib
import html
import io
import json
import math
import re
import xml.etree.ElementTree as ET

from connectors.webcam_common import camera, f, finalize, link_camera
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"
LISTS = {
    "uk.tfl_jamcams": ["https://api.tfl.gov.uk/Place/Type/JamCam"],
    "lu.cita": ["https://www.cita.lu/kml/cameras.kml"],
    "es.meteogalicia": ["https://servizos.meteogalicia.gal/mgrss/observacion/jsonCamaras.action"],
    "es.euskadi_traffic": [f"https://api.euskadi.eus/traffic/v1.0/cameras?_page={i}" for i in range(1, 31)],
    "eu.foto_webcam": ["https://www.foto-webcam.eu/"],
    "it.meteotrentino": ["https://dati.meteotrentino.it/service.asmx/listaStazioni"],
    "it.venezia_maree": ["https://www.comune.venezia.it/it/content/webcam-0"],
    "es.dgt": ["https://www.dgt.es/.content/.assets/json/camaras.json"],
    "es.catalonia_sct": ["https://www.gencat.cat/transit/opendata/cameres.kml"],
    "es.vigo": ["https://datos.vigo.org/data/trafico/camaras-trafico.json"],
    "it.odh_webcams": ["https://tourism.api.opendatahub.com/v1/WebcamInfo?pagesize=5000&removenullvalues=true"],
    "it.arpa_fvg": ["https://www.meteo.fvg.it/ajax/webcamList.php"],
    "it.ingv_oe": ["https://www.ct.ingv.it/sezioniesterne/webcam/WebcamEtna.php"],
    "tw.thb_cctv": ["https://cctv-maintain.thb.gov.tw/opendataCCTVs.xml"],
    "tw.wra_cctv": ["https://opendata.wra.gov.tw/api/v2/f71b74eb-cbe5-42c6-8be5-7500450e7db0?format=JSON"],
    "us.iowa_dot": ["https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query"
                    "?where=1%3D1&outFields=*&outSR=4326&f=json&resultRecordCount=5000"],
    "us.wsdot": ["https://www.wsdot.wa.gov/Traffic/api/HighwayCameras/kml.aspx"],
    "ca.toronto": ["https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/a3309088-5fd4-4d34-8297-77c8301840ac/resource/"
                   "8f9d6db7-faa0-405c-9627-b0298489cf9f/download/traffic-camera-list-4326.csv"],
    "ca.ontario_mto": ["https://services.arcgis.com/6iGx1Dq91oKtcE7x/arcgis/rest/services/MTO_Cameras/FeatureServer/0/query"
                       "?where=1%3D1&outFields=*&outSR=4326&f=json&resultRecordCount=5000"],
    "ca.quebec_mtmd": ["https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:infos_cameras"
                       "&outfile=Camera&srsname=EPSG:4326&outputformat=geojson"],
}

# Meteotrentino: the cameras of its webcam page (image file → station of the open station list)
TRENTINO = {"T094_last.jpg": "T0094", "T153_last.jpg": "T0153", "T374_last.jpg": "T0374", "T384_last.jpg": "T0384",
            "T406_last.jpg": "T0406", "T407_last.jpg": "T0407", "T429_last.jpg": "T0429", "T450_last.jpg": "T0450",
            "bissina/bissina_05_.jpg": "T0373", "pejo/pejo_05_.jpg": "T0366", "trento_laste/trentoLaste1_37.jpg": "T0129"}
# Venezia, Centro Maree: the four places of its cameras (position of the building/landmark the page names, ±200 m)
VENEZIA = {"murano": ("Murano · Faro", 12.3539, 45.4572), "rialto": ("Rialto · Palazzo Cavalli", 12.3333, 45.4366),
           "salute": ("Punta della Dogana · Salute", 12.3364, 45.4306), "smarco": ("San Marco · Torre dell'Orologio", 12.3393, 45.4347)}
# INGV-OE: the webcam pages of each volcano (point: the volcano's summit area, the cameras ring it)
INGV = [("etna", "Webcam INGV dell'Etna (9 telecamere)", "https://www.ct.ingv.it/sezioniesterne/webcam/WebcamEtna.php", 14.9934, 37.7510, "Etna"),
        ("stromboli", "Webcam INGV di Stromboli", "https://www.ct.ingv.it/sezioniesterne/webcam/WebcamEolie.php", 15.2133, 38.7892, "Stromboli, Isole Eolie"),
        ("vulcano", "Webcam INGV di Vulcano", "https://www.ct.ingv.it/sezioniesterne/webcam/WebcamEolie.php", 14.9620, 38.4040, "Vulcano, Isole Eolie")]


def _h(*parts):
    """A short stable identifier for a camera the publisher gives no id to (its page or image URL, its place): the
    search index stays light (an URL as identifier adds a dozen unique words per camera)."""
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:12]


def describe():
    return {"connector_version": VERSION, "produces": ["camera.public_webcam"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(u, f"{source.id}.{i}") for i, u in enumerate(LISTS[source.id])]


def next_state(state, request, result, today=None):
    return state


def utm_to_lonlat(e, n, zone=30):
    """ETRS89 / UTM (northern hemisphere) to longitude/latitude (Karney-free series; < 1 m in the zone)."""
    a, f_ = 6378137.0, 1 / 298.257222101
    k0, e2 = 0.9996, f_ * (2 - f_)
    ep2 = e2 / (1 - e2)
    x, y = e - 500000.0, n
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    p = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
         + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    c1, t1 = ep2 * math.cos(p) ** 2, math.tan(p) ** 2
    n1 = a / math.sqrt(1 - e2 * math.sin(p) ** 2)
    r1 = a * (1 - e2) / (1 - e2 * math.sin(p) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = p - (n1 * math.tan(p) / r1) * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
                                         + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720)
    lon = (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(p)
    return round((zone - 1) * 6 - 180 + 3 + math.degrees(lon), 6), round(math.degrees(lat), 6)


def _local(t, tz):
    """A local time without offset, as the publisher writes it, with its zone's offset (the clock of finalize())."""
    import datetime as dt
    from zoneinfo import ZoneInfo
    try:
        return dt.datetime.fromisoformat(t).replace(tzinfo=ZoneInfo(tz)).isoformat() if t else None
    except ValueError:
        return None


def _kml_placemarks(text):
    for i, pm in enumerate(re.findall(r"<Placemark\b.*?</Placemark>", text, re.S)):
        name = re.search(r"<name>(.*?)</name>", pm, re.S)
        co = re.search(r"<coordinates>\s*([-0-9.]+),([-0-9.]+)", pm)
        desc = re.search(r"<description>(.*?)</description>", pm, re.S)
        d = html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", desc.group(1))) if desc else ""
        nm = re.sub(r"<!\[CDATA\[|\]\]>", "", name.group(1)).strip() if name else None
        yield i, html.unescape(nm) if nm else None, (f(co.group(1)), f(co.group(2))) if co else (None, None), d


def parse(data: bytes, meta: dict):
    seen, out = set(), []
    for r in _parse(data, meta):
        if r and r.native_id not in seen:          # a list that repeats a camera: the first record is kept
            seen.add(r.native_id)
            out.append(r)
    yield from finalize(out)


def _parse(data, meta):
    sid = meta["source_id"]
    text = data.decode("utf-8-sig", errors="replace")
    if sid == "uk.tfl_jamcams":
        for i, c in enumerate(json.loads(text)):
            ap = {p["key"]: p for p in c.get("additionalProperties") or []}
            img = (ap.get("imageUrl") or {}).get("value")
            yield camera(meta, c["id"], "tfl_jamcam", f"Londra · {c.get('commonName')}", f(c.get("lon")), f(c.get("lat")), img,
                         operator="Transport for London", subject="traffico stradale", refresh_min=None,
                         credit="Powered by TfL Open Data", in_service=(ap.get("available") or {}).get("value") == "true",
                         record_updated_at=(ap.get("imageUrl") or {}).get("modified"), place_note="Londra, Regno Unito",
                         route=(ap.get("view") or {}).get("value"), locator=f"[{i}]", text="London Londra traffic JamCam webcam TfL")
    elif sid == "lu.cita":
        for i, name, (lon, lat), d in _kml_placemarks(text):
            m = re.search(r"https://www\.cita\.lu/webcam/map/(\d+)", d)
            if not m:
                continue
            n = m.group(1)
            yield camera(meta, n, "cita_cam", f"Lussemburgo · {name}", lon, lat, f"https://www.cita.lu/info_trafic/cameras/images/cccam_{n}.jpg",
                         operator="CITA – Administration des ponts et chaussées", subject="traffico autostradale",
                         credit="CITA (data.public.lu, CC0)", place_note="Lussemburgo", locator=f"Placemark[{i}]",
                         page_url=f"https://www.cita.lu/webcam/map/{n}", text="Luxembourg Lussemburgo autoroute CITA webcam")
    elif sid == "es.meteogalicia":
        for i, c in enumerate(json.loads(text).get("listaCamaras") or []):
            yield camera(meta, f"{c.get('identificador')}:{(c.get('imaxeCamara') or '').rsplit('/', 2)[-2]}", "meteogalicia_cam", f"{c.get('nomeCamara')} (Galizia)", f(c.get("lon")), f(c.get("lat")),
                         c.get("imaxeCamara"), operator="MeteoGalicia (Xunta de Galicia)", subject="paesaggio e condizioni meteo",
                         credit="MeteoGalicia – Xunta de Galicia, CC BY-SA 4.0", observed_at=c.get("dataUltimaAct"),
                         place_note=f"{c.get('concello')}, {c.get('provincia')}, Spagna", locator=f"$.listaCamaras[{i}]",
                         text=f"{c.get('concello')} Galicia Galizia webcam MeteoGalicia")
    elif sid == "es.euskadi_traffic":
        for i, c in enumerate(json.loads(text).get("cameras") or []):
            e, n = f(c.get("longitude")), f(c.get("latitude"))
            if e is None or n is None or not (100000 < e < 900000 and 4000000 < n < 5000000):
                continue
            lon, lat = utm_to_lonlat(e, n, 30)
            url, label = c.get("urlImage") or "", f"Paesi Baschi · {c.get('cameraName')}"
            common = dict(operator="Amministrazioni dei Paesi Baschi (Open Data Euskadi)", place_note=f"{c.get('address') or ''}, Paesi Baschi, Spagna".lstrip(", "),
                          locator=f"$.cameras[{i}]", text="Euskadi País Vasco Paesi Baschi tráfico traffic webcam")
            if url.startswith("https://"):
                yield camera(meta, c.get("cameraId"), "euskadi_cam", label, lon, lat, url, subject="traffico stradale",
                             credit="Open Data Euskadi, CC BY 4.0", route=c.get("road"), **common)
            elif url.startswith("http://"):
                yield link_camera(meta, c.get("cameraId"), "euskadi_cam", label, lon, lat, url, subject="traffico stradale",
                                  reason="L'immagine è pubblicata solo senza connessione sicura (http): NEXUM non la mostra, la apre dal gestore.", **common)
    elif sid == "eu.foto_webcam":
        m = re.search(r"var metadata\s*=\s*new Object\((\{.*?\})\);", text, re.S)
        for i, c in enumerate(json.loads(m.group(1)).get("cams") or [] if m else []):
            if c.get("hidden"):
                continue
            link = c.get("link") or ""
            img = (c.get("imgurl") or "").replace("/current/400.jpg", "/current/720.jpg")
            yield camera(meta, c.get("id"), "foto_webcam", c.get("title") or c.get("name"), f(c.get("longitude")), f(c.get("latitude")), img,
                         operator="foto-webcam.eu (rete di webcam non commerciale)", subject=c.get("name"),
                         refresh_min=(f(c.get("captureInterval")) or 0) / 60 or None, credit="www.foto-webcam.eu", credit_url="https://www.foto-webcam.eu/",
                         in_service=not c.get("offline"), page_url=link,
                         observed_at=__import__("datetime").datetime.fromtimestamp(c["modtime"], __import__("datetime").timezone.utc).isoformat() if c.get("modtime") else None,
                         place_note=(c.get("keywords") or "").split(",")[-1] or None, locator=f"metadata.cams[{i}]",
                         text=f"{c.get('name')} {c.get('keywords')} webcam")
    elif sid == "it.meteotrentino":
        st = {c: (n, f(lo), f(la)) for c, n, la, lo in re.findall(
            r"<codice>(.*?)</codice>\s*<nome>(.*?)</nome>.*?<latitudine>(.*?)</latitudine>\s*<longitudine>(.*?)</longitudine>", text, re.S)}
        for i, (file, code) in enumerate(TRENTINO.items()):
            if code not in st:
                continue
            name, lon, lat = st[code]
            yield camera(meta, code, "meteotrentino_cam", f"Trentino · {html.unescape(name)}", lon, lat,
                         f"https://contenuti.meteotrentino.it/dati-meteo/webcam/{file}", operator="Meteotrentino – Provincia autonoma di Trento",
                         subject="montagna e condizioni meteo", credit="Meteotrentino – Provincia autonoma di Trento, CC BY 4.0",
                         page_url="https://www.meteotrentino.it/dati/meteo/webcam/", place_note="Trentino, Italia",
                         locator=f"stazione {code}", text=f"{name} Trentino Trento webcam meteo montagna")
    elif sid == "it.venezia_maree":
        files = sorted(set(re.findall(r"publicCPSM2/webcam/([a-z]+web\d)\.jpg", text)))
        for file in files:
            site = re.match(r"([a-z]+?)web", file).group(1)
            if site not in VENEZIA:
                continue
            label, lon, lat = VENEZIA[site]
            yield camera(meta, file, "venezia_maree_cam", f"Venezia · {label} ({file[-1]})", lon, lat,
                         f"https://www.comune.venezia.it/sites/default/files/publicCPSM2/webcam/{file}.jpg",
                         operator="Comune di Venezia – Centro Previsioni e Segnalazioni Maree", subject="laguna, marea e passerelle",
                         refresh_min=20.0, credit="Comune di Venezia, CC BY 3.0", page_url="https://www.comune.venezia.it/it/content/webcam-0",
                         place_note="Venezia, Italia", locator=file, text="Venezia Venice laguna marea acqua alta webcam")
    elif sid == "es.dgt":
        for i, c in enumerate(json.loads(text).get("camaras") or []):
            yield link_camera(meta, c.get("id"), "dgt_cam", f"{c.get('carretera')} km {c.get('pk')} (DGT)", f(c.get("longitud")), f(c.get("latitud")),
                              c.get("imagen"), operator="DGT – Dirección General de Tráfico", subject="traffico stradale",
                              place_note="Spagna", locator=f"$.camaras[{i}]",
                              reason="La DGT riserva le proprie immagini: NEXUM indica dove si trova la telecamera e apre l'immagine sul sito della DGT.",
                              text=f"{c.get('carretera')} DGT España Spagna tráfico traffic webcam")
    elif sid == "es.catalonia_sct":
        for i, name, (lon, lat), d in _kml_placemarks(text):
            m = re.search(r'src="(https?://[^"]+)"', d)
            if not m:
                continue
            mun = re.search(r"Municipi:\s*</strong>\s*([^<]+)", d)
            yield link_camera(meta, _h(m.group(1), name), "sct_cam", f"Catalogna · {name}", lon, lat, m.group(1),
                              operator="Servei Català de Trànsit (Generalitat de Catalunya)", subject="traffico stradale",
                              place_note=f"{mun.group(1).strip().title() if mun else ''}, Catalogna, Spagna".lstrip(", "), locator=f"Placemark[{i}]",
                              reason="L'immagine è pubblicata solo senza connessione sicura (http): NEXUM la apre sul sito del gestore.",
                              text="Catalunya Catalonia Catalogna trànsit traffic webcam")
    elif sid == "es.vigo":
        for i, c in enumerate(json.loads(text)):
            yield link_camera(meta, c.get("id"), "vigo_cam", f"Vigo · {c.get('nombre')}", f(c.get("lon")), f(c.get("lat")), c.get("url"),
                              operator="Concello de Vigo", subject="traffico urbano", place_note="Vigo, Galizia, Spagna", locator=f"[{i}]",
                              reason="L'immagine è pubblicata solo senza connessione sicura (http): NEXUM la apre sul sito del Comune.",
                              text="Vigo tráfico traffic webcam")
    elif sid == "it.odh_webcams":
        for i, c in enumerate(json.loads(text).get("Items") or []):
            if not c.get("Active"):
                continue
            g = (c.get("GpsInfo") or [{}])[0]
            page = c.get("Webcamurl") or ((c.get("WebCamProperties") or {}).get("WebcamUrl"))
            if not page:
                imgs = c.get("ImageGallery") or []
                page = imgs[0].get("ImageUrl") if imgs else None
            title = c.get("Shortname") or next(iter((c.get("Detail") or {}).values()), {}).get("Title")
            src = (c.get("_Meta") or {}).get("Source") or c.get("Source")
            yield link_camera(meta, c.get("Id"), "odh_webcam", title, f(g.get("Longitude")), f(g.get("Latitude")), page,
                              operator=f"{src} (via Open Data Hub Südtirol)", subject="paesaggio, montagna, strade",
                              place_note="Alto Adige / Südtirol e dintorni", locator=f"$.Items[{i}]",
                              reason="Open Data Hub pubblica l'elenco con licenza aperta, ma non le immagini (che restano dei loro gestori): NEXUM apre la pagina del gestore.",
                              text=f"{title} Südtirol Alto Adige Dolomiti webcam")
    elif sid == "it.arpa_fvg":
        for i, c in enumerate(json.loads(text)):
            fonte = re.search(r"fonte\s+(.+)$", c.get("descrizione") or "")
            yield link_camera(meta, _h(c.get("nome"), c.get("url")), "arpafvg_cam", c.get("nome"), f(c.get("lon")), f(c.get("lat")),
                              c.get("url"), operator=(fonte.group(1).strip() if fonte else "gestore indicato da ARPA FVG"),
                              subject=c.get("descrizione"), place_note="Friuli Venezia Giulia e dintorni", locator=f"[{i}]",
                              reason="Elenco ARPA FVG – OSMER (CC BY-SA 3.0 IT); le immagini appartengono ai loro gestori: NEXUM apre la loro pagina.",
                              text=f"{c.get('nome')} Friuli Venezia Giulia FVG webcam")
    elif sid == "it.ingv_oe":
        if "webcam" not in text.lower():
            return
        for key, label, page, lon, lat, place in INGV:
            yield link_camera(meta, key, "ingv_oe_webcam", label, lon, lat, page, operator="INGV – Osservatorio Etneo",
                              subject="attività del vulcano", place_note=f"{place}, Sicilia, Italia", uncertainty_m=5000.0, locator=key, country="IT",
                              reason="L'INGV pubblica le immagini con nomi che cambiano a ogni ripresa (nessun indirizzo stabile): NEXUM apre la pagina dell'INGV.",
                              text=f"{place} vulcano volcano INGV webcam Sicilia")
    elif sid == "tw.thb_cctv":
        for i, c in enumerate(re.findall(r"<CCTV>(.*?)</CCTV>", text, re.S)):
            g = lambda k: html.unescape((re.search(f"<{k}>(.*?)</{k}>", c, re.S) or [None, ""])[1].strip())   # noqa: E731
            yield camera(meta, g("CCTVID"), "thb_cctv", f"Taiwan · {g('SurveillanceDescription') or g('RoadName')}", f(g("PositionLon")), f(g("PositionLat")),
                         g("VideoImageURL").replace(".thb.gov.tw:443/", ".thb.gov.tw/"), operator="Highway Bureau, MOTC (Taiwan)", subject="traffico stradale", route=g("RoadName"),
                         credit="交通部公路局 Highway Bureau – Open Government Data License v1", place_note="Taiwan",
                         locator=f"CCTV[{i}]", text=f"{g('RoadName')} {g('SurveillanceDescription')} Taiwan 台灣 traffic webcam")
    elif sid == "tw.wra_cctv":
        for i, c in enumerate(json.loads(text)):
            yield camera(meta, c.get("cameraid"), "wra_cctv", f"Taiwan · {c.get('cameraname')}", f(c.get("longitude_4326")), f(c.get("latitude_4326")),
                         c.get("imageurl"), operator="Water Resources Agency, MOEA (Taiwan)", subject="corsi d'acqua e opere idrauliche",
                         credit="經濟部水利署 Water Resources Agency – Open Government Data License v1", in_service=str(c.get("status")) == "1",
                         place_note=f"{c.get('administrativedistrictwherethemonitoringpointislocated') or ''} {c.get('countiesandcitieswherethemonitoringpointsarelocated') or ''}, Taiwan".strip(),
                         locator=f"[{i}]", text=f"{c.get('cameraname')} {c.get('basinname')} {c.get('countiesandcitieswherethemonitoringpointsarelocated')} Taiwan river webcam")
    elif sid == "us.iowa_dot":
        for i, ft in enumerate(json.loads(text).get("features") or []):
            a = ft.get("attributes") or {}
            yield camera(meta, _h(a.get("ImageURL") or a.get("device_id")), "iowa_dot_cam", f"Iowa · {a.get('Desc_')}", f(a.get("longitude")), f(a.get("latitude")), a.get("ImageURL"),
                         operator="Iowa Department of Transportation", subject="strada e condizioni meteo" if a.get("Type") == "RWIS" else "traffico stradale",
                         credit="Iowa DOT, CC BY 4.0", route=a.get("Route"), place_note="Iowa, Stati Uniti", locator=f"$.features[{i}]",
                         text=f"{a.get('Desc_')} Iowa traffic webcam")
    elif sid == "us.wsdot":
        for i, name, (lon, lat), d in _kml_placemarks(text):
            m = re.search(r'src="(https?://[^"]+)"', d)
            if not m:
                continue
            if not m.group(1).startswith("https://images.wsdot.wa.gov/"):
                # a camera of another publisher listed by WSDOT (another state, a business, an airport): WSDOT cannot
                # license its image — link only
                yield link_camera(meta, _h(m.group(1), round(lon or 0, 4), round(lat or 0, 4)), "wsdot_cam", f"Washington · {name}", lon, lat, m.group(1), operator="gestore indicato da WSDOT",
                                  subject="strada o località", place_note="Washington, Stati Uniti", locator=f"Placemark[{i}]",
                                  reason="Telecamera di un altro gestore elencata da WSDOT: NEXUM non ne mostra l'immagine, la apre dal gestore.",
                                  text=f"{name} Washington webcam")
                continue
            yield camera(meta, _h(m.group(1), round(lon or 0, 4), round(lat or 0, 4)), "wsdot_cam",
                         f"Washington · {name}", lon, lat, m.group(1), operator="Washington State Department of Transportation",
                         subject="traffico stradale", credit="WSDOT", place_note="Washington, Stati Uniti", locator=f"Placemark[{i}]",
                         text=f"{name} Washington Seattle WSDOT traffic webcam")
    elif sid == "ca.toronto":
        for i, r in enumerate(csv.DictReader(io.StringIO(text))):
            try:
                lon, lat = json.loads(r.get("geometry") or "{}")["coordinates"][0] if json.loads(r["geometry"])["type"] == "MultiPoint" else json.loads(r["geometry"])["coordinates"]
            except (KeyError, ValueError, TypeError, IndexError):
                continue
            yield camera(meta, r.get("REC_ID"), "toronto_cam", f"Toronto · {(r.get('MAINROAD') or '').title()} / {(r.get('CROSSROAD') or '').title()}",
                         f(lon), f(lat), r.get("IMAGEURL"), operator="City of Toronto", subject="traffico urbano",
                         credit="Contains information licensed under the Open Government Licence – Toronto", place_note="Toronto, Canada",
                         locator=f"row:{i + 2}", text=f"Toronto {r.get('MAINROAD')} {r.get('CROSSROAD')} traffic webcam")
    elif sid == "ca.ontario_mto":
        for i, ft in enumerate(json.loads(text).get("features") or []):
            a = ft.get("attributes") or {}
            name = a.get("Name") if a.get("Name") and a.get("Name") != "English location" else a.get("RoadwayName")
            yield camera(meta, a.get("Id"), "mto_cam", f"Ontario · {name}", f(a.get("Longitude")), f(a.get("Latitude")), a.get("Url"),
                         operator="Ontario Ministry of Transportation (511 Ontario)", subject="traffico e condizioni stradali",
                         credit="Contains information licensed under the Open Government Licence – Ontario", in_service=a.get("Status") == "Enabled",
                         route=a.get("RoadwayName"), place_note=f"{a.get('CityName') or ''} Ontario, Canada".strip(), locator=f"$.features[{i}]",
                         text=f"{name} {a.get('RoadwayName')} {a.get('CityName') or ''} Ontario traffic webcam")
    elif sid == "ca.quebec_mtmd":
        for i, ft in enumerate(json.loads(text).get("features") or []):
            p, g = ft.get("properties") or {}, (ft.get("geometry") or {}).get("coordinates") or [None, None]
            yield link_camera(meta, p.get("IDEcamera"), "quebec_cam", f"Québec · {p.get('DescriptionLocalisationFr')}", f(g[0]), f(g[1]),
                              p.get("URL_FLUX_DONNEE"), operator="Ministère des Transports et de la Mobilité durable du Québec",
                              subject="traffico stradale", place_note=f"{p.get('NomRegionDiffusion') or ''}, Québec, Canada".lstrip(", "),
                              locator=f"$.features[{i}]",
                              reason="Il Québec pubblica con licenza aperta l'elenco delle telecamere, non le immagini: NEXUM apre il visualizzatore di Québec 511.",
                              text=f"{p.get('DescriptionLocalisationFr')} Québec traffic webcam")

