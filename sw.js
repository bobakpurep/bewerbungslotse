/* Service Worker: App offline verfügbar machen (nur App-Dateien, keine Stellendaten) */
const CACHE = 'bewerbungslotse-v12';
const FILES = ['./', './index.html', './app.js', './data.js', './extractor.js', './berufe-ba.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './rechtliches/impressum.html', './rechtliches/datenschutz.html'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin) {
    // Netz zuerst (Updates), sonst Cache
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
  } else if (u.hostname === 'cdn.jsdelivr.net') {
    // Bibliotheken (PDF, Word, Texterkennung) nach erstem Laden offline verfügbar
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })));
  }
});
