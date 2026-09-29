"""Direktlink-Finder: sucht zu einer Stelle die Bewerbungsseite direkt beim Arbeitgeber
(Ersatz für die „apply_options“ von Google Jobs / SerpAPI – kostenlos, ohne Schlüssel).

Reihenfolge:
  1. Bewerbermanagement-Systeme mit öffentlicher Stellenliste (Personio, Greenhouse, Lever, Recruitee, SmartRecruiters):
     Firmenkürzel aus dem Namen ableiten, Stellenliste abrufen, passenden Titel suchen.
  2. Firmen-Website (falls bekannt): Karriere-Link finden, dort Stellen auslesen (JSON-LD / Links), Titel abgleichen.
  3. Optional (BL_WEBSEARCH=1): Websuche „<Firma> Karriere“ über DuckDuckGo, um die Firmen-Website zu finden.
Ergebnisse werden in data/direct.json gespeichert (Standard 7 Tage).
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import os
import re
import threading
import time
import xml.etree.ElementTree as ET
from difflib import SequenceMatcher
from urllib.parse import parse_qs, quote, unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from extract import extract
from merge import de, is_portal, norm_company, norm_title

DATA = os.getenv("BL_DATA", os.path.join(os.path.dirname(__file__), "data"))
TTL = int(os.getenv("BL_DIRECT_DAYS", "7")) * 86400
WEBSEARCH = os.getenv("BL_WEBSEARCH", "0") == "1"
CAREER_RE = re.compile(r"karriere|career|jobs|stellen|stellenangebote|offene-stellen|arbeiten-bei|jobportal|bewerb", re.I)
_lock = threading.Lock()
_cache: dict = {}
_path = os.path.join(DATA, "direct.json")
try:
    _cache = json.load(open(_path, encoding="utf-8"))
except Exception:
    _cache = {}


def _save():
    with _lock:
        try:
            os.makedirs(DATA, exist_ok=True)
            json.dump(_cache, open(_path, "w", encoding="utf-8"))
        except Exception:
            pass


def slugs(company: str) -> list[str]:
    words = norm_company(company).split()
    if not words:
        return []
    out = ["".join(words), "-".join(words)]
    if len(words) > 1 and len(words[0]) >= 5:
        out.append(words[0])
    return list(dict.fromkeys(s for s in out if len(s) >= 3))[:3]


def sim(a: str, b: str) -> float:
    a, b = norm_title(a), norm_title(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    sa, sb = set(a.split()), set(b.split())
    jac = len(sa & sb) / max(1, len(sa | sb))
    return max(jac, SequenceMatcher(None, a, b).ratio())


# ---------- 1. Bewerbermanagement-Systeme ----------
def _personio(s, get):
    base = f"https://{s}.jobs.personio.de"
    root = ET.fromstring(get(f"{base}/xml?language=de").content)
    return base, [(p.findtext("name") or "", f"{base}/job/{p.findtext('id')}") for p in root.iter("position")]


def _greenhouse(s, get):
    d = get(f"https://boards-api.greenhouse.io/v1/boards/{s}/jobs").json()
    return f"https://boards.greenhouse.io/{s}", [(x.get("title", ""), x.get("absolute_url", "")) for x in d.get("jobs", [])]


def _lever(s, get):
    d = get(f"https://api.lever.co/v0/postings/{s}?mode=json").json()
    return f"https://jobs.lever.co/{s}", [(x.get("text", ""), x.get("hostedUrl", "")) for x in d]


def _recruitee(s, get):
    d = get(f"https://{s}.recruitee.com/api/offers/").json()
    return f"https://{s}.recruitee.com", [(x.get("title", ""), x.get("careers_url", "")) for x in d.get("offers", [])]


def _smartrecruiters(s, get):
    d = get(f"https://api.smartrecruiters.com/v1/companies/{s}/postings?limit=100").json()
    if not d.get("content"):
        raise ValueError("leer")
    return f"https://jobs.smartrecruiters.com/{s}", [(x.get("name", ""), f"https://jobs.smartrecruiters.com/{s}/{x.get('id')}") for x in d["content"]]


ATS = {"Personio": _personio, "Greenhouse": _greenhouse, "Lever": _lever, "Recruitee": _recruitee, "SmartRecruiters": _smartrecruiters}


def via_ats(company: str, title: str, get) -> dict | None:
    cand = [(name, fn, s) for s in slugs(company) for name, fn in ATS.items()]
    best = None
    with cf.ThreadPoolExecutor(8) as ex:
        futs = {ex.submit(fn, s, get): (name, s) for name, fn, s in cand}
        for f in cf.as_completed(futs):
            name, s = futs[f]
            try:
                board, jobs = f.result()
            except Exception:
                continue
            if not jobs:
                continue
            score, url = max(((sim(t, title), u) for t, u in jobs), default=(0, ""))
            full = s.replace("-", "") == "".join(norm_company(company).split())
            if score >= 0.72:
                r = {"url": url, "kind": "job", "via": name, "confidence": round(score, 2), "board": board}
            elif full:
                r = {"url": board, "kind": "careers", "via": name, "confidence": 0.5, "board": board}
            else:
                continue
            if not best or (r["kind"], r["confidence"]) > (best["kind"], best["confidence"]):
                best = r
    return best


# ---------- 2. Firmen-Website ----------
def career_page(website: str, get) -> str:
    html = get(website).text
    soup = BeautifulSoup(html, "html.parser")
    host = urlparse(website).netloc.replace("www.", "")
    links = []
    for a in soup.find_all("a", href=True):
        href, text = urljoin(website, a["href"]), a.get_text(" ", strip=True)
        if CAREER_RE.search(href + " " + text) and not is_portal(href):
            same_org = host.split(".")[-2] in urlparse(href).netloc if "." in host else True
            ats = re.search(r"personio|greenhouse|lever\.co|recruitee|smartrecruiters|softgarden|workday|successfactors|d\.vinci|rexx|concludis|jobbase|onlyfy|join\.com", href)
            if same_org or ats:
                links.append((0 if ats else 1, len(href), href))
    return sorted(links)[0][2] if links else ""


def via_website(website: str, title: str, get) -> dict | None:
    if not website or is_portal(website):
        return None
    cp = career_page(website, get)
    if not cp:
        return None
    try:
        items = extract(get(cp).text, cp)
    except Exception:
        items = []
    score, url = max(((sim(i["title"], title), i.get("url")) for i in items if i.get("url")), default=(0, ""))
    if score >= 0.72:
        return {"url": url, "kind": "job", "via": "Firmen-Website", "confidence": round(score, 2), "board": cp}
    return {"url": cp, "kind": "careers", "via": "Firmen-Website", "confidence": 0.5, "board": cp}


# ---------- 3. Websuche (optional) ----------
def find_website(company: str, get) -> str:
    html = get("https://html.duckduckgo.com/html/?q=" + quote(f"{company} Karriere")).text
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.select("a.result__a, a[href]"):
        href = a.get("href", "")
        if "uddg=" in href:
            href = unquote(parse_qs(urlparse(href).query).get("uddg", [""])[0])
        if href.startswith("http") and not is_portal(href) and "duckduckgo" not in href and "wikipedia" not in href:
            first = norm_company(company).split()[:1]
            if not first or first[0][:5] in de(href).replace("-", ""):
                u = urlparse(href)
                return f"{u.scheme}://{u.netloc}/"
    return ""


def find_direct(company: str, title: str, website: str, get) -> dict | None:
    if not company:
        return None
    key = norm_company(company) + "|" + norm_title(title)
    c = _cache.get(key)
    if c and time.time() - c.get("t", 0) < TTL:
        return c.get("r")
    r = None
    try:
        r = via_ats(company, title, get)
        if not (r and r["kind"] == "job") and website:
            r = via_website(website, title, get) or r
        if not r and WEBSEARCH:
            w = find_website(company, get)
            if w:
                r = via_website(w, title, get)
    except Exception:
        pass
    _cache[key] = {"t": time.time(), "r": r}
    _save()
    return r
