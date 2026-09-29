# Anleitung: Windows-Programm auf GitHub bauen und testen

Stand 27.09.2026 · Dauer ca. 20–30 Minuten, davon ca. 10 Minuten Wartezeit · kostenlos

Du brauchst nur einen Browser und den entpackten Ordner `bewerbungslotse` aus der ZIP-Datei.

---

## Teil 1 – GitHub-Konto (einmalig, 3 Min.)

1. **https://github.com/signup** öffnen.
2. E-Mail, Passwort und Benutzernamen eingeben und die Bestätigungs-E-Mail anklicken.
3. Der kostenlose Tarif („Free“) reicht aus.

## Teil 2 – Repository anlegen (2 Min.)

1. Oben rechts auf **„+“** klicken, dann **„New repository“**.
2. Bei **Repository name** `bewerbungslotse` eintragen.
3. **Public** wählen. Öffentliche Repositorys haben unbegrenzte kostenlose Bau-Minuten. Bei „Private“ sind laut GitHub 2.000 Minuten pro Monat frei, ein Bau braucht ca. 15–25 Minuten. *(Nach meinem Kenntnisstand, nicht geprüft.)*
4. Sonst nichts anhaken und auf **„Create repository“** klicken.

## Teil 3 – Dateien hochladen (5 Min.)

1. Auf der neuen, leeren Seite auf den Link **„uploading an existing file“** klicken.
2. Den Ordner `bewerbungslotse` auf dem PC öffnen, **alles darin markieren** (Strg+A) und in das Browserfenster ziehen. Zieh den Inhalt hinein, nicht den Ordner selbst.
3. Warten, bis alle Dateien aufgelistet sind (ca. 30 Dateien in mehreren Ordnern).
4. Unten auf **„Commit changes“** klicken.

**Prüfen:** In der Dateiliste des Repositorys müssen oben `index.html`, `app.js`, die Ordner `suchserver`, `programm` und `erweiterung` stehen.

## Teil 4 – Bau-Auftrag anlegen (2 Min.)

Der Ordner `.github` beginnt mit einem Punkt und wird beim Hochladen oft nicht mitgenommen. Lege ihn deshalb von Hand an:

1. Im Repository auf **„Add file“** → **„Create new file“** klicken.
2. Als Dateiname genau das eintragen, inklusive der Schrägstriche:
   `.github/workflows/programm-bauen.yml`
3. In das große Textfeld diesen Inhalt komplett einfügen:

```yaml
# Baut automatisch die Programmdateien für Windows, macOS und Linux (kostenlos auf GitHub).
# Auslösen: Tag setzen (z. B. v1.0.0) oder unter „Actions“ → „Programm bauen“ → „Run workflow“.
name: Programm bauen
on:
  push:
    tags: ['v*']
  workflow_dispatch:
permissions:
  contents: write
jobs:
  bauen:
    strategy:
      fail-fast: false   # schlägt ein System fehl, laufen die anderen trotzdem zu Ende
      matrix:
        include:
          - os: windows-latest
            datei: Bewerbungslotse.exe
            name: Bewerbungslotse-Windows.exe
          - os: macos-latest
            datei: Bewerbungslotse
            name: Bewerbungslotse-Mac
          - os: ubuntu-latest
            datei: Bewerbungslotse
            name: Bewerbungslotse-Linux
    runs-on: ${{ matrix.os }}
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
      - run: pip install -r suchserver/requirements.txt pyinstaller
      - run: pyinstaller --noconfirm programm/bewerbungslotse.spec
      - name: Umbenennen
        shell: bash
        run: mv "dist/${{ matrix.datei }}" "dist/${{ matrix.name }}"
      - uses: actions/upload-artifact@v6
        with:
          name: ${{ matrix.name }}
          path: dist/${{ matrix.name }}
      - if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v3
        with:
          files: dist/${{ matrix.name }}
```

4. Auf **„Commit changes…“** und dann noch einmal auf **„Commit changes“** klicken.

*(Meldet GitHub, dass die Datei schon existiert, ist sie mit hochgeladen worden. Dann diesen Teil überspringen.)*

## Teil 5 – Bau starten (1 Min. + ca. 10 Min. warten)

1. Oben den Reiter **„Actions“** öffnen.
2. Erscheint ein grüner Knopf **„I understand my workflows, go ahead and enable them“**, darauf klicken.
3. Links **„Programm bauen“** wählen, rechts auf **„Run workflow“** und dann auf den grünen **„Run workflow“** klicken.
4. Nach wenigen Sekunden erscheint ein Eintrag mit gelbem Punkt (läuft). Nach ca. 5–15 Minuten wird daraus ein **grüner Haken**.

**Rotes ✗?** Auf den Eintrag klicken und dann auf den roten Teil (z. B. „bauen (windows-latest)“). Die letzten ca. 30 Zeilen kopierst du oder machst einen Screenshot und schickst ihn mir. Ich korrigiere den Bauplan dann.

## Teil 6 – Programm herunterladen (1 Min.)

1. Auf den Eintrag mit grünem Haken klicken.
2. Ganz unten unter **„Artifacts“** auf **„Bewerbungslotse-Windows.exe“** klicken. Es wird eine ZIP-Datei geladen, geschätzt ca. 70–110 MB (die Linux-Datei hatte im Test 92 MB).
3. Die ZIP entpacken. Darin liegt `Bewerbungslotse-Windows.exe`.

**Später für alle Nutzer (optional):** Rechts auf **„Releases“** → **„Create a new release“** → bei **„Choose a tag“** `v1.0.0` eintippen → **„Create new tag“** → **„Publish release“** klicken. Der Bau läuft dann erneut und hängt die Programme für Windows, Mac und Linux automatisch an die Release-Seite an. Diesen Link kannst du weitergeben.

## Teil 7 – Auf dem Windows-PC testen (5–10 Min.)

1. `Bewerbungslotse-Windows.exe` z. B. in einen Ordner „Bewerbungslotse“ legen und **doppelklicken**.
2. Erscheint **„Der Computer wurde durch Windows geschützt“**: auf **„Weitere Informationen“** → **„Trotzdem ausführen“** klicken. Das liegt nur an der fehlenden (kostenpflichtigen) Signatur.
3. Der erste Start dauert 10–30 Sekunden. Ein schwarzes Fenster öffnet sich, danach der Browser mit der App. **Das schwarze Fenster offen lassen.**
4. In der App oben auf **„Einstellungen“** → ganz unten **„Selbsttest“** → **„Selbsttest starten“** klicken und ca. 1–2 Minuten warten.
5. Auf **„Bericht speichern“** klicken. Die Datei `selbsttest-….json` landet im Download-Ordner.
6. **Optional:** Eine echte Suche mit deinem Lebenslauf machen und notieren, was auffällt. Zum Beispiel: falsche Treffer, fehlende Portale, falsche Prozentwerte, Links, die nicht zur Firma führen.
7. Den Bericht hier im Chat hochladen und deine Notizen dazuschreiben. Ich passe den Code dann gezielt an.

**Was der Bericht enthält:** Nur Probe-Suchbegriff und Ort, pro Quelle den Status (funktioniert / blockiert / Captcha / keine Treffer), die Anzahl der Treffer, drei Beispieltitel, HTTP-Codes und Laufzeiten sowie Windows- und Browser-Version. **Keine** Lebenslaufdaten, Namen oder E-Mail-Adressen.

## Teil 8 – Online-Version fürs Handy (optional, 2 Min.)

1. Im Repository: **„Settings“** → links **„Pages“**.
2. Bei **„Branch“** `main` und `/ (root)` wählen → **„Save“**.
3. Nach ca. 1–2 Minuten erscheint dort die Adresse, z. B. `https://DEINNAME.github.io/bewerbungslotse/`.

---

## Häufige Probleme

| Problem | Lösung |
|---|---|
| Es erscheint kein Knopf „Run workflow“ | Teil 4 fehlt oder der Dateiname ist falsch. Er muss genau `.github/workflows/programm-bauen.yml` heißen. |
| Das Antivirenprogramm meldet die .exe | Bei selbst gebauten, unsignierten Programmen (PyInstaller) kommt das öfter vor. Den Namen des Virenscanners und die Meldung notieren und mir schicken. |
| Der Browser öffnet sich nicht | Im schwarzen Fenster steht die Adresse (z. B. `http://127.0.0.1:8787/`). Diese im Browser öffnen. |
| Das schwarze Fenster schließt sich sofort | Die .exe über die Eingabeaufforderung starten: im Ordner in die Adressleiste `cmd` tippen, Enter, dann `Bewerbungslotse-Windows.exe` eingeben. Die Fehlermeldung abfotografieren. |
