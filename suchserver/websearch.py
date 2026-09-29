"""Websuche als Stellenquelle – ein selbst gebautes „Google Jobs“.

Suchmaschinen (DuckDuckGo, Bing, Brave, Mojeek, Startpage, Ecosia, Google) indexieren Stellenanzeigen von
Portalen UND Firmen-Karriereseiten. Ablauf:
  1. Suchanfrage „<Beruf> Stellenangebot <Ort>“ an die gewählten Suchmaschinen
  2. Ergebnis-Links sammeln, Weiterleitungen auflösen, Dubletten entfernen
  3. Nur Links behalten, die nach Stellenanzeige oder Karriereseite aussehen
  4. Seiten abrufen und Stellen auslesen (JSON-LD JobPosting, eingebettete Daten, Links)
Hinweis: Suchmaschinen erlauben automatisierte Abfragen in ihren Bedingungen meist nicht und zeigen dann
Captchas oder leere Seiten. Jede Suchmaschine wird deshalb einzeln versucht; fällt eine aus, laufen die anderen weiter.
"""
from __future__ import annotations

import base64
import concurrent.futures as cf
import re
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

from bs4 import BeautifulSoup

from extract import JOB_LINK_PATTERNS, extract
from merge import is_portal

ENGINES = {
    "duckduckgo": ("DuckDuckGo", "https://html.duckduckgo.com/html/?q={q}&kl=de-de"),
    "bing": ("Bing", "https://www.bing.com/search?q={q}&setlang=de&cc=de&count=30"),
    "brave": ("Brave", "https://search.brave.com/search?q={q}&country=de&lang=de"),
    "mojeek": ("Mojeek", "https://www.mojeek.com/search?q={q}&lb=de"),
    "startpage": ("Startpage", "https://www.startpage.com/sp/search?query={q}&language=deutsch&lui=deutsch"),
    "ecosia": ("Ecosia", "https://www.ecosia.org/search?q={q}"),
    "google": ("Google", "https://www.google.com/search?q={q}&hl=de&gl=de&num=30"),
}
DEFAULT_ENGINES = ["duckduckgo", "bing", "brave", "mojeek"]
ENGINE_HOSTS = ("duckduckgo.", "bing.", "brave.com", "mojeek.", "startpage.", "ecosia.", "google.", "microsoft.", "msn.", "youtube.", "wikipedia.",
                "facebook.", "instagram.", "tiktok.", "kununu.", "glassdoor.de/Bewertungen", "gehalt.de", "gehaltsvergleich", "praktischarzt")
JOB_RE = re.compile("|".join(JOB_LINK_PATTERNS) + r"|personio\.|greenhouse\.io|lever\.co|recruitee\.com|smartrecruiters\.|softgarden\.|workday|successfactors|"
                    r"dvinci|rexx-systems|concludis|onlyfy|join\.com/companies|jobs?\.|/stellen|stellenangebot|jobangebot|/karriere|/career|/jobs?/", re.I)
SKIP_RE = re.compile(r"\.(pdf|jpg|png|docx?)$|/ratgeber|/magazin|/blog|/news|/gehalt|/lexikon|/berufsbild|/lebenslauf|/bewerbungstipps", re.I)


def decode(href: str) -> str:
    """Weiterleitungen der Suchmaschinen auflösen."""
    if not href:
        return ""
    if href.startswith("//"):
        href = "https:" + href
    u = urlparse(href)
    qs = parse_qs(u.query)
    if "uddg" in qs:                                   # DuckDuckGo
        return unquote(qs["uddg"][0])
    if "bing.com" in u.netloc and "u" in qs:           # Bing: u=a1<base64url>
        v = qs["u"][0]
        if v.startswith("a1"):
            try:
                return base64.urlsafe_b64decode(v[2:] + "=" * (-len(v[2:]) % 4)).decode()
            except Exception:
                return ""
    if u.path == "/url" and "q" in qs:                 # Google
        return qs["q"][0]
    if u.path == "/url" and "url" in qs:
        return qs["url"][0]
    return href


def result_links(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        url = decode(a["href"])
        if not url.startswith("http"):
            continue
        host = urlparse(url).netloc.lower()
        if any(h in host or h in url for h in ENGINE_HOSTS):
            continue
        key = url.split("#")[0].rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def job_links(links: list[str]) -> list[str]:
    return [u for u in links if JOB_RE.search(u) and not SKIP_RE.search(u)]


def search(q: str, where: str, engines: list[str], get, limit_pages: int = 20, title_ok=lambda t: True, site: str = "", source: str = "", word: str = "Stellenangebot"):
    """Gibt (jobs, errors, counts) zurück. `get` ist die höfliche Abruf-Funktion des Servers.
    site: nur Treffer dieser Domain (Portale ohne nutzbare Such-Adresse werden so über Suchmaschinen gefunden)."""
    query = quote_plus((f"site:{site} {q} {where}" if site else f"{q} {word} {where}").strip())
    errors, counts, found = {}, {}, {}

    def run(e):
        name, tpl = ENGINES[e]
        html = get(tpl.format(q=query), timeout=20).text
        links = result_links(html)
        links = [u for u in links if site in urlparse(u).netloc and not SKIP_RE.search(u)] if site else job_links(links)
        if not links and re.search(r"captcha|unusual traffic|anomaly|bot", html, re.I):
            raise RuntimeError("Suchmaschine verlangt Captcha / blockiert")
        return name, links

    with cf.ThreadPoolExecutor(len(engines) or 1) as ex:
        for e, f in [(e, ex.submit(run, e)) for e in engines if e in ENGINES]:
            try:
                name, links = f.result(timeout=40)
                counts[e] = len(links)
                for i, u in enumerate(links):
                    found.setdefault(u, (i, name))       # Rang + erste Suchmaschine
            except Exception as ex_:
                errors[e] = str(ex_)[:300]
    ranked = sorted(found.items(), key=lambda kv: kv[1][0])[:limit_pages]

    def fetch(item):
        url, (_, engine) = item
        try:
            items = extract(get(url, timeout=20).text, url)
        except Exception:
            return []
        res = []
        for it in items:
            if not it.get("title") or not title_ok(it["title"]):
                continue
            it = dict(it)
            it["source"] = source or f"Websuche ({engine})"
            it["url"] = it.get("url") or url
            if it.get("directUrl"):                      # schema.org sameAs = Firmen-Website, nicht die Stelle
                it["website"] = it.pop("directUrl")
            if not is_portal(it["url"]):                 # gefundene Seite liegt beim Arbeitgeber
                it["directUrl"] = it["url"]
            res.append(it)
        return res[:15]

    jobs = []
    with cf.ThreadPoolExecutor(6) as ex:
        for r in ex.map(fetch, ranked):
            jobs += r
    return jobs, errors, counts
