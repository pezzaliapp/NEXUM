"""Public webcams of OPEN-DATA publishers (World Intelligence, 2026-10-03; gate in the discovery report): the list of
cameras with their position and the stable URL of the CURRENT still image, as each publisher releases it. Image bytes
are never fetched, copied or archived: the browser asks the publisher for the image only when the person opens it.

Providers (one registry source each, with its own licence; the module serves them by source id):
  hk.td_cctv          Transport Department, HKSAR — DATA.GOV.HK terms (reuse with attribution)        1,013 cameras
  is.vegagerdin       Vegagerðin (IRCA) — CC BY 4.0 (attribution with the download date)               ~496 views
  es.madrid_traffic   Ayuntamiento de Madrid — CC BY 4.0                                               ~357 cameras
  fr.lyon_criter      Métropole de Lyon, CRITER — Licence Ouverte v2.0                                 ~15 cameras
  ch.geneve_sitg      SITG, État de Genève — opendata.swiss "open use"                                 ~9 cameras"""

import datetime as dt
import html
import json
import re
import xml.etree.ElementTree as ET

from connectors.webcam_common import camera, f
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
LISTS = {
    "hk.td_cctv": "https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml",
    "is.vegagerdin": "https://gagnaveita.vegagerdin.is/api/vefmyndavelar2014_1",
    "es.madrid_traffic": "https://datos.madrid.es/dataset/202088-0-trafico-camaras/resource/202088-0-trafico-camaras/download/202088-0-trafico-camaras",
    "fr.lyon_criter": "https://data.grandlyon.com/geoserver/metropole-de-lyon/ows?SERVICE=WFS&VERSION=2.0.0&request=GetFeature"
                      "&typename=metropole-de-lyon:pvo_patrimoine_voirie.pvocameracriter&outputFormat=application/json&SRSNAME=EPSG:4326",
    "ch.geneve_sitg": "https://vector.sitg.ge.ch/arcgis/rest/services/Hosted/INFOMOB_CAMERA/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json",
}


def describe():
    return {"connector_version": VERSION, "produces": ["camera.public_webcam"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(LISTS[source.id], f"{source.id}.list")]


def next_state(state, request, result, today=None):
    return state


def _day(meta):
    ms = meta.get("fetched_ms")
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).date().isoformat() if ms else None


def parse(data: bytes, meta: dict):
    sid = meta["source_id"]
    if sid == "hk.td_cctv":
        root = ET.fromstring(data)
        for i, im in enumerate(root.findall("image")):
            g = lambda k: (im.findtext(k) or "").strip()   # noqa: E731
            rec = camera(meta, g("key"), "hk_td_cctv", g("description"), f(g("longitude")), f(g("latitude")), g("url"),
                         operator="Transport Department, HKSAR", subject="traffico stradale", refresh_min=2.0,
                         credit="Source: Transport Department, HKSAR Government / DATA.GOV.HK",
                         place_note=", ".join(x for x in (g("district"), g("region"), "Hong Kong") if x), locator=f"image[{i}]",
                         text=f"{g('district')} {g('region')} Hong Kong traffic camera webcam")
            if rec:
                yield rec
    elif sid == "is.vegagerdin":
        day = _day(meta)
        for i, c in enumerate(json.loads(data.decode("utf-8"))):
            url = c.get("Slod") or ""
            cid = url.rsplit("/", 1)[-1].rsplit(".", 1)[0] or str(c.get("Maelist_nr"))
            rec = camera(meta, cid, "vegagerdin_cam", f"{c.get('Myndavel')} — {c.get('Skyring')}", f(c.get("Lengd")), f(c.get("Breidd")), url,
                         operator="Vegagerðin (Icelandic Road and Coastal Administration)", subject="strada e condizioni meteo",
                         credit=f"Vegagerðin (IRCA) – Vefmyndavélar, scaricato il {day}, CC BY 4.0" if day else "Vegagerðin (IRCA) – Vefmyndavélar, CC BY 4.0",
                         route=c.get("Vegheiti"), place_note="Islanda", locator=f"[{i}]", text=f"{c.get('Myndavel')} Iceland Islanda webcam")
            if rec:
                yield rec
    elif sid == "es.madrid_traffic":
        text = data.decode("utf-8-sig")
        for i, pm in enumerate(re.findall(r"<Placemark>(.*?)</Placemark>", text, re.S)):
            num = re.search(r'<Data name="Numero">\s*<Value>([^<]+)</Value>', pm)
            name = re.search(r'<Data name="Nombre">\s*<Value>([^<]+)</Value>', pm)
            co = re.search(r"<coordinates>\s*([-0-9.]+),([-0-9.]+)", pm)
            img = re.search(r"src=(https://informo\.madrid\.es/cameras/Camara[0-9A-Za-z_]+\.jpg)", html.unescape(pm))
            if not (num and co and img):
                continue
            rec = camera(meta, num.group(1), "madrid_cam", f"Madrid · {name.group(1).strip() if name else num.group(1)}", f(co.group(1)), f(co.group(2)),
                         img.group(1), operator="Ayuntamiento de Madrid", subject="traffico stradale",
                         credit="Ayuntamiento de Madrid – datos.madrid.es, CC BY 4.0", place_note="Madrid, Spagna",
                         locator=f"Placemark[{i}]", text="Madrid tráfico traffic webcam")
            if rec:
                yield rec
    elif sid == "fr.lyon_criter":
        for i, ft in enumerate(json.loads(data.decode("utf-8")).get("features") or []):
            p, g = ft.get("properties") or {}, (ft.get("geometry") or {}).get("coordinates") or [None, None]
            rec = camera(meta, p.get("numeromaintenance") or str(p.get("identifiant")), "lyon_criter",
                         f"Lyon · {p.get('nom')} — {p.get('libellelong')}", f(g[0]), f(g[1]), p.get("url"),
                         operator="Métropole de Lyon (CRITER)", subject="traffico stradale",
                         credit="Métropole de Lyon – CRITER, Licence Ouverte v2.0", place_note="Lione, Francia",
                         locator=f"$.features[{i}]", text="Lyon traffic webcam")
            if rec:
                yield rec
    elif sid == "ch.geneve_sitg":
        for i, ft in enumerate(json.loads(data.decode("utf-8")).get("features") or []):
            a, g = ft.get("attributes") or {}, ft.get("geometry") or {}
            url = a.get("image_aller") or a.get("image_retour")
            rec = camera(meta, str(a.get("globalid") or a.get("objectid")), "geneve_sitg", f"Ginevra · {a.get('nom')}",
                         f(g.get("x")), f(g.get("y")), url, operator="État de Genève (SITG)", subject="traffico stradale",
                         credit="SITG – État de Genève (opendata.swiss, open use)", place_note="Ginevra, Svizzera",
                         locator=f"$.features[{i}]", text="Genève Geneva traffic webcam")
            if rec:
                yield rec
