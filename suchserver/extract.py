"""Allgemeiner Stellen-Extraktor für HTML-Seiten (Portale, Karriereseiten).

Reihenfolge:
  1. JSON-LD (schema.org JobPosting / ItemList) – von Google Jobs verlangt, daher auf vielen Seiten vorhanden
  2. Eingebettete App-Daten (__NEXT_DATA__, __PRELOADED_STATE__, Apollo-State …) – generische Suche nach job-ähnlichen Objekten
  3. Link-Heuristik (Links, die wie Stellenanzeigen aussehen, mit Umgebungstext)
Keine Stufe ist an ein festes Seitenlayout gebunden. Trotzdem: Portale ändern ihren Aufbau – Ergebnisse können unvollständig sein.
"""
from __future__ import annotations

import html as htmllib
import json
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

JOB_LINK_PATTERNS = [
    r"/stellenangebote--",           # StepStone
    r"/viewjob\?", r"[?&]jk=",       # Indeed
    r"/jobs/view/",                  # LinkedIn
    r"xing\.com/jobs/[a-z0-9-]*\d",  # XING
    r"/job/\d", r"/jobs/\d", r"/desc/\d", r"/jobad/", r"/stelle/", r"/job-\w", r"/jobs/[a-z0-9-]+-\d", r"/stellen/\d", r"/stellenanzeige", r"/karriere/.+", r"/careers?/.+",
    # weitere Portale (Muster der Stellen-Adressen, Stand 27.09.2026)
    r"/job/[a-z0-9-]+/[a-z]+-\d+", r"/job/[a-z0-9-]+-[0-9a-f]{16}", r"praktischarzt\.de/job/", r"/ergebnisse/\d+-", r"boersenblatt\.net/job/",
    r"/stellenanzeige/[a-z0-9-]+--\d+", r"/stellenangebote/[a-z0-9-]+/\d+", r"/partner-jobs/[a-z0-9-]+-\d+", r"/jobs/[a-z0-9-]+--\d+",
    r"medi-jobs\.de/0/\d+", r"/IMPORTE/Stellenangebote/", r"hogapage\.de/jobs/[a-z0-9-]+/[A-Z0-9]{4,}", r"interamt\.de/koop/app/stelle",
    r"monster\.de/stellenangebot", r"hokify\.de/job/",
]
TITLE_KEYS = ("title", "jobTitle", "jobtitle", "positionTitle", "headline")
COMPANY_KEYS = ("companyName", "company", "hiringOrganization", "employer", "employerName", "organization")
URL_KEYS = ("url", "jobUrl", "link", "detailUrl", "absoluteUrl", "applyUrl", "href")
LOC_KEYS = ("location", "jobLocation", "city", "locationName", "place", "workplace")
DESC_KEYS = ("description", "snippet", "textSnippet", "teaser", "summary")


def clean(text) -> str:
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    text = htmllib.unescape(text)
    text = re.sub(r"<br\s*/?>|</(p|li|h\d|div)>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t\xa0]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n", text).strip()


def _name(v):
    if isinstance(v, dict):
        return v.get("name") or v.get("displayName") or v.get("title") or ""
    if isinstance(v, list) and v:
        return _name(v[0])
    return v if isinstance(v, str) else ""


def _location(v) -> str:
    if isinstance(v, list):
        return ", ".join(filter(None, (_location(x) for x in v[:3])))
    if isinstance(v, dict):
        a = v.get("address") if isinstance(v.get("address"), dict) else v
        parts = [a.get("postalCode"), a.get("addressLocality") or a.get("city") or a.get("name") or a.get("displayName")]
        s = " ".join(str(p) for p in parts if p)
        return s or _name(v)
    return v if isinstance(v, str) else ""


def _salary(v):
    """schema.org baseSalary -> (min, max) pro Monat in EUR (grob)."""
    try:
        val = v.get("value", v) if isinstance(v, dict) else None
        if not isinstance(val, dict):
            return None, None
        unit = (val.get("unitText") or v.get("unitText") or "MONTH").upper()
        lo = float(val.get("minValue") or val.get("value") or 0) or None
        hi = float(val.get("maxValue") or 0) or lo
        f = {"YEAR": 1 / 12, "MONTH": 1, "WEEK": 4.33, "DAY": 21.7, "HOUR": 173}.get(unit, 1)
        return (round(lo * f) if lo else None), (round(hi * f) if hi else None)
    except Exception:
        return None, None


def from_jobposting(o: dict, base: str) -> dict:
    org = o.get("hiringOrganization") or {}
    lo, hi = _salary(o.get("baseSalary") or {})
    et = o.get("employmentType")
    et = " ".join(et) if isinstance(et, list) else (et or "")
    return {
        "title": clean(o.get("title") or o.get("name")),
        "company": clean(_name(org)),
        "location": clean(_location(o.get("jobLocation"))) or ("Remote" if o.get("jobLocationType") == "TELECOMMUTE" else ""),
        "url": urljoin(base, o.get("url") or base),
        "directUrl": (org.get("sameAs") or org.get("url") or "") if isinstance(org, dict) else "",
        "description": clean(o.get("description"))[:6000],
        "published": (o.get("datePosted") or "")[:10],
        "salaryMin": lo, "salaryMax": hi,
        "worktime": "tz" if "PART" in et.upper() else "vz" if "FULL" in et.upper() else "",
        "remote": o.get("jobLocationType") == "TELECOMMUTE",
    }


def _walk(o, depth=0):
    if depth > 14:
        return
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from _walk(v, depth + 1)
    elif isinstance(o, list):
        for v in o[:500]:
            yield from _walk(v, depth + 1)


def _first(o: dict, keys):
    for k in keys:
        if k in o and o[k]:
            return o[k]
    return None


def looks_like_job(o: dict) -> dict | None:
    t = _first(o, TITLE_KEYS)
    c = _first(o, COMPANY_KEYS)
    u = _first(o, URL_KEYS)
    if not isinstance(t, str) or not (4 <= len(t) <= 160) or not c:
        return None
    if isinstance(u, dict):
        u = u.get("url") or u.get("href")
    if not isinstance(u, str) and not o.get("id") and not o.get("slug"):
        return None
    return {
        "title": clean(t), "company": clean(_name(c)),
        "location": clean(_location(_first(o, LOC_KEYS) or "")),
        "url": u if isinstance(u, str) else "",
        "description": clean(_first(o, DESC_KEYS) or "")[:3000],
        "published": str(o.get("datePosted") or o.get("date") or o.get("publishedAt") or o.get("activatedAt") or "")[:10],
    }


def _json_blobs(soup: BeautifulSoup):
    for s in soup.find_all("script"):
        txt = s.string or s.get_text() or ""
        if len(txt) < 200:
            continue
        if s.get("id") == "__NEXT_DATA__" or (s.get("type") or "").endswith("json"):
            try:
                yield json.loads(txt)
            except Exception:
                pass
            continue
        m = re.search(r"(?:__PRELOADED_STATE__|__APOLLO_STATE__|__INITIAL_STATE__|__NUXT__|initialState)[^=]*=\s*(\{.*\})\s*;?\s*$", txt, re.S)
        if m:
            try:
                yield json.loads(m.group(1))
            except Exception:
                pass


def extract(html: str, base_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    jobs: list[dict] = []

    # 1. JSON-LD
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(s.string or s.get_text())
        except Exception:
            continue
        for o in _walk(data):
            typ = o.get("@type")
            typ = typ if isinstance(typ, list) else [typ]
            if "JobPosting" in typ:
                jobs.append(dict(from_jobposting(o, base_url), _stage="jsonld"))
            elif "ListItem" in typ and isinstance(o.get("url"), str) and not isinstance(o.get("item"), dict):
                jobs.append({"title": clean(o.get("name")), "company": "", "location": "", "url": urljoin(base_url, o["url"]), "description": "", "_stage": "jsonld-liste"})

    # 2. Eingebettete App-Daten
    if len([j for j in jobs if j.get("company")]) < 3:
        for blob in _json_blobs(soup):
            for o in _walk(blob):
                j = looks_like_job(o)
                if j:
                    j["url"] = urljoin(base_url, j["url"]) if j["url"] else ""
                    j["_stage"] = "eingebettet"
                    jobs.append(j)

    # 3. Link-Heuristik
    if len([j for j in jobs if j.get("title")]) < 3:
        pat = re.compile("|".join(JOB_LINK_PATTERNS), re.I)
        for a in soup.find_all("a", href=True):
            href = urljoin(base_url, a["href"])
            title = clean(a.get_text(" "))
            if not pat.search(href) or not (6 <= len(title) <= 140):
                continue
            # Karte = größter Vorfahr, der nur diesen einen Stellen-Link enthält
            card = a
            for _ in range(6):
                par = card.parent
                if par is None or par.name in ("body", "html"):
                    break
                links = {urljoin(base_url, x["href"]) for x in par.find_all("a", href=True) if pat.search(urljoin(base_url, x["href"]))}
                if len(links) > 1:
                    break
                card = par
            lines = [l.strip() for l in card.get_text("\n").split("\n") if l.strip() and l.strip() != title]
            jobs.append({"title": title, "company": lines[0] if lines else "", "location": lines[1] if len(lines) > 1 else "",
                         "url": href, "description": " ".join(lines[2:8])[:600], "_stage": "links"})

    # Doppelte entfernen, Leere verwerfen
    out, seen = [], set()
    for j in jobs:
        if not j.get("title"):
            continue
        key = (j.get("url") or "") or (j["title"].lower() + "|" + (j.get("company") or "").lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(j)
    return out


EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def find_email(text: str) -> str:
    for m in EMAIL_RE.findall(text or ""):
        if not re.search(r"\.(png|jpe?g|gif|svg|webp)$", m, re.I) and "example" not in m and "sentry" not in m:
            return m.rstrip(".,;")
    return ""
