"""ESCO offline: offizielles ESCO-Datenpaket (CSV, Sprache de) importieren und Kompetenzen → Berufe auswerten.

Das Paket lädt man kostenlos unter https://esco.ec.europa.eu/en/use-esco/download herunter
(Sprache „de“, Format „CSV“). Benötigt werden daraus:
  occupations_de.csv            – Berufe (conceptUri, preferredLabel, altLabels)
  skills_de.csv                 – Kompetenzen (conceptUri, preferredLabel, altLabels)
  occupationSkillRelations*.csv – Zuordnung Beruf ↔ Kompetenz (essential / optional)
Spaltennamen werden flexibel erkannt, da sie sich zwischen ESCO-Versionen leicht unterscheiden können.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import zipfile

DATA = os.getenv("BL_DATA", os.path.join(os.path.dirname(__file__), "data"))
INDEX = os.path.join(DATA, "esco_index.json")
_idx: dict | None = None


def _norm(s: str) -> str:
    s = (s or "").lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    return " ".join(re.sub(r"[^a-z0-9+#]+", " ", s).split())


def _col(header: list[str], *names: str) -> str | None:
    low = {h.lower(): h for h in header}
    for n in names:
        if n.lower() in low:
            return low[n.lower()]
    for h in header:                      # Teilübereinstimmung als Rückfall
        if any(n.lower() in h.lower() for n in names):
            return h
    return None


def _read(z: zipfile.ZipFile, pattern: str):
    name = next((n for n in z.namelist() if re.search(pattern, os.path.basename(n), re.I)), None)
    if not name:
        return None, None
    text = z.read(name).decode("utf-8-sig", errors="replace")
    r = csv.DictReader(io.StringIO(text))
    return r, r.fieldnames or []


def import_zip(data: bytes) -> dict:
    z = zipfile.ZipFile(io.BytesIO(data))
    occ_r, occ_h = _read(z, r"^occupations_.*\.csv$")
    sk_r, sk_h = _read(z, r"^skills_.*\.csv$")
    rel_r, rel_h = _read(z, r"^occupationSkillRelations.*\.csv$")
    if not (occ_r and sk_r and rel_r):
        raise ValueError("Im ZIP fehlen occupations_*.csv, skills_*.csv oder occupationSkillRelations*.csv")
    ou, ol, oa = _col(occ_h, "conceptUri", "uri"), _col(occ_h, "preferredLabel"), _col(occ_h, "altLabels")
    su, sl, sa = _col(sk_h, "conceptUri", "uri"), _col(sk_h, "preferredLabel"), _col(sk_h, "altLabels")
    ro, rs, rt = _col(rel_h, "occupationUri"), _col(rel_h, "skillUri"), _col(rel_h, "relationType")
    occ, occ_id = [], {}
    for row in occ_r:
        uri = row.get(ou)
        if uri and uri not in occ_id:
            occ_id[uri] = len(occ)
            occ.append([row.get(ol) or "", [a.strip() for a in (row.get(oa) or "").split("\n") if a.strip()][:8]])
    skills, sk_id, terms = [], {}, {}
    for row in sk_r:
        uri = row.get(su)
        if not uri or uri in sk_id:
            continue
        sk_id[uri] = len(skills)
        skills.append(row.get(sl) or "")
        for label in [row.get(sl) or ""] + (row.get(sa) or "").split("\n"):
            n = _norm(label)
            if 3 <= len(n) <= 60:
                terms.setdefault(n, sk_id[uri])
    rel: dict[int, list] = {}
    n_rel = 0
    for row in rel_r:
        o, s = occ_id.get(row.get(ro)), sk_id.get(row.get(rs))
        if o is None or s is None:
            continue
        rel.setdefault(s, []).append([o, 1 if "essential" in (row.get(rt) or "").lower() else 0])
        n_rel += 1
    os.makedirs(DATA, exist_ok=True)
    with open(INDEX, "w", encoding="utf-8") as f:
        json.dump({"occ": occ, "skills": skills, "terms": terms, "rel": rel}, f, ensure_ascii=False, separators=(",", ":"))
    global _idx
    _idx = None
    return {"occupations": len(occ), "skills": len(skills), "relations": n_rel}


def available() -> bool:
    return os.path.exists(INDEX)


def _load() -> dict:
    global _idx
    if _idx is None:
        with open(INDEX, encoding="utf-8") as f:
            _idx = json.load(f)
        _idx["rel"] = {int(k): v for k, v in _idx["rel"].items()}
    return _idx


def find_skill(term: str) -> int | None:
    idx = _load()
    n = _norm(term)
    if n in idx["terms"]:
        return idx["terms"][n]
    # Rückfall: kürzester ESCO-Begriff, der den Suchbegriff als ganzes Wort enthält
    best = None
    for t, sid in idx["terms"].items():
        if re.search(rf"(^| ){re.escape(n)}( |$)", t) and (best is None or len(t) < len(best[0])):
            best = (t, sid)
    return best[1] if best else None


def occupations_for(skills: list[str], limit: int = 15) -> list[dict]:
    idx = _load()
    agg: dict[int, dict] = {}
    for sk in skills:
        sid = find_skill(sk)
        if sid is None:
            continue
        for o, essential in idx["rel"].get(sid, []):
            a = agg.setdefault(o, {"score": 0.0, "skills": []})
            a["score"] += 1.0 if essential else 0.5
            if sk not in a["skills"]:
                a["skills"].append(sk)
    ranked = sorted(agg.items(), key=lambda kv: (-kv[1]["score"], -len(kv[1]["skills"])))[:limit]
    return [{"title": idx["occ"][o][0], "alt": idx["occ"][o][1][:4], "score": a["score"], "skills": a["skills"]} for o, a in ranked]
