/* Bewerbungslotse – Stellen-Extraktor für die aktuell geöffnete Seite (Weg B).
   Wird genutzt vom Lesezeichen-Knopf (Bookmarklet) und von der Browser-Erweiterung.
   Liest nur, was im Browser bereits angezeigt wird. Keine Anmeldedaten, keine Cookies werden übertragen.
   Reihenfolge: 1. JSON-LD (schema.org JobPosting)  2. eingebettete App-Daten  3. Portal-Hinweise + Link-Heuristik */
(function (g) {
  'use strict';
  const LINK_RE = /\/stellenangebote--|\/viewjob\?|[?&]jk=|\/jobs\/view\/|xing\.com\/jobs\/[a-z0-9-]*\d|\/job\/\d|\/jobs\/\d|\/stellen\/\d|\/stellenanzeige|\/karriere\/.+|\/careers?\/.+/i;
  const T_KEYS = ['title', 'jobTitle', 'positionTitle', 'headline'], C_KEYS = ['companyName', 'company', 'hiringOrganization', 'employer', 'employerName'],
    U_KEYS = ['url', 'jobUrl', 'link', 'detailUrl', 'absoluteUrl', 'href'], L_KEYS = ['location', 'jobLocation', 'city', 'locationName', 'formattedLocation'],
    D_KEYS = ['description', 'snippet', 'textSnippet', 'teaser', 'summary'];
  /* Portal-Hinweise: CSS-Selektoren für Karten. Stand 09/2026, nicht live geprüft – bei Änderungen greift die allgemeine Heuristik. */
  const HINTS = {
    'stepstone.': { card: 'article[data-at="job-item"], [data-testid="job-item"]', title: '[data-at="job-item-title"], h2 a', company: '[data-at="job-item-company-name"]', loc: '[data-at="job-item-location"]' },
    'indeed.': { card: '.job_seen_beacon, [data-jk], .result', title: 'h2 a, a[data-jk], .jobTitle a', company: '[data-testid="company-name"], .companyName', loc: '[data-testid="text-location"], .companyLocation' },
    'linkedin.': { card: '.base-card, .job-card-container, li[data-occludable-job-id]', title: '.base-search-card__title, .job-card-list__title, a.job-card-container__link', company: '.base-search-card__subtitle, .artdeco-entity-lockup__subtitle, .job-card-container__primary-description', loc: '.job-search-card__location, .job-card-container__metadata-item, .artdeco-entity-lockup__caption' },
    'xing.': { card: 'article, [data-testid*="job"]', title: 'h2, h3, a', company: '[data-testid*="company"], [class*="company"]', loc: '[data-testid*="location"], [class*="location"]' }
  };
  const txt = s => String(s ?? '').replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const decode = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  const name = v => Array.isArray(v) ? name(v[0]) : v && typeof v === 'object' ? (v.name || v.displayName || v.title || '') : typeof v === 'string' ? v : '';
  const loc = v => Array.isArray(v) ? v.slice(0, 3).map(loc).filter(Boolean).join(', ') : v && typeof v === 'object' ? ((a => [a.postalCode, a.addressLocality || a.city || a.name || a.displayName].filter(Boolean).join(' '))(typeof v.address === 'object' ? v.address : v) || name(v)) : typeof v === 'string' ? v : '';
  const first = (o, ks) => { for (const k of ks) if (o[k]) return o[k]; return null; };
  const abs = (u, base) => { try { return new URL(u, base).href; } catch { return ''; } };
  function* walk(o, d = 0) { if (d > 14 || !o || typeof o !== 'object') return; if (!Array.isArray(o)) yield o; for (const v of (Array.isArray(o) ? o.slice(0, 500) : Object.values(o))) yield* walk(v, d + 1); }
  function salary(b) {
    const v = b && (b.value || b); if (!v || typeof v !== 'object') return [null, null];
    const f = { YEAR: 1 / 12, MONTH: 1, WEEK: 4.33, DAY: 21.7, HOUR: 173 }[(v.unitText || b.unitText || 'MONTH').toUpperCase()] || 1;
    const lo = +(v.minValue || v.value) || null, hi = +v.maxValue || lo;
    return [lo ? Math.round(lo * f) : null, hi ? Math.round(hi * f) : null];
  }
  function fromPosting(o, base) {
    const org = o.hiringOrganization || {}, [lo, hi] = salary(o.baseSalary), et = [].concat(o.employmentType || []).join(' ').toUpperCase();
    return { title: txt(o.title || o.name), company: txt(name(org)), location: txt(loc(o.jobLocation)) || (o.jobLocationType === 'TELECOMMUTE' ? 'Remote' : ''),
      url: abs(o.url || base, base), directUrl: typeof org === 'object' ? (org.sameAs || org.url || '') : '', description: txt(decode(String(o.description || ''))).slice(0, 6000),
      published: String(o.datePosted || '').slice(0, 10), salaryMin: lo, salaryMax: hi, worktime: /PART/.test(et) ? 'tz' : /FULL/.test(et) ? 'vz' : '', remote: o.jobLocationType === 'TELECOMMUTE' };
  }
  function jobLike(o) {
    const t = first(o, T_KEYS), c = first(o, C_KEYS); let u = first(o, U_KEYS);
    if (typeof t !== 'string' || t.length < 4 || t.length > 160 || !c) return null;
    if (u && typeof u === 'object') u = u.url || u.href;
    if (typeof u !== 'string' && !o.id && !o.slug) return null;
    return { title: txt(t), company: txt(name(c)), location: txt(loc(first(o, L_KEYS) || '')), url: typeof u === 'string' ? u : '', description: txt(first(o, D_KEYS) || '').slice(0, 3000) };
  }
  function extract(doc, base) {
    doc = doc || document; base = base || location.href;
    let jobs = [];
    // 1. JSON-LD
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      let d; try { d = JSON.parse(s.textContent); } catch { return; }
      for (const o of walk(d)) { const t = [].concat(o['@type']); if (t.includes('JobPosting')) jobs.push(fromPosting(o, base)); }
    });
    // 2. Eingebettete App-Daten
    if (jobs.filter(j => j.company).length < 3) doc.querySelectorAll('script').forEach(s => {
      const t = s.textContent || ''; if (t.length < 200) return;
      let d = null;
      if (s.id === '__NEXT_DATA__' || /json/.test(s.type)) { try { d = JSON.parse(t); } catch {} }
      else { const m = t.match(/(?:__PRELOADED_STATE__|__APOLLO_STATE__|__INITIAL_STATE__|__NUXT__|initialState)[^=]*=\s*(\{[\s\S]*\})\s*;?\s*$/); if (m) { try { d = JSON.parse(m[1]); } catch {} } }
      if (d) for (const o of walk(d)) { const j = jobLike(o); if (j) { j.url = j.url ? abs(j.url, base) : ''; jobs.push(j); } }
    });
    // 3a. Portal-Hinweise
    const host = location.hostname, hint = Object.entries(HINTS).find(([h]) => host.includes(h));
    if (hint && jobs.length < 3) doc.querySelectorAll(hint[1].card).forEach(card => {
      const a = card.querySelector(hint[1].title), q = sel => (card.querySelector(sel) || {}).innerText || '';
      const link = (a && (a.closest('a') || a.querySelector('a') || a)) || card.querySelector('a[href]');
      let href = link && link.getAttribute && link.getAttribute('href');
      const jk = card.getAttribute('data-jk') || (card.querySelector('[data-jk]') || { getAttribute: () => '' }).getAttribute('data-jk');
      if (!href && jk) href = '/viewjob?jk=' + jk;
      const title = (a && a.innerText || '').trim();
      if (title && title.length > 3) jobs.push({ title, company: q(hint[1].company).trim(), location: q(hint[1].loc).trim(), url: href ? abs(href, base) : '', description: (card.innerText || '').slice(0, 800) });
    });
    // 3b. Allgemeine Link-Heuristik
    if (jobs.length < 3) doc.querySelectorAll('a[href]').forEach(a => {
      const href = abs(a.getAttribute('href'), base), title = (a.innerText || a.textContent || '').trim().replace(/\s+/g, ' ');
      if (!LINK_RE.test(href) || title.length < 6 || title.length > 140) return;
      let card = a;
      for (let i = 0; i < 6; i++) {
        const p = card.parentElement; if (!p || p === doc.body) break;
        const n = new Set([...p.querySelectorAll('a[href]')].map(x => abs(x.getAttribute('href'), base)).filter(h => LINK_RE.test(h)));
        if (n.size > 1) break; card = p;
      }
      const lines = (card.innerText || card.textContent || '').split('\n').map(l => l.trim()).filter(l => l && l !== title);
      jobs.push({ title, company: lines[0] || '', location: lines[1] || '', url: href, description: lines.slice(2, 8).join(' ').slice(0, 600) });
    });
    const seen = new Set();
    return jobs.filter(j => { if (!j.title) return false; const k = j.url || (j.title + '|' + j.company).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map(j => Object.assign({ source: sourceName(host), from: base }, j));
  }
  function sourceName(h) { return /stepstone/.test(h) ? 'StepStone' : /indeed/.test(h) ? 'Indeed' : /linkedin/.test(h) ? 'LinkedIn' : /xing/.test(h) ? 'XING' : /google/.test(h) ? 'Google Jobs' : h.replace(/^www\./, ''); }
  async function details(jobs, max, delay, onProg) {
    // Detailseiten derselben Domain laden (nur Erweiterung/Lesezeichen, im Kontext des Nutzers). LinkedIn bewusst ausgenommen.
    const list = jobs.filter(j => j.url && new URL(j.url).origin === location.origin && !/linkedin\./.test(location.hostname) && (j.description || '').length < 300).slice(0, max);
    for (let i = 0; i < list.length; i++) {
      if (onProg) onProg(i + 1, list.length);
      try {
        const html = await (await fetch(list[i].url, { credentials: 'include' })).text();
        const d = new DOMParser().parseFromString(html, 'text/html');
        const full = extract(d, list[i].url).find(x => (x.description || '').length > 200);
        if (full) { Object.keys(full).forEach(k => { if (full[k] && (!list[i][k] || k === 'description')) list[i][k] = full[k]; }); }
      } catch {}
      await new Promise(r => setTimeout(r, delay));
    }
    return jobs;
  }
  async function pack(obj) {
    const json = JSON.stringify(obj);
    const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
    if (g.CompressionStream) {
      const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return 'z' + b64(new Uint8Array(await new Response(cs).arrayBuffer()));
    }
    return 'j' + b64(new TextEncoder().encode(json));
  }
  function toast(msg) {
    let t = document.getElementById('bl-toast');
    if (!t) { t = document.createElement('div'); t.id = 'bl-toast'; t.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;background:#1f5f8b;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.25)'; document.body.appendChild(t); }
    t.textContent = msg; clearTimeout(t._h); t._h = setTimeout(() => t.remove(), 6000);
  }
  async function run(appUrl, opts = {}) {
    let jobs = extract(document, location.href);
    if (!jobs.length) { toast('Bewerbungslotse: Keine Stellen auf dieser Seite erkannt.'); return; }
    if (opts.details) { toast(`Bewerbungslotse: ${jobs.length} Stellen erkannt, lade Stellentexte …`); await details(jobs, opts.max || 20, opts.delay || 1500, (i, n) => toast(`Bewerbungslotse: Stellentext ${i}/${n} …`)); }
    jobs = jobs.slice(0, 80).map(j => Object.assign(j, { description: (j.description || '').slice(0, opts.details ? 4000 : 1200) }));
    const data = await pack({ v: 1, from: location.href, at: new Date().toISOString(), jobs });
    const url = appUrl.replace(/#.*$/, '') + '#import=' + data;
    try { await navigator.clipboard.writeText(url); } catch {}
    const w = window.open(url, 'bewerbungslotse');
    toast(`Bewerbungslotse: ${jobs.length} Stellen übernommen.` + (w ? '' : ' Pop-up blockiert – Link wurde in die Zwischenablage kopiert, bitte in der App unter „Import“ einfügen.'));
  }
  g.BLExtract = { extract, details, pack, run, version: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
