/* Fügt auf Stellenportalen einen Knopf „→ Bewerbungslotse“ ein. */
(() => {
  if (window.__blButton) return; window.__blButton = true;
  const DEF = { appUrl: '', details: true, max: 20 };
  const get = () => new Promise(r => { try { chrome.storage.sync.get(DEF, r); } catch { r(DEF); } });
  const b = document.createElement('button');
  b.textContent = '→ Bewerbungslotse';
  b.title = 'Angezeigte Stellen in die Bewerbungslotse-App übernehmen';
  b.style.cssText = 'position:fixed;z-index:2147483646;right:16px;bottom:16px;padding:10px 14px;border:0;border-radius:999px;background:#1f5f8b;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer';
  b.onclick = async () => {
    const o = await get();
    if (!o.appUrl) { alert('Bitte zuerst in den Einstellungen der Erweiterung die Adresse deiner Bewerbungslotse-App eintragen.'); try { chrome.runtime.openOptionsPage(); } catch {} return; }
    b.disabled = true; b.textContent = 'Lese Stellen …';
    try { await window.BLExtract.run(o.appUrl, { details: o.details && !/linkedin\./.test(location.hostname), max: o.max, delay: 1500 }); }
    finally { b.disabled = false; b.textContent = '→ Bewerbungslotse'; }
  };
  document.body.appendChild(b);
})();
