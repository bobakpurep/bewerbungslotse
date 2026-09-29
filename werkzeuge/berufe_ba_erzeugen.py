"""Erzeugt berufe-ba.js (Berufsverzeichnis für den Offline-Abgleich) aus der BA-Berufeliste.

Quelle der Rohdaten: npm-Paket @cross-solution/strapi-plugin-bfa (MIT), Datei
server/content-types/bfa-berufe/vam_beruf_kurz.json – Berufe der Bundesagentur für Arbeit
mit Berufskennziffer (bkz, beginnt mit dem 5-stelligen KldB-2010-Code).
Aufruf:  npm pack @cross-solution/strapi-plugin-bfa && tar xzf *.tgz
         python berufe_ba_erzeugen.py package/server/content-types/bfa-berufe/vam_beruf_kurz.json ../berufe-ba.js
"""
import json, re, sys

src, dst = sys.argv[1], sys.argv[2]
rows = json.load(open(src, encoding="utf-8"))

def kurz(name: str) -> str:
    # "Elektroniker/Elektronikerin" -> "Elektroniker/in", "Kaufmann/-frau" bleibt
    name = re.sub(r"\b(\w+?)(e?)/\1\2in\b", r"\1\2/in", name)
    name = re.sub(r"\b(\w+)mann/(\w+)frau\b", r"\1mann/-frau", name)
    return re.sub(r"\s+", " ", name).strip()

out, seen = [], set()
for r in rows:
    m = re.match(r"B (\d{5})-(\d+)", r.get("bkz", ""))
    if not m or r.get("zustand") != "E":
        continue
    code, typ = m.group(1), r.get("type")   # t = Tätigkeit, a = Aus-/Weiterbildung/Studium
    name = kurz(r.get("bezeichnungNeutral") or "")
    key = (code, typ, name.lower())
    if not name or key in seen:
        continue
    seen.add(key)
    out.append([code, typ, name])
out.sort(key=lambda x: (x[0], x[1] != "t", x[2]))
with open(dst, "w", encoding="utf-8") as f:
    f.write("/* Berufsverzeichnis der Bundesagentur für Arbeit (KldB-2010-Code, t=Tätigkeit/a=Ausbildung, Bezeichnung).\n"
            "   Erzeugt mit werkzeuge/berufe_ba_erzeugen.py. Anforderungsniveau = 5. Ziffer des Codes:\n"
            "   1 Helfer, 2 Fachkraft, 3 Spezialist (z. B. Meister/Techniker), 4 Experte (z. B. Studium). */\n")
    f.write("window.BA_BERUFE=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(len(out), "Einträge")
