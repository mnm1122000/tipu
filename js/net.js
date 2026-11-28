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
// Every broker is tried AT THE SAME TIME and the first one that answers wins, so a blocked or
// dead broker no longer costs 7 seconds each. Indexes in BROKERS must never change order (they
// go into invite links and saved games), so new brokers are only ever appended.
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
    this.client = null;
    this.handlers = [];
    this.brokerIdx = -1;
    this.onStatus = () => {};
  }
  topic(sub) { return `${PREFIX}/${this.code}/${sub}`; }

  adopt(c, idx) {
    this.client = c; this.brokerIdx = idx;
    c.on('message', (t, payload) => this.dispatch(t, payload));
    c.on('reconnect', () => this.onStatus('reconnecting'));
    c.on('offline', () => this.onStatus('offline'));
    c.on('connect', () => this.onStatus('online'));
    this.onStatus('online');
    return idx;
  }

  async connectTo(idx, timeoutMs = 7000) {
    return this.adopt(await openClient(idx, timeoutMs), idx);
  }

  // Race every broker; keep the first that connects (the preferred one wins ties).
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

  dispatch(t, payload) {
    let data = null;
    const str = payload && payload.length ? td.decode(payload) : '';
    if (str) { try { data = JSON.parse(str); } catch (_) { return; } }
    for (const h of this.handlers) {
      const m = h.re.exec(t);
      if (m) h.fn(data, m[1], t);
    }
  }

  // sub may end with '+' wildcard; handler gets (data, wildcardValue).
  // Never hangs: if the broker drops before acknowledging, we carry on after a few seconds
  // (mqtt.js re-sends the subscription when it reconnects).
  subscribe(sub, fn) {
    const full = this.topic(sub);
    const re = new RegExp('^' + full.replace(/[.*?^${}()|[\]\\]/g, '\\$&').replace('\\+', '([^/]+)').replace('+', '([^/]+)') + '$');
    this.handlers.push({ re, fn });
    return new Promise((res) => {
      const t = setTimeout(res, 4000);
      try { this.client.subscribe(full, { qos: 1 }, () => { clearTimeout(t); res(); }); } catch (_) { clearTimeout(t); res(); }
    });
  }

  publish(sub, obj, { retain = false, qos = 1 } = {}) {
    if (!this.client) return;
    const payload = obj == null ? '' : JSON.stringify(obj);
    this.client.publish(this.topic(sub), payload, { qos, retain });
  }

  close() { try { this.client && this.client.end(true); } catch (_) {} this.client = null; }
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
        bus.subscribe('meta', (data) => {
          if (!data || !data.pub) return;
          clearTimeout(timer);
          if (found) { bus.close(); return; }
          found = true; resolve({ bus, meta: data });
        });
      }, miss);
    }
  });
}
