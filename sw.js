// Service worker : garde le jeu en cache pour qu'il démarre vite (et même sans réseau, sauf le jeu en ligne).
// Fichiers du jeu : réseau d'abord (toujours la dernière version), cache si pas de réseau.
// Bibliothèques des CDN (Three.js, PeerJS, MQTT.js) : adresses à version fixe, donc cache d'abord.
const CACHE = 'ligue-boreale-v3';
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//;
const CORE = ['./', 'manifest.webmanifest', 'icones/icone-192.png', 'icones/icone-512.png', 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// la page envoie la liste des fichiers qu'elle a chargés (modules, icônes) pour les mettre en cache dès la première visite
self.addEventListener('message', (e) => {
  const list = e.data && e.data.cache;
  if (!Array.isArray(list)) return;
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    for (const u of list) {
      if (!(u.startsWith(self.location.origin) || CDN.test(u))) continue;
      if (!(await c.match(u))) { try { await c.add(u); } catch { /* fichier absent : ignoré */ } }
    }
  }));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (CDN.test(url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (!url.startsWith(self.location.origin)) return; // relais MQTT, serveurs PeerJS : jamais en cache
  // réseau d'abord; si le réseau tarde plus de 3 s (réseau cellulaire faible) et qu'une copie existe, on montre la copie
  // pendant que la nouvelle version se télécharge pour la prochaine fois
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  });
  const cached = () => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : undefined));
  e.waitUntil(net.catch(() => {}));
  e.respondWith(new Promise((done) => {
    let settled = false;
    const finish = (r) => { if (!settled && r) { settled = true; done(r); } };
    const timer = setTimeout(() => cached().then(finish), 3000);
    net.then((r) => { clearTimeout(timer); finish(r); })
      .catch(() => { clearTimeout(timer); cached().then((r) => { if (r) finish(r); else { settled = true; done(Response.error()); } }); });
  }));
});
