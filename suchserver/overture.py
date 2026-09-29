"""Firmen im Umkreis aus Overture Maps (zweite Quelle neben OpenStreetMap).

Overture Maps Foundation veröffentlicht monatlich einen Orte-Datensatz (Places, laut Doku ca. 81 Mio. Orte, Stand 09/2026)
als GeoParquet in einem öffentlichen Speicher – kostenlos, ohne Schlüssel. Lizenzen laut Overture: CDLA Permissive 2.0,
Foursquare-Anteil Apache 2.0, AllThePlaces CC0 1.0 (https://docs.overturemaps.org/attribution/).

Abfrage mit DuckDB direkt auf den Dateien (nur der Kartenausschnitt wird gelesen; trotzdem 30 s bis wenige Minuten).
Branchen werden über die englischen Kategorienamen erkannt (Teilwort-Suche), weil sich die Kategorien-Spalten zwischen
den Releases ändern (categories → basic_category/taxonomy). Die Zuordnung ist eine eigene, unvollständige Liste.
"""
from __future__ import annotations

import math
import os
import re
import time
import xml.etree.ElementTree as ET

BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"
FALLBACK_RELEASE = os.getenv("BL_OVERTURE_RELEASE", "2026-09-23.1")   # laut Overture-Doku (Places-Anleitung, abgerufen 27.09.2026)
SOURCE = os.getenv("BL_OVERTURE_SOURCE", "")          # eigener Pfad/Datei (z. B. heruntergeladener Ausschnitt), sonst S3
ATTRIBUTION = "Firmendaten: Overture Maps Foundation (CDLA Permissive 2.0; Foursquare-Anteil Apache 2.0)"

# Beruf (Stichwort) → Teilwörter der englischen Overture-Kategorien
BRANCHES = [
    (r"elektr|mechatron|gebäudetech|smart home|photovoltaik|solar", ["electric", "solar", "hvac", "energy_equipment"]),
    (r"sanitär|heizung|shk|anlagenmechan|installateur|klima|lüftung|kälte", ["plumb", "hvac", "heating", "air_conditioning", "water_heater"]),
    (r"kfz|mechatroniker|mechaniker|karosser|lackierer|zweirad|fahrzeug", ["auto", "car_", "motorcycle", "tire", "body_shop", "vehicle"]),
    (r"tischler|schreiner|zimmer|holz", ["carpent", "cabinet", "furniture", "wood", "joiner"]),
    (r"maler|lackier|stuck|tapez", ["painter", "painting", "plaster", "drywall"]),
    (r"dachdeck|maurer|bau|beton|fliesen|estrich|gerüst|straßenbau|tiefbau|hochbau", ["construction", "contractor", "roof", "masonry", "tile", "builder", "concrete", "scaffold"]),
    (r"metall|schlosser|schweiß|zerspan|cnc|industriemech|werkzeug|feinwerk", ["metal", "weld", "machine_shop", "manufactur", "industrial", "tool"]),
    (r"pfleg|alten|kranken|heilerzieh|betreuung|sozial", ["nursing", "elder", "senior", "retirement", "home_health", "hospital", "care", "social_service", "rehabilitation"]),
    (r"arzt|ärzt|mfa|medizinisch|praxis|zahn|zfa|physio|ergo|logopäd|therap|apothek|pta", ["doctor", "dentist", "clinic", "medical", "physio", "therap", "pharmacy", "hospital", "health"]),
    (r"koch|köch|küche|gastro|hotel|restaurant|kellner|service|rezeption|barista", ["restaurant", "cafe", "bar", "hotel", "catering", "bistro", "pub", "bakery", "food"]),
    (r"bäcker|konditor|fleischer|metzger|lebensmittel", ["bakery", "butcher", "pastry", "confection", "food"]),
    (r"friseur|kosmetik", ["hair", "beauty", "cosmetic", "salon", "barber", "nail"]),
    (r"verkäuf|verkauf|einzelhandel|kassier|filial|handel", ["store", "shop", "retail", "supermarket", "grocery"]),
    (r"lager|logistik|kommission|spedition|berufskraftfahr|fahrer|staplerfahrer|versand", ["logistic", "freight", "warehouse", "shipping", "courier", "moving", "transport", "truck"]),
    (r"informati|software|entwickler|developer|admin|devops|daten|web", ["software", "information_technology", "it_service", "computer", "web_design", "internet", "telecommunication"]),
    (r"kauf|büro|buchhalt|steuer|sachbearbeit|verwaltung|assistenz|personal|controlling", ["accountant", "tax", "lawyer", "legal", "insurance", "financial", "bank", "real_estate", "business", "consult"]),
    (r"erzieher|kinderpfleg|kita|sozialpäd", ["child", "preschool", "kindergarten", "day_care", "school"]),
    (r"gärtner|garten|landschaft|florist|landwirt", ["garden", "landscap", "florist", "nursery", "farm"]),
    (r"reinig|gebäudereinig|hauswirtschaft", ["cleaning", "janitor", "laundry", "dry_clean"]),
    (r"sicherheit|security|wachschutz|objektschutz", ["security"]),
    (r"optiker|augenoptik|hörakustik|hörgeräte", ["optic", "eyewear", "hearing"]),
    (r"zahntechnik|orthopädietechnik|orthopädieschuh", ["dental_lab", "dental", "orthop", "prosthet"]),
    (r"glaser|fenster", ["glass", "window"]),
    (r"schornstein", ["chimney"]),
    (r"steinmetz|bildhauer", ["stone", "monument"]),
    (r"drucker|mediengestalt|druck", ["print", "graphic_design", "advertising", "marketing"]),
    (r"bank|versicherung|immobilien|finanz", ["bank", "insurance", "financial", "real_estate", "tax"]),
    (r"tierpfleg|tiermedizin|tierarzt|tfa", ["veterinar", "animal", "pet"]),
    (r"hausmeister|facility|haustechnik", ["property_management", "facility", "building_maintenance"]),
    (r"busfahrer|straßenbahn|verkehr|lokführer|triebfahrzeug", ["bus", "transit", "transport", "railway"]),
]


def keys_for(q: str) -> list[str]:
    out = []
    for rx, keys in BRANCHES:
        if re.search(rx, q or "", re.I):
            out += [k for k in keys if k not in out]
    return out


def available() -> bool:
    try:
        import duckdb  # noqa: F401
        return True
    except Exception:
        return False


def latest_release(get) -> str:
    """Neuesten Release-Ordner im öffentlichen Speicher ermitteln (S3-Liste); sonst den bekannten Stand verwenden."""
    try:
        r = get(f"{BUCKET}/?list-type=2&prefix=release/&delimiter=/", timeout=20)
        ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
        rel = sorted(p.text.split("/")[1] for p in ET.fromstring(r.content).iterfind(".//s3:CommonPrefixes/s3:Prefix", ns) if p.text)
        rel = [x for x in rel if re.match(r"\d{4}-\d{2}-\d{2}", x)]
        if rel:
            return rel[-1]
    except Exception:
        pass
    return FALLBACK_RELEASE


def bbox(lat: float, lon: float, radius_km: float):
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * max(0.2, math.cos(math.radians(lat))))
    return lon - dlon, lon + dlon, lat - dlat, lat + dlat


def query(q: str, home, radius_km: float, get, limit: int = 3000) -> dict:
    """Gibt {'firms': [...], 'release': ..., 'seconds': ...} zurück. Firmen im gleichen Format wie bei OSM."""
    import duckdb
    t0 = time.time()
    con = duckdb.connect()
    src = SOURCE
    release = ""
    if not src:
        release = latest_release(get)
        con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
        src = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
    cols = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{src}', hive_partitioning=1) LIMIT 0").fetchall()}
    cat = []
    if "categories" in cols:
        cat.append("coalesce(categories.primary,'') || ' ' || coalesce(array_to_string(categories.alternate,' '),'')")
    if "basic_category" in cols:
        cat.append("coalesce(CAST(basic_category AS VARCHAR),'')")
    if "taxonomy" in cols:
        cat.append("coalesce(CAST(taxonomy AS VARCHAR),'')")
    cat_sql = " || ' ' || ".join(cat) if cat else "''"
    addr = "addresses[1].locality" if "addresses" in cols else "NULL"
    conf = "AND coalesce(confidence, 1) >= 0.5" if "confidence" in cols else ""
    x0, x1, y0, y1 = bbox(home[0], home[1], min(radius_km, 50))
    sql = f"""
        SELECT names.primary AS name, websites[1] AS website, {cat_sql} AS cats, {addr} AS city,
               (bbox.ymin + bbox.ymax) / 2 AS lat, (bbox.xmin + bbox.xmax) / 2 AS lon
        FROM read_parquet('{src}', hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {x0:.6f} AND {x1:.6f} AND bbox.ymin BETWEEN {y0:.6f} AND {y1:.6f}
          AND websites IS NOT NULL AND len(websites) > 0 {conf}
        LIMIT {int(limit)}"""
    rows = con.execute(sql).fetchall()
    keys = keys_for(q)
    firms, seen = [], set()
    for name, site, cats, cityname, lat, lon in rows:
        if not name or not site:
            continue
        c = (cats or "").lower()
        if keys and not any(k in c for k in keys):
            continue
        if not site.startswith("http"):
            site = "https://" + site
        host = re.sub(r"^www\.", "", re.sub(r"^https?://", "", site).split("/")[0].lower())
        if not host or host in seen:
            continue
        seen.add(host)
        d = _km(home, (lat, lon))
        if d > radius_km * 1.05:
            continue
        firms.append({"name": name, "website": site, "host": host, "lat": lat, "lon": lon, "kind": (c.split() or [""])[0],
                      "city": cityname or "", "dist": round(d, 1), "via": "Overture"})
    firms.sort(key=lambda f: f["dist"])
    return {"firms": firms, "release": release or "eigene Datei", "seconds": round(time.time() - t0, 1), "generic": not keys}


def _km(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))
