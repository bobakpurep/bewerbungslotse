# PyInstaller-Bauplan: erzeugt EINE Programmdatei (Windows: Bewerbungslotse.exe, macOS/Linux: Bewerbungslotse)
# Bauen:  pip install -r ../suchserver/requirements.txt pyinstaller  &&  pyinstaller bewerbungslotse.spec
from PyInstaller.utils.hooks import collect_all, collect_submodules
import os, sys
ROOT = os.path.abspath(os.path.join(SPECPATH, '..'))
APP_FILES = ['rechtliches/impressum.html', 'rechtliches/datenschutz.html', 'index.html', 'app.js', 'data.js', 'berufe-ba.js', 'extractor.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png']
datas = [(os.path.join(ROOT, f), os.path.join('app', os.path.dirname(f))) for f in APP_FILES]
binaries, hidden = [], collect_submodules('uvicorn') + ['jobspy', 'duckdb', 'overture', 'localfirms']
# tls_client bringt fertige Bibliotheken für ALLE Systeme mit (.dll/.dylib/.so) und lädt sie per ctypes.
# Nicht mit collect_all einsammeln: macOS hält die Linux-.so sonst für Python-Module und der Bau bricht ab
# („Unknown Mach-O header“). Stattdessen nur die Bibliothek(en) des aktuellen Systems gezielt beilegen.
import glob, importlib.util
LIB_EXT = {'win32': '.dll', 'darwin': '.dylib'}.get(sys.platform, '.so')
_tls = os.path.dirname(importlib.util.find_spec('tls_client').origin)
binaries += [(f, 'tls_client/dependencies') for f in glob.glob(os.path.join(_tls, 'dependencies', '*' + LIB_EXT))]
datas += [(os.path.join(_tls, 'dependencies', '__init__.py'), 'tls_client/dependencies')]
hidden += collect_submodules('tls_client', filter=lambda n: not n.startswith('tls_client.dependencies.'))
d, b, h = collect_all('jobspy'); datas += d; binaries += b; hidden += h

a = Analysis([os.path.join(ROOT, 'suchserver', 'server.py')], pathex=[os.path.join(ROOT, 'suchserver')],
             binaries=binaries, datas=datas, hiddenimports=hidden, excludes=['tls_client.dependencies.tls-client-amd64', 'tls_client.dependencies.tls-client-arm64', 'tls_client.dependencies.tls-client-x86', 'tkinter', 'matplotlib', 'IPython', 'pytest', 'scipy', 'PIL', 'cryptography', 'pyarrow', 'numexpr', 'bottleneck'])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='Bewerbungslotse', console=True, upx=False,
          # Symbol nur unter Windows (.ico); macOS bräuchte sonst Pillow zur Umwandlung
          icon=os.path.join(SPECPATH, 'icon.ico') if sys.platform == 'win32' and os.path.exists(os.path.join(SPECPATH, 'icon.ico')) else None)
