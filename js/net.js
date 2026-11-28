// TIPU! — transport. Public MQTT brokers relay messages (works on any
// Wi-Fi or mobile data, no server to run). Every private message between the
// host device and a player is end-to-end encrypted (ECDH P-256 + AES-GCM), so
// nobody listening on the broker can read anyone's hand.
/* global mqtt */

export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://mqtt.eclipseprojects.io:443/mqtt', // port 443: gets through networks that block odd ports
];
const PREFIX = 'tipu-liarsgame-v1';

const CLIENT_TAG = 'tp_';

const te = new TextEncoder();
const td = new TextDecoder();

export function b64(bytes) {
  const u = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

// ---------- crypto ----------
export async function genKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  return {
    pub: await crypto.subtle.exportKey('jwk', kp.publicKey),
    priv: await crypto.subtle.exportKey('jwk', kp.privateKey),
  };
}
const importPriv = (jwk) => crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
const importPub = (jwk) => crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

export async function deriveKey(privJwk, pubJwk) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: await importPub(pubJwk) },
    await importPriv(privJwk),
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}
export async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function unseal(key, { iv, ct }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
  return JSON.parse(td.decode(pt));
}

// ---------- MQTT bus ----------
// Players use ONE broker. The host uses ALL the brokers it can reach at once and bridges them:
// everything the host sends goes out on every broker, and player-to-player topics (photos etc.)
// are copied across, so a player whose network only reaches one broker still finds the table
// and sees everyone. Indexes in BROKERS must never change order (they go into invite links and
// saved games), so new brokers are only ever appended.
const RELAY = /\/(av|rv|gh)\/[^/]+$/; // player-to-player topics the host copies between brokers

function openClient(idx, timeoutMs) {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(BROKERS[idx], {
      clientId: CLIENT_TAG + Math.random().toString(36).slice(2, 12),
      clean: true, connectTimeout: timeoutMs, reconnectPeriod: 2000, keepalive: 20,
      protocolVersion: 4,
    });
    let done = false;
    const fail = (e) => { if (done) return; done = true; clearTimeout(timer); try { c.end(true); } catch (_) {} reject(e || new Error('timeout')); };
    const timer = setTimeout(() => fail(new Error('timeout')), timeoutMs + 500);
    c.once('connect', () => { if (done) { try { c.end(true); } catch (_) {} return; } done = true; clearTimeout(timer); resolve(c); });
    c.once('error', (e) => fail(e));
  });
}

export class Bus {
  constructor(code) {
    this.code = code;
    this.client = null;      // first broker (players: the only one)
    this.clients = new Map(); // idx -> mqtt client
    this.handlers = [];
    this.subs = new Set();    // full topics, replayed on brokers that connect later
    this.retained = new Map(); // full topic -> payload, replayed on brokers that connect later
    this.seen = new Map();    // topic\npayload -> { idx, t }: drops copies echoed back by other brokers
    this.brokerIdx = -1;
    this.bridge = false;
    this.closed = false;
    this.status = null;
    this.onStatus = () => {};
  }
  topic(sub) { return `${PREFIX}/${this.code}/${sub}`; }

  emitStatus() {
    const s = [...this.clients.values()].some((c) => c.connected) ? 'online' : 'reconnecting';
    if (s !== this.status) { this.status = s; this.onStatus(s); }
  }

  adopt(c, idx) {
    if (this.closed) { try { c.end(true); } catch (_) {} return idx; }
    this.clients.set(idx, c);
    if (!this.client) { this.client = c; this.brokerIdx = idx; }
    c.on('message', (t, payload, pkt) => this.onMessage(idx, t, payload, pkt));
    for (const ev of ['reconnect', 'offline', 'close', 'connect']) c.on(ev, () => this.emitStatus());
    for (const t of this.subs) c.subscribe(t, { qos: 1 });
    for (const [t, p] of this.retained) c.publish(t, p, { qos: 1, retain: true });
    this.emitStatus();
    return idx;
  }

  async connectTo(idx, timeoutMs = 7000) {
    return this.adopt(await openClient(idx, timeoutMs), idx);
  }

  // Race every broker; keep the first that connects (players).
  connectAny(preferred = 0, timeoutMs = 8000) {
    const order = [preferred, ...BROKERS.map((_, i) => i).filter((i) => i !== preferred)];
    return new Promise((resolve, reject) => {
      let won = false, failed = 0, last;
      for (const idx of order) {
        openClient(idx, timeoutMs).then((c) => {
          if (won) { try { c.end(true); } catch (_) {} return; }
          won = true; resolve(this.adopt(c, idx));
        }, (e) => {
          last = e;
          if (++failed === order.length && !won) reject(last || new Error('No broker reachable'));
        });
      }
    });
  }

  // Host: connect to EVERY broker. Resolves as soon as one is up; the rest join in the
  // background and brokers that failed are retried every 30 s.
  connectAll(preferred = 0, timeoutMs = 8000) {
    this.bridge = true;
    const order = [preferred, ...BROKERS.map((_, i) => i).filter((i) => i !== preferred)];
    this.subscribeRaw(this.topic('av/+')); this.subscribeRaw(this.topic('rv/+')); this.subscribeRaw(this.topic('gh/+'));
    return new Promise((resolve, reject) => {
      let first = false, failed = 0, last;
      const tryOne = (idx, initial) => {
        if (this.closed || this.clients.has(idx)) return;
        openClient(idx, timeoutMs).then((c) => {
          this.adopt(c, idx);
          if (!first) { first = true; resolve(idx); }
        }, (e) => {
          last = e;
          if (initial && ++failed === order.length && !first) { reject(last || new Error('No broker reachable')); return; }
          if (!this.closed) setTimeout(() => tryOne(idx, false), 30000);
        });
      };
      for (const idx of order) tryOne(idx, true);
    });
  }

  onMessage(idx, t, payload, pkt) {
    const str = payload && payload.length ? td.decode(payload) : '';
    if (this.bridge) {
      const key = t + '\n' + str, now = Date.now(), s = this.seen.get(key);
      if (s && s.idx !== idx && now - s.t < 8000) return; // our own copy coming back from another broker
      this.seen.set(key, { idx, t: now });
      if (this.seen.size > 400) for (const [k, v] of this.seen) if (now - v.t > 8000) this.seen.delete(k);
      if (RELAY.test(t)) {
        const retain = !!(pkt && pkt.retain) || /\/av\/[^/]+$/.test(t); // photos are always retained (brokers clear the flag on live delivery)
        if (retain) { if (str) this.retained.set(t, str); else this.retained.delete(t); }
        for (const [i, c] of this.clients) if (i !== idx) c.publish(t, str, { qos: retain ? 1 : 0, retain });
      }
    }
    this.dispatch(t, str);
  }

  dispatch(t, str) {
    let data = null;
    if (str) { try { data = JSON.parse(str); } catch (_) { return; } }
    for (const h of this.handlers) {
      const m = h.re.exec(t);
      if (m) h.fn(data, m[1], t);
    }
  }

  subscribeRaw(full) {
    this.subs.add(full);
    const acks = [...this.clients.values()].map((c) => new Promise((res) => {
      const tm = setTimeout(res, 4000);
      try { c.subscribe(full, { qos: 1 }, () => { clearTimeout(tm); res(); }); } catch (_) { clearTimeout(tm); res(); }
    }));
    // Never hangs: if a broker drops before acknowledging we carry on (mqtt.js re-subscribes on reconnect).
    return acks.length ? Promise.race(acks) : Promise.resolve();
  }

  // sub may end with '+' wildcard; handler gets (data, wildcardValue)
  subscribe(sub, fn) {
    const full = this.topic(sub);
    const re = new RegExp('^' + full.replace(/[.*?^${}()|[\]\\]/g, '\\$&').replace('\\+', '([^/]+)').replace('+', '([^/]+)') + '$');
    this.handlers.push({ re, fn });
    return this.subscribeRaw(full);
  }

  publish(sub, obj, { retain = false, qos = 1 } = {}) {
    if (!this.clients.size) return;
    const t = this.topic(sub);
    const payload = obj == null ? '' : JSON.stringify(obj);
    if (retain) { if (payload) this.retained.set(t, payload); else this.retained.delete(t); }
    for (const c of this.clients.values()) c.publish(t, payload, { qos, retain });
    if (this.bridge) { // deliver our own copy once, drop the echoes from every broker
      this.seen.set(t + '\n' + payload, { idx: -1, t: Date.now() });
      setTimeout(() => this.dispatch(t, payload), 0);
    }
  }

  close() {
    this.closed = true;
    for (const c of this.clients.values()) { try { c.end(true); } catch (_) {} }
    this.clients.clear(); this.client = null;
  }
}

// Find which broker a lobby lives on by looking for its retained "meta" message.
// All brokers are searched at once; the first one holding the lobby wins.
export function findLobby(code, preferred = null, waitMs = 4000) {
  const order = preferred != null && BROKERS[preferred] ? [preferred, ...BROKERS.map((_, i) => i).filter((i) => i !== preferred)] : BROKERS.map((_, i) => i);
  return new Promise((resolve) => {
    let found = false, pending = order.length;
    const miss = () => { if (--pending === 0 && !found) resolve(null); };
    for (const idx of order) {
      const bus = new Bus(code);
      bus.connectTo(idx, 6000).then(() => {
        if (found) { bus.close(); return miss(); }
        const timer = setTimeout(() => { bus.close(); miss(); }, waitMs);
        let seen = false; // later meta updates (e.g. the game starting) must not touch this bus again
        bus.subscribe('meta', (data) => {
          if (seen || !data || !data.pub) return;
          seen = true; clearTimeout(timer);
          if (found) { bus.close(); return miss(); }
          found = true; resolve({ bus, meta: data });
        });
      }, miss);
    }
  });
}
