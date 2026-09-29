"""robots.txt beachten (optional).

Websites legen in /robots.txt fest, welche Seiten Programme abrufen dürfen. Das ist keine Rechtsvorschrift, gilt aber als
anerkannte Regel für automatische Abrufe. Hier: Prüfung mit Pythons urllib.robotparser, Ergebnis 24 h je Website gespeichert.
Schnittstellen (APIs), die ausdrücklich für Programme gedacht sind, werden nicht geprüft.
"""
from __future__ import annotations

import threading
import time
import urllib.robotparser
from urllib.parse import urlparse

AGENT = "Bewerbungslotse"
API_HOSTS = ("rest.arbeitsagentur.de", "europa.eu", "overpass-api.de", "overturemaps", "arbeitnow.com", "api.adzuna.com", "jooble.org/api",
             "boards-api.greenhouse.io", "api.lever.co", "api.smartrecruiters.com", "jobs.personio", "recruitee.com/api", "127.0.0.1", "localhost", "geonames.org", "nominatim.openstreetmap.org")
_cache: dict[str, tuple[float, urllib.robotparser.RobotFileParser | None]] = {}
_lock = threading.Lock()


class RobotsBlocked(Exception):
    pass


def _parser(base: str, fetch) -> urllib.robotparser.RobotFileParser | None:
    with _lock:
        hit = _cache.get(base)
        if hit and time.time() - hit[0] < 86400:
            return hit[1]
    rp = urllib.robotparser.RobotFileParser()
    try:
        r = fetch(base + "/robots.txt")
        code = getattr(r, "status_code", 200)
        if code >= 400:
            rp = None                      # keine robots.txt → alles erlaubt
        else:
            rp.parse(r.text.splitlines())
    except Exception:
        rp = None                          # nicht abrufbar → nicht blockieren
    with _lock:
        _cache[base] = (time.time(), rp)
    return rp


def allowed(url: str, fetch) -> bool:
    if any(h in url for h in API_HOSTS):
        return True
    u = urlparse(url)
    if not u.scheme.startswith("http") or u.path in ("/robots.txt",):
        return True
    rp = _parser(f"{u.scheme}://{u.netloc}", fetch)
    return True if rp is None else rp.can_fetch(AGENT, url)
