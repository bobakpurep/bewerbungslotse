/* Bewerbungslotse – App-Logik (ohne Framework, ohne Server, ohne KI als Standard) */
'use strict';

/* ---------- Hilfsfunktionen ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s || '').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cap = s => s ? (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\b(klasse) ([a-z]{1,2})\b/gi, (_, k, c) => 'Klasse ' + c.toUpperCase()).replace(/\b(sap|sps|cnc|cad|crm|erp|seo|sql|hr|it|kfz|adr|mfa|zfa|haccp|shk|pv|itil|ms)\b/gi, m => m.toUpperCase()) : s;
const today = () => new Date().toLocaleDateString('de-DE');
function toast(msg, ms = 2800) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }
/* Große Datenmengen (Bewerbungen mit Stellentexten, übernommene Stellen, Zeugnisse) liegen in IndexedDB (mehrere Hundert MB möglich),
   alles andere in localStorage (ca. 5 MB). Fällt IndexedDB aus (z. B. privater Modus), wird localStorage verwendet. */
const BIG_KEYS = ['tracker', 'imported', 'zeugnisse', 'letterLog'];
const idb = {
  ok: false, cache: {}, db: null, pending: [],
  flush() { return Promise.all(this.pending); },
  async load() {
    try {
      this.db = await new Promise((res, rej) => { const r = indexedDB.open('bewerbungslotse', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); setTimeout(() => rej(new Error('Zeitüberschreitung')), 4000); });
      for (const k of BIG_KEYS) {
        let v = await new Promise(res => { const q = this.db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
        if (v === undefined) {   // einmalig aus localStorage übernehmen
          try { const ls = localStorage.getItem('bl_' + k); if (ls) { v = JSON.parse(ls); await this.put(k, v); localStorage.removeItem('bl_' + k); } } catch {}
        }
        if (v !== undefined) this.cache[k] = v;
      }
      this.ok = true;
    } catch (e) { this.ok = false; }
    return this.ok;
  },
  put(k, v) { return new Promise((res, rej) => { try { const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); } catch (e) { rej(e); } }); },
  clear() { try { this.db && this.db.transaction('kv', 'readwrite').objectStore('kv').clear(); } catch {} this.cache = {}; }
};
const store = {
  get(k, d) { if (idb.ok && BIG_KEYS.includes(k)) return k in idb.cache ? idb.cache[k] : d; try { const v = localStorage.getItem('bl_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { if (idb.ok && BIG_KEYS.includes(k)) { idb.cache[k] = v; const p = idb.put(k, v).catch(e => toast('Speichern fehlgeschlagen: ' + (e && e.message || e), 6000)); idb.pending.push(p); p.finally(() => { idb.pending = idb.pending.filter(x => x !== p); }); return; } try { localStorage.setItem('bl_' + k, JSON.stringify(v)); } catch (e) { toast(/quota/i.test(e.name + e.message) ? 'Browser-Speicher ist voll – bitte eine Sicherung speichern und alte Einträge im Archiv löschen.' : 'Speichern im Browser nicht möglich (privater Modus?)', 7000); } },
  clear() { idb.clear(); try { Object.keys(localStorage).filter(k => k.startsWith('bl_')).forEach(k => localStorage.removeItem(k)); } catch {} }
};
function loadScript(src) {
  return new Promise((res, rej) => {
    if ($(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Bibliothek konnte nicht geladen werden: ' + src));
    document.head.appendChild(s);
  });
}

/* ---------- Module ---------- */
const MODULES = [
  { id: '1', title: '1 · Stellensuche', expl: 'Aus dem Lebenslauf passende Berufe ableiten und offene Stellen finden, bewertet nach Passung in Prozent.',
    subs: [['1a','Berufe vorschlagen','Berufsbezeichnungen aus deinen Kompetenzen und Stationen, ergänzbar.'],
           ['1b','Stellen suchen und bewerten','Jobbörse der Arbeitsagentur, Arbeitnow, optional Adzuna. Filter nach Entfernung, Gehalt, Arbeitszeit; Sortierung frei wählbar.'],
           ['1c','Weg A: Links zu allen Portalen','Öffnet StepStone, Indeed, LinkedIn, XING u. a. mit deinen Suchbegriffen – kostenlos, ohne Risiko.'],
           ['1d','Weg B: Stellen aus Portalen übernehmen','Lesezeichen-Knopf oder Browser-Erweiterung: die im Portal angezeigten Stellen mit einem Klick in die App holen und bewerten.'],
           ['1e','Jooble','Jobsuchmaschine, die viele Portale bündelt. Kostenloser Schlüssel auf Antrag.'],
           ['1f','Eigener Suchserver (kostenlose Metasuche)','Selbst gehostet, ohne Schlüssel: über 35 Quellen in einer Suche, Branchen-Portale passend zum Beruf, doppelte Anzeigen zusammengeführt, Direktlink zum Arbeitgeber, Umkreis, Gehalt.']] },
  { id: '2', title: '2 · Bewerbungstext', expl: 'Anschreiben passend zur Stelle erzeugen. Standard: Vorlagen ohne KI.',
    subs: [['2a','Anschreiben aus Vorlagen','Füllt Vorlagen mit deinem Profil und den Anforderungen der Stelle.'],
           ['2b','KI-Verbesserung (optional)','Nur mit eigenem Schlüssel. Texte werden an den gewählten Anbieter übertragen.']] },
  { id: '3', title: '3 · Bewerbung absenden', expl: 'Vom Link bis zum automatischen Versand – du bestimmst, wie weit es geht.',
    subs: [['3a','Bewerbungslink öffnen','Originalanzeige, Firmen-Karriereseite oder Portal.'],
           ['3b','E-Mail vorbereiten','Öffnet dein E-Mail-Programm mit Empfänger, Betreff und Text.'],
           ['3c','Bewerbungen verwalten','Übersicht mit Status, Notizen und CSV-Export als Nachweis.'],
           ['3d','Automatischer Versand nach Regeln','Z. B. alle Stellen ab 80 % mit E-Mail-Kontakt – über deinen eigenen Webhook. Standard: Testmodus.'],
           ['3e','Weg C: KI-Browser-Agent','Erstellt einen Auftrag für einen KI-Agenten (z. B. Claude in Chrome), der in deinem Browser sucht und sich bewirbt. Kostenpflichtig, Risiko Kontosperrung.']] }
];
const DEFAULT_MODS = { '1': true, '1a': true, '1b': true, '1c': true, '1d': true, '1e': false, '1f': false, '2': true, '2a': true, '2b': false, '3': true, '3a': true, '3b': true, '3c': true, '3d': false, '3e': false };

/* ---------- Zustand ---------- */
const S = {
  mods: Object.assign({}, DEFAULT_MODS, store.get('mods', {})),
  settings: Object.assign({ proxy: '', azid: '', azkey: '', aion: false, aiprov: 'anthropic', aimodel: '', aikey: '', aiurl: '', hook: '', coords: null, srv: '', srvtok: '', jooble: '', joohost: 'de.jooble.org' }, store.get('settings', {})),
  profile: Object.assign({ name: '', email: '', phone: '', street: '', plz: '', city: '', years: '', available: '', salary: '', skills: [], experience: '', education: '', other: '', targets: [] }, store.get('profile', {})),
  cvText: store.get('cvText', ''),
  zeugnisse: store.get('zeugnisse', []),   // [{name, text, quality}]
  cvQuality: store.get('cvQuality', null),
  filters: store.get('filters', {}),
  jobs: [],
  imported: store.get('imported', []),
  tracker: store.get('tracker', []),
  current: null
};
const on = id => !!S.mods[id] && !!S.mods[id[0]];
const aiReady = () => on('2b') && S.settings.aion && (S.settings.aikey || S.settings.aiprov === 'compat') && S.settings.aimodel;

/* ---------- Kompetenz-Wörterbuch vorbereiten ---------- */
const SKILL_INDEX = []; // {label, cat, terms:[{t, strict}]}
for (const [cat, list] of Object.entries(window.SKILLS)) {
  for (const entry of list) {
    const parts = entry.split('|');
    SKILL_INDEX.push({ label: parts[0].replace(/\$$/, ''), cat, terms: parts.map(p => ({ t: norm(p.replace(/\$$/, '')), strict: p.endsWith('$') || p.replace(/\$$/, '').length < 5 })) });
  }
}
const reCache = new Map();
function termRe(term, strict) {
  const k = term + (strict ? '$' : '');
  if (!reCache.has(k)) reCache.set(k, new RegExp('(^|[^a-z0-9])' + reEsc(term) + (strict ? '(?![a-z0-9])' : ''), ''));
  return reCache.get(k);
}
const hasTerm = (ntext, terms) => terms.some(x => termRe(x.t, x.strict).test(ntext));
function skillTerms(label) {
  const hit = SKILL_INDEX.find(s => norm(s.label) === norm(label));
  return hit ? hit.terms : [{ t: norm(label), strict: label.length < 5 }];
}
function detectSkills(text) { const n = norm(text); return SKILL_INDEX.filter(s => hasTerm(n, s.terms)); }

/* ---------- Navigation ---------- */
const ICON = {   // eigene, einfache Linien-Symbole
  start: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
  cv: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h5M9.5 15.5h5"/>',
  berufe: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  stellen: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  bewerbung: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="m4 7 8 6 8-6"/>',
  import: '<path d="M12 4v10m0 0-4-4m4 4 4-4"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  tracker: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  agent: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/><circle cx="12" cy="12" r="3"/>',
  auto: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.2l2 1.2M17.8 15.6l2 1.2M4.2 16.8l2-1.2M17.8 8.4l2-1.2"/><circle cx="12" cy="12" r="7"/>'
};
const VIEWS = [
  ['start','🏠','Start', () => true], ['cv','📄','Lebenslauf', () => true], ['berufe','🧭','Berufe', () => on('1a')],
  ['stellen','🔎','Stellen', () => on('1b') || on('1c')], ['bewerbung','✉️','Bewerbung', () => on('2a') || on('3a') || on('3b')],
  ['import','📥','Import', () => on('1d')], ['tracker','📋','Übersicht', () => on('3c')], ['agent','🤖','KI-Agent', () => on('3e')], ['auto','⚙️','Auto', () => on('3d')], ['settings','🔧','Einstellungen', () => true]
];
function renderNav() {
  $('#nav').innerHTML = VIEWS.filter(v => v[3]()).map(v => `<button data-view="${v[0]}" aria-label="${v[2]}"><span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[v[0]] || ''}</svg></span>${v[2]}</button>`).join('');
  $$('#nav button').forEach(b => b.onclick = () => go(b.dataset.view));
  markNav(); if (typeof updateDueBadge === 'function' && S.tracker) updateDueBadge();
}
function markNav() { const cur = location.hash.slice(1) || 'start'; $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === cur)); }
function go(view) {
  const def = VIEWS.find(v => v[0] === view);
  if (!def || !def[3]()) view = view === 'berufe' ? 'stellen' : 'start';
  $$('section.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + view));
  if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
  markNav(); window.scrollTo(0, 0);
  if (view === 'berufe') { renderOccupations(); renderBA(false); }
  if (view === 'stellen') { renderPortalLinks(); renderResults(); }
  if (view === 'tracker') renderTracker();
  if (view === 'stellen' && typeof mapLinks === 'function') mapLinks();
  if (view === 'settings' && typeof renderLearn === 'function') renderLearn();
  if (view === 'import') renderImport();
  if (view === 'agent' && !$('#ag_prompt').value) buildAgentPrompt();
  if (view === 'bewerbung') renderApplication();
}
function applyModuleVisibility() {
  $$('[data-needs="ai"]').forEach(el => el.classList.toggle('hidden', !on('2b')));
  $('#portalCard').classList.toggle('hidden', !on('1c'));
  $$('[data-src]').forEach(el => { el.classList.toggle('hidden', !on(el.dataset.src)); if (!on(el.dataset.src)) { const c = $('input', el); if (c) c.checked = false; } });
  $('#btnSearch').closest('.card').classList.toggle('hidden', !on('1b'));
  renderNav();
}

/* ---------- Start: Modulauswahl ---------- */
function renderModules() {
  $('#moduleList').innerHTML = MODULES.map(m => `
    <div class="module"><div class="head"><input type="checkbox" id="m_${m.id}" ${S.mods[m.id] ? 'checked' : ''}>
      <div><label for="m_${m.id}" style="color:var(--text);font-weight:700;font-size:16px;margin:0">${m.title}</label><div class="small muted">${m.expl}</div></div></div>
      <div class="subs">${m.subs.map(s => `<label><input type="checkbox" id="m_${s[0]}" ${S.mods[s[0]] ? 'checked' : ''}><span>${s[1]}<span class="expl">${s[2]}</span></span></label>`).join('')}</div>
    </div>`).join('');
  $$('#moduleList input').forEach(i => i.onchange = () => {
    const id = i.id.slice(2); S.mods[id] = i.checked;
    if (id.length === 1) $$(`#moduleList input[id^="m_${id}"]`).forEach(x => { if (x.id.length > 3) x.closest('label').style.opacity = i.checked ? 1 : .45; });
    store.set('mods', S.mods); applyModuleVisibility();
  });
  MODULES.forEach(m => { if (!S.mods[m.id]) $$(`#moduleList input[id^="m_${m.id}"]`).forEach(x => { if (x.id.length > 3) x.closest('label').style.opacity = .45; }); });
}

/* ---------- Schritt 0: Lebenslauf einlesen ---------- */
const CDN = {
  pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs',
  pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs',
  mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  pdflib: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'
};
const cvProg = t => $('#cvProgress').textContent = t;
/* =====================================================================
   Dokumente lesen: PDF, Word, Bilder – mit Qualitätsprüfung, Bildaufbereitung und Texterkennung (OCR)
   Ziel: Text, den Programm und (optional) KI zuverlässig auswerten können.
   ===================================================================== */
let OCR_WORKER = null;
async function ocrWorker(prog) {
  if (OCR_WORKER) return OCR_WORKER;
  await loadScript(CDN.tesseract);
  prog('Texterkennung wird vorbereitet (beim ersten Mal ca. 10–20 MB Sprachdaten) …');
  OCR_WORKER = await Tesseract.createWorker('deu', 1, { logger: m => { if (m.status === 'recognizing text' && OCR_WORKER && OCR_WORKER._prog) OCR_WORKER._prog(m.progress); } });
  return OCR_WORKER;
}
// Bild für die Texterkennung aufbereiten. mode 0: nur Größe + Graustufen; mode 1: zusätzlich Beleuchtung ausgleichen (Schatten) und Kontrast strecken
async function prepImage(src, rotate = 0, mode = 0) {
  let bmp;
  if (src instanceof HTMLCanvasElement) bmp = src;
  else { try { bmp = await createImageBitmap(src, { imageOrientation: 'from-image' }); } catch { bmp = await createImageBitmap(src); } }
  const w0 = bmp.width, h0 = bmp.height, long = Math.max(w0, h0);
  const f = long < 1800 ? Math.min(2.5, 2200 / long) : long > 4200 ? 4200 / long : 1;   // zu klein → vergrößern, riesig → verkleinern
  const w = Math.round(w0 * f), h = Math.round(h0 * f), rot = ((rotate % 360) + 360) % 360;
  const draw = deg => {   // zeichnen, um deg Grad gedreht (90er-Schritte und kleine Schieflagen)
    const r = deg * Math.PI / 180, cw = Math.round(Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r))), ch = Math.round(Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r)));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch); x.translate(cw / 2, ch / 2); x.rotate(r); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, -w / 2, -h / 2, w, h); x.setTransform(1, 0, 0, 1, 0, 0);
    return [c, x];
  };
  let [cv, ctx] = draw(rot);
  const skew = estimateSkew(ctx, cv.width, cv.height);   // leicht schief fotografiert? (bis ±8°)
  if (Math.abs(skew) >= 0.4) [cv, ctx] = draw(rot + skew);   // Canvas dreht positiv im Uhrzeigersinn
  const img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data, hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
  const n = d.length / 4; let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.01) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.02) { hi = v; break; } }
  if (mode === 1) {
    // Hintergrund (Papier inkl. Schatten) schätzen: stark verkleinert + weichgezeichnet, dann Pixel durch Hintergrund teilen
    const sw = Math.max(8, Math.round(cv.width / 24)), sh = Math.max(8, Math.round(cv.height / 24));
    ctx.putImageData(img, 0, 0);
    const bg = document.createElement('canvas'); bg.width = sw; bg.height = sh; const bctx = bg.getContext('2d', { willReadFrequently: true });
    bctx.filter = 'blur(2px)'; bctx.drawImage(cv, 0, 0, sw, sh);
    const big = document.createElement('canvas'); big.width = cv.width; big.height = cv.height; const gctx = big.getContext('2d', { willReadFrequently: true });
    gctx.imageSmoothingQuality = 'high'; gctx.drawImage(bg, 0, 0, cv.width, cv.height);
    const b = gctx.getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.min(255, d[i] * 235 / Math.max(30, b[i])); d[i] = d[i + 1] = d[i + 2] = v < 200 ? v * 0.85 : 255; }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, scaled: f, width: w0, height: h0, contrast: hi - lo, skew: Math.abs(skew) >= 0.4 ? Math.round(skew * 10) / 10 : 0 };
}
// Schieflage schätzen: Textzeilen ergeben bei richtigem Winkel die „schärfste“ Zeilen-Verteilung (Projektionsprofil)
function estimateSkew(ctx, W, H) {
  const sc = Math.min(1, 900 / W), sw = Math.max(50, Math.round(W * sc)), sh = Math.max(50, Math.round(H * sc));
  const t = document.createElement('canvas'); t.width = sw; t.height = sh; const tx = t.getContext('2d', { willReadFrequently: true }); tx.drawImage(ctx.canvas, 0, 0, sw, sh);
  const d = tx.getImageData(0, 0, sw, sh).data; let sum = 0; const g = new Uint8Array(sw * sh);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; sum += g[j]; }
  const thr = sum / g.length * 0.75, xs = [], ys = [];
  const mx = Math.round(sw * 0.05), my = Math.round(sh * 0.05);   // Rand (Schatten, Tischkante) auslassen
  for (let y = my; y < sh - my; y++) for (let x = mx; x < sw - mx; x++) if (g[y * sw + x] < thr) { xs.push(x - sw / 2); ys.push(y - sh / 2); }
  if (xs.length < 200) return 0;
  const step = Math.max(1, Math.floor(xs.length / 40000)), bins = sh * 2;
  const score = a => { const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), hist = new Float32Array(bins); for (let i = 0; i < xs.length; i += step) { const yy = Math.round(ys[i] * c - xs[i] * s + sh); if (yy >= 0 && yy < bins) hist[yy]++; } let v = 0; for (let k = 0; k < bins; k++) v += hist[k] * hist[k]; return v; };
  let best = 0, bs = score(0);
  for (let a = -8; a <= 8; a += 0.5) { if (!a) continue; const v = score(a); if (v > bs) { bs = v; best = a; } }
  for (let a = best - 0.4; a <= best + 0.4; a += 0.1) { const v = score(a); if (v > bs) { bs = v; best = a; } }   // fein nachjustieren
  return bs > score(0) * 1.03 ? -best : 0;   // Vorzeichen: Winkel, um den das Bild gedreht ist
}
// Text aus dem Erkennungsergebnis: sehr unsichere Zeilen (Rand, Schatten, Muster) weglassen
function ocrText(data) {
  const lines = data.lines || [];
  if (!lines.length) return data.text || '';
  const sensible = t => { const w = t.match(/\p{L}{2,}/gu) || []; return /@|\d{4,5}/.test(t) || (w.length && w.filter(x => /[aeiouäöüy]/i.test(x) && x.length >= 3).length / w.length >= 0.6); };
  // nur Zeilen weglassen, die unsicher UND nach Zeichensalat aussehen (z. B. Schatten, Tischkante, Muster)
  // Randzeichen, die bei Fotos durch Schatten/Kanten entstehen („| “, „} “, einzelne Buchstaben am Zeilenende) entfernen
  const tidy = t => t.replace(/\n$/, '').replace(/^[\s|;:)}\]{(\[%*~_=<>»«^'`"]+/, '').replace(/[\s|;:({\[%*~_=<>»«^'`"]+$/, '')
    .replace(/^(?:[^\s\p{L}\p{N}]|\p{L}|\d)\s+(?=\S{3,})/u, '').replace(/\s+(?:[^\s\p{N}]|\p{L})$/u, '').trim();
  // unsichere kurze Wörter am Zeilenanfang/-ende (Schatten, Kanten) weglassen – anhand der Wort-Sicherheit
  const trimWords = l => { const w = (l.words || []).slice(); if (!w.length) return l.text || '';
    const weak = x => (x.confidence || 0) < 45 && (x.text || '').replace(/[^\p{L}\p{N}]/gu, '').length <= 4;
    while (w.length && weak(w[0])) w.shift(); while (w.length && weak(w[w.length - 1])) w.pop();
    return w.map(x => x.text).join(' '); };
  const capsJunk = (l, t) => (l.confidence || 0) < 50 && /^[A-ZÄÖÜ0-9\s|.,:;!'"()\-]+$/.test(t) && !/\d{4,5}/.test(t);   // z. B. „EEE PEST TEE“
  const kept = lines.filter(l => (l.confidence || 0) >= 35 || sensible(l.text || '')).map(l => { const t = tidy(trimWords(l)); return capsJunk(l, t) ? null : [t, l]; }).filter(x => x && x[0]);
  // Sicherheit nur über die behaltenen Zeilen (gewichtet nach Länge) – Rand-Müll soll die Bewertung nicht verfälschen
  const tot = kept.reduce((a, [t]) => a + t.length, 0);
  ocrText.lastConf = tot ? Math.round(kept.reduce((a, [t, l]) => a + (l.confidence || 0) * t.length, 0) / tot) : null;
  return kept.map(x => x[0]).join('\n');
}
// Eine Seite erkennen: erst schlicht, bei Bedarf mit Beleuchtungsausgleich und Drehung – das beste Ergebnis gewinnt
async function ocrOne(src, prog, label) {
  const worker = await ocrWorker(prog);
  const run = async (rot, mode) => { const p = await prepImage(src, rot, mode); worker._prog = x => prog(`${label}: Texterkennung ${Math.round(x * 100)} %${mode ? ' (Bild aufbereitet)' : ''}${rot ? ` (gedreht ${rot}°)` : ''}`); const r = await worker.recognize(p.canvas); ocrText.lastConf = null; const text = ocrText(r.data); return { text, conf: ocrText.lastConf ?? Math.round(r.data.confidence || 0), rot, mode, prep: p }; };
  const good = r => r.conf >= 75 && r.text.replace(/\s/g, '').length >= 40;
  let best = await run(0, 0);
  if (!good(best)) { const r = await run(0, 1); if (r.conf > best.conf) best = r; }
  if (best.conf < 50 || best.text.replace(/\s/g, '').length < 40) {
    for (const rot of [90, 270, 180]) { const r = await run(rot, best.mode); if (r.conf > best.conf + 8) best = r; if (good(best)) break; }
  }
  return best;
}
async function ocrImages(sources, prog = cvProg) {
  const pages = [];
  for (let i = 0; i < sources.length; i++) pages.push(await ocrOne(sources[i], prog, `Seite ${i + 1}/${sources.length}`));
  const text = pages.map(p => p.text).join('\n');
  LAST_READ = { method: 'ocr', pages: pages.length, ocrPages: pages.length, conf: Math.round(pages.reduce((a, p) => a + p.conf, 0) / (pages.length || 1)),
    rotated: pages.filter(p => p.rot).length, deskewed: pages.filter(p => p.prep.skew).length, small: pages.filter(p => p.prep.width < 1000 && p.prep.height < 1000).length, lowContrast: pages.filter(p => p.prep.contrast < 90).length };
  return text;
}
// Textschicht einer PDF-Seite taugt nichts (leer, Zeichensalat durch fehlende Schrift-Zuordnung)?
const badLayer = t => { const s = t.replace(/\s/g, ''); if (s.length < 40) return true; const weird = (s.match(/[^\p{L}\p{N}.,;:!?()\-–—/&%€@+'"„“”‚‘’*#§°]/gu) || []).length; return weird / s.length > 0.25; };
async function readPdf(file, prog = cvProg, opts = {}) {
  const pdfjs = await import(CDN.pdf);
  pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [], confs = []; let ocrPages = 0;
  const maxOcr = 10;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const c = await page.getTextContent();
    let t = c.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('');
    if ((opts.forceOcr || badLayer(t)) && ocrPages < maxOcr) {
      prog(`Seite ${p}: ${opts.forceOcr ? 'Texterkennung wie gewünscht' : 'kein lesbarer Text im PDF'} – starte Texterkennung …`);
      const vp = page.getViewport({ scale: 2.5 });
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      const r = await ocrOne(cv, prog, `Seite ${p}/${doc.numPages}`); ocrPages++; confs.push(r.conf);
      if (!opts.forceOcr && r.text.replace(/\s/g, '').length < t.replace(/\s/g, '').length * 0.5) r.text = t;   // OCR schlechter als Textschicht → behalten
      t = r.text;
    }
    out.push(t);
  }
  LAST_READ = { method: ocrPages ? (ocrPages === doc.numPages ? 'ocr' : 'pdf+ocr') : 'pdf', pages: doc.numPages, ocrPages, skippedOcr: Math.max(0, doc.numPages - maxOcr) && ocrPages >= maxOcr,
    conf: confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : null };
  return out.join('\n\f\n');
}
let LAST_READ = null;
async function fileToText(files, prog = cvProg, opts = {}) {
  const f = files[0];
  prog('Lese Datei …'); LAST_READ = null;
  let text;
  if (f.type.startsWith('image/')) text = await ocrImages([...files], prog);
  else if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') text = await readPdf(f, prog, opts);
  else if (/\.docx$/i.test(f.name)) { await loadScript(CDN.mammoth); text = (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value; LAST_READ = { method: 'docx', pages: 1 }; }
  else { text = await f.text(); LAST_READ = { method: 'text', pages: 1 }; }
  const cleaned = cleanDocText(text);
  LAST_READ = Object.assign(LAST_READ || {}, { quality: docQuality(cleaned, LAST_READ || {}), name: f.name, files: files.length });
  return cleaned;
}
// Text für Programm und KI aufbereiten: Ligaturen, Silbentrennung, Kopf-/Fußzeilen, Aufzählungszeichen, Leerraum
function cleanDocText(t) {
  t = String(t || '').replace(/\r\n?/g, '\n').replace(/­/g, '').replace(/[​-‍﻿]/g, '')
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff').replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl').replace(/[‐‑]/g, '-');
  t = t.replace(/([a-zäöüß])-\n([a-zäöüß])/g, '$1$2');                                     // Elek-\ntriker → Elektriker
  t = t.replace(/^[ \t]*[•▪◦●■□►▸✓✔➢➤·*][ \t]*/gm, '- ');                                   // Aufzählungen vereinheitlichen
  t = t.replace(/^[ \t]*(seite|page)\s*\d+\s*(von|of|\/)\s*\d+[ \t]*$/gim, '');              // „Seite 2 von 3“
  // Zeilen, die auf mehreren Seiten gleich wiederkehren (Kopf-/Fußzeilen), nur einmal behalten
  const pages = t.split('\f');
  if (pages.length > 2) {
    const count = {}; pages.forEach(p => new Set(p.split('\n').map(l => l.trim()).filter(l => l.length > 3 && l.length < 90)).forEach(l => count[l] = (count[l] || 0) + 1));
    const rep = new Set(Object.keys(count).filter(l => count[l] >= Math.max(3, pages.length * 0.6)));
    const seen = new Set(); t = pages.map(p => p.split('\n').filter(l => { const k = l.trim(); if (!rep.has(k)) return true; if (seen.has(k)) return false; seen.add(k); return true; }).join('\n')).join('\n');
  }
  return t.replace(/\f/g, '\n').replace(/[ \t]+/g, ' ').replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Lesbarkeit bewerten (0–100) – für das Programm und für KI
function docQuality(text, meta = {}) {
  const s = String(text || ''), letters = (s.match(/\p{L}/gu) || []).length, nonspace = s.replace(/\s/g, '').length || 1;
  const words = s.match(/\p{L}[\p{L}'-]*/gu) || [], realWords = words.filter(w => w.length >= 2 && /[aeiouäöüy]/i.test(w) && !/(.)\1\1/.test(w) && !/[A-ZÄÖÜ]{2,}[a-zäöü]+[A-ZÄÖÜ]/.test(w));
  const junk = (s.match(/[^\p{L}\p{N}\s.,;:!?()\-–—/&%€@+'"„“”‚‘’*#§°]/gu) || []).length / nonspace;
  const shortLines = s.split('\n').filter(l => l.trim()).filter(l => l.trim().length <= 2).length / Math.max(1, s.split('\n').filter(l => l.trim()).length);
  const wordRatio = words.length ? realWords.length / words.length : 0;
  let score = 100; const hints = [];
  if (words.length < 30) { score -= 45; hints.push('Sehr wenig Text erkannt – ist die ganze Seite im Bild bzw. enthält die Datei wirklich Text?'); }
  else if (words.length < 80) { score -= 15; hints.push('Wenig Text – fehlen Seiten?'); }
  if (wordRatio < 0.7) { score -= 30; hints.push('Viele Wörter sind unleserlich (Zeichensalat).'); } else if (wordRatio < 0.85) { score -= 12; hints.push('Einige Wörter sind falsch erkannt – Text bitte überfliegen.'); }
  if (junk > 0.06) { score -= 20; hints.push('Viele Sonderzeichen – typisch für schlechte Fotos oder falsch kodierte PDFs.'); }
  if (shortLines > 0.3) { score -= 10; hints.push('Viele Zeilen mit nur 1–2 Zeichen (z. B. Tabellen, Rahmen oder Schatten).'); }
  if (meta.conf != null) { if (meta.conf < 60) { score -= 25; hints.push(`Texterkennung unsicher (${meta.conf} %).`); } else if (meta.conf < 75) { score -= 10; hints.push(`Texterkennung mittel (${meta.conf} %).`); } }
  if (meta.method && /ocr/.test(meta.method)) {
    if (meta.small) hints.push('Bild hat geringe Auflösung – näher heran oder höhere Kamera-Auflösung.');
    if (meta.lowContrast) hints.push('Wenig Kontrast – bei Tageslicht ohne Schatten fotografieren, Blitz vermeiden.');
    if (meta.rotated) hints.push(`${meta.rotated} Seite(n) waren gedreht und wurden automatisch gerade gestellt.`);
    if (meta.deskewed) hints.push(`${meta.deskewed} Seite(n) waren leicht schief und wurden gerade gerückt.`);
    if (score < 75) hints.push('Tipp: Seite flach und gerade von oben fotografieren, ganze Seite im Bild, scharf stellen – oder eine PDF mit Text verwenden.');
  }
  if (meta.skippedOcr) hints.push('Nur die ersten 10 Seiten wurden per Texterkennung gelesen.');
  const facts = { email: /[\w.+-]+@[\w-]+\.[\w.-]+/.test(s), dates: (s.match(/\b(19|20)\d{2}\b/g) || []).length, sections: (s.match(/berufserfahrung|ausbildung|schul|kenntnisse|kompetenzen|sprachen|zeugnis|tätigkeit|aufgaben|leistung|verhalten/gi) || []).length };
  if (meta.conf != null && meta.conf < 70) score = Math.min(score, 70);   // unsichere Texterkennung nie als „gut“ einstufen
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, level: score >= 75 ? 'gut' : score >= 50 ? 'mittel' : 'schlecht', words: words.length, wordRatio: Math.round(wordRatio * 100), junk: Math.round(junk * 100), conf: meta.conf ?? null,
    method: meta.method || '', pages: meta.pages || 0, ocrPages: meta.ocrPages || 0, facts, hints,
    ai: score >= 75 ? 'Gut lesbar – auch für KI geeignet.' : score >= 50 ? 'Für KI brauchbar, aber einzelne Fehler möglich – Text kurz prüfen.' : 'Für KI und Auswertung schlecht lesbar – Text korrigieren oder besser fotografieren/einscannen.' };
}
const METHOD_TXT = { pdf: 'Text aus der PDF', 'pdf+ocr': 'PDF-Text + Texterkennung', ocr: 'Texterkennung (OCR)', docx: 'Word-Datei', text: 'Textdatei' };
function qualityHtml(q) {
  if (!q) return '';
  const col = { gut: 'var(--ok)', mittel: 'var(--warn)', schlecht: 'var(--bad)' }[q.level];
  return `<div class="quality small" style="border-left:3px solid ${col};padding:6px 10px;margin-top:6px;background:var(--field);border-radius:8px">
    <b style="color:${col}">Lesbarkeit ${q.level} (${q.score}/100)</b> · ${esc(METHOD_TXT[q.method] || q.method)}${q.pages ? ` · ${q.pages} Seite(n)` : ''}${q.ocrPages ? `, ${q.ocrPages} per Texterkennung` : ''}${q.conf != null ? ` · Erkennung ${q.conf} %` : ''} · ${q.words} Wörter, ${q.wordRatio} % lesbar
    <div>${esc(q.ai)}</div>${q.hints.length ? `<ul style="margin:4px 0 0 18px;padding:0">${q.hints.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}</div>`;
}
// Durchsuchbare PDF erzeugen: Bild der Seite bleibt sichtbar, der erkannte Text liegt unsichtbar darunter (kopier- und durchsuchbar, für KI lesbar)
async function searchablePdf(files, name, prog = cvProg) {
  if (!files || !files.length) return toast('Datei ist nicht mehr im Speicher – bitte erneut hochladen');
  const pages = [];
  for (const f of files) {
    if (f.type.startsWith('image/')) pages.push(f);
    else if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
      const pdfjs = await import(CDN.pdf); pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
      const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
      for (let p = 1; p <= Math.min(doc.numPages, 15); p++) { const page = await doc.getPage(p), vp = page.getViewport({ scale: 2.5 }); const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; pages.push(cv); }
    } else return toast('Durchsuchbare PDF geht nur aus Bildern oder PDF-Dateien');
  }
  const worker = await ocrWorker(prog); await loadScript(CDN.pdflib);
  const out = await PDFLib.PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    prog(`Durchsuchbare PDF: Seite ${i + 1}/${pages.length} …`);
    const best = await ocrOne(pages[i], prog, `Seite ${i + 1}/${pages.length}`);   // beste Aufbereitung/Drehung wie beim Lesen
    const pr = await prepImage(pages[i], best.rot, best.mode); worker._prog = x => prog(`Durchsuchbare PDF: Seite ${i + 1}/${pages.length} – ${Math.round(x * 100)} %`);
    const r = await worker.recognize(pr.canvas, { pdfTitle: name }, { pdf: true, text: false });
    const one = await PDFLib.PDFDocument.load(new Uint8Array(r.data.pdf));
    (await out.copyPages(one, one.getPageIndices())).forEach(pg => out.addPage(pg));
  }
  out.setTitle(name); out.setProducer('Bewerbungslotse (Tesseract OCR)');
  const bytes = await out.save();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); a.download = name.replace(/\.[^.]+$/, '') + '-durchsuchbar.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  prog('Durchsuchbare PDF erstellt.');
}
// Aufbereiteten Text (Lebenslauf + Zeugnisse) als Datei speichern – gut lesbar für jede KI
function exportDocsText() {
  const parts = [`# Bewerbungsunterlagen (Text) – erstellt mit Bewerbungslotse am ${new Date().toLocaleDateString('de-DE')}`];
  if ($('#cvText').value.trim()) parts.push('## Lebenslauf\n\n' + cleanDocText($('#cvText').value));
  S.zeugnisse.forEach(z => parts.push(`## Zeugnis/Nachweis: ${z.name}\n\n` + cleanDocText(z.text)));
  const blob = new Blob([parts.join('\n\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bewerbungsunterlagen-text.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
let CV_FILES = null;   // zuletzt gelesene Datei(en), nur im Arbeitsspeicher (für „neu lesen“)
function showCvQuality(q) {
  $('#cvQuality').innerHTML = qualityHtml(q);
  const pdf = CV_FILES && /\.pdf$/i.test(CV_FILES[0].name);
  $('#btnReOcr').classList.toggle('hidden', !(pdf && q && q.method === 'pdf'));
  $('#btnSearchPdf').classList.toggle('hidden', !(CV_FILES && q && /ocr/.test(q.method)));
  if (q) { S.cvQuality = q; store.set('cvQuality', q); }
}
async function handleCvFile(files, opts = {}) {
  if (!files || !files.length) return;
  try {
    CV_FILES = [...files];
    const text = await fileToText(CV_FILES, cvProg, opts);
    $('#cvText').value = text.trim(); S.cvText = text.trim(); store.set('cvText', S.cvText);
    showCvQuality(LAST_READ && LAST_READ.quality);
    cvProg(LAST_READ && LAST_READ.quality && LAST_READ.quality.level === 'schlecht' ? 'Fertig – bitte Lesbarkeit beachten.' : 'Fertig.');
    parseCv();
  } catch (e) { console.error(e); cvProg(''); toast('Fehler beim Lesen: ' + e.message, 5000); }
}

/* Lebenslauf-Text heuristisch auswerten (ohne KI) */
function parseCv() {
  const text = $('#cvText').value; if (!text.trim()) return toast('Kein Text vorhanden');
  S.cvText = text; store.set('cvText', text); saveProfile(false);
  const P = S.profile, lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const set = (k, v) => { if (v && !P[k]) P[k] = v; };
  set('email', (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0]);
  set('phone', ((text.match(/(\+49|0049|\b0)[\d\s/()-]{7,18}\d/) || [])[0] || '').trim());
  const plz = text.match(/\b(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{1,40}?)(?=[\n,|]|$)/m);
  if (plz) { set('plz', plz[1]); set('city', plz[2].trim()); }
  set('street', ((text.match(/[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{2,40}(?:straße|strasse|str\.|weg|allee|platz|gasse|ring|damm|chaussee)\s*\d+\s?[a-zA-Z]?/i) || [])[0] || '').trim());
  const nameLine = (text.match(/name\s*[:|]\s*([^\n]+)/i) || [])[1] ||
    lines.slice(0, 8).find(l => /^[A-ZÄÖÜ][a-zäöüß\-]+(\s+[A-ZÄÖÜ][a-zäöüß\-]+){1,3}$/.test(l) && !/lebenslauf|curriculum|bewerbung|persönlich/i.test(l));
  set('name', nameLine && nameLine.trim());
  const found = detectSkills(text).map(s => s.label);
  P.skills = [...new Set([...P.skills, ...found])];
  // Stationen erkennen
  const range = /((0?[1-9]|1[0-2])[./])?(19|20)\d{2}\s*(–|-|—|bis)\s*(((0?[1-9]|1[0-2])[./])?(19|20)\d{2}|heute|jetzt|aktuell|dato|present)/i;
  const eduRe = /ausbildung|schule|studium|universität|hochschule|abitur|abschluss|bachelor|master|diplom|lehre|fachhochschule|umschulung|weiterbildung|zertifikat/i;
  const exp = [], edu = []; let yearsSpans = [];
  lines.forEach((l, i) => {
    const m = l.match(range); if (!m) return;
    const entry = (l.length < 40 && lines[i + 1] && !range.test(lines[i + 1])) ? l + ' ' + lines[i + 1] : l;
    (eduRe.test(entry) ? edu : exp).push(entry);
    if (!eduRe.test(entry)) {
      const ys = [...m[0].matchAll(/(19|20)\d{2}/g)].map(x => +x[0]);
      const end = /heute|jetzt|aktuell|dato|present/i.test(m[0]) ? new Date().getFullYear() : (ys[1] || ys[0]);
      if (ys[0]) yearsSpans.push([ys[0], end]);
    }
  });
  if (exp.length && !P.experience) P.experience = exp.join('\n');
  if (edu.length && !P.education) P.education = edu.join('\n');
  if (yearsSpans.length && !P.years) {
    yearsSpans.sort((a, b) => a[0] - b[0]); let total = 0, [cs, ce] = yearsSpans[0];
    for (const [s, e] of yearsSpans.slice(1)) { if (s <= ce) ce = Math.max(ce, e); else { total += ce - cs; [cs, ce] = [s, e]; } }
    total += ce - cs; P.years = String(Math.max(0, total));
  }
  const other = lines.filter(l => /führerschein|sprache|englisch|deutsch|französisch|staplerschein|zertifikat/i.test(l) && !range.test(l));
  if (other.length && !P.other) P.other = [...new Set(other)].slice(0, 8).join('\n');
  suggestOccupations(true); BA_RESULT = null;
  store.set('profile', P); fillProfileForm();
  toast(`Erkannt: ${found.length} Kompetenzen. Bitte Angaben prüfen.`);
}
async function parseCvAI() {
  if (!aiReady()) return toast('KI ist nicht eingerichtet (Einstellungen)');
  const text = $('#cvText').value.slice(0, 12000); if (!text.trim()) return toast('Kein Text vorhanden');
  cvProg('KI liest Lebenslauf …'); saveProfile(false);
  try {
    const r = await callAI('Du extrahierst Daten aus Lebensläufen. Antworte ausschließlich mit gültigem JSON, ohne Erklärung. Erfinde nichts; unbekannte Felder leer lassen.',
      `Extrahiere aus dem Lebenslauf folgendes JSON: {"name":"","email":"","phone":"","street":"","plz":"","city":"","years":"Jahre Berufserfahrung als Zahl","skills":["fachliche und persönliche Kompetenzen, kurz"],"experience":["Zeitraum: Position, Firma, Ort"],"education":["Zeitraum: Abschluss, Einrichtung"],"other":"Sprachen, Führerschein, Sonstiges","titles":["passende Berufsbezeichnungen, max. 6"]}\n\nLebenslauf:\n${text}`);
    const j = JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1));
    const P = S.profile;
    ['name','email','phone','street','plz','city','other'].forEach(k => { if (j[k]) P[k] = String(j[k]); });
    if (j.years) P.years = String(j.years);
    if (Array.isArray(j.skills)) P.skills = [...new Set([...P.skills, ...j.skills.map(String)])];
    if (Array.isArray(j.experience)) P.experience = j.experience.join('\n');
    if (Array.isArray(j.education)) P.education = j.education.join('\n');
    if (Array.isArray(j.titles)) j.titles.forEach(t => addTarget(String(t), true));
    store.set('profile', P); fillProfileForm(); cvProg('Fertig (KI).'); toast('Angaben per KI übernommen. Bitte prüfen.');
  } catch (e) { cvProg(''); toast('KI-Fehler: ' + e.message, 5000); }
}

/* ---------- Profilformular ---------- */
const PF = ['name','email','phone','street','plz','city','years','available','salary','experience','education','other'];
function fillProfileForm() {
  PF.forEach(k => { const el = $('#p_' + k); if (el) el.value = S.profile[k] || ''; });
  $('#cvText').value = S.cvText || '';
  renderSkillChips();
  if (!$('#f_where').value) $('#f_where').value = S.filters.where || S.profile.city || S.profile.plz || '';
}
function renderSkillChips() {
  if ($('#bsList') && typeof renderBausteine === 'function' && document.readyState !== 'loading') setTimeout(() => { try { renderBausteine(); } catch {} }, 0);
  $('#skillChips').innerHTML = S.profile.skills.length ? S.profile.skills.map((s, i) => `<span class="chip">${esc(cap(s))}<button aria-label="entfernen" data-i="${i}">×</button></span>`).join('') : '<span class="muted small">Noch keine Kompetenzen. Lebenslauf einlesen oder selbst hinzufügen.</span>';
  $$('#skillChips button').forEach(b => b.onclick = () => { S.profile.skills.splice(+b.dataset.i, 1); saveProfile(false); renderSkillChips(); });
}
function saveProfile(msg = true) {
  PF.forEach(k => { const el = $('#p_' + k); if (el) S.profile[k] = el.value.trim(); });
  store.set('profile', S.profile);
  if (msg) toast('Profil gespeichert');
}
function addSkill() { const v = $('#skillAdd').value.trim(); if (!v) return; if (!S.profile.skills.some(s => norm(s) === norm(v))) S.profile.skills.push(v); $('#skillAdd').value = ''; saveProfile(false); renderSkillChips(); }

/* Druck (Lebenslauf / Anschreiben als PDF über Druckdialog) */
function printHTML(html) { $('#print').innerHTML = html; setTimeout(() => window.print(), 50); }
function printCV() {
  saveProfile(false); const P = S.profile;
  const list = t => (t || '').split('\n').filter(Boolean).map(l => { const m = l.match(/^(.{0,40}?\d{4}(?:\s*(?:–|-|—|bis)\s*(?:\S*\d{4}|heute|jetzt|aktuell))?)\s*[:,]?\s*(.*)$/i); return m && m[2] ? `<tr><td style="white-space:nowrap;width:32%">${esc(m[1])}</td><td>${esc(m[2])}</td></tr>` : `<tr><td colspan="2">${esc(l)}</td></tr>`; }).join('');
  printHTML(`<h1>Lebenslauf</h1><div>${esc(P.name)}<br>${esc(P.street)}${P.street ? '<br>' : ''}${esc(P.plz)} ${esc(P.city)}<br>${esc(P.phone)}${P.phone ? ' · ' : ''}${esc(P.email)}</div>
    <h2>Berufserfahrung</h2><table>${list(P.experience) || '<tr><td>–</td></tr>'}</table>
    <h2>Ausbildung</h2><table>${list(P.education) || '<tr><td>–</td></tr>'}</table>
    <h2>Kompetenzen</h2><div>${esc(P.skills.map(cap).join(' · '))}</div>
    ${P.other ? `<h2>Sprachen und Sonstiges</h2><div style="white-space:pre-wrap">${esc(P.other)}</div>` : ''}
    <p style="margin-top:24pt">${esc(P.city)}, ${today()}</p>`);
}

/* ---------- Modul 1a: Berufe ---------- */
function addTarget(title, onState = true) {
  title = title.trim(); if (!title) return;
  const key = tokens(title).sort().join(' ');
  if (!S.profile.targets.some(t => norm(t.title) === norm(title) || tokens(t.title).sort().join(' ') === key)) S.profile.targets.push({ title, on: onState });
}
function suggestOccupations(silent) {
  const P = S.profile, ntext = norm(S.cvText + ' ' + zeugnisText() + ' ' + P.experience + ' ' + P.skills.join(' '));
  const scored = window.OCCUPATIONS.map(([title, kw, rel]) => {
    const nkw = norm(kw); let s = 0;
    P.skills.forEach(sk => { if (hasTerm(nkw, skillTerms(sk))) s += 1; });
    const stem = norm(title).split(/[\s/(-]/)[0].slice(0, 7);
    if (stem.length >= 5 && ntext.includes(stem)) s += 2;
    return { title, rel, s };
  }).filter(o => o.s >= 2).sort((a, b) => b.s - a.s).slice(0, 8);
  // Positionen aus Berufserfahrung übernehmen
  (P.experience || '').split('\n').slice(0, 3).forEach(l => {
    const m = l.replace(/^[^A-Za-zÄÖÜäöü]*((0?[1-9]|1[0-2])[./])?(19|20)\d{2}\s*(–|-|—|bis)\s*\S+\s*[:,]?\s*/i, '').split(/[,|;]| bei /)[0].trim();
    if (m && m.length > 3 && m.length < 60 && !/\d{4}/.test(m)) addTarget(m, true);
  });
  scored.forEach((o, i) => addTarget(o.title, i < 2));
  store.set('profile', S.profile);
  S._occRel = Object.fromEntries(scored.map(o => [o.title, o.rel]));
  if (!silent) renderOccupations();
}
function renderOccupations() {
  if (!S.profile.targets.length) suggestOccupations(true);
  const rel = S._occRel || {};
  const relFor = t => rel[t] || (window.OCCUPATIONS.find(o => o[0] === t) || [])[2] || '';
  $('#occList').innerHTML = S.profile.targets.length ? S.profile.targets.map((t, i) => `
    <label style="display:flex;gap:10px;align-items:flex-start;color:var(--text);padding:6px 0;border-bottom:1px solid var(--line);margin:0">
      <input type="checkbox" data-i="${i}" ${t.on ? 'checked' : ''} style="width:20px;height:20px;margin-top:2px">
      <span style="flex:1"><b>${esc(t.title)}</b>${relFor(t.title) ? `<span class="small muted" style="display:block">Auch: ${esc(relFor(t.title))}</span>` : ''}</span>
      <button class="btn sec small" data-up="${i}" aria-label="nach oben" ${i ? '' : 'disabled'}>↑</button><button class="btn sec small" data-down="${i}" aria-label="nach unten" ${i < S.profile.targets.length - 1 ? '' : 'disabled'}>↓</button>
      <button class="btn sec small" data-del="${i}" aria-label="entfernen">×</button></label>`).join('') + `<p class="small muted" style="margin:8px 0 0">Reihenfolge = Priorität. Gesucht werden die ersten ${maxTitles()} angehakten Berufe (einstellbar unter „Stellen“).</p>`
    : '<p class="muted">Noch keine Vorschläge. Bitte zuerst Lebenslauf einlesen oder Kompetenzen eintragen.</p>';
  $$('#occList input').forEach(c => c.onchange = () => { S.profile.targets[+c.dataset.i].on = c.checked; store.set('profile', S.profile); });
  const mv = (i, d) => { const T = S.profile.targets, j = i + d; if (j < 0 || j >= T.length) return; [T[i], T[j]] = [T[j], T[i]]; store.set('profile', S.profile); renderOccupations(); };
  $$('#occList [data-up]').forEach(b => b.onclick = e => { e.preventDefault(); mv(+b.dataset.up, -1); });
  $$('#occList [data-down]').forEach(b => b.onclick = e => { e.preventDefault(); mv(+b.dataset.down, 1); });
  $$('#occList [data-del]').forEach(b => b.onclick = e => { e.preventDefault(); S.profile.targets.splice(+b.dataset.del, 1); store.set('profile', S.profile); renderOccupations(); });
}
async function escoSearch() {
  const q = $('#escoQ').value.trim(); if (!q) return;
  $('#escoRes').textContent = 'Suche …';
  try {
    const j = await getJSON(`https://ec.europa.eu/esco/api/search?text=${encodeURIComponent(q)}&language=de&type=occupation&limit=12`);
    const res = (j._embedded && j._embedded.results) || [];
    $('#escoRes').innerHTML = res.length ? res.map(r => `<span class="chip">${esc(r.title)} <button data-t="${esc(r.title)}" title="übernehmen">＋</button></span>`).join(' ') : 'Keine Treffer.';
    $$('#escoRes button').forEach(b => b.onclick = () => { addTarget(b.dataset.t); store.set('profile', S.profile); renderOccupations(); toast('Übernommen'); });
  } catch (e) { $('#escoRes').innerHTML = `<span class="notice bad" style="display:block">ESCO nicht erreichbar (${esc(e.message)}). Evtl. CORS-Proxy in den Einstellungen eintragen.</span>`; }
}

/* ---------- Netzwerk ---------- */
async function fetchX(url, opts = {}) {
  const px = S.settings.proxy.trim().replace(/\/$/, '');
  const target = px && !opts.direct ? `${px}/?url=${encodeURIComponent(url)}` : url;
  let r;
  try { r = await fetch(target, opts); }
  catch (e) { throw new Error(px ? 'Proxy nicht erreichbar' : 'Direktaufruf blockiert (CORS?) – Proxy in Einstellungen eintragen'); }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r;
}
const getJSON = async (url, opts) => (await fetchX(url, opts)).json();

/* ---------- Modul 1b: Stellensuche ---------- */
const BA = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service';
const BA_HEAD = { headers: { 'X-API-Key': 'jobboerse-jobsuche' } };
const CITY = {'berlin':[52.52,13.405],'hamburg':[53.551,9.994],'muenchen':[48.137,11.575],'koeln':[50.938,6.96],'frankfurt':[50.11,8.682],'stuttgart':[48.776,9.18],'duesseldorf':[51.227,6.774],'leipzig':[51.34,12.375],'dortmund':[51.514,7.468],'essen':[51.456,7.012],'bremen':[53.079,8.802],'dresden':[51.05,13.738],'hannover':[52.375,9.732],'nuernberg':[49.452,11.077],'duisburg':[51.434,6.762],'bochum':[51.481,7.216],'wuppertal':[51.256,7.15],'bielefeld':[52.021,8.532],'bonn':[50.737,7.098],'muenster':[51.96,7.626],'mannheim':[49.487,8.466],'karlsruhe':[49.007,8.404],'augsburg':[48.366,10.898],'wiesbaden':[50.078,8.24],'aachen':[50.776,6.084],'braunschweig':[52.269,10.521],'kiel':[54.323,10.123],'chemnitz':[50.827,12.921],'halle':[51.482,11.97],'magdeburg':[52.12,11.628],'freiburg':[47.999,7.842],'mainz':[49.993,8.247],'luebeck':[53.866,10.687],'erfurt':[50.978,11.029],'rostock':[54.092,12.099],'kassel':[51.312,9.479],'potsdam':[52.39,13.065],'saarbruecken':[49.24,6.997],'oranienburg':[52.754,13.237],'brandenburg an der havel':[52.412,12.532]};
function coordsFor(place) {
  if (!place) return null; const n = norm(place);
  for (const [k, v] of Object.entries(CITY)) if (n.includes(k)) return v;
  return null;
}
function km(a, b) { if (!a || !b) return null; const R = 6371, r = x => x * Math.PI / 180; const dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); }
function readFilters() {
  const F = { where: $('#f_where').value.trim(), radius: +$('#f_radius').value, worktime: $('#f_worktime').value, salary: +$('#f_salary').value || 0, days: $('#f_days').value, type: $('#f_type').value,
    noZeit: $('#f_noZeit').checked, maxTitles: +$('#f_maxTitles').value || 5, needSalary: $('#f_needSalary').checked, details: $('#f_details').checked,
    src: { ba: $('#src_ba').checked, an: $('#src_an').checked, az: $('#src_az').checked, demo: $('#src_demo').checked, jooble: $('#src_jooble').checked, server: $('#src_server').checked, imp: $('#src_imp').checked },
    srvSites: $$('#serverSites input[value]:checked').map(i => i.value), engines: $$('#serverSites [data-engine]:checked').map(i => i.dataset.engine), srvDirect: $('#srv_direct').checked, srvStrict: $('#srv_strict').checked,
    srvKnown: $$('#serverSites input[value]').map(i => i.value), srvBranch: $('#srv_branch').checked };
  store.set('filters', F); return F;
}
function applyFilterForm() {
  const F = S.filters; if (!F || !F.src) return;
  $('#f_where').value = F.where || ''; $('#f_radius').value = F.radius || 25; $('#f_worktime').value = F.worktime || ''; $('#f_salary').value = F.salary || '';
  $('#f_days').value = F.days ?? '30'; $('#f_maxTitles').value = String(F.maxTitles || 5); $('#f_type').value = F.type || '1'; $('#f_noZeit').checked = !!F.noZeit; $('#f_needSalary').checked = !!F.needSalary; $('#f_details').checked = F.details !== false;
  ['ba','an','az','demo','jooble','server'].forEach(k => $('#src_' + k).checked = !!F.src[k]); $('#src_imp').checked = F.src.imp !== false;
  // neu hinzugekommene Quellen behalten ihre Voreinstellung
  if (F.srvSites) $$('#serverSites input[value]').forEach(i => { if ((F.srvKnown || LEGACY_SITES).includes(i.value)) i.checked = F.srvSites.includes(i.value); }); if (F.srvBranch === false) $('#srv_branch').checked = false; if (F.engines) $$('#serverSites [data-engine]').forEach(i => i.checked = F.engines.includes(i.dataset.engine)); if (F.srvDirect === false) $('#srv_direct').checked = false; if (F.srvStrict === false) $('#srv_strict').checked = false;
  $('#serverSites').classList.toggle('hidden', !F.src.server);
}
/* Branchen-Portale passend zum Beruf automatisch zuschalten (Stichwörter im Suchbegriff) */
// Quellen, die es vor Version 6 gab (für gespeicherte Filter ohne srvKnown)
const LEGACY_SITES = ['arbeitsagentur', 'indeed', 'stepstone', 'xing', 'google', 'linkedin', 'ats', 'arbeitnow', 'kimeta', 'meinestadt', 'jobware', 'eures', 'jooble', 'jobrapido', 'talent', 'careerjet', 'websuche'];
const DEFAULT_SITES = ['arbeitsagentur', 'indeed', 'stepstone', 'xing', 'google', 'arbeitnow', 'jooble', 'bund', 'stellenanzeigen', 'monster', 'websuche'];
const BRANCH_SITES = [
  [/pfleg|kranken|alten|medizin|arzthelf|mfa\b|zfa\b|hebamm|therap|physio|ergo|logopäd|rettung|notfall|op-|anästhes|praxis|klinik|heilerzieh/i, ['medijobs']],
  [/arzt|ärzt|mediziner|chirurg|internist|psychiat|radiolog|kinderarzt/i, ['praktischarzt', 'medijobs']],
  [/koch|köch|küche|gastro|hotel|restaurant|kellner|service ?kraft|barkeeper|rezeption|housekeeping|patissier|bäcker|konditor|sommelier|hauswirtsch|systemgastr/i, ['hogapage']],
  [/chemi|biolog|labor|pharma|physik|naturwiss|biotech|lebensmittel|qualitätssich|verfahrenstech|ingenieur|werkstoff|mikrobio/i, ['jobvector']],
  [/informati|software|entwickler|developer|programm|admin|devops|\bit\b|daten|data|cloud|netzwerk|sap|web|frontend|backend|fullstack|cyber|security/i, ['heise']],
  [/vertrieb|verkauf|verkäuf|sales|außendienst|aussendienst|key account|account manag|kundenberat|handelsvertret|business develop/i, ['salesjob']],
  [/medien|redakt|journal|lektor|verlag|mediengestalt|grafik|kommunikation|pr-|content|social media|film|fernseh|tontechn/i, ['medienjobs']],
  [/umwelt|energie|solar|photovoltaik|wind|nachhaltig|klima|naturschutz|landschaft|forst|recycling|abfall|wasser|erneuerbar|wärmepump|elektromobil/i, ['greenjobs', 'nachhaltigejobs']],
  [/trainee|absolvent|berufseinst|werkstudent|praktik|junior|duales studium|abschlussarbeit/i, ['absolventa', 'staufenbiel']],
  [/verwaltung|beamt|öffentlich|behörde|amt\b|kommun|sachbearbeit|justiz|polizei|feuerwehr|bundeswehr|finanzamt|zoll/i, ['bund', 'interamt']],
];
const branchSites = term => [...new Set(BRANCH_SITES.filter(([re]) => re.test(term)).flatMap(([, k]) => k))];
const maxTitles = () => Math.max(1, Math.min(10, +(($('#f_maxTitles') && $('#f_maxTitles').value) || S.filters.maxTitles || 5)));
const cleanTitle = t => t.replace(/\/(in|-in|r|e)\b/gi, '').replace(/\(.*?\)/g, '').trim();
const searchTerms = () => S.profile.targets.filter(t => t.on).map(t => cleanTitle(t.title)).slice(0, maxTitles());
const prog = t => $('#searchProgress').textContent = t;

function titleMatchesTerm(title, term) { const a = tokens(title), b = tokens(term); return b.some(x => a.some(y => tokSim(x, y) >= .85)); }
function parseSalary(text) {
  const n = norm(text); let m = n.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})\s*(?:,-|,00)?\s*(?:€|eur|euro)(?:[^.\n]{0,25}?(brutto|jahr|monat|stunde|p\.a))?/);
  if (!m) { m = n.match(/(\d{2},\d{2}|\d{2})\s*(?:€|eur|euro)\s*(?:brutto\s*)?(?:pro|\/|je)\s*stunde/); if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 173); return null; }
  let v = parseInt(m[1].replace(/[.\s]/g, ''), 10);
  if (/jahr|p\.a/.test(m[2] || '') || v > 15000) v = Math.round(v / 12);
  return v >= 800 && v <= 20000 ? v : null;
}
const detectWorktime = t => { const n = norm(t); return /homeoffice|home-office|remote/.test(n) ? 'ho' : /minijob|520|556|603 ?(€|euro)/.test(n) ? 'mj' : /teilzeit/.test(n) ? 'tz' : /schicht|nachtdienst|wochenend/.test(n) ? 'snw' : /vollzeit/.test(n) ? 'vz' : ''; };
const isZeitarbeit = t => /zeitarbeit|arbeitnehmerueberlassung|personaldienstleist|personalvermittlung/.test(norm(t));
const findEmail = t => ((String(t).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [])[0] || '').replace(/[.,;]$/, '');
const strip = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

async function searchBA(term, F) {
  const p = new URLSearchParams({ was: term, angebotsart: F.type, page: '1', size: '50' });
  if (F.where) { p.set('wo', F.where); p.set('umkreis', String(Math.min(F.radius, 200))); }
  if (F.worktime) p.set('arbeitszeit', F.worktime);
  if (F.days) p.set('veroeffentlichtseit', F.days);
  if (F.noZeit) p.set('zeitarbeit', 'false');
  const j = await getJSON(`${BA}/pc/v4/jobs?${p}`, BA_HEAD);
  return (j.stellenangebote || []).map(x => {
    const o = x.arbeitsort || {}, k = o.koordinaten || {};
    return { id: 'ba-' + x.refnr, source: 'Arbeitsagentur', refnr: x.refnr, title: x.titel || x.beruf, beruf: x.beruf || '', company: x.arbeitgeber || '',
      location: [o.plz, o.ort].filter(Boolean).join(' ') || o.region || '', lat: k.lat, lon: k.lon, dist: o.entfernung != null ? Math.round(+o.entfernung) : null,
      published: x.aktuelleVeroeffentlichungsdatum || x.modifikationsTimestamp || '', url: x.externeUrl || '', baUrl: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(x.refnr)}`,
      worktime: F.worktime || '', description: '', email: '', salaryMin: null, salaryMax: null };
  });
}
/* Studiensuche der Bundesagentur für Arbeit (öffentlicher Schlüssel laut bundesAPI-Doku, Felder laut openapi.yaml) */
const STUDISU = 'https://rest.arbeitsagentur.de/infosysbub/studisu/pc/v1/studienangebote', STUDISU_HEAD = { 'X-API-Key': 'infosysbub-studisu' };
/* Studium: Berufsbezeichnung → passende Studienfächer (eigene Zuordnung, erweiterbar) */
const STUDY_MAP = [[/elektr|elektron/i, 'Elektrotechnik'], [/mechatron/i, 'Mechatronik'], [/informati|software|entwickler|developer|programm|admin|devops/i, 'Informatik'], [/wirtschaftsinformat/i, 'Wirtschaftsinformatik'],
  [/kauf|büro|buchhalt|controlling|bank|versicherung|personal/i, 'Betriebswirtschaftslehre'], [/steuer/i, 'Steuerwesen'], [/pfleg|kranken|alten/i, 'Pflege'], [/erzieher|kinderpfleg|kita/i, 'Kindheitspädagogik'], [/sozial/i, 'Soziale Arbeit'],
  [/maurer|bau|beton|tiefbau|hochbau|straßenbau/i, 'Bauingenieurwesen'], [/architekt|bauzeichn/i, 'Architektur'], [/metall|industriemech|maschinen|konstrukt|zerspan|werkzeug/i, 'Maschinenbau'], [/kfz|fahrzeug|karosser/i, 'Fahrzeugtechnik'],
  [/chemi|labor/i, 'Chemie'], [/biolog|biotech/i, 'Biologie'], [/arzt|ärzt|mediziner/i, 'Medizin'], [/mfa|medizinische fach|gesundheit/i, 'Gesundheitsmanagement'], [/physio/i, 'Physiotherapie'], [/logistik|lager|spedition/i, 'Logistik'],
  [/koch|köch|hotel|gastro|restaurant/i, 'Hotelmanagement'], [/verkäuf|verkauf|einzelhandel|handel/i, 'Handelsmanagement'], [/medien|mediengestalt|grafik/i, 'Mediendesign'], [/anwalt|jurist|recht|justiz/i, 'Rechtswissenschaft'],
  [/energie|solar|photovoltaik|wind/i, 'Erneuerbare Energien'], [/garten|gärtner|landschaft/i, 'Landschaftsarchitektur'], [/landwirt|agrar/i, 'Agrarwissenschaften'], [/lehrer|lehrkraft/i, 'Lehramt'], [/sanitär|heizung|shk|klima|gebäudetech/i, 'Gebäudetechnik']];
function studyTerms(term) { const hits = STUDY_MAP.filter(([re]) => re.test(term)).map(x => x[1]); return hits.length ? [...new Set(hits)].slice(0, 2) : [term]; }
async function searchStudium(term, F) {
  const p = new URLSearchParams({ sw: term, pg: '1' }), c = S.settings.coords || coordsFor(F.where);
  if (F.where && c) {
    const plz = (F.where.match(/\b\d{5}\b/) || [''])[0], ort = F.where.replace(/\b\d{5}\b/, '').split(',')[0].trim();
    p.set('orte', `${ort}_${plz}_${c[1]}_${c[0]}`); p.set('uk', String([25, 50, 100, 150, 200].find(u => (F.radius || 25) <= u) || 'Bundesweit'));
  } else p.set('uk', 'Bundesweit');
  const d = await getJSON(`${STUDISU}?${p}`, STUDISU_HEAD);
  return (d.items || []).map(it => {
    const a = it.studienangebot || it, o = a.studienort || {}, prov = a.studienanbieter || {}, loc = o.location || {};
    const lab = k => (a[k] && a[k].label) || '', links = (a.externalLinks || []).filter(u => typeof u === 'string' && /^https?:/.test(u));
    const title = a.studiBezeichnung || '';
    return { id: 'stu-' + (a.id || hash(title + prov.name)), source: 'Studiensuche (BA)', kind: 'studium', title, company: prov.name || '',
      location: [o.postleitzahl, o.ort].filter(Boolean).join(' '), lat: loc.lat, lon: loc.lon,
      url: links[0] || 'https://duckduckgo.com/?q=' + encodeURIComponent(`${title} ${prov.name || ''} Studium`), directUrl: links[0] || '',
      description: [lab('abschlussgrad'), lab('studienform'), lab('hochschulart'), lab('studientyp'), (a.studienmodelle || []).map(m => m.label).join(', '), a.studiBeginn ? 'Beginn: ' + a.studiBeginn : ''].filter(Boolean).join(' · ') + (a.studiInhalt ? '\n' + strip(a.studiInhalt) : ''),
      published: '', email: '', salaryMin: null, salaryMax: null, worktime: '' };
  });
}
// Treffer allgemeiner Quellen auf die gewählte Angebotsart eingrenzen
const KIND_RE = { '4': /ausbild|azubi|auszubild|dual(es|er)? studi|lehrstelle|lehrling|umschul/i, '34': /praktik|trainee|werkstudent|volontar|abschlussarbeit|thesis|internship/i, studium: /studi|bachelor|master|hochschul|universit/i };
const TYPE_WORD = { '4': 'Ausbildung', '34': 'Praktikum', studium: 'Studium' };
async function loadBADetails(job) {
  try {
    const j = await getJSON(`${BA}/pc/v4/jobdetails/${btoa(unescape(encodeURIComponent(job.refnr)))}`, BA_HEAD);
    const all = JSON.stringify(j);
    job.description = strip(j.stellenangebotsBeschreibung || j.stellenbeschreibung || j.beschreibung || '');
    job.email = findEmail(all);
    job.url = job.url || j.externeUrl || j.allianzpartnerUrl || '';
    job.salaryMin = parseSalary(job.description + ' ' + (j.verguetung || ''));
    job.worktime = job.worktime || detectWorktime(job.description + ' ' + JSON.stringify(j.arbeitszeitmodelle || ''));
    job.zeit = isZeitarbeit(all) || j.istPrivateArbeitsvermittlung === true;
  } catch (e) { job.detailError = e.message; }
}
async function searchArbeitnow(terms, F) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const j = await getJSON(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    (j.data || []).forEach(x => out.push({ id: 'an-' + x.slug, source: 'Arbeitnow', title: x.title, company: x.company_name, location: x.location + (x.remote ? ' (Remote)' : ''),
      remote: !!x.remote, published: x.created_at ? new Date(x.created_at * 1000).toISOString().slice(0, 10) : '', url: x.url,
      description: strip(x.description) + '\n' + (x.tags || []).join(', '), email: '', worktime: x.remote ? 'ho' : '', salaryMin: null }));
  }
  const nt = terms.map(t => norm(t).split(/\s+/)[0].slice(0, 7));
  const wc = coordsFor(F.where);
  return out.filter(j => nt.some(t => norm(j.title + ' ' + j.description.slice(0, 600)).includes(t)))
    .map(j => { j.email = findEmail(j.description); const c = coordsFor(j.location); if (c) { j.lat = c[0]; j.lon = c[1]; } if (wc && c) j.dist = km(wc, c); j.salaryMin = parseSalary(j.description); return j; });
}
async function searchAdzuna(term, F) {
  if (!S.settings.azid || !S.settings.azkey) throw new Error('Adzuna-Schlüssel fehlt (Einstellungen)');
  const p = new URLSearchParams({ app_id: S.settings.azid, app_key: S.settings.azkey, what: term, results_per_page: '50', 'content-type': 'application/json' });
  if (F.where) { p.set('where', F.where); p.set('distance', String(F.radius)); }
  if (F.salary) p.set('salary_min', String(F.salary * 12));
  if (F.days) p.set('max_days_old', F.days);
  if (F.worktime === 'vz') p.set('full_time', '1'); if (F.worktime === 'tz') p.set('part_time', '1');
  const j = await getJSON(`https://api.adzuna.com/v1/api/jobs/de/search/1?${p}`);
  return (j.results || []).map(x => ({ id: 'az-' + x.id, source: 'Adzuna', title: strip(x.title), company: (x.company || {}).display_name || '', location: (x.location || {}).display_name || '',
    lat: x.latitude, lon: x.longitude, published: (x.created || '').slice(0, 10), url: x.redirect_url, description: strip(x.description), email: '',
    salaryMin: x.salary_min ? Math.round(x.salary_min / 12) : null, salaryMax: x.salary_max ? Math.round(x.salary_max / 12) : null, worktime: x.contract_time === 'part_time' ? 'tz' : x.contract_time === 'full_time' ? 'vz' : '' }));
}
async function runSearch() {
  saveProfile(false);
  const F = readFilters(), terms = searchTerms();
  if (!terms.length && !F.src.demo && !(F.src.imp && S.imported.length)) { toast('Bitte unter „Berufe“ mindestens einen Beruf anhaken'); return go(on('1a') ? 'berufe' : 'cv'); }
  $('#btnSearch').disabled = true; const errors = []; let jobs = [];
  const userC = S.settings.coords || coordsFor(F.where);
  try {
    const tag = (arr, t) => arr.map(j => Object.assign(j, { foundBy: [t] }));
    const stud = F.type === 'studium', qt = t => TYPE_WORD[F.type] && F.type !== 'studium' ? `${TYPE_WORD[F.type]} ${t}` : t;
    if (F.src.ba && stud) for (const t of terms) for (const st of studyTerms(t)) { prog(`Studiensuche: ${st}${st !== t ? ` (zu „${t}“)` : ''} …`); try { jobs.push(...tag(await searchStudium(st, F), t)); } catch (e) { errors.push('Studiensuche: ' + e.message); break; } }
    if (F.src.ba && !stud) for (const t of terms) { prog(`Arbeitsagentur: ${t} …`); try { jobs.push(...tag(await searchBA(t, F), t)); } catch (e) { errors.push('Arbeitsagentur: ' + e.message); break; } }
    if (stud && !F.src.server) { /* Arbeitnow, Adzuna, Jooble haben keine Studienangebote */ }
    else if (F.src.an && !stud) { prog('Arbeitnow …'); try { jobs.push(...await searchArbeitnow(terms, F)); } catch (e) { errors.push('Arbeitnow: ' + e.message); } }
    if (F.src.az && !stud) for (const t of terms) { prog(`Adzuna: ${t} …`); try { jobs.push(...tag(await searchAdzuna(qt(t), F), t)); } catch (e) { errors.push('Adzuna: ' + e.message); break; } }
    if (F.src.jooble && on('1e') && !stud) for (const t of terms) { prog(`Jooble: ${t} …`); try { jobs.push(...tag(await searchJooble(qt(t), F), t)); } catch (e) { errors.push('Jooble: ' + e.message); break; } }
    if (F.src.server && on('1f')) for (const t of terms) { prog(`Suchserver: ${t} … (kann 1–2 Min. dauern)`); try { const r = await searchServer(t, F); jobs.push(...tag(r.jobs, t)); Object.entries(r.errors || {}).forEach(([k, v]) => errors.push(`Suchserver/${k}: ${v}`)); } catch (e) { errors.push('Suchserver: ' + e.message); break; } }
    if (F.src.imp) jobs.push(...S.imported.map(j => Object.assign({}, j)));
    if (F.src.demo) jobs.push(...window.DEMO_JOBS.map(j => Object.assign({}, j)));
    // Angebotsart: allgemeine Quellen liefern auch normale Stellen → eingrenzen (Arbeitsagentur/Studiensuche sind schon passend)
    const dis = new Set(store.get('dismissed', [])); if (dis.size) jobs = jobs.filter(j => !dis.has(j.id));
    if (KIND_RE[F.type]) jobs = jobs.filter(j => ['Arbeitsagentur', 'Studiensuche (BA)', 'Demo'].includes(j.source) || KIND_RE[F.type].test(j.title + ' ' + String(j.description || '').slice(0, 300)));
    // Doppelte entfernen
    const seen = new Map(); jobs = jobs.filter(j => { const k = norm(j.title).replace(/\W/g, '') + '|' + norm(j.company).replace(/\W/g, ''); if (seen.has(k)) { const o = seen.get(k); o.foundBy = [...new Set([...(o.foundBy || []), ...(j.foundBy || [])])]; return false; } seen.set(k, j); return true; });
    jobs.forEach(j => { if (!j.foundBy) { const t = terms.find(t => titleMatchesTerm(j.title, t)); j.foundBy = t ? [t] : []; } });
    jobs.forEach(j => { if (!j.lat && j.location) { const c = coordsFor(j.location); if (c) { j.lat = c[0]; j.lon = c[1]; } } if (j.dist == null && userC && j.lat && j.lon) j.dist = km(userC, [j.lat, j.lon]); j.email = j.email || findEmail(j.description); scoreJob(j, F); });
    // Stellentexte (Arbeitsagentur) für die besten Treffer nachladen
    if (F.details) {
      const need = jobs.filter(j => j.source === 'Arbeitsagentur').sort((a, b) => b.score - a.score).slice(0, 40);
      let done = 0;
      for (let i = 0; i < need.length; i += 4) {
        await Promise.all(need.slice(i, i + 4).map(loadBADetails));
        done = Math.min(i + 4, need.length); prog(`Stellentexte ${done}/${need.length} …`);
        await sleep(150);
      }
      need.forEach(j => scoreJob(j, F));
    }
    // Filter
    jobs = jobs.filter(j => {
      if (F.noZeit && (j.zeit || isZeitarbeit(j.company + ' ' + j.description))) return false;
      if (F.needSalary && !j.salaryMin && !j.salaryMax) return false;
      if (F.salary && (j.salaryMax || j.salaryMin) && (j.salaryMax || j.salaryMin) < F.salary) return false;
      if (F.where && j.dist != null && j.dist > F.radius && !j.remote && j.worktime !== 'ho') return false;
      if (F.worktime && j.source !== 'Arbeitsagentur' && j.worktime && j.worktime !== F.worktime) return false;
      if (F.days && j.published && (Date.now() - new Date(j.published)) / 864e5 > +F.days + 1) return false;
      return true;
    });
    S.jobs = jobs;
    prog(`${jobs.length} ${F.type === 'studium' ? 'Studienangebote' : F.type === '4' ? 'Ausbildungsplätze' : F.type === '34' ? 'Praktika/Trainee-Stellen' : 'Stellen'} gefunden.`);
    if (errors.length) toast(errors.join(' · '), 7000);
    renderResults();
    if (S.settings.semantic) semanticRank();
  } finally { $('#btnSearch').disabled = false; }
}

/* ---------- Passung berechnen (transparent, ohne KI) ---------- */
const STOP = new Set(['m','w','d','mwd','in','innen','und','oder','fuer','als','der','die','das','im','mit','bei','zur','zum','ab','sofort','vollzeit','teilzeit','junior','senior','mitarbeiter','mitarbeiterin','fachkraft','bereich','gmbh']);
const tokens = s => norm(s).replace(/\(.*?\)/g, ' ').replace(/\/(in|-in|r|e)\b/g, '').split(/[^a-z0-9+#]+/).filter(t => t.length > 1 && !STOP.has(t));
function tokSim(a, b) {
  if (a === b) return 1;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return .85;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 6 ? .6 : i >= 5 ? .4 : 0;
}
function titleScore(job) {
  const jt = tokens(job.title + ' ' + (job.beruf || ''));
  if (!jt.length) return 0;
  let best = 0;
  for (const t of S.profile.targets.filter(t => t.on)) {
    const names = [t.title, ...((window.OCCUPATIONS.find(o => o[0] === t.title) || [])[2] || '').split(';')].filter(Boolean);
    for (const n of names) { const tt = tokens(n); if (!tt.length) continue; const s = tt.reduce((a, x) => a + Math.max(...jt.map(y => tokSim(x, y))), 0) / tt.length; best = Math.max(best, s); }
  }
  return Math.min(1, best);
}
/* ---------- Anforderungen genauer vergleichen: Jahre, Abschluss, Sprachen, Pflicht/Wunsch ---------- */
const NICE_RE = /wünschenswert|wuenschenswert|von vorteil|idealerweise|wäre schön|nice to have|optional|pluspunkt|gerne auch|wünschen wir uns|kein muss/i;
const MUST_RE = /zwingend|erforderlich|voraussetzung|setzen .{0,20}voraus|unbedingt|\bmuss\b|notwendig|unabdingbar|required/i;
const LANGS = ['deutsch', 'englisch', 'französisch', 'spanisch', 'italienisch', 'russisch', 'polnisch', 'türkisch', 'arabisch', 'ukrainisch', 'niederländisch'];
const LVL = { a1: 1, a2: 2, b1: 3, b2: 4, c1: 5, c2: 6 };
const DEG = { 1: 'ohne Abschluss / Quereinstieg', 2: 'Berufsausbildung', 3: 'Meister / Techniker / Fachwirt', 4: 'Studium' };
const reqLines = t => String(t || '').split(/\n|•|·|;|(?<=\.)\s+(?=[A-ZÄÖÜ])/).map(l => l.trim()).filter(l => l.length > 2);
function langLevel(seg) {
  const n = norm(seg), m = n.match(/\b([abc][12])\b/);
  if (m) return LVL[m[1]];
  if (/muttersprach|native/.test(n)) return 6;
  if (/verhandlungssicher|fliessend|sehr gute?|exzellent|perfekt|fluent/.test(n)) return 5;
  if (/\bgute?\b|good/.test(n)) return 4;
  if (/grundkenntnis|basiskenntnis|einfache|grundlegend|basic/.test(n)) return 2;
  return null;
}
function findLangs(text) {
  const out = {}, n = String(text || '');
  for (const l of LANGS) {
    const re = new RegExp(`(.{0,40})\\b${l}(kenntnisse|kenntnissen|e|en)?\\b(.{0,40})`, 'gi'); let m;
    while ((m = re.exec(n))) {
      const after = m[3].split(/\bund\b|\boder\b|,|;/)[0], before = m[1].split(/[,;()]|\bund\b|\boder\b/).pop();
      const lv = langLevel(after) ?? langLevel(before);
      out[l] = Math.max(out[l] || 0, lv || 0) || (out[l] ?? null);
    }
  }
  return out;
}
function degreeLevel(text, forJob) {
  const n = norm(text);
  if (forJob && /quereinsteig|ohne (berufs)?ausbildung|keine (berufs)?ausbildung|ungelernt|angelernt|keine vorkenntnisse/.test(n) && !/abgeschlossene/.test(n)) return 1;
  if (/\b(studium|hochschul|bachelor|master|diplom|universitaet|fachhochschul)/.test(n) && !(forJob && /(oder|bzw\.?|alternativ) .{0,40}(ausbildung|berufserfahrung)/.test(n))) return 4;
  if (/meister|techniker|fachwirt|betriebswirt \(ihk|staatlich gepruef/.test(n)) return 3;
  if (/ausbildung|geselle|facharbeiter|fachkraft|ihk|hwk|kaufmann|kauffrau|berufsabschluss/.test(n)) return 2;
  return forJob ? null : 1;
}
let _pfKey = '', _pf = null;
function profileFacts() {
  const P = S.profile, all = [S.cvText, zeugnisText(), P.education, P.other, P.experience].join('\n');
  const key = all.length + '|' + P.years + '|' + (P.education || '').length + '|' + (BA_RESULT ? BA_RESULT.codes.join() : '');
  if (key === _pfKey && _pf) return _pf;
  const langs = findLangs([P.other, S.cvText, zeugnisText()].join('\n'));
  if (!langs.deutsch) langs.deutsch = 5;          // Lebenslauf auf Deutsch → mindestens gute Kenntnisse angenommen
  let deg = degreeLevel([P.education, S.cvText, zeugnisText()].join('\n'), false);
  if (BA_RESULT && BA_RESULT.matched.length) deg = Math.max(deg, ...BA_RESULT.matched.map(m => Math.min(4, +m.e.c[4] || 0)));
  _pfKey = key; _pf = { years: +P.years || 0, langs, deg };
  return _pf;
}
function jobRequirements(job) {
  const lines = reqLines(job.description), pf = profileFacts(), reqs = [];
  const kind = l => NICE_RE.test(l) ? 'wunsch' : MUST_RE.test(l) ? 'pflicht' : 'normal';
  // Berufserfahrung
  for (const l of lines) {
    const m = norm(l).match(/(\d{1,2})\s*\+?\s*(?:-\s*\d+\s*)?(?:jahre|jahren)\b[^.]{0,40}(?:erfahrung|berufspraxis|taetigkeit)/) || norm(l).match(/(?:erfahrung|berufspraxis)[^.]{0,30}?(\d{1,2})\s*\+?\s*jahre/);
    if (m) { const y = +m[1]; if (y > 0 && y < 30) { reqs.push({ label: `${y} Jahre Erfahrung`, ok: pf.years ? pf.years >= y : null, kind: kind(l), detail: pf.years ? `du: ${pf.years} Jahre` : 'Berufsjahre im Profil eintragen' }); break; } }
  }
  // Abschluss
  const dl = lines.find(l => degreeLevel(l, true) != null && /ausbildung|studium|abschluss|meister|techniker|bachelor|master|diplom|quereinsteig|qualifikation/i.test(l));
  if (dl) { const need = degreeLevel(dl, true); reqs.push({ label: DEG[need], ok: need <= pf.deg, kind: need === 1 ? 'normal' : kind(dl), detail: `du: ${DEG[pf.deg] || '?'}` }); }
  // Sprachen
  const jl = findLangs(job.description);
  for (const [l, lv] of Object.entries(jl)) {
    const line = lines.find(x => norm(x).includes(norm(l))) || '', need = lv || 3, have = pf.langs[l] || 0;
    reqs.push({ label: `${cap(l)} ${['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'][need]}${lv ? '' : ' (Niveau nicht genannt)'}`, ok: have >= need, kind: kind(line), detail: have ? `du: ${['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'][have]}` : 'nicht im Profil' });
  }
  return { reqs, lines, kind };
}
function scoreJob(job, F = S.filters) {
  const text = job.title + ' ' + (job.beruf || '') + '\n' + (job.description || '');
  const ntext = norm(text), profSet = new Set(S.profile.skills.map(norm));
  const jobSkills = detectSkills(text).filter(x => x.cat !== 'Sprachen');   // Sprachen werden mit Niveau in den Anforderungen geprüft
  const { reqs, lines, kind } = jobRequirements(job);
  // Kompetenzen gewichten: Pflicht 1,5 · normal 1 · Wunsch 0,5
  const weightOf = sk => { const ls = lines.filter(l => hasTerm(norm(l), sk.terms)); if (!ls.length) return ['normal', 1]; const k = ls.map(kind); return k.includes('pflicht') ? ['pflicht', 1.5] : k.every(x => x === 'wunsch') ? ['wunsch', .5] : ['normal', 1]; };
  let wSum = 0, wHit = 0; const matched = [], missing = [], missKind = {};
  for (const sk of jobSkills) { const [k, w] = weightOf(sk); wSum += w; if (profSet.has(norm(sk.label))) { wHit += w; matched.push(sk.label); } else { missing.push(sk.label); missKind[sk.label] = k; } }
  const isLang = s => LANGS.includes(norm(s).replace(/kenntnisse$/, '').replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü')) || LANGS.map(norm).includes(norm(s));
  const extra = S.profile.skills.filter(s => !isLang(s) && !jobSkills.some(j => norm(j.label) === norm(s)) && hasTerm(ntext, skillTerms(s)));
  matched.push(...extra); wSum += extra.length; wHit += extra.length;
  const hasDesc = (job.description || '').length > 80;
  let skill = null;
  if (hasDesc && wSum > 0) skill = wHit / wSum;
  else if (hasDesc && S.profile.skills.length) skill = Math.min(1, matched.length / Math.min(5, S.profile.skills.length));
  const rq = reqs.filter(r => r.ok != null), rw = r => r.kind === 'pflicht' ? 1.5 : r.kind === 'wunsch' ? .5 : 1;
  const reqScore = rq.length ? rq.reduce((a, r) => a + (r.ok ? rw(r) : 0), 0) / rq.reduce((a, r) => a + rw(r), 0) : null;
  if (reqScore != null) skill = skill == null ? reqScore : .75 * skill + .25 * reqScore;
  const title = titleScore(job);
  const prefs = [];
  if (job.dist != null && F.where) prefs.push(['Entfernung', job.dist <= (F.radius || 25) ? 1 : Math.max(0, 1 - (job.dist - F.radius) / Math.max(20, F.radius))]);
  const wish = +S.profile.salary || F.salary || 0, sal = job.salaryMax || job.salaryMin;
  if (wish && sal) prefs.push(['Gehalt', Math.min(1, sal / wish)]);
  if (F.worktime && job.worktime) prefs.push(['Arbeitszeit', job.worktime === F.worktime ? 1 : .3]);
  const pref = prefs.length ? prefs.reduce((a, p) => a + p[1], 0) / prefs.length : .75;
  let total = skill == null ? .75 * title + .25 * pref : .45 * title + .40 * skill + .15 * pref;
  const mustMiss = reqs.filter(r => r.ok === false && r.kind === 'pflicht').length + missing.filter(m => missKind[m] === 'pflicht').length;
  if (mustMiss) total *= Math.max(.7, 1 - .08 * mustMiss);     // fehlende Pflichtanforderungen dämpfen die Passung
  // Weg 6: inhaltlicher Vergleich (Einbettungen über Ollama), falls eingeschaltet und berechnet
  let sem = null;
  if (S.settings.semantic && job.sem != null) { sem = Math.max(0, Math.min(1, (job.sem - 0.35) / 0.4)); const w = (job.description || '').length > 200 ? 0.25 : 0.1; total = (1 - w) * total + w * sem; }   // Skalierung 0,35–0,75 = eigene Annahme, mit echten Modellen nachjustieren
  const learn = learnBonus(job);
  job.score = Math.max(0, Math.min(100, Math.round(total * 100) + (learn ? learn.points : 0)));
  job.explain = { title, skill, pref, prefs, matched: [...new Set(matched)], missing, missKind, reqs, reqScore, mustMiss, rough: skill == null, learn, sem };
  return job;
}

/* ---------- Ergebnisliste ---------- */
const safeUrl = u => /^https?:\/\//i.test(String(u || ''));
const fmtEUR = v => v ? v.toLocaleString('de-DE') + ' €' : '';
const WT = { vz: 'Vollzeit', tz: 'Teilzeit', snw: 'Schicht/Nacht/WE', ho: 'Homeoffice', mj: 'Minijob' };
function sortJobs(list) {
  const by = $('#sortBy').value, d = x => x.published ? new Date(x.published).getTime() : 0;
  const cmp = { score: (a, b) => b.score - a.score, date: (a, b) => d(b) - d(a), dist: (a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9),
    salary: (a, b) => (b.salaryMax || b.salaryMin || 0) - (a.salaryMax || a.salaryMin || 0), title: (a, b) => a.title.localeCompare(b.title, 'de'), company: (a, b) => a.company.localeCompare(b.company, 'de') }[by];
  return [...list].sort(cmp);
}
function careerSearchUrl(j) { return `https://www.google.com/search?q=${encodeURIComponent(`${j.company} Karriere ${j.title.replace(/\(.*?\)/g, '')}`)}`; }
function renderResults() {
  const min = +$('#minScore').value, list = sortJobs(S.jobs.filter(j => j.score >= min));
  $('#resultCount').textContent = S.jobs.length ? `${list.length} von ${S.jobs.length} Stellen` : '';
  $('#attrib').innerHTML = S.jobs.some(j => j.source === 'Adzuna') ? 'Jobs by <a href="https://www.adzuna.de" target="_blank" rel="noopener">Adzuna</a>. ' : '';
  $('#attrib').innerHTML += S.jobs.length ? 'Quellen je nach Auswahl: Jobbörse der Bundesagentur für Arbeit, Arbeitnow, Adzuna, Jooble, eigener Suchserver (Entfernungen: GeoNames, CC BY 4.0), übernommene Portalseiten. Maßgeblich ist immer die Originalanzeige.' : '';
  if (!S.jobs.length) { $('#results').innerHTML = on('1b') ? '<p class="muted">Noch keine Suche durchgeführt.</p>' : ''; return; }
  $('#results').innerHTML = list.map(j => {
    const e = j.explain, cls = j.score >= 75 ? 'hi' : j.score >= 50 ? 'mid' : 'lo';
    const tracked = S.tracker.find(t => t.id === j.id);
    const bar = (lbl, v) => v == null ? `<div class="small muted">${lbl}: keine Daten</div>` : `<div class="small">${lbl}: ${Math.round(v * 100)} %<div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`;
    return `<div class="job" data-id="${esc(j.id)}"><div class="top"><div class="score ${cls}" style="--p:${j.score}" title="Passung">${j.score}%</div><div style="flex:1;min-width:0">
      <h4>${esc(j.title)}</h4><div class="meta">${esc(j.company)} · ${esc(j.location)}${j.dist != null ? ` · ${j.dist} km` : ''}${j.salaryMin || j.salaryMax ? ` · ${fmtEUR(j.salaryMin)}${j.salaryMax && j.salaryMax !== j.salaryMin ? '–' + fmtEUR(j.salaryMax) : ''}` : ''}${j.worktime ? ` · ${WT[j.worktime]}` : ''}</div>
      <div class="meta">${esc(j.source)}${j.sources && j.sources.length > 1 ? ` (${j.sources.length} Portale)` : ''}${j.published ? ' · ' + new Date(j.published).toLocaleDateString('de-DE') : ''}${j.email ? ' · ✉️ E-Mail-Kontakt' : ''}${e.rough ? ' · grobe Schätzung (ohne Stellentext)' : ''}${(j.foundBy || []).length ? ` · gefunden über: ${esc(j.foundBy.join(', '))}` : ''}${tracked ? ` · <span class="status">${esc(tracked.status)}</span>` : ''}</div>
      </div></div>
      <div class="chips" style="margin-top:8px">${e.matched.slice(0, 8).map(s => `<span class="chip hit">✓ ${esc(cap(s))}</span>`).join('')}${e.missing.slice(0, 5).map(s => `<span class="chip miss">✗ ${esc(cap(s))}${e.missKind && e.missKind[s] === 'pflicht' ? ' · Pflicht' : e.missKind && e.missKind[s] === 'wunsch' ? ' · Wunsch' : ''}</span>`).join('')}${(e.reqs || []).map(r => `<span class="chip ${r.ok === false ? 'miss' : r.ok ? 'hit' : ''}" title="${esc(r.detail)}">${r.ok === false ? '✗' : r.ok ? '✓' : '?'} ${esc(r.label)}${r.kind === 'pflicht' ? ' · Pflicht' : r.kind === 'wunsch' ? ' · Wunsch' : ''}</span>`).join('')}</div>
      <details><summary>Warum ${j.score} %? · Stellentext</summary>
        <div class="grid" style="margin-top:8px">${bar('Berufsbezeichnung (45 %)', e.title)}${bar('Kompetenzen (40 %)', e.skill)}${bar('Wünsche: Ort/Gehalt/Arbeitszeit (15 %)', e.prefs.length ? e.pref : null)}${e.sem != null ? bar('Inhaltlich (Bedeutung, 25 % der Gesamtpassung)', e.sem) : ''}</div>
        ${e.rough ? '<p class="small muted">Ohne Stellentext zählt nur die Berufsbezeichnung (75 %) und Wünsche (25 %).</p>' : ''}
        ${e.learn && e.learn.points ? `<p class="small">Deine Vorlieben: <b>${e.learn.points > 0 ? '+' : ''}${e.learn.points} Punkte</b> (${esc(e.learn.top.join(', '))}) – abschaltbar in den Einstellungen.</p>` : ''}
        ${(e.reqs || []).length ? `<p class="small muted">Anforderungen: ${e.reqs.map(r => `${esc(r.label)} – ${r.ok === false ? 'nicht erfüllt' : r.ok ? 'erfüllt' : 'unklar'} (${esc(r.detail)})`).join(' · ')}. Sie fließen zu 25 % in den Kompetenz-Anteil ein; fehlende Pflichtanforderungen senken die Passung zusätzlich.</p>` : ''}
        ${on('2b') ? `<button class="btn sec small" data-act="aiscore">KI-Bewertung mit Begründung</button><div class="small ai-out" style="margin-top:6px"></div>` : ''}
        <div class="desc">${esc(j.description || 'Kein Stellentext geladen. Bitte Originalanzeige öffnen.')}</div></details>
      <div class="row" style="margin-top:8px">
        ${on('2a') || on('3a') || on('3b') ? `<button class="btn small" data-act="apply">Bewerbung erstellen</button>` : ''}
        ${on('3a') ? `${safeUrl(j.directUrl) ? `<a class="btn small" href="${esc(j.directUrl)}" target="_blank" rel="noopener">Direkt beim Arbeitgeber</a>` : ''}${j.url ? `<a class="btn sec small" href="${esc(j.url)}" target="_blank" rel="noopener">Zur Originalanzeige</a>` : ''}${j.baUrl ? `<a class="btn sec small" href="${esc(j.baUrl)}" target="_blank" rel="noopener">Bei der Arbeitsagentur</a>` : ''}
        ${(j.applyOptions || []).filter(o => safeUrl(o.url) && o.url !== j.url && o.url !== j.directUrl).slice(0, 4).map(o => `<a class="btn sec small" href="${esc(o.url)}" target="_blank" rel="noopener">über ${esc(String(o.via).slice(0, 30))}</a>`).join('')}
        ${!safeUrl(j.directUrl) && S.settings.srv && on('1f') && j.company ? `<button class="btn sec small" data-act="direct">Direktlink suchen</button>` : `<a class="btn sec small" href="${careerSearchUrl(j)}" target="_blank" rel="noopener">Karriereseite suchen</a>`}` : ''}
        ${on('3c') ? `<button class="btn sec small" data-act="save">${tracked ? `Gemerkt ✓ (${esc(colOf(tracked.status).t)})` : 'Merken'}</button>` : ''}
        ${tracked ? '' : '<button class="btn sec small" data-act="dismiss" title="Stelle ausblenden">Nicht interessant</button>'}
      </div></div>`;
  }).join('') || '<p class="muted">Keine Stellen mit dieser Mindest-Passung.</p>';
  $$('#results .job').forEach(el => {
    const j = S.jobs.find(x => x.id === el.dataset.id);
    const a = $('[data-act="apply"]', el); if (a) a.onclick = () => { const t = S.tracker.find(x => x.id === j.id); if (t) return applyFromTracker(t); S.current = j; go('bewerbung'); autoTemplate(j); generateLetter(); };
    const s = $('[data-act="save"]', el); if (s) s.onclick = () => { if (S.tracker.find(t => t.id === j.id)) return go('tracker'); track(j, 'gemerkt'); toast('Gemerkt – unter „Übersicht“ findest du alle gemerkten Stellen'); renderResults(); };
    const dm = $('[data-act="dismiss"]', el); if (dm) dm.onclick = () => dismissJob(j);
    const ai = $('[data-act="aiscore"]', el); if (ai) ai.onclick = async () => { if (!aiReady()) return toast('KI ist nicht eingerichtet (Einstellungen)'); ai.disabled = true; const out = $('.ai-out', el); out.textContent = 'KI bewertet …';
      try { const r = await callAI('Du bewertest nüchtern, wie gut ein Bewerberprofil zu einer Stellenanzeige passt. Antworte nur mit JSON. Erfinde nichts.',
        `Stellenanzeige:\n${j.title} bei ${j.company}\n${(j.description || '').slice(0, 5000)}\n\nProfil:\nKompetenzen: ${S.profile.skills.join(', ')}\nBerufsjahre: ${S.profile.years}\nErfahrung:\n${S.profile.experience}\nAusbildung:\n${S.profile.education}\nSonstiges: ${S.profile.other}\n\nJSON: {"prozent":0-100,"begruendung":"2-3 Sätze","erfuellt":["..."],"fehlt":["..."],"tipp":"1 Satz für das Anschreiben"}`);
        const d = JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1));
        out.innerHTML = `<b>KI: ${esc(d.prozent)} %</b> – ${esc(d.begruendung)}<br>✓ ${esc((d.erfuellt || []).join(', '))}<br>✗ ${esc((d.fehlt || []).join(', '))}${d.tipp ? `<br>Tipp: ${esc(d.tipp)}` : ''}`; }
      catch (e) { out.textContent = 'KI-Fehler: ' + e.message; } ai.disabled = false; };
    const d = $('[data-act="direct"]', el); if (d) d.onclick = async () => { d.disabled = true; d.textContent = 'Suche Direktlink …';
      try { const r = (await getJSON(`${S.settings.srv.replace(/\/$/, '')}/direct?` + new URLSearchParams({ company: j.company, title: j.title, website: j.website || '' }), { direct: true, headers: S.settings.srvtok ? { 'x-bl-token': S.settings.srvtok } : {} })).result;
        if (r && safeUrl(r.url)) { j.directUrl = r.url; toast(r.kind === 'job' ? `Stelle direkt beim Arbeitgeber gefunden (${r.via})` : `Karriereseite des Arbeitgebers gefunden (${r.via})`); renderResults(); }
        else { d.textContent = 'Kein Direktlink gefunden'; window.open(careerSearchUrl(j), '_blank'); } }
      catch (e) { d.textContent = 'Fehler: ' + e.message; } };
  });
}
// Hauptportale + Branchen-Portale, die zum Beruf passen (ohne „weitere“)
const curType = () => ($('#f_type') && $('#f_type').value) || '1';
const portalLinksFor = t => { const ty = curType();
  if (ty === 'studium') return window.PORTAL_LINKS.filter(l => l[2] === 'studium');
  return window.PORTAL_LINKS.filter(([, , tag]) => (!tag && true) || (tag === 'ausbildung' && ty === '4') || (tag && !['mehr', 'ausbildung', 'studium'].includes(tag) && branchSites(t).includes(tag))); };
function renderPortalLinks() {
  const o = encodeURIComponent($('#f_where').value || S.profile.city || ''), r = $('#f_radius').value, terms = searchTerms();
  if (!terms.length) { $('#portalLinks').innerHTML = '<span class="small muted">Erst unter „Berufe“ einen Beruf anhaken.</span>'; return; }
  $('#portalLinks').innerHTML = terms.map((t, i) => `<div style="flex-basis:100%;margin-bottom:6px"><div class="small" style="margin-bottom:4px"><b>${esc(t)}</b> <button class="btn sec small" data-openall="${i}">alle öffnen</button></div><div class="row">${
    portalLinksFor(t).map(([n, f, tag]) => `<a class="btn ${tag && tag !== 'mehr' ? '' : 'sec '}small" target="_blank" rel="noopener" href="${esc(f(encodeURIComponent(t), o, r))}"${tag && tag !== 'mehr' ? ' title="Branchen-Portal passend zum Beruf"' : ''}>${esc(n)}</a>`).join('')}${
    curType() !== 'studium' && window.PORTAL_LINKS.some(l => l[2] === 'mehr') ? `<details style="flex-basis:100%"><summary class="small">weitere Portale</summary><div class="row" style="margin-top:4px">${window.PORTAL_LINKS.filter(l => l[2] === 'mehr').map(([n, f]) => `<a class="btn sec small" target="_blank" rel="noopener" href="${esc(f(encodeURIComponent(t), o, r))}">${esc(n)}</a>`).join('')}</div></details>` : ''}</div></div>`).join('');
  $$('#portalLinks [data-openall]').forEach(b => b.onclick = () => openAllPortals([terms[+b.dataset.openall]]));
}

/* ---------- Modul 2: Anschreiben ---------- */
const ADJ = { 'teamfähigkeit': 'teamorientiert', 'kommunikation': 'kommunikativ', 'zuverlässigkeit': 'zuverlässig', 'belastbarkeit': 'belastbar', 'selbstständig': 'selbstständig', 'flexibilität': 'flexibel', 'organisation': 'strukturiert', 'kundenorientierung': 'kundenorientiert', 'sorgfalt': 'sorgfältig', 'pünktlichkeit': 'pünktlich', 'lernbereitschaft': 'lernbereit', 'empathie': 'einfühlsam', 'problemlösung': 'lösungsorientiert', 'führung': 'verantwortungsbewusst' };
const joinDE = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1];
function letterVars(j) {
  const P = S.profile, cp = $('#contactPerson').value.trim();
  const e = j.explain || scoreJob(j).explain;
  const soft = S.profile.skills.map(s => ADJ[s.toLowerCase()]).filter(Boolean).slice(0, 3);
  const hard = e.matched.filter(s => !ADJ[s.toLowerCase()]).slice(0, 4).map(cap);
  const prof = P.skills.filter(s => !ADJ[s.toLowerCase()]).slice(0, 4).map(cap);
  const lastRole = ((P.experience || '').split('\n')[0] || '').replace(/^[^A-Za-zÄÖÜäöü]*((0?[1-9]|1[0-2])[./])?(19|20)\d{2}\s*(–|-|—|bis)\s*\S+\s*[:,]?\s*/i, '').split(/[,|;]/)[0].trim();
  const current = /heute|jetzt|aktuell|dato/i.test((P.experience || '').split('\n')[0] || '');
  const stelle = j.title.replace(/\s*\((m\/w\/d|w\/m\/d|m\/w|d\/m\/w|all genders?|gn\*?)\)/gi, '').replace(/\s{2,}/g, ' ').trim();
  const years = +P.years || 0;
  let erf = lastRole ? `${current ? 'Derzeit bin ich' : 'Zuletzt war ich'} als ${lastRole} tätig${years ? ` und bringe insgesamt ${years} Jahre Berufserfahrung mit` : ''}.` : years ? `Ich bringe ${years} Jahre Berufserfahrung mit.` : 'Ich bringe praktische Erfahrung und hohe Motivation mit.';
  const skillsSatz = hard.length ? `Die in Ihrer Anzeige genannten Anforderungen wie ${joinDE(hard)} bringe ich mit.` : prof.length ? `Zu meinen Stärken ${prof.length === 1 ? 'gehört' : 'gehören'} ${joinDE(prof)}.` : '';
  const av = P.available ? (/sofort/i.test(P.available) ? 'Ich kann ab sofort beginnen.' : `Ich kann ab ${P.available} beginnen.`) : '';
  const salaryAsked = /gehaltsvorstellung|gehaltswunsch/i.test(j.description || '') && +P.salary;
  return {
    stelle, arbeitgeber: j.company || 'Ihrem Unternehmen', name: P.name, telefon: P.phone,
    refnr_text: j.refnr ? `\nReferenznummer: ${j.refnr}` : '',
    anrede_ansprechpartner: /^frau\s/i.test(cp) ? ' ' + cp : /^herr\s/i.test(cp) ? 'r ' + cp : ' Damen und Herren',
    anrede_kurz: cp ? ' ' + cp : '',
    einstieg_satz: 'Die beschriebenen Aufgaben passen sehr gut zu meinen Erfahrungen und meinen beruflichen Zielen.',
    erfahrung_satz: erf, skills_satz: skillsSatz, skills_liste: joinDE(hard.length ? hard : prof) || 'Zuverlässigkeit und Lernbereitschaft',
    arbeitgeber_satz: j.company ? `Bei ${j.company} möchte ich meine Erfahrung gezielt einbringen und weiterentwickeln.` : '',
    softskills: joinDE(soft.length ? soft : ['zuverlässig', 'sorgfältig', 'teamorientiert']),
    verfuegbarkeit_satz: (av + (salaryAsked ? ` Meine Gehaltsvorstellung liegt bei ${(+P.salary * 12).toLocaleString('de-DE')} € brutto im Jahr.` : '')).trim(),
    ...schoolVars(P, stelle)
  };
}
/* Für Ausbildung/Praktikum: Schule, Praktika und Interessen aus dem Profil (ohne Erfindungen – fehlt etwas, bleibt der Satz leer) */
// Vorlage passend zur Angebotsart vorschlagen (nur wenn noch eine Standard-Vorlage gewählt ist)
function autoTemplate(j) {
  const sel = $('#tplSel'); if (!sel) return;
  const t = j.title + ' ' + (j.beruf || '');
  const want = /ausbild|azubi|auszubild|dual(es|er)? studi|lehrstelle/i.test(t) ? 'ausbildung' : /praktik|trainee|werkstudent/i.test(t) ? 'praktikum' : null;
  if (want && ['standard', 'kurz', 'individuell'].includes(sel.value) && [...sel.options].some(o => o.value === want)) { sel.value = want; toast(`Vorlage „${sel.options[sel.selectedIndex].text}“ gewählt – passend zur Anzeige`); }
}
function schoolVars(P, stelle) {
  const edu = String(P.education || '').split('\n').map(l => l.trim()).filter(Boolean);
  const exp = String(P.experience || '').split('\n').map(l => l.trim()).filter(Boolean);
  const cleanL = l => l.replace(/^[^A-Za-zÄÖÜäöü]*((0?[1-9]|1[0-2])[./])?(19|20)\d{2}\s*(–|-|—|bis)?\s*(\S*\d{4}|heute|jetzt|aktuell)?\s*[:,]?\s*/i, '').trim();
  const school = edu.find(l => /schule|gymnasium|abitur|realschul|hauptschul|mittlere reife|fachhochschulreife|gesamtschul|oberschul|msa|ebr|bbr/i.test(l));
  const current = school && /heute|jetzt|aktuell|voraussichtlich|\b20(2[5-9]|3\d)\b/i.test(school);
  // „2025: Schülerpraktikum, Elektro Schmidt GmbH“ → „in einem Schülerpraktikum bei Elektro Schmidt GmbH“
  const prakt = exp.filter(l => /praktikum|schnupper|ferienjob|nebenjob|minijob|ehrenamt/i.test(l)).map(cleanL).slice(0, 2).map(l => {
    const [a, ...rest] = l.split(/\s*[,–|]\s*/), b = rest.join(', ');
    const art = (a.match(/\S*(praktikum|ferienjob|nebenjob|minijob|ehrenamt)\S*/i) || [])[0];
    if (art && b) return `${/ehrenamt/i.test(art) ? 'im Ehrenamt' : 'in einem ' + art} bei ${b}`;
    return 'bei ' + l;
  });
  const name = school ? cleanL(school).replace(/\s*\(.*?\)\s*/g, ' ').trim().replace(/,\s*([A-ZÄÖÜ][\wäöüß-]+)$/, ' in $1') : '';
  const absch = school && (school.match(/(mittlere[rn]? (schulabschluss|reife)|abitur|fachhochschulreife|fachabitur|hauptschulabschluss|erweiterte[rn]? (berufsbildungsreife|hauptschulabschluss)|msa|ebr|bbr)/i) || [])[0];
  const jahr = school && (school.match(/voraussichtlich\s*(20\d\d)/i) || school.match(/\b(20\d\d)\s*\)?\s*$/) || [])[1];
  const abschW = absch ? absch.replace(/^mittlere[rn]?/i, 'Mittleren').replace(/^erweiterte[rn]?/i, 'erweiterten') : '';
  return {
    schule_satz: school ? (current ? `Zurzeit besuche ich die ${name}${abschW ? ` und mache ${jahr ? jahr + ' ' : 'bald '}${/abitur/i.test(abschW) ? 'das' : 'den'} ${abschW}` : ' und schließe sie in Kürze ab'}.` : `Meinen Schulabschluss${abschW ? ` (${abschW})` : ''} habe ich an der ${name} erworben.`) : '',
    praktikum_satz: prakt.length ? `Erste praktische Erfahrungen habe ich ${joinDE(prakt)} gesammelt.` : '',
    ausbildung_ziel: stelle.replace(/^(ausbildung|azubi|auszubildende?r?)\s*(zum|zur|als)?\s*/i, '').replace(/\s*[-–]?\s*ausbildung.*$/i, '').trim() || stelle
  };
}
function fillTemplate(tplKey, j) {
  if (tplKey === 'individuell') return buildLetter(j).text;
  const v = letterVars(j);
  return window.TEMPLATES[tplKey].text.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/  +/g, ' ').trim();
}
function generateLetter(variant = 0) {
  if (!S.current) return;
  if ($('#tplSel').value === 'individuell') { const r = buildLetter(S.current, typeof variant === 'number' ? variant : 0); $('#letter').value = r.text; rememberLetter(r); renderSources(r.src); }
  else { $('#letter').value = fillTemplate($('#tplSel').value, S.current); renderSources([]); }
  renderStyle();
}
async function improveAI(j, text) {
  const P = S.profile;
  return (await callAI('Du bist ein erfahrener Bewerbungsberater in Deutschland. Schreibe sachlich, konkret, ohne Floskeln, maximal eine Seite. Erfinde keine Fakten, Zahlen oder Qualifikationen; nutze nur Angaben aus Profil und Entwurf. Gib nur den Anschreibentext zurück (Betreffzeile, Anrede, Text, Grußformel, Name).',
    `Stelle: ${j.title} bei ${j.company} (${j.location})\nStellentext:\n${(j.description || '').slice(0, 5000)}\n\nProfil:\nKompetenzen: ${P.skills.join(', ')}\nErfahrung:\n${P.experience}\nAusbildung:\n${P.education}\nSonstiges: ${P.other}\nVerfügbar: ${P.available}\n\nEntwurf:\n${text}\n\nVerbessere den Entwurf passend zur Stelle.`)).trim();
}
function renderApplication() {
  const j = S.current;
  if (!j) { $('#appJob').innerHTML = '<p class="muted" style="margin:0">Wähle zuerst in der Stellenliste „Bewerbung erstellen“.</p>'; $('#applyActions').innerHTML = ''; return; }
  $('#appJob').innerHTML = `<div class="row" style="justify-content:space-between"><div><b>${esc(j.title)}</b><div class="small muted">${esc(j.company)} · ${esc(j.location)} · Passung ${j.score} %</div></div></div>`;
  $('#btnGen').closest('.card').classList.toggle('hidden', !on('2a'));
  const subj = `Bewerbung als ${letterVars(j).stelle}${j.refnr ? ' – Ref.-Nr. ' + j.refnr : ''}`;
  const acts = [];
  if (on('3b')) acts.push(j.email ? `<a class="btn small" id="mailBtn" href="#">E-Mail an ${esc(j.email)} öffnen</a>` : `<span class="small muted">Keine E-Mail-Adresse in der Anzeige gefunden.</span>`);
  if (on('3a')) { if (safeUrl(j.directUrl)) acts.push(`<a class="btn small" href="${esc(j.directUrl)}" target="_blank" rel="noopener">Direkt beim Arbeitgeber</a>`); if (j.url) acts.push(`<a class="btn sec small" href="${esc(j.url)}" target="_blank" rel="noopener">Zur Originalanzeige</a>`); if (j.baUrl) acts.push(`<a class="btn sec small" href="${esc(j.baUrl)}" target="_blank" rel="noopener">Bei der Arbeitsagentur</a>`); acts.push(`<a class="btn sec small" href="${careerSearchUrl(j)}" target="_blank" rel="noopener">Karriereseite suchen</a>`); }
  acts.push(`<button class="btn sec small" id="copyBtn">Text kopieren</button>`, `<button class="btn sec small" id="pdfLetter">Anschreiben als PDF</button>`, `<button class="btn sec small" id="pdfCV">Lebenslauf als PDF</button>`);
  if (on('3c')) acts.push(`<button class="btn sec small" id="sentBtn">Als versendet markieren</button>`);
  $('#applyActions').innerHTML = acts.join('');
  const mb = $('#mailBtn'); if (mb) mb.onclick = e => { e.preventDefault(); const body = $('#letter').value.replace(/^Bewerbung als.*\n+/, ''); location.href = `mailto:${j.email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body.slice(0, 1800))}`; if (on('3c')) track(j, 'versendet', 'E-Mail'); };
  $('#copyBtn').onclick = async () => { try { await navigator.clipboard.writeText($('#letter').value); toast('Kopiert'); } catch { $('#letter').select(); document.execCommand('copy'); toast('Kopiert'); } };
  $('#pdfLetter').onclick = () => printLetter(j, $('#letter').value);
  $('#pdfCV').onclick = printCV;
  const sb = $('#sentBtn'); if (sb) sb.onclick = () => { track(j, 'versendet', 'manuell'); toast('In der Übersicht gespeichert'); };
  if (!$('#letter').value && on('2a')) generateLetter();
}
function printLetter(j, text) {
  const P = S.profile;
  printHTML(`<div style="text-align:right">${esc(P.name)}<br>${esc(P.street)}<br>${esc(P.plz)} ${esc(P.city)}<br>${esc(P.phone)}<br>${esc(P.email)}</div>
    <div style="margin-top:18pt">${esc(j.company)}<br>${esc(j.location)}</div>
    <div style="text-align:right;margin:18pt 0">${esc(P.city)}, ${today()}</div>
    <div class="letter">${esc(text).replace(/^(Bewerbung als[^\n]*|Initiativbewerbung[^\n]*)/, '<b>$1</b>')}</div>`);
}

/* ---------- Modul 3c: Übersicht ---------- */
/* =====================================================================
   Modul 3c: Meine Bewerbungen – Board wie bei LinkedIn, Wiedervorlage, Sicherung
   ===================================================================== */
const STATUSES = ['gemerkt', 'in Arbeit', 'versendet', 'Eingangsbestätigung', 'Gespräch', 'Zusage', 'Absage', 'zurückgezogen', 'archiviert'];
const COLS = [
  { k: 'saved', t: 'Gemerkt', st: 'gemerkt', has: s => s === 'gemerkt' },
  { k: 'work', t: 'In Arbeit', st: 'in Arbeit', has: s => s === 'in Arbeit' },
  { k: 'applied', t: 'Beworben', st: 'versendet', has: s => /^versendet/.test(s) || s === 'Eingangsbestätigung' },
  { k: 'talk', t: 'Gespräch', st: 'Gespräch', has: s => s === 'Gespräch' },
  { k: 'offer', t: 'Angebot', st: 'Zusage', has: s => s === 'Zusage' },
  { k: 'arch', t: 'Archiv', st: 'archiviert', has: s => ['Absage', 'zurückgezogen', 'archiviert'].includes(s) }
];
const colOf = s => COLS.find(c => c.has(s || 'gemerkt')) || COLS[0];
const dayMs = 864e5, isoDay = d => new Date(d).toISOString().slice(0, 10), addDays = (n, from = Date.now()) => isoDay(from + n * dayMs);
// Bewerbungsfrist aus dem Stellentext („Bewerbungsfrist: 15.10.2026“, „bewerben Sie sich bis zum 15.10.2026“)
const MONATE = { januar: 1, jan: 1, februar: 2, feb: 2, 'märz': 3, maerz: 3, mrz: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12 };
function findDeadline(text, now = Date.now()) {
  const t = String(text || '');
  const lead = '(?:bewerbungsfrist|bewerbungsschluss|einsendeschluss|ausschreibungsfrist|ende der bewerbungsfrist|bewerbungen?[^.]{0,50}?bis(?: zum| spätestens)?|bewerben[^.]{0,50}?bis(?: zum| spätestens)?|bis spätestens|spätestens bis(?: zum)?|frist)(?:\\s*(?:ist|endet|läuft|der|die|am|zum|ab|:)\\s*){0,3}\\s*';
  let m = t.match(new RegExp(lead + '(\\d{1,2})\\.\\s?(\\d{1,2})\\.\\s?(20\\d{2}|\\d{2})?', 'i')), day, mon, year;
  if (m) [day, mon, year] = [+m[1], +m[2], m[3]];
  else if ((m = t.match(new RegExp(lead + '(\\d{1,2})\\.?\\s*(' + Object.keys(MONATE).join('|') + ')\\.?\\s*(20\\d{2})?', 'i')))) [day, mon, year] = [+m[1], MONATE[m[2].toLowerCase()], m[3]];
  else return '';
  if (!(mon >= 1 && mon <= 12 && day >= 1 && day <= 31)) return '';
  let y = year ? (String(year).length === 2 ? 2000 + +year : +year) : new Date(now).getFullYear();
  let d = new Date(Date.UTC(y, mon - 1, day));
  if (!year && d.getTime() < now - 30 * dayMs) d = new Date(Date.UTC(y + 1, mon - 1, day));   // ohne Jahr: nächstes Vorkommen
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
// Beim Merken die ganze Anzeige sichern – damit später noch ein passendes Anschreiben möglich ist, auch wenn die Anzeige offline ist
function jobSnapshot(j) {
  const keep = ['id', 'title', 'company', 'location', 'source', 'sources', 'url', 'baUrl', 'directUrl', 'applyOptions', 'email', 'score', 'refnr', 'beruf', 'published', 'salaryMin', 'salaryMax', 'worktime', 'remote', 'lat', 'lon', 'dist', 'foundBy', 'kind', 'website'];
  const o = {}; keep.forEach(k => { if (j[k] !== undefined && j[k] !== null && j[k] !== '') o[k] = j[k]; });
  o.description = String(j.description || '').slice(0, 6000);
  return o;
}
function track(j, status, channel = '') {
  let t = S.tracker.find(x => x.id === j.id);
  if (!t) {
    t = Object.assign(jobSnapshot(j), { url: j.url || j.baUrl || '', created: new Date().toISOString(), note: '', history: [] });
    t.deadline = findDeadline(j.description);
    S.tracker.unshift(t);
  } else if ((j.description || '').length > (t.description || '').length) { Object.assign(t, jobSnapshot(j), { url: t.url || j.url || j.baUrl || '' }); if (!t.deadline) t.deadline = findDeadline(j.description); }   // bessere Daten nachtragen
  setStatus(t, status, channel);
  learnFrom(j, status);
}
function setStatus(t, status, channel = '') {
  if (t.status === status && !channel) return saveTracker();
  t.history = t.history || []; t.history.push({ s: status, at: new Date().toISOString() });
  t.status = status; if (channel) t.channel = channel;
  if (status.startsWith('versendet')) { t.sent = t.sent || new Date().toISOString(); if (!t.followUp) t.followUp = addDays(+S.settings.followDays || 14); }
  if (status === 'Gespräch' && !t.followUp) t.followUp = addDays(7);
  if (['Absage', 'zurückgezogen', 'archiviert', 'Zusage'].includes(status)) t.followUp = '';
  saveTracker();
}
let _bakTimer = null;
function saveTracker() {
  store.set('tracker', S.tracker);
  if (S.local) { clearTimeout(_bakTimer); _bakTimer = setTimeout(() => autoBackup(), 4000); }   // Programm auf dem PC: Sicherung auch als Datei
  updateDueBadge();
}
// Fällige Wiedervorlagen und ablaufende Fristen
function dueItems() {
  const today = isoDay(Date.now()), soon = addDays(3);
  return S.tracker.filter(t => !colOf(t.status).k.match(/arch|offer/) && ((t.followUp && t.followUp <= today) || (t.deadline && t.deadline >= today && t.deadline <= soon && ['saved', 'work'].includes(colOf(t.status).k))));
}
function updateDueBadge() {
  const n = dueItems().length;
  for (const b of [$('#dueBanner'), $('#dueBanner2')]) if (b) { b.classList.toggle('hidden', !n); b.innerHTML = n ? `<b>${n} Erinnerung${n > 1 ? 'en' : ''} fällig</b> – ${dueItems().slice(0, 3).map(t => esc(t.title)).join(', ')}${n > 3 ? ' …' : ''}. <a href="#tracker">Zur Übersicht</a>` : ''; }
  const nb = document.querySelector('nav.bottom button[data-view="tracker"]'); if (nb) nb.dataset.badge = n ? String(n) : '';
}
function notifyDue() {   // Mitteilung beim Öffnen der App (nur wenn erlaubt)
  const d = dueItems(); if (!d.length || !S.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const key = isoDay(Date.now()); if (store.get('notified', '') === key) return; store.set('notified', key);
  try { new Notification('Bewerbungslotse', { body: `${d.length} Erinnerung(en): ${d.slice(0, 3).map(t => t.title).join(', ')}`, icon: 'icon-192.png' }); } catch {}
}
// Termin als Kalenderdatei (.ics) – Erinnerung auch, wenn die App geschlossen ist
function icsFor(t, kind) {
  const day = (kind === 'deadline' ? t.deadline : t.followUp).replace(/-/g, ''), next = isoDay(new Date(kind === 'deadline' ? t.deadline : t.followUp).getTime() + dayMs).replace(/-/g, '');
  const txt = s => String(s || '').replace(/[\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const title = kind === 'deadline' ? `Bewerbungsfrist: ${t.title}` : `Bewerbung nachfassen: ${t.title}`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bewerbungslotse//DE', 'BEGIN:VEVENT', `UID:${hash(t.id + kind)}@bewerbungslotse`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${txt(title)}`, `DESCRIPTION:${txt(`${t.company} · ${t.location}\n${t.url || ''}\n${t.note || ''}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15H', 'ACTION:DISPLAY', `DESCRIPTION:${txt(title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  download(`${kind === 'deadline' ? 'frist' : 'wiedervorlage'}-${(t.company || 'stelle').replace(/[^\wäöüÄÖÜß-]+/g, '-').slice(0, 30)}.ics`, ics, 'text/calendar');
}
// Aus einer gemerkten Stelle direkt die Bewerbung erstellen
function applyFromTracker(t) {
  const j = S.jobs.find(x => x.id === t.id) || Object.assign({}, t);
  if (!j.explain) scoreJob(j, S.filters && S.filters.src ? S.filters : {});
  S.current = j; if (colOf(t.status).k === 'saved') setStatus(t, 'in Arbeit');
  go('bewerbung'); autoTemplate(j);
  if (t.letter) { $('#letter').value = t.letter; toast('Gespeicherter Entwurf geladen'); } else generateLetter();
}
function saveLetterDraft() {   // Entwurf zur Stelle merken (wird beim Bearbeiten automatisch gespeichert)
  const j = S.current; if (!j) return; const t = S.tracker.find(x => x.id === j.id); if (!t) return;
  t.letter = $('#letter').value.slice(0, 8000); store.set('tracker', S.tracker);
}
let TRACK_VIEW = store.get('trackView', 'board');
function renderTracker() {
  const T = S.tracker, q = norm($('#trackFilter') ? $('#trackFilter').value : '');
  $$('#trackViewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === TRACK_VIEW));
  const vis = T.filter(t => !q || norm(`${t.title} ${t.company} ${t.location} ${t.note}`).includes(q));
  const today = isoDay(Date.now());
  const badge = t => [t.followUp ? `<span class="chip ${t.followUp <= today ? 'miss' : ''}" title="Wiedervorlage">⏰ ${new Date(t.followUp).toLocaleDateString('de-DE')}</span>` : '',
    t.deadline ? `<span class="chip ${t.deadline <= addDays(3) && t.deadline >= today ? 'miss' : ''}" title="Bewerbungsfrist">Frist ${new Date(t.deadline).toLocaleDateString('de-DE')}</span>` : ''].join('');
  const since = t => { const h = (t.history || []).slice(-1)[0]; const d = Math.floor((Date.now() - new Date(h ? h.at : t.created)) / dayMs); return d <= 0 ? 'heute' : d === 1 ? 'seit 1 Tag' : `seit ${d} Tagen`; };
  if (!T.length) { $('#trackBoard').innerHTML = '<p class="muted">Noch keine Einträge. In der Stellenliste auf „Merken“ tippen.</p>'; $('#trackTable').innerHTML = ''; updateDueBadge(); return; }
  $('#trackBoard').classList.toggle('hidden', TRACK_VIEW !== 'board'); $('#trackTableCard').classList.toggle('hidden', TRACK_VIEW !== 'list');
  if (TRACK_VIEW === 'board') {
    $('#trackBoard').innerHTML = COLS.map(c => { const items = vis.filter(t => colOf(t.status).k === c.k);
      return `<div class="kcol" data-col="${c.k}"><div class="khead">${c.t} <span class="muted">${items.length}</span></div>${items.map(t => `
        <div class="kcard" draggable="true" data-id="${esc(t.id)}">
          <div class="ktitle">${esc(t.title)}</div><div class="small muted">${esc(t.company)}${t.location ? ' · ' + esc(t.location) : ''}${t.score != null ? ` · ${t.score} %` : ''}</div>
          <div class="small muted">${esc(t.status)} ${since(t)}</div><div class="chips" style="margin-top:4px">${badge(t)}</div>
          <div class="kact"><button class="btn sec small" data-mv="-1" aria-label="nach links">←</button><button class="btn sec small" data-open aria-label="Details">Details</button><button class="btn sec small" data-mv="1" aria-label="nach rechts">→</button></div>
        </div>`).join('') || '<div class="small muted kempty">hierher ziehen</div>'}</div>`; }).join('');
    // Ziehen und Ablegen (Maus) – auf dem Handy die Pfeile
    $$('#trackBoard .kcard').forEach(el => { el.ondragstart = e => { e.dataTransfer.setData('text/plain', el.dataset.id); el.classList.add('drag'); }; el.ondragend = () => el.classList.remove('drag'); });
    $$('#trackBoard .kcol').forEach(col => { col.ondragover = e => { e.preventDefault(); col.classList.add('over'); }; col.ondragleave = () => col.classList.remove('over');
      col.ondrop = e => { e.preventDefault(); col.classList.remove('over'); const t = T.find(x => x.id === e.dataTransfer.getData('text/plain')); const c = COLS.find(x => x.k === col.dataset.col); if (t && c && colOf(t.status).k !== c.k) { setStatus(t, c.st); renderTracker(); } }; });
    $$('#trackBoard [data-mv]').forEach(b => b.onclick = () => { const t = T.find(x => x.id === b.closest('.kcard').dataset.id); const i = COLS.indexOf(colOf(t.status)) + +b.dataset.mv; if (i >= 0 && i < COLS.length) { setStatus(t, COLS[i].st); renderTracker(); } });
    $$('#trackBoard [data-open]').forEach(b => b.onclick = () => openTrackDetail(T.find(x => x.id === b.closest('.kcard').dataset.id)));
  } else {
    $('#trackTable').innerHTML = `<tr><th>Datum</th><th>Stelle</th><th>Passung</th><th>Status</th><th>Erinnerung</th><th>Notiz</th><th></th></tr>` + vis.map(t => { const i = T.indexOf(t); return `<tr>
      <td>${new Date(t.sent || t.created).toLocaleDateString('de-DE')}</td>
      <td><b>${esc(t.title)}</b><br><span class="muted">${esc(t.company)} · ${esc(t.location)}</span>${t.url ? `<br><a href="${esc(t.url)}" target="_blank" rel="noopener">Anzeige</a>` : ''} · <a href="#" data-open="${i}">Details</a></td>
      <td>${t.score ?? ''} %</td>
      <td><select data-i="${i}" class="tStatus">${STATUSES.map(s => `<option ${t.status === s || (s === 'versendet' && t.status?.startsWith('versendet')) ? 'selected' : ''}>${s}</option>`).join('')}</select>${t.channel ? `<div class="small muted">${esc(t.channel)}</div>` : ''}</td>
      <td>${badge(t)}</td>
      <td><input type="text" data-i="${i}" class="tNote" value="${esc(t.note)}"></td>
      <td><button class="btn danger small" data-del="${i}" aria-label="löschen">×</button></td></tr>`; }).join('');
    $$('.tStatus').forEach(s => s.onchange = () => { setStatus(T[+s.dataset.i], s.value); renderTracker(); });
    $$('.tNote').forEach(s => s.onchange = () => { T[+s.dataset.i].note = s.value; saveTracker(); });
    $$('#trackTable [data-del]').forEach(b => b.onclick = () => { if (confirm('Eintrag löschen?')) { T.splice(+b.dataset.del, 1); saveTracker(); renderTracker(); } });
    $$('#trackTable [data-open]').forEach(a => a.onclick = e => { e.preventDefault(); openTrackDetail(T[+a.dataset.open]); });
  }
  updateDueBadge();
}
function openTrackDetail(t) {
  if (!t) return; const d = $('#trackDetail');
  d.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(t.title)}</h3><button class="btn sec small" data-close>Schließen</button></div>
    <p class="small muted">${esc(t.company)} · ${esc(t.location)} · ${esc(t.source || '')}${t.score != null ? ` · Passung ${t.score} %` : ''}</p>
    <div class="grid">
      <div><label>Status</label><select id="tdStatus">${STATUSES.map(s => `<option ${t.status === s || (s === 'versendet' && t.status?.startsWith('versendet')) ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>Wiedervorlage</label><input type="date" id="tdFollow" value="${esc(t.followUp || '')}"></div>
      <div><label>Bewerbungsfrist</label><input type="date" id="tdDeadline" value="${esc(t.deadline || '')}"></div>
      <div><label>Ansprechpartner / Kontakt</label><input type="text" id="tdContact" value="${esc(t.contact || t.email || '')}"></div>
    </div>
    <label>Notiz</label><textarea id="tdNote" style="min-height:70px">${esc(t.note || '')}</textarea>
    <div class="row" style="margin-top:8px">
      <button class="btn small" data-apply>${t.letter ? 'Bewerbung weiter bearbeiten' : 'Jetzt bewerben'}</button>
      ${safeUrl(t.directUrl) ? `<a class="btn sec small" href="${esc(t.directUrl)}" target="_blank" rel="noopener">Direkt beim Arbeitgeber</a>` : ''}${t.url ? `<a class="btn sec small" href="${esc(t.url)}" target="_blank" rel="noopener">Anzeige öffnen</a>` : ''}
      ${t.followUp ? '<button class="btn sec small" data-ics="follow">Wiedervorlage in Kalender</button>' : ''}${t.deadline ? '<button class="btn sec small" data-ics="deadline">Frist in Kalender</button>' : ''}
      <button class="btn danger small" data-delete>Löschen</button>
    </div>
    <details style="margin-top:8px"><summary class="small">Gespeicherter Stellentext${t.description ? '' : ' (keiner – Anzeige war ohne Text)'}</summary><div class="desc">${esc(t.description || '')}</div></details>
    ${t.letter ? `<details><summary class="small">Gespeicherter Anschreiben-Entwurf</summary><div class="desc">${esc(t.letter)}</div></details>` : ''}
    <details><summary class="small">Verlauf</summary><ul class="small">${(t.history || []).map(h => `<li>${new Date(h.at).toLocaleString('de-DE')}: ${esc(h.s)}</li>`).join('') || '<li>–</li>'}</ul></details></div>`;
  d.classList.remove('hidden'); d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const upd = () => { t.followUp = $('#tdFollow').value; t.deadline = $('#tdDeadline').value; t.note = $('#tdNote').value; t.contact = $('#tdContact').value; saveTracker(); renderTracker(); };
  ['#tdFollow', '#tdDeadline', '#tdNote', '#tdContact'].forEach(s => $(s).onchange = upd);
  $('#tdStatus').onchange = () => { setStatus(t, $('#tdStatus').value); renderTracker(); openTrackDetail(t); };
  $('[data-close]', d).onclick = () => d.classList.add('hidden');
  $('[data-apply]', d).onclick = () => applyFromTracker(t);
  $$('[data-ics]', d).forEach(b => b.onclick = () => icsFor(t, b.dataset.ics));
  $('[data-delete]', d).onclick = () => { if (confirm('Eintrag löschen?')) { S.tracker.splice(S.tracker.indexOf(t), 1); saveTracker(); d.classList.add('hidden'); renderTracker(); } };
}

/* ---------- Sicherung und Wiederherstellung ---------- */
const BACKUP_KEYS = ['mods', 'profile', 'cvText', 'cvQuality', 'zeugnisse', 'tracker', 'imported', 'filters', 'letterLog', 'learn', 'dismissed', 'trackView'];
const SECRET_KEYS = ['aikey', 'azkey', 'jooble', 'srvtok', 'hook', 'azid'];
function backupData() {
  const d = { app: 'Bewerbungslotse', version: 2, created: new Date().toISOString() };
  BACKUP_KEYS.forEach(k => { const v = store.get(k, undefined); if (v !== undefined) d[k] = v; });
  d.settings = Object.assign({}, S.settings); SECRET_KEYS.forEach(k => delete d.settings[k]);   // Schlüssel und Passwörter nie mitsichern
  return d;
}
function exportBackup() { download(`bewerbungslotse-sicherung-${isoDay(Date.now())}.json`, JSON.stringify(backupData(), null, 1), 'application/json'); store.set('lastBackup', new Date().toISOString()); }
async function importBackup(file) {
  let d; try { d = JSON.parse(await file.text()); } catch { return toast('Datei ist keine gültige Sicherung'); }
  if (!d || (d.app !== 'Bewerbungslotse' && !d.profile && !d.tracker)) return toast('Datei ist keine Bewerbungslotse-Sicherung');
  const merge = confirm(`Sicherung vom ${d.created ? new Date(d.created).toLocaleString('de-DE') : '(unbekannt)'} mit ${(d.tracker || []).length} Bewerbungen.\n\nOK = mit den vorhandenen Daten ZUSAMMENFÜHREN (nichts geht verloren)\nAbbrechen = weitere Auswahl`);
  if (!merge && !confirm('Vorhandene Daten durch die Sicherung ERSETZEN?')) return;
  if (merge) {
    const byId = new Map(S.tracker.map(t => [t.id, t]));
    (d.tracker || []).forEach(t => { const o = byId.get(t.id); if (!o) S.tracker.push(t); else if ((t.history || []).length > (o.history || []).length) Object.assign(o, t); });
    store.set('tracker', S.tracker);
    if (d.imported) { const ids = new Set(S.imported.map(j => j.id)); store.set('imported', S.imported.concat(d.imported.filter(j => !ids.has(j.id))).slice(0, 500)); }
    if (d.zeugnisse) { const names = new Set(S.zeugnisse.map(z => z.name + z.text.length)); store.set('zeugnisse', S.zeugnisse.concat(d.zeugnisse.filter(z => !names.has(z.name + z.text.length)))); }
    ['profile', 'cvText'].forEach(k => { if (d[k] && !store.get(k, null)) store.set(k, d[k]); });
    if (d.learn) store.set('learn', d.learn);
  } else {
    BACKUP_KEYS.forEach(k => { if (d[k] !== undefined) store.set(k, d[k]); });
    if (d.settings) { const keep = {}; SECRET_KEYS.forEach(k => { if (S.settings[k]) keep[k] = S.settings[k]; }); store.set('settings', Object.assign({}, d.settings, keep)); }
  }
  toast('Sicherung übernommen – wird neu geladen …'); await idb.flush(); setTimeout(() => location.reload(), 600);
}
// Programm auf dem PC: automatische Sicherung als Datei im Datenordner (schützt vor gelöschten Browserdaten)
async function autoBackup() {
  if (!S.local || (!S.tracker.length && !S.profile.name && !S.cvText)) return;   // nie eine leere Sicherung schreiben
  try { await fetch(`${location.origin}/backup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backupData()) }); store.set('lastAutoBackup', new Date().toISOString()); } catch {}
}
async function offerRestore() {   // Browserdaten leer, aber Sicherung auf dem PC vorhanden → anbieten
  if (!S.local || S.tracker.length || S.profile.name) return;
  try { const r = await fetch(`${location.origin}/backup`); if (!r.ok) return; const d = await r.json();
    if ((d.tracker || []).length || (d.profile && d.profile.name)) {
      if (confirm(`Auf diesem PC gibt es eine automatische Sicherung vom ${new Date(d.created).toLocaleString('de-DE')} (${(d.tracker || []).length} Bewerbungen). Wiederherstellen?`)) {
        BACKUP_KEYS.forEach(k => { if (d[k] !== undefined) store.set(k, d[k]); }); if (d.settings) store.set('settings', Object.assign({}, S.settings, d.settings)); await idb.flush(); location.reload(); } } } catch {}
}

/* ---------- Lernen aus deinem Verhalten (optional, Einstellungen) ----------
   Merken, Bewerben, Gespräch → Merkmale der Stelle werden positiv gewichtet; „Nicht interessant“ → negativ.
   Merkmale: Wörter im Titel, Firma, Quelle, Arbeitszeit, Entfernungsbereich. Wirkung auf die Passung: höchstens ±15 Punkte.
   Alles bleibt auf dem Gerät; ausgeschaltet wird nichts gesammelt. */
const LEARN_SIGNAL = { gemerkt: 1, 'in Arbeit': 1.5, versendet: 2, 'Gespräch': 3, 'Zusage': 3, dismiss: -2, 'zurückgezogen': -1 };
const LEARN_STOP = new Set(['m', 'w', 'd', 'f', 'x', 'mwd', 'und', 'oder', 'mit', 'für', 'fuer', 'der', 'die', 'das', 'in', 'im', 'als', 'zum', 'zur', 'bei', 'ab', 'sofort', 'gmbh', 'ag', 'kg', 'mbh', 'co', 'vollzeit', 'teilzeit', 'job', 'stelle', 'moeglich', 'möglich', 'gesucht', 'bereich', 'unbefristet', 'befristet', 'minijob', 'junior', 'senior']);
const LEARN_LAB = {};   // Merkmal → lesbares Wort (für die Anzeige)
function jobFeatures(j) {
  String(j.title || '').split(/[^\p{L}\p{N}]+/u).forEach(w => { const k = 't:' + norm(w).slice(0, 10); if (w.length > 2 && !LEARN_LAB[k]) LEARN_LAB[k] = w; });
  const f = new Set(norm(j.title).split(/[^a-z0-9äöüß]+/).filter(w => w.length > 2 && !LEARN_STOP.has(w)).map(w => 't:' + w.slice(0, 10)));
  if (j.company) { const k = 'c:' + norm(j.company).replace(/\b(gmbh|ag|kg|mbh|se|co)\b/g, '').trim().slice(0, 30); f.add(k); LEARN_LAB[k] = LEARN_LAB[k] || j.company; }
  if (j.worktime) f.add('w:' + j.worktime);
  if (j.dist != null) f.add('d:' + (j.dist <= 10 ? '0-10' : j.dist <= 25 ? '10-25' : j.dist <= 50 ? '25-50' : '50+'));
  return [...f];
}
function learnFrom(j, status) {
  if (!S.settings.learn) return;
  const sig = LEARN_SIGNAL[status] ?? (String(status).startsWith('versendet') ? 2 : 0); if (!sig) return;
  const L = store.get('learn', { w: {}, n: 0 });
  L.lab = L.lab || {};
  jobFeatures(j).forEach(k => { L.w[k] = Math.max(-6, Math.min(6, (L.w[k] || 0) * 0.97 + sig * 0.5)); if (LEARN_LAB[k]) L.lab[k] = LEARN_LAB[k]; });
  L.n++; store.set('learn', L);
}
function learnBonus(j) {
  if (!S.settings.learn) return null;
  const L = store.get('learn', null); if (!L || L.n < 3) return null;   // erst nach ein paar Rückmeldungen
  const fs = jobFeatures(j), parts = fs.map(k => [k, L.w[k] || 0]).filter(x => x[1]);
  if (!parts.length) return null;
  const raw = parts.reduce((a, x) => a + x[1], 0);
  return { points: Math.round(Math.max(-15, Math.min(15, raw * 1.5))), top: parts.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([k, v]) => `${learnLabel(k)} ${v > 0 ? '+' : '−'}`) };
}
function learnLabel(k) {
  const L = store.get('learn', {}), v = (L.lab && L.lab[k]) || LEARN_LAB[k] || k.slice(2);
  return { t: `„${v}“`, c: `Firma ${v}`, w: WT[k.slice(2)] || v, d: `${k.slice(2)} km` }[k[0]] || v;
}
function renderLearn() {
  const out = $('#learnOut'); if (!out) return;
  const L = store.get('learn', { w: {}, n: 0 });
  const top = Object.entries(L.w).sort((a, b) => b[1] - a[1]), pos = top.filter(x => x[1] > 0.4).slice(0, 8), neg = top.filter(x => x[1] < -0.4).slice(-6).reverse();
  out.innerHTML = `${L.n} Rückmeldungen gelernt.${L.n < 3 ? ' Wirkt ab 3 Rückmeldungen.' : ''}${pos.length ? `<br>Bevorzugt: ${pos.map(([k]) => esc(learnLabel(k))).join(', ')}` : ''}${neg.length ? `<br>Eher nicht: ${neg.map(([k]) => esc(learnLabel(k))).join(', ')}` : ''}`;
}
function dismissJob(j) {
  const D = store.get('dismissed', []); if (!D.includes(j.id)) { D.unshift(j.id); store.set('dismissed', D.slice(0, 2000)); }
  learnFrom(j, 'dismiss');
  S.jobs = S.jobs.filter(x => x.id !== j.id); renderResults(); toast('Ausgeblendet' + (S.settings.learn ? ' – ähnliche Stellen werden künftig etwas niedriger bewertet' : ''));
}
function initTracker() {
  $$('#trackViewSeg button').forEach(b => b.onclick = () => { TRACK_VIEW = b.dataset.v; store.set('trackView', TRACK_VIEW); renderTracker(); });
  const f = $('#trackFilter'); if (f) f.oninput = () => renderTracker();
  $('#btnBackup').onclick = exportBackup; $('#btnBackup2').onclick = exportBackup;
  $('#restoreFile').onchange = e => e.target.files[0] && importBackup(e.target.files[0]);
  $('#restoreFile2').onchange = e => e.target.files[0] && importBackup(e.target.files[0]);
  const n = $('#s_notify'); if (n) { n.checked = !!S.settings.notify; n.onchange = async () => { if (n.checked && 'Notification' in window && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { n.checked = false; toast('Mitteilungen wurden nicht erlaubt'); } } S.settings.notify = n.checked; store.set('settings', S.settings); }; }
  const fd = $('#s_followDays'); if (fd) { fd.value = S.settings.followDays || 14; fd.onchange = () => { S.settings.followDays = Math.max(1, Math.min(60, +fd.value || 14)); store.set('settings', S.settings); }; }
  [['#s_robotsFirms', 'robotsFirms', true], ['#s_robotsSearch', 'robotsSearch', false]].forEach(([id, k, def]) => { const c = $(id); if (!c) return; c.checked = S.settings[k] ?? def; c.onchange = () => { S.settings[k] = c.checked; store.set('settings', S.settings); }; });
  const l = $('#s_learn'); if (l) { l.checked = !!S.settings.learn; l.onchange = () => { S.settings.learn = l.checked; store.set('settings', S.settings); renderLearn(); toast(l.checked ? 'Lernen eingeschaltet – wirkt ab 3 Rückmeldungen' : 'Lernen ausgeschaltet – Bewertung wieder ohne deine Vorlieben'); if (S.jobs.length) { S.jobs.forEach(j => scoreJob(j)); renderResults(); } }; }
  const lr = $('#learnReset'); if (lr) lr.onclick = () => { if (confirm('Gelernte Vorlieben löschen?')) { store.set('learn', { w: {}, n: 0 }); renderLearn(); if (S.jobs.length) { S.jobs.forEach(j => scoreJob(j)); renderResults(); } } };
  const dr = $('#dismissReset'); if (dr) dr.onclick = () => { store.set('dismissed', []); toast('Ausgeblendete Stellen werden wieder angezeigt'); };
  const last = store.get('lastBackup', null), lb = $('#lastBackup'); if (lb) lb.textContent = last ? `Letzte Sicherung: ${new Date(last).toLocaleDateString('de-DE')}` : 'Noch keine Sicherung erstellt.';
  $('#letter').addEventListener('input', () => { clearTimeout(window._ld); window._ld = setTimeout(saveLetterDraft, 800); });
  renderLearn(); updateDueBadge(); setTimeout(notifyDue, 1500);
}
function exportCSV() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Datum','Stelle','Arbeitgeber','Ort','Quelle','Referenznummer','Passung %','Status','Weg','Link','Notiz']]
    .concat(S.tracker.map(t => [new Date(t.sent || t.created).toLocaleDateString('de-DE'), t.title, t.company, t.location, t.source, t.refnr, t.score, t.status, t.channel || '', t.url, t.note]));
  download('bewerbungen.csv', '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv');
}
function download(name, content, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* ---------- Modul 3d: Automatischer Versand ---------- */
async function runAuto() {
  const min = +$('#a_min').value || 80, max = +$('#a_max').value || 5, dry = $('#a_dry').checked, confirmEach = $('#a_confirm').checked, useAI = $('#a_ai').checked && aiReady();
  const excl = $('#a_excl').value.split(',').map(s => norm(s.trim())).filter(Boolean);
  const log = $('#autoLog'), aprog = t => $('#autoProgress').textContent = t;
  if (!dry && !S.settings.hook) return toast('Für echten Versand zuerst Webhook in den Einstellungen eintragen');
  if (!S.profile.name || !S.profile.email) return toast('Bitte Name und E-Mail im Profil eintragen');
  if (!S.jobs.length) { aprog('Suche läuft …'); await runSearch(); }
  const sentIds = new Set(S.tracker.filter(t => (t.status || '').startsWith('versendet')).map(t => t.id));
  const cand = sortJobs(S.jobs).filter(j => j.score >= min && j.email && !sentIds.has(j.id) && !excl.some(x => norm(j.company + ' ' + j.title).includes(x))).slice(0, max);
  const noMail = S.jobs.filter(j => j.score >= min && !j.email).length;
  log.innerHTML = `<div class="notice info small">${cand.length} Stelle(n) erfüllen die Regeln (≥ ${min} %, E-Mail vorhanden, noch nicht beworben). ${noMail} weitere passende Stelle(n) ohne E-Mail-Adresse – dort bitte manuell über den Link bewerben.</div>`;
  let n = 0;
  for (const j of cand) {
    aprog(`${++n}/${cand.length} …`);
    let text = fillTemplate($('#a_tpl').value, j);
    if (useAI) { try { text = await aiLetter(j, text); } catch (e) { text += ''; } }
    const subj = `Bewerbung als ${letterVars(j).stelle}${j.refnr ? ' – Ref.-Nr. ' + j.refnr : ''}`;
    const box = document.createElement('div'); box.className = 'card';
    box.innerHTML = `<b>${esc(j.title)}</b> · ${esc(j.company)} · ${j.score} %<div class="small muted">an ${esc(j.email)} · Betreff: ${esc(subj)}</div><details><summary class="small">Text ansehen</summary><div class="desc" style="white-space:pre-wrap">${esc(text)}</div></details><div class="small res"></div>`;
    log.appendChild(box);
    const res = $('.res', box);
    if (dry) { res.textContent = 'Testmodus: nicht gesendet.'; continue; }
    if (confirmEach && !confirm(`Bewerbung an ${j.company} (${j.email}) jetzt senden?`)) { res.textContent = 'Übersprungen.'; continue; }
    try {
      const r = await fetch(S.settings.hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        to: j.email, subject: subj, text: text.replace(/^Bewerbung als.*\n+/, ''), replyTo: S.profile.email,
        applicant: { name: S.profile.name, email: S.profile.email, phone: S.profile.phone }, job: { id: j.id, title: j.title, company: j.company, location: j.location, url: j.url || j.baUrl, refnr: j.refnr || '', score: j.score } }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      track(j, 'versendet', 'automatisch (Webhook)'); res.innerHTML = '<span style="color:var(--ok)">An Webhook übergeben ✓</span>';
    } catch (e) { res.innerHTML = `<span style="color:var(--bad)">Fehler: ${esc(e.message)}</span>`; }
    await sleep(800);
  }
  aprog('Fertig.');
}

/* ---------- KI (optional) ---------- */
async function callAI(system, user) {
  const s = S.settings;
  if (s.aiprov === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': s.aikey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: s.aimodel, max_tokens: 2000, system, messages: [{ role: 'user', content: user }] }) });
    const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
    return j.content.map(c => c.text || '').join('');
  }
  const base = s.aiprov === 'openai' ? 'https://api.openai.com/v1' : (s.aiurl || '').replace(/\/$/, '');
  const r = await fetch(base + '/chat/completions', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, s.aikey ? { authorization: 'Bearer ' + s.aikey } : {}),
    body: JSON.stringify({ model: s.aimodel, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
  const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
  return j.choices[0].message.content;
}

/* ---------- Einstellungen ---------- */
const SF = ['proxy','azid','azkey','aiprov','aimodel','aikey','aiurl','hook','srv','srvtok','jooble','joohost'];
function fillSettings() { SF.forEach(k => $('#s_' + k).value = S.settings[k] || ''); $('#s_aion').checked = !!S.settings.aion; }
function saveSettings() { SF.forEach(k => S.settings[k] = $('#s_' + k).value.trim()); S.settings.aion = $('#s_aion').checked; store.set('settings', S.settings); toast('Einstellungen gespeichert'); }

/* ---------- Start ---------- */
function init() {
  renderModules(); fillProfileForm(); fillSettings(); applyFilterForm(); applyModuleVisibility();
  const tplOpts = Object.entries(window.TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join('');
  $('#tplSel').innerHTML = tplOpts; $('#a_tpl').innerHTML = tplOpts; $('#a_tpl').value = 'kurz';
  $$('[data-go]').forEach(b => b.onclick = () => { if (b.closest('#v-cv')) saveProfile(false); go(b.dataset.go); });
  $$('#cvTabs button').forEach(b => b.onclick = () => { $$('#cvTabs button').forEach(x => x.classList.toggle('on', x === b)); $$('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.tab)); });
  $('#cvFile').onchange = e => handleCvFile(e.target.files);
  $('#cvPhoto').onchange = e => handleCvFile(e.target.files);
  $('#btnQCheck').onclick = () => { const q = docQuality($('#cvText').value, Object.assign({}, S.cvQuality || {}, { conf: null })); showCvQuality(q); };
  $('#btnClean').onclick = () => { const t = cleanDocText($('#cvText').value); $('#cvText').value = t; S.cvText = t; store.set('cvText', t); showCvQuality(docQuality(t, { method: (S.cvQuality || {}).method })); toast('Text bereinigt (Silbentrennung, Aufzählungen, Leerzeilen, Kopf-/Fußzeilen)'); };
  $('#btnReOcr').onclick = () => handleCvFile(CV_FILES, { forceOcr: true });
  $('#btnExportTxt').onclick = exportDocsText;
  $('#btnSearchPdf').onclick = () => searchablePdf(CV_FILES && CV_FILES.filter(f => f.type.startsWith('image/') || /\.pdf$/i.test(f.name)), (CV_FILES && CV_FILES[0].name) || 'lebenslauf');
  if (S.cvQuality) $('#cvQuality').innerHTML = qualityHtml(S.cvQuality);
  $('#cvText').onchange = () => { S.cvText = $('#cvText').value; store.set('cvText', S.cvText); };
  $('#btnParse').onclick = parseCv; $('#btnParseAI').onclick = () => { const q = S.cvQuality; if (q && q.level === 'schlecht' && !confirm('Der Text ist schlecht lesbar (' + q.score + '/100). Auch eine KI erkennt dann Fehler oft nicht und kann falsche Angaben übernehmen. Trotzdem fortfahren? (Besser: Text korrigieren oder neu fotografieren.)')) return; parseCvAI(); };
  $('#btnSaveProfile').onclick = () => { saveProfile(); suggestOccupations(true); };
  $('#btnPrintCV').onclick = printCV;
  $('#skillAddBtn').onclick = addSkill; $('#skillAdd').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } };
  $('#occAddBtn').onclick = () => { addTarget($('#occAdd').value); $('#occAdd').value = ''; store.set('profile', S.profile); renderOccupations(); };
  $('#escoBtn').onclick = escoSearch; $('#escoQ').onkeydown = e => { if (e.key === 'Enter') escoSearch(); };
  $('#btnSearch').onclick = runSearch;
  $('#sortBy').onchange = renderResults; $('#minScore').onchange = renderResults;
  $('#f_where').onchange = renderPortalLinks; $('#f_radius').onchange = renderPortalLinks; $('#f_maxTitles').onchange = () => { readFilters(); renderPortalLinks(); };
  const geo = document.createElement('button'); geo.className = 'btn sec small'; geo.textContent = '📍 Mein Standort'; geo.type = 'button'; geo.style.marginTop = '6px';
  geo.onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { S.settings.coords = [p.coords.latitude, p.coords.longitude]; store.set('settings', S.settings); toast('Standort für Entfernungen gespeichert'); }, () => toast('Standort nicht verfügbar')) : toast('Standort nicht verfügbar');
  $('#f_where').after(geo);
  $('#tplSel').onchange = () => generateLetter(0); $('#btnGen').onclick = () => generateLetter(0);
  $('#btnCSV').onclick = exportCSV; $('#btnAuto').onclick = runAuto;
  $('#btnSaveSettings').onclick = () => { saveSettings(); applyModuleVisibility(); };
  $('#btnReset').onclick = () => { if (confirm('Alle gespeicherten Daten in diesem Browser löschen?')) { store.clear(); location.hash = ''; location.reload(); } };
  initExtras();
  initSelftest();
  initBerufsermittlung();
  initLetter();
  initOllama();
  initExtrasE();
  initSegments();
  initFirms();
  initTracker();
  initSemantic();
  detectLocal();
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#import=')) return handleImportHash(); go(location.hash.slice(1) || 'start'); });
  if (location.hash.startsWith('#import=')) handleImportHash(); else go(location.hash.slice(1) || 'start');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', async () => {
  if ('indexedDB' in window && await idb.load()) BIG_KEYS.forEach(k => { const v = store.get(k, undefined); if (v !== undefined && k in S) S[k] = v; });
  init();
});

/* =====================================================================
   Erweiterungen: Weg A (alle Portale), Weg B (Import), Weg C (KI-Agent),
   Jooble, eigener Suchserver (kostenlose Metasuche)
   ===================================================================== */
const PORTAL_HOSTS = ['indeed.', 'stepstone.', 'linkedin.', 'xing.', 'glassdoor.', 'jooble.', 'kimeta.', 'jobware.', 'monster.', 'meinestadt.', 'arbeitsagentur.', 'talent.com', 'jobrapido.', 'careerjet.', 'google.', 'stellenanzeigen.de', 'jobvector.', 'yourfirm.', 'interamt.', 'service.bund.de', 'absolventa.', 'staufenbiel.', 'hokify.', 'jobninja.', 'workwise.', '-jobanzeiger.de', 'medi-jobs.', 'praktischarzt.', 'hogapage.', 'jobs.heise.de', 'salesjob.', 'boersenblatt.net', 'greenjobs.', 'nachhaltigejobs.'];
const isPortal = u => PORTAL_HOSTS.some(h => String(u || '').includes(h));
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

async function searchJooble(term, F) {
  if (!S.settings.jooble) throw new Error('Schlüssel fehlt (Einstellungen)');
  const host = (S.settings.joohost || 'de.jooble.org').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const body = { keywords: term, location: F.where || 'Deutschland', page: '1', ResultOnPage: '50' };
  if (F.where) body.radius = String(F.radius); if (F.salary) body.salary = String(F.salary * 12);
  const d = await getJSON(`https://${host}/api/${encodeURIComponent(S.settings.jooble)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return (d.jobs || []).map(x => ({ id: 'jo-' + (x.id || hash(x.link)), source: 'Jooble' + (x.source ? ` (${x.source})` : ''), title: strip(x.title), company: x.company || '', location: x.location || '',
    url: x.link || '', directUrl: '', description: strip(x.snippet), published: (x.updated || '').slice(0, 10), salaryMin: parseSalary(x.salary || ''), salaryMax: null, email: '',
    worktime: /teilzeit|part/i.test(x.type || '') ? 'tz' : /vollzeit|full/i.test(x.type || '') ? 'vz' : '' }));
}
async function searchServer(term, F) {
  const base = (S.settings.srv || '').replace(/\/$/, '');
  if (!base) throw new Error('Adresse fehlt (Einstellungen)');
  if (F.type === 'studium') term = studyTerms(term)[0];
  const p = new URLSearchParams({ q: term, where: F.where || '', radius: String(F.radius || 25), sites: [...new Set([...(F.srvSites && F.srvSites.length ? F.srvSites : DEFAULT_SITES), ...(F.srvBranch !== false ? branchSites(term) : [])])].join(','), limit: '40', details: F.details ? 'true' : 'false',
    engines: (F.engines && F.engines.length ? F.engines : ['duckduckgo', 'bing', 'brave', 'mojeek']).join(','), direct: F.srvDirect === false ? 'false' : 'true', strictRadius: F.srvStrict === false ? 'false' : 'true', noZeitarbeit: F.noZeit ? 'true' : 'false', type: F.type || '1', robots: S.settings.robotsSearch ? 'true' : 'false' });
  if (F.days) p.set('days', F.days);
  const d = await getJSON(`${base}/search?${p}`, { direct: true, headers: S.settings.srvtok ? { 'x-bl-token': S.settings.srvtok } : {} });
  d.jobs = (d.jobs || []).map(j => Object.assign(j, { title: j.title || '', company: j.company || '', location: j.location || '', description: j.description || '' }));
  return d;
}

/* ---------- Weg B: Import ---------- */
function normImported(x, from) {
  const j = { source: String(x.source || 'Import').slice(0, 40), title: strip(x.title).slice(0, 200), company: strip(x.company).slice(0, 120), location: strip(x.location).slice(0, 120),
    url: safeUrl(x.url) ? x.url : '', directUrl: safeUrl(x.directUrl) ? x.directUrl : '', description: strip(x.description).slice(0, 6000), published: String(x.published || '').slice(0, 10),
    salaryMin: +x.salaryMin || null, salaryMax: +x.salaryMax || null, worktime: ['vz', 'tz', 'snw', 'ho', 'mj'].includes(x.worktime) ? x.worktime : '', remote: !!x.remote,
    imported: new Date().toISOString(), from: safeUrl(from) ? from : '' };
  j.email = findEmail(x.email || '') || findEmail(j.description);
  if (!j.salaryMin) j.salaryMin = parseSalary(j.description);
  if (!j.worktime) j.worktime = detectWorktime(j.title + ' ' + j.description);
  j.id = 'imp-' + hash(j.url || j.title + j.company);
  return j;
}
function importJobs(list, from) {
  const neu = (list || []).filter(x => x && x.title).map(x => normImported(x, from));
  let added = 0;
  for (const j of neu) { const i = S.imported.findIndex(o => o.id === j.id); if (i >= 0) { if (j.description.length > S.imported[i].description.length) S.imported[i] = j; } else { S.imported.unshift(j); added++; } }
  S.imported = S.imported.slice(0, 500); store.set('imported', S.imported);
  // sofort bewerten und in die Liste aufnehmen
  const F = readFilters(), userC = S.settings.coords || coordsFor(F.where);
  const scored = neu.map(j => { const c = coordsFor(j.location); if (c) { j.lat = c[0]; j.lon = c[1]; } if (userC && j.lat) j.dist = km(userC, [j.lat, j.lon]); return scoreJob(j, F); });
  const ids = new Set(scored.map(j => j.id)); S.jobs = [...scored, ...S.jobs.filter(j => !ids.has(j.id))];
  return { total: neu.length, added, list: scored };
}
async function unpack(data) {
  const b = data.slice(1).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(b + '==='.slice((b.length + 3) % 4));
  const u8 = Uint8Array.from(bin, c => c.charCodeAt(0));
  if (data[0] === 'z') return JSON.parse(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
  return JSON.parse(new TextDecoder().decode(u8));
}
async function handleImportHash(raw) {
  const data = (raw || location.hash).replace(/^.*#import=/, '');
  history.replaceState(null, '', location.pathname + location.search + '#stellen');
  try {
    const obj = await unpack(data);
    const r = importJobs(obj.jobs, obj.from);
    go('stellen'); $('#minScore').value = '0'; $('#sortBy').value = 'score'; renderResults();
    toast(`${r.total} Stellen übernommen (${r.added} neu) von ${obj.from ? new URL(obj.from).hostname : 'Import'}. Bewertet und sortiert.`, 5000);
  } catch (e) { go('import'); toast('Import fehlgeschlagen: ' + e.message, 6000); }
}
async function pasteImport() {
  const v = $('#impPaste').value.trim(); if (!v) return;
  if (v.includes('#import=')) return handleImportHash(v);
  try {
    const m = v.match(/[\[{][\s\S]*[\]}]/); const obj = JSON.parse(m ? m[0] : v);
    const list = Array.isArray(obj) ? obj : obj.jobs || obj.stellen || [];
    const r = importJobs(list, obj.from || '');
    // Ergebnisse des KI-Agenten: Status in die Übersicht übernehmen
    let t = 0;
    list.forEach((x, i) => { const st = String(x.status || '').toLowerCase(); if (/beworben|versendet|applied|sent/.test(st)) { track(r.list[i] || normImported(x), 'versendet', 'KI-Agent' + (x.note ? ': ' + String(x.note).slice(0, 80) : '')); t++; } });
    $('#impPaste').value = ''; toast(`${r.total} Stellen übernommen${t ? `, ${t} als beworben in der Übersicht` : ''}.`, 5000); go('stellen'); renderResults();
  } catch (e) { toast('Konnte nicht gelesen werden: kein gültiger Link oder JSON', 5000); }
}
let _bmCode = '';
async function renderImport() {
  const appUrl = location.href.replace(/#.*$/, '');
  $('#appAddr').textContent = appUrl;
  $('#impInfo').textContent = S.imported.length ? `${S.imported.length} übernommene Stellen gespeichert` : '';
  try {
    const src = await (await fetch('extractor.js')).text();
    _bmCode = 'javascript:' + encodeURIComponent(`(function(){${src}\n;BLExtract.run(${JSON.stringify(appUrl)},{details:${$('#bmDetails').checked},max:20,delay:1500});})();void 0`);
    $('#bmLink').href = _bmCode;
  } catch { $('#bmLink').removeAttribute('href'); }
}

/* ---------- Weg A: alle Portale öffnen ---------- */
function openAllPortals(list) {
  const terms = Array.isArray(list) ? list : searchTerms();
  if (!terms.length) return toast('Erst unter „Berufe“ einen Beruf anhaken');
  const o = encodeURIComponent($('#f_where').value || S.profile.city || ''), r = $('#f_radius').value, n = terms.reduce((a, t) => a + portalLinksFor(t).length, 0);
  if (n > 10 && !confirm(`Es werden ${n} Fenster geöffnet (${terms.length} Berufe, je Beruf die Haupt- und Branchen-Portale). Fortfahren?`)) return;
  let blocked = 0;
  terms.forEach(t => portalLinksFor(t).forEach(([, f]) => { const w = window.open(f(encodeURIComponent(t), o, r), '_blank'); if (w) { try { w.opener = null; } catch {} } else blocked++; }));
  if (blocked) toast(`${blocked} Fenster wurden vom Pop-up-Blocker verhindert. Bitte Pop-ups für diese Seite erlauben oder Links einzeln öffnen.`, 6000);
}

/* ---------- Weg C: Auftrag für KI-Browser-Agent ---------- */
function buildAgentPrompt() {
  saveProfile(false);
  const P = S.profile, F = readFilters(), mode = $('#ag_mode').value, min = +$('#ag_min').value || 80, max = +$('#ag_max').value || 5;
  const titles = S.profile.targets.filter(t => t.on).map(t => t.title);
  const saved = S.tracker.filter(t => t.status === 'gemerkt' && t.url).slice(0, max);
  const lines = [
    `Du bist mein Bewerbungs-Assistent und bedienst meinen Browser. Arbeite sorgfältig, ehrlich und Schritt für Schritt.`,
    ``,
    `## Mein Profil`,
    `Name: ${P.name || '(bitte fragen)'} · E-Mail: ${P.email || '-'} · Telefon: ${P.phone || '-'}`,
    `Wohnort: ${[P.plz, P.city].filter(Boolean).join(' ') || '-'} · Berufserfahrung: ${P.years || '?'} Jahre · Verfügbar ab: ${P.available || '-'}${P.salary ? ` · Gehaltswunsch: ${P.salary} € brutto/Monat` : ''}`,
    `Kompetenzen: ${P.skills.join(', ') || '-'}`,
    `Berufserfahrung:\n${P.experience || '-'}`,
    `Ausbildung:\n${P.education || '-'}`,
    P.other ? `Sonstiges: ${P.other}` : '',
    ``,
    `## Gesuchte Stellen`,
    `Berufe: ${titles.join('; ') || '(bitte fragen)'}`,
    `Ort: ${F.where || P.city || '-'}, Umkreis ${F.radius} km${F.worktime ? ` · Arbeitszeit: ${WT[F.worktime]}` : ''}${F.salary ? ` · Mindestgehalt ${F.salary} €/Monat` : ''}${F.noZeit ? ' · keine Zeitarbeit' : ''}${F.days ? ` · höchstens ${F.days} Tage alt` : ''}`,
    ``,
    `## Aufgabe`
  ];
  if (mode === 'selected') lines.push(`Bewirb dich auf diese von mir ausgewählten Stellen:`, ...saved.map((t, i) => `${i + 1}. ${t.title} – ${t.company} – ${t.url}`), saved.length ? '' : '(Keine gemerkten Stellen vorhanden – bitte in der App erst Stellen merken.)');
  else lines.push(`1. Suche auf diesen Portalen: ${$('#ag_portals').value}. Nutze die Suchfilter der Portale für Ort, Umkreis und Arbeitszeit.`,
    `2. Öffne die Treffer und bewerte jede Stelle von 0–100 % nach Passung: Berufsbezeichnung (45 %), Übereinstimmung meiner Kompetenzen mit den Anforderungen (40 %), Ort/Gehalt/Arbeitszeit (15 %). Sei streng und ehrlich.`,
    `3. Sammle höchstens 30 Stellen. Gleiche Stellen auf mehreren Portalen nur einmal.`);
  if (mode !== 'search') lines.push(
    `${mode === 'selected' ? '' : `4. Bewirb dich auf höchstens ${max} Stellen mit mindestens ${min} % Passung, beste zuerst.`}`,
    $('#ag_direct').checked ? `- Bevorzuge die Bewerbung direkt auf der Karriereseite des Arbeitgebers. Suche sie über den Firmennamen, wenn die Anzeige nicht direkt verlinkt.` : '',
    $('#ag_noeasy').checked ? `- Keine „Schnellbewerbung“/„Easy Apply“ über Portale.` : '',
    `- Schreibe für jede Stelle ein kurzes, konkretes Anschreiben auf Deutsch (max. 250 Wörter) nur mit Fakten aus meinem Profil. Erfinde keine Erfahrungen, Abschlüsse, Zahlen oder Zeugnisse.`,
    `- Fülle Formulare nur mit den Angaben oben aus. Fehlt eine Pflichtangabe oder ist eine Frage unklar (z. B. Gehalt, Eintrittsdatum, Arbeitserlaubnis), frage mich.`,
    `- Wenn ein Lebenslauf hochgeladen werden muss, frage mich nach der Datei.`,
    $('#ag_confirm').checked ? `- WICHTIG: Zeige mir vor jedem endgültigen Absenden die Stelle und den Text und warte auf mein „Ja“.` : `- Sende ab, wenn alle Angaben vollständig sind.`);
  lines.push(``, `## Regeln`,
    `- Keine Konten anlegen, keine Passwörter eingeben, keine Kosten verursachen, keine Captchas umgehen – in diesen Fällen stoppen und mich fragen.`,
    `- Langsam und menschlich arbeiten, keine Massenaufrufe. Brich ab, wenn ein Portal eine Warnung oder Sperre anzeigt.`,
    `- Keine persönlichen Daten außer den oben genannten weitergeben.`,
    ``, `## Ergebnis`,
    `Gib am Ende NUR einen JSON-Block in diesem Format aus, damit ich ihn in meine App importieren kann:`,
    '```json',
    `{"from":"ki-agent","jobs":[{"title":"","company":"","location":"","url":"Link zur Anzeige","directUrl":"Link zur Firmen-Karriereseite oder leer","description":"Anforderungen kurz","score":0,"status":"gefunden | beworben | übersprungen","note":"Grund oder Bewerbungsweg"}]}`,
    '```');
  $('#ag_prompt').value = lines.filter(l => l !== '').join('\n').replace(/\n## /g, '\n\n## ');
}

/* ---------- Initialisierung der Erweiterungen ---------- */
function initExtras() {
  $('#openAllPortals').onclick = () => openAllPortals();
  $('#src_server').onchange = () => $('#serverSites').classList.toggle('hidden', !$('#src_server').checked);
  $$('[data-src]').forEach(el => el.classList.toggle('hidden', !on(el.dataset.src)));
  $('#impBtn').onclick = pasteImport;
  $('#impClear').onclick = () => { if (confirm('Alle übernommenen Stellen löschen?')) { S.imported = []; store.set('imported', []); S.jobs = S.jobs.filter(j => !String(j.id).startsWith('imp-')); renderImport(); toast('Gelöscht'); } };
  $('#bmDetails').onchange = renderImport;
  $('#bmLink').onclick = e => { e.preventDefault(); toast('Den Knopf in die Lesezeichenleiste ziehen – nicht hier anklicken.'); };
  $('#bmCopy').onclick = async () => { await renderImport(); try { await navigator.clipboard.writeText(_bmCode); toast('Lesezeichen-Code kopiert'); } catch { $('#impPaste').value = _bmCode; toast('Kopieren nicht möglich – Code steht im Einfügefeld'); } };
  $('#addrCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#appAddr').textContent); toast('Adresse kopiert'); } catch {} };
  $('#ag_build').onclick = buildAgentPrompt;
  ['ag_mode', 'ag_min', 'ag_max', 'ag_confirm', 'ag_direct', 'ag_noeasy', 'ag_portals'].forEach(id => $('#' + id).onchange = buildAgentPrompt);
  $('#ag_copy').onclick = async () => { if (!$('#ag_prompt').value) buildAgentPrompt(); try { await navigator.clipboard.writeText($('#ag_prompt').value); toast('Auftrag kopiert'); } catch { $('#ag_prompt').select(); document.execCommand('copy'); toast('Auftrag kopiert'); } };
  $('#srvTest').onclick = async () => {
    saveSettings(); $('#srvInfo').textContent = 'Teste …';
    try { const d = await getJSON(S.settings.srv.replace(/\/$/, '') + '/health', { direct: true, headers: S.settings.srvtok ? { 'x-bl-token': S.settings.srvtok } : {} });
      $('#srvInfo').textContent = `✓ verbunden · Quellen: ${d.sources.join(', ')} · Firmen: ${d.companies}`; }
    catch (e) { $('#srvInfo').textContent = '✗ ' + e.message + (location.protocol === 'https:' && /^http:\/\/(?!127\.0\.0\.1|localhost)/.test(S.settings.srv) ? ' – vom Handy/HTTPS aus braucht der Server eine https-Adresse (siehe Anleitung: Cloudflare Tunnel)' : ''); }
  };
  if (S.imported.length && !S.jobs.length) { const F = S.filters || {}; S.jobs = S.imported.map(j => scoreJob(Object.assign({}, j), F.src ? F : {})); }
}


/* ---------- Lokaler Modus: App läuft über das Programm auf dem eigenen Computer ---------- */
async function detectLocal() {
  let info = null;
  // Lokales Programm läuft immer unter localhost/127.0.0.1 – auf GitHub Pages u. Ä. gar nicht erst nachfragen
  if (location.protocol === 'file:' || !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/.test(location.hostname)) return;
  try { const r = await fetch('local.json', { cache: 'no-store' }); if (r.ok) info = await r.json(); } catch {}
  if (!info || !info.local) return;
  S.local = true; S.escoIndex = !!info.escoIndex; $("#firmCard").classList.remove("hidden"); offerRestore().then(() => autoBackup());
  S.settings.srv = location.origin; S.settings.proxy = location.origin + '/proxy'; S.settings.srvtok = '';
  store.set('settings', S.settings);
  if (!store.get('localInit', false)) {   // einmalig sinnvolle Voreinstellungen
    S.mods['1f'] = true; store.set('mods', S.mods);
    $('#src_server').checked = true; $('#src_ba').checked = false; $('#src_an').checked = false;
    $('#serverSites').classList.remove('hidden');
    readFilters(); store.set('localInit', true);
  }
  $('#localBanner').classList.remove('hidden');
  $('#hdrStatus').textContent = 'Lokal · Daten bleiben auf diesem Computer';
  ['#s_proxy', '#s_srv'].forEach(id => { const c = $(id) && $(id).closest('.card'); if (c) c.classList.add('hidden'); });
  const lbl = $('#src_server').closest('label'); if (lbl) lbl.lastChild.textContent = ' Alle Portale & Suchmaschinen (lokal)';
  renderModules(); applyModuleVisibility();
  try { renderCompanies(); } catch {}
}

/* ---------- Selbsttest: jede Quelle einzeln prüfen, Bericht ohne persönliche Daten ---------- */
let _stReport = null;
const ST_LABEL = { ok: ['✓ funktioniert', 'var(--ok)'], leer: ['○ keine Treffer', 'var(--warn)'], captcha: ['✗ Captcha / Bot-Schutz', 'var(--bad)'], blockiert: ['✗ blockiert', 'var(--bad)'],
  'nicht erreichbar': ['✗ nicht erreichbar', 'var(--bad)'], fehler: ['✗ Fehler', 'var(--bad)'], 'zeitüberschreitung': ['✗ Zeitüberschreitung', 'var(--bad)'], 'übersprungen': ['– übersprungen', 'var(--muted)'] };
async function appProbe(name, fn) {
  const t = performance.now();
  try { const r = await fn(); return Object.assign({ status: r.found ? 'ok' : 'leer' }, r, { ms: Math.round(performance.now() - t) }); }
  catch (e) { return { status: /CORS|blockiert|Proxy/.test(e.message) ? 'blockiert' : 'nicht erreichbar', error: e.message, ms: Math.round(performance.now() - t) }; }
}
async function runSelftest() {
  const q = $('#st_q').value.trim() || 'Elektriker', where = $('#st_where').value.trim() || 'Berlin';
  $('#stRun').disabled = true; $('#stOut').innerHTML = ''; const prog = t => $('#stProg').textContent = t;
  const rep = { report: 'Bewerbungslotse-Selbsttest (App)', time: new Date().toISOString(), modus: S.local ? 'lokal' : 'online',
    browser: navigator.userAgent.replace(/\(([^)]*)\)/, m => m.length > 60 ? m.slice(0, 60) + '…)' : m), probe: { q, where }, app: {}, server: null };
  prog('Prüfe Direktabrufe der App …');
  const F = { where, radius: 25, type: '1', worktime: '', days: '', noZeit: false };
  rep.app.arbeitsagentur = await appProbe('ba', async () => { const r = await searchBA(q, F); return { found: r.length, sample: r.slice(0, 3).map(j => `${j.title} | ${j.company} | ${j.location}`) }; });
  rep.app.arbeitnow = await appProbe('an', async () => { const r = await searchArbeitnow([q], F); return { found: r.length, sample: r.slice(0, 3).map(j => `${j.title} | ${j.company}`) }; });
  rep.app.esco = await appProbe('esco', async () => { const j = await getJSON(`https://ec.europa.eu/esco/api/search?text=${encodeURIComponent(q)}&language=de&type=occupation&limit=5`); const r = (j._embedded || {}).results || []; return { found: r.length, sample: r.slice(0, 3).map(x => x.title) }; });
  if (S.settings.srv) {
    prog('Prüfe alle Portale und Suchmaschinen über das Programm … (1–2 Min.)');
    try { rep.server = await getJSON(`${S.settings.srv.replace(/\/$/, '')}/selftest?` + new URLSearchParams({ q, where }), { direct: true, headers: S.settings.srvtok ? { 'x-bl-token': S.settings.srvtok } : {} }); }
    catch (e) { rep.server = { error: 'Programm/Suchserver nicht erreichbar: ' + e.message }; }
  }
  _stReport = rep; renderSelftest(rep); prog('Fertig.'); $('#stRun').disabled = false;
  $('#stSave').classList.remove('hidden'); $('#stCopy').classList.remove('hidden');
}
function renderSelftest(rep) {
  const rows = [];
  const row = (group, name, d) => {
    const [txt, col] = ST_LABEL[d.status] || [d.status || '?', 'var(--muted)'];
    const info = d.error || (d.found != null ? `${d.found} Treffer${d.matching != null ? `, ${d.matching} passend` : ''}${d.stages ? ' · ' + Object.entries(d.stages).map(([k, v]) => `${k}: ${v}`).join(', ') : ''}` : '') ||
      (d.jobLinks != null ? `${d.resultLinks} Links, ${d.jobLinks} Stellenlinks` : '') || d.info || '';
    rows.push(`<tr><td class="muted">${esc(group)}</td><td><b>${esc(name)}</b></td><td style="color:${col};white-space:nowrap">${esc(txt)}</td><td class="small">${esc(info)}${d.http ? ` · HTTP ${d.http}` : ''}${d.ms != null ? ` · ${(d.ms / 1000).toFixed(1)} s` : ''}${(d.sample || []).length ? `<br><span class="muted">${esc(d.sample[0])}</span>` : ''}</td></tr>`);
  };
  Object.entries(rep.app).forEach(([k, d]) => row('App', k, d));
  if (rep.server && rep.server.sources) {
    Object.entries(rep.server.sources).forEach(([k, d]) => row('Portal', k, d));
    Object.entries(rep.server.engines).forEach(([k, d]) => row('Suchmaschine', d.engine || k, d));
  } else if (rep.server && rep.server.error) rows.push(`<tr><td colspan="4" class="small" style="color:var(--bad)">${esc(rep.server.error)}</td></tr>`);
  else rows.push(`<tr><td colspan="4" class="small muted">Portale und Suchmaschinen werden nur im Programm (lokaler Modus) geprüft.</td></tr>`);
  const all = [...Object.values(rep.app), ...(rep.server && rep.server.sources ? [...Object.values(rep.server.sources), ...Object.values(rep.server.engines)] : [])];
  const ok = all.filter(d => d.status === 'ok').length;
  $('#stOut').innerHTML = `<p class="small"><b>${ok} von ${all.length}</b> Quellen liefern Stellen.</p><table><tr><th></th><th>Quelle</th><th>Ergebnis</th><th>Details</th></tr>${rows.join('')}</table>`;
}
function initSelftest() {
  $('#stRun').onclick = runSelftest;
  $('#stSave').onclick = () => _stReport && download(`selbsttest-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`, JSON.stringify(_stReport, null, 2), 'application/json');
  $('#stCopy').onclick = async () => { if (!_stReport) return; try { await navigator.clipboard.writeText(JSON.stringify(_stReport, null, 2)); toast('Bericht kopiert'); } catch { toast('Kopieren nicht möglich – bitte „Bericht speichern“ nutzen'); } };
}


/* =====================================================================
   Berufsermittlung: Zeugnisse (Weg 5), BA-Berufsverzeichnis offline (Wege 3 + 2),
   Marktbezeichnungen (Weg 4), ESCO Kompetenz → Beruf (Weg 1)
   ===================================================================== */
const zeugnisText = () => (S.zeugnisse || []).map(z => z.text).join('\n');
const zProg = t => $('#zProg').textContent = t;
const Z_FILES = new WeakMap();   // Dateien der Zeugnisse (nur im Arbeitsspeicher, für „neu lesen“)
function renderZeugnisse() {
  const dot = q => q ? `<span title="Lesbarkeit ${q.level} (${q.score}/100)" style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;background:${{ gut: 'var(--ok)', mittel: 'var(--warn)', schlecht: 'var(--bad)' }[q.level]}"></span>` : '';
  $('#zList').innerHTML = S.zeugnisse.length ? S.zeugnisse.map((z, i) => `<span class="chip">${dot(z.quality)}📄 ${esc(z.name)}${z.quality ? ` <span class="muted">${z.quality.score}</span>` : ''}<button aria-label="entfernen" data-i="${i}">×</button></span>`).join('') : '<span class="small muted">Noch keine Zeugnisse.</span>';
  $$('#zList button').forEach(b => b.onclick = () => { S.zeugnisse.splice(+b.dataset.i, 1); store.set('zeugnisse', S.zeugnisse); renderZeugnisse(); });
  const weak = S.zeugnisse.filter(z => z.quality && (z.quality.level !== 'gut' || /ocr/.test(z.quality.method)));
  $('#zQuality').innerHTML = weak.map(z => `<div><b class="small">${esc(z.name)}</b>${qualityHtml(z.quality)}${Z_FILES.has(z) && /\.pdf$/i.test(Z_FILES.get(z)[0].name) && z.quality.method === 'pdf' ? `<button class="btn sec small" data-zre="${S.zeugnisse.indexOf(z)}" style="margin-top:4px">Mit Texterkennung neu lesen</button>` : ''}${Z_FILES.has(z) && /ocr/.test(z.quality.method) ? `<button class="btn sec small" data-zpdf="${S.zeugnisse.indexOf(z)}" style="margin-top:4px">Als durchsuchbare PDF speichern</button>` : ''}</div>`).join('');
  $$('[data-zpdf]').forEach(b => b.onclick = () => { const z = S.zeugnisse[+b.dataset.zpdf]; searchablePdf(Z_FILES.get(z), z.name, zProg); });
  $$('[data-zre]').forEach(b => b.onclick = async () => { const z = S.zeugnisse[+b.dataset.zre]; b.disabled = true;
    try { z.text = (await fileToText(Z_FILES.get(z), zProg, { forceOcr: true })).trim(); z.quality = LAST_READ.quality; store.set('zeugnisse', S.zeugnisse); zProg('Neu gelesen.'); renderZeugnisse(); } catch (e) { toast('Fehler: ' + e.message); b.disabled = false; } });
  $('#zText').value = zeugnisText();
}
async function handleZeugnisse(files) {
  if (!files || !files.length) return;
  const list = [...files], images = list.filter(f => f.type.startsWith('image/')), others = list.filter(f => !f.type.startsWith('image/'));
  try {
    for (const f of others) { const t = await fileToText([f], zProg); const z = { name: f.name, text: t.trim(), quality: LAST_READ && LAST_READ.quality }; S.zeugnisse.push(z); Z_FILES.set(z, [f]); }
    if (images.length) { const t = await fileToText(images, zProg); const z = { name: images.length > 1 ? `${images.length} Fotos` : images[0].name, text: t.trim(), quality: LAST_READ && LAST_READ.quality }; S.zeugnisse.push(z); Z_FILES.set(z, images); }
    store.set('zeugnisse', S.zeugnisse);
    const found = detectSkills(zeugnisText()).map(x => x.label).filter(l => !S.profile.skills.some(s => norm(s) === norm(l)));
    S.profile.skills.push(...found); store.set('profile', S.profile); renderSkillChips(); renderZeugnisse();
    zProg(`Fertig. ${found.length} neue Kompetenzen aus Zeugnissen.`);
    BA_RESULT = null;
  } catch (e) { zProg(''); toast('Fehler beim Lesen: ' + e.message, 5000); }
}

/* ---------- BA-Berufsverzeichnis ---------- */
const NIVEAU = { 1: 'Helfer', 2: 'Fachkraft', 3: 'Spezialist', 4: 'Experte' };
const BA_FILL = new Set(['fachrichtung', 'schwerpunkt', 'bereich', 'fuer', 'und', 'mit', 'der', 'die', 'das', 'staatlich', 'gepruefte', 'gepruefter', 'geprueft', 'anerkannt']);
let BAV = null, BA_RESULT = null;
async function loadBA() {
  if (BAV) return BAV;
  await loadScript('berufe-ba.js');
  const list = window.BA_BERUFE.map(([c, t, n]) => ({ c, t, n, tok: tokens(n).filter(x => !BA_FILL.has(x) && x !== 'frau').map(baWord) }));
  const byHead = new Map();
  list.forEach(e => { const h = (e.tok[0] || '').slice(0, 6); if (h.length >= 4) { if (!byHead.has(h)) byHead.set(h, []); byHead.get(h).push(e); } });
  BAV = { list, byHead };
  return BAV;
}
// strenger Wortvergleich für Berufsbezeichnungen (keine Teilwort-Treffer wie „Muster“ → „Mustermacher“)
const baWord = w => w.replace(/(fach|kauf|kranken|bank|immobilien|versicherungs|industrie|speditions|hotel|reise)frau$/, '$1mann');
function baSim(a, b) {
  a = baWord(a); b = baWord(b);
  if (a === b) return 1;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  if (l.startsWith(s) && l.length - s.length <= 3) return 0.95;            // Elektroniker ↔ Elektronikerin
  if (s.length >= 8 && l.slice(0, s.length - 2) === s.slice(0, -2) && l.length - s.length <= 3) return 0.85;
  return 0;
}
function baMatchLine(line) {
  const lt = tokens(line).filter(x => x.length >= 4 && !BA_FILL.has(x)).map(baWord);
  if (!lt.length) return [];
  const cand = new Set();
  lt.forEach(t => (BAV.byHead.get(t.slice(0, 6)) || []).forEach(e => cand.add(e)));
  const res = [];
  for (const e of cand) {
    if (!e.tok.length) continue;
    if (Math.max(...lt.map(y => baSim(e.tok[0], y))) < 0.95) continue;   // Kernwort muss (fast) exakt vorkommen
    if (e.generic === undefined) { const fw = norm(e.n.split(/[\s/(-]/)[0]); e.generic = !e.tok.length || !fw.startsWith(e.tok[0].slice(0, 5)); }
    if (e.generic && !norm(line).includes(norm(e.n.replace(/\/in\b|\/-frau\b/g, '')).slice(0, 25))) continue;   // allgemeine Bezeichnungen („Fachkraft für …“) nur bei wörtlichem Vorkommen
    const sc = e.tok.reduce((a, x) => a + Math.max(...lt.map(y => baSim(x, y))), 0) / e.tok.length;
    if (sc >= 0.8) res.push({ e, sc: sc + e.tok.length * 0.001 });   // bei Gleichstand die genauere (längere) Bezeichnung
  }
  return res.sort((a, b) => b.sc - a.sc).slice(0, 3);
}
function cvLines() {
  const P = S.profile, strip = l => l.replace(/^[^A-Za-zÄÖÜäöü]*((0?[1-9]|1[0-2])[./])?(19|20)\d{2}\s*(–|-|—|bis)\s*\S+\s*[:,]?\s*/i, '');
  const lines = [...(P.experience || '').split('\n'), ...(P.education || '').split('\n'), ...(P.other || '').split('\n'),
    ...S.cvText.split('\n'), ...zeugnisText().split('\n')];
  return [...new Set(lines.map(l => strip(l).trim()).filter(l => l.length >= 4 && l.length <= 160))];
}
async function evaluateBA() {
  await loadBA();
  const hits = new Map();   // Name -> {e, sc, from}
  for (const l of cvLines()) for (const { e, sc } of baMatchLine(l)) {
    const k = e.c + e.t + e.n; if (!hits.has(k) || hits.get(k).sc < sc) hits.set(k, { e, sc, from: l });
  }
  const seenN = new Set();
  const matched = [...hits.values()].sort((a, b) => b.sc - a.sc || (a.e.t === 't' ? -1 : 1)).filter(m => { const k = norm(m.e.n); if (seenN.has(k)) return false; seenN.add(k); return true; }).slice(0, 12);
  const codes = [...new Set(matched.map(m => m.e.c))];
  const have = new Set(S.profile.targets.map(t => norm(t.title)));
  const pick = (arr, n) => { const seen = new Set(); return arr.filter(e => { const k = norm(e.n); if (seen.has(k) || have.has(k)) return false; seen.add(k); return true; }).slice(0, n); };
  const T = BAV.list.filter(e => e.t === 't');
  const same = pick(T.filter(e => codes.includes(e.c)).sort((a, b) => a.n.length - b.n.length), 15);
  const up = [], rel = [];
  for (const c of codes) {
    const lvl = +c[4];
    up.push(...T.filter(e => e.c.slice(0, 3) === c.slice(0, 3) && +e.c[4] > lvl)
      .map(e => ({ e, r: (e.c.slice(0, 4) === c.slice(0, 4) ? 0 : e.c[3] === '9' ? 1 : 2) * 10 + (+e.c[4] - lvl) })));
    rel.push(...T.filter(e => e.c.slice(0, 3) === c.slice(0, 3) && e.c[4] === c[4] && e.c.slice(0, 4) !== c.slice(0, 4) && e.c[3] !== '9'));
  }
  up.sort((a, b) => a.r - b.r || a.e.n.length - b.e.n.length);
  BA_RESULT = { matched, same, up: pick(up.map(x => x.e), 12), rel: pick(rel.sort((a, b) => a.n.length - b.n.length), 12), codes };
  return BA_RESULT;
}
const addChip = (name, extra = '') => `<span class="chip">${esc(name)}${extra ? ` <span class="muted small">${esc(extra)}</span>` : ''} <button data-add="${esc(name)}" title="für die Suche übernehmen">＋</button></span>`;
function bindAddChips(root) {
  $$('[data-add]', root).forEach(b => b.onclick = () => { addTarget(b.dataset.add, true); store.set('profile', S.profile); renderOccupations(); b.closest('.chip').style.opacity = .45; b.remove(); toast('Übernommen'); });
}
async function renderBA(force) {
  const out = $('#baOut');
  try {
    if (force || !BA_RESULT) { out.innerHTML = '<p class="small muted">Wird ausgewertet …</p>'; await evaluateBA(); }
    const r = BA_RESULT;
    if (!r.matched.length) { out.innerHTML = '<p class="small muted">Im Lebenslauf und in den Zeugnissen wurde keine offizielle Berufsbezeichnung erkannt. Tipp: Berufsbezeichnungen in „Berufserfahrung“ und „Ausbildung“ eintragen (z. B. „Elektroniker für Energie- und Gebäudetechnik“).</p>'; return; }
    const sec = (title, expl, items) => items.length ? `<h4 style="margin:12px 0 4px">${title}</h4><p class="small muted" style="margin:0 0 6px">${expl}</p><div class="chips">${items.join('')}</div>` : '';
    out.innerHTML =
      sec('Erkannt', 'Offizielle Bezeichnungen, die in deinen Unterlagen vorkommen.', r.matched.map(m => addChip(m.e.n, `${m.e.t === 'a' ? 'Abschluss' : 'Tätigkeit'} · ${NIVEAU[m.e.c[4]] || ''}`))) +
      sec('Gleiche Tätigkeit, andere Bezeichnungen', 'Diese Titel gehören zur selben Berufsgattung – Arbeitgeber schreiben oft unterschiedlich aus.', r.same.map(e => addChip(e.n))) +
      sec('Aufstieg und Weiterentwicklung', 'Höheres Anforderungsniveau im selben Berufsfeld, z. B. mit Meister, Techniker oder Studium.', r.up.map(e => addChip(e.n, NIVEAU[e.c[4]]))) +
      sec('Verwandte Berufe', 'Gleiches Niveau, benachbarte Spezialisierung – geeignet für einen Wechsel.', r.rel.map(e => addChip(e.n)));
    bindAddChips(out);
  } catch (e) { out.innerHTML = `<p class="small" style="color:var(--bad)">Berufsverzeichnis konnte nicht geladen werden: ${esc(e.message)}</p>`; }
}

/* ---------- Weg 4: Marktbezeichnungen über die Jobbörse ---------- */
async function marketTitles() {
  const hard = S.profile.skills.filter(s => !ADJ[s.toLowerCase()] && !/^(deutsch|englisch|französisch|spanisch|italienisch|russisch|polnisch|türkisch|arabisch|ukrainisch|niederländisch)$/i.test(s)).slice(0, 6);
  if (!hard.length) return toast('Erst Kompetenzen im Profil eintragen');
  const F = Object.assign({}, readFilters(), { worktime: '', days: '', noZeit: false }), count = new Map();
  $('#mktRun').disabled = true; const prog = t => $('#mktProg').textContent = t; let ok = 0;
  for (const sk of hard) {
    prog(`Suche „${sk}“ …`);
    try { const r = await searchBA(sk, F); ok++; r.forEach(j => { const b = (j.beruf || '').trim(); if (b) { const c = count.get(b) || { n: 0, skills: new Set() }; c.n++; c.skills.add(sk); count.set(b, c); } }); }
    catch (e) { prog('Jobbörse nicht erreichbar: ' + e.message); }
  }
  $('#mktRun').disabled = false;
  if (!ok) { $('#mktOut').innerHTML = '<p class="small" style="color:var(--bad)">Die Jobbörse war nicht erreichbar. Im Programm auf dem PC funktioniert das ohne Einstellungen; in der Online-Version wird der Proxy benötigt.</p>'; return; }
  const top = [...count.entries()].sort((a, b) => b[1].skills.size - a[1].skills.size || b[1].n - a[1].n).slice(0, 15);
  prog(`Fertig (${hard.length} Kompetenzen geprüft).`);
  $('#mktOut').innerHTML = top.length ? `<div class="chips">${top.map(([b, c]) => addChip(b, `${c.n} Stellen · ${[...c.skills].slice(0, 3).map(cap).join(', ')}`)).join('')}</div>` : '<p class="small muted">Keine Treffer.</p>';
  bindAddChips($('#mktOut'));
}

/* ---------- Weg 1: ESCO – Kompetenzen → Berufe ---------- */
async function escoSkillsToOccupations() {
  const hard = S.profile.skills.filter(s => !ADJ[s.toLowerCase()]).slice(0, 10);
  if (!hard.length) return toast('Erst Kompetenzen im Profil eintragen');
  const prog = t => $('#escoSkProg').textContent = t; $('#escoSkRun').disabled = true;
  let result = null;
  try {
    if (S.local && S.escoIndex) {   // offline über importiertes ESCO-Datenpaket
      prog('Werte ESCO-Datenpaket aus …');
      result = (await getJSON(`${location.origin}/esco/berufe?` + new URLSearchParams({ skills: hard.join('|') }), { direct: true })).berufe;
    } else {                         // online über die ESCO-Schnittstelle, Ergebnisse werden gespeichert
      const cache = store.get('escoCache', {}), agg = new Map();
      for (const sk of hard) {
        prog(`ESCO: „${sk}“ …`);
        let links = cache[norm(sk)];
        if (!links) {
          const sr = await getJSON(`https://ec.europa.eu/esco/api/search?text=${encodeURIComponent(sk)}&language=de&type=skill&limit=1`);
          const hit = ((sr._embedded || {}).results || [])[0];
          if (!hit) { cache[norm(sk)] = { e: [], o: [] }; continue; }
          const res = await getJSON(`https://ec.europa.eu/esco/api/resource/skill?uri=${encodeURIComponent(hit.uri)}&language=de`);
          const L = res._links || {}, t = a => (a || []).map(x => x.title).filter(Boolean);
          links = { e: t(L.isEssentialForOccupation), o: t(L.isOptionalForOccupation) };
          cache[norm(sk)] = links;
        }
        links.e.forEach(o => { const a = agg.get(o) || { s: 0, skills: [] }; a.s += 1; a.skills.push(sk); agg.set(o, a); });
        links.o.forEach(o => { const a = agg.get(o) || { s: 0, skills: [] }; a.s += 0.5; a.skills.push(sk); agg.set(o, a); });
      }
      store.set('escoCache', cache);
      result = [...agg.entries()].map(([title, a]) => ({ title, score: a.s, skills: a.skills })).sort((a, b) => b.score - a.score).slice(0, 15);
    }
    prog(`Fertig (${hard.length} Kompetenzen).`);
    $('#escoSkOut').innerHTML = result && result.length ? `<div class="chips">${result.map(r => addChip(r.title, `passt zu: ${r.skills.slice(0, 3).map(cap).join(', ')}`)).join('')}</div>` : '<p class="small muted">Keine Berufe gefunden.</p>';
    bindAddChips($('#escoSkOut'));
  } catch (e) { prog(''); $('#escoSkOut').innerHTML = `<p class="small" style="color:var(--bad)">ESCO nicht erreichbar (${esc(e.message)}). Offline-Betrieb: ESCO-Datenpaket in den Einstellungen importieren.</p>`; }
  $('#escoSkRun').disabled = false;
}
async function importEscoZip(file) {
  if (!file) return;
  if (!S.local) return toast('Import nur im Programm auf dem PC möglich');
  $('#escoImpInfo').textContent = 'Wird importiert … (bis zu 1 Minute)';
  try {
    const r = await fetch(`${location.origin}/esco/import`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/zip' } });
    const d = await r.json(); if (!r.ok) throw new Error(d.detail || ('HTTP ' + r.status));
    S.escoIndex = true;
    $('#escoImpInfo').textContent = `✓ importiert: ${d.occupations} Berufe, ${d.skills} Kompetenzen, ${d.relations} Zuordnungen`;
  } catch (e) { $('#escoImpInfo').textContent = '✗ ' + e.message; }
}

function initBerufsermittlung() {
  $('#zFile').onchange = e => handleZeugnisse(e.target.files);
  $('#zPhoto').onchange = e => handleZeugnisse(e.target.files);
  $('#zText').onchange = () => { S.zeugnisse = [{ name: 'Zeugnisse (bearbeitet)', text: $('#zText').value }]; store.set('zeugnisse', S.zeugnisse); renderZeugnisse(); BA_RESULT = null; };
  $('#baRun').onclick = () => renderBA(true);
  $('#bnRun').onclick = berufenetWege;
  $('#mktRun').onclick = marketTitles;
  $('#escoSkRun').onclick = escoSkillsToOccupations;
  $('#escoZip').onchange = e => importEscoZip(e.target.files[0]);
  renderZeugnisse();
  if (!$('#escoImpCard').dataset.bound) { $('#escoImpCard').dataset.bound = 1; }
}

/* =====================================================================
   Individuelles Anschreiben (ohne KI): Bausteine, Belege, Aufbau, Abwechslung,
   Zeugnis-Formeln, Stilprüfung, Quellen – plus KI zweistufig (optional)
   ===================================================================== */
const SOFT_CAT = 'Soft Skills';
const isSoft = s => { const x = SKILL_INDEX.find(k => norm(k.label) === norm(s)); return x ? x.cat === SOFT_CAT : !!ADJ[String(s).toLowerCase()]; };
const hardSkills = () => S.profile.skills.filter(s => !isSoft(s) && !LANGS.includes(String(s).toLowerCase()));
const hashStr = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

/* ---------- Belege aus Lebenslauf und Zeugnissen ---------- */
function sentencesOf(text) {
  return String(text || '').replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x.length >= 25 && x.length <= 260);
}
function toFirstPerson(sent) {   // Zeugnis-Satz (3. Person) → Ich-Form, als Entwurf zum Überarbeiten
  let t = ' ' + sent + ' ';
  t = t.replace(/\b(Herr|Frau)\s+[A-ZÄÖÜ][\wäöüß-]+(\s+[A-ZÄÖÜ][\wäöüß-]+)?/g, 'ich').replace(/\b(Er|Sie)\b(?=\s+[a-zäöüß])/g, 'ich');
  t = t.replace(/\bich ist\b/gi, 'ich bin').replace(/\bich hat\b/gi, 'ich habe').replace(/\bich wird\b/gi, 'ich werde').replace(/\bich kann\b/gi, 'ich kann')
       .replace(/\bich ([a-zäöüß]+?)t\b(?!e)/g, (m, v) => /(te|st)$/.test(v + 't') ? m : `ich ${v}e`);   // arbeitet → arbeite (Präteritum bleibt gleich)
  t = t.replace(/\b(seine|ihre)\b/g, 'meine').replace(/\b(seiner|ihrer)\b/g, 'meiner').replace(/\b(seinen|ihren)\b/g, 'meinen').replace(/\b(seinem|ihrem)\b/g, 'meinem').replace(/\b(sein|ihr)\b(?=\s+[A-ZÄÖÜ])/g, 'mein')
       .replace(/\bihm\b/g, 'mir').replace(/\bihn\b/g, 'mich');
  t = t.trim(); return t.charAt(0).toUpperCase() + t.slice(1);
}
function findEvidence(skill) {
  const terms = skillTerms(skill), P = S.profile, out = [];
  const add = (src, list, transform) => sentencesOf(list).forEach(x => { if (hasTerm(norm(x), terms)) out.push({ src, text: transform ? transform(x) : x, raw: x }); });
  add('Baustein', (P.bausteine || {})[norm(skill)] || '');
  add('Lebenslauf', [P.experience, S.cvText].join('\n'));
  add('Zeugnis', zeugnisText(), x => /\b(Herr|Frau|Er|Sie)\b/.test(x) ? toFirstPerson(x) : x);
  const seen = new Set(); return out.filter(e => { const k = norm(e.text).slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ---------- Arbeitszeugnis-Sprache auswerten ---------- */
const ZEUGNIS_NOTEN = [[/stets zu unserer vollsten zufriedenheit|jederzeit zu unserer vollsten zufriedenheit|stets .{0,20}(äußerst|außerordentlich) zufrieden/i, 1],
  [/stets zu unserer vollen zufriedenheit|zu unserer vollsten zufriedenheit|stets .{0,10}voll(ends)? zufrieden/i, 2],
  [/zu unserer vollen zufriedenheit|stets zu unserer zufriedenheit/i, 3], [/zu unserer zufriedenheit/i, 4]];
const LOB = { 'zuverlässig': 'zuverlässig', 'sorgfältig': 'sorgfältig', 'selbstständig': 'selbstständig', 'selbständig': 'selbstständig', 'engagiert': 'engagiert', 'gewissenhaft': 'gewissenhaft', 'kundenorientiert': 'kundenorientiert', 'teamfähig': 'teamorientiert', 'hilfsbereit': 'hilfsbereit', 'belastbar': 'belastbar', 'flexibel': 'flexibel', 'strukturiert': 'strukturiert', 'lösungsorientiert': 'lösungsorientiert', 'freundlich': 'freundlich' };
function zeugnisAnalyse() {
  const t = zeugnisText(); if (!t.trim()) return { note: null, lob: [] };
  const note = (ZEUGNIS_NOTEN.find(([re]) => re.test(t)) || [null, null])[1];
  const lob = []; sentencesOf(t).forEach(x => { if (/\b(stets|jederzeit|immer|äußerst|besonders|sehr)\b/i.test(x)) Object.keys(LOB).forEach(w => { if (new RegExp('\\b' + w, 'i').test(x) && !lob.includes(LOB[w])) lob.push(LOB[w]); }); });
  return { note, lob };
}

/* ---------- Bausteine-Verwaltung (Profil) ---------- */
function renderBausteine() {
  const P = S.profile; P.bausteine = P.bausteine || {};
  const list = hardSkills().slice(0, 12);
  $('#bsList').innerHTML = list.length ? list.map(sk => `<div style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><b class="small">${esc(cap(sk))}</b><button class="btn sec small" data-evi="${esc(sk)}">Vorschlag aus Unterlagen</button></div>
      <textarea data-bs="${esc(norm(sk))}" style="min-height:54px" placeholder="z. B. Wo, wie oft, mit welchem Ergebnis?">${esc(P.bausteine[norm(sk)] || '')}</textarea></div>`).join('')
    : '<p class="small muted">Erst Kompetenzen im Profil eintragen oder Lebenslauf einlesen.</p>';
  $$('#bsList textarea').forEach(t => t.onchange = () => { P.bausteine[t.dataset.bs] = t.value.trim(); store.set('profile', P); });
  $$('#bsList [data-evi]').forEach(b => b.onclick = () => {
    const ev = findEvidence(b.dataset.evi).filter(e => e.src !== 'Baustein');
    const ta = b.closest('div').parentElement.querySelector('textarea');
    if (!ev.length) return toast('In Lebenslauf und Zeugnissen nichts Passendes gefunden – bitte selbst formulieren');
    ta.value = ev[0].text + (ev[0].src === 'Zeugnis' ? ' ' : ''); ta.dispatchEvent(new Event('change'));
    toast(`Entwurf aus ${ev[0].src} übernommen – bitte in eigenen Worten anpassen`);
  });
}

/* ---------- Formulierungs-Varianten ---------- */
const V = {
  intro: [
    'Ihre Anzeige für die Position als {stelle} hat mich sofort angesprochen, denn {grund}',
    '{grund_cap} Deshalb bewerbe ich mich bei {firma} als {stelle}.',
    'Als {rolle} mit {jahre_text} möchte ich meine Erfahrung künftig bei {firma} einbringen.',
    'Die Aufgaben, die Sie in Ihrer Anzeige beschreiben, decken sich in wesentlichen Punkten mit dem, was ich täglich mache.',
    'Bei {firma} als {stelle} zu arbeiten, reizt mich besonders, weil {grund}',
    'Gern möchte ich mein Wissen als {rolle} in Ihr Team bei {firma} einbringen.'
  ],
  grund: ['ich in {aufgabe} bereits umfangreiche Erfahrung gesammelt habe.', 'mich {aufgabe} fachlich besonders interessiert und ich hier schon viel Praxis mitbringe.', 'gerade {aufgabe} zu meinen Stärken zählt.'],
  skill_fallback: [
    'Mit {skill} bin ich aus meiner Tätigkeit als {rolle} gut vertraut.',
    'Auch {skill} gehört seit Jahren zu meinem Arbeitsalltag.',
    'Praktische Erfahrung habe ich zudem in {skill}.',
    'In {skill} fühle ich mich sicher und arbeite dabei selbstständig.'
  ],
  connector: ['', 'Darüber hinaus ', 'Außerdem ', 'Ebenso wichtig: '],
  basis: [
    'Meine Ausbildung als {abschluss} und {jahre} Berufserfahrung bilden dafür eine solide Grundlage.',
    'Dafür bringe ich {jahre} Berufspraxis und eine abgeschlossene Ausbildung als {abschluss} mit.'
  ],
  soft: [
    'Meine bisherigen Arbeitgeber schätzten besonders meine {eigE} Arbeitsweise.',
    'Kolleginnen und Kollegen schätzen meine {eigE} Art, Aufgaben anzugehen.',
    'Ich arbeite {eig} und behalte auch bei hohem Arbeitsaufkommen den Überblick.'
  ],
  aufgabe: [
    '{Aufgabe}, die Sie als Aufgabe nennen, gehört bei mir seit Langem zum Arbeitsalltag.',
    'Mit {aufgabe} – einem Schwerpunkt der Stelle – habe ich bereits viel praktische Erfahrung.',
    'Gerade {aufgabe} liegt mir, weil ich hier schon zahlreiche Projekte begleitet habe.'
  ],
  fakt: ['Einen {x} besitze ich ebenfalls.', 'Auch den {x} kann ich vorweisen.'],
  close: [
    'Gern überzeuge ich Sie in einem persönlichen Gespräch davon, was ich bei {firma} bewirken kann.',
    'Über die Gelegenheit, mich Ihnen persönlich vorzustellen, freue ich mich.',
    'Wenn Sie mehr über mich erfahren möchten, stehe ich Ihnen gern für ein Gespräch zur Verfügung.',
    'Ich freue mich darauf, Sie in einem Gespräch kennenzulernen.'
  ]
};
function firstTask(desc) {
  const lines = String(desc || '').split(/\n|•|·/).map(l => l.trim()).filter(Boolean);
  const i = lines.findIndex(l => /^(ihre |deine )?aufgaben|das erwartet (sie|dich)|ihr aufgabengebiet|was sie bewegen|tätigkeiten/i.test(l));
  let t = (i >= 0 ? lines.slice(i + 1) : []).find(l => l.length > 12 && l.length < 120) || '';
  t = t.replace(/^[-–*\s]+/, '').replace(/[.;:]$/, '');
  if (!t) return '';
  return t;   // Groß-/Kleinschreibung beibehalten (Aufgaben beginnen meist mit einem Nomen)
}
function taskSection(desc) {   // nur die Zeilen unter „Ihre Aufgaben“ bis zur nächsten Überschrift
  const lines = String(desc || '').split(/\n|•|·/).map(l => l.replace(/^[-–*\s]+/, '').trim()).filter(Boolean), out = [];
  let on = false;
  for (const l of lines) {
    if (/^(ihre |deine |ihr |dein )?(aufgaben|aufgabengebiet|tätigkeiten)|das erwartet (sie|dich)|was sie (bei uns )?(bewegen|erwartet)/i.test(l)) { on = true; continue; }
    if (/^(ihr |dein )?(profil|qualifikation|anforderungen)|das bringen sie mit|wir bieten|was wir bieten|unser angebot|benefits/i.test(l)) { on = false; continue; }
    if (on) out.push(l);
  }
  return out;
}
function pickVariant(list, seed, used) {
  for (let k = 0; k < list.length; k++) { const i = (seed + k) % list.length; if (!used || !used.includes(i)) return [list[i], i]; }
  return [list[seed % list.length], seed % list.length];
}
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '').replace(/\s{2,}/g, ' ').trim();

/* ---------- Anschreiben zusammensetzen ---------- */
function buildLetter(j, variant = 0) {
  const P = S.profile, e = j.explain || scoreJob(j).explain, lv = letterVars(j), seed = hashStr(j.id || j.title) + variant * 7;
  const log = store.get('letterLog', {}), brKey = norm(j.company || lv.stelle).slice(0, 20), used = log[brKey] || [];
  const src = [];                                   // Herkunft jeder Aussage
  const say = (text, from) => { if (text) src.push({ text, from }); return text; };
  const stelleKurz = lv.stelle.split(/\s+(?:für|im|in der|in|–|-)\s+/)[0];
  const rolle = lv.erfahrung_satz.match(/als (.+?) tätig/) ? lv.erfahrung_satz.match(/als (.+?) tätig/)[1] : (lv.stelle || 'Fachkraft');
  const years = +P.years || 0, jahre_text = years ? `${years} Jahren Erfahrung`.replace('Jahren Erfahrung', years === 1 ? 'Jahr Erfahrung' : 'Jahren Erfahrung') : 'praktischer Erfahrung';
  const aufgabe = firstTask(j.description) || (e.matched[0] ? cap(e.matched[0]) : 'diesem Bereich');
  const v = { stelle: lv.stelle, firma: j.company || 'Ihrem Unternehmen', rolle, jahre_text, aufgabe, jahre: years ? `${years} ${years === 1 ? 'Jahr' : 'Jahre'}` : 'mehrere Jahre' };
  // 1. Einstieg
  v.grund = fill(pickVariant(V.grund, seed)[0], v); v.grund_cap = v.grund.charAt(0).toUpperCase() + v.grund.slice(1).replace(/^Ich /, 'Ich ');
  if (/^ich /i.test(v.grund)) v.grund_cap = 'Weil ' + v.grund.replace(/\.$/, '') + ', ';
  let [intro, introIdx] = pickVariant(V.intro, seed, used);
  if (!years && /\{jahre_text\}/.test(intro)) [intro, introIdx] = pickVariant(V.intro, seed + 1, [...used, introIdx]);
  let einstieg = fill(intro, v).replace(/, \./, '.').replace(/Weil (.+?), Deshalb/, 'Weil $1, bewerbe ich mich – deshalb');
  if (/^Weil/.test(einstieg)) einstieg = `Ihre Stelle als ${lv.stelle} passt sehr gut zu mir, denn ${v.grund}`;
  say(einstieg, firstTask(j.description) ? 'Anzeige (Aufgabe) + Vorlage' : 'Vorlage');
  // 2. Hauptteil: höchstens 3 Überschneidungen, Pflicht zuerst, mit Beleg
  const prio = k => k === 'pflicht' ? 0 : k === 'wunsch' ? 2 : 1;
  const hard = e.matched.filter(s => !isSoft(s)).sort((a, b) => prio((e.missKind || {})[a]) - prio((e.missKind || {})[b]));
  const main = [], usedSkills = []; let fb = 0;
  for (const sk of hard) {
    if (main.length >= 3) break;
    const ev = findEvidence(sk)[0];
    const con = main.length ? pickVariant(V.connector, seed + main.length)[0] : '';
    if (ev) {
      let t = ev.text.replace(/\s+$/, '').replace(/\.$/, '');
      if (!/\b(ich|habe|hatte|bin|war|verantworte|arbeite\w*|mein\w*)\b/i.test(t)) t = `Zu meinen Aufgaben gehört ${/^(Installation|Wartung|Planung|Betreuung|Montage|Pflege|Erstellung|Durchführung|Prüfung|Beratung|Organisation|Koordination)/.test(t) ? 'die ' : ''}${t}`;   // Stichpunkt aus dem Lebenslauf → Satz
      const m = t.match(/^Ich (\S+) (.*)$/);
      if (con && m) t = `${con}${m[1]} ich ${m[2]}`;
      main.push(say(t + '.', ev.src === 'Zeugnis' ? 'Zeugnis (umformuliert, bitte prüfen)' : ev.src));
    }
    else { if (fb >= 2) continue; main.push(say(fill(pickVariant(V.skill_fallback, seed + fb * 3)[0], Object.assign({}, v, { skill: cap(sk) })), 'Vorlage + Kompetenz aus Profil')); fb++; }
    usedSkills.push(sk);
  }
  // Bezug zu einer konkreten Aufgabe aus der Anzeige, die zu einer vorhandenen Kompetenz passt
  const taskLines = taskSection(j.description).filter(l => l.length > 12 && l.length < 110);
  const tl = taskLines.find(l => e.matched.some(sk => !usedSkills.includes(sk) && hasTerm(norm(l), skillTerms(sk))) && !main.join(' ').includes(l.slice(0, 25)));
  if (tl && main.length < 4) { const t = tl.replace(/[.;:]$/, ''); main.push(say(fill(pickVariant(V.aufgabe, seed + 2)[0], { Aufgabe: t.charAt(0).toUpperCase() + t.slice(1), aufgabe: t }), 'Anzeige (Aufgabe) + Kompetenz')); }
  // kurze Fakten, die ausdrücklich gefordert sind (Führerschein, Staplerschein …)
  const fakten = e.matched.filter(sk => /führerschein|staplerschein|kranschein|fahrerkarte|adr/i.test(sk)).slice(0, 1);
  fakten.forEach((f, i) => main.push(say(fill(pickVariant(V.fakt, seed + i)[0], { x: cap(f) }), 'Profil (Nachweis)')));
  // Grundlage: Abschluss/Jahre nur wenn gefordert und erfüllt
  const pf = profileFacts(), degReq = (e.reqs || []).find(r => Object.values(DEG).includes(r.label));
  const abschluss = (BA_RESULT && BA_RESULT.matched.find(m => m.e.t === 'a' || +m.e.c[4] >= 2) || {}).e;
  if (degReq && degReq.ok && abschluss && years) main.push(say(fill(pickVariant(V.basis, seed)[0], Object.assign({}, v, { abschluss: abschluss.n })), 'Lebenslauf (Abschluss, Berufsjahre)'));
  // 3. Soft Skills mit Beleg aus dem Zeugnis bevorzugt
  const za = zeugnisAnalyse(), softs = [...za.lob, ...P.skills.filter(isSoft).map(s => ADJ[s.toLowerCase()]).filter(Boolean)];
  const mainLow = main.join(' ').toLowerCase(); const eig = [...new Set(softs)].filter(x => !mainLow.includes(x.slice(0, 7).toLowerCase())).slice(0, 2);
  let softSatz = '';
  if (eig.length) { const [tpl] = pickVariant(V.soft, seed + (za.lob.length ? 0 : 2)); softSatz = say(fill(tpl, { eig: eig.join(' und '), eigE: eig.map(x => x + 'e').join(' und ') }), za.lob.length ? `Zeugnis (Bewertung${za.note ? ' Note ' + za.note : ''})` : 'Profil (Eigenschaften)'); }
  // 4. Schluss
  const schluss = [lv.verfuegbarkeit_satz && say(lv.verfuegbarkeit_satz, 'Profil (Verfügbarkeit/Gehalt)'), say(fill(pickVariant(V.close, seed + 1)[0], v), 'Vorlage')].filter(Boolean).join(' ');
  const text = [`Bewerbung als ${lv.stelle}${lv.refnr_text}`, '', `${lv.anrede_ansprechpartner.startsWith('r ') || lv.anrede_ansprechpartner.startsWith(' ') ? 'Sehr geehrte' + lv.anrede_ansprechpartner : 'Sehr geehrte Damen und Herren'},`, '',
    einstieg, '', main.join(' '), softSatz ? '\n' + softSatz : '', '', schluss, '', 'Mit freundlichen Grüßen', '', P.name].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, src, introIdx, brKey };
}
function rememberLetter(r) { const log = store.get('letterLog', {}); log[r.brKey] = [...new Set([...(log[r.brKey] || []), r.introIdx])].slice(-5); store.set('letterLog', log); }

/* ---------- Stilprüfung (ohne KI) ---------- */
const FLOSKELN = ['hiermit bewerbe ich mich', 'mit großem interesse', 'mit grossem interesse', 'teamfähig und belastbar', 'belastbar und teamfähig', 'hat mein interesse geweckt', 'ich würde mich freuen', 'würde ich mich sehr freuen', 'hochmotiviert', 'bin ich die ideale besetzung', 'perfekt für diese stelle', 'ich bin davon überzeugt', 'last but not least', 'in der heutigen zeit', 'spannende herausforderung', 'nicht zuletzt', 'ich bin ein teamplayer', 'kommunikationsstark', 'zu guter letzt', 'hiermit möchte ich'];
const STOPW = new Set('aber alle allem also auch auf aus bei bin bis das dass dem den der des die dies diese diesen dieser doch durch ein eine einem einen einer eines für habe haben hat ich ihr ihre ihren ihrer ihnen ist mein meine meinem meinen meiner mich mir mit nach nicht noch oder sehr sich sie sind so und uns unter vom von vor war was weil wie wir wird zu zum zur über sowie gern gerne ihrem ihres euer bewerbung'.split(' '));
function styleCheck(text) {
  const body = text.split('\n').filter(l => !/^(Bewerbung als|Initiativbewerbung|Referenznummer|Sehr geehrte|Guten Tag|Mit freundlichen|Viele Grüße)/.test(l.trim())).join(' ');
  const sents = body.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length > 3);
  const words = body.toLowerCase().match(/[a-zäöüß-]+/g) || [];
  const ichStart = sents.filter(x => /^ich\b/i.test(x)).length;
  const low = body.toLowerCase(), flos = FLOSKELN.filter(f => low.includes(f));
  const cnt = {}; words.filter(w => w.length >= 6 && !STOPW.has(w)).forEach(w => { const st = w.slice(0, 7); cnt[st] = (cnt[st] || 0) + 1; });
  const reps = Object.entries(cnt).filter(([, n]) => n >= 3).map(([w, n]) => `${w}… (${n}×)`);
  const longS = sents.filter(x => x.split(/\s+/).length > 25).length;
  const passiv = (body.match(/\b(wurde|wurden|werden|wird)\b\s+(\w+\s+){0,4}(ge\w+t|ge\w+en)\b/gi) || []).length;
  const n = words.length, tips = [];
  if (n < 150) tips.push(`Recht kurz (${n} Wörter) – ein konkretes Beispiel mehr würde helfen.`);
  if (n > 380) tips.push(`Zu lang (${n} Wörter) – Ziel sind ca. 250–350 Wörter (eine Seite).`);
  if (ichStart / Math.max(1, sents.length) > .4) tips.push(`${ichStart} von ${sents.length} Sätzen beginnen mit „Ich“ – Satzanfänge variieren.`);
  if (flos.length) tips.push(`Floskeln: ${flos.map(f => `„${f}“`).join(', ')} – durch konkrete Aussagen ersetzen.`);
  if (reps.length) tips.push(`Wiederholungen: ${reps.join(', ')}.`);
  if (longS) tips.push(`${longS} sehr lange Sätze (> 25 Wörter) – teilen.`);
  if (passiv > 1) tips.push(`${passiv}× Passiv – aktiv formulieren („ich habe … umgesetzt“).`);
  const level = tips.length === 0 ? 'gut' : tips.length <= 2 ? 'mittel' : 'verbesserungswürdig';
  return { level, tips, words: n, sentences: sents.length };
}
function renderStyle() {
  const r = styleCheck($('#letter').value), col = { gut: 'var(--ok)', mittel: 'var(--warn)', 'verbesserungswürdig': 'var(--bad)' }[r.level];
  $('#styleOut').innerHTML = `<b style="color:${col}">● Stil: ${r.level}</b> · ${r.words} Wörter · ${r.sentences} Sätze${r.tips.length ? '<ul style="margin:4px 0 0 18px;padding:0">' + r.tips.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>' : ' · keine Auffälligkeiten'}`;
}
function renderSources(src) {
  $('#srcOut').innerHTML = (src || []).length ? src.map(x => `<div style="margin-bottom:4px"><span class="status">${esc(x.from)}</span> ${esc(x.text.slice(0, 160))}${x.text.length > 160 ? '…' : ''}</div>`).join('') : '<span class="muted">Nur für „Individuell“ verfügbar.</span>';
}

/* ---------- KI zweistufig (optional) ---------- */
const KI_STIL = `Stilregeln: sachlich-freundlich, konkret statt Superlative, keine Floskeln (z. B. „hiermit bewerbe ich mich“, „mit großem Interesse“, „hochmotiviert“, „teamfähig und belastbar“), abwechslungsreiche Satzanfänge (höchstens jeder dritte Satz mit „Ich“), unterschiedliche Satzlängen, keine Gedankenstrich-Ketten, keine Aufzählungszeichen, 230–330 Wörter, Sie-Form. Erfinde KEINE Fakten, Zahlen, Firmen, Abschlüsse oder Zeugnisse – verwende ausschließlich Belege aus dem Material.`;
async function aiLetter(j, draft) {
  const P = S.profile, e = j.explain || scoreJob(j).explain;
  const material = `PROFIL\nName: ${P.name}\nBerufsjahre: ${P.years}\nKompetenzen: ${P.skills.join(', ')}\nErfahrung:\n${P.experience}\nAusbildung:\n${P.education}\nSonstiges: ${P.other}\nVerfügbar: ${P.available}\n\nEIGENE STÄRKEN-BAUSTEINE\n${Object.entries(P.bausteine || {}).filter(([, t]) => t).map(([k, t]) => `${k}: ${t}`).join('\n') || '-'}\n\nZEUGNISSE (Auszug)\n${zeugnisText().slice(0, 4000) || '-'}\n\nSTELLE\n${j.title} bei ${j.company} (${j.location})\n${(j.description || '').slice(0, 5000)}`;
  // Stufe 1: Zuordnung Anforderung → Beleg
  const map = await callAI('Du bist ein sorgfältiger Bewerbungsberater. Antworte nur mit JSON.',
    `${material}\n\nAufgabe: Ordne die wichtigsten 3–4 Anforderungen der Stelle je einem Beleg aus PROFIL, BAUSTEINEN oder ZEUGNISSEN zu. Nur echte Belege, sonst weglassen. Pflichtanforderungen zuerst.\nJSON: {"zuordnung":[{"anforderung":"","beleg":"","quelle":"Profil|Baustein|Zeugnis"}],"aufhaenger":"ein konkreter Bezug zu Firma oder Aufgabe aus der Anzeige"}`);
  let mapping = map; try { mapping = JSON.stringify(JSON.parse(map.slice(map.indexOf('{'), map.lastIndexOf('}') + 1)), null, 1); } catch {}
  // Stufe 2: Schreiben
  const style = ($('#styleSample').value || P.styleSample || '').trim();
  let text = await callAI(`Du schreibst Anschreiben, die klingen, als hätte der Bewerber sie selbst geschrieben. ${KI_STIL}`,
    `${material}\n\nZUORDNUNG (verbindlich)\n${mapping}\n\n${style ? `STILVORLAGE des Bewerbers (Tonfall und Satzbau übernehmen, Inhalt NICHT):\n${style.slice(0, 3000)}\n\n` : ''}${draft ? `ENTWURF (kann als Ausgangspunkt dienen):\n${draft}\n\n` : ''}Schreibe das Anschreiben: Betreffzeile, Anrede, Einstieg mit dem Aufhänger, Hauptteil mit den Belegen (nicht alles aus dem Lebenslauf wiederholen), kurzer Schluss, Grußformel, Name. Nur den Text ausgeben.`);
  // Stufe 3: Selbstprüfung
  text = await callAI(`Du prüfst ein Anschreiben streng gegen Regeln und korrigierst es. ${KI_STIL}`,
    `MATERIAL\n${material.slice(0, 6000)}\n\nANSCHREIBEN\n${text}\n\nPrüfe: 1) Jede Aussage durch das Material gedeckt? Sonst entfernen. 2) Floskeln, Wiederholungen, zu viele „Ich“-Anfänge? 3) Länge 230–330 Wörter? Gib NUR das korrigierte Anschreiben aus.`);
  return text.trim();
}
function sentenceDiff(before, after) {
  const bs = new Set(before.split(/(?<=[.!?])\s+/).map(x => x.trim()));
  return after.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean).map(x => bs.has(x) ? esc(x) : `<mark>${esc(x)}</mark>`).join(' ');
}

function initLetter() {
  window.TEMPLATES = Object.assign({ individuell: { name: 'Individuell mit Belegen (empfohlen)', text: '' } }, window.TEMPLATES);
  const opts = Object.entries(window.TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join('');
  $('#tplSel').innerHTML = opts; $('#tplSel').value = 'individuell';
  const at = $('#a_tpl').value; $('#a_tpl').innerHTML = opts; $('#a_tpl').value = at || 'kurz';
  $('#styleSample').value = S.profile.styleSample || '';
  $('#styleSample').onchange = () => { S.profile.styleSample = $('#styleSample').value; store.set('profile', S.profile); };
  $('#letter').addEventListener('input', () => { clearTimeout(window._stT); window._stT = setTimeout(renderStyle, 400); });
  let variant = 0;
  $('#btnVariant').onclick = () => { variant++; generateLetter(variant); };
  $('#btnGenAI').onclick = async () => {
    if (!aiReady()) return toast('KI ist nicht eingerichtet (Einstellungen)'); if (!S.current) return;
    const b = $('#btnGenAI'), before = $('#letter').value; b.disabled = true; b.textContent = 'KI schreibt (3 Schritte) …';
    try { const t = await aiLetter(S.current, before); $('#letter').value = t; renderStyle(); $('#srcOut').innerHTML = '<p class="muted">Geänderte Sätze gegenüber dem Entwurf sind markiert:</p>' + sentenceDiff(before, t); toast('KI-Text fertig – bitte prüfen und anpassen'); }
    catch (e) { toast('KI-Fehler: ' + e.message, 6000); }
    b.disabled = false; b.textContent = 'Mit KI schreiben (optional)';
  };
  renderBausteine();
}

/* ---------- Ollama-Assistent (kostenlose lokale KI) ---------- */
const olApi = (path, body) => fetch(`${location.origin}/ollama/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.detail || ('HTTP ' + r.status)); return d; });
const olProg = t => $('#olProg').textContent = t;
const gb = b => (b / 1073741824).toFixed(1) + ' GB';
async function olWatch(job, label) {
  // Abbrechen-Knopf neben der Fortschrittsanzeige
  const cb = document.createElement('button'); cb.className = 'btn small sec'; cb.id = 'olCancel'; cb.textContent = 'Abbrechen';
  cb.onclick = () => { cb.disabled = true; olApi('cancel/' + job, {}).catch(() => {}); };
  $('#olProg').after(cb);
  try {
    for (;;) {
      await sleep(1000);
      const j = await olApi('job/' + job);
      const pct = j.total ? Math.round(j.completed / j.total * 100) : null;
      olProg(`${label}: ${j.status}${pct != null ? ` – ${pct} % (${gb(j.completed)} von ${gb(j.total)})` : ''}`);
      if (j.done) { if (j.error) throw new Error(j.error === 'abgebrochen' ? 'abgebrochen (ein erneuter Start setzt den Download fort)' : j.error); return j; }
    }
  } finally { cb.remove(); }
}
function olConnect(model) {
  Object.assign(S.settings, { aion: true, aiprov: 'compat', aiurl: `${location.origin}/ollama/v1`, aimodel: model, aikey: '' });
  store.set('settings', S.settings); S.mods['2b'] = true; store.set('mods', S.mods); fillSettings(); renderModules(); applyModuleVisibility();
  toast(`Verbunden: ${model} – KI-Funktionen sind eingeschaltet`);
}
async function olRun() {
  if (!S.local) { $('#olOut').innerHTML = '<p class="small" style="color:var(--warn)">Der Assistent funktioniert nur im Programm auf dem PC (lokaler Modus). In der Online-Version kannst du Ollama selbst installieren und unten unter „KI“ als „OpenAI-kompatibel“ mit der Adresse http://localhost:11434/v1 eintragen.</p>'; return; }
  $('#olStart').disabled = true; const out = $('#olOut');
  try {
    olProg('Prüfe Ollama …'); const st = await olApi('status');
    olProg('Lese System aus und suche passende Modelle im Internet …'); const rec = await olApi('recommend'), sy = rec.system;
    const gpu = sy.gpus && sy.gpus.length ? sy.gpus.map(g => `${esc(g.name)}${g.vram_gb ? ` (${g.vram_gb} GB)` : ''}`).join(', ') : 'keine erkannt';
    const card = m => `<label style="display:flex;gap:8px;align-items:flex-start;color:var(--text);margin:6px 0"><input type="radio" name="olModel" value="${esc(m.model)}" ${m === rec.best ? 'checked' : ''}>
      <span><b>${esc(m.model)}</b> · ca. ${m.size_gb} GB · ${esc(m.speed)} · Deutsch ${Math.round(m.de_score * 100)}/100<span class="small muted" style="display:block">Lizenz: ${esc(m.license)} · <a href="${esc(m.url)}" target="_blank" rel="noopener">Modellseite</a></span></span></label>`;
    out.innerHTML = `
      <div class="small"><b>Dein PC:</b> ${esc(sy.os)} · ${sy.cores} Kerne · ${sy.ram_gb} GB RAM · Grafik: ${gpu} · frei: ${sy.disk_free_gb} GB<br>Rechnet über: ${esc(sy.mode)} · Platz für Modelle bis ca. ${sy.budget_gb} GB</div>
      <div class="small" style="margin-top:6px"><b>Ollama:</b> ${st.running ? `✓ läuft (Version ${esc(st.version)})` : st.installed ? '⚠ installiert, aber nicht gestartet' : '✗ nicht installiert'}${st.models.length ? ` · vorhandene Modelle: ${st.models.map(m => esc(m.name)).join(', ')}` : ''}</div>
      <div class="row" style="margin-top:8px">${!st.installed ? '<button class="btn small" id="olInstall">Ollama installieren</button>' : ''}${st.installed && !st.running ? '<button class="btn small" id="olSvc">Ollama starten</button>' : ''}</div>
      <h4 style="margin:12px 0 4px">Empfehlung <span class="small muted">(Quelle: ${esc(rec.source)})</span></h4>
      ${rec.best ? [rec.best, ...rec.alternatives].map(card).join('') : '<p class="small" style="color:var(--bad)">Kein Modell passt zuverlässig in den Speicher dieses PCs. Die Anschreiben funktionieren ohne KI trotzdem.</p>'}
      <p class="small muted">${esc(rec.note)}</p>
      <div class="row">${rec.best ? '<button class="btn" id="olPull">Ausgewähltes Modell herunterladen</button>' : ''}<button class="btn sec small" id="olTest" ${st.models.length ? '' : 'disabled'}>Testen</button><button class="btn sec small" id="olUse" ${st.models.length ? '' : 'disabled'}>Mit App verbinden</button></div>
      ${st.models.length ? `<h4 style="margin:12px 0 4px">Installierte Modelle</h4>${st.models.map(m => `<div class="row small" style="justify-content:space-between"><span><input type="radio" name="olHave" value="${esc(m.name)}" ${S.settings.aimodel === m.name ? 'checked' : ''}> ${esc(m.name)} · ${gb(m.size)}</span><button class="btn danger small" data-oldel="${esc(m.name)}">Löschen</button></div>`).join('')}` : ''}
      <div id="olTestOut" class="small" style="margin-top:8px"></div>`;
    olProg('');
    const sel = () => ($('input[name="olHave"]:checked') || $('input[name="olModel"]:checked') || {}).value;
    const bi = $('#olInstall'); if (bi) bi.onclick = async () => {
      if (!confirm('Offiziellen Ollama-Installer von ollama.com herunterladen (ca. 1 GB) und starten?')) return;
      try { const r = await olApi('install', {}); if (r.manual) { $('#olTestOut').innerHTML = `${esc(r.hint)}<br><code>${esc(r.command)}</code>`; return; } await olWatch(r.job, 'Installer'); toast('Installer gestartet – nach der Installation „Assistent starten“ erneut klicken'); } catch (e) { toast('Fehler: ' + e.message, 6000); } };
    const bs = $('#olSvc'); if (bs) bs.onclick = async () => { const r = await olApi('start', {}); toast(r.ok ? 'Ollama läuft' : 'Start fehlgeschlagen: ' + r.error); olRun(); };
    const bp = $('#olPull'); if (bp) bp.onclick = async () => {
      const m = ($('input[name="olModel"]:checked') || {}).value, info = [rec.best, ...rec.alternatives].find(x => x && x.model === m);
      if (!(await olApi('status')).running) return toast('Bitte zuerst Ollama installieren/starten');
      if (!confirm(`Modell ${m} herunterladen (ca. ${info ? info.size_gb : '?'} GB)?\nLizenz: ${info ? info.license : 'siehe Modellseite'}`)) return;
      bp.disabled = true; try { const r = await olApi('pull', { model: m }); await olWatch(r.job, m); olConnect(m); olRun(); } catch (e) { toast('Download fehlgeschlagen: ' + e.message, 6000); bp.disabled = false; } };
    $('#olTest').onclick = async () => { const m = sel(); if (!m) return; $('#olTestOut').textContent = `Teste ${m} … (erster Start kann 1–2 Minuten dauern)`;
      try { const r = await olApi('test', { model: m }); $('#olTestOut').innerHTML = `<b>${esc(r.verdict)}</b> · ${r.tokens_per_s} Wörterteile/s · ${r.seconds} s<br><i>${esc(r.text)}</i>`; if (/langsam/.test(r.verdict) && rec.alternatives[0]) $('#olTestOut').innerHTML += `<br>Tipp: kleineres Modell wie ${esc(rec.alternatives[0].model)} ausprobieren.`; }
      catch (e) { $('#olTestOut').textContent = 'Test fehlgeschlagen: ' + e.message; } };
    $('#olUse').onclick = () => { const m = sel(); if (m) olConnect(m); };
    $$('[data-oldel]').forEach(b => b.onclick = async () => { if (!confirm(`Modell ${b.dataset.oldel} löschen?`)) return; await olApi('delete', { model: b.dataset.oldel }); olRun(); });
  } catch (e) { out.innerHTML = `<p class="small" style="color:var(--bad)">Fehler: ${esc(e.message)}</p>`; olProg(''); }
  $('#olStart').disabled = false;
}
/* ---------- Firmen im Umkreis (OpenStreetMap → Firmen-Websites), nur lokales Programm ---------- */
async function firmApi(path, body) {
  const base = (S.settings.srv || location.origin).replace(/\/$/, ''), headers = S.settings.srvtok ? { 'x-bl-token': S.settings.srvtok } : {};
  const r = await fetch(`${base}/firmen/${path}`, body === undefined ? { headers } : { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || ('HTTP ' + r.status));
  return d;
}
async function runFirms() {
  const terms = searchTerms(), F = readFilters();
  if (!terms.length) return toast('Erst unter „Berufe“ einen Beruf anhaken');
  if (!F.where) return toast('Bitte Ort oder PLZ eintragen');
  const max = +$('#fmMax').value, btn = $('#fmRun'), cb = $('#fmCancel'), out = $('#fmOut');
  btn.disabled = true; cb.classList.remove('hidden'); out.innerHTML = '';
  let cur = null, stop = false, total = 0, saved = 0;
  cb.onclick = () => { stop = true; cb.disabled = true; if (cur) firmApi('cancel/' + cur, {}).catch(() => {}); };
  try {
    for (const t of terms) {
      if (stop) break;
      const sources = [$('#fmOsm').checked && 'osm', $('#fmOvt').checked && 'overture'].filter(Boolean);
      if (!sources.length) { toast('Bitte mindestens eine Quelle wählen'); break; }
      cur = (await firmApi('start', { q: t, where: F.where, radius: F.radius || 25, max, sources, robots: S.settings.robotsFirms !== false })).job;
      let j;
      for (;;) {
        await sleep(1500); j = await firmApi('job/' + cur);
        $('#fmProg').textContent = `${t}: ${j.status}`;
        if (j.done) break;
      }
      if (j.error) { out.innerHTML += `<div style="color:var(--bad)">${esc(t)}: ${esc(j.error)}</div>`; continue; }
      const r = importJobs(j.jobs || [], ''); total += r.total; saved += j.saved || 0;
      const per = Object.entries(j.perSource || {}).map(([k, v]) => `${k} ${v}`).join(', ');
      if ((j.sourceErrors || []).length) out.innerHTML += `<div class="muted">Hinweis: ${esc(j.sourceErrors.join(' · '))}</div>`;
      out.innerHTML += `<div><b>${esc(t)}:</b> ${j.firms} Firmen mit Website im Umkreis${per ? ` (${esc(per)})` : ''}${j.cached ? ' (gespeicherte Liste)' : ''}, ${j.checked} geprüft${j.skipped ? `, ${j.skipped} ohne Karriereseite übersprungen` : ''}, ${j.withCareer} mit Karriereseite${j.robotsBlocked ? `, ${j.robotsBlocked} wegen robots.txt ausgelassen` : ''} → <b>${(j.jobs || []).length} passende Stellen</b>.</div>`;
    }
    if (saved) { const a = $('#serverSites input[value=ats]'); if (a && !a.checked) { a.checked = true; readFilters(); } }
    out.innerHTML += `<div class="muted">${saved} neue Karriereseiten gespeichert${saved ? ' – die Quelle „Firmen-Karriereseiten“ ist jetzt eingeschaltet' : ''}.</div>`;
    $('#fmProg').textContent = stop ? 'abgebrochen' : 'fertig';
    if (total) renderResults();
  } catch (e) { $('#fmProg').textContent = ''; out.innerHTML += `<div style="color:var(--bad)">Fehler: ${esc(e.message)}</div>`; }
  btn.disabled = false; cb.classList.add('hidden'); cb.disabled = false;
}
/* Links zu Kartendiensten (nur zum Selbst-Ansehen – kein automatisches Auslesen) */
const MAP_BRANCH = [[/elektr|mechatron|gebäudetech|photovoltaik|solar/i, 'Elektrofirma'], [/sanitär|heizung|shk|anlagenmechan|installateur|klima/i, 'Sanitär Heizung Firma'], [/kfz|mechaniker|karosser|fahrzeug/i, 'Autowerkstatt'],
  [/tischler|schreiner|zimmer/i, 'Tischlerei'], [/maler|lackier/i, 'Malerbetrieb'], [/dachdeck|maurer|bau|fliesen|gerüst/i, 'Baufirma'], [/metall|schlosser|schweiß|zerspan|cnc|industriemech/i, 'Metallbau Firma'],
  [/pfleg|alten|kranken|heilerzieh/i, 'Pflegedienst'], [/arzt|mfa|medizinisch|zahn|physio|ergo|therap|apothek/i, 'Arztpraxis'], [/koch|köch|küche|gastro|hotel|restaurant|kellner/i, 'Restaurant'],
  [/bäcker|konditor|fleischer|metzger/i, 'Bäckerei'], [/friseur|kosmetik/i, 'Friseur'], [/verkäuf|verkauf|einzelhandel|kassier/i, 'Geschäft'], [/lager|logistik|spedition|fahrer/i, 'Spedition Logistik'],
  [/informati|software|entwickler|admin|devops/i, 'IT-Firma'], [/kauf|büro|buchhalt|steuer|verwaltung|assistenz/i, 'Büro Firma'], [/erzieher|kita|kinderpfleg/i, 'Kita'], [/gärtner|garten|landschaft|florist/i, 'Gärtnerei']];
function mapLinks() {
  const box = $('#fmMaps'); if (!box) return;
  const F = S.filters || {}, where = ($('#f_where') && $('#f_where').value) || F.where || S.profile.city || '', terms = searchTerms();
  if (!terms.length || !where) { box.innerHTML = '<span class="muted">Für Kartenlinks: Beruf wählen und Ort eintragen.</span>'; return; }
  box.innerHTML = '<span class="muted">Selbst auf der Karte ansehen:</span>' + terms.slice(0, 3).map(t => { const b = (MAP_BRANCH.find(([re]) => re.test(t)) || [0, t])[1], q = encodeURIComponent(`${b} ${where}`);
    return `<a class="btn sec small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${q}">Google Maps: ${esc(b)}</a><a class="btn sec small" target="_blank" rel="noopener" href="https://maps.apple.com/?q=${q}">Apple Karten</a><a class="btn sec small" target="_blank" rel="noopener" href="https://www.openstreetmap.org/search?query=${q}">OpenStreetMap</a>`; }).join('');
}
/* ---------- Weg 6: Vergleich nach Bedeutung über lokale Einbettungen (Ollama) ---------- */
const SEM_CACHE = new Map();
async function embed(texts) {
  const model = S.settings.embModel || 'nomic-embed-text';
  const r = await fetch(`${location.origin}/ollama/v1/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: texts }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.data) throw new Error((d.error && (d.error.message || d.error)) || `HTTP ${r.status} – ist das Modell ${model} geladen?`);
  return d.data.map(x => x.embedding);
}
const cosine = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na * nb) || 1); };
async function semanticRank() {
  if (!S.settings.semantic || !S.local || !S.jobs.length) return;
  const P = S.profile;
  const ptxt = [`Gesuchte Berufe: ${(P.targets || []).filter(t => t.on).map(t => t.title).join(', ')}`, `Kompetenzen: ${P.skills.join(', ')}`, String(P.experience || '').slice(0, 1200)].join('\n');
  try {
    const pk = hash(ptxt); let pv = SEM_CACHE.get(pk); if (!pv) { prog('Vergleich nach Bedeutung: Profil …'); pv = (await embed([ptxt]))[0]; SEM_CACHE.set(pk, pv); }
    const todo = [...S.jobs].sort((a, b) => b.score - a.score).slice(0, 80).filter(j => j.sem == null);
    for (let i = 0; i < todo.length; i += 16) {
      prog(`Vergleich nach Bedeutung: ${Math.min(i + 16, todo.length)}/${todo.length} …`);
      const part = todo.slice(i, i + 16), key = j => hash(j.title + (j.description || '').slice(0, 800));
      const need = part.filter(j => !SEM_CACHE.has(key(j)));
      if (need.length) (await embed(need.map(j => `${j.title}\n${(j.description || '').slice(0, 800)}`))).forEach((v, k) => SEM_CACHE.set(key(need[k]), v));
      part.forEach(j => { j.sem = cosine(pv, SEM_CACHE.get(key(j))); });
    }
    S.jobs.forEach(j => scoreJob(j)); renderResults(); prog(`${S.jobs.length} Stellen – zusätzlich nach Bedeutung verglichen.`);
  } catch (e) { prog(''); toast('Vergleich nach Bedeutung nicht möglich: ' + e.message, 6000); }
}
// LinkedIn nur mit ausdrücklicher Warnung einschalten (Beschluss 27.09.2026: aufnehmen, mit Warnung)
function initLinkedInWarn() {
  const c = document.querySelector('#serverSites input[value="linkedin"]'); if (!c) return;
  c.addEventListener('change', () => { if (c.checked && !confirm('LinkedIn verbietet das automatische Auslesen in seinen Nutzungsbedingungen. Die Abfrage läuft zwar ohne dein LinkedIn-Konto, LinkedIn blockiert sie aber oft, und bei häufiger Nutzung kann deine Internetadresse vorübergehend gesperrt werden.\n\nTrotzdem einschalten? (Sicherer: LinkedIn über „Links zu Portalen“ selbst öffnen.)')) c.checked = false; readFilters(); });
}
function initSemantic() {
  initLinkedInWarn();
  const c = $('#s_semantic'), m = $('#s_embModel'), b = $('#embPull'); if (!c) return;
  c.checked = !!S.settings.semantic; m.value = S.settings.embModel || 'nomic-embed-text';
  c.onchange = () => { S.settings.semantic = c.checked; store.set('settings', S.settings); if (!c.checked) { S.jobs.forEach(j => { delete j.sem; scoreJob(j); }); renderResults(); } else semanticRank(); };
  m.onchange = () => { S.settings.embModel = m.value.trim() || 'nomic-embed-text'; store.set('settings', S.settings); SEM_CACHE.clear(); };
  b.onclick = async () => { if (!S.local) return toast('Nur im Programm auf dem PC möglich'); const model = m.value.trim() || 'nomic-embed-text';
    if (!confirm(`Vergleichsmodell ${model} über Ollama herunterladen?`)) return; b.disabled = true;
    try { const st = await olApi('status'); if (!st.running) throw new Error('Ollama läuft nicht – bitte zuerst mit dem Assistenten oben installieren/starten'); const r = await olApi('pull', { model }); await olWatch(r.job, model); $('#embProg').textContent = 'geladen ✓'; }
    catch (e) { $('#embProg').textContent = 'Fehler: ' + e.message; } b.disabled = false; };
}
function initFirms() { const b = $('#fmRun'); if (b) b.onclick = runFirms; mapLinks(); const w = $('#f_where'); if (w) w.addEventListener('change', mapLinks); }
function initOllama() { $('#olStart').onclick = olRun; }

/* ---------- BERUFENET: Aufstiegs- und Anpassungsweiterbildungen (online, öffentlicher Schlüssel der BA) ---------- */
const BN = 'https://rest.arbeitsagentur.de/infosysbub/bnet/pc/v1', BN_H = { headers: { 'X-API-Key': 'infosysbub-berufenet' } };
function bnTitles(node, keyRe) {   // Feldnamen der Antwort sind nicht offiziell dokumentiert → robust durchsuchen
  const out = []; const nameOf = o => o && typeof o === 'object' ? (o.kurzBezeichnungNeutral || o.bezeichnungNeutral || o.kurzBezeichnung || o.bezeichnung || o.name || o.titel) : null;
  (function walk(o, hit, d) {
    if (!o || typeof o !== 'object' || d > 8) return;
    if (Array.isArray(o)) return o.forEach(x => walk(x, hit, d + 1));
    for (const [k, v] of Object.entries(o)) {
      const h = hit || keyRe.test(k);
      if (h && v && typeof v === 'object' && !Array.isArray(v)) { const n = nameOf(v); if (n && typeof n === 'string') out.push(n); }
      if (h && Array.isArray(v)) v.forEach(x => { const n = typeof x === 'string' ? x : nameOf(x); if (n && typeof n === 'string') out.push(n); });
      walk(v, h, d + 1);
    }
  })(node, false, 0);
  return [...new Set(out.map(x => x.trim()).filter(x => x.length > 3 && x.length < 120))];
}
async function berufenetWege() {
  const prog = t => $('#bnProg').textContent = t;
  if (!BA_RESULT) await evaluateBA();
  const names = [...(BA_RESULT.matched || []).map(m => m.e.n), ...S.profile.targets.filter(t => t.on).map(t => t.title)].slice(0, 3);
  if (!names.length) return toast('Erst einen Beruf erkennen lassen oder unter „Berufe“ anhaken');
  $('#bnRun').disabled = true; const res = [], seenId = new Set();
  try {
    for (const n of names) {
      prog(`BERUFENET: ${n} …`);
      const q = cleanTitle(n).split(/\s+(?:Fachrichtung|-)\s+/)[0];
      const list = await getJSON(`${BN}/berufe?suchwoerter=${encodeURIComponent(q)}&page=0`, BN_H);
      const arr = (list._embedded && (list._embedded.berufSucheList || Object.values(list._embedded)[0])) || list.berufe || list.content || (Array.isArray(list) ? list : []);
      const first = (Array.isArray(arr) ? arr : []).find(x => x && (x.id || x.berufId)); if (!first || seenId.has(first.id || first.berufId)) continue; seenId.add(first.id || first.berufId);
      const det = await getJSON(`${BN}/berufe/${encodeURIComponent(first.id || first.berufId)}`, BN_H);
      const obj = Array.isArray(det) ? det[0] : det;
      res.push({ n: first.kurzBezeichnungNeutral || first.bezeichnungNeutral || n, up: bnTitles(obj, /aufstieg/i).slice(0, 10), adapt: bnTitles(obj, /anpassung/i).slice(0, 8) });
    }
    prog(res.length ? 'Fertig.' : 'Keine Einträge gefunden.');
    $('#bnOut').innerHTML = res.map(r => `<div style="margin-top:8px"><b class="small">${esc(r.n)}</b>
      ${r.up.length ? `<div class="small muted">Aufstiegsweiterbildungen</div><div class="chips">${r.up.map(x => addChip(x)).join('')}</div>` : ''}
      ${r.adapt.length ? `<div class="small muted" style="margin-top:4px">Anpassungsweiterbildungen (Zusatzqualifikationen)</div><div class="chips">${r.adapt.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
      ${!r.up.length && !r.adapt.length ? '<div class="small muted">Keine Weiterbildungen hinterlegt.</div>' : ''}</div>`).join('');
    bindAddChips($('#bnOut'));
  } catch (e) { prog(''); $('#bnOut').innerHTML = `<p class="small" style="color:var(--bad)">BERUFENET nicht erreichbar (${esc(e.message)}). Im Programm auf dem PC funktioniert es ohne Einstellungen.</p>`; }
  $('#bnRun').disabled = false;
}

/* ---------- Jobalarm-E-Mails und Firmenliste (nur lokaler Modus) ---------- */
const needLocal = () => { if (!S.local) { toast('Nur im Programm auf dem PC verfügbar'); return false; } return true; };
async function importMailJobs(res, label) {
  const r = importJobs(res.jobs || [], '');
  $('#mailInfo').innerHTML = `✓ ${esc(label)}: ${r.total} Stellen übernommen (${r.added} neu). <a href="#stellen">Zur Stellenliste</a>`;
}
async function handleEml(files) {
  if (!needLocal() || !files.length) return;
  let all = [];
  for (const f of files) {
    try { const r = await fetch(`${location.origin}/mail/parse`, { method: 'POST', body: f }); const d = await r.json(); if (!r.ok) throw new Error(d.detail); all = all.concat(d.jobs); }
    catch (e) { toast(`${f.name}: ${e.message}`, 5000); }
  }
  importMailJobs({ jobs: all }, `${files.length} E-Mail(s)`);
}
async function readImap() {
  if (!needLocal()) return;
  const body = { host: $('#imHost').value.trim(), user: $('#imUser').value.trim(), password: $('#imPass').value, days: +$('#imDays').value || 14 };
  if (!body.host || !body.user || !body.password) return toast('Server, Benutzer und Passwort angeben');
  store.set('imap', { host: body.host, user: body.user });   // Passwort wird nicht gespeichert
  $('#mailInfo').textContent = 'Lese Postfach …'; $('#imRun').disabled = true;
  try {
    const r = await fetch(`${location.origin}/mail/imap`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json(); if (!r.ok) throw new Error(d.detail);
    $('#imPass').value = '';
    await importMailJobs(d, `${d.mails.length} Jobalarm-E-Mails`);
  } catch (e) { $('#mailInfo').textContent = '✗ ' + e.message; }
  $('#imRun').disabled = false;
}
async function renderCompanies(found) {
  if (!S.local) { $('#cmpOut').innerHTML = '<p class="small muted">Nur im Programm auf dem PC.</p>'; return; }
  const cur = (await getJSON(`${location.origin}/companies`, { direct: true })).companies;
  const key = c => `${c.ats}:${String(c.slug).toLowerCase()}`, have = new Set(cur.map(key));
  const neu = (found || []).filter(c => !have.has(key(c)));
  $('#cmpOut').innerHTML = (neu.length ? `<p class="small"><b>${neu.length} gefundene Firmen</b> – zum Übernehmen anhaken:</p>${neu.map((c, i) => `<label class="small" style="display:block;color:var(--text)"><input type="checkbox" data-nc="${i}" checked> ${esc(c.name)} <span class="muted">(${esc(c.ats)}: ${esc(c.slug)}, via ${esc(c.via)})</span></label>`).join('')}<button class="btn small" id="cmpSave" style="margin-top:6px">Übernehmen</button>` : (found ? '<p class="small muted">Keine neuen Firmen gefunden.</p>' : '')) +
    `<p class="small" style="margin-top:8px"><b>Gespeicherte Firmen (${cur.length})</b></p>${cur.map((c, i) => `<div class="row small" style="justify-content:space-between"><span>${esc(c.name || c.slug)} <span class="muted">(${esc(c.ats)})</span></span><button class="btn danger small" data-dc="${i}">×</button></div>`).join('') || '<p class="small muted">Noch keine. Tipp: Quelle „Firmen-Karriereseiten“ bei der Suche anhaken.</p>'}`;
  const save = async list => { await fetch(`${location.origin}/companies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companies: list }) }); renderCompanies(); };
  const b = $('#cmpSave'); if (b) b.onclick = () => save(cur.concat(neu.filter((c, i) => $(`[data-nc="${i}"]`).checked).map(({ ats, slug, name }) => ({ ats, slug, name }))));
  $$('[data-dc]').forEach(x => x.onclick = () => save(cur.filter((c, i) => i !== +x.dataset.dc)));
}
async function findCompanies() {
  if (!needLocal()) return;
  const where = $('#cmpWhere').value.trim() || $('#f_where').value.trim() || S.profile.city || '';
  $('#cmpProg').textContent = 'Suche über Suchmaschinen … (ca. 1 Minute)'; $('#cmpFind').disabled = true;
  try { const d = await getJSON(`${location.origin}/companies/discover?` + new URLSearchParams({ where, q: $('#cmpQ').value.trim() }), { direct: true }); $('#cmpProg').textContent = `${d.companies.length} gefunden${Object.keys(d.errors).length ? ` · ${Object.keys(d.errors).length} Suchen blockiert` : ''}`; renderCompanies(d.companies); }
  catch (e) { $('#cmpProg').textContent = '✗ ' + e.message; }
  $('#cmpFind').disabled = false;
}
function initExtrasE() {
  $('#emlFile').onchange = e => handleEml([...e.target.files]);
  $('#imRun').onclick = readImap;
  const im = store.get('imap', null); if (im) { $('#imHost').value = im.host || ''; $('#imUser').value = im.user || ''; }
  $('#cmpFind').onclick = findCompanies;
  $('#cmpWhere').value = S.profile.city || '';
}


/* ---------- Segment-Steuerung für Sortierung (Auswahlliste bleibt die Datenquelle) ---------- */
// Segment-Knöpfe „Arbeit | Ausbildung | Studium | Praktikum“ oben in der Suche (Auswahlliste bleibt als Rückfall)
function initTypeSeg() {
  const sel = $('#f_type'); if (!sel || $('#typeSeg')) return;
  const short = { '1': 'Arbeit', '4': 'Ausbildung', studium: 'Studium', '34': 'Praktikum' };
  const seg = document.createElement('div'); seg.className = 'seg'; seg.id = 'typeSeg'; seg.setAttribute('role', 'tablist'); seg.style.marginBottom = '12px';
  seg.innerHTML = Object.entries(short).map(([v, t]) => `<button type="button" data-v="${v}">${t}</button>`).join('');
  const card = sel.closest('.card'); card.insertBefore(seg, card.firstChild);
  const sync = () => $$('button', seg).forEach(x => x.classList.toggle('on', x.dataset.v === sel.value));
  $$('button', seg).forEach(b => b.onclick = () => { sel.value = b.dataset.v; sync(); sel.dispatchEvent(new Event('change')); });
  sel.addEventListener('change', () => { sync(); readFilters(); if ($('#portalLinks')) renderPortalLinks(); const h = $('#v-stellen h2'); if (h) h.textContent = { studium: 'Modul 1b: Studienangebote', '4': 'Modul 1b: Ausbildungsplätze', '34': 'Modul 1b: Praktika und Trainee-Stellen' }[sel.value] || 'Modul 1b: Offene Stellen'; });
  sync(); const h = $('#v-stellen h2'); if (h && sel.value !== '1') sel.dispatchEvent(new Event('change'));
}
function initSegments() {
  initTypeSeg();
  const sel = $('#sortBy'); if (!sel || $('#sortSeg')) return;
  const short = { score: 'Passung', date: 'Neueste', dist: 'Nähe', salary: 'Gehalt', title: 'Titel', company: 'Firma' };
  const seg = document.createElement('div'); seg.className = 'seg'; seg.id = 'sortSeg'; seg.setAttribute('role', 'tablist');
  seg.innerHTML = [...sel.options].map(o => `<button type="button" data-v="${o.value}" class="${o.value === sel.value ? 'on' : ''}">${short[o.value] || o.text}</button>`).join('');
  sel.classList.add('hidden'); sel.after(seg);
  const lbl = document.querySelector('label[for="sortBy"]'); if (lbl) lbl.classList.add('hidden');
  $$('button', seg).forEach(b => b.onclick = () => { sel.value = b.dataset.v; $$('button', seg).forEach(x => x.classList.toggle('on', x === b)); sel.dispatchEvent(new Event('change')); });
}
