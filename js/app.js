// TIPU! — app: screens, host loop, client flow, table animations, the reveal and the gun.
import { Game, MIN_PLAYERS, MAX_PLAYERS, RANK_NAME, RANK_PLURAL, TIMERS, FLIP_MS, BET_MS, oddsNext, deckMix, HAND } from './engine.js?v=1';
import * as net from './net.js?v=1';
import { sfx, vibrate } from './sfx.js?v=1';
import { Revolver } from './gun.js?v=1';

// ======================================================================
// utils
// ======================================================================
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
const SLOT = params.get('slot') ? '_' + params.get('slot') : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => CODE_ALPHA[b % CODE_ALPHA.length]).join('');
const store = {
  get(k, d = null) { try { const v = localStorage.getItem('tipu_' + k + SLOT); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('tipu_' + k + SLOT, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem('tipu_' + k + SLOT); } catch (_) {} },
};
const EMOJIS = ['😎', '🤠', '🦊', '🐼', '🐯', '🐸', '🦄', '🐙', '👻', '🤖', '👽', '🐵', '🦁', '🐧', '🍉', '🌶️', '🔥', '🎩'];
const plural = (n, r) => `${n} ${n > 1 ? RANK_PLURAL[r] : RANK_NAME[r]}`;

let toastTimer = null;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
function netBanner(msg) {
  const n = $('#net');
  if (!msg) { n.classList.add('hidden'); return; }
  n.textContent = msg; n.classList.remove('hidden');
}

const App = {
  mode: null, code: null, me: null, bus: null,
  game: null, hostKeys: null, pubs: {}, keyP: {}, chain: {}, seen: {}, lastSent: {},
  ident: null, hostKey: null, hostPub: null,
  view: null, lastViewAt: 0,
  profile: store.get('profile', { name: '', emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)] }),
  screen: 'home', screenData: {},
  sel: new Set(),
  modalKind: null,
  flip: null,          // { at, cards } — reveal animation clock
  gun: null,           // { pid, r: Revolver, watch }
  deadlineAt: 0,
  avatars: {},
};
window.__app = App; // debugging / test bench
const P = (id) => App.view && App.view.players.find((p) => p.id === id);
const nameOf = (id) => (id === App.me ? 'You' : P(id)?.name || '?');
const NameOf = (id) => (id === App.me ? 'You' : P(id)?.name || '?');

// ======================================================================
// profile photos (selfie / gallery) — shared on a retained relay topic per player
// ======================================================================
function avHTML(id, emoji, cls = 'av') {
  const img = id === App.me ? App.profile.photo || App.avatars[id] : App.avatars[id];
  return img ? `<div class="${cls} photo" data-av="${esc(id)}" style="background-image:url('${img}')"></div>`
    : `<div class="${cls}" data-av="${esc(id)}">${esc(emoji || '🙂')}</div>`;
}
function fileToPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that picture.')); };
    img.src = url;
  });
}
function publishPhoto() {
  if (!App.bus || !App.me) return;
  App.bus.publish('av/' + App.me, App.profile.photo ? { img: App.profile.photo } : null, { retain: true });
}
function onAvatar(data, id) {
  if (data && typeof data.img === 'string' && data.img.startsWith('data:image/') && data.img.length < 60000) App.avatars[id] = data.img;
  else if (!data) delete App.avatars[id];
  else return;
  if (App.screen === 'game') render();
}
async function onPicked(file) {
  if (!file) return;
  try {
    App.profile.photo = await fileToPhoto(file);
    store.set('profile', App.profile);
    publishPhoto();
    render();
  } catch (e) { toast(e.message); }
}
$('#filePick').addEventListener('change', (e) => { onPicked(e.target.files[0]); e.target.value = ''; });
$('#camPick').addEventListener('change', (e) => { onPicked(e.target.files[0]); e.target.value = ''; });

// ======================================================================
// wake lock + audio unlock
// ======================================================================
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (_) {}
}
for (const ev of ['touchend', 'click', 'keydown', 'pointerup']) {
  document.addEventListener(ev, () => { if (!sfx.ready || (sfx.mediaEl && sfx.mediaEl.paused)) sfx.unlock(); keepAwake(); }, true);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    keepAwake(); sfx.unlock();
    if (App.mode === 'client' && App.bus) sendHost({ type: 'sync' });
  }
});
function testSound() {
  sfx.unlock();
  if (sfx.muted) sfx.setMuted(false);
  setTimeout(() => { sfx.play('cock'); sfx.play('bang', { delay: 0.5 }); }, 60);
  vibrate([120, 60, 400]);
  setTimeout(() => toast(sfx.ready ? '🔊 Sound is ON. Hear nothing? Raise the media volume and turn Silent mode off.' : '⚠️ Sound is blocked. Tap again.', 5000), 900);
}

// ======================================================================
// HOST
// ======================================================================
async function hostCreate() {
  App.mode = 'host';
  App.code = genCode();
  App.me = 'h_' + rid(8);
  App.hostKeys = await net.genKeys();
  App.game = Game.create(App.code, { id: App.me, name: App.profile.name, emoji: App.profile.emoji });
  App.bus = new net.Bus(App.code);
  await App.bus.connectAny(0);
  await hostWire();
}
async function hostResume(saved) {
  App.mode = 'host';
  App.code = saved.code; App.me = saved.me; App.hostKeys = saved.hostKeys; App.pubs = saved.pubs || {};
  App.game = new Game(saved.state);
  App.bus = new net.Bus(App.code);
  try { await App.bus.connectTo(saved.broker ?? 0); } catch (_) { await App.bus.connectAny(0); }
  await hostWire();
}
async function hostWire() {
  const bus = App.bus;
  bus.onStatus = (s) => netBanner(s === 'online' ? null : 'Connection lost. Reconnecting…');
  await bus.subscribe('up', onHostUp);
  await bus.subscribe('av/+', onAvatar);
  await bus.subscribe('rv/+', onRv);
  publishMeta(true);
  publishPhoto();
  App.screen = 'game';
  store.set('last', { code: App.code, host: true, at: Date.now() });
  clearInterval(App.loop); clearInterval(App.beat);
  App.loop = setInterval(hostTick, 120);
  App.beat = setInterval(() => broadcast(true), 4000);
  afterChange();
}
function publishMeta(force = false) {
  const open = App.game.s.phase === 'lobby';
  if (!force && App._metaOpen === open && Date.now() - (App._metaAt || 0) < 60000) return;
  App._metaOpen = open; App._metaAt = Date.now();
  App.bus.publish('meta', { v: 1, pub: App.hostKeys.pub, open, at: Date.now() }, { retain: true });
}
function keyFor(pid) {
  if (!App.keyP[pid] && App.pubs[pid]) App.keyP[pid] = net.deriveKey(App.hostKeys.priv, App.pubs[pid]);
  return App.keyP[pid] || null;
}
async function onHostUp(data) {
  if (!data || typeof data.pid !== 'string' || data.pid.length > 40) return;
  const pid = data.pid;
  const g = App.game;
  if (data.t === 'hello') {
    if (!data.pub || !data.pub.x) return;
    const known = App.pubs[pid];
    if (known && (known.x !== data.pub.x || known.y !== data.pub.y)) { App.bus.publish('dn/' + pid, { t: 'reject', reason: 'This identity is already in use.' }); return; }
    if (!g.p(pid) && g.s.phase !== 'lobby') { App.bus.publish('dn/' + pid, { t: 'reject', reason: 'This game has already started. Ask the host to go back to the lobby.' }); return; }
    if (!g.p(pid) && g.s.players.length >= MAX_PLAYERS) { App.bus.publish('dn/' + pid, { t: 'reject', reason: 'The table is full (10 players).' }); return; }
    if (!known) { App.pubs[pid] = data.pub; saveHost(); }
    keyFor(pid);
    return;
  }
  if (data.t !== 'm') return;
  const kp = keyFor(pid);
  if (!kp) { App.bus.publish('dn/' + pid, { t: 'who' }); return; }
  let msg;
  try { msg = await net.unseal(await kp, data); } catch (_) { return; }
  App.seen[pid] = Date.now();
  switch (msg.type) {
    case 'join': {
      const res = g.addPlayer({ id: pid, name: msg.name, emoji: msg.emoji });
      if (!res.ok) { sendTo(pid, { type: 'error', error: res.error, fatal: true }); return; }
      if (!res.rejoin) sfx.play('join');
      afterChange(); sendView(pid, true);
      break;
    }
    case 'sync': sendView(pid, true); break;
    case 'ping': if (!App.lastSent[pid]) sendView(pid, true); break;
    case 'act': {
      if (!g.p(pid)) return;
      const res = g.handle(pid, msg.a || {}, Date.now());
      if (!res.ok && res.error) sendTo(pid, { type: 'error', error: res.error });
      afterChange();
      break;
    }
  }
}
function sendTo(pid, obj) {
  const kp = keyFor(pid);
  if (!kp) return Promise.resolve();
  const prev = App.chain[pid] || Promise.resolve();
  const p = prev.then(async () => {
    const sealed = await net.seal(await kp, obj);
    App.bus && App.bus.publish('dn/' + pid, { t: 'm', ...sealed });
  }).catch(() => {});
  App.chain[pid] = p;
  return p;
}
function decorate(v) {
  const now = Date.now();
  v.players.forEach((p) => { p.online = p.id === App.game.s.hostId || !!p.bot || (App.seen[p.id] && now - App.seen[p.id] < 16000); });
  return v;
}
function sendView(pid, force = false) {
  const v = App.game.viewFor(pid);
  if (!v) return;
  decorate(v);
  const { deadline, ...cmp } = v;
  if (cmp.reveal) cmp.reveal = { ...cmp.reveal, left: 0 };
  if (cmp.gun) cmp.gun = { ...cmp.gun, left: 0 };
  const key = JSON.stringify(cmp);
  if (!force && App.lastSent[pid] === key) return;
  App.lastSent[pid] = key;
  sendTo(pid, { type: 'view', v });
}
function broadcast(force = false) {
  if (!App.game) return;
  for (const p of App.game.s.players) if (!p.bot && p.id !== App.me) sendView(p.id, force);
  if (force) publishMeta();
}
let saveTimer = null;
function saveHost() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!App.game) return;
    store.set('host', { code: App.code, me: App.me, hostKeys: App.hostKeys, pubs: App.pubs, state: App.game.s, broker: App.bus ? App.bus.brokerIdx : 0, savedAt: Date.now() });
  }, 300);
}
// engine events carry no secrets (hands travel in each player's encrypted view): one public copy each
function deliverEvents() {
  const evs = App.game.drainEvents();
  for (const e of evs) {
    App.bus.publish('fx', e, { qos: 0 });
    onFx(e);
  }
}
function afterChange() {
  const g = App.game;
  if (!g) return;
  deliverEvents();
  saveHost();
  publishMeta();
  broadcast();
  applyView(decorate(g.viewFor(App.me)));
}
function hostTick() {
  const g = App.game;
  if (!g) return;
  const now = Date.now();
  if (g.tick(now)) afterChange();
  runBots(now);
}

// ---- bots (host side: ?dev=1 "Add bot") ----
function addBot() {
  const names = ['Ali', 'Badrul', 'Chloe', 'Dina', 'Eiman', 'Farah', 'Ganesh', 'Hana', 'Irfan', 'Jun'];
  const used = new Set(App.game.s.players.map((p) => p.name));
  const name = names.find((n) => !used.has(n)) || 'Bot ' + rid(3);
  App.game.addPlayer({ id: 'b_' + rid(6), name, emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)], bot: true });
  afterChange();
}
// a simple liar's brain, shared by host bots and test-bench phones
function brain({ hand, table, lastN, forced, canCall, pile }) {
  if (forced) return { type: 'liar' };
  const truthy = hand.filter((c) => c.r === table || c.r === 'J');
  if (canCall) {
    let p = 0.16 + 0.13 * (lastN - 1) + 0.06 * truthy.length + (pile > 8 ? 0.08 : 0);
    if (!hand.length) p = 1;
    if (Math.random() < Math.min(0.8, p)) return { type: 'liar' };
  }
  const devil = hand.find((c) => c.r === 'D');
  if (devil && Math.random() < 0.35) return { type: 'play', cards: [devil.id] };
  const others = hand.filter((c) => c.r !== table && c.r !== 'J' && c.r !== 'D');
  let pick = [];
  if (truthy.length) {
    pick = truthy.slice(0, 1 + Math.floor(Math.random() * Math.min(2, truthy.length)));
    if (others.length && Math.random() < 0.25 && pick.length < 3) pick.push(others[0]);
  } else {
    const pool = others.length ? others : hand.filter((c) => c.r !== 'D');
    pick = pool.slice(0, Math.random() < 0.3 && pool.length > 1 ? 2 : 1);
  }
  if (!pick.length) pick = [hand[0]];
  return { type: 'play', cards: pick.map((c) => c.id) };
}
function runBots(now) {
  const g = App.game, s = g.s;
  let changed = false;
  if (s.phase === 'reveal' && s.reveal.stage === 'bet') {
    for (const b of g.bettors()) if (b.bot && !s.reveal.bets[b.id] && Math.random() < 0.05) { g.handle(b.id, { type: 'bet', pick: Math.random() < 0.5 ? 'lie' : 'truth' }, now); changed = true; }
  }
  if (s.phase === 'gun') {
    for (const id of s.gun.shooters) {
      const b = g.p(id);
      if (!b.bot || id in s.gun.done) continue;
      App.botGun = App.botGun || {};
      if (!App.botGun[id]) App.botGun[id] = now + 3500 + Math.random() * 2500;
      if (now > App.botGun[id]) { delete App.botGun[id]; g.handle(id, { type: 'fire' }, now); changed = true; }
    }
  } else App.botGun = {};
  if (s.phase === 'play') {
    const b = g.p(s.turn);
    if (b && b.bot) {
      const key = `${s.round}:${s.turn}:${s.pile}`;
      if (App.botKey !== key) { App.botKey = key; App.botAt = now + 1400 + Math.random() * 1600; }
      else if (now > App.botAt) {
        App.botKey = null;
        const a = brain({ hand: b.hand, table: s.table, lastN: s.lastPlay ? s.lastPlay.n : 0, forced: s.forced, canCall: !!s.lastPlay && s.lastPlay.by !== b.id, pile: s.pile });
        g.handle(b.id, a, now); changed = true;
      }
    }
  }
  if (changed) afterChange();
}

async function closeTable() {
  if (App.mode !== 'host') return;
  for (const p of App.game.s.players) if (!p.bot && p.id !== App.me) sendTo(p.id, { type: 'error', error: 'The host closed the table.', fatal: true });
  App.bus.publish('meta', null, { retain: true });
  for (const p of App.game.s.players) App.bus.publish('av/' + p.id, null, { retain: true });
  store.del('host'); store.del('last');
  await sleep(900);
  teardown();
}

// ======================================================================
// CLIENT
// ======================================================================
async function clientJoin(code, preferredBroker = null) {
  App.mode = 'client';
  App.code = code;
  setScreen('connecting', { msg: `Looking for table ${code}…` });
  const found = await net.findLobby(code, preferredBroker);
  if (!found) { App.mode = null; setScreen('home', { code }); toast('Table not found. Check the code.'); return; }
  App.bus = found.bus;
  let ident = store.get('id_' + code);
  if (!ident) { ident = { pid: 'p_' + rid(10), keys: await net.genKeys() }; store.set('id_' + code, ident); }
  App.ident = ident; App.me = ident.pid;
  App.hostPub = found.meta.pub;
  App.hostKey = await net.deriveKey(ident.keys.priv, found.meta.pub);
  const bus = App.bus;
  bus.onStatus = (s) => { if (s === 'online') { netBanner(null); clientHello(); } else netBanner('Connection lost. Reconnecting…'); };
  await bus.subscribe('dn/' + App.me, onClientDn);
  await bus.subscribe('av/+', onAvatar);
  await bus.subscribe('rv/+', onRv);
  publishPhoto();
  await bus.subscribe('fx', (e) => { if (e && typeof e.type === 'string' && App.view) onFx(e); });
  await bus.subscribe('meta', async (m) => {
    if (!m) { if (App.view && App.mode === 'client') { toast('The host closed the table.', 3500); store.del('last'); teardown(); } return; }
    if (m.pub && m.pub.x !== App.hostPub.x) { App.hostPub = m.pub; App.hostKey = await net.deriveKey(ident.keys.priv, m.pub); clientHello(); }
  });
  store.set('last', { code, broker: bus.brokerIdx, at: Date.now() });
  await clientHello();
  setScreen('connecting', { msg: 'Pulling up a stool…' });
  clearInterval(App.beat);
  App.beat = setInterval(() => {
    sendHost({ type: 'ping' });
    if (App.view && Date.now() - App.lastViewAt > 13000) { netBanner('Waiting for the host…'); sendHost({ type: 'sync' }); }
  }, 5000);
  setTimeout(() => { if (!App.view && App.mode === 'client') { netBanner('The host is not answering…'); clientHello(); } }, 6000);
}
async function clientHello() {
  if (!App.bus || !App.ident) return;
  App.bus.publish('up', { t: 'hello', pid: App.me, pub: App.ident.keys.pub });
  await sleep(250);
  await sendHost({ type: 'join', name: App.profile.name, emoji: App.profile.emoji });
}
async function sendHost(obj) {
  if (!App.hostKey || !App.bus) return;
  const sealed = await net.seal(App.hostKey, obj);
  App.bus.publish('up', { t: 'm', pid: App.me, ...sealed });
}
let dnChain = Promise.resolve();
function onClientDn(data) { dnChain = dnChain.then(() => handleDn(data)).catch(() => {}); }
async function handleDn(data) {
  if (!data) return;
  if (data.t === 'reject') { toast(data.reason, 4000); store.del('last'); teardown(); return; }
  if (data.t === 'who') { clientHello(); return; }
  if (data.t !== 'm') return;
  let msg;
  try { msg = await net.unseal(App.hostKey, data); } catch (_) { return; }
  if (msg.type === 'view') { App.lastViewAt = Date.now(); netBanner(null); App.screen = 'game'; applyView(msg.v); }
  else if (msg.type === 'error') {
    toast(msg.error, 3500);
    sfx.play('error');
    if (msg.fatal) { store.del('last'); teardown(); }
  }
}

function teardown() {
  clearInterval(App.loop); clearInterval(App.beat);
  if (App.bus) App.bus.close();
  gunClose(true);
  Object.assign(App, { mode: null, code: null, me: null, bus: null, game: null, view: null, pubs: {}, keyP: {}, chain: {}, seen: {}, lastSent: {}, ident: null, hostKey: null, flip: null });
  App.sel.clear();
  closeModal();
  netBanner(null);
  setScreen('home');
}

function act(a) {
  if (App.mode === 'host') {
    const res = App.game.handle(App.me, a, Date.now());
    if (!res.ok && res.error) { toast(res.error); sfx.play('error'); }
    afterChange();
  } else if (App.mode === 'client') sendHost({ type: 'act', a });
}

// ======================================================================
// view + reactions
// ======================================================================
function applyView(v) {
  try { applyViewInner(v); } catch (err) { console.error('[tipu] view', err); (window.__appErrs = window.__appErrs || []).push(String(err && err.stack || err)); }
}
function applyViewInner(v) {
  const prev = App.view;
  App.view = v;
  if (App.screen !== 'game') App.screen = 'game';
  const myTurn = v.phase === 'play' && v.turn === App.me;
  const before = prev && prev.phase === 'play' && prev.turn === App.me && prev.round === v.round;
  if (myTurn && !before) { sfx.play('turn', { delay: 0.25 }); vibrate([50, 40, 50]); }
  if (!myTurn || (prev && prev.round !== v.round)) App.sel.clear();
  const ids = new Set(v.me.hand.map((c) => c.id));
  for (const id of App.sel) if (!ids.has(id)) App.sel.delete(id);
  if (v.phase === 'play' && v.deadline > 0) App.deadlineAt = Date.now() + v.deadline - 2500; else App.deadlineAt = 0;
  if (v.phase === 'reveal' && v.reveal.stage !== 'bet' && v.reveal.cards && (!App.flip || App.flip.key !== flipKey(v))) {
    // joined late / missed the flip event: start the reveal clock now
    App.flip = { key: flipKey(v), at: Date.now() - (v.reveal.stage === 'verdict' ? 99999 : 0), cards: v.reveal.cards };
  }
  if (v.phase !== 'reveal' && v.phase !== 'gun') App.flip = null;
  if (App.betAt == null || v.phase !== 'reveal') App.betAt = v.phase === 'reveal' && v.reveal.stage === 'bet' ? Date.now() + v.reveal.left : null;
  render();
  syncGun(v);
}
const flipKey = (v) => `${v.round}:${v.reveal.caller}:${v.reveal.target}`;

// ---------- geometry ----------
const centerOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
function seatPt(pid) {
  if (pid === App.me) { const h = $('#hand'); if (h) { const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 40, w: 60 }; } }
  const el = document.querySelector(`[data-seat="${CSS.escape(pid)}"] .av`);
  return el ? centerOf(el) : { x: innerWidth / 2, y: innerHeight * 0.2, w: 40 };
}
const pilePt = () => { const el = $('#pile'); return el ? centerOf(el) : { x: innerWidth / 2, y: innerHeight * 0.32, w: 60 }; };

// ---------- animation primitives ----------
function flyCard({ from, to, card = null, w = 46, dur = 480, delay = 0, rot = 0, onEnd = null }) {
  const el = document.createElement('div');
  el.className = 'flyer';
  el.style.setProperty('--cw', w + 'px');
  el.innerHTML = cardHTML(card);
  const H = w * 1.5;
  const tf = (p, r, s = 1) => `translate(${p.x - w / 2}px, ${p.y - H / 2}px) rotate(${r}deg) scale(${s})`;
  el.style.transform = tf(from, 0);
  if (delay) el.style.opacity = '0';
  $('#fx').appendChild(el);
  const a = el.animate([{ transform: tf(from, 0, 0.8), opacity: 1 }, { transform: tf(to, rot, 1), opacity: 1 }], { duration: dur, delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' });
  if (delay) setTimeout(() => { el.style.opacity = ''; }, delay);
  a.onfinish = () => { el.remove(); if (onEnd) onEnd(); };
}
function stamp(text, cls = '', dur = 1500) {
  const el = document.createElement('div');
  el.className = 'stamp ' + cls;
  el.innerHTML = text;
  $('#fx').appendChild(el);
  el.animate([{ transform: 'translate(-50%,-50%) scale(3) rotate(-12deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1) rotate(-8deg)', opacity: 1, offset: 0.18 }, { transform: 'translate(-50%,-50%) scale(1) rotate(-8deg)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-50%) scale(1.1) rotate(-8deg)', opacity: 0 }], { duration: dur, easing: 'ease-out' }).onfinish = () => el.remove();
}
function popSeat(pid, text, cls = '') {
  const pt = seatPt(pid);
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = pt.x + 'px'; el.style.top = pt.y + 'px';
  $('#fx').appendChild(el);
  el.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-140%) scale(1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-190%) scale(1)', opacity: 0 }], { duration: 1500, easing: 'ease-out' }).onfinish = () => el.remove();
}
function confetti() {
  const layer = $('#fx');
  const cols = ['#ffcf4a', '#e8394a', '#fff', '#c98a2b', '#7bdcb5'];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.background = cols[i % cols.length];
    c.style.left = Math.random() * 100 + 'vw';
    layer.appendChild(c);
    c.animate([{ transform: `translateY(-20px) rotate(0)` }, { transform: `translate(${(Math.random() - 0.5) * 120}px, 105vh) rotate(${Math.random() * 900}deg)` }], { duration: 1800 + Math.random() * 1600, delay: Math.random() * 500, easing: 'cubic-bezier(.3,.6,.6,1)' }).onfinish = () => c.remove();
  }
}

// ---------- engine events → animation + sound on this phone ----------
function onFx(e) {
  const v = App.view;
  switch (e.type) {
    case 'start': sfx.play('cock'); break;
    case 'deal': {
      sfx.play('shuffle');
      App.dealAt = Date.now();
      setTimeout(() => {
        const c = pilePt();
        (e.to || []).forEach((pid, i) => {
          for (let k = 0; k < 2; k++) flyCard({ from: c, to: seatPt(pid), w: 30, dur: 380, delay: i * 70 + k * 160 });
        });
        sfx.play('deal'); sfx.play('deal', { delay: 0.25 });
      }, 700);
      setTimeout(() => {
        const sign = $('.tablecard');
        if (sign) sign.animate([{ transform: 'rotateY(90deg) scale(1.4)' }, { transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
        sfx.play('flip');
      }, 1200);
      break;
    }
    case 'play': {
      sfx.play('play', { n: e.n });
      if (!v) break;
      const from = seatPt(e.by), to = pilePt();
      for (let i = 0; i < e.n; i++) flyCard({ from, to, w: 40, dur: 430, delay: i * 90, rot: (Math.random() - 0.5) * 50 });
      if (e.by !== App.me) popSeat(e.by, `${e.n} × ${RANK_NAME[e.table]}`, 'claim');
      break;
    }
    case 'liar': {
      sfx.play('liar');
      vibrate([80, 40, 160]);
      stamp(`TIPU!<small>${esc(NameOf(e.by))} → ${esc(nameOf(e.target))}</small>`, 'liar', 1600);
      $('#app')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(9px)' }, { transform: 'translateX(-5px)' }, { transform: 'none' }], { duration: 300 });
      if (e.bet) App.betAt = Date.now() + BET_MS;
      break;
    }
    case 'bet': if (e.pid !== App.me) sfx.play('bet'); break;
    case 'flip': {
      App.flip = { key: v ? `${v.round}:${e.caller}:${e.target}` : '', at: Date.now(), cards: e.cards };
      sfx.play('drum', { len: 0.8 });
      e.cards.forEach((_, i) => setTimeout(() => sfx.play('flip'), 900 + i * FLIP_MS));
      const myBet = v && v.reveal && v.reveal.myBet;
      if (myBet) setTimeout(() => { const right = (myBet === 'lie') === e.lie; toast(right ? '🎯 You read it right! +1' : '🙈 Wrong read', 2200); }, 900 + e.cards.length * FLIP_MS + 300);
      setTimeout(render, 30);
      break;
    }
    case 'verdict': {
      if (e.devil) { sfx.play('devil'); vibrate([300, 100, 300]); stamp('THE DEVIL<small>everyone else takes the gun</small>', 'devil', 2400); }
      else if (e.lie) { sfx.play('caught'); stamp(`LIAR!<small>${esc(NameOf(e.target))} take${e.target === App.me ? '' : 's'} the gun</small>`, 'lie', 2300); }
      else { sfx.play('honest'); stamp(`TRUTH!<small>${esc(NameOf(e.caller))} take${e.caller === App.me ? '' : 's'} the gun</small>`, 'truth', 2300); }
      break;
    }
    case 'gun': break; // the view brings the overlay
    case 'shot': onShot(e); break;
    case 'win': sfx.play('win', { delay: 0.6 }); setTimeout(confetti, 600); break;
  }
}

// ======================================================================
// THE GUN — overlay management
// ======================================================================
function syncGun(v) {
  if (v.phase !== 'gun' || !v.gun) {
    if (App.gun && !App.gun.closing) {
      // let a result breathe before the table comes back
      const wait = App.gun.r.result !== null ? Math.max(0, 2600 - (Date.now() - App.gun.resultAt)) : 0;
      App.gun.closing = true;
      setTimeout(() => gunClose(), wait);
    }
    return;
  }
  const g = v.gun;
  const mine = g.shooters.includes(App.me) && !(App.me in g.done);
  if (mine) {
    if (App.gun && App.gun.pid === App.me) { if (App.gun.r.live == null && v.me.live != null) App.gun.r.live = v.me.live; return; }
    if (App.gun && App.gun.watch) gunClose(true);
    openGun(App.me, false, v);
    return;
  }
  if (App.gun && App.gun.pid === App.me) return; // my result is still on screen
  if (App.gun && App.gun.watch) {
    // multi-shooter (Devil): after a result, move on to the next one still to shoot
    if (App.gun.r.result !== null && Date.now() - App.gun.resultAt > 2300) {
      const next = g.shooters.find((id) => !(id in g.done));
      if (next) { gunClose(true); openGun(next, true, v); }
    }
    return;
  }
  const watchId = g.shooters.find((id) => !(id in g.done));
  if (watchId) openGun(watchId, true, v);
}
function openGun(pid, watch, v) {
  const p = P(pid);
  if (!p) return;
  const multi = v.gun.shooters.length > 1;
  const r = new Revolver({
    watch, name: p.name, pulls: p.pulls, bullets: v.bulletsEach || 1, live: watch ? null : v.me.live,
    extra: multi ? `😈 ${v.gun.shooters.length} guns out: ${v.gun.shooters.map((id) => esc(nameOf(id))).join(', ')}` : '',
    onFire: () => act({ type: 'fire' }),
    onStream: (m) => App.bus && App.bus.publish('rv/' + App.me, { ...m, k: v.round }, { qos: 0 }),
    onResult: () => { if (App.gun) App.gun.resultAt = Date.now(); },
  });
  App.gun = { pid, r, watch, round: v.round, resultAt: 0 };
  if (watch && App.rvLast && App.rvLast[pid] && App.rvLast[pid].k === v.round) r.applyStream(App.rvLast[pid]);
  // a shot that already happened (late joiner)
  if (pid in v.gun.done) r.setResult(v.gun.done[pid]);
}
function gunClose(now = false) {
  if (!App.gun) return;
  const g = App.gun;
  App.gun = null;
  g.r.destroy();
  if (!now && App.view && App.view.phase === 'gun') syncGun(App.view);
}
function onRv(m, pid) {
  if (!m || pid === App.me) return;
  App.rvLast = App.rvLast || {};
  App.rvLast[pid] = m;
  if (App.gun && App.gun.watch && App.gun.pid === pid) App.gun.r.applyStream(m);
}
function onShot(e) {
  const g = App.gun;
  if (g && g.pid === e.pid) {
    if (g.pid === App.me && g.r.result !== null) return;
    g.r.setResult(e.dead);
  } else {
    sfx.play(e.dead ? 'bang' : 'dry');
    toast(e.dead ? `💥 ${NameOf(e.pid)} ${e.pid === App.me ? 'are' : 'is'} dead` : `*click* ${NameOf(e.pid)} live${e.pid === App.me ? '' : 's'}`, 2200);
  }
  if (e.dead && e.pid !== App.me) setTimeout(() => sfx.play('ghost'), 1800);
}

// ======================================================================
// RENDER
// ======================================================================
function setScreen(name, data = {}) { App.screen = name; App.screenData = data; render(); }

const RANK_ICON = { K: '♚', Q: '♛', A: '♠', J: '★', D: '☠' };
function cardHTML(c, cls = '') {
  if (!c) return `<div class="card back ${cls}"><div class="bk"><span>TIPU!</span></div></div>`;
  const big = c.r === 'J' ? 'JOKER' : c.r === 'D' ? 'DEVIL' : c.r;
  return `<div class="card r-${c.r} ${cls}" data-cid="${c.id}"><span class="cn tl">${c.r === 'J' ? '★' : c.r === 'D' ? '☠' : c.r}</span>
    <span class="ico">${RANK_ICON[c.r]}</span><span class="big ${c.r === 'J' || c.r === 'D' ? 'word' : ''}">${big}</span><span class="cn br">${c.r === 'J' ? '★' : c.r === 'D' ? '☠' : c.r}</span></div>`;
}

function render() {
  const el = $('#screen');
  let html = '';
  if (App.screen === 'connecting') html = rConnecting();
  else if (App.screen === 'game' && App.view) html = rGame(App.view);
  else html = rHome();
  el.innerHTML = html;
  if ($('#qr')) drawQR();
  fitHand();
}

function rHome() {
  const pr = App.profile;
  const code = App.screenData.code || '';
  const saved = store.get('host');
  const last = store.get('last');
  const canResume = saved && Date.now() - saved.savedAt < 6 * 3600e3 && saved.state && saved.state.phase !== 'lobby';
  const canRejoin = last && !last.host && Date.now() - last.at < 6 * 3600e3 && store.get('id_' + last.code);
  return `<div class="home scroll">
    <div class="logo-wrap">
      <div class="logo-gun">${logoSVG()}</div>
      <div class="logo-title">TIPU!</div>
      <div class="tagline">Lie with a straight face. Get caught, pull the trigger.</div>
    </div>
    ${canResume ? `<button class="btn primary block big" data-act="resumeHost">▶ Resume hosting ${esc(saved.code)}</button>` : ''}
    ${canRejoin && !code ? `<button class="btn blue block" data-act="rejoin">↩ Rejoin table ${esc(last.code)}</button>` : ''}
    <div class="panel">
      <h3>You</h3>
      <div class="me-row">
        <div class="me-av ${pr.photo ? 'photo' : ''}" data-act="pickGallery" style="${pr.photo ? `background-image:url('${pr.photo}')` : ''}">${pr.photo ? '' : esc(pr.emoji)}</div>
        <div class="me-btns"><button class="btn sm" data-act="pickCamera">📸 Take photo</button><button class="btn sm" data-act="pickGallery">🖼️ Gallery</button>${pr.photo ? '<button class="btn sm ghost" data-act="clearPhoto">✕ Use emoji</button>' : ''}</div>
      </div>
      <input id="nameIn" class="field" maxlength="16" placeholder="Your name" value="${esc(pr.name)}" autocomplete="off">
      <div class="emojis">${EMOJIS.map((e) => `<button data-act="emoji" data-e="${e}" class="${e === pr.emoji && !pr.photo ? 'on' : ''}">${e}</button>`).join('')}</div>
    </div>
    ${code ? `
    <div class="panel">
      <h3>Join table</h3>
      <input id="codeIn" class="field code-field" maxlength="5" value="${esc(code)}" autocomplete="off" spellcheck="false">
      <button class="btn primary block big" data-act="doJoin">🥃 Take a seat</button>
      <button class="btn ghost block" data-act="hostInstead">Host a new table instead</button>
    </div>` : `
    <button class="btn primary block big" data-act="doCreate" style="margin-top:16px">👑 Host a table</button>
    <div class="panel">
      <h3>Join a table</h3>
      <div class="row"><input id="codeIn" class="field code-field" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false"><button class="btn blue" style="flex:0 0 auto" data-act="doJoin">Join</button></div>
      <div class="small" style="margin-top:8px">Or scan the QR code on the host's phone.</div>
    </div>`}
    <div class="row" style="margin-top:12px"><button class="btn ghost" data-act="rules">📖 Rules</button><button class="btn ghost" data-act="testSound">🔊 Sound</button><button class="btn ghost" data-act="tryGun">🔫 Try the gun</button></div>
    <div class="made">Made by mnm <span class="beta">BETA</span></div>
  </div>`;
}
function logoSVG() {
  return `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="#1a1012" stroke="#c9a24a" stroke-width="4"/>
    ${[0, 1, 2, 3, 4, 5].map((k) => { const a = (k * 60 - 90) * Math.PI / 180; return `<circle cx="${60 + 30 * Math.cos(a)}" cy="${60 + 30 * Math.sin(a)}" r="12" fill="${k === 0 ? '#e8394a' : '#0a0607'}" stroke="#c9a24a" stroke-width="2.5"/>`; }).join('')}
    <circle cx="60" cy="60" r="8" fill="#c9a24a"/></svg>`;
}

function rConnecting() {
  return `<div class="connecting"><div class="spinner"></div><div class="brand" style="font-size:20px">${esc(App.screenData.msg || 'Connecting…')}</div>
    <button class="btn ghost" style="margin-top:22px" data-act="cancel">Cancel</button></div>`;
}

function topbar(v, sub) {
  return `<div class="topbar"><div class="t"><b class="brand">TIPU!</b> <span class="small">· ${esc(v.code)}</span><div class="small">${sub}</div></div>
    <button class="iconbtn" data-act="mute">${sfx.muted ? '🔇' : '🔊'}</button><button class="iconbtn" data-act="menu">☰</button></div>`;
}

function rGame(v) {
  if (v.phase === 'lobby') return rLobby(v);
  if (v.phase === 'over') return rOver(v);
  return rTable(v);
}

function rLobby(v) {
  const host = App.mode === 'host';
  const s = v.settings;
  const n = v.players.length;
  const enough = n >= v.minPlayers;
  const bul = s.bullets === 'auto' ? (n >= 7 ? 2 : 1) : s.bullets;
  const mix = deckMix(Math.max(2, n), s.devil);
  const chip = (act, val, label, on) => `<span class="chip ${on ? 'on' : ''} ${host ? '' : 'disabled'}" data-act="${act}" data-v="${val}">${label}</span>`;
  return `<div class="game">${topbar(v, `${n}/${MAX_PLAYERS} at the table`)}
  <div class="scroll">
    <div class="panel codebox">
      <div class="lbl">TABLE CODE</div>
      <div class="code">${esc(v.code)}</div>
      <div id="qr"></div>
      <div class="row"><button class="btn blue" data-act="share">📤 Share link</button><button class="btn ghost" data-act="copy">📋 Copy</button></div>
    </div>
    <div class="panel"><h3>Seats</h3>
      <div class="small" style="margin-bottom:8px">${host ? 'Put everyone in the order they really sit, going <b>to the left (clockwise)</b>. Use ▲▼.' : 'The host sets the seats to match where everyone sits.'}</div>
      ${seatPreview(v)}
      <div class="plist">
      ${v.players.map((p, i) => `<div class="prow"><span class="seatno">${i + 1}</span>${avHTML(p.id, p.emoji, 'em')}<div class="nm"><span class="dot ${p.online ? '' : 'off'}"></span> ${esc(p.name)}${p.id === App.me ? ' (you)' : ''}</div>
        ${p.id === v.hostId ? '<span class="tag">HOST</span>' : ''}
        ${host ? `<button class="mv" data-act="move" data-id="${esc(p.id)}" data-d="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button class="mv" data-act="move" data-id="${esc(p.id)}" data-d="1" ${i === n - 1 ? 'disabled' : ''}>▼</button>` : ''}
        ${host && p.id !== v.hostId ? `<button class="x" data-act="kick" data-id="${esc(p.id)}">✕</button>` : ''}</div>`).join('')}
    </div>${DEV && host ? '<button class="btn ghost block sm" data-act="addBot">+ Add bot</button>' : ''}</div>
    <div class="panel"><h3>House rules</h3>
      <div class="setrow"><span class="k">Bullets per gun</span><div class="chips">${chip('bullets', 'auto', 'Auto', s.bullets === 'auto')}${chip('bullets', 1, '1', s.bullets === 1)}${chip('bullets', 2, '2', s.bullets === 2)}</div></div>
      <div class="small setnote">${s.bullets === 'auto' ? `Auto: 2 bullets when 7+ players start, else 1. Now: <b>${bul}</b>.` : `${bul} in 6 chambers.`}</div>
      <div class="setrow"><span class="k">Turn timer</span><div class="chips">${TIMERS.map((t) => chip('timer', t, t ? t + 's' : 'Off', s.timer === t)).join('')}</div></div>
      <div class="setrow"><span class="k">😈 Devil card</span><div class="chips">${chip('devil', 0, 'Off', !s.devil)}${chip('devil', 1, 'On', s.devil)}</div></div>
      <div class="small setnote">Caught on a TIPU! call, the Devil makes <b>everyone else</b> pull their trigger. Must be played alone.</div>
      <div class="setrow"><span class="k">👻 Bets on calls</span><div class="chips">${chip('bets', 0, 'Off', !s.bets)}${chip('bets', 1, 'On', s.bets)}</div></div>
      <div class="small setnote">Everyone not in the call (dead players too) bets LIE or TRUTH before the reveal.</div>
      <div class="deckline">Deck for ${Math.max(2, n)}: <b>${mix.K}</b> Kings · <b>${mix.Q}</b> Queens · <b>${mix.A}</b> Aces · <b>${mix.J}</b> Jokers${mix.D ? ' · <b>1</b> Devil' : ''} · ${HAND} each</div>
    </div>
  </div>
  <div class="sticky-bottom">${host
    ? `<button class="btn primary block big" data-act="start" ${enough ? '' : 'disabled'}>🃏 Load the guns & deal</button>${enough ? '' : `<div class="small center-t" style="margin-top:6px">Waiting for at least ${v.minPlayers} players…</div>`}`
    : '<div class="center-t small" style="padding:12px">Waiting for the host to deal… 🥃</div>'}</div>
  </div>`;
}

function seatPreview(v) {
  const n = v.players.length;
  if (n < 2) return '';
  const mi = Math.max(0, v.players.findIndex((p) => p.id === App.me));
  return `<div class="minitable"><div class="minifelt"></div>${v.players.map((p, k) => {
    const j = (k - mi + n) % n;
    const ang = Math.PI / 2 + (j * 2 * Math.PI) / n;
    return `<div class="miniseat" style="left:${50 + 40 * Math.cos(ang)}%;top:${50 + 38 * Math.sin(ang)}%">${avHTML(p.id, p.emoji)}<span>${k + 1}</span><i>${esc(p.id === App.me ? 'You' : p.name)}</i></div>`;
  }).join('')}<div class="minidir">↻ turns go left</div></div>`;
}

function gunDots(p, bullets) {
  return `<div class="gd">${Array.from({ length: 6 }, (_, i) => `<i class="${i < p.pulls ? 'u' : ''}"></i>`).join('')}</div>`;
}
function seatsHTML(v) {
  const n = v.players.length;
  const mi = Math.max(0, v.players.findIndex((p) => p.id === App.me));
  const r = v.reveal;
  const shooters = v.gun ? v.gun.shooters : [];
  return v.players.map((p, k) => {
    const j = (k - mi + n) % n;
    const ang = Math.PI / 2 + (j * 2 * Math.PI) / n;
    const x = 50 + 44 * Math.cos(ang), y = 48 + 41 * Math.sin(ang);
    const cls = [p.id === v.turn && v.phase === 'play' ? 'turn' : '', p.alive ? '' : 'dead', p.online === false ? 'off' : '',
      r && (p.id === r.caller) ? 'caller' : '', r && p.id === r.target ? 'target' : '', shooters.includes(p.id) ? 'shooter' : '', p.id === App.me ? 'me' : ''].join(' ');
    const odds = p.alive ? Math.round(oddsNext(p.pulls, v.bulletsEach || 1) * 100) : null;
    return `<div class="seat ${cls}" data-seat="${esc(p.id)}" style="left:${x}%;top:${y}%">
      ${avHTML(p.id, p.emoji)}${p.alive ? '' : '<div class="ghost">👻</div>'}
      <div class="nm">${esc(p.id === App.me ? 'You' : p.name)}</div>
      ${p.alive ? `<div class="cc">${p.count ? `<b>${p.count}</b>🂠` : '<span class="out">empty</span>'}</div>${gunDots(p)}` : `<div class="cc">${p.bets ? `🎯 ${p.reads}/${p.bets}` : 'dead'}</div>`}
      ${v.lastPlay && v.lastPlay.by === p.id && v.phase === 'play' ? `<div class="lp">${v.lastPlay.n}</div>` : ''}
      ${p.alive && odds >= 50 ? `<div class="hot">${odds}%</div>` : ''}</div>`;
  }).join('');
}

function tableCardHTML(v) {
  if (!v.table) return '';
  return `<div class="tablecard r-${v.table}"><div class="tc-l">${RANK_NAME[v.table].toUpperCase()}'S TABLE</div><div class="tc-c">${cardHTML({ id: 0, r: v.table }, 'mini')}</div></div>`;
}

function revealHTML(v) {
  const r = v.reveal;
  if (!r) return '';
  const cards = App.flip && App.flip.cards ? App.flip.cards : null;
  const t0 = App.flip ? App.flip.at : 0;
  const el = Date.now() - t0;
  const shown = cards ? cards.map((c, i) => el >= 900 + i * FLIP_MS) : [];
  const allShown = shown.length && shown.every(Boolean);
  if (cards && !allShown && !App.revealTimer) App.revealTimer = setTimeout(() => { App.revealTimer = null; if (App.view && App.view.phase === 'reveal') paintReveal(); }, 120);
  // entry / flip / verdict animations play once, not on every repaint
  const key = flipKey(v);
  const fresh = App.revealKey !== key;
  if (fresh) { App.revealKey = key; App.flipDone = 0; App.verdictDone = false; }
  const cardRow = (cards || Array.from({ length: r.n }, () => null)).map((c, i) => {
    const up = c && shown[i];
    const ok = up ? (c.r === v.table || c.r === 'J' || c.r === 'D') : null;
    const anim = up && i >= App.flipDone ? 'anim' : '';
    return `<div class="rc ${up ? 'up' : ''} ${anim} ${ok === true ? 'ok' : ok === false ? 'bad' : ''}">${up ? cardHTML(c) : cardHTML(null)}${ok === false ? '<i class="xmark">✕</i>' : ''}</div>`;
  }).join('');
  App.flipDone = Math.max(App.flipDone || 0, shown.filter(Boolean).length);
  let mid = '';
  if (r.stage === 'bet') {
    const left = Math.max(0, Math.ceil(((App.betAt || Date.now()) - Date.now()) / 1000));
    if (r.canBet && !r.myBet) mid = `<div class="betq">${P(App.me)?.alive ? 'Was it a lie?' : '👻 Ghost bet: was it a lie?'}</div><div class="bets"><button class="btn bet lie" data-act="bet" data-v="lie">🤥 LIE</button><button class="btn bet truth" data-act="bet" data-v="truth">😇 TRUTH</button></div>`;
    else if (r.myBet) mid = `<div class="betq">You bet <b>${r.myBet === 'lie' ? '🤥 LIE' : '😇 TRUTH'}</b></div>`;
    else mid = `<div class="betq">${r.target === App.me ? 'Keep a straight face…' : 'The table is betting…'}</div>`;
    mid += `<div class="betbar"><i style="animation-duration:${Math.max(0.2, ((App.betAt || Date.now()) - Date.now()) / 1000)}s"></i></div><div class="small">${r.betCount} bet${r.betCount === 1 ? '' : 's'} in · ${left}s</div>`;
  } else if (r.stage === 'verdict' || allShown) {
    const lie = r.lie ?? (cards && cards.some((c) => !(c.r === v.table || c.r === 'J' || c.r === 'D')));
    const devil = r.devil ?? (cards && cards.some((c) => c.r === 'D'));
    const sh = r.shooters || (devil ? [] : [lie ? r.target : r.caller]);
    const vAnim = App.verdictDone ? '' : 'anim';
    App.verdictDone = true;
    mid = `<div class="verdict ${vAnim} ${devil ? 'devil' : lie ? 'lie' : 'truth'}">${devil ? '😈 THE DEVIL' : lie ? 'LIAR!' : 'TRUTH!'}</div>
      <div class="small">${devil ? 'Everyone else takes the gun' : `${esc(NameOf(sh[0]))} take${sh[0] === App.me ? '' : 's'} the gun`}</div>`;
  } else mid = '<div class="betq">Turning the cards…</div>';
  return `<div id="reveal" class="reveal ${fresh ? 'enter' : ''}">
    <div class="rv-who">${avHTML(r.caller, P(r.caller)?.emoji, 'av sm')}<div><b>${esc(NameOf(r.caller))}</b> ${r.caller === App.me ? 'call' : 'calls'} <span class="tipu">TIPU!</span> on <b>${esc(nameOf(r.target))}</b><div class="small">claim: ${plural(r.n, v.table)}</div></div>${avHTML(r.target, P(r.target)?.emoji, 'av sm')}</div>
    <div class="rv-cards">${cardRow}</div>
    <div class="rv-mid">${mid}</div>
  </div>`;
}
function paintReveal() {
  const el = $('#reveal');
  if (!el || !App.view) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = revealHTML(App.view);
  el.replaceWith(tmp.firstElementChild);
}

function rTable(v) {
  const r = v.reveal;
  const myTurn = v.phase === 'play' && v.turn === App.me;
  const meP = P(App.me);
  const sub = `Round ${v.round} · ${v.players.filter((p) => p.alive).length} alive${v.bulletsEach > 1 ? ` · ${v.bulletsEach} bullets` : ''}`;
  return `<div class="game">${topbar(v, sub)}
    <div id="table" class="table n${v.players.length}">
      <div class="felt"></div>
      ${seatsHTML(v)}
      <div class="center">
        ${tableCardHTML(v)}
        <div id="pile" class="pile">${v.pile ? Array.from({ length: Math.min(v.pile, 9) }, (_, i) => cardHTML(null, 'p').replace('class="card', `style="--i:${i};--rr:${((i * 47) % 30) - 15}deg" class="card`)).join('') : '<div class="pile-empty"></div>'}<span class="cnt">${v.pile}</span></div>
      </div>
    </div>
    ${r ? revealHTML(v) : ''}
    ${statusHTML(v)}
    <div class="actions">${actionsHTML(v)}</div>
    <div id="hand" class="hand ${myTurn ? 'myturn' : ''} ${meP && !meP.alive ? 'deadhand' : ''}">${handInner(v)}</div>
  </div>`;
}

function statusHTML(v) {
  let main = '', me = false;
  const last = v.log.length ? v.log[v.log.length - 1].text : '';
  const meP = P(App.me);
  if (v.phase === 'play') {
    if (v.turn === App.me) {
      me = true;
      main = v.forced ? 'Everyone else is empty. Call <b>TIPU!</b>' : v.lastPlay ? `${esc(nameOf(v.lastPlay.by))} claimed ${plural(v.lastPlay.n, v.table)}. Play on or call <b>TIPU!</b>` : `You start. Play 1–3 cards as <b>${RANK_PLURAL[v.table]}</b>`;
    } else {
      const t = P(v.turn);
      main = `${esc(t?.emoji || '')} ${esc(nameOf(v.turn))} is thinking…`;
      if (meP && !meP.alive) main = `👻 You're a ghost. ${main}`;
    }
  } else if (v.phase === 'reveal') main = 'Showdown!';
  else if (v.phase === 'gun') main = v.gun.shooters.length > 1 ? `😈 ${v.gun.shooters.length} guns out` : `🔫 ${esc(NameOf(v.gun.shooters[0]))} ${v.gun.shooters[0] === App.me ? 'have' : 'has'} the gun`;
  const timer = App.deadlineAt && v.phase === 'play' ? `<span class="tmr ${v.turn === App.me ? 'me' : ''}" data-dl="${App.deadlineAt}"></span>` : '';
  return `<div class="status"><div class="main ${me ? 'me' : ''}">${main} ${timer}</div><div class="last">${esc(last)}</div></div>`;
}

function actionsHTML(v) {
  if (v.phase !== 'play') return '';
  const out = [];
  const myTurn = v.turn === App.me;
  if (!myTurn) return '';
  const canCall = v.lastPlay && v.lastPlay.by !== App.me;
  const n = App.sel.size;
  if (!v.forced) out.push(`<button class="btn primary playbtn" data-act="play" ${n ? '' : 'disabled'}>${n ? `⬆ Play ${n} as ${n > 1 ? RANK_PLURAL[v.table] : RANK_NAME[v.table]}` : 'Pick 1–3 cards'}</button>`);
  if (canCall) out.push(`<button class="btn tipu ${v.forced ? 'pulse' : ''}" data-act="liar">TIPU!</button>`);
  return out.join('');
}

function handInner(v) {
  const meP = P(App.me);
  if (meP && !meP.alive) return `<div class="empty">👻 You're out. ${v.settings.bets ? 'Bet on every TIPU! call.' : 'Watch the liars.'}</div>`;
  const hand = v.me.hand;
  if (!hand.length) return `<div class="empty">${v.phase === 'play' ? 'No cards left. You\'re safe this round… unless you get called on.' : ''}</div>`;
  const myTurn = v.phase === 'play' && v.turn === App.me && !v.forced;
  const fresh = App.dealAt && Date.now() - App.dealAt < 2500;
  return hand.map((c, i) => {
    const cls = [App.sel.has(c.id) ? 'sel' : '', myTurn ? 'can' : '', fresh ? 'dealin' : ''].join(' ');
    return cardHTML(c, cls).replace('class="card', `data-act="card" data-id="${c.id}" style="--d:${(fresh ? 900 : 0) + i * 110}ms" class="card`);
  }).join('');
}
function fitHand() {
  const h = $('#hand');
  if (!h) return;
  const n = h.querySelectorAll('.card').length || 5;
  const W = h.clientWidth - 12;
  const cw = Math.min(84, (W - (n - 1) * 8) / n, (innerHeight * 0.2) / 1.5);
  h.style.setProperty('--cw', Math.max(44, cw).toFixed(1) + 'px');
}
addEventListener('resize', fitHand);

function rOver(v) {
  const host = App.mode === 'host';
  const w = P(v.winner);
  const order = [...v.players].sort((a, b) => {
    if (a.id === v.winner) return -1;
    if (b.id === v.winner) return 1;
    return v.deaths.indexOf(b.id) - v.deaths.indexOf(a.id);
  });
  const readers = v.players.filter((p) => p.bets > 0).sort((a, b) => b.reads - a.reads || a.bets - b.bets);
  const best = readers[0] && readers[0].reads > 0 ? readers[0] : null;
  return `<div class="game">${topbar(v, 'Last one standing')}
    <div class="scroll">
      <div class="winner">${w ? avHTML(w.id, w.emoji, 'big') : '<div class="big">🏆</div>'}
        <h2>${w ? esc(v.winner === App.me ? 'You survived!' : w.name + ' survived!') : 'Game ended'}</h2>
        <div class="small">${w ? `${w.pulls} trigger pull${w.pulls === 1 ? '' : 's'} and still breathing` : ''}</div>
        ${best ? `<div class="award">🎯 Sharpest reader: <b>${esc(nameOf(best.id))}</b> · ${best.reads}/${best.bets} calls read right</div>` : ''}</div>
      ${order.map((p, i) => `<div class="res ${p.id === v.winner ? 'win' : ''}">${avHTML(p.id, p.emoji, 'em')}<div class="info"><b>${i + 1}. ${esc(p.id === App.me ? 'You' : p.name)}</b>
          <div class="small">${p.id === v.winner ? '🏆 Survivor' : p.alive ? 'Still alive (game ended)' : `💀 Out ${ordinal(v.deaths.indexOf(p.id) + 1)}`} · ${p.pulls} pull${p.pulls === 1 ? '' : 's'}${p.bets ? ` · 🎯 ${p.reads}/${p.bets}` : ''}</div></div></div>`).join('')}
    </div>
    <div class="sticky-bottom">${host
      ? '<button class="btn primary block big" data-act="start">🔁 Reload & play again</button><button class="btn ghost block" data-act="toLobby">Back to lobby (let people join)</button>'
      : '<div class="center-t small" style="padding:12px">Waiting for the host…</div>'}</div>
  </div>`;
}
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// ---------- sheets ----------
function openModal(html, kind = 'info') {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.classList.add('on');
  App.modalKind = kind;
}
function closeModal() {
  const m = $('#modal');
  m.classList.remove('on'); m.innerHTML = '';
  App.modalKind = null;
}
function rulesHTML() {
  return `<div class="title">How to play TIPU!</div><div class="rules">
    <h4>The table</h4><ul><li>2–10 players, one phone each. One phone hosts, the rest scan the QR code.</li><li>Everyone gets <b>5 cards</b>. The deck is made of Kings, Queens, Aces and a few <b>Jokers</b> (wild), and grows with the table.</li><li>Each round the phone picks a <b>table card</b>: King, Queen or Ace.</li><li>Everyone has their own <b>revolver</b>: 6 chambers, 1 bullet (2 bullets when 7+ players start, on Auto).</li></ul>
    <h4>Your turn</h4><ul><li>Put down <b>1 to 3 cards face down</b>. You are claiming they are all the table card. Jokers count as the table card. You may lie.</li><li>Or, if someone played before you, shout <b>TIPU!</b> (liar) on their cards.</li><li>Out of cards? You're skipped. If everyone else is empty, the next player <b>must</b> call TIPU!</li></ul>
    <h4>TIPU!</h4><ul><li>The cards are turned over. If <b>any</b> card isn't the table card or a Joker, the liar takes the gun. If they were all true, the <b>caller</b> takes the gun.</li><li>Before the reveal, everyone else (the dead too 👻) bets <b>LIE</b> or <b>TRUTH</b>. The sharpest reader is crowned at the end.</li></ul>
    <h4>The gun</h4><ul><li>The cylinder swings out. Flick it to spin, swipe down to snap it shut, drag the hammer back if you like, then press the trigger and pull.</li><li>Every pull moves to the next chamber, so your odds get worse each time: 1 in 6, 1 in 5, 1 in 4…</li><li>Survive and a new round starts with fresh cards and a new table card. Die and you're a ghost.</li></ul>
    <h4>😈 Devil card (optional)</h4><ul><li>One Devil card in the deck. It counts as true and must be played alone. If someone calls TIPU! on it, <b>everyone else</b> at the table pulls their trigger.</li></ul>
    <h4>Winning</h4><ul><li>Last player alive wins.</li></ul>
    </div><button class="btn primary block" data-act="closeModal">Got it</button>`;
}
function menuSheet() {
  const v = App.view;
  const host = App.mode === 'host';
  const inGame = v && v.phase !== 'lobby' && v.phase !== 'over';
  const stuck = v && ((v.phase === 'play' && v.turn && v.turn !== App.me) || v.phase === 'gun');
  openModal(`<div class="title">Menu</div><div class="menu-list">
    <button class="btn block" data-act="rules">📖 Rules</button>
    <button class="btn block" data-act="testSound">🔊 Test sound</button>
    ${host && v && v.phase !== 'lobby' ? `<button class="btn block" data-act="share">📤 Invite link</button>` : ''}
    ${host && stuck ? `<button class="btn block" data-act="skipTurn">⏭ ${v.phase === 'gun' ? 'Fire for whoever is stalling' : `Play ${esc(nameOf(v.turn))}'s turn for them`}</button>` : ''}
    ${host && inGame ? '<button class="btn block" data-act="endGame">🏁 End game now</button>' : ''}
    ${host ? '<button class="btn block" style="color:#ff8a8a" data-act="closeTable">✖ Close table for everyone</button>' : '<button class="btn block" style="color:#ff8a8a" data-act="leave">🚪 Leave table</button>'}
    <button class="btn ghost block" data-act="closeModal">Close</button></div>`);
}

function drawQR() {
  const el = $('#qr');
  if (!el || !window.qrcode) return;
  try {
    const q = window.qrcode(0, 'M');
    q.addData(inviteLink());
    q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch (_) { el.remove(); }
}
function inviteLink() {
  const b = App.bus ? App.bus.brokerIdx : 0;
  return `${location.origin}${location.pathname}?join=${App.code}${b ? '&b=' + b : ''}`;
}
function readProfile() {
  const n = ($('#nameIn')?.value || '').trim().slice(0, 16);
  if (n) App.profile.name = n;
  store.set('profile', App.profile);
  return n;
}

// practice gun on the home screen (nothing at stake: 1 in 6 each time, for fun)
function tryGun() {
  if (App.gun) return;
  const pulls = 0;
  const r = new Revolver({
    watch: false, name: 'You', pulls, bullets: 1, live: Math.random() < 1 / 6,
    extra: 'Practice round. Nothing at stake.',
    onFire: () => {}, onStream: null,
    onResult: () => { setTimeout(() => { if (App.gun && App.gun.r === r) gunClose(true); }, 3600); },
  });
  App.gun = { pid: 'practice', r, watch: false, practice: true };
}

// ======================================================================
// input
// ======================================================================
document.addEventListener('click', async (e) => {
  if (e.target.closest('#gun')) return;
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act;
  const v = App.view;
  if (!['card', 'closeModal'].includes(a)) sfx.play('click');
  switch (a) {
    case 'emoji': readProfile(); App.profile.emoji = t.dataset.e; App.profile.photo = null; store.set('profile', App.profile); publishPhoto(); render(); break;
    case 'pickCamera': readProfile(); $('#camPick').click(); break;
    case 'pickGallery': readProfile(); $('#filePick').click(); break;
    case 'clearPhoto': readProfile(); App.profile.photo = null; store.set('profile', App.profile); publishPhoto(); render(); break;
    case 'hostInstead': readProfile(); setScreen('home', {}); break;
    case 'doCreate':
    case 'doJoin': {
      sfx.unlock(); keepAwake();
      const name = readProfile();
      if (!name) { toast('Enter your name first.'); $('#nameIn')?.focus(); return; }
      if (a === 'doJoin') {
        const code = ($('#codeIn')?.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length !== 5) { toast('Table codes have 5 characters.'); $('#codeIn')?.focus(); return; }
        try { await clientJoin(code, params.get('b') != null && params.get('join') === code ? Number(params.get('b')) : null); }
        catch (err) { console.error(err); toast('Could not connect. Check your internet and try again.'); teardown(); }
      } else {
        setScreen('connecting', { msg: 'Wiping down the bar…' });
        try { await hostCreate(); } catch (err) { console.error(err); toast('Could not connect. Check your internet and try again.'); teardown(); }
      }
      break;
    }
    case 'resumeHost': {
      sfx.unlock();
      const saved = store.get('host');
      setScreen('connecting', { msg: 'Reopening your table…' });
      try { await hostResume(saved); } catch (err) { console.error(err); toast('Could not reconnect.'); teardown(); }
      break;
    }
    case 'rejoin': {
      sfx.unlock();
      const last = store.get('last');
      readProfile();
      try { await clientJoin(last.code, last.broker ?? null); } catch (_) { toast('Could not connect.'); teardown(); }
      break;
    }
    case 'cancel': teardown(); break;
    case 'rules': closeModal(); openModal(rulesHTML()); break;
    case 'closeModal': closeModal(); break;
    case 'mute': sfx.setMuted(!sfx.muted); render(); break;
    case 'testSound': testSound(); break;
    case 'tryGun': sfx.unlock(); tryGun(); break;
    case 'menu': menuSheet(); break;
    case 'share': {
      const link = inviteLink();
      if (navigator.share) { try { await navigator.share({ title: 'TIPU!', text: `Join my TIPU! table, code ${App.code}`, url: link }); } catch (_) {} }
      else { navigator.clipboard?.writeText(link); toast('Invite link copied.'); }
      break;
    }
    case 'copy': navigator.clipboard?.writeText(inviteLink()).then(() => toast('Invite link copied.'), () => toast(inviteLink())); break;
    case 'kick': act({ type: 'kick', target: t.dataset.id }); break;
    case 'move': act({ type: 'move', target: t.dataset.id, dir: Number(t.dataset.d) }); break;
    case 'addBot': addBot(); break;
    case 'bullets': act({ type: 'settings', patch: { bullets: t.dataset.v === 'auto' ? 'auto' : Number(t.dataset.v) } }); break;
    case 'timer': act({ type: 'settings', patch: { timer: Number(t.dataset.v) } }); break;
    case 'devil': act({ type: 'settings', patch: { devil: t.dataset.v === '1' } }); break;
    case 'bets': act({ type: 'settings', patch: { bets: t.dataset.v === '1' } }); break;
    case 'start': act({ type: 'start' }); break;
    case 'toLobby': act({ type: 'lobby' }); break;
    case 'card': {
      if (!v || v.phase !== 'play' || v.turn !== App.me || v.forced) return;
      const id = Number(t.dataset.id);
      const card = v.me.hand.find((c) => c.id === id);
      if (!card) return;
      if (App.sel.has(id)) App.sel.delete(id);
      else {
        if (card.r === 'D' || [...App.sel].some((x) => v.me.hand.find((c) => c.id === x)?.r === 'D')) App.sel.clear();
        if (App.sel.size >= 3) { sfx.play('error'); toast('3 cards max.'); return; }
        App.sel.add(id);
      }
      sfx.play('click'); vibrate(8);
      paintHand();
      break;
    }
    case 'play': playSelected(); break;
    case 'liar': App.sel.clear(); act({ type: 'liar' }); break;
    case 'bet': act({ type: 'bet', pick: t.dataset.v }); sfx.play('bet'); vibrate(15); break;
    case 'skipTurn': closeModal(); act({ type: 'skipTurn' }); break;
    case 'endGame': if (confirm('End the game now?')) { closeModal(); act({ type: 'end' }); } break;
    case 'closeTable': if (confirm('Close this table for everyone?')) { closeModal(); closeTable(); } break;
    case 'leave':
      closeModal();
      if (v && v.phase === 'lobby') { act({ type: 'leave' }); if (App.bus) App.bus.publish('av/' + App.me, null, { retain: true }); }
      store.del('last');
      setTimeout(teardown, 300);
      break;
  }
});
function playSelected() {
  const v = App.view;
  if (!v || !App.sel.size) return;
  const ids = [...App.sel];
  // the chosen cards slide up off the hand toward the pile
  const to = pilePt();
  ids.forEach((id, i) => {
    const el = document.querySelector(`#hand [data-id="${id}"]`);
    if (el) { const pt = centerOf(el); el.style.visibility = 'hidden'; flyCard({ from: pt, to, w: pt.w, dur: 420, delay: i * 70, rot: (Math.random() - 0.5) * 40 }); }
  });
  App.sel.clear();
  act({ type: 'play', cards: ids });
}
function paintHand() {
  const h = $('#hand'), v = App.view;
  if (!h || !v) return;
  h.innerHTML = handInner(v);
  fitHand();
  const acts = $('.actions');
  if (acts) acts.innerHTML = actionsHTML(v);
}
// swipe the selected cards up to play them
let swipe = null;
document.addEventListener('pointerdown', (e) => {
  const c = e.target.closest('#hand .card.sel');
  swipe = c ? { x: e.clientX, y: e.clientY } : null;
});
document.addEventListener('pointerup', (e) => {
  if (!swipe) return;
  const dy = swipe.y - e.clientY;
  if (dy > 60 && Math.abs(e.clientX - swipe.x) < dy) { e.preventDefault(); playSelected(); }
  swipe = null;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target.id === 'codeIn' || e.target.id === 'nameIn')) $('[data-act="doJoin"]')?.click();
  if (e.key === 'Escape') closeModal();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'codeIn') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (e.target.id === 'nameIn') { App.profile.name = e.target.value.trim().slice(0, 16); store.set('profile', App.profile); }
});

// countdowns (turn timer, bet window)
let lastClock = 0;
setInterval(() => {
  for (const el of document.querySelectorAll('.tmr')) {
    const left = Math.max(0, Math.ceil((Number(el.dataset.dl) - Date.now()) / 1000));
    el.textContent = `⏱ ${left}s`;
    el.classList.toggle('low', left <= 5);
    if (el.classList.contains('me') && left <= 5 && left > 0 && left !== lastClock) { lastClock = left; sfx.play('clock'); }
  }
  const v = App.view;
  if (v && v.phase === 'reveal' && v.reveal.stage === 'bet') {
    const s = $('#reveal .rv-mid .small');
    if (s) s.textContent = `${v.reveal.betCount} bet${v.reveal.betCount === 1 ? '' : 's'} in · ${Math.max(0, Math.ceil(((App.betAt || 0) - Date.now()) / 1000))}s`;
  }
}, 250);

// ======================================================================
// test bench hooks: the bench page drives player phones through these
// ======================================================================
window.__bench = {
  auto: false,
  autoGun: false,
  step() {
    const v = App.view;
    if (!v || !App.mode) return;
    if (App.gun && App.gun.pid === App.me && App.gun.r.result === null) { if (this.autoGun) setTimeout(() => App.gun && App.gun.r.autoPlay(), 1500); return; }
    if (!this.auto) return;
    if (v.phase === 'reveal' && v.reveal.stage === 'bet' && v.reveal.canBet && !v.reveal.myBet && Math.random() < 0.5) { act({ type: 'bet', pick: Math.random() < 0.5 ? 'lie' : 'truth' }); return; }
    if (v.phase === 'play' && v.turn === App.me) {
      if (this._turn === v.pile + ':' + v.round) return;
      this._turn = v.pile + ':' + v.round;
      setTimeout(() => {
        const vv = App.view;
        if (!vv || vv.phase !== 'play' || vv.turn !== App.me) return;
        const a = brain({ hand: vv.me.hand, table: vv.table, lastN: vv.lastPlay ? vv.lastPlay.n : 0, forced: vv.forced, canCall: !!vv.lastPlay && vv.lastPlay.by !== App.me, pile: vv.pile });
        if (a.type === 'play') { App.sel = new Set(a.cards); paintHand(); setTimeout(playSelected, 350); }
        else act(a);
      }, 700 + Math.random() * 900);
    }
  },
  fire() { if (App.gun && !App.gun.watch) App.gun.r.autoPlay(); },
};
setInterval(() => { if (window.__bench.auto || window.__bench.autoGun) window.__bench.step(); }, 900);

// ======================================================================
// start
// ======================================================================
function route() {
  const join = (params.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (join.length === 5 && params.has('auto') && params.get('name')) { // test bench players join by themselves
    App.profile = { name: params.get('name').slice(0, 16), emoji: params.get('emoji') || EMOJIS[Math.floor(Math.random() * EMOJIS.length)] };
    clientJoin(join).catch(() => teardown());
    return;
  }
  if (join.length === 5) {
    const last = store.get('last');
    if (last && last.code === join && !last.host && store.get('id_' + join) && App.profile.name) {
      clientJoin(join, params.get('b') != null ? Number(params.get('b')) : last.broker ?? null).catch(() => teardown());
      return;
    }
    setScreen('home', { code: join });
    return;
  }
  setScreen('home');
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => reg.update()).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    if (!App.mode || (App.view && ['lobby', 'over'].includes(App.view.phase))) { reloaded = true; location.reload(); }
  });
}
route();
