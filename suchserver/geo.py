"""Orte -> Koordinaten, kostenlos und ohne Schlüssel.

1. Offline: Postleitzahlen-Tabelle von GeoNames (Deutschland, Österreich, Schweiz; Lizenz CC BY 4.0),
   wird beim ersten Start einmal heruntergeladen und lokal gespeichert.
2. Online-Rückfall: OpenStreetMap Nominatim (max. 1 Anfrage/Sekunde laut Nutzungsrichtlinie, Ergebnisse werden gespeichert).
"""
from __future__ import annotations

import io
import json
import math
import os
import re
import threading
import time
import zipfile

import requests

DATA = os.getenv("BL_DATA", os.path.join(os.path.dirname(__file__), "data"))
GEONAMES = "https://download.geonames.org/export/zip/{cc}.zip"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "Bewerbungslotse-Suchserver/1.0 (privat, selbst gehostet)"

_plz: dict[str, tuple[float, float]] = {}
_city: dict[str, tuple[float, float]] = {}
_cache: dict[str, list | None] = {}
_lock = threading.Lock()
_last_nom = 0.0


def _norm(s: str) -> str:
    s = (s or "").lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = re.sub(r"\(.*?\)|\b(bei|an der|am|im|in der|kreis|landkreis|stadt)\b", " ", s)
    return re.sub(r"[^a-z]+", " ", s).strip()


def load(countries=("DE", "AT", "CH")) -> None:
    os.makedirs(DATA, exist_ok=True)
    for cc in countries:
        path = os.path.join(DATA, f"plz_{cc}.txt")
        if not os.path.exists(path):
            try:
                z = zipfile.ZipFile(io.BytesIO(requests.get(GEONAMES.format(cc=cc), timeout=60, headers={"User-Agent": UA}).content))
                with open(path, "wb") as f:
                    f.write(z.read(f"{cc}.txt"))
            except Exception as e:  # ohne Internet: später Nominatim
                print(f"[geo] Postleitzahlen {cc} nicht geladen (kein Internet?) – Entfernungen werden später online ermittelt.")
                continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                p = line.rstrip("\n").split("\t")
                if len(p) < 11 or not p[9]:
                    continue
                c = (float(p[9]), float(p[10]))
                _plz.setdefault(p[1], c)
                _city.setdefault(_norm(p[2]), c)
    cpath = os.path.join(DATA, "geocache.json")
    if os.path.exists(cpath):
        try:
            _cache.update(json.load(open(cpath, encoding="utf-8")))
        except Exception:
            pass


def _save_cache():
    try:
        json.dump(_cache, open(os.path.join(DATA, "geocache.json"), "w", encoding="utf-8"))
    except Exception:
        pass


def coords(place: str, online: bool = True):
    if not place:
        return None
    m = re.search(r"\b(\d{5}|\d{4})\b", place)
    if m and m.group(1) in _plz:
        return _plz[m.group(1)]
    n = _norm(place)
    if n in _city:
        return _city[n]
    for part in re.split(r"[,/|–-]", place):   # "Berlin, BE, DE" / "München - Schwabing"
        pn = _norm(part)
        if pn in _city:
            return _city[pn]
    first = n.split(" ")[0] if n else ""
    if first in _city:
        return _city[first]
    if not online or re.search(r"remote|homeoffice|home office|deutschlandweit|bundesweit", n):
        return None
    if n in _cache:
        return tuple(_cache[n]) if _cache[n] else None
    global _last_nom
    with _lock:  # Nominatim: höchstens 1 Anfrage pro Sekunde
        wait = 1.1 - (time.time() - _last_nom)
        if wait > 0:
            time.sleep(wait)
        _last_nom = time.time()
        try:
            r = requests.get(NOMINATIM, params={"q": place, "format": "json", "limit": 1, "countrycodes": "de,at,ch"}, headers={"User-Agent": UA}, timeout=15).json()
            _cache[n] = [float(r[0]["lat"]), float(r[0]["lon"])] if r else None
        except Exception:
            return None
        _save_cache()
    return tuple(_cache[n]) if _cache[n] else None


def km(a, b):
    if not a or not b:
        return None
    r = math.radians
    h = math.sin(r(b[0] - a[0]) / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(r(b[1] - a[1]) / 2) ** 2
    return round(2 * 6371 * math.asin(math.sqrt(h)))
