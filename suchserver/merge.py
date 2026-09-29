"""Vereinheitlichen und Zusammenführen (was Google Jobs / SerpAPI als „Clustering“ und „apply_options“ liefert).

- Gleiche Stelle aus mehreren Quellen -> ein Eintrag mit allen Bewerbungswegen (applyOptions)
- Gehalt, Arbeitszeit, Homeoffice, Zeitarbeit, E-Mail aus dem Text erkennen (deutsch)
- Bewerbungsweg direkt beim Arbeitgeber bevorzugen
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

from extract import find_email

PORTALS = ("indeed.", "stepstone.", "linkedin.", "xing.", "glassdoor.", "jooble.", "kimeta.", "jobware.", "monster.", "meinestadt.",
           "arbeitsagentur.", "talent.com", "jobrapido.", "careerjet.", "google.", "arbeitnow.", "stellenanzeigen.de", "jobvector.", "jobs.de", "adzuna.",
           "yourfirm.", "interamt.", "service.bund.de", "absolventa.", "staufenbiel.", "hokify.", "jobninja.", "workwise.", "-jobanzeiger.de", "medi-jobs.", "praktischarzt.", "hogapage.", "jobs.heise.de", "salesjob.", "boersenblatt.net", "greenjobs.", "nachhaltigejobs.")
LEGAL = r"\b(gmbh|mbh|ag|se|kg|kgaa|ohg|gbr|ug|e\.?\s?v|co|und|&|haftungsbeschraenkt|holding|group|gruppe|deutschland|germany)\b"
GENDER = r"\((?:m|w|d|f|x|i|gn|div|all genders?)[\s/|,*-]*(?:[mwdfxi][\s/|,*-]*){0,3}\)|\b(m/w/d|w/m/d|d/m/w|m/f/d|m/w/x|m/w|w/m)\b|\*in\b|/-?in\b|:in\b|\binnen\b"


def is_portal(url: str) -> bool:
    return any(p in (url or "") for p in PORTALS)


def de(s: str) -> str:
    return (s or "").lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")


def norm_title(t: str) -> str:
    t = re.sub(GENDER, " ", de(t))
    t = re.sub(r"\b(ab sofort|sofort|vollzeit|teilzeit|unbefristet|befristet|quereinsteiger|junior|senior|remote|homeoffice)\b", " ", t)
    return " ".join(re.sub(r"[^a-z0-9+#]+", " ", t).split())


def norm_company(c: str) -> str:
    c = re.sub(LEGAL, " ", de(c))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", c).split())


def parse_salary(text: str):
    """Monatsbrutto (min, max) in € aus deutschem Text – grobe Erkennung."""
    n = de(text).replace(" ", " ")
    m = re.search(r"(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})(?:,\d{2})?\s*(?:€|eur|euro)?\s*(?:-|–|bis)\s*(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})(?:,\d{2})?\s*(?:€|eur|euro)([^.\n]{0,30})", n)
    if m:
        lo, hi, ctx = int(re.sub(r"[.\s]", "", m.group(1))), int(re.sub(r"[.\s]", "", m.group(2))), m.group(3)
    else:
        m = re.search(r"(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})(?:,\d{2}|,-)?\s*(?:€|eur|euro)([^.\n]{0,30})", n)
        if not m:
            h = re.search(r"(\d{2}(?:,\d{1,2})?)\s*(?:€|eur|euro)\s*(?:brutto\s*)?(?:pro|/|je)\s*(?:stunde|std)", n)
            if h:
                v = round(float(h.group(1).replace(",", ".")) * 173)
                return v, v
            return None, None
        lo = hi = int(re.sub(r"[.\s]", "", m.group(1)))
        ctx = m.group(2)
    yearly = bool(re.search(r"jahr|p\.\s?a|jaehrlich", ctx)) or lo > 15000
    if yearly:
        lo, hi = round(lo / 12), round(hi / 12)
    ok = lambda v: v if 800 <= v <= 25000 else None
    return ok(lo), ok(hi)


def detect_worktime(text: str) -> str:
    n = de(text)
    if re.search(r"minijob|geringfuegig|520 ?€|538 ?€|556 ?€", n):
        return "mj"
    if re.search(r"homeoffice|home-office|remote|mobiles arbeiten", n) and not re.search(r"kein(e|en)? (homeoffice|remote)", n):
        return "ho"
    if re.search(r"\bteilzeit\b|part[- ]time", n) and not re.search(r"vollzeit", n):
        return "tz"
    if re.search(r"schichtarbeit|schichtdienst|nachtdienst|wochenenddienst|\b3-schicht", n):
        return "snw"
    if re.search(r"vollzeit|full[- ]time", n):
        return "vz"
    return ""


def is_zeitarbeit(text: str) -> bool:
    return bool(re.search(r"zeitarbeit|arbeitnehmerueberlassung|personaldienstleist|personalvermittlung|im auftrag unseres kunden|fuer unseren kunden", de(text)))


def normalize(j: dict) -> dict:
    text = f"{j.get('title', '')}\n{j.get('description', '')}"
    if not j.get("salaryMin") and not j.get("salaryMax"):
        j["salaryMin"], j["salaryMax"] = parse_salary(text)
    j["worktime"] = j.get("worktime") or detect_worktime(text)
    j["remote"] = bool(j.get("remote")) or j["worktime"] == "ho"
    j["zeitarbeit"] = is_zeitarbeit(text + " " + (j.get("company") or ""))
    j["email"] = j.get("email") or find_email(j.get("description", ""))
    opts = j.setdefault("applyOptions", [])
    if j.get("url") and not any(o["url"] == j["url"] for o in opts):
        opts.append({"via": j.get("source", ""), "url": j["url"], "direct": not is_portal(j["url"])})
    if j.get("directUrl") and not any(o["url"] == j["directUrl"] for o in opts):
        opts.insert(0, {"via": "Arbeitgeber", "url": j["directUrl"], "direct": True})
    return j


def same(a: dict, b: dict) -> bool:
    ca, cb = norm_company(a.get("company")), norm_company(b.get("company"))
    if ca and cb and ca != cb and SequenceMatcher(None, ca, cb).ratio() < 0.85 and not (ca in cb or cb in ca):
        return False
    ta, tb = norm_title(a.get("title")), norm_title(b.get("title"))
    if not ta or not tb:
        return False
    if ta == tb:
        return bool(ca and cb) or (a.get("location") or "")[:6].lower() == (b.get("location") or "")[:6].lower()
    return bool(ca and cb) and SequenceMatcher(None, ta, tb).ratio() >= 0.88


def merge(jobs: list[dict]) -> list[dict]:
    out: list[dict] = []
    buckets: dict[str, list[int]] = {}
    for j in map(normalize, jobs):
        key = norm_company(j.get("company"))[:12] or norm_title(j.get("title"))[:12]
        hit = next((i for i in buckets.get(key, []) if same(out[i], j)), None)
        if hit is None:
            j["sources"] = [j.get("source", "")]
            buckets.setdefault(key, []).append(len(out))
            out.append(j)
            continue
        m = out[hit]
        if j.get("source") not in m["sources"]:
            m["sources"].append(j.get("source", ""))
        for o in j["applyOptions"]:
            if not any(x["url"] == o["url"] for x in m["applyOptions"]):
                m["applyOptions"].append(o)
        if len(j.get("description") or "") > len(m.get("description") or ""):
            m["description"] = j["description"]
        for k in ("directUrl", "website", "email", "salaryMin", "salaryMax", "worktime", "lat", "lon", "published"):
            if j.get(k) and not m.get(k):
                m[k] = j[k]
        if j.get("published") and m.get("published") and j["published"] < m["published"]:
            m["published"] = j["published"]
    for m in out:
        m["applyOptions"].sort(key=lambda o: not o["direct"])
        if not m.get("directUrl"):
            d = next((o["url"] for o in m["applyOptions"] if o["direct"]), "")
            m["directUrl"] = d
        m["source"] = " + ".join(dict.fromkeys(m["sources"]))
    return out
