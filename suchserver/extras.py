"""Zusatzfunktionen: Jobalarm-E-Mails auswerten und Firmen-Karriereseiten in der Region finden.

Jobalarm-E-Mails: Portale (StepStone, Indeed, LinkedIn, XING, Arbeitsagentur …) schicken auf Wunsch neue Stellen per
E-Mail. Diese Mails werden hier gelesen – regelkonform, weil die Portale die Daten selbst schicken.
  parse_email(bytes)  – eine .eml-Datei auswerten (Links + Titel)
  fetch_imap(...)     – Postfach per IMAP lesen (Zugangsdaten gibt der Nutzer in seiner App ein; sie werden nicht gespeichert)
Firmen finden: Suchmaschinen nach öffentlichen Stellenbörsen (Personio, Greenhouse, Lever, SmartRecruiters, Recruitee)
in der Region durchsuchen und Kürzel für companies.json vorschlagen.
"""
from __future__ import annotations

import datetime as dt
import email
import imaplib
import re
from email.header import decode_header, make_header
from urllib.parse import quote_plus, urlparse

from bs4 import BeautifulSoup

from extract import clean
from websearch import ENGINES, JOB_RE, result_links

SENDERS = ["stepstone", "indeed", "linkedin", "xing", "arbeitsagentur", "jobware", "meinestadt", "kimeta", "monster", "glassdoor", "jooble", "stellenanzeigen", "talent.com", "jobrapido"]
SKIP_TXT = re.compile(r"abmelden|unsubscribe|einstellungen|datenschutz|impressum|hilfe|app|alle (jobs|stellen) anzeigen|mehr jobs|profil|passwort|feedback", re.I)


def _hdr(v) -> str:
    try:
        return str(make_header(decode_header(v or "")))
    except Exception:
        return v or ""


def parse_email(raw: bytes) -> dict:
    msg = email.message_from_bytes(raw)
    sender, subject = _hdr(msg.get("From")), _hdr(msg.get("Subject"))
    html, text = "", ""
    for part in msg.walk():
        ct = part.get_content_type()
        if part.get_content_maintype() == "multipart":
            continue
        try:
            payload = part.get_payload(decode=True) or b""
            s = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        except Exception:
            continue
        if ct == "text/html":
            html += s
        elif ct == "text/plain":
            text += s
    jobs = []
    portal = next((p for p in SENDERS if p in sender.lower()), (urlparse("http://" + sender.split("@")[-1].strip("> ")).netloc or "E-Mail"))
    if html:
        soup = BeautifulSoup(html, "html.parser")
        JOBWORD = re.compile(r"\(m/w/d\)|\(w/m/d\)|\(m/f/d\)|m/w/d|\b(mitarbeiter|fachkraft|manager|ingenieur|techniker|elektr|kaufm|pflege|fahrer|helfer|leiter|referent|assistent|sachbearbeit|entwickler|berater|monteur|mechani)", re.I)
        cands = []
        for a in soup.find_all("a", href=True):
            title, href = clean(a.get_text(" ")), a["href"].strip()
            if href.startswith("http") and 8 <= len(title) <= 140 and not SKIP_TXT.search(title) and (JOB_RE.search(href) or JOBWORD.search(title)):
                cands.append((a, title, href))
        cset = {id(a) for a, _, _ in cands}
        for a, title, href in cands:
            box = a   # größter Vorfahr, der keine weitere Stellen-Verlinkung enthält
            for _ in range(6):
                par = box.parent
                if par is None or par.name in ("body", "html") or any(id(x) in cset and x is not a for x in par.find_all("a", href=True)):
                    break
                box = par
            lines = [l.strip() for l in box.get_text("\n").split("\n") if l.strip() and l.strip() != title]
            jobs.append({"title": title, "company": lines[0][:80] if lines else "", "location": lines[1][:60] if len(lines) > 1 else "", "url": href,
                         "source": f"Jobalarm ({portal.capitalize()})", "description": " ".join(lines[2:6])[:400]})
    elif text:
        for m in re.finditer(r"(?m)^(.{8,140})\n+\s*(https?://\S+)", text):
            if not SKIP_TXT.search(m.group(1)):
                jobs.append({"title": m.group(1).strip(), "company": "", "location": "", "url": m.group(2), "source": f"Jobalarm ({portal})", "description": ""})
    seen, out = set(), []
    for j in jobs:
        k = j["title"].lower()
        if k not in seen:
            seen.add(k); out.append(j)
    return {"from": sender, "subject": subject, "date": _hdr(msg.get("Date")), "jobs": out[:60]}


def fetch_imap(host: str, user: str, password: str, port: int = 993, folder: str = "INBOX", days: int = 14, max_mails: int = 30) -> dict:
    since = (dt.date.today() - dt.timedelta(days=days)).strftime("%d-%b-%Y")
    M = imaplib.IMAP4_SSL(host, port, timeout=30)
    try:
        M.login(user, password)
        M.select(folder, readonly=True)   # nur lesen, nichts verändern
        ids = []
        for s in SENDERS:
            typ, data = M.search(None, "SINCE", since, "FROM", s)
            if typ == "OK" and data and data[0]:
                ids += data[0].split()
        ids = sorted(set(ids), key=int)[-max_mails:]
        mails, jobs = [], []
        for i in reversed(ids):
            typ, data = M.fetch(i, "(RFC822)")
            if typ != "OK" or not data or not isinstance(data[0], tuple):
                continue
            r = parse_email(data[0][1])
            mails.append({"from": r["from"], "subject": r["subject"], "date": r["date"], "count": len(r["jobs"])})
            jobs += r["jobs"]
        seen, uniq = set(), []
        for j in jobs:
            k = (j["title"].lower(), j["url"].split("?")[0])
            if k not in seen:
                seen.add(k); uniq.append(j)
        return {"mails": mails, "jobs": uniq}
    finally:
        try:
            M.logout()
        except Exception:
            pass


# ---------------- Firmen-Karriereseiten in der Region finden ----------------
ATS_PATTERNS = [
    ("personio", "site:jobs.personio.de", re.compile(r"https?://([a-z0-9-]+)\.jobs\.personio\.(?:de|com)", re.I)),
    ("greenhouse", "site:boards.greenhouse.io", re.compile(r"https?://(?:job-)?boards\.greenhouse\.io/([a-z0-9-]+)", re.I)),
    ("lever", "site:jobs.lever.co", re.compile(r"https?://jobs\.lever\.co/([a-z0-9-]+)", re.I)),
    ("smartrecruiters", "site:jobs.smartrecruiters.com", re.compile(r"https?://jobs\.smartrecruiters\.com/([A-Za-z0-9-]+)", re.I)),
    ("recruitee", "site:recruitee.com", re.compile(r"https?://([a-z0-9-]+)\.recruitee\.com", re.I)),
]
BAD_SLUGS = {"www", "jobs", "api", "careers", "boards", "embed", "search", "de", "en"}


def discover_companies(where: str, q: str, get, engines=("duckduckgo", "bing", "mojeek")) -> dict:
    found, errors = {}, {}
    for ats, site, rx in ATS_PATTERNS:
        query = quote_plus(f"{site} {q} {where}".strip())
        for e in engines:
            name, tpl = ENGINES[e]
            try:
                html = get(tpl.format(q=query), timeout=20).text
            except Exception as ex:
                errors[f"{ats}/{e}"] = str(ex)[:120]
                continue
            for u in result_links(html):
                m = rx.match(u)
                if m and m.group(1).lower() not in BAD_SLUGS:
                    slug = m.group(1)
                    key = f"{ats}:{slug.lower()}"
                    found.setdefault(key, {"ats": ats, "slug": slug, "name": slug.replace("-", " ").title(), "via": name})
    return {"companies": list(found.values())[:80], "errors": errors}
