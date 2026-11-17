// Connexion entre deux joueurs, avec un code de partie de 5 lettres.
// 1) Connexion directe entre les deux navigateurs (WebRTC, avec PeerJS pour se trouver).
// 2) Plan B automatique si un réseau bloque la connexion directe (réseau d'école, LTE…) : les messages passent par
//    un relais public (MQTT sur WebSocket, port web 443). Le relais ajoute un peu de délai mais passe presque partout.
const PEER_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const MQTT_URL = 'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js';
// deux relais publics : l'hôte écoute sur les deux, l'invité essaie les deux en même temps
const BROKERS = [
  { url: 'wss://public.cloud.shiftr.io', opts: { username: 'public', password: 'public' } }, // port 443
  { url: 'wss://test.mosquitto.org:8081', opts: {} },
];
const PREFIX = 'ligueboreale-hockey-v1-';
const TOPIC = 'ligueboreale-hockey/v1/';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans O/0 ni I/1, faciles à confondre
const DIRECT_WAIT = 7000;   // délai accordé à la connexion directe avant de passer au relais
const JOIN_TIMEOUT = 30000; // abandon complet

const loaded = {};
function load(url, global) {
  if (window[global]) return Promise.resolve();
  if (!loaded[url]) loaded[url] = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = url; s.onload = () => ok(); s.onerror = () => { loaded[url] = null; fail(new Error('net')); };
    document.head.appendChild(s);
  });
  return loaded[url];
}
const rand = (n) => Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

const ERRORS = {
  'browser-incompatible': 'Ce navigateur ne permet pas le jeu en ligne. Essaie Chrome, Edge ou Firefox.',
};

// Lien avec l'autre joueur : send(msg), onMessage, onClose, close(), ping (ms), via ('direct' ou 'relais')
class Link {
  constructor(via) { this.via = via; this.onMessage = () => {}; this.onClose = () => {}; this.ping = 0; this.closed = false; this.lastRx = 0; }
  start() {
    this.lastRx = performance.now();
    // battement de cœur : sans nouvelles depuis 9 s, l'autre ordinateur est parti
    this.pingT = setInterval(() => { this.send({ k: 'ping', t: performance.now() }); if (performance.now() - this.lastRx > 9000) this.end(); }, 1000);
  }
  deliver(msg) {
    this.lastRx = performance.now();
    if (!msg || typeof msg !== 'object') return;
    if (msg.k === 'ping') return this.send({ k: 'pong', t: msg.t });
    if (msg.k === 'pong') { const p = performance.now() - msg.t; this.ping = this.ping ? this.ping * 0.7 + p * 0.3 : p; return; }
    this.onMessage(msg);
  }
  end() { if (!this.closed) { this.closed = true; clearInterval(this.pingT); this.dispose(); this.onClose(); } }
  close() { if (!this.closed) { this.closed = true; clearInterval(this.pingT); this.dispose(); } }
}

class DirectLink extends Link {
  constructor(conn, peer) { super('direct'); this.conn = conn; this.peer = peer; }
  send(msg) { if (this.conn.open) try { this.conn.send(msg); } catch { /* canal fermé */ } }
  dispose() { try { this.conn.close(); } catch { /* déjà fermée */ } }
}

class RelayLink extends Link {
  constructor(client, outTopic) { super('relais'); this.client = client; this.out = outTopic; }
  send(msg) { if (this.client.connected) this.client.publish(this.out, JSON.stringify(msg), { qos: 0 }); }
  dispose() { /* le client MQTT est fermé par la session */ }
}

async function relayClients() {
  await load(MQTT_URL, 'mqtt');
  return BROKERS.map((b) => window.mqtt.connect(b.url, { connectTimeout: 8000, reconnectPeriod: 2000, clean: true, keepalive: 30,
    clientId: 'lbh-' + rand(12).toLowerCase(), ...b.opts }));
}
const endAll = (list, keep) => { for (const r of list) if (r !== keep) try { r.end(true); } catch { /* rien */ } };

// ---------- créer une partie ----------
// h.code(code), h.connected(link), h.error(texte)
export async function hostGame(h) {
  let bound = null, peer = null, relays = [], cancelled = false, shown = false, tries = 0;
  const c = { code: rand(5) };
  const cleanup = (keep) => {
    if (peer && keep !== 'direct') try { peer.destroy(); } catch { /* rien */ }
    endAll(relays);
  };
  const bind = (link) => {
    if (bound || cancelled) { link.close(); return; }
    bound = link; link.start();
    const close0 = link.dispose.bind(link);
    link.dispose = () => { close0(); cleanup(); };
    // l'autre moyen de connexion n'est plus utile
    if (link.via === 'direct') endAll(relays); else endAll(relays, link.client);
    h.connected(link);
  };
  const show = () => { if (!shown && !cancelled) { shown = true; h.code(c.code); } };

  // connexion directe
  const startPeer = () => {
    peer = new window.Peer(PREFIX + c.code, { debug: 0 });
    peer.on('open', show);
    peer.on('connection', (conn) => {
      if (bound) { conn.on('open', () => { conn.send({ k: 'full' }); setTimeout(() => conn.close(), 500); }); return; }
      const link = new DirectLink(conn, peer);
      conn.on('data', (d) => link.deliver(d));
      conn.on('close', () => link.end());
      conn.on('error', () => link.end());
      conn.on('open', () => bind(link)); // une tentative ratée ne bloque plus les suivantes
    });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && tries++ < 5 && !shown) { peer.destroy(); c.code = rand(5); startPeer(); return; }
      if (e.type === 'browser-incompatible' && !bound) h.error(ERRORS['browser-incompatible']);
      // les autres erreurs (serveur de connexion injoignable…) : le relais prend le relais
    });
    peer.on('disconnected', () => { if (!bound && !cancelled) try { peer.reconnect(); } catch { /* rien */ } });
  };
  // relais
  const startRelay = async () => {
    try { relays = await relayClients(); } catch { return; }
    if (cancelled || bound) { endAll(relays); return; }
    const inbox = TOPIC + c.code + '/hote';
    for (const relay of relays) {
      relay.on('connect', () => { relay.subscribe(inbox, { qos: 0 }); setTimeout(show, 1500); });
      relay.on('message', (topic, buf) => {
        let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }
        if (bound && bound.via === 'relais' && bound.client === relay && msg.gid === bound.gid) { bound.deliver(msg); return; }
        if (msg.k !== 'hello' || !msg.gid) return;
        const out = TOPIC + c.code + '/invite/' + msg.gid;
        if (bound) { if (!(bound.via === 'relais' && msg.gid === bound.gid)) relay.publish(out, JSON.stringify({ k: 'full' })); return; }
        const link = new RelayLink(relay, out);
        link.gid = msg.gid;
        relay.publish(out, JSON.stringify({ k: 'welcome' }));
        bind(link);
      });
    }
  };

  try { await load(PEER_URL, 'Peer'); startPeer(); } catch { /* PeerJS injoignable : relais seulement */ }
  startRelay();
  setTimeout(() => { if (!shown && !cancelled) h.error('Impossible de joindre les serveurs de connexion. Vérifie ta connexion Internet.'); }, 15000);
  return { cancel: () => { cancelled = true; if (bound) bound.close(); cleanup(); } };
}

// ---------- rejoindre une partie ----------
// h.status(texte), h.connected(link), h.error(texte)
export async function joinGame(code, h) {
  let done = false, peer = null, relays = [], relayStarted = false;
  const gid = rand(10);
  const finish = (link, err) => {
    if (done) { if (link) link.close(); return; }
    done = true; clearTimeout(timer); clearTimeout(fallback);
    if (link) {
      endAll(relays, link.client);
      if (link.via === 'relais' && peer) { try { peer.destroy(); } catch { /* rien */ } }
      const d0 = link.dispose.bind(link);
      link.dispose = () => { d0(); try { if (peer) peer.destroy(); } catch { /* rien */ } endAll(relays); };
      link.start(); h.connected(link);
    } else {
      try { if (peer) peer.destroy(); } catch { /* rien */ }
      endAll(relays);
      if (err) h.error(err);
    }
  };
  const timer = setTimeout(() => finish(null, 'Ton ami ne répond pas. Vérifie le code et que ton ami attend toujours sur l\'écran du code.'), JOIN_TIMEOUT);

  const startRelay = async () => {
    if (relayStarted || done) return;
    relayStarted = true;
    h.status('Connexion directe bloquée par le réseau : passage par le relais…');
    try { relays = await relayClients(); } catch { finish(null, 'Impossible de charger le relais. Vérifie ta connexion Internet.'); return; }
    if (done) { endAll(relays); return; }
    const inbox = TOPIC + code + '/invite/' + gid, out = TOPIC + code + '/hote';
    for (const relay of relays) {
      const link = new RelayLink(relay, out);
      // l'hôte reconnaît l'invité par son identifiant dans chaque message
      const send0 = link.send.bind(link);
      link.send = (msg) => send0({ ...msg, gid });
      let hello = null;
      relay.on('connect', () => {
        relay.subscribe(inbox, { qos: 0 }, () => {
          const say = () => { if (!done) relay.publish(out, JSON.stringify({ k: 'hello', gid })); else clearInterval(hello); };
          say(); clearInterval(hello); hello = setInterval(say, 1500);
        });
      });
      relay.on('message', (topic, buf) => {
        let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }
        if (!done) {
          if (msg.k === 'welcome') { clearInterval(hello); finish(link); }
          else if (msg.k === 'full') { clearInterval(hello); finish(null, 'Cette partie a déjà deux joueurs.'); }
          return;
        }
        link.deliver(msg);
      });
    }
  };
  const fallback = setTimeout(startRelay, DIRECT_WAIT);

  h.status('Recherche de la partie…');
  try { await load(PEER_URL, 'Peer'); } catch { startRelay(); return { cancel: () => finish(null, '') }; }
  peer = new window.Peer(PREFIX + 'invite-' + rand(8), { debug: 0 });
  peer.on('open', () => {
    h.status('Partie trouvée, connexion directe…');
    const conn = peer.connect(PREFIX + code, { serialization: 'json', reliable: true });
    const link = new DirectLink(conn, peer);
    conn.on('data', (d) => {
      if (!done && d && d.k === 'full') return finish(null, 'Cette partie a déjà deux joueurs.');
      link.deliver(d);
    });
    conn.on('open', () => finish(link));
    conn.on('close', () => { if (done) link.end(); });
    conn.on('error', () => { if (done) link.end(); else startRelay(); });
  });
  peer.on('error', (e) => {
    if (done) return;
    if (e.type === 'browser-incompatible') return finish(null, ERRORS['browser-incompatible']);
    startRelay(); // code introuvable en direct, serveur injoignable, échec WebRTC… : on tente le relais
  });
  return { cancel: () => { if (!done) { done = true; clearTimeout(timer); clearTimeout(fallback); try { if (peer) peer.destroy(); } catch { /* rien */ } endAll(relays); } } };
}
