"""Ollama-Assistent: kostenlose lokale KI einrichten – nur auf Wunsch, jeder Download wird in der App bestätigt.

Funktionen:
  status()        – ist Ollama installiert / gestartet, welche Modelle sind vorhanden?
  system_info()   – Arbeitsspeicher, Grafikkarte/-speicher, Prozessor, freier Speicherplatz
  recommend()     – bestes passendes kostenloses Modell ermitteln (Online-Liste von ollama.com + Registry-Größen,
                    Rückfall: mitgelieferter Katalog)
  install()       – offiziellen Installer laden und starten (Windows/macOS), Linux: Befehl anzeigen
  pull()/delete() – Modell herunterladen (mit Fortschritt) / löschen
  test()          – Probe-Anschreiben erzeugen und Geschwindigkeit messen
Quellen: Ollama-API-Dokumentation (github.com/ollama/ollama/blob/main/docs/api.md), README (Download-Links).
"""
from __future__ import annotations

import ctypes
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time

import requests

API = os.getenv("OLLAMA_HOST_URL", "http://127.0.0.1:11434")
UA = "Bewerbungslotse/1.0"
JOBS: dict[str, dict] = {}   # laufende Downloads: id -> {status, total, completed, error, done}

# Rückfall-Katalog (Stand 09/2026, eigene Einschätzung der Deutsch-Qualität 0–1; Lizenzen laut Modellseiten, bitte prüfen)
CATALOG = [
    {"family": "gemma3", "tags": {"1b": 1, "4b": 4, "12b": 12, "27b": 27}, "de": 0.85, "license": "Gemma Terms of Use – kommerziell erlaubt, Prohibited Use Policy beachten (geprüft 27.09.2026: ai.google.dev/gemma/terms)"},
    {"family": "qwen3", "tags": {"1.7b": 1.7, "4b": 4, "8b": 8, "14b": 14, "32b": 32}, "de": 0.85, "license": "Apache 2.0 (geprüft 27.09.2026, Hugging Face Qwen/Qwen3-8B)"},
    {"family": "mistral-nemo", "tags": {"12b": 12}, "de": 0.8, "license": "Apache 2.0 (geprüft 27.09.2026, Hugging Face)"},
    {"family": "mistral-small", "tags": {"24b": 24}, "de": 0.8, "license": "Apache 2.0 (Mistral Small 3.1/3.2, geprüft 27.09.2026)"},
    {"family": "llama3.1", "tags": {"8b": 8}, "de": 0.7, "license": "Llama 3.1 Community License – kommerziell erlaubt (unter 700 Mio. Nutzer/Monat), Acceptable Use Policy, Hinweis „Built with Llama“ bei Weitergabe (geprüft 27.09.2026)"},
    {"family": "llama3.2", "tags": {"3b": 3}, "de": 0.55, "license": "Llama 3.2 Community License – wie 3.1; EU-Einschränkung gilt nur für die multimodalen 3.2-Modelle, nicht für 3B-Text (geprüft 27.09.2026)"},
    {"family": "phi4", "tags": {"14b": 14}, "de": 0.65, "license": "MIT (geprüft 27.09.2026, Hugging Face microsoft/phi-4)"},
    {"family": "aya-expanse", "tags": {"8b": 8, "32b": 32}, "de": 0.8, "license": "CC-BY-NC 4.0 – nur nicht-kommerziell, Cohere Labs Acceptable Use Policy (geprüft 27.09.2026)"},
]
LINEAGES = ["gemma", "qwen", "mistral", "llama", "phi", "aya", "granite", "olmo", "deepseek", "command-r", "teuken", "occiglot"]
GB = 1024 ** 3


# ---------------- Status ----------------
def _binary() -> str:
    b = shutil.which("ollama")
    if b:
        return b
    for p in [os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe"), "/Applications/Ollama.app/Contents/Resources/ollama", "/usr/local/bin/ollama", "/usr/bin/ollama"]:
        if os.path.exists(p):
            return p
    return ""


def status() -> dict:
    d = {"installed": bool(_binary()), "running": False, "version": "", "models": [], "api": API}
    try:
        d["version"] = requests.get(f"{API}/api/version", timeout=2).json().get("version", "")
        d["running"] = d["installed"] = True
        tags = requests.get(f"{API}/api/tags", timeout=5).json().get("models", [])
        d["models"] = [{"name": m.get("name"), "size": m.get("size", 0), "modified": (m.get("modified_at") or "")[:10]} for m in tags]
    except Exception:
        pass
    if d["installed"] and not d["running"]:
        d["hint"] = "Ollama ist installiert, läuft aber nicht. Bitte Ollama starten (Startmenü / Programme) oder „Starten“ klicken."
    return d


def start_service() -> dict:
    b = _binary()
    if not b:
        return {"ok": False, "error": "Ollama nicht gefunden"}
    try:
        kw = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        if sys.platform == "win32":
            kw["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
        subprocess.Popen([b, "serve"], **kw)
        for _ in range(20):
            time.sleep(0.5)
            if status()["running"]:
                return {"ok": True}
        return {"ok": False, "error": "Ollama reagiert nicht"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---------------- System auslesen ----------------
def _ram() -> tuple[float, float]:
    try:
        if sys.platform == "win32":
            class MS(ctypes.Structure):
                _fields_ = [("l", ctypes.c_ulong), ("load", ctypes.c_ulong), ("total", ctypes.c_ulonglong), ("avail", ctypes.c_ulonglong),
                            ("tp", ctypes.c_ulonglong), ("ap", ctypes.c_ulonglong), ("tv", ctypes.c_ulonglong), ("av", ctypes.c_ulonglong), ("ae", ctypes.c_ulonglong)]
            m = MS(); m.l = ctypes.sizeof(MS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
            return m.total / GB, m.avail / GB
        if sys.platform == "darwin":
            total = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip())
            return total / GB, total / GB * 0.5
        info = {l.split(":")[0]: int(l.split()[1]) for l in open("/proc/meminfo") if ":" in l}
        return info["MemTotal"] / 1024 / 1024, info.get("MemAvailable", info["MemTotal"]) / 1024 / 1024
    except Exception:
        return 0.0, 0.0


def _gpus() -> list[dict]:
    out = []
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=8)
        for line in r.stdout.strip().splitlines():
            name, mem = [x.strip() for x in line.split(",")[:2]]
            out.append({"name": name, "vram_gb": round(int(mem) / 1024, 1), "vendor": "NVIDIA"})
    except Exception:
        pass
    if out:
        return out
    try:
        if sys.platform == "darwin":
            chip = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
            if platform.machine() == "arm64":
                out.append({"name": chip, "vram_gb": None, "vendor": "Apple", "unified": True})
        elif sys.platform == "win32":
            r = subprocess.run(["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json"],
                               capture_output=True, text=True, timeout=15)
            data = json.loads(r.stdout or "[]")
            for g in (data if isinstance(data, list) else [data]):
                ram = g.get("AdapterRAM") or 0
                out.append({"name": g.get("Name"), "vram_gb": round(ram / GB, 1) if ram and ram < 4 * GB - 1 else None,
                            "vendor": "AMD" if "AMD" in (g.get("Name") or "") or "Radeon" in (g.get("Name") or "") else "Intel/andere"})
        else:
            r = subprocess.run(["sh", "-c", "lspci | grep -i -E 'vga|3d'"], capture_output=True, text=True, timeout=8)
            for line in r.stdout.strip().splitlines():
                out.append({"name": line.split(":", 2)[-1].strip(), "vram_gb": None, "vendor": "AMD" if "AMD" in line else "andere"})
    except Exception:
        pass
    return out


def system_info() -> dict:
    total, avail = _ram()
    home = os.path.expanduser("~")
    disk = shutil.disk_usage(home).free / GB
    gpus = _gpus()
    nvidia = max([g["vram_gb"] or 0 for g in gpus if g["vendor"] == "NVIDIA"] or [0])
    apple = any(g.get("unified") for g in gpus)
    # Speicherbudget für das Modell (grobe Faustregel, eigene Einschätzung)
    if nvidia >= 4:
        budget, mode = nvidia * 0.9, f"Grafikkarte ({nvidia} GB)"
    elif apple:
        budget, mode = total * 0.6, "Apple-Chip (gemeinsamer Speicher)"
    else:
        budget, mode = min(total * 0.5, max(avail - 1, total * 0.35)), "Prozessor (ohne passende Grafikkarte, langsamer)"
    return {"os": f"{platform.system()} {platform.release()}", "cpu": platform.processor() or platform.machine(), "cores": os.cpu_count(),
            "ram_gb": round(total, 1), "ram_free_gb": round(avail, 1), "disk_free_gb": round(disk, 1), "gpus": gpus,
            "budget_gb": round(budget, 1), "mode": mode, "cpu_only": not (nvidia >= 4 or apple)}


# ---------------- Modelle online ermitteln ----------------
def _registry_size(model: str, tag: str) -> float | None:
    try:
        r = requests.get(f"https://registry.ollama.ai/v2/library/{model}/manifests/{tag}",
                         headers={"Accept": "application/vnd.docker.distribution.manifest.v2+json", "User-Agent": UA}, timeout=10)
        if r.ok:
            return sum(l.get("size", 0) for l in r.json().get("layers", [])) / GB
    except Exception:
        pass
    return None


def _online_families() -> list[str]:
    """Aktuelle beliebte Modelle von ollama.com/search auslesen (Seitenaufbau kann sich ändern → Rückfall)."""
    try:
        html = requests.get("https://ollama.com/search", headers={"User-Agent": UA}, timeout=10).text
        names = re.findall(r'href="/library/([a-z0-9][a-z0-9._-]{1,40})"', html)
        return list(dict.fromkeys(names))[:60]
    except Exception:
        return []


def _online_tags(family: str) -> dict[str, float]:
    """Tags einer Modellfamilie von ollama.com/library/<familie>/tags (Parameterzahl aus dem Tag-Namen)."""
    try:
        html = requests.get(f"https://ollama.com/library/{family}/tags", headers={"User-Agent": UA}, timeout=10).text
        tags = {}
        for t in re.findall(rf"{re.escape(family)}:([0-9]+(?:\.[0-9]+)?[bB])\b", html):
            tags[t.lower()] = float(t[:-1])
        return tags
    except Exception:
        return {}


def _lineage_score(family: str) -> float | None:
    known = {c["family"]: c["de"] for c in CATALOG}
    if family in known:
        return known[family]
    base = next((l for l in LINEAGES if family.startswith(l)), None)
    if not base:
        return None
    # neuere Version einer bekannten Linie (z. B. gemma4, qwen3.5) etwas besser einschätzen als die bekannte
    same = [c for c in CATALOG if c["family"].startswith(base)]
    v_new = re.findall(r"\d+(?:\.\d+)?", family[len(base):])
    if same and v_new:
        best = max(same, key=lambda c: c["de"])
        v_old = re.findall(r"\d+(?:\.\d+)?", best["family"][len(base):])
        if v_old and float(v_new[0]) > float(v_old[0]):
            return min(0.95, best["de"] + 0.05)
        return best["de"]
    return 0.6


def recommend() -> dict:
    sysi = system_info()
    budget, cpu_only, disk = sysi["budget_gb"], sysi["cpu_only"], sysi["disk_free_gb"]
    online = _online_families()
    cands = []
    families = list(dict.fromkeys([c["family"] for c in CATALOG] + [f for f in online if _lineage_score(f) is not None]))
    for fam in families:
        score = _lineage_score(fam)
        if score is None:
            continue
        cat = next((c for c in CATALOG if c["family"] == fam), None)
        tags = _online_tags(fam) if online else {}
        if not tags and cat:
            tags = cat["tags"]
        for tag, params in tags.items():
            if params < 1 or params > 40:
                continue
            est = params * 0.65 + 0.6                        # grobe Größe bei 4-Bit-Quantisierung (Standard bei Ollama)
            size = _registry_size(fam, tag) if online else None
            size = size or est
            fits = size * 1.25 <= budget and size + 2 <= disk
            speed = "schnell" if params <= 4 else "mittel" if params <= 9 else "langsam"
            if cpu_only and params > 9:
                fits = False
            cands.append({"model": f"{fam}:{tag}", "family": fam, "params_b": params, "size_gb": round(size, 1), "fits": fits, "de_score": score,
                          "speed": speed if not cpu_only else ("mittel" if params <= 4 else "langsam"),
                          "license": cat["license"] if cat else "auf der Modellseite prüfen", "online": bool(online),
                          "url": f"https://ollama.com/library/{fam}"})
    fit = [c for c in cands if c["fits"]]
    # Rangfolge: Deutsch-Qualität × Größe (mehr Parameter = meist besser), kommerziell eingeschränkte Lizenzen leicht abwerten
    rank = lambda c: c["de_score"] * (1 + 0.35 * min(c["params_b"], 32) ** 0.5) * (0.9 if "NC" in c["license"] else 1)
    fit.sort(key=rank, reverse=True)
    best = fit[0] if fit else None
    alts = []
    if best:
        smaller = sorted([c for c in fit if c["params_b"] < best["params_b"]], key=rank, reverse=True)
        other = [c for c in fit if c["family"] != best["family"]]
        seen = {best["model"]}
        for x in [smaller[0] if smaller else None, other[0] if other else None] + fit[1:]:
            if x and x["model"] not in seen and len(alts) < 2:
                alts.append(x); seen.add(x["model"])
    return {"system": sysi, "best": best, "alternatives": alts, "source": "online (ollama.com)" if online else "mitgelieferte Liste (offline)",
            "all": sorted(cands, key=rank, reverse=True)[:25],
            "note": "Größen- und Qualitätsangaben sind Schätzungen. Lizenz vor Nutzung auf der Modellseite prüfen."}


# ---------------- Installation ----------------
INSTALLERS = {"win32": "https://ollama.com/download/OllamaSetup.exe", "darwin": "https://ollama.com/download/Ollama.dmg"}


def _job(kind: str) -> str:
    jid = f"{kind}-{int(time.time() * 1000)}"
    JOBS[jid] = {"kind": kind, "status": "startet", "total": 0, "completed": 0, "done": False, "error": "", "cancel": False}
    return jid


def cancel(jid: str) -> dict:
    """Laufenden Download abbrechen (Ollama setzt einen abgebrochenen Download beim nächsten Mal fort)."""
    j = JOBS.get(jid)
    if not j:
        return {"ok": False}
    j["cancel"] = True
    return {"ok": True}


def install() -> dict:
    url = INSTALLERS.get(sys.platform)
    if not url:
        return {"manual": True, "command": "curl -fsSL https://ollama.com/install.sh | sh",
                "hint": "Unter Linux bitte diesen Befehl im Terminal ausführen (benötigt Administratorrechte)."}
    jid = _job("install")

    def run():
        j = JOBS[jid]
        try:
            path = os.path.join(tempfile.gettempdir(), os.path.basename(url))
            with requests.get(url, stream=True, timeout=60, headers={"User-Agent": UA}) as r:
                r.raise_for_status()
                j["total"] = int(r.headers.get("content-length", 0))
                with open(path, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        if j["cancel"]:
                            raise RuntimeError("abgebrochen")
                        f.write(chunk); j["completed"] += len(chunk); j["status"] = "lädt Installer"
            j["status"] = "Installer gestartet – bitte den Anweisungen folgen"
            if sys.platform == "win32":
                os.startfile(path)  # type: ignore[attr-defined]
            else:
                subprocess.Popen(["open", path])
            j["done"] = True
        except Exception as e:
            j["error"], j["done"] = str(e), True
    threading.Thread(target=run, daemon=True).start()
    return {"job": jid, "url": url}


def pull(model: str) -> dict:
    if not re.fullmatch(r"[a-z0-9][a-z0-9._/-]{0,80}(:[a-z0-9._-]{1,40})?", model):
        raise ValueError("Ungültiger Modellname")
    jid = _job("pull")

    def run():
        j = JOBS[jid]
        try:
            with requests.post(f"{API}/api/pull", json={"model": model}, stream=True, timeout=(10, 3600)) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if j["cancel"]:
                        raise RuntimeError("abgebrochen")
                    if not line:
                        continue
                    d = json.loads(line)
                    if d.get("error"):
                        raise RuntimeError(d["error"])
                    j["status"] = d.get("status", "")
                    if d.get("total"):
                        j["total"], j["completed"] = d["total"], d.get("completed", 0)
            j["status"], j["done"] = "fertig", True
        except Exception as e:
            j["error"], j["done"] = str(e), True
    threading.Thread(target=run, daemon=True).start()
    return {"job": jid}


def delete(model: str) -> dict:
    r = requests.delete(f"{API}/api/delete", json={"model": model}, timeout=30)
    return {"ok": r.ok, "status": r.status_code}


def test(model: str) -> dict:
    prompt = ("Schreibe zwei kurze, sachliche Sätze für ein Bewerbungsanschreiben eines Elektronikers, "
              "der seit 2019 Photovoltaikanlagen installiert. Keine Floskeln.")
    t = time.time()
    r = requests.post(f"{API}/api/generate", json={"model": model, "prompt": prompt, "stream": False, "options": {"num_predict": 120}}, timeout=600)
    r.raise_for_status()
    d = r.json()
    secs = time.time() - t
    tps = d.get("eval_count", 0) / (d.get("eval_duration", 1) / 1e9) if d.get("eval_duration") else 0
    verdict = "gut" if tps >= 8 else "brauchbar" if tps >= 3 else "zu langsam – kleineres Modell empfohlen"
    return {"text": d.get("response", "").strip(), "seconds": round(secs, 1), "tokens_per_s": round(tps, 1), "verdict": verdict}
