/* Bewerbungslotse – CORS-Proxy als Cloudflare Worker (kostenloser Tarif reicht für private Nutzung)
   Einrichtung: dash.cloudflare.com → Workers & Pages → Create → "Hello World" → Code ersetzen → Deploy.
   Die Worker-Adresse (https://NAME.KONTO.workers.dev) in der App unter Einstellungen → CORS-Proxy eintragen.

   Sicherheit: Es werden NUR die unten erlaubten Ziel-Adressen weitergeleitet (kein offener Proxy).
   ALLOWED_ORIGINS auf die eigene App-Adresse setzen, damit fremde Seiten den Proxy nicht nutzen. */

const ALLOWED_HOSTS = [
  'rest.arbeitsagentur.de',   // Jobbörse der Bundesagentur für Arbeit
  'ec.europa.eu',             // ESCO Berufe
  'www.arbeitnow.com',        // Arbeitnow
  'api.adzuna.com',           // Adzuna (eigener Schlüssel)
  'jooble.org', 'de.jooble.org', 'at.jooble.org', 'ch.jooble.org'  // Jooble (eigener Schlüssel, POST)
];
const POST_HOSTS = ['jooble.org', 'de.jooble.org', 'at.jooble.org', 'ch.jooble.org'];
const ALLOWED_ORIGINS = ['*']; // z. B. ['https://deinname.github.io']

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.includes('*') ? '*' : (ALLOWED_ORIGINS.includes(origin) ? origin : '');
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin || 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'X-API-Key, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!allowOrigin) return new Response('Origin nicht erlaubt', { status: 403, headers: cors });

    const target = new URL(req.url).searchParams.get('url');
    let u;
    try { u = new URL(target); } catch { return new Response('Parameter url fehlt', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) return new Response('Ziel nicht erlaubt', { status: 403, headers: cors });
    const isPost = req.method === 'POST';
    if (!(req.method === 'GET' || (isPost && POST_HOSTS.includes(u.hostname)))) return new Response('Methode nicht erlaubt', { status: 405, headers: cors });

    const headers = { 'Accept': 'application/json', 'User-Agent': 'Bewerbungslotse-Proxy' };
    const key = req.headers.get('X-API-Key'); if (key) headers['X-API-Key'] = key;

    if (isPost) headers['Content-Type'] = 'application/json';
    const upstream = await fetch(u.toString(), isPost
      ? { method: 'POST', headers, body: await req.text() }
      : { headers, cf: { cacheTtl: 300, cacheEverything: true } });
    const res = new Response(upstream.body, upstream);
    Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
    res.headers.delete('set-cookie');
    return res;
  }
};
