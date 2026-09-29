#!/bin/sh
# Bewerbungslotse starten (Linux). Voraussetzung: python3 (ab 3.10) mit venv-Modul (Debian/Ubuntu: sudo apt install python3-venv)
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || python3 -m venv .venv || { echo "Bitte python3-venv installieren."; exit 1; }
[ -f .venv/bereit.txt ] || { .venv/bin/python -m pip install -q -r suchserver/requirements.txt && echo ok > .venv/bereit.txt; }
exec .venv/bin/python suchserver/server.py
