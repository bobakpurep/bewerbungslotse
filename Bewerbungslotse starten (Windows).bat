@echo off
chcp 65001 >nul
title Bewerbungslotse
cd /d "%~dp0"
echo.
echo  Bewerbungslotse wird gestartet ...
echo.
set "PY="
py -3 -c "import sys" >nul 2>nul && set "PY=py -3"
if not defined PY python -c "import sys; assert sys.version_info>=(3,10)" >nul 2>nul && set "PY=python"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY (
  echo  Python fehlt - wird jetzt einmalig installiert ^(ca. 1-3 Minuten^) ...
  winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
  set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
)
if not exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" if "%PY%"=="%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
  echo.
  echo  Python konnte nicht automatisch installiert werden.
  echo  Bitte von https://www.python.org/downloads/ installieren und diese Datei erneut starten.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo  Einmalige Einrichtung ...
  %PY% -m venv .venv
)
if not exist ".venv\bereit.txt" (
  ".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r suchserver\requirements.txt && echo ok> ".venv\bereit.txt"
)
".venv\Scripts\python.exe" suchserver\server.py
pause
