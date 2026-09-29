"""Firmen im Umkreis: Betriebe aus OpenStreetMap holen und deren eigene Websites nach Stellen durchsuchen.

Ablauf
  1. Firmen im Umkreis mit eingetragener Website aus OpenStreetMap (Overpass API) holen – passend zur Branche des Berufs
  2. Auf der Firmen-Website die Karriereseite suchen („Karriere“, „Jobs“, „Stellen“ …)
  3. Stellen auslesen (JSON-LD, Links, Überschriften wie „Elektriker (m/w/d)“); Stellenbörsen-Systeme (Personio …) werden erkannt
  4. Gefundene Karriereseiten in companies.json speichern → spätere Suchen nutzen sie über die Quelle „Firmen-Karriereseiten“
  5. Firmen ohne Karriereseite werden 14 Tage lang nicht erneut abgefragt (Zwischenspeicher)

Daten: © OpenStreetMap-Mitwirkende, Lizenz ODbL (https://www.openstreetmap.org/copyright).
Overpass-Nutzungsregeln der öffentlichen Instanz (laut Doku ca. 10.000 Anfragen und 1 GB pro Tag): pro Suchlauf wird nur
EINE Abfrage gestellt, Ergebnisse werden 7 Tage zwischengespeichert. Eigener Server über BL_OVERPASS einstellbar.
Die Zuordnung Beruf → OSM-Merkmale (craft=…, shop=…) beruht auf eigener Kenntnis der OSM-Tags und ist nicht vollständig.
"""
from __future__ import annotations

import concurrent.futures as cf
import hashlib
import json
import math
import os
import re
import threading
import time
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

OVERPASS = os.getenv("BL_OVERPASS", "https://overpass-api.de/api/interpreter")
DATA = os.getenv("BL_DATA", os.path.join(os.path.dirname(__file__), "data"))
CACHE = os.path.join(DATA, "osm_cache.json")
OSM_TTL, SITE_TTL = 7 * 86400, 14 * 86400
ATTRIBUTION = "Firmendaten © OpenStreetMap-Mitwirkende (ODbL)"

# Beruf (Stichwort im Suchbegriff) → OSM-Merkmale. Reihenfolge egal, alle Treffer werden kombiniert.
BRANCHES = [
    (r"elektr|mechatron|gebäudetech|smart home|photovoltaik|solar", ['craft~"^(electrician|electronics_repair|hvac|photovoltaic)$"', 'shop="electrical"']),
    (r"sanitär|heizung|shk|anlagenmechan|installateur|klima|lüftung|kälte", ['craft~"^(plumber|hvac|heating_engineer|electrician)$"']),
    (r"kfz|mechatroniker|mechaniker|karosser|lackierer|zweirad|fahrzeug", ['shop~"^(car_repair|car|motorcycle|tyres|bicycle)$"', 'craft="car_painter"']),
    (r"tischler|schreiner|zimmer|holz", ['craft~"^(carpenter|joiner|cabinet_maker|sawmill)$"']),
    (r"maler|lackier|stuck|tapez", ['craft~"^(painter|plasterer)$"']),
    (r"dachdeck|maurer|bau|beton|fliesen|estrich|gerüst|straßenbau|tiefbau|hochbau", ['craft~"^(roofer|builder|tiler|stonemason|scaffolder|plasterer)$"', 'office="construction_company"']),
    (r"metall|schlosser|schweiß|zerspan|cnc|industriemech|werkzeug|feinwerk", ['craft~"^(metal_construction|blacksmith|locksmith|tool_maker)$"', 'industrial~"."', 'man_made="works"']),
    (r"pfleg|alten|kranken|heilerzieh|betreuung|sozial", ['amenity~"^(nursing_home|hospital|social_facility|clinic)$"', 'healthcare~"^(nursing_home|hospital|clinic|rehabilitation)$"']),
    (r"arzt|ärzt|mfa|medizinisch|praxis|zahn|zfa|physio|ergo|logopäd|therap|apothek|pta", ['amenity~"^(doctors|dentist|clinic|hospital|pharmacy)$"', 'healthcare~"."']),
    (r"koch|köch|küche|gastro|hotel|restaurant|kellner|service|rezeption|barista", ['amenity~"^(restaurant|cafe|fast_food|bar|pub|canteen)$"', 'tourism~"^(hotel|guest_house|hostel)$"']),
    (r"bäcker|konditor|fleischer|metzger|lebensmittel", ['shop~"^(bakery|pastry|butcher|confectionery)$"', 'craft~"^(bakery|confectionery|butcher)$"']),
    (r"friseur|kosmetik", ['shop~"^(hairdresser|beauty|cosmetics)$"']),
    (r"verkäuf|verkauf|einzelhandel|kassier|filial|handel", ['shop~"."']),
    (r"lager|logistik|kommission|spedition|berufskraftfahr|fahrer|staplerfahrer|versand", ['office~"^(logistics|moving_company|courier)$"', 'industrial~"^(warehouse|logistics)$"', 'shop="wholesale"']),
    (r"informati|software|entwickler|developer|it-|admin|devops|daten|web", ['office~"^(it|company|telecommunication|research)$"']),
    (r"kauf|büro|buchhalt|steuer|sachbearbeit|verwaltung|assistenz|personal|controlling", ['office~"^(company|accountant|tax_advisor|lawyer|insurance|financial|estate_agent|association)$"']),
    (r"erzieher|kinderpfleg|kita|sozialpäd", ['amenity~"^(kindergarten|childcare|school|social_facility)$"']),
    (r"gärtner|garten|landschaft|florist|landwirt", ['shop~"^(garden_centre|florist)$"', 'craft="gardener"', 'landuse="farmyard"']),
    # Ergänzungen (Stand 27.09.2026, eigene Zuordnung)
    (r"reinig|gebäudereinig|hauswirtschaft", ['office="cleaning"', 'craft="cleaning"', 'shop~"^(dry_cleaning|laundry)$"']),
    (r"sicherheit|security|wachschutz|objektschutz", ['office="security"', 'shop="security"']),
    (r"optiker|augenoptik|hörakustik|hörgeräte", ['shop~"^(optician|hearing_aids)$"']),
    (r"zahntechnik|orthopädietechnik|orthopädieschuh", ['craft~"^(dental_technician|orthopaedic_technician|shoemaker)$"', 'shop~"^(medical_supply|orthopaedics)$"']),
    (r"glaser|fenster", ['craft~"^(glaziery|window_construction)$"']),
    (r"schornstein", ['craft="chimney_sweeper"']),
    (r"steinmetz|bildhauer", ['craft~"^(stonemason|sculptor)$"']),
    (r"drucker|mediengestalt|druck", ['craft="printer"', 'shop~"^(copyshop|printing)$"', 'office="advertising_agency"']),
    (r"bank|versicherung|immobilien|finanz", ['amenity="bank"', 'office~"^(insurance|financial|estate_agent|tax_advisor)$"']),
    (r"tierpfleg|tiermedizin|tierarzt|tfa", ['amenity~"^(veterinary|animal_shelter|animal_boarding)$"', 'shop="pet"']),
    (r"hausmeister|facility|haustechnik", ['office~"^(property_management|company)$"', 'craft~"^(hvac|electrician|plumber)$"']),
    (r"busfahrer|straßenbahn|verkehr|lokführer|triebfahrzeug", ['amenity="bus_station"', 'office="transport"', 'railway="station"']),
    (r"friseur|kosmetik|nagel|visagist", ['shop~"^(hairdresser|beauty|cosmetics|massage)$"']),
]
GENERIC = ['office="company"', 'craft~"."', 'industrial~"."']

JOBWORD = re.compile(r"\((?:m|w|d|f|x)\s*/\s*(?:m|w|d|f|x)(?:\s*/\s*(?:m|w|d|f|x))?\)|\b(m/w/d|w/m/d|d/m/w|m/f/d)\b|\b(azubi|auszubildende|ausbildung zum|ausbildung zur)\b", re.I)
ATS_RX = [("personio", re.compile(r"https?://([a-z0-9-]+)\.jobs\.personio\.(?:de|com)", re.I)),
          ("greenhouse", re.compile(r"https?://(?:job-)?boards\.greenhouse\.io/([a-z0-9-]+)", re.I)),
          ("lever", re.compile(r"https?://jobs\.lever\.co/([a-z0-9-]+)", re.I)),
          ("smartrecruiters", re.compile(r"https?://(?:jobs|careers)\.smartrecruiters\.com/([A-Za-z0-9-]+)", re.I)),
          ("recruitee", re.compile(r"https?://([a-z0-9-]+)\.recruitee\.com", re.I))]
JOBS: dict[str, dict] = {}
_lock = threading.Lock()


# ---------------- Zwischenspeicher ----------------
def _load_cache() -> dict:
    try:
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"osm": {}, "sites": {}}


def _save_cache(c: dict) -> None:
    os.makedirs(DATA, exist_ok=True)
    with _lock, open(CACHE, "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False)


# ---------------- 1. OpenStreetMap ----------------
def filters_for(q: str) -> list[str]:
    out = []
    for rx, tags in BRANCHES:
        if re.search(rx, q or "", re.I):
            out += [t for t in tags if t not in out]
    return out or GENERIC


def build_query(lat: float, lon: float, radius_km: float, filters: list[str]) -> str:
    r = int(min(radius_km, 50) * 1000)
    parts = []
    for f in filters:
        for w in ("website", "contact:website"):
            parts.append(f'nwr[{f}]["{w}"](around:{r},{lat:.5f},{lon:.5f});')
    return f"[out:json][timeout:60];({''.join(parts)});out tags center 2000;"


def km(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def firms_from_osm(data: dict, home) -> list[dict]:
    seen, out = set(), []
    for el in data.get("elements", []):
        t = el.get("tags") or {}
        site = (t.get("website") or t.get("contact:website") or "").strip().split(";")[0]
        if not site or not t.get("name"):
            continue
        if not site.startswith("http"):
            site = "https://" + site
        host = urlparse(site).netloc.lower().replace("www.", "")
        if not host or host in seen:
            continue
        seen.add(host)
        lat, lon = el.get("lat") or (el.get("center") or {}).get("lat"), el.get("lon") or (el.get("center") or {}).get("lon")
        kind = next((f"{k}={t[k]}" for k in ("craft", "shop", "office", "amenity", "healthcare", "tourism", "industrial") if t.get(k)), "")
        out.append({"name": t["name"], "website": site, "host": host, "lat": lat, "lon": lon, "kind": kind,
                    "city": t.get("addr:city", ""), "dist": round(km(home, (lat, lon)), 1) if lat and lon else None})
    return sorted(out, key=lambda f: f["dist"] if f["dist"] is not None else 999)


def osm_firms(q: str, home, radius: float, post) -> tuple[list[dict], bool]:
    """Gibt (Firmen, aus_Zwischenspeicher) zurück. post = Funktion für HTTP-POST."""
    filters = filters_for(q)
    key = hashlib.sha1(json.dumps([round(home[0], 3), round(home[1], 3), radius, filters]).encode()).hexdigest()[:16]
    cache = _load_cache()
    hit = cache["osm"].get(key)
    if hit and time.time() - hit["t"] < OSM_TTL:
        return hit["firms"], True
    r = post(OVERPASS, data={"data": build_query(home[0], home[1], radius, filters)}, timeout=90)
    if r.status_code == 429:
        raise RuntimeError("OpenStreetMap-Server ist ausgelastet (HTTP 429) – bitte in einigen Minuten erneut versuchen")
    if r.status_code >= 400:
        raise RuntimeError(f"OpenStreetMap-Abfrage fehlgeschlagen (HTTP {r.status_code})")
    firms = firms_from_osm(r.json(), home)
    cache["osm"][key] = {"t": time.time(), "firms": firms}
    _save_cache(cache)
    return firms, False


# ---------------- 2./3. Karriereseite und Stellen ----------------
def detect_ats(url: str):
    for ats, rx in ATS_RX:
        m = rx.match(url or "")
        if m:
            return ats, m.group(1)
    return None


def heading_jobs(html: str, url: str, company: str) -> list[dict]:
    """Kleine Firmen listen Stellen oft ohne eigenen Link: „Elektroniker (m/w/d) gesucht“ als Überschrift oder Listenpunkt."""
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for el in soup.find_all(["h1", "h2", "h3", "h4", "li", "strong", "a"]):
        t = " ".join(el.get_text(" ", strip=True).split())
        if 6 <= len(t) <= 120 and JOBWORD.search(t) and t.lower() not in seen:
            seen.add(t.lower())
            href = urljoin(url, el["href"]) if el.name == "a" and el.get("href") else url
            nxt = el.find_next(["p", "ul"])
            out.append({"title": t, "company": company, "url": href, "description": " ".join(nxt.get_text(" ").split())[:800] if nxt else ""})
    return out[:20]


def scan_firm(f: dict, get, career_page, extract) -> dict:
    """Eine Firma prüfen → {'career': url|'' , 'ats': (ats, slug)|None, 'jobs': [...], 'error': ''}"""
    res = {"career": "", "ats": None, "jobs": [], "error": ""}
    try:
        cp = career_page(f["website"], get)
        if not cp:
            # manche Startseiten nennen Stellen direkt
            html = get(f["website"], timeout=15).text
            res["jobs"] = heading_jobs(html, f["website"], f["name"])
            if res["jobs"]:
                res["career"] = f["website"]
            return res
        res["career"] = cp
        res["ats"] = detect_ats(cp)
        html = get(cp, timeout=20).text
        items = [dict(i, company=i.get("company") or f["name"]) for i in extract(html, cp)]
        items += [h for h in heading_jobs(html, cp, f["name"]) if h["title"].lower() not in {i["title"].lower() for i in items}]
        # Karriereseite verweist auf ein Stellenbörsen-System?
        if not res["ats"]:
            for a in BeautifulSoup(html, "html.parser").find_all("a", href=True):
                d = detect_ats(urljoin(cp, a["href"]))
                if d:
                    res["ats"] = d
                    break
        res["jobs"] = items
    except Exception as e:
        res["error"] = str(e)[:160]
    return res


# ---------------- Hintergrund-Auftrag ----------------
def overture_firms(q: str, home, radius: float, get) -> tuple[list[dict], bool, str]:
    """Zweite Quelle: Overture Maps (siehe overture.py). Ergebnis 7 Tage zwischengespeichert."""
    import overture
    key = hashlib.sha1(json.dumps(["ovt", round(home[0], 3), round(home[1], 3), radius, overture.keys_for(q)]).encode()).hexdigest()[:16]
    cache = _load_cache()
    hit = cache.setdefault("ovt", {}).get(key)
    if hit and time.time() - hit["t"] < OSM_TTL:
        return hit["firms"], True, hit.get("release", "")
    r = overture.query(q, home, radius, get)
    cache = _load_cache(); cache.setdefault("ovt", {})[key] = {"t": time.time(), "firms": r["firms"], "release": r["release"]}
    _save_cache(cache)
    return r["firms"], False, r["release"]


def start(q: str, where: str, radius: float, max_firms: int, deps: dict, sources=("osm", "overture")) -> str:
    jid = f"firmen-{int(time.time() * 1000)}"
    JOBS[jid] = {"status": "startet", "done": False, "error": "", "cancel": False, "total": 0, "checked": 0, "withCareer": 0,
                 "firms": 0, "jobs": [], "saved": 0, "cached": False, "attribution": ATTRIBUTION + " · Overture Maps Foundation (CDLA Permissive 2.0 / Apache 2.0)", "filters": filters_for(q)}
    JOBS[jid]["sources"] = list(sources)
    threading.Thread(target=_run, args=(jid, q, where, radius, max_firms, deps, tuple(sources)), daemon=True).start()
    return jid


def cancel(jid: str) -> bool:
    if jid in JOBS:
        JOBS[jid]["cancel"] = True
        return True
    return False


def _run(jid, q, where, radius, max_firms, deps, sources=("osm",)):
    j = JOBS[jid]
    try:
        home = deps["coords"](where)
        if not home:
            raise RuntimeError("Ort nicht gefunden – bitte Postleitzahl oder Ort eintragen")
        firms, j["cached"], j["perSource"], errs = [], False, {}, []
        if "osm" in sources:
            j["status"] = "frage OpenStreetMap nach Firmen im Umkreis …"
            try:
                f_osm, j["cached"] = osm_firms(q, home, radius, deps["post"])
                for f in f_osm:
                    f.setdefault("via", "OpenStreetMap")
                firms += f_osm; j["perSource"]["OpenStreetMap"] = len(f_osm)
            except Exception as e:
                errs.append(f"OpenStreetMap: {e}")
        if "overture" in sources:
            import overture
            if not overture.available():
                errs.append("Overture Maps: Zusatzmodul DuckDB fehlt (pip install duckdb)")
            else:
                j["status"] = "frage Overture Maps nach Firmen im Umkreis … (kann 1–3 Minuten dauern)"
                try:
                    f_ovt, cached, j["overtureRelease"] = overture_firms(q, home, radius, deps["get"])
                    hosts = {f["host"] for f in firms}
                    new = [f for f in f_ovt if f["host"] not in hosts]
                    firms += new; j["perSource"]["Overture Maps"] = len(new)
                    j["cached"] = j["cached"] or cached
                except Exception as e:
                    errs.append(f"Overture Maps: {str(e)[:160]}")
        if not firms and errs:
            raise RuntimeError("; ".join(errs))
        j["sourceErrors"] = errs
        firms.sort(key=lambda f: f["dist"] if f.get("dist") is not None else 999)
        j["firms"] = len(firms)
        cache = _load_cache()
        now = time.time()
        todo = [f for f in firms if not (cache["sites"].get(f["host"], {}).get("none") and now - cache["sites"][f["host"]]["t"] < SITE_TTL)][:max_firms]
        j["total"], j["skipped"] = len(todo), len(firms) - len(todo)
        j["status"] = f"{len(firms)} Firmen mit Website gefunden – prüfe {len(todo)} Websites …"
        found_companies = []

        def one(f):
            if j["cancel"]:
                return f, None
            return f, scan_firm(f, deps["get"], deps["career_page"], deps["extract"])

        with cf.ThreadPoolExecutor(4) as ex:
            for f, r in ex.map(one, todo):
                if r is None:
                    continue
                j["checked"] += 1
                if "robots.txt" in (r.get("error") or ""):
                    j["robotsBlocked"] = j.get("robotsBlocked", 0) + 1
                cache["sites"][f["host"]] = {"t": now, "none": not r["career"], "career": r["career"]}
                if r["career"]:
                    j["withCareer"] += 1
                    if r["ats"]:
                        comp = {"ats": r["ats"][0], "slug": r["ats"][1], "name": f["name"], "osm": True}
                        found_companies.append(comp)
                        try:                      # Stellen direkt aus dem Stellenbörsen-System holen
                            r["jobs"] += [dict(x) for x in deps["ats_jobs"](comp)]
                        except Exception:
                            pass
                    else:
                        found_companies.append({"ats": "website", "slug": r["career"], "name": f["name"], "osm": True})
                for it in r["jobs"]:
                    if deps["title_match"](it.get("title", ""), q):
                        jb = deps["job"]("Firmen-Website (OSM)", **{k: v for k, v in it.items() if k in ("title", "company", "location", "url", "description", "published")})
                        jb["directUrl"] = jb["url"]
                        jb["location"] = jb["location"] or f["city"]
                        jb["lat"], jb["lon"], jb["dist"] = f["lat"], f["lon"], f["dist"]
                        jb["website"] = f["website"]
                        j["jobs"].append(jb)
                j["status"] = f"{j['checked']} von {j['total']} Websites geprüft · {j['withCareer']} mit Karriereseite · {len(j['jobs'])} passende Stellen"
                if j["cancel"]:
                    break
        _save_cache(cache)
        j["saved"] = deps["save_companies"](found_companies)
        j["status"] = ("abgebrochen – " if j["cancel"] else "fertig – ") + j["status"]
    except Exception as e:
        j["error"] = str(e)[:300]
    j["done"] = True
