#!/bin/bash
# Bewerbungslotse starten (macOS). Beim ersten Mal: Rechtsklick → „Öffnen“.
cd "$(dirname "$0")"
echo; echo "  Bewerbungslotse wird gestartet ..."; echo
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "import sys; assert sys.version_info>=(3,10)" 2>/dev/null; then
  if command -v brew >/dev/null 2>&1; then echo "  Python wird installiert ..."; brew install python@3.12; else
    echo "  Bitte Python 3.12 von https://www.python.org/downloads/ installieren und diese Datei erneut öffnen."; open "https://www.python.org/downloads/"; read -r -p "Enter zum Schließen"; exit 1; fi
fi
[ -x .venv/bin/python ] || python3 -m venv .venv
[ -f .venv/bereit.txt ] || { .venv/bin/python -m pip install -q --disable-pip-version-check -r suchserver/requirements.txt && echo ok > .venv/bereit.txt; }
.venv/bin/python suchserver/server.py
