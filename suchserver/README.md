# Bewerbungslotse – eigener Suchserver (kostenlose Metasuche)

Der Suchserver ist eine selbst gebaute, kostenlose Alternative zu SerpAPI (Google Jobs) und Careerjet. Er braucht keinen Schlüssel und kein Konto.

| Fähigkeit (wie bei SerpAPI/Careerjet) | So löst es der Suchserver | Datei |
|---|---|---|
| Viele Portale in einer Suche | Arbeitsagentur (offizielle Schnittstelle), Indeed, LinkedIn und Google Jobs (über JobSpy), StepStone, XING, kimeta, meinestadt, jobware (eigener Extraktor), Arbeitnow, Firmen-Karriereseiten | `server.py`, `extract.py` |
| Doppelte Anzeigen zusammenführen | Titel und Firma werden vereinheitlicht (m/w/d, GmbH …) und unscharf verglichen; es entsteht **ein** Eintrag mit allen Bewerbungswegen (`applyOptions`) | `merge.py` |
| Bewerbungslink beim Arbeitgeber | Firmenkürzel werden bei Personio, Greenhouse, Lever, Recruitee und SmartRecruiters geprüft und der passende Stellentitel gesucht. Sonst wird auf der Firmen-Website die Karriereseite gesucht. Optional gibt es eine Websuche | `direct.py` |
| Umkreissuche | eigene Entfernungsberechnung über die GeoNames-Postleitzahlen (offline), ersatzweise OpenStreetMap Nominatim | `geo.py` |
| Gehalt, Arbeitszeit, Homeoffice, Zeitarbeit | wird aus dem deutschen Anzeigentext erkannt und auf Monatsbrutto umgerechnet | `merge.py` |
| Zwischenspeicher, Schutz | Ergebnisse werden zwischengespeichert, pro Domain gibt es Pausen, Zugang nur mit Token, Schutz vor Missbrauch der Abruf-Funktion (SSRF) | `server.py` |

**Grenzen:** Google Jobs selbst liest der Suchserver über JobSpy aus. Google blockiert solche Abfragen öfter als die bezahlte SerpAPI. Dafür sind Arbeitsagentur, Indeed und StepStone direkt angebunden, sodass der Großteil der Anzeigen auch ohne Google gefunden wird.

| Quelle | Stabilität (meine Einschätzung) |
|---|---|
| Arbeitsagentur | gut (öffentliche Schnittstelle, allerdings nur inoffiziell dokumentiert) |
| Indeed | gut, laut JobSpy „kein Rate-Limit“ |
| LinkedIn | schwach: blockiert laut JobSpy meist ab ca. Seite 10; verstößt gegen die LinkedIn-Regeln |
| Google Jobs | mittel, Google blockiert oft |
| StepStone, XING, kimeta, meinestadt, jobware | unbekannt, nicht live getestet |
| Firmen-Karriereseiten | gut, offiziell öffentlich |

## Starten

Normalerweise startet man nicht diesen Ordner, sondern das **Programm** oder die **Starter-Datei** im Hauptordner (siehe Haupt-README). Beide öffnen den Browser automatisch, eine Einrichtung ist nicht nötig.

Für Entwickler: `pip install -r requirements.txt && python server.py`. Die App läuft dann unter `http://127.0.0.1:8787`; ist der Port belegt, nimmt das Programm den nächsten freien. Mit Docker: `docker build -t bl . && docker run -p 8787:8787 -e BL_TOKEN=geheim bl`.

## Websuche und Jobsuchmaschinen

- **Websuche** (`websearch.py`): Suchmaschinen finden neben Portalanzeigen auch Stellen auf Firmen-Websites. Das Programm schickt „Beruf Stellenangebot Ort“ an DuckDuckGo, Bing, Brave und Mojeek; Startpage, Ecosia und Google lassen sich zuschalten. Es sammelt die Ergebnis-Links, löst Weiterleitungen auf, behält nur Stellenseiten und liest diese aus (JSON-LD, eingebettete Daten, Links).
- **Jobsuchmaschinen über ihre Webseiten, ohne Schlüssel:** Jooble, Jobrapido, talent.com, Careerjet.
- **Weitere Portale (Stand 27.09.2026):**
  - *Eigene Such-Adresse:* Monster, Workwise, hokify, jobninja (nur Ort), Regio-Jobanzeiger (nur Berlin, Stuttgart, Nürnberg, Hannover, Leipzig, Bodensee), praktischArzt, HOGAPAGE, jobvector, heise Jobs, Salesjob, medien.jobs, greenjobs, nachhaltigejobs (die letzten drei nur Ort). Liefert die Adresse nichts, sucht das Programm automatisch über Suchmaschinen mit `site:` weiter.
  - *Nur über Suchmaschinen (`site:`):* stellenanzeigen.de, Yourfirm, Interamt, Absolventa, Staufenbiel, Medi-Jobs – deren Suchseiten waren nicht abrufbar oder das Adress-Schema war unbekannt.
  - *service.bund.de:* offizieller RSS-Feed (neueste Stellen von Bund, Ländern, Kommunen, lokal nach Begriff gefiltert) plus `site:`-Suche.
  - *Branchen-Portale* schaltet die App passend zum Suchbegriff automatisch zu (z. B. Koch → HOGAPAGE, Softwareentwickler → heise Jobs, Pflege → Medi-Jobs); abschaltbar.
  - Geprüft wurden die Such-Adressen nur per Abruf einzelner Beispielseiten; das Auslesen selbst lief bisher nur mit simulierten Seiten.
- **Grenzen:** Suchmaschinen blockieren automatisierte Abfragen oft mit Captchas. Fällt eine aus, laufen die anderen weiter, und der Grund steht in der App. Die Such-Adressen sind Stand 09/2026 und nicht live geprüft.

## Einstellungen (Umgebungsvariablen)

| Variable | Bedeutung | Standard |
|---|---|---|
| `BL_TOKEN` | Zugangsschlüssel; ohne ihn kann jeder den Server nutzen | leer |
| `BL_ORIGINS` | erlaubte App-Adressen, z. B. `https://name.github.io` | `*` |
| `BL_DELAY` | Pause zwischen Detailseiten in Sekunden | `1.5` |
| `BL_CACHE_MIN` | Minuten, die gleiche Suchen zwischengespeichert werden | `20` |
| `BL_WEBSEARCH` | `1` = für den Direktlink auch per DuckDuckGo nach der Firmen-Website suchen | `0` |
| `BL_DIRECT_DAYS` | wie lange gefundene Direktlinks gespeichert werden (Tage) | `7` |
| `BL_DATA` | Ordner für PLZ-Tabelle und Zwischenspeicher | `data/` |
| `BL_PROXIES` | Proxys, kommagetrennt (`user:pass@host:port`) | – |
| `BL_COMPANIES` | Pfad zur Firmenliste | `companies.json` |
| `BL_HOST`, `PORT` | Adresse und Port (Standard nur für diesen Computer erreichbar) | `127.0.0.1`, `8787` |
| `BL_NO_BROWSER` | `1` = Browser nicht automatisch öffnen | – |

## Firmen-Karriereseiten (`companies.json`)

Trage dort Firmen ein, bei denen du dich bewerben möchtest. Das Kürzel steht in der Adresse ihrer Karriereseite:

- **Personio:** `https://KUERZEL.jobs.personio.de`
- **Greenhouse:** `boards.greenhouse.io/KUERZEL`
- **Lever:** `jobs.lever.co/KUERZEL`
- **SmartRecruiters:** `jobs.smartrecruiters.com/KUERZEL`
- **Recruitee:** `KUERZEL.recruitee.com`

```json
[{"name": "Muster GmbH", "ats": "personio", "slug": "muster"},
 {"name": "Beispiel AG", "ats": "website", "slug": "https://beispiel.de/karriere"}]
```

Mit `"ats": "website"` lässt sich jede Karriereseite eintragen, die Stellen als JSON-LD oder als Links anzeigt.

## Schnittstelle

- `GET /health` zeigt den Status und die verfügbaren Quellen.
- `GET /search?q=Elektriker&where=10115 Berlin&radius=25&days=30&sites=arbeitsagentur,indeed,stepstone,xing,google,arbeitnow,ats&details=true&direct=true&noZeitarbeit=true` ist die Metasuche.
- Parameter `type` bei `/search`: `1` Arbeit (Standard), `4` Ausbildung/duales Studium, `34` Praktikum/Trainee, `2` Selbstständigkeit, `studium` Studium (Studiensuche der BA + Hochschulkompass/studieren.de über Suchmaschinen). Bei Ausbildung werden ausbildung.de, azubi.de, AZUBIYO und aubi-plus automatisch mitgesucht; Treffer aus allgemeinen Portalen werden auf die Angebotsart eingegrenzt.
- `GET /direct?company=Muster GmbH&title=Elektriker&website=https://muster.de` sucht den Direktlink für eine einzelne Stelle.
- `GET /local.json` zeigt den lokalen Modus an; die App richtet sich daran automatisch ein.
- `GET|POST /proxy/?url=` ist ein eingebauter Proxy für Arbeitsagentur, ESCO, Arbeitnow, Adzuna und Jooble. Er ersetzt den Cloudflare Worker.
- `GET /extract?url=https://firma.de/karriere/123` liest Stellendaten aus einer beliebigen öffentlichen Seite. Private Netzadressen sind gesperrt.

- `GET /selftest` prüft jede Quelle und Suchmaschine einzeln (für „Selbsttest starten“ in der App).
- `POST /esco/import` (ZIP des ESCO-Pakets als Rohdaten) und `GET /esco/berufe?skills=…` – ESCO offline.
- `GET /ollama/status|system|recommend`, `POST /ollama/start|install|pull|delete|test`, `GET /ollama/job/{id}`, `/ollama/v1/…` (Weiterleitung an das lokale Ollama) – Ollama-Assistent. Installation und Modell-Download starten nur nach Bestätigung in der App.
- `POST /mail/parse` (.eml-Datei) und `POST /mail/imap` (Postfach nur lesend; das Passwort wird nur für diese Anfrage verwendet und nicht gespeichert) – Jobalarm-E-Mails.
- `GET|POST /companies` und `GET /companies/discover?where=Berlin&q=` – gespeicherte Firmen und Suche nach Firmen-Karriereseiten in der Region.

- `POST /firmen/start` (`{"q", "where", "radius", "max"}`), `GET /firmen/job/{id}`, `POST /firmen/cancel/{id}` – Firmen im Umkreis aus OpenStreetMap holen und ihre Websites nach Stellen durchsuchen (`localfirms.py`). Eine Overpass-Abfrage je Beruf, Ergebnisse 7 Tage zwischengespeichert; Websites ohne Karriereseite werden 14 Tage übersprungen. Eigener Overpass-Server über `BL_OVERPASS`. Die Zuordnung Beruf → OSM-Merkmale ist eine eigene, unvollständige Liste.

- `POST /backup` / `GET /backup` – automatische Sicherung der App-Daten im Datenordner (`sicherungen/aktuell.json` plus die letzten 10 Stände, höchstens einer pro Stunde). Schlüssel und Token werden nicht gespeichert.

- Firmen im Umkreis: `sources` = `["osm","overture"]`, `robots` = true/false. Overture braucht das Paket `duckdb` (in der Programmdatei enthalten); beim ersten Abruf lädt DuckDB seine Erweiterung `httpfs` aus dem Internet. Neuester Overture-Stand wird aus dem öffentlichen Speicher ermittelt, sonst `BL_OVERTURE_RELEASE`; eigene Datei über `BL_OVERTURE_SOURCE`.
- robots.txt: `BL_ROBOTS=1` (Portale/Suchmaschinen, Standard aus), `BL_ROBOTS_FIRMS=0` (Firmen-Websites, Standard an) bzw. Parameter `robots` bei `/search` und `/firmen/start`.

Das Token wird als Header `x-bl-token` oder als Parameter `?token=` übergeben.

## Wichtig

Das Auslesen von Indeed, LinkedIn, StepStone, XING und Google verstößt nach meinem Kenntnisstand gegen deren Nutzungsbedingungen. Der Server ist deshalb nur für den **eigenen, privaten Gebrauch** gedacht: Jeder Nutzer betreibt seinen eigenen Server, und es gibt keinen zentralen Dienst. Ein öffentlicher Betrieb für viele Nutzer wäre rechtlich riskant. Vor einer Veröffentlichung solltest du das rechtlich prüfen lassen. Das hier ist keine Rechtsberatung.

**Getestet** (Stand 26.09.2026): mit simulierten Antworten. Geprüft wurden Zusammenführung aus 6 Quellen (11 Treffer ergaben 6 Stellen), Direktlink über Personio und über die Firmen-Website, Umkreisfilter, Gehaltserkennung, Zugriffsschutz, SSRF-Sperre und CORS, Selbsttest, ESCO-Import mit Testpaket, Ollama-Assistent mit simuliertem Ollama, Jobalarm-Mail (.eml und IMAP simuliert), Firmensuche.

**Nicht getestet:** echte Portalseiten, weil der Netzzugang aus meiner Testumgebung gesperrt war.

**Quellenhinweis:** Die Postleitzahlen stammen von GeoNames (www.geonames.org), Lizenz CC BY 4.0. Die Namensnennung ist Pflicht. Firmendaten: © OpenStreetMap-Mitwirkende, ODbL (www.openstreetmap.org/copyright); Overture Maps Foundation (CDLA Permissive 2.0, Foursquare-Anteil Apache 2.0).
