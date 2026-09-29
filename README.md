# Bewerbungslotse

Kostenloser, quelloffener Bewerbungs-Assistent: Er liest den Lebenslauf ein, schlägt passende Berufe vor, sucht offene Stellen in vielen Portalen und Suchmaschinen, berechnet die Passung in %, erstellt Anschreiben und verwaltet die Bewerbungen. Er braucht kein Konto und keine KI, alle Daten bleiben auf dem eigenen Gerät.

Stand: 26.09.2026 (Version 3). Prototyp, getestet mit simulierten Portalseiten (siehe „Bekannte Grenzen“).

## So startest du, ohne etwas einzurichten

Funktioniert etwas nicht? In der App unter **Einstellungen → Selbsttest** jede Quelle prüfen lassen. Der Bericht enthält keine persönlichen Daten und kann weitergegeben werden.


| | **Programm** (empfohlen, PC) | **Starter-Datei** (PC, ohne Programmdatei) | **Online** (Handy und PC) |
|---|---|---|---|
| Start | `Bewerbungslotse.exe` (Windows) bzw. `Bewerbungslotse-Mac` doppelklicken | ZIP entpacken und „Bewerbungslotse starten (Windows/Mac/Linux)“ doppelklicken | Website öffnen |
| Einrichtung | keine; der Browser öffnet sich automatisch | beim ersten Start installiert der Starter Python selbst (Windows über winget), Dauer ca. 2–5 Min. | keine |
| Suche | **alles:** Arbeitsagentur, Indeed, StepStone, XING, LinkedIn, Google Jobs, Arbeitnow, Jooble, Jobrapido, talent.com, Careerjet, kimeta, meinestadt, jobware **plus Websuche** über DuckDuckGo, Bing, Brave, Mojeek (Startpage, Ecosia, Google zuschaltbar), mit Direktlink zum Arbeitgeber | wie Programm | Arbeitsagentur, Arbeitnow; Portale über Links und den Knopf „→ Bewerbungslotse“ |

**Im lokalen Modus ist nichts einzustellen:** Das Programm liefert die App selbst aus und erledigt alle Abrufe. Ein Zwischenserver, Schlüssel oder Token ist dafür nicht nötig. Das Programmfenster bleibt geöffnet, solange du suchst. Schließt du es, ist das Programm beendet.

**Warnhinweise beim ersten Start:** Die Programmdatei ist nicht kostenpflichtig signiert. Windows zeigt deshalb eventuell „Der Computer wurde durch Windows geschützt“; dann auf „Weitere Informationen“ → „Trotzdem ausführen“ klicken. Auf dem Mac beim ersten Mal Rechtsklick → „Öffnen“ wählen.

### Für Herausgeber: Programmdateien erzeugen
Schritt für Schritt mit Klick-Anleitung: **`ANLEITUNG-GITHUB-UND-TEST.md`**. Kurzfassung:
Den Ordner als GitHub-Repository hochladen und einen Tag setzen (z. B. `v1.0.0`). Der Ablauf `.github/workflows/programm-bauen.yml` baut die Dateien für Windows, macOS und Linux dann automatisch und hängt sie an die Release-Seite an (kostenlos). Die Online-Version läuft über GitHub Pages; der Ordner `programm/` enthält den Bauplan.

## Ablauf und Module

| Schritt | Funktion | Ohne KI | Technik |
|---|---|---|---|
| 0 | Lebenslauf hochladen (PDF, DOCX, TXT), abfotografieren oder per Formular erstellen | ja | pdf.js, mammoth.js, Tesseract.js (Texterkennung auf dem Gerät) |
| 1a | Passende Berufsbezeichnungen vorschlagen | ja | Kompetenz-Wörterbuch + Berufsliste (`data.js`), optional ESCO-Suche der EU |
| 1a+ | **Berufsermittlung ohne KI:** Abgleich von Lebenslauf und Zeugnissen mit dem BA-Berufsverzeichnis (15.241 Bezeichnungen, offline): erkannte Berufe, gleiche Tätigkeit mit anderen Bezeichnungen, Aufstieg (Meister/Techniker/Studium), verwandte Berufe · Marktbezeichnungen über die Jobbörse · ESCO: Berufe zu Kompetenzen (online oder offline nach Import des ESCO-Pakets) | ja | `berufe-ba.js`, `suchserver/esco.py` |
| 0+ | **Zeugnisse** hochladen oder fotografieren: zusätzliche Kompetenzen und Abschlüsse | ja | wie Lebenslauf |
| 0++ | **Lesbarkeit prüfen und verbessern** (inkl. automatisches Geraderücken leicht schiefer Fotos bis ±8° und **durchsuchbare PDF** mit unsichtbarer Textebene): jede Datei bekommt eine Bewertung (0–100, gut/mittel/schlecht) mit Hinweisen, auch „für KI geeignet?“. Seiten ohne lesbaren Text (Scans, falsch kodierte PDFs) werden automatisch per OCR gelesen; Fotos werden vergrößert, Beleuchtung/Schatten ausgeglichen, gedrehte Seiten gerade gestellt; der Text wird bereinigt (Silbentrennung, Kopf-/Fußzeilen, Aufzählungen). Export als Textdatei für KI | ja | pdf.js, Tesseract.js |
| 1a++ | **BERUFENET** (BA): Aufstiegs- und Anpassungsweiterbildungen, verwandte Berufe zu einem erkannten Beruf | ja | online, öffentliche Schnittstelle |
| 1b | **Arbeit, Ausbildung / duales Studium, Studium oder Praktikum** wählen (Knöpfe oben in der Suche). Ausbildung und Praktikum über die Jobbörse (Angebotsart 4 bzw. 34) und Portale (ausbildung.de, azubi.de, AZUBIYO, aubi-plus); Studium über die Studiensuche der Arbeitsagentur. Passende Anschreiben-Vorlagen „Ausbildung“ und „Praktikum“ | ja | Jobbörse und Studiensuche der BA |
| 1b | Offene Stellen suchen, filtern, Passung in %, sortieren · **mehrere Berufsbezeichnungen gleichzeitig** (Anzahl einstellbar), Anzeige „gefunden über“ | ja | Jobbörse der Bundesagentur für Arbeit, Arbeitnow, optional Adzuna |
| 1c | **Weg A:** Suchlinks zu StepStone, Indeed, LinkedIn, XING, Google Jobs u. a., auf Wunsch alle Portale auf einmal öffnen | ja | nur Links |
| 1d | **Weg B:** Die im Portal angezeigten Stellen mit einem Klick übernehmen und bewerten | ja | Lesezeichen-Knopf (`extractor.js`) oder Browser-Erweiterung (`erweiterung/`) |
| 1e | Jooble | ja | kostenloser Schlüssel auf Antrag, über CORS-Proxy |
| 1f | **Eigener Suchserver (kostenlose Metasuche):** über 35 Quellen (u. a. Arbeitsagentur, Indeed, StepStone, XING, Monster, stellenanzeigen.de, service.bund.de, Interamt, EURES, Firmen-Karriereseiten; Branchen-Portale wie Medi-Jobs, HOGAPAGE, jobvector, heise Jobs werden passend zum Beruf automatisch zugeschaltet), doppelte Anzeigen zusammengeführt, Direktlink zum Arbeitgeber, Umkreis, Gehalt | ja | `suchserver/` (Python), selbst gehostet, ohne Schlüssel |
| 1g | **Jobalarm-E-Mails** der Portale einlesen (.eml-Datei oder Postfach per IMAP, nur lesend; Passwort wird nicht gespeichert) | ja | Suchprogramm |
| 1i | **Firmen im Umkreis direkt durchsuchen:** Betriebe mit Website im Umkreis aus OpenStreetMap **und Overture Maps** (u. a. Daten von Meta, Microsoft, Foursquare; über DuckDB, ohne Schlüssel), Links zu Google Maps, Apple Karten und OpenStreetMap zum Selbst-Ansehen, robots.txt der Firmen-Websites wird beachtet (abschaltbar) (passend zum Beruf), Karriereseite finden, Stellen auslesen (auch Überschriften wie „Elektriker (m/w/d)“ und Personio & Co.), Karriereseiten speichern; Zwischenspeicher 7/14 Tage, Abbrechen möglich | ja | Suchprogramm, `suchserver/localfirms.py`, Overpass API |
| 1h | **Firmen-Karriereseiten in der Region finden** (Personio, Greenhouse, Lever, SmartRecruiters, Recruitee) und speichern | ja | Suchprogramm |
| 2a | Anschreiben aus Vorlagen | ja | 4 Vorlagen, Platzhalter aus Profil und Stellentext |
| 2a+ | **Individuelles Anschreiben ohne KI:** Anforderungen der Stelle mit Lebenslauf, Zeugnissen und eigenen Stärken-Bausteinen abgleichen, Treffer hervorheben, Satzbau variieren, Wiederholungen und Floskeln prüfen, Quellen jedes Satzes anzeigen | ja | `app.js` |
| 2b | Anschreiben mit KI verbessern (3 Schritte: Fakten → Entwurf → Stilprüfung, optional eigener Schreibstil als Vorbild) | nein (optional) | Anthropic, OpenAI oder OpenAI-kompatibel, eigener Schlüssel |
| 2c | **Ollama-Assistent** (lokale KI, kostenlos): prüft Arbeitsspeicher und Grafikkarte, schlägt ein passendes Modell vor, lädt Ollama und Modell nach Bestätigung, verbindet die App | ja (lokal) | Suchprogramm + Ollama |
| 3a | Bewerbungslink öffnen (Originalanzeige, Arbeitsagentur, Karriereseite suchen) | ja | |
| 3b | E-Mail vorbereiten (Empfänger, Betreff, Text) | ja | `mailto:` |
| 3c | **Meine Bewerbungen als Pinnwand** wie bei LinkedIn: Gemerkt → In Arbeit → Beworben → Gespräch → Angebot → Archiv, verschieben per Ziehen (PC) oder Pfeilen (Handy), Liste als Alternative. Beim Merken wird die ganze Anzeige gespeichert (Stellentext, Direktlink, Frist), „Jetzt bewerben“ aus der Übersicht, Anschreiben-Entwurf wird automatisch gespeichert. Wiedervorlage (nach „Beworben“ automatisch, einstellbar), Bewerbungsfrist aus dem Text, Hinweis „fällig“, Kalenderdatei (.ics), Mitteilungen auf Wunsch. Sicherung/Wiederherstellung als Datei (ohne Schlüssel), im Programm auf dem PC zusätzlich automatisch (10 Stände). CSV-Export als Nachweis | ja | |
| 3c++ | **Vergleich nach Bedeutung** (Weg 6, optional): Profil und Stellen werden über ein lokales Einbettungsmodell (Ollama, z. B. nomic-embed-text) inhaltlich verglichen, 25 % der Passung | ja (lokal) | Ollama |
| 3c+ | **Aus meinem Verhalten lernen** (in den Einstellungen ein-/ausschaltbar, Standard aus): Merken/Bewerben/Gespräch heben ähnliche Stellen an, „Nicht interessant“ senkt sie, höchstens ±15 Punkte, sichtbar unter „Warum x %?“; gelernte Vorlieben ansehen und löschen | ja | lokal im Browser |
| 3d | Automatischer Versand nach Regeln (z. B. ab 80 %) | ja | über eigenen Webhook (n8n, Make, Zapier); Standard ist der Testmodus |
| 3e | **Weg C:** Auftrag für einen KI-Browser-Agenten (z. B. Claude in Chrome), der sucht und sich bewirbt; das Ergebnis wird zurückimportiert | nein | kostenpflichtige KI, Risiko Kontosperrung |

Jedes Modul und jede Unterfunktion lässt sich auf der Startseite einzeln an- und abwählen.

## So wird die Passung (%) berechnet

Die Berechnung ist absichtlich einfach und wird in der App bei jeder Stelle unter „Warum x %?“ angezeigt.

- **Berufsbezeichnung, 45 %:** Ähnlichkeit zwischen Stellentitel und den gewählten Berufen, einschließlich verwandter Bezeichnungen.
- **Kompetenzen, 40 %:** Anteil der im Stellentext erkannten Anforderungen, die im Profil vorhanden sind. Die App zeigt erfüllte Anforderungen (✓) und fehlende (✗).
- **Wünsche, 15 %:** Entfernung, Gehalt und Arbeitszeit, soweit sie bekannt sind.
- **Anforderungen:** Pflicht-Kompetenzen zählen 1,5-fach, „wünschenswert“ 0,5-fach. Zusätzlich verglichen werden Berufserfahrung in Jahren, Abschluss-Stufe (Helfer bis Studium) und Sprachniveau (A1–C2). Fehlen Pflichtanforderungen, wird die Passung gedämpft. Optional kann eine KI die Stelle zusätzlich bewerten.
- **Ohne Stellentext:** Gewichtung 75 % Titel und 25 % Wünsche. Die Stelle wird dann als „grobe Schätzung“ markiert.

Das ist eine Stichwort-Heuristik und keine semantische Bewertung. Sie verbessert sich, wenn Wörterbuch und Berufsliste in `data.js` erweitert werden.

## Veröffentlichen (kostenlos)

1. **GitHub Pages:** Neues Repository anlegen, alle Dateien außer `worker.js` hochladen, dann unter Settings → Pages den Branch `main` wählen. Die App ist danach unter `https://NAME.github.io/REPO/` erreichbar. Alternativ gehen Netlify oder Cloudflare Pages per Drag & Drop.
2. HTTPS ist Voraussetzung für Installation und Offline-Betrieb. Die genannten Anbieter stellen es automatisch bereit.
3. **Installieren:** Auf Android über Chrome → Menü → „App installieren“. Auf iOS über Safari → Teilen → „Zum Home-Bildschirm“.

### CORS-Proxy (nur falls nötig)

Browser blockieren Abfragen an Schnittstellen, die das nicht ausdrücklich erlauben (CORS). **Ob die Schnittstellen von Arbeitsagentur, ESCO und Arbeitnow direkte Browser-Aufrufe erlauben, konnte ich nicht prüfen.** Meldet die App „Direktaufruf blockiert“, hilft ein Proxy:

1. Kostenloses Konto bei Cloudflare anlegen, dann Workers & Pages → Create Worker.
2. Den Inhalt von `worker.js` einfügen und auf Deploy klicken.
3. In `ALLOWED_ORIGINS` die eigene App-Adresse eintragen, damit fremde Seiten den Proxy nicht nutzen können.
4. Die Worker-Adresse in der App unter Einstellungen → CORS-Proxy eintragen.

Der Proxy leitet nur an die freigegebenen Adressen weiter und ist damit kein offener Proxy.

### Auto-Versand per Webhook (optional)

Die App sendet pro Bewerbung ein JSON per POST an den Webhook:

```json
{ "to": "karriere@firma.de", "subject": "Bewerbung als …", "text": "…", "replyTo": "ich@…",
  "applicant": { "name": "…", "email": "…", "phone": "…" },
  "job": { "id": "…", "title": "…", "company": "…", "location": "…", "url": "…", "refnr": "…", "score": 86 } }
```

Beispiel mit n8n (kostenlos selbst hostbar):

- Webhook-Node empfängt die Daten.
- Read-Binary-File-Node lädt den Lebenslauf als PDF.
- E-Mail-Node (SMTP oder Gmail) versendet mit Anhang.
- Die Webhook-Antwort muss HTTP 200 sein und CORS für die App-Adresse erlauben.

## Portale einbinden: welcher Weg wofür

| | Weg A: Links | Weg B: Übernehmen | Suchserver (Metasuche) | Weg C: KI-Agent |
|---|---|---|---|---|
| StepStone, Indeed, XING | öffnen | ja | ja | ja |
| Monster, stellenanzeigen.de, service.bund.de, Interamt, Yourfirm, Workwise u. a. | öffnen (teils über DuckDuckGo `site:`) | ja | ja | ja |
| Branchen-Portale (Medi-Jobs, praktischArzt, HOGAPAGE, jobvector, heise Jobs, Salesjob, medien.jobs, greenjobs, nachhaltigejobs, Absolventa, Staufenbiel) | öffnen, passend zum Beruf | ja | ja, automatisch passend zum Beruf | ja |
| LinkedIn | öffnen | ja (Risiko) | ja (Risiko, oft blockiert) | ja (Risiko) |
| Direktlink zum Arbeitgeber | nein | wenn in der Anzeige | ja, wird gesucht | vom Agenten |
| Passung in % | nein | ja | ja | vom Agenten |
| Handy | ja | Lesezeichen | nur mit https-Tunnel | Desktop-Browser |
| Kosten | 0 | 0 | 0 (eigener PC) | KI-Kosten |
| Risiko | keins | gering bis mittel | mittel bis hoch | hoch |

Kostenpflichtige Dienste wie SerpAPI oder Careerjet sind bewusst nicht eingebaut. Der Suchserver bildet ihre Fähigkeiten selbst nach: Suche über viele Portale, Zusammenführen doppelter Anzeigen mit allen Bewerbungswegen, Direktlink zum Arbeitgeber, Umkreis sowie Gehalt und Arbeitszeit aus dem Text. Details stehen in `suchserver/README.md`.

**Weg B einrichten:** In der App unter „Import“ den Knopf „→ Bewerbungslotse“ in die Lesezeichenleiste ziehen. Alternativ installierst du die Erweiterung: `chrome://extensions` öffnen, Entwicklermodus einschalten, „Entpackte Erweiterung laden“ wählen, den Ordner `erweiterung` auswählen und in den Optionen die App-Adresse eintragen. Bei Änderungen an `extractor.js` die Datei auch nach `erweiterung/` kopieren. Die Übertragung läuft über den Link (`#import=…`, komprimiert), es ist kein Server dazwischen.

**Weg C:** Unter „KI-Agent“ den Auftrag erstellen und in Claude in Chrome (oder einem anderen Browser-Agenten) einfügen. Das JSON-Ergebnis fügst du unter „Import“ ein. Stellen mit dem Status „beworben“ landen dann automatisch in der Übersicht.

## Rechtliche und praktische Hinweise

Das ist meine Einschätzung und keine Rechtsberatung. Vor einer öffentlichen Bereitstellung bitte prüfen lassen.

- **Portale:** LinkedIn, StepStone, Indeed und XING werden nicht ausgelesen oder automatisiert bedient, die App öffnet dort nur Suchlinks. Automatisiertes Auslesen und Bots verbieten diese Portale nach meinem Kenntnisstand in ihren Nutzungsbedingungen. Die LinkedIn-Bedingungen konnte ich nicht direkt abrufen.
- **Adzuna:** Die Nutzungsbedingungen verlangen den sichtbaren Hinweis „Jobs by Adzuna“, den die App einblendet. Die kostenlose Nutzung ist begrenzt (laut Adzuna u. a. 25 Abfragen pro Minute und 250 pro Tag). Jeder Nutzer braucht deshalb einen eigenen Schlüssel.
- **Jobbörse der BA:** Genutzt wird die inoffiziell dokumentierte Schnittstelle (bundesAPI) mit dem öffentlichen Schlüssel `jobboerse-jobsuche`. Nutzungsbedingungen und Limits sind dort nicht dokumentiert, die Schnittstelle kann sich ohne Ankündigung ändern.
- **Datenschutz:** Ohne Server verarbeitet der Betreiber keine Bewerberdaten. Ein Impressum und eine kurze Datenschutzerklärung werden trotzdem nötig sein. Vorlagen liegen in `rechtliches/` (als VORLAGE gekennzeichnet, vor Veröffentlichung ausfüllen und prüfen lassen). Darin sollte stehen, welche Drittanbieter der Browser direkt aufruft: jsDelivr für die Bibliotheken, die Job-Schnittstellen und optional KI und Webhook.
- **Qualität vor Menge:** Massenhaft automatisch versendete Standardbewerbungen wirken auf Arbeitgeber oft negativ. Empfohlen ist eine hohe Mindest-Passung, ein kleines Tageslimit und die Bestätigung jeder einzelnen Bewerbung.

## Bekannte Grenzen

- **Getestet (Stand 26.09.2026)** in Chromium mit simulierten Schnittstellen, Handy- und Desktop-Ansicht: Einlesen von PDF und DOCX, Profilerkennung, Berufsvorschläge, Suche, Filter, Sortierung, Passung, Anschreiben, Übersicht und Auto-Versand im Testmodus.
- **Texterkennung (Stand 27.09.2026)** mit echtem Tesseract.js im Browser getestet: Text-PDF, Scan-PDF, Scan-Bild, kleines blasses gedrehtes Foto (Erkennung 86–94 %) und schiefes Foto mit Schatten und Rauschen (67 %, einzelne Fehler – wird als „mittel“ eingestuft). Die Testbilder waren künstlich erzeugt, keine echten Handyfotos.
- **Nicht getestet:** echte Antworten der Schnittstellen (Zugriff aus meiner Umgebung gesperrt), echte Handyfotos, Safari/iOS, KI-Aufrufe und Webhook. Die Feldnamen der BA-Antwort stammen aus der bundesAPI-Dokumentation. Sie werden fehlertolerant gelesen, weichen aber eventuell ab.
- **Links zu Firmen-Websites:** Eine direkte Verlinkung auf die Firmen-Website gibt es nur, wenn die Anzeige einen externen Link enthält. Sonst bietet die App eine vorbefüllte Suche nach der Karriereseite an.
- **Gehalt:** BA-Anzeigen enthalten selten Gehaltsangaben. Die App erkennt Beträge im Text, das ist aber unvollständig.
- **Browser-Grenzen:** Ein Browser läuft nicht dauerhaft im Hintergrund, der Auto-Lauf startet deshalb nur bei geöffneter App. Zeitgesteuerte Läufe sind nur über einen externen Dienst wie n8n möglich.
- **E-Mail:** `mailto:` kann keine Anhänge mitschicken.
- **Nicht live geprüft (Stand 26.09.2026):** Portal- und Suchmaschinen-Abfragen des Suchprogramms, EURES-Linkformat, BERUFENET-Feldnamen, Spalten des echten ESCO-Pakets, Modellgrößen im Ollama-Verzeichnis, Programmdateien für Windows und Mac auf echten Rechnern. Die Tests liefen mit simulierten Antworten.

## Quellen

- Berufsverzeichnis: BA-Berufeliste (Berufskennziffern mit KldB-2010-Code) aus dem npm-Paket `@cross-solution/strapi-plugin-bfa` (MIT-Lizenz, Version 0.0.9), umgewandelt mit `werkzeuge/berufe_ba_erzeugen.py`. Die Nutzungsbedingungen der Bundesagentur für Arbeit für diese Daten habe ich nicht geprüft.
- ESCO-Datenpaket (kostenlos): https://esco.ec.europa.eu/en/use-esco/download
- Studiensuche-API (bundesAPI): https://github.com/bundesAPI/studiensuche-api (Felder laut openapi.yaml)
- Jobsuche-API, Angebotsarten 1/2/4/34: https://github.com/bundesAPI/jobsuche-api/blob/main/README.md
- BERUFENET-API (bundesAPI): https://github.com/bundesAPI/berufenet-api
- EURES-Suche (inoffiziell dokumentiert): https://github.com/rorar/EURES-API-Documentation
- Overture Maps, Places-Anleitung und Lizenzen: https://docs.overturemaps.org/guides/places/ und https://docs.overturemaps.org/attribution/
- Google Maps Platform, Nutzungsbedingungen (kein Auslesen/Speichern von Places-Daten): https://cloud.google.com/maps-platform/terms
- Overpass API, Nutzungsregeln der öffentlichen Instanz (ca. 10.000 Anfragen und 1 GB pro Tag): https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
- OpenStreetMap, Namensnennung (ODbL): https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- service.bund.de, RSS-Feeds: https://service.bund.de/Content/DE/Service/RSS/rss.html
- Ollama API und Installation: https://github.com/ollama/ollama/blob/main/docs/api.md

- bundesAPI, Jobsuche-API (Endpunkte, Parameter, Schlüssel): https://github.com/bundesAPI/jobsuche-api/blob/main/README.md
- ESCO Web-Service-API, EU-Kommission: https://esco.ec.europa.eu/en/use-esco/use-esco-services-api/esco-web-service-api
- Arbeitnow Job Board API (kostenlos, ohne Schlüssel): https://www.arbeitnow.com/blog/job-board-api
- JobSpy (MIT): https://github.com/speedyapply/JobSpy
- GeoNames Postleitzahlen, Lizenz CC BY 4.0, Namensnennung „GeoNames“ Pflicht: https://download.geonames.org/export/zip/
- Nominatim-Nutzungsrichtlinie (max. 1 Anfrage/s, eigene Kennung, Zwischenspeichern Pflicht): https://operations.osmfoundation.org/policies/nominatim/
- Jooble REST API: https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation
- Greenhouse Job Board API: https://developers.greenhouse.io/job-board.html
- Indeed Publisher Job Search (als „Deprecated“ markiert): https://developer.indeed.com/docs/publisher-jobs/job-search
- LinkedIn, verbotene Software und Erweiterungen: https://www.linkedin.com/help/linkedin/answer/a1341387 (nicht direkt abrufbar, nur Suchergebnis)
- Adzuna API, Parameter und Nutzungsbedingungen: https://developer.adzuna.com/docs/search und https://developer.adzuna.com/docs/terms_of_service

## Dateien

`extractor.js` (Weg B) · `erweiterung/` (Browser-Erweiterung) · `suchserver/` (Suchprogramm: Metasuche, Websuche, Direktlinks) · `programm/` (Bauplan für die Programmdatei) · Starter-Dateien · `index.html` (Oberfläche) · `app.js` (Logik) · `data.js` (Wörterbuch, Berufe, Vorlagen, Demodaten – hier erweitern) · `berufe-ba.js` (BA-Berufsverzeichnis) · `rechtliches/` (Vorlagen Impressum/Datenschutz) · `sw.js` (Offline) · `manifest.webmanifest` und Icons · `worker.js` (optionaler Proxy, wird nicht mit hochgeladen)
