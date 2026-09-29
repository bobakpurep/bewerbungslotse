"""Bewerbungslotse – eigener Suchserver: kostenlose Metasuche für Stellen.

Vereint, was sonst kostenpflichtige Dienste (SerpAPI/Google Jobs, Careerjet) leisten – ohne Schlüssel und ohne Kosten:
  * Suche in vielen Quellen gleichzeitig ......... Arbeitsagentur, Indeed, StepStone, XING, LinkedIn, Google Jobs,
                                                     Arbeitnow, kimeta, meinestadt, jobware, Firmen-Karriereseiten
  * Dubletten zusammenführen (Clustering) ........ eine Stelle, alle Bewerbungswege (applyOptions)
  * Direktlink zum Arbeitgeber ................... Bewerbermanagement-Systeme + Firmen-Website (direct.py)
  * Umkreissuche ................................. eigene Entfernungsberechnung (PLZ-Tabelle, geo.py)
  * Gehalt, Arbeitszeit, Homeoffice, Zeitarbeit ... aus dem Text erkannt (merge.py)
  * Zwischenspeicher, Pausen, Zugangsschutz

Start:  pip install -r requirements.txt  &&  python server.py
Nur für den eigenen, privaten Gebrauch. Nutzungsbedingungen der Portale beachten (siehe README).
"""
from __future__ import annotations

import base64
import concurrent.futures as cf
import hashlib
import ipaddress
import json
import os
import random
import re
import socket
import threading
import time
import xml.etree.ElementTree as ET
from urllib.parse import quote, quote_plus, urlencode, urlparse

import shutil

import requests
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

import sys as _sys
if getattr(_sys, "frozen", False) and not os.getenv("BL_DATA"):
    os.environ["BL_DATA"] = os.path.join(os.path.expanduser("~"), ".bewerbungslotse")
import direct as directmod
import geo
import websearch
import robots as robotsmod
from extract import clean, extract, find_email
from merge import merge, norm_title

TOKEN = os.getenv("BL_TOKEN", "")
ORIGINS = [o.strip() for o in os.getenv("BL_ORIGINS", "*").split(",") if o.strip()]
DELAY = float(os.getenv("BL_DELAY", "1.5"))
CACHE_MIN = int(os.getenv("BL_CACHE_MIN", "20"))
PROXIES = [p for p in os.getenv("BL_PROXIES", "").split(",") if p]
COMPANIES_FILE = os.getenv("BL_COMPANIES", "")   # leer = Datenordner (siehe companies_path)
UA = os.getenv("BL_UA", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36")
DEFAULT_SITES = "arbeitsagentur,indeed,stepstone,xing,google,arbeitnow,websuche,jooble,bund,stellenanzeigen,monster"

app = FastAPI(title="Bewerbungslotse Suchserver", version="2.0")
_cors = dict(allow_origins=ORIGINS, allow_methods=["GET"], allow_headers=["*"])
try:  # Chrome: Zugriff einer öffentlichen Seite (z. B. GitHub Pages) auf localhost erlauben
    app.add_middleware(CORSMiddleware, allow_private_network=True, **_cors)
except TypeError:
    app.add_middleware(CORSMiddleware, **_cors)

_cache: dict[str, tuple[float, dict]] = {}
_host_last: dict[str, float] = {}
_host_lock = threading.Lock()
session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9", "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"})


# ---------------- Hilfen ----------------
ROBOTS = {"search": os.getenv("BL_ROBOTS", "0") == "1", "firms": os.getenv("BL_ROBOTS_FIRMS", "1") == "1"}   # robots.txt beachten?


def _raw_get(url: str, **kw):
    return session.get(url, timeout=kw.pop("timeout", 15), **kw)


def get(url: str, **kw) -> requests.Response:
    """GET mit Pause pro Domain (höflich, weniger Sperren) und optionalen Proxys. Optional: robots.txt beachten."""
    robots_on = kw.pop("robots", None)
    if (ROBOTS["search"] if robots_on is None else robots_on) and not robotsmod.allowed(url, _raw_get):
        raise robotsmod.RobotsBlocked(f"robots.txt der Website erlaubt keinen automatischen Abruf ({urlparse(url).netloc})")
    host = urlparse(url).netloc
    with _host_lock:
        wait = DELAY - (time.time() - _host_last.get(host, 0))
        _host_last[host] = time.time() + max(0, wait)
    if wait > 0:
        time.sleep(wait)
    proxies = {"https": random.choice(PROXIES), "http": random.choice(PROXIES)} if PROXIES else None
    r = session.get(url, timeout=kw.pop("timeout", 20), proxies=proxies, **kw)
    r.raise_for_status()
    return r


def friendly(e: Exception) -> str:
    """Fehlermeldungen für normale Nutzer verständlich machen."""
    m = str(e)
    if re.search(r"Max retries|ConnectionError|NameResolution|timed out|Timeout|ProxyError|getaddrinfo", m):
        return "nicht erreichbar (Internetverbindung, Firewall oder Seite gesperrt)"
    code = re.search(r"\b(403|429|503|451)\b", m)
    if code:
        return f"blockiert die automatische Abfrage (HTTP {code.group(1)}) – später erneut versuchen"
    return m[:160]


def slug(s: str) -> str:
    s = s.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def monthly(amount, interval: str | None):
    try:
        a = float(amount)
    except (TypeError, ValueError):
        return None
    if a != a or a <= 0:
        return None
    f = {"yearly": 1 / 12, "monthly": 1, "weekly": 4.33, "daily": 21.7, "hourly": 173}.get((interval or "").lower(), 1 / 12 if a > 15000 else 1)
    return round(a * f)


FIELDS = ("title", "company", "location", "url", "directUrl", "description", "published", "salaryMin", "salaryMax", "worktime", "remote", "email", "lat", "lon", "refnr", "website")


def job(source: str, **k) -> dict:
    j = {"source": source, "title": "", "company": "", "location": "", "url": "", "directUrl": "", "description": "",
         "published": "", "salaryMin": None, "salaryMax": None, "worktime": "", "remote": False, "email": ""}
    j.update({kk: v for kk, v in k.items() if kk in FIELDS and v not in (None, "")})
    j["title"], j["company"], j["location"] = clean(j["title"]), clean(j["company"]), clean(j["location"])
    j["description"] = (j["description"] or "")[:6000]
    j["id"] = source[:3].lower() + "-" + hashlib.sha1((j["url"] or j["title"] + j["company"]).encode()).hexdigest()[:12]
    return j


def title_match(title: str, q: str) -> bool:
    words = [w for w in norm_title(q).split() if len(w) > 3]
    t = norm_title(title)
    return not words or any(w[:6] in t for w in words)


# ---------------- Quellen ----------------
BA = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
BA_H = {"X-API-Key": "jobboerse-jobsuche", "Accept": "application/json"}


def src_arbeitsagentur(q, where, radius, days, limit, details, art=1):
    """art: 1 Arbeit, 2 Selbstständigkeit, 4 Ausbildung/Duales Studium, 34 Praktikum/Trainee (laut bundesAPI-Doku)."""
    p = {"was": q, "angebotsart": art, "page": 1, "size": min(limit, 100)}
    if where:
        p.update(wo=where, umkreis=min(radius, 200))
    if days:
        p["veroeffentlichtseit"] = min(days, 100)
    d = get(f"{BA}/pc/v4/jobs?" + urlencode(p), headers=BA_H).json()
    out = []
    for x in d.get("stellenangebote", []):
        o = x.get("arbeitsort") or {}
        k = o.get("koordinaten") or {}
        out.append(job("Arbeitsagentur", title=x.get("titel") or x.get("beruf"), company=x.get("arbeitgeber"),
                       location=" ".join(filter(None, [o.get("plz"), o.get("ort")])), lat=k.get("lat"), lon=k.get("lon"),
                       url=f"https://www.arbeitsagentur.de/jobsuche/jobdetail/{quote(x.get('refnr', ''))}", directUrl=x.get("externeUrl"),
                       published=(x.get("aktuelleVeroeffentlichungsdatum") or "")[:10], refnr=x.get("refnr")))
    if details:
        for j in out[:20]:
            try:
                dd = get(f"{BA}/pc/v4/jobdetails/" + base64.b64encode(j["refnr"].encode()).decode(), headers=BA_H).json()
                j["description"] = clean(dd.get("stellenangebotsBeschreibung") or dd.get("stellenbeschreibung") or "")[:6000]
                j["email"] = find_email(json.dumps(dd, ensure_ascii=False))
                j["directUrl"] = j.get("directUrl") or dd.get("externeUrl") or ""
            except Exception:
                continue
    return out


def src_jobspy(site, q, where, radius, days, limit, details):
    from jobspy import scrape_jobs
    df = scrape_jobs(site_name=[site], search_term=q, google_search_term=f"{q} Jobs in {where}" if where else f"{q} Jobs",
                     location=where or "Deutschland", distance=max(1, round(radius / 1.609)), results_wanted=limit,
                     country_indeed="germany", hours_old=days * 24 if days else None, linkedin_fetch_description=details,
                     proxies=PROXIES or None, description_format="markdown", verbose=0)
    out = []
    for r in df.fillna("").to_dict("records"):
        iv = r.get("interval") or ""
        emails = r.get("emails")
        out.append(job({"linkedin": "LinkedIn", "google": "Google Jobs"}.get(site, site.capitalize()),
                       title=r.get("title"), company=r.get("company"), location=r.get("location"), url=r.get("job_url"),
                       directUrl=r.get("job_url_direct"), website=r.get("company_url_direct"), description=clean(r.get("description")),
                       published=str(r.get("date_posted") or "")[:10], salaryMin=monthly(r.get("min_amount"), iv), salaryMax=monthly(r.get("max_amount"), iv),
                       remote=bool(r.get("is_remote")), email=(emails[0] if isinstance(emails, list) and emails else str(emails or "")),
                       worktime={"fulltime": "vz", "parttime": "tz"}.get(str(r.get("job_type")).split(",")[0], "")))
    return out


def enrich(jobs: list[dict], n: int = 15) -> None:
    """Stellentexte (und Firmen-Website) der ersten n Treffer von der Detailseite laden."""
    for j in jobs[:n]:
        if len(j.get("description") or "") > 300 or not j.get("url"):
            continue
        try:
            d = extract(get(j["url"]).text, j["url"])
            full = next((x for x in d if len(x.get("description") or "") > 200), None)
            if full:
                j["description"] = full["description"]
                for k in ("salaryMin", "salaryMax", "published", "worktime"):
                    if full.get(k) and not j.get(k):
                        j[k] = full[k]
                if full.get("directUrl"):
                    j["website"] = full["directUrl"]   # schema.org sameAs = Firmen-Website
        except Exception:
            continue


def src_html(name, url, q, limit, details):
    items = [it for it in extract(get(url).text, url) if title_match(it["title"], q)][:limit]
    out = []
    for it in items:
        j = job(name, **{k: v for k, v in it.items() if k != "directUrl"})
        if it.get("directUrl"):
            j["website"] = it["directUrl"]
        out.append(j)
    if details:
        enrich(out)
    return out


PORTAL_URLS = {
    "stepstone": ("StepStone", lambda q, w, r: f"https://www.stepstone.de/jobs/{quote(slug(q))}" + (f"/in-{quote(slug(w))}?radius={r}" if w else "")),
    "xing": ("XING", lambda q, w, r: "https://www.xing.com/jobs/search?" + urlencode({"keywords": q, **({"location": w, "radius": r} if w else {})})),
    "kimeta": ("kimeta", lambda q, w, r: "https://www.kimeta.de/search?" + urlencode({"q": q, "loc": w, "r": r})),
    "meinestadt": ("meinestadt", lambda q, w, r: f"https://jobs.meinestadt.de/{quote(slug(w) or 'deutschland')}/suche?" + urlencode({"words": q})),
    "jobware": ("jobware", lambda q, w, r: "https://www.jobware.de/jobsuche?" + urlencode({"jw_jobname": q, "jw_jobort": w})),
    # Jobsuchmaschinen (Webseiten, keine Schlüssel) – Adressen Stand 09/2026, nicht live geprüft
    "jooble": ("Jooble", lambda q, w, r: "https://de.jooble.org/SearchResult?" + urlencode({"ukw": q, "rgns": w})),
    "jobrapido": ("Jobrapido", lambda q, w, r: "https://de.jobrapido.com/?" + urlencode({"w": q, "l": w, "r": r})),
    "talent": ("talent.com", lambda q, w, r: "https://de.talent.com/jobs?" + urlencode({"k": q, "l": w, "radius": r})),
    "careerjet": ("Careerjet (Web)", lambda q, w, r: "https://www.careerjet.de/jobs?" + urlencode({"s": q, "l": w, "radius": r})),
    # Weitere Generalisten (Adressen Stand 27.09.2026; „geprüft“ = Ergebnisseite mit Stellen abgerufen, „Indiz“ = nur in Suchergebnissen gesehen)
    "monster": ("Monster", lambda q, w, r: f"https://www.monster.de/jobs/q-{quote(slug(q))}-jobs" + (f"-l-{quote(slug(city(w)))}" if w else "")),   # Indiz
    "workwise": ("Workwise", lambda q, w, r: f"https://www.workwise.io/jobs/{quote(slug(city(w)) or 'deutschland')}/{quote(slug(q))}"),           # geprüft
    "hokify": ("hokify", lambda q, w, r: f"https://hokify.de/jobs/m/{quote(slug(q))}/{quote(slug(city(w)))}" if w else f"https://hokify.de/jobs/k/{quote(slug(q))}"),  # Indiz, Seite lädt per JavaScript
    "jobninja": ("jobninja", lambda q, w, r: f"https://jobninja.com/stadt/{quote(slug(city(w)))}" if w else "https://jobninja.com/"),            # nur Ort, Begriff wird lokal gefiltert
    "regiojob": ("Regio-Jobanzeiger", lambda q, w, r: regio_url(q, w)),                                                                         # geprüft (Berlin)
    # Branchen-Portale (werden in der App passend zum Beruf automatisch zugeschaltet)
    "praktischarzt": ("praktischArzt", lambda q, w, r: f"https://www.praktischarzt.de/{quote(slug(q))}/" + (f"{quote(slug(city(w)))}/" if w else "")),   # geprüft
    "hogapage": ("HOGAPAGE", lambda q, w, r: f"https://www.hogapage.de/jobs/{quote(slug(q))}" + (f"-in-{quote(slug(city(w)))}" if w else "")),            # geprüft
    "jobvector": ("jobvector", lambda q, w, r: f"https://www.jobvector.de/jobs/{quote_plus(q.lower())}/" + (f"{quote(slug(city(w)))}/" if w else "")),   # geprüft
    "heise": ("heise Jobs", lambda q, w, r: f"https://jobs.heise.de/Jobs/{quote(q)}/{quote(city(w))}" if w else f"https://jobs.heise.de/Jobs/{quote(q)}"),  # Indiz
    "salesjob": ("Salesjob", lambda q, w, r: f"https://www.salesjob.de/jobs/{quote(slug(q))}-jobs" + (f"-{quote(slug(city(w)))}/" if w else "/")),        # geprüft
    "medienjobs": ("medien.jobs", lambda q, w, r: "https://medienjobs.boersenblatt.net/jobs" + (f"/{quote(slug(city(w)))}" if w else "")),               # nur Ort
    "greenjobs": ("greenjobs", lambda q, w, r: "https://www.greenjobs.de/stellenanzeige/" + (f"{quote(slug(city(w)))}/" if w else "")),                  # nur Ort
    "nachhaltigejobs": ("nachhaltigejobs", lambda q, w, r: "https://www.nachhaltigejobs.de/jobs" + (f"/{quote(slug(city(w)))}" if w else "/suche")),    # nur Ort
}

# Portale ohne nutzbare Such-Adresse (gesperrt oder unbekannt): Suche über Suchmaschinen mit „site:“
SITE_SEARCH = {
    "stellenanzeigen": ("stellenanzeigen.de", "stellenanzeigen.de"),
    "yourfirm": ("Yourfirm", "yourfirm.de"),
    "interamt": ("Interamt", "interamt.de"),
    "absolventa": ("Absolventa", "absolventa.de"),
    "staufenbiel": ("Staufenbiel", "staufenbiel.de"),
    "medijobs": ("Medi-Jobs", "medi-jobs.de"),
    # Ausbildung (Stand 27.09.2026, Such-Adressen nicht geprüft → über Suchmaschinen)
    "ausbildungde": ("ausbildung.de", "ausbildung.de"),
    "azubide": ("azubi.de", "azubi.de"),
    "azubiyo": ("AZUBIYO", "azubiyo.de"),
    "aubiplus": ("aubi-plus", "aubi-plus.de"),
    # Studium
    "hochschulkompass": ("Hochschulkompass", "hochschulkompass.de"),
    "studieren": ("studieren.de", "studieren.de"),
}
# Rückfall auf die „site:“-Suche, wenn die direkte Such-Adresse nichts liefert
FALLBACK_SITE = {"monster": "monster.de", "hokify": "hokify.de", "heise": "jobs.heise.de", "workwise": "workwise.io", "jobninja": "jobninja.com",
                 "praktischarzt": "praktischarzt.de", "hogapage": "hogapage.de", "jobvector": "jobvector.de", "salesjob": "salesjob.de",
                 "medienjobs": "medienjobs.boersenblatt.net", "greenjobs": "greenjobs.de", "nachhaltigejobs": "nachhaltigejobs.de"}

# Regio-Jobanzeiger: eine Domain je Stadt/Region (bekannte Domains, Stand 27.09.2026)
REGIO = {"berlin": "berliner", "stuttgart": "stuttgarter", "nuernberg": "nuernberger", "hannover": "hannover", "leipzig": "leipziger",
         "konstanz": "bodensee", "friedrichshafen": "bodensee", "ravensburg": "bodensee", "ueberlingen": "bodensee"}


def city(where: str) -> str:
    """„10115 Berlin“ → „Berlin“ (Postleitzahl und Zusätze entfernen)."""
    w = re.sub(r"\b\d{5}\b", " ", where or "").split(",")[0]
    return " ".join(w.split())


def regio_url(q: str, where: str) -> str:
    key = REGIO.get(slug(city(where)).split("-")[0]) if where else None
    if not key:
        raise ValueError("Für diesen Ort gibt es keinen Regio-Jobanzeiger (bekannt: Berlin, Stuttgart, Nürnberg, Hannover, Leipzig, Bodensee)")
    return f"https://www.{key}-jobanzeiger.de/jobangebote/{quote(slug(q))}/"


def src_site(name, domain, q, where, limit, details):
    jobs, errors, _ = websearch.search(q, city(where), list(websearch.DEFAULT_ENGINES), get, 12, lambda t: title_match(t, q), site=domain, source=name)
    if not jobs and errors:
        raise RuntimeError("; ".join(f"{k}: {v}" for k, v in list(errors.items())[:2]))
    out = []
    for it in jobs[:limit]:
        j = job(name, **{k: v for k, v in it.items() if k not in ("directUrl", "source")})
        if it.get("website"):
            j["website"] = it["website"]
        out.append(j)
    if details:
        enrich(out)
    return out


STUDISU = "https://rest.arbeitsagentur.de/infosysbub/studisu/pc/v1/studienangebote"
STUDISU_H = {"X-API-Key": "infosysbub-studisu", "Accept": "application/json"}


def src_studium(q, where, radius, days, limit, details):
    """Studiensuche der Bundesagentur für Arbeit (öffentlicher Schlüssel laut bundesAPI-Doku). Felder laut openapi.yaml."""
    p = {"sw": q, "pg": 1}
    home = geo.coords(where) if where else None
    if home:
        m = re.search(r"\b\d{5}\b", where)
        plz = m.group(0) if m else ""
        p["orte"] = f"{city(where) or where}_{plz}_{home[1]:.6f}_{home[0]:.6f}"
        p["uk"] = next((str(u) for u in (25, 50, 100, 150, 200) if radius <= u), "Bundesweit")
    else:
        p["uk"] = "Bundesweit"
    d = get(f"{STUDISU}?" + urlencode(p), headers=STUDISU_H).json()
    out = []
    for it in (d.get("items") or [])[:limit]:
        a = it.get("studienangebot") or it
        o, prov = a.get("studienort") or {}, a.get("studienanbieter") or {}
        loc = o.get("location") or {}
        links = [u for u in (a.get("externalLinks") or []) if isinstance(u, str) and u.startswith("http")]
        lab = lambda k: (a.get(k) or {}).get("label", "") if isinstance(a.get(k), dict) else ""
        title = a.get("studiBezeichnung") or ""
        desc = " · ".join(filter(None, [lab("abschlussgrad"), lab("studienform"), lab("hochschulart"), lab("studientyp"),
                                        ", ".join(m.get("label", "") for m in a.get("studienmodelle") or [] if isinstance(m, dict)),
                                        f"Beginn: {a['studiBeginn']}" if a.get("studiBeginn") else ""])) + ("\n" + clean(a.get("studiInhalt")) if a.get("studiInhalt") else "")
        url = links[0] if links else "https://duckduckgo.com/?q=" + quote(f"{title} {prov.get('name', '')} Studium")
        j = job("Studiensuche (BA)", title=title, company=prov.get("name"), location=" ".join(filter(None, [o.get("postleitzahl"), o.get("ort")])),
                url=url, directUrl=links[0] if links else "", description=desc)
        if loc.get("lat"):
            j["lat"], j["lon"] = loc.get("lat"), loc.get("lon")
        j["kind"] = "studium"
        out.append(j)
    return out


# Angebotsarten: Wort für Portal-/Websuche; Filter für Treffer von Portalen
ANGEBOT = {"1": "", "2": "", "4": "Ausbildung", "34": "Praktikum", "studium": "Studium"}
KIND_RE = {"4": re.compile(r"ausbild|azubi|auszubild|dual(es|er)? studi|lehrstelle|lehrling|umschul", re.I),
           "34": re.compile(r"praktik|trainee|werkstudent|volontar|abschlussarbeit|thesis|intern\b|internship", re.I),
           "studium": re.compile(r"studi|bachelor|master|hochschul|universit", re.I)}
AUSBILDUNG_SITES = ["ausbildungde", "azubide", "azubiyo", "aubiplus"]
STUDIUM_SITES = {"studium", "hochschulkompass", "studieren", "websuche"}


BUND_RSS = "https://www.service.bund.de/Content/Globals/Functions/RSSFeed/RSSGenerator_Stellen.xml"


def src_bund(q, where, radius, days, limit, details):
    """service.bund.de: offizieller RSS-Feed (Bund, Länder, Kommunen). Der Feed lässt sich nicht filtern und enthält nur die
    neuesten Stellen – deshalb lokal nach Begriff filtern und zusätzlich über Suchmaschinen („site:service.bund.de“) suchen."""
    out, err = [], None
    try:
        root = ET.fromstring(get(BUND_RSS, timeout=30).content)
        for it in root.iter("item"):
            t, link, desc = it.findtext("title") or "", it.findtext("link") or "", clean(it.findtext("description") or "")
            if not title_match(t, q):
                continue
            m = re.search(r"(?:Arbeitsort|Dienstort|Einsatzort|Ort)\s*:?\s*([^\n;|]{2,60})", desc)
            comp = re.search(r"(?:Arbeitgeber|Behörde|Dienststelle)\s*:?\s*([^\n;|]{2,80})", desc)
            out.append(job("service.bund.de", title=t, url=link, description=desc, location=m.group(1).strip() if m else "",
                           company=comp.group(1).strip() if comp else "", published=(it.findtext("pubDate") or "")[:16]))
    except Exception as e:
        err = e
    try:
        out += src_site("service.bund.de", "service.bund.de", q, where, limit, False)
    except Exception as e:
        err = err or e
    if not out and err:
        raise err
    if details:
        enrich(out)
    return out[:limit]


def src_eures(q, where, radius, days, limit, details):
    """EURES (EU-Jobportal) – öffentliche, inoffiziell dokumentierte Suche (github.com/rorar/EURES-API-Documentation)."""
    body = {"resultsPerPage": min(limit, 50), "page": 1, "sortSearch": "BEST_MATCH", "keywords": [{"keyword": q, "specificSearchCode": "EVERYWHERE"}],
            "publicationPeriod": None, "occupationUris": [], "skillUris": [], "requiredExperienceCodes": [], "positionScheduleCodes": [], "sectorCodes": [],
            "educationAndQualificationLevelCodes": [], "positionOfferingCodes": [], "locationCodes": ["de"], "euresFlagCodes": [], "otherBenefitsCodes": [],
            "requiredLanguages": [], "minNumberPost": None, "sessionId": "bewerbungslotse", "requestLanguage": "de"}
    r = session.post("https://europa.eu/eures/api/jv-searchengine/public/jv-search/search", json=body, timeout=30)
    r.raise_for_status()
    out = []
    for x in r.json().get("jvs", []):
        emp = x.get("employer") or {}
        regions = ", ".join(sum((v or [] for v in (x.get("locationMap") or {}).values()), [])[:2] if isinstance(x.get("locationMap"), dict) else [])
        out.append(job("EURES", title=x.get("title"), company=emp.get("name") if isinstance(emp, dict) else str(emp or ""), location=regions or "Deutschland",
                       url=f"https://europa.eu/eures/portal/jv-se/jv-details/{x.get('id')}?lang=de", description=clean(x.get("description")),
                       published=time.strftime("%Y-%m-%d", time.gmtime((x.get("creationDate") or 0) / 1000))))
    return out


def src_arbeitnow(q, where, radius, days, limit, details):
    out = []
    for page in (1, 2, 3):
        for x in get(f"https://www.arbeitnow.com/api/job-board-api?page={page}").json().get("data", []):
            if title_match(x.get("title", ""), q):
                out.append(job("Arbeitnow", title=x.get("title"), company=x.get("company_name"), location=x.get("location"), url=x.get("url"),
                               description=clean(x.get("description")), remote=bool(x.get("remote")),
                               published=time.strftime("%Y-%m-%d", time.gmtime(x.get("created_at") or 0))))
    return out[:limit]


def companies_path() -> str:
    if COMPANIES_FILE:
        return COMPANIES_FILE
    data = os.getenv("BL_DATA", os.path.join(os.path.dirname(__file__), "data"))
    p = os.path.join(data, "companies.json")
    if not os.path.exists(p):   # Vorlage aus dem Programmordner übernehmen
        os.makedirs(data, exist_ok=True)
        src = os.path.join(os.path.dirname(__file__), "companies.json")
        try:
            shutil.copy(src, p)
        except Exception:
            with open(p, "w", encoding="utf-8") as f:
                f.write("[]")
    return p


def load_companies() -> list[dict]:
    try:
        with open(companies_path(), encoding="utf-8") as f:
            return [c for c in json.load(f) if isinstance(c, dict) and c.get("ats") and c.get("slug") and "KUERZEL" not in c["slug"]]
    except FileNotFoundError:
        return []


def ats_company(c: dict) -> list[dict]:
    ats, s, name = c["ats"].lower(), c["slug"], c.get("name") or c["slug"]
    out = []
    if ats == "personio":
        base = f"https://{s}.jobs.personio.de"
        for p in ET.fromstring(get(f"{base}/xml?language=de").content).iter("position"):
            desc = "\n".join(clean((d.findtext("name") or "") + "\n" + (d.findtext("value") or "")) for d in p.iter("jobDescription"))
            u = f"{base}/job/{p.findtext('id')}"
            out.append(job("Firma (Personio)", title=p.findtext("name"), company=name, location=p.findtext("office"), url=u, directUrl=u,
                           description=desc, published=(p.findtext("createdAt") or "")[:10],
                           worktime={"full-time": "vz", "part-time": "tz"}.get(p.findtext("schedule") or "", "")))
    elif ats == "greenhouse":
        for p in get(f"https://boards-api.greenhouse.io/v1/boards/{s}/jobs?content=true").json().get("jobs", []):
            out.append(job("Firma (Greenhouse)", title=p.get("title"), company=name, location=(p.get("location") or {}).get("name"), url=p.get("absolute_url"),
                           directUrl=p.get("absolute_url"), description=clean(p.get("content")), published=(p.get("updated_at") or "")[:10]))
    elif ats == "lever":
        for p in get(f"https://api.lever.co/v0/postings/{s}?mode=json").json():
            out.append(job("Firma (Lever)", title=p.get("text"), company=name, location=(p.get("categories") or {}).get("location"), url=p.get("hostedUrl"),
                           directUrl=p.get("hostedUrl"), description=p.get("descriptionPlain"),
                           published=time.strftime("%Y-%m-%d", time.gmtime((p.get("createdAt") or 0) / 1000))))
    elif ats == "smartrecruiters":
        for p in get(f"https://api.smartrecruiters.com/v1/companies/{s}/postings?limit=100").json().get("content", []):
            u = f"https://jobs.smartrecruiters.com/{s}/{p.get('id')}"
            out.append(job("Firma (SmartRecruiters)", title=p.get("name"), company=name, location=(p.get("location") or {}).get("city"), url=u, directUrl=u,
                           published=(p.get("releasedDate") or "")[:10]))
    elif ats == "recruitee":
        for p in get(f"https://{s}.recruitee.com/api/offers/").json().get("offers", []):
            out.append(job("Firma (Recruitee)", title=p.get("title"), company=name, location=p.get("city") or p.get("location"), url=p.get("careers_url"),
                           directUrl=p.get("careers_url"), description=clean(p.get("description")), published=(p.get("published_at") or "")[:10]))
    elif ats == "website":   # beliebige Karriereseite (slug = volle Adresse) mit JSON-LD oder Stellen-Links
        for it in extract(get(s).text, s):
            out.append(job("Firma (Website)", **dict(it, company=it.get("company") or name, directUrl=it.get("url"))))
    return out


def src_ats(q, where, radius, days, limit, details):
    comps = load_companies()
    if not comps:
        raise RuntimeError("companies.json enthält noch keine Firmen (siehe README)")
    out, errs = [], []
    with cf.ThreadPoolExecutor(6) as ex:
        for c, fut in [(c, ex.submit(ats_company, c)) for c in comps]:
            try:
                out += [j for j in fut.result() if title_match(j["title"], q)]
            except Exception as e:
                errs.append(f"{c.get('name', c['slug'])}: {e}")
    if errs and not out:
        raise RuntimeError("; ".join(errs[:3]))
    return out[:limit]


def _html_source(key):
    name, build = PORTAL_URLS[key]

    def run(q, w, r, d, l, det):
        try:
            res = src_html(name, build(q, w, r), q, l, det)
        except ValueError:
            raise
        except Exception:
            if key not in FALLBACK_SITE:
                raise
            res = []
        if not res and key in FALLBACK_SITE:        # Adresse liefert nichts (geändert, JavaScript, gesperrt) → Suchmaschinen
            res = src_site(name, FALLBACK_SITE[key], q, w, l, det)
        return res
    return run


SOURCES = {
    "arbeitsagentur": src_arbeitsagentur,
    "indeed": lambda *a: src_jobspy("indeed", *a),
    "linkedin": lambda *a: src_jobspy("linkedin", *a),
    "google": lambda *a: src_jobspy("google", *a),
    "arbeitnow": src_arbeitnow,
    "eures": src_eures,
    "ats": src_ats,
    **{k: _html_source(k) for k in PORTAL_URLS},
    **{k: (lambda n, d: lambda q, w, r, dd, l, det: src_site(n, d, q, w, l, det))(*SITE_SEARCH[k]) for k in SITE_SEARCH},
    "bund": src_bund,
    "studium": src_studium,
    "websuche": None,   # Sonderfall, siehe search()
}


# ---------------- Metasuche ----------------
def add_direct(jobs: list[dict], n: int) -> None:
    todo = [j for j in jobs if not j.get("directUrl") and j.get("company")][:n]
    with cf.ThreadPoolExecutor(4) as ex:
        for j, r in zip(todo, ex.map(lambda j: directmod.find_direct(j["company"], j["title"], j.get("website", ""), get), todo)):
            if r:
                j["directUrl"] = r["url"]
                j["directInfo"] = r
                j["applyOptions"].insert(0, {"via": f"Arbeitgeber ({r['via']})", "url": r["url"], "direct": True, "kind": r["kind"]})


def apply_geo(jobs: list[dict], where: str, radius: int, strict: bool) -> list[dict]:
    home = geo.coords(where) if where else None
    out = []
    for j in jobs:
        if not j.get("lat") and j.get("location"):
            c = geo.coords(j["location"], online=False)
            if c:
                j["lat"], j["lon"] = c
        j["dist"] = geo.km(home, (j["lat"], j["lon"])) if home and j.get("lat") else None
        if strict and j["dist"] is not None and j["dist"] > radius * 1.15 and not j.get("remote"):
            continue
        out.append(j)
    return out


def check(request: Request):
    if TOKEN and request.headers.get("x-bl-token") != TOKEN and request.query_params.get("token") != TOKEN:
        raise HTTPException(401, "Token fehlt oder falsch")


threading.Thread(target=geo.load, daemon=True).start()   # PLZ-Tabelle im Hintergrund laden


@app.get("/health")
def health(request: Request):
    check(request)
    return {"ok": True, "version": app.version, "sources": list(SOURCES), "default": DEFAULT_SITES.split(","),
            "companies": len(load_companies()), "geo": len(geo._plz), "websearch": directmod.WEBSEARCH}


@app.get("/search")
def search(request: Request, q: str = Query(..., min_length=2, max_length=100), where: str = "", radius: int = 25, days: int | None = None,
           sites: str = DEFAULT_SITES, limit: int = Query(30, le=100), details: bool = False, direct: bool = True, directMax: int = Query(15, le=40),
           strictRadius: bool = True, noZeitarbeit: bool = False, engines: str = ",".join(websearch.DEFAULT_ENGINES), type: str = "1", robots: bool | None = None):
    check(request)
    if robots is not None:
        ROBOTS["search"] = robots
    art = type if type in ANGEBOT else "1"
    names = [s.strip() for s in sites.split(",") if s.strip() in SOURCES]
    if art == "studium":        # Studium: nur Studien-Quellen
        names = [n for n in names if n in STUDIUM_SITES] or []
        names = list(dict.fromkeys(["studium", "hochschulkompass", "studieren"] + names))
    elif art == "4":            # Ausbildung: Ausbildungsportale zusätzlich
        names = list(dict.fromkeys(names + AUSBILDUNG_SITES))
    key = json.dumps([q.lower(), where.lower(), radius, days, sorted(names), limit, details, direct, directMax, strictRadius, noZeitarbeit, engines, art, ROBOTS["search"]])
    if key in _cache and time.time() - _cache[key][0] < CACHE_MIN * 60:
        return _cache[key][1]
    raw, errors, counts = [], {}, {}
    with cf.ThreadPoolExecutor(len(names) or 1) as ex:
        qp = f"{ANGEBOT[art]} {q}" if ANGEBOT[art] else q     # Portale: „Ausbildung Elektroniker“, „Praktikum …“
        futs = {}
        for n in names:
            if n == "websuche":
                continue
            if n == "arbeitsagentur":
                futs[n] = ex.submit(src_arbeitsagentur, q, where, radius, days, limit, details, 1 if art == "studium" else int(art))
            elif n in ("studium", "bund"):
                futs[n] = ex.submit(SOURCES[n], q, where, radius, days, limit, details)
            else:
                futs[n] = ex.submit(SOURCES[n], qp, where, radius, days, limit, details)
        if "websuche" in names:
            futs["websuche"] = ex.submit(websearch.search, qp, where, [e.strip() for e in engines.split(",")], get, 20, lambda t: title_match(t, q),
                                        word="" if art == "studium" else "Stellenangebot")
        for n, f in futs.items():
            try:
                res = f.result(timeout=150)
                if n == "websuche":
                    res, werr, wcount = res
                    errors.update({f"websuche/{k}": friendly(Exception(v)) for k, v in werr.items()})
                    counts.update({f"websuche/{k}": v for k, v in wcount.items()})
                    res = [job(it.pop("source"), **it) for it in res]
                counts[n] = len(res)
                raw += res
            except Exception as e:
                errors[n] = friendly(e)
    if KIND_RE.get(art):        # Portale liefern auch normale Stellen → nur passende Angebotsart behalten
        rx = KIND_RE[art]
        raw = [j for j in raw if j["source"] in ("Arbeitsagentur", "Studiensuche (BA)") or rx.search(j["title"] + " " + (j.get("description") or "")[:300])]
    jobs = merge(raw)
    jobs = apply_geo(jobs, where, radius, strictRadius and bool(where))
    if days:
        cutoff = time.strftime("%Y-%m-%d", time.gmtime(time.time() - (days + 1) * 86400))
        jobs = [j for j in jobs if not j.get("published") or j["published"] >= cutoff]
    if noZeitarbeit:
        jobs = [j for j in jobs if not j.get("zeitarbeit")]
    if direct:
        add_direct(jobs, directMax)
    res = {"query": q, "where": where, "count": len(jobs), "raw": len(raw), "perSource": counts, "jobs": jobs, "errors": errors,
           "time": time.strftime("%Y-%m-%dT%H:%M:%S")}
    _cache[key] = (time.time(), res)
    return res


@app.get("/direct")
def direct_link(request: Request, company: str, title: str = "", website: str = ""):
    """Direktlink zum Arbeitgeber für eine einzelne Stelle finden."""
    check(request)
    if website and not _public(website):
        raise HTTPException(400, "Adresse nicht erlaubt")
    return {"company": company, "title": title, "result": directmod.find_direct(company, title, website, get)}


def _public(url: str) -> bool:
    """Schutz vor Missbrauch (SSRF): nur öffentliche http(s)-Adressen."""
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        return False
    try:
        for info in socket.getaddrinfo(u.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
    except socket.gaierror:
        return False
    return True


@app.get("/extract")
def extract_url(request: Request, url: str):
    """Stellendaten aus einer beliebigen öffentlichen Seite lesen (Karriereseite, Detailseite)."""
    check(request)
    if not _public(url):
        raise HTTPException(400, "Adresse nicht erlaubt")
    try:
        items = extract(get(url).text, url)
    except Exception as e:
        raise HTTPException(502, str(e)[:200])
    return {"url": url, "jobs": merge([job("Seite", **it) for it in items])}


# ---------------- ESCO offline (Kompetenzen → Berufe) ----------------
import esco as escomod


@app.post("/esco/import")
async def esco_import(request: Request):
    """Offizielles ESCO-CSV-Paket (ZIP) importieren. Nur lokal sinnvoll."""
    check(request)
    data = await request.body()
    if len(data) > 400 * 1024 * 1024:
        raise HTTPException(413, "Datei zu groß")
    try:
        return escomod.import_zip(data)
    except Exception as e:
        raise HTTPException(400, f"Import fehlgeschlagen: {e}")


@app.get("/esco/berufe")
def esco_berufe(request: Request, skills: str):
    check(request)
    if not escomod.available():
        raise HTTPException(404, "Kein ESCO-Datenpaket importiert")
    return {"berufe": escomod.occupations_for([x.strip() for x in skills.split("|") if x.strip()][:20])}


# ---------------- Ollama-Assistent (lokale KI) ----------------
import ollama_mgr


@app.get("/ollama/status")
def ollama_status(request: Request):
    check(request); return ollama_mgr.status()


@app.post("/ollama/start")
def ollama_start(request: Request):
    check(request); return ollama_mgr.start_service()


@app.get("/ollama/system")
def ollama_system(request: Request):
    check(request); return ollama_mgr.system_info()


@app.get("/ollama/recommend")
def ollama_recommend(request: Request):
    check(request); return ollama_mgr.recommend()


@app.post("/ollama/install")
def ollama_install(request: Request):
    check(request); return ollama_mgr.install()


@app.post("/ollama/pull")
async def ollama_pull(request: Request):
    check(request)
    body = await request.json()
    try:
        return ollama_mgr.pull(str(body.get("model", "")))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/ollama/job/{jid}")
def ollama_job(request: Request, jid: str):
    check(request)
    if jid not in ollama_mgr.JOBS:
        raise HTTPException(404, "unbekannt")
    return ollama_mgr.JOBS[jid]


@app.post("/ollama/cancel/{jid}")
def ollama_cancel(request: Request, jid: str):
    check(request)
    return ollama_mgr.cancel(jid)


@app.post("/ollama/delete")
async def ollama_delete(request: Request):
    check(request); return ollama_mgr.delete(str((await request.json()).get("model", "")))


@app.post("/ollama/test")
async def ollama_test(request: Request):
    check(request)
    try:
        return ollama_mgr.test(str((await request.json()).get("model", "")))
    except Exception as e:
        raise HTTPException(502, friendly(e))


@app.api_route("/ollama/v1/{path:path}", methods=["GET", "POST"])
async def ollama_openai(request: Request, path: str):
    """OpenAI-kompatible Ollama-Schnittstelle über das Programm (kein CORS-Problem für die App)."""
    check(request)
    try:
        r = requests.request(request.method, f"{ollama_mgr.API}/v1/{path}", data=await request.body(),
                             headers={"Content-Type": "application/json"}, timeout=900)
    except Exception as e:
        raise HTTPException(502, friendly(e))
    from fastapi.responses import Response as _R
    return _R(r.content, status_code=r.status_code, media_type="application/json")


# ---------------- Jobalarm-E-Mails und Firmenliste ----------------
import extras


@app.post("/mail/parse")
async def mail_parse(request: Request):
    """Eine gespeicherte Jobalarm-E-Mail (.eml) auswerten."""
    check(request)
    data = await request.body()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "Datei zu groß")
    return extras.parse_email(data)


@app.post("/mail/imap")
async def mail_imap(request: Request):
    """Postfach lesen (nur lesend). Zugangsdaten werden nicht gespeichert."""
    check(request)
    b = await request.json()
    try:
        return extras.fetch_imap(str(b["host"]), str(b["user"]), str(b["password"]), int(b.get("port") or 993), str(b.get("folder") or "INBOX"), int(b.get("days") or 14))
    except KeyError:
        raise HTTPException(400, "host, user und password angeben")
    except Exception as e:
        raise HTTPException(502, f"Postfach nicht lesbar: {str(e)[:160]}")


@app.get("/companies")
def companies_get(request: Request):
    check(request); return {"companies": load_companies(), "file": companies_path()}


@app.post("/companies")
async def companies_save(request: Request):
    check(request)
    lst = [c for c in (await request.json()).get("companies", []) if isinstance(c, dict) and c.get("ats") and c.get("slug")]
    with open(companies_path(), "w", encoding="utf-8") as f:
        json.dump(lst, f, ensure_ascii=False, indent=1)
    return {"saved": len(lst)}


@app.get("/companies/discover")
def companies_discover(request: Request, where: str = "", q: str = ""):
    check(request); return extras.discover_companies(where, q, get)


# ---------------- Selbsttest ----------------
CAPTCHA_RE = re.compile(r"captcha|unusual traffic|ungewöhnliche(n)? (datenverkehr|aktivität)|are you a robot|bist du ein mensch|verify you are human|cf-chl|challenge-platform|access denied|zugriff verweigert", re.I)


def _probe(url: str, q: str) -> dict:
    """Seite einmal abrufen und genau beschreiben, was ankommt (für die Fehlersuche)."""
    t = time.time()
    d = {"url": url}
    try:
        r = session.get(url, timeout=25)
        html = r.text
        d.update(http=r.status_code, bytes=len(html), finalHost=urlparse(r.url).netloc)
        m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        d["pageTitle"] = clean(m.group(1))[:90] if m else ""
        d["captcha"] = bool(CAPTCHA_RE.search(html[:200000]))
        items = extract(html, url)
        stages: dict[str, int] = {}
        for it in items:
            stages[it.get("_stage", "?")] = stages.get(it.get("_stage", "?"), 0) + 1
        matched = [it for it in items if title_match(it.get("title", ""), q)]
        d.update(found=len(items), matching=len(matched), stages=stages,
                 sample=[f"{it.get('title', '')[:60]} | {it.get('company', '')[:30]} | {it.get('location', '')[:25]}" for it in matched[:3]],
                 jsonld=html.count("application/ld+json"), nextData="__NEXT_DATA__" in html)
        if r.status_code >= 400:
            d["status"] = "blockiert" if r.status_code in (401, 403, 429, 451, 503) else "fehler"
        elif d["captcha"] and not matched:
            d["status"] = "captcha"
        else:
            d["status"] = "ok" if matched else "leer"
    except Exception as e:
        d.update(status="nicht erreichbar", error=friendly(e))
    d["ms"] = round((time.time() - t) * 1000)
    return d


def _probe_source(name: str, q: str, where: str) -> dict:
    t = time.time()
    try:
        res = SOURCES[name](q, where, 25, None, 10, False)
        d = {"status": "ok" if res else "leer", "found": len(res),
             "withUrl": sum(1 for j in res if j.get("url")), "withDirect": sum(1 for j in res if j.get("directUrl")),
             "withDescription": sum(1 for j in res if len(j.get("description") or "") > 100),
             "sample": [f"{j['title'][:60]} | {j['company'][:30]} | {j['location'][:25]}" for j in res[:3]]}
    except Exception as e:
        msg = friendly(e)
        d = {"status": "blockiert" if "blockiert" in msg else "nicht erreichbar" if "erreichbar" in msg else "fehler", "error": msg,
             "detail": type(e).__name__}
    d["ms"] = round((time.time() - t) * 1000)
    return d


def _probe_engine(e: str, q: str, where: str) -> dict:
    name, tpl = websearch.ENGINES[e]
    url = tpl.format(q=quote(f"{q} Stellenangebot {where}".strip()))
    t = time.time()
    d = {"engine": name}
    try:
        r = session.get(url, timeout=25)
        links = websearch.result_links(r.text)
        jl = websearch.job_links(links)
        d.update(http=r.status_code, bytes=len(r.text), resultLinks=len(links), jobLinks=len(jl),
                 captcha=bool(CAPTCHA_RE.search(r.text[:200000])), sampleHosts=sorted({urlparse(u).netloc for u in jl})[:6])
        d["status"] = "ok" if jl else ("captcha" if d["captcha"] else "blockiert" if r.status_code in (403, 429, 503) else "leer")
    except Exception as ex:
        d.update(status="nicht erreichbar", error=friendly(ex))
    d["ms"] = round((time.time() - t) * 1000)
    return d


@app.get("/selftest")
def selftest(request: Request, q: str = "Elektriker", where: str = "Berlin"):
    """Prüft jede Quelle und jede Suchmaschine einzeln. Enthält keine persönlichen Daten."""
    check(request)
    import platform
    t0 = time.time()
    report = {"report": "Bewerbungslotse-Selbsttest", "version": app.version, "time": time.strftime("%Y-%m-%dT%H:%M:%S"),
              "system": {"os": platform.system(), "osVersion": platform.release(), "python": platform.python_version(),
                         "programm": bool(getattr(sys, "frozen", False)), "plz": len(geo._plz)},
              "probe": {"q": q, "where": where}, "sources": {}, "engines": {}}
    direct_sources = [n for n in SOURCES if n not in ("websuche", "ats") and n not in PORTAL_URLS]
    with cf.ThreadPoolExecutor(8) as ex:
        f_src = {n: ex.submit(_probe_source, n, q, where) for n in direct_sources}
        f_html = {n: ex.submit(lambda n=n: _probe(PORTAL_URLS[n][1](q, where, 25), q)) for n in PORTAL_URLS}
        f_eng = {e: ex.submit(_probe_engine, e, q, where) for e in websearch.ENGINES}
        for n, f in {**f_src, **f_html}.items():
            try:
                report["sources"][n] = f.result(timeout=120)
            except Exception as e:
                timeout = isinstance(e, cf.TimeoutError)
                report["sources"][n] = {"status": "zeitüberschreitung" if timeout else "übersprungen", "error": str(e)[:160]}
        for e, f in f_eng.items():
            try:
                report["engines"][e] = f.result(timeout=60)
            except Exception as ex_:
                report["engines"][e] = {"status": "zeitüberschreitung", "error": str(ex_)[:100]}
    report["sources"]["ats"] = {"status": "übersprungen", "info": f"{len(load_companies())} Firmen in companies.json"}
    # OpenStreetMap (Firmen im Umkreis): kleine Probe-Abfrage, 1 km um den Probeort
    t0 = time.time()
    try:
        home = geo.coords(where) or (52.52, 13.405)
        r = _osm_post(localfirms.OVERPASS, data={"data": localfirms.build_query(home[0], home[1], 1, localfirms.filters_for(q))}, timeout=40)
        n = len(localfirms.firms_from_osm(r.json(), home)) if r.status_code == 200 else 0
        report["sources"]["firmen_osm"] = {"status": "ok" if r.status_code == 200 else "blockiert" if r.status_code == 429 else "fehler", "found": n, "http": r.status_code,
                                           "info": "Firmen mit Website im Umkreis von 1 km", "ms": round((time.time() - t0) * 1000)}
    except Exception as e:
        report["sources"]["firmen_osm"] = {"status": "nicht erreichbar", "error": friendly(e), "ms": round((time.time() - t0) * 1000)}
    # Overture Maps (zweite Firmenquelle): Zusatzmodul vorhanden, Speicher erreichbar, neuester Stand
    t0 = time.time()
    try:
        import overture
        if not overture.available():
            report["sources"]["firmen_overture"] = {"status": "fehler", "error": "Zusatzmodul DuckDB fehlt"}
        else:
            r = get(f"{overture.BUCKET}/?list-type=2&prefix=release/&delimiter=/", timeout=20)
            rel = overture.latest_release(get)
            report["sources"]["firmen_overture"] = {"status": "ok" if r.status_code == 200 else "fehler", "http": r.status_code, "info": f"Stand {rel}", "ms": round((time.time() - t0) * 1000)}
    except Exception as e:
        report["sources"]["firmen_overture"] = {"status": "nicht erreichbar", "error": friendly(e), "ms": round((time.time() - t0) * 1000)}
    try:
        report["system"]["geoBerlin"] = geo.coords(where) is not None
    except Exception:
        report["system"]["geoBerlin"] = False
    ok = [k for k, v in {**report["sources"], **report["engines"]}.items() if v.get("status") == "ok"]
    report["summary"] = {"ok": len(ok), "total": len(report["sources"]) + len(report["engines"]), "okList": ok, "seconds": round(time.time() - t0)}
    return report


# ---------------- Lokaler Modus: App ausliefern + eingebauter Proxy ----------------
import sys

from fastapi.responses import FileResponse, Response

PROXY_HOSTS = {"rest.arbeitsagentur.de", "ec.europa.eu", "www.arbeitnow.com", "api.adzuna.com", "jooble.org", "de.jooble.org", "at.jooble.org", "ch.jooble.org"}


def app_dir() -> str:
    """Ordner mit index.html – im Programmpaket (PyInstaller) oder eine Ebene über dem Suchserver."""
    for d in (os.getenv("BL_APP", ""), os.path.join(getattr(sys, "_MEIPASS", ""), "app"), os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")):
        if d and os.path.exists(os.path.join(d, "index.html")):
            return os.path.abspath(d)
    return ""


@app.api_route("/proxy/", methods=["GET", "POST"])
async def proxy(request: Request, url: str):
    """Ersatz für den CORS-Proxy (Cloudflare Worker) – nur feste, freigegebene Ziele."""
    u = urlparse(url)
    if u.scheme != "https" or u.hostname not in PROXY_HOSTS:
        raise HTTPException(403, "Ziel nicht erlaubt")
    headers = {"Accept": "application/json", "User-Agent": "Bewerbungslotse"}
    if request.headers.get("x-api-key"):
        headers["X-API-Key"] = request.headers["x-api-key"]
    try:
        if request.method == "POST":
            r = session.post(url, data=await request.body(), headers={**headers, "Content-Type": "application/json"}, timeout=25)
        else:
            r = session.get(url, headers=headers, timeout=25)
    except Exception as e:
        raise HTTPException(502, str(e)[:200])
    return Response(r.content, status_code=r.status_code, media_type=r.headers.get("content-type", "application/json"))


@app.get("/local.json")
def local_info():
    """Die App erkennt hieran den lokalen Modus und richtet sich selbst ein."""
    return {"local": True, "escoIndex": escomod.available(), "version": app.version, "sources": [k for k in SOURCES], "engines": list(websearch.ENGINES), "defaultEngines": websearch.DEFAULT_ENGINES}


# ---------------- Automatische Sicherung der App-Daten (nur lokales Programm) ----------------
def _backup_dir() -> str:
    d = os.path.join(os.getenv("BL_DATA", os.path.join(os.path.dirname(__file__), "data")), "sicherungen")
    os.makedirs(d, exist_ok=True)
    return d


@app.post("/backup")
async def backup_save(request: Request):
    """Speichert die App-Daten als Datei; die letzten 10 Stände (höchstens einer pro Stunde) bleiben erhalten."""
    check(request)
    raw = await request.body()
    if len(raw) > 30_000_000:
        raise HTTPException(413, "Sicherung zu groß")
    d = json.loads(raw)
    if not isinstance(d, dict) or d.get("app") != "Bewerbungslotse":
        raise HTTPException(400, "keine Bewerbungslotse-Sicherung")
    for k in ("aikey", "azkey", "jooble", "srvtok", "hook", "azid"):   # Schlüssel nie auf die Platte
        (d.get("settings") or {}).pop(k, None)
    folder = _backup_dir()
    with open(os.path.join(folder, "aktuell.json"), "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
    stamp = time.strftime("%Y-%m-%d_%H")
    snap = os.path.join(folder, f"sicherung_{stamp}.json")
    if not os.path.exists(snap):
        shutil.copyfile(os.path.join(folder, "aktuell.json"), snap)
        olds = sorted(x for x in os.listdir(folder) if x.startswith("sicherung_"))
        for x in olds[:-10]:
            os.remove(os.path.join(folder, x))
    return {"ok": True, "file": os.path.join(folder, "aktuell.json")}


@app.get("/backup")
def backup_load(request: Request):
    check(request)
    p = os.path.join(_backup_dir(), "aktuell.json")
    if not os.path.exists(p):
        raise HTTPException(404, "keine Sicherung")
    return FileResponse(p, media_type="application/json")


# ---------------- Firmen im Umkreis (OpenStreetMap → Firmen-Websites) ----------------
import localfirms


def _osm_post(url, **kw):
    return requests.post(url, headers={"User-Agent": "Bewerbungslotse (privat, selbst gehostet; https://www.openstreetmap.org/copyright)"}, **kw)


def _merge_companies(new: list[dict]) -> int:
    cur = load_companies()
    keys = {(c["ats"], c["slug"].lower().rstrip("/")) for c in cur}
    add = [c for c in new if (c["ats"], c["slug"].lower().rstrip("/")) not in keys]
    if add:
        with open(companies_path(), "w", encoding="utf-8") as f:
            json.dump(cur + add, f, ensure_ascii=False, indent=1)
    return len(add)


@app.post("/firmen/start")
async def firmen_start(request: Request):
    check(request)
    b = await request.json()
    q, where = str(b.get("q", ""))[:100], str(b.get("where", ""))[:100]
    if len(q) < 2 or not where:
        raise HTTPException(400, "Beruf und Ort angeben")
    if "robots" in b:
        ROBOTS["firms"] = bool(b["robots"])
    firm_get = (lambda url, **kw: get(url, robots=True, **kw)) if ROBOTS["firms"] else (lambda url, **kw: get(url, robots=False, **kw))
    deps = {"coords": geo.coords, "post": _osm_post, "get": firm_get, "career_page": directmod.career_page, "extract": extract,
            "title_match": title_match, "job": job, "save_companies": _merge_companies, "ats_jobs": ats_company}
    src = [x for x in (b.get("sources") or ["osm", "overture"]) if x in ("osm", "overture")] or ["osm"]
    jid = localfirms.start(q, where, float(b.get("radius", 25)), max(5, min(int(b.get("max", 100)), 300)), deps, src)
    return {"job": jid}


@app.get("/firmen/job/{jid}")
def firmen_job(request: Request, jid: str):
    check(request)
    if jid not in localfirms.JOBS:
        raise HTTPException(404, "unbekannt")
    return localfirms.JOBS[jid]


@app.post("/firmen/cancel/{jid}")
def firmen_cancel(request: Request, jid: str):
    check(request)
    return {"ok": localfirms.cancel(jid)}


@app.get("/{path:path}")
def static(path: str):
    base = app_dir()
    if not base:
        raise HTTPException(404, "App-Dateien nicht gefunden")
    f = os.path.abspath(os.path.join(base, path or "index.html"))
    if not f.startswith(base) or not os.path.isfile(f) or "/suchserver" in f.replace("\\", "/"):
        f = os.path.join(base, "index.html")
    return FileResponse(f, headers={"Cache-Control": "no-cache"})


def main():
    for stream in (sys.stdout, sys.stderr):   # Windows-Konsole: Umlaute nie zum Absturz führen lassen
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass
    import socket as _s
    import webbrowser

    import uvicorn
    host = os.getenv("BL_HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8787"))
    for p in range(port, port + 20):   # freien Port suchen
        with _s.socket() as t:
            if t.connect_ex(("127.0.0.1", p)) != 0:
                port = p
                break
    url = f"http://127.0.0.1:{port}/"
    print("=" * 60)
    print("  Bewerbungslotse läuft.")
    print(f"  Im Browser öffnen: {url}")
    print("  Dieses Fenster bitte offen lassen. Zum Beenden einfach schließen.")
    print("=" * 60)
    if os.getenv("BL_NO_BROWSER") != "1":
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()

