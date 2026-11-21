// TIPU! — transport. Public MQTT brokers relay messages (works on any
// Wi-Fi or mobile data, no server to run). Every private message between the
// host device and a player is end-to-end encrypted (ECDH P-256 + AES-GCM), so
// nobody listening on the broker can read anyone's hand.
/* global mqtt */

export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const PREFIX = 'tipu-liarsgame-v1';

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
export class Bus {
  constructor(code) {
    this.code = code;
    this.client = null;
    this.handlers = [];
    this.brokerIdx = -1;
    this.onStatus = () => {};
  }
  topic(sub) { return `${PREFIX}/${this.code}/${sub}`; }

  connectTo(idx, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
      const url = BROKERS[idx];
      const c = mqtt.connect(url, {
        clientId: 'tp_' + Math.random().toString(36).slice(2, 12),
        clean: true, connectTimeout: timeoutMs, reconnectPeriod: 2000, keepalive: 20,
        protocolVersion: 4,
      });
      let done = false;
      const fail = (e) => { if (done) return; done = true; try { c.end(true); } catch (_) {} reject(e || new Error('timeout')); };
      const timer = setTimeout(() => fail(new Error('timeout')), timeoutMs + 500);
      c.once('connect', () => {
        if (done) return; done = true; clearTimeout(timer);
        this.client = c; this.brokerIdx = idx;
        c.on('message', (t, payload) => this.dispatch(t, payload));
        c.on('reconnect', () => this.onStatus('reconnecting'));
        c.on('offline', () => this.onStatus('offline'));
        c.on('connect', () => this.onStatus('online'));
        this.onStatus('online');
        resolve(idx);
      });
      c.once('error', (e) => fail(e));
    });
  }

  async connectAny(preferred = 0) {
    const order = [preferred, ...BROKERS.map((_, i) => i).filter((i) => i !== preferred)];
    let last;
    for (const i of order) {
      try { return await this.connectTo(i); } catch (e) { last = e; }
    }
    throw last || new Error('No broker reachable');
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

  // sub may end with '+' wildcard; handler gets (data, wildcardValue)
  subscribe(sub, fn) {
    const full = this.topic(sub);
    const re = new RegExp('^' + full.replace(/[.*?^${}()|[\]\\]/g, '\\$&').replace('\\+', '([^/]+)').replace('+', '([^/]+)') + '$');
    this.handlers.push({ re, fn });
    return new Promise((res) => this.client.subscribe(full, { qos: 1 }, () => res()));
  }

  publish(sub, obj, { retain = false, qos = 1 } = {}) {
    if (!this.client) return;
    const payload = obj == null ? '' : JSON.stringify(obj);
    this.client.publish(this.topic(sub), payload, { qos, retain });
  }

  close() { try { this.client && this.client.end(true); } catch (_) {} this.client = null; }
}

// Find which broker a lobby lives on by looking for its retained "meta" message.
export async function findLobby(code, preferred = null, waitMs = 3500) {
  const order = preferred != null ? [preferred, ...BROKERS.map((_, i) => i).filter((i) => i !== preferred)] : BROKERS.map((_, i) => i);
  for (const idx of order) {
    const bus = new Bus(code);
    try { await bus.connectTo(idx, 6000); } catch (_) { continue; }
    const meta = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), waitMs);
      bus.subscribe('meta', (data) => { if (data && data.pub) { clearTimeout(timer); resolve(data); } });
    });
    if (meta) return { bus, meta };
    bus.close();
  }
  return null;
}
