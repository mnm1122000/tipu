// TIPU! — the revolver. A full-screen six-shooter on the shooter's phone:
//   1. the cylinder is swung out: flick it to spin (purely for show — the odds never change)
//   2. swipe down (or tap the gun) to snap it shut
//   3. optional: drag the hammer back to cock it (lighter trigger)
//   4. press the trigger and pull it back until it breaks
//   5. BANG or *click*
// Everyone else sees a live mirror of the same gun (spin, hammer and trigger streamed ~10×/s).
import { sfx, vibrate } from './sfx.js?v=3';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const VB_W = 1000, VB_H = 560;
const HAMMER_COCKED = -34;        // degrees
const TRIGGER_MAX = 24;           // degrees
const FLUTE_PITCH = 49;           // side-view flute spacing (one chamber)
const PULL_DA = 120, PULL_SA = 46; // trigger travel in gun units: double action vs cocked

// ---------------------------------------------------------------- artwork
// the revolver, side view. `sfx` keeps its gradient ids unique when drawn more than once on a page
export function sideGunSVG(sfx = '') {
  const flutes = [];
  for (let i = -4; i <= 8; i++) flutes.push(`<rect x="342" y="${100 + i * FLUTE_PITCH}" width="104" height="22" rx="11" fill="url(#gFlute)"/>`);
  const checks = [];
  for (let i = -12; i < 22; i++) checks.push(`<path d="M${150 + i * 14} 200 l140 340" /><path d="M${150 + i * 14} 540 l140 -340" />`);
  const spur = [];
  for (let i = 0; i < 6; i++) spur.push(`<path d="M${236 + i * 6} ${86 + i * 3} l-6 10" />`);
  const svg = `<svg class="g-side" viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gSteel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6f7c8f"/><stop offset=".18" stop-color="#2c3440"/><stop offset=".55" stop-color="#11161d"/><stop offset=".8" stop-color="#2a323d"/><stop offset="1" stop-color="#0a0d12"/>
    </linearGradient>
    <linearGradient id="gBarrel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9aa6b6"/><stop offset=".22" stop-color="#3a4452"/><stop offset=".5" stop-color="#161b23"/><stop offset=".78" stop-color="#3b4553"/><stop offset="1" stop-color="#0b0e13"/>
    </linearGradient>
    <linearGradient id="gCyl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0e13"/><stop offset=".22" stop-color="#3c4655"/><stop offset=".45" stop-color="#b7c1cf"/><stop offset=".55" stop-color="#7d8898"/><stop offset=".8" stop-color="#262d38"/><stop offset="1" stop-color="#07090c"/>
    </linearGradient>
    <linearGradient id="gFlute" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#05070a"/><stop offset=".6" stop-color="#1a2029"/><stop offset="1" stop-color="#4a5464"/>
    </linearGradient>
    <linearGradient id="gWood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7a3b18"/><stop offset=".35" stop-color="#4a1f0b"/><stop offset=".6" stop-color="#6b3014"/><stop offset="1" stop-color="#2a1006"/>
    </linearGradient>
    <radialGradient id="gFlash" cx="0" cy=".5" r="1">
      <stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fff3a8"/><stop offset=".55" stop-color="#ff9a1f"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="gCylClip"><rect x="318" y="144" width="152" height="150" rx="20"/></clipPath>
    <clipPath id="gGripClip"><path d="M262 206 C240 286 210 384 188 470 C178 510 196 534 232 536 L296 536 C326 534 336 512 333 486 C330 438 333 362 346 306 Z"/></clipPath>
  </defs>
  <g class="g-body">
    <!-- grip -->
    <path d="M254 190 C232 280 200 384 176 472 C164 520 188 548 232 550 L300 550 C338 548 352 520 348 488 C344 436 346 360 360 300 Z" fill="#101318"/>
    <path d="M262 206 C240 286 210 384 188 470 C178 510 196 534 232 536 L296 536 C326 534 336 512 333 486 C330 438 333 362 346 306 Z" fill="url(#gWood)"/>
    <g clip-path="url(#gGripClip)" stroke="rgba(0,0,0,.32)" stroke-width="2.2">${checks.join('')}</g>
    <path d="M262 206 C240 286 210 384 188 470" stroke="rgba(255,200,150,.18)" stroke-width="5" fill="none"/>
    <circle cx="262" cy="410" r="17" fill="#c9a24a" stroke="#6b5216" stroke-width="3"/><text x="262" y="416" font-size="15" text-anchor="middle" fill="#5a4210" font-family="Bungee, Impact, sans-serif">T</text>
    <!-- frame -->
    <path d="M242 172 C244 140 268 120 304 120 L492 120 L492 304 L346 304 C334 304 326 298 320 290 L268 214 C254 198 242 190 242 172 Z" fill="url(#gSteel)" stroke="#05070a" stroke-width="3"/>
    <path d="M300 128 L488 128" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
    <rect x="300" y="112" width="26" height="12" rx="3" fill="#1a2028"/>
    <rect x="276" y="160" width="30" height="16" rx="5" fill="#3d4756" stroke="#05070a" stroke-width="2"/>
    <circle cx="296" cy="262" r="7" fill="#3a4350" stroke="#05070a" stroke-width="2"/><path d="M291 262 h10" stroke="#05070a" stroke-width="2"/>
    <circle cx="276" cy="226" r="5.5" fill="#3a4350" stroke="#05070a" stroke-width="2"/>
    <!-- barrel + full lug -->
    <path d="M470 206 L902 206 Q938 206 938 236 Q938 266 902 266 L470 266 Z" fill="url(#gSteel)" stroke="#05070a" stroke-width="3"/>
    <path d="M482 222 L900 222" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
    <circle cx="926" cy="238" r="6" fill="#0b0e13" stroke="#5c6878" stroke-width="2"/>
    <rect x="470" y="148" width="510" height="60" fill="url(#gBarrel)" stroke="#05070a" stroke-width="3"/>
    <rect x="470" y="134" width="506" height="16" rx="3" fill="#2a323d" stroke="#05070a" stroke-width="2.5"/>
    <path d="M478 140 L968 140" stroke="rgba(255,255,255,.45)" stroke-width="2"/>
    <path d="M934 134 L948 106 L970 106 L972 134 Z" fill="#1a2028" stroke="#05070a" stroke-width="2.5"/>
    <rect x="966" y="144" width="16" height="68" rx="5" fill="#0d1116" stroke="#05070a" stroke-width="2"/>
    <text x="560" y="186" font-size="20" letter-spacing="7" fill="rgba(255,255,255,.28)" font-family="Bungee, Impact, sans-serif">TIPU · SIX · .38</text>
    <!-- trigger guard -->
    <path d="M446 300 C446 362 424 396 376 398 C328 400 310 370 312 326" fill="none" stroke="#0a0d12" stroke-width="20" stroke-linecap="round"/>
    <path d="M446 300 C446 362 424 396 376 398 C328 400 310 370 312 326" fill="none" stroke="url(#gSteel)" stroke-width="13" stroke-linecap="round"/>
    <!-- trigger -->
    <g class="g-trigger"><path d="M364 300 C362 330 358 352 344 374 C338 384 350 390 358 382 C378 358 388 330 390 300 Z" fill="url(#gSteel)" stroke="#05070a" stroke-width="3"/>
      <path d="M368 310 C366 334 362 352 352 368" stroke="rgba(255,255,255,.3)" stroke-width="2.5" fill="none"/></g>
    <!-- cylinder (side) -->
    <g class="g-cylside">
      <rect x="316" y="142" width="156" height="154" rx="21" fill="#05070a"/>
      <g clip-path="url(#gCylClip)">
        <rect x="318" y="144" width="152" height="150" fill="url(#gCyl)"/>
        <g class="g-flutes">${flutes.join('')}</g>
        <rect x="318" y="144" width="152" height="150" fill="url(#gCyl)" opacity=".18"/>
        <rect class="g-cylblur" x="318" y="144" width="152" height="150" fill="url(#gCyl)" opacity="0"/>
      </g>
      <path d="M326 150 L326 288 M462 150 L462 288" stroke="rgba(0,0,0,.55)" stroke-width="4"/>
    </g>
    <!-- hammer -->
    <g class="g-hammer">
      <path d="M268 196 L304 196 L304 146 C302 122 292 106 276 98 L234 80 C222 75 214 90 224 97 L260 118 C267 125 268 136 268 152 Z" fill="url(#gSteel)" stroke="#05070a" stroke-width="3"/>
      <g stroke="rgba(255,255,255,.28)" stroke-width="2">${spur.join('')}</g>
    </g>
  </g>
  <!-- muzzle flash -->
  <g class="g-flash" transform="translate(982 178)">
    <circle r="150" fill="url(#gFlash)" opacity=".9"/>
    <path d="M0 0 L260 -26 L120 0 L260 26 Z M0 0 L170 -90 L80 -6 Z M0 0 L170 90 L80 6 Z M0 0 L90 -130 L40 -10 Z M0 0 L90 130 L40 10 Z" fill="#fff6c8"/>
    <circle r="40" fill="#fff"/>
  </g>
</svg>`;
  return sfx ? svg.replace(/(id="|url\(#)(g[A-Z]\w*)/g, `$1$2${sfx}`) : svg;
}

function rearCylSVG() {
  const ch = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * 60 - 90) * Math.PI / 180;
    const x = (120 * Math.cos(a)).toFixed(1), y = (120 * Math.sin(a)).toFixed(1);
    ch.push(`<g class="ch" data-k="${k}" transform="translate(${x} ${y})"><circle r="50" fill="#030405"/>
      <circle r="42" fill="#0d1014" stroke="#2b333e" stroke-width="3"/><circle r="30" fill="#050608"/>
      <g class="rd"><circle r="45" fill="url(#rBrass)" stroke="#5a3e0e" stroke-width="3"/>
      <circle r="35" fill="none" stroke="rgba(90,62,14,.7)" stroke-width="2"/><circle r="13" fill="url(#rPrimer)" stroke="#6b5a3a" stroke-width="2"/>
      <text y="-21" font-size="10" text-anchor="middle" fill="rgba(70,45,5,.75)" font-family="Inter, sans-serif" font-weight="800">.38</text></g></g>`);
  }
  const flutes = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * 60 - 60) * Math.PI / 180;
    flutes.push(`<circle cx="${(212 * Math.cos(a)).toFixed(1)}" cy="${(212 * Math.sin(a)).toFixed(1)}" r="42" fill="#000"/>`);
  }
  return `<svg class="g-rear" viewBox="-230 -230 460 460" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="rSteel" cx="-.25" cy="-.35" r="1.3">
      <stop offset="0" stop-color="#d7dee8"/><stop offset=".3" stop-color="#6b7787"/><stop offset=".65" stop-color="#262d38"/><stop offset="1" stop-color="#07090c"/>
    </radialGradient>
    <radialGradient id="rBrass" cx="-.3" cy="-.35" r="1.2">
      <stop offset="0" stop-color="#fff0b0"/><stop offset=".35" stop-color="#e2b04a"/><stop offset=".75" stop-color="#9a6b1c"/><stop offset="1" stop-color="#5a3e0e"/>
    </radialGradient>
    <radialGradient id="rPrimer" cx="-.3" cy="-.3" r="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#b9b9b9"/><stop offset="1" stop-color="#666"/>
    </radialGradient>
    <mask id="rMask"><rect x="-240" y="-240" width="480" height="480" fill="#fff"/>${flutes.join('')}</mask>
  </defs>
  <g class="r-body">
    <circle r="206" fill="#020305" mask="url(#rMask)"/>
    <circle r="200" fill="url(#rSteel)" mask="url(#rMask)"/>
    <circle r="186" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="3" mask="url(#rMask)"/>
    ${ch.join('')}
    <circle r="40" fill="url(#rSteel)" stroke="#05070a" stroke-width="3"/>
    <path d="M0 -26 L8 -8 L26 0 L8 8 L0 26 L-8 8 L-26 0 L-8 -8 Z" fill="#11161d"/>
    <circle r="7" fill="#7d8898"/>
  </g>
  <g class="r-drag" style="display:none"><circle r="45" fill="url(#rBrass)" stroke="#5a3e0e" stroke-width="3"/><circle r="13" fill="url(#rPrimer)"/></g>
</svg>`;
}

// ---------------------------------------------------------------- component
export class Revolver {
  // opts: { watch, name, pulls, bullets, live, extra, onFire(), onStream(state), onResult(dead) }
  // stages: load (cylinder out: see / move the bullets) → closing → closed (full-screen gun:
  // spin the cylinder, cock, pull) → fired → result
  constructor(opts) {
    this.o = opts;
    this.watch = !!opts.watch;
    this.stage = 'load';
    const n = Math.max(1, Math.min(5, opts.bullets || 1));
    this.slots = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, n).sort();
    this.cyl = 0; this.cw = 0;   // side-view cylinder offset (gun units) and spin speed (units/s)
    this.hammer = 0;             // 0..1 (1 = cocked)
    this.cocked = false;
    this.trig = 0;               // 0..1
    this.extra = 0;              // extra cylinder turn from the trigger (double action) or cocking
    this.live = opts.live;       // true / false / null (unknown yet)
    this.result = null;
    this.lastTickIdx = null; this.lastTickAt = 0;
    this.lastStream = 0; this.streamKey = '';
    this.drag = null;
    this.mount();
  }

  mount() {
    const o = this.o;
    const el = document.createElement('div');
    el.id = 'gun';
    el.className = `gun open ${this.watch ? 'watch' : ''}`;
    el.innerHTML = `
      <div class="g-vig"></div>
      <div class="g-top">
        <div class="g-who">${this.watch ? `<b>${esc(o.name)}</b> takes the gun` : 'Your turn with the gun'}</div>
        <div class="g-odds">${this.oddsHTML()}</div>
        ${o.extra ? `<div class="g-extra">${o.extra}</div>` : ''}
      </div>
      <div class="g-cylwrap"><div class="g-load">${this.loadText()}</div>${rearCylSVG()}</div>
      <div class="g-gunwrap">${sideGunSVG()}</div>
      <div class="g-hint"></div>
      <div class="g-btns g-btns-load">${this.watch ? '' : '<button class="g-btn hot" data-g="close">⤵ Load the gun</button>'}</div>
      <div class="g-btns g-btns-spin">${this.watch ? '' : '<button class="g-btn" data-g="spin">↻ Spin it</button>'}</div>
      <div class="g-cue g-cue-spin"><span>SPIN ⇆</span></div>
      <div class="g-cue g-cue-trig"><span>PULL</span><i></i></div>
      <div class="g-cue g-cue-ham"><span>COCK</span><i></i></div>
      <svg class="g-crack" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
      <div class="g-smoke"></div>
      <div class="g-white"></div>
      <div class="g-result"></div>
      ${this.watch ? '<button class="g-x" data-g="hide">✕</button>' : ''}`;
    document.body.appendChild(el);
    this.el = el;
    this.q = (s) => el.querySelector(s);
    this.rear = this.q('.g-rear');
    this.side = this.q('.g-side'); this.gunwrap = this.q('.g-gunwrap'); this.cylwrap = this.q('.g-cylwrap');
    this.hamG = this.q('.g-hammer'); this.trigG = this.q('.g-trigger'); this.flutesG = this.q('.g-flutes'); this.flashG = this.q('.g-flash');
    this.blurEl = this.q('.g-cylblur');
    this.paintSlots();
    this.setHint();
    this.layout();
    this.onResize = () => this.layout();
    addEventListener('resize', this.onResize);
    if (!this.watch) {
      el.addEventListener('pointerdown', (e) => this.down(e));
      el.addEventListener('pointermove', (e) => this.move(e));
      el.addEventListener('pointerup', (e) => this.up(e));
      el.addEventListener('pointercancel', (e) => this.up(e, true));
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-g]');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.g === 'spin') this.flick((Math.random() < 0.5 ? -1 : 1) * (1500 + Math.random() * 900));
      if (b.dataset.g === 'close') this.close();
      if (b.dataset.g === 'hide') this.el.classList.toggle('mini');
    });
    sfx.play('open');
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    this.cylwrap.animate([{ transform: 'translate(-50%, -50%) translateX(-70vw) rotate(-220deg)' }, { transform: 'translate(-50%, -50%)' }], { duration: 650, easing: 'cubic-bezier(.2,.9,.25,1.1)' });
    this.last = performance.now();
    const loop = (t) => { if (!this.el) return; this.frame(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
    this.render();
  }

  oddsHTML() {
    const { pulls = 0, bullets = 1 } = this.o;
    const dots = Array.from({ length: 6 }, (_, i) => `<span class="${i < bullets ? 'now' : ''}"></span>`).join('');
    return `<div class="g-dots">${dots}</div><div class="g-pct">Pull #${pulls + 1} · <b>${bullets} in 6</b> chance</div>`;
  }
  loadText() {
    const b = this.o.bullets || 1;
    return `<b>${b} bullet${b > 1 ? 's' : ''}</b> in 6 chambers`;
  }

  setHint() {
    const h = this.q('.g-hint');
    if (!h) return;
    const map = this.watch ? {
      load: 'Loading the gun…', closing: '', closed: 'Spinning… finger on the trigger…', fired: '', result: '',
    } : {
      load: 'Drag a bullet to another chamber if you like · swipe down to load',
      closing: '',
      closed: this.cocked ? 'Cocked. Press the trigger and pull it ↓' : 'Swipe across the cylinder to spin it · hold the trigger and pull ↓',
      fired: '', result: '',
    };
    h.textContent = map[this.stage] || '';
    this.el.classList.toggle('cocked', this.cocked);
    this.el.classList.toggle('closed', ['closed', 'fired', 'result'].includes(this.stage));
  }

  paintSlots() {
    for (const g of this.rear.querySelectorAll('.ch')) {
      const k = Number(g.dataset.k);
      g.querySelector('.rd').style.display = this.slots.includes(k) ? '' : 'none';
      g.classList.toggle('pick', this.pick === k);
    }
  }

  // where things go on screen
  layout() {
    const W = innerWidth, H = innerHeight;
    const g = this.gunwrap;
    if (this.stage === 'load' || this.stage === 'closing') {
      const gw = Math.min(W * 0.94, 520);
      this.scale = gw / VB_W;
      this.rot = false;
      g.style.width = gw + 'px'; g.style.height = gw * VB_H / VB_W + 'px';
      g.style.transform = `translate(-50%, -50%)`;
      g.style.top = Math.min(H * 0.74, H - gw * VB_H / VB_W / 2 - 70) + 'px';
      const cs = Math.min(W * 0.78, H * 0.4, 380);
      this.cylwrap.style.width = this.cylwrap.style.height = cs + 'px';
      this.cylwrap.style.top = Math.max(150, H * 0.38) + 'px';
    } else {
      // the gun stands up: barrel to the top of the phone, it fills the screen
      const len = Math.min(H * 0.80, W * 0.9 * VB_W / VB_H);
      this.scale = len / VB_W;
      this.rot = true;
      g.style.width = len + 'px'; g.style.height = len * VB_H / VB_W + 'px';
      g.style.top = H * 0.53 + 'px';
      g.style.transform = `translate(-50%, -50%) rotate(-90deg)`;
    }
    this.placeCues();
  }

  toScreen(x, y) {
    const r = this.gunwrap.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const lx = (x - VB_W / 2) * this.scale, ly = (y - VB_H / 2) * this.scale;
    return this.rot ? { x: cx + ly, y: cy - lx } : { x: cx + lx, y: cy + ly };
  }
  toGun(px, py) {
    const r = this.gunwrap.getBoundingClientRect();
    const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2);
    const lx = this.rot ? -dy : dx, ly = this.rot ? dx : dy;
    return { x: VB_W / 2 + lx / this.scale, y: VB_H / 2 + ly / this.scale };
  }
  pullDir() { return this.rot ? { x: 0, y: 1 } : { x: -1, y: 0 }; }
  // screen direction of the cylinder's surface moving (gun y axis)
  spinDir() { return this.rot ? { x: 1, y: 0 } : { x: 0, y: 1 }; }

  placeCues() {
    const show = this.stage === 'closed' && !this.watch;
    const t = this.q('.g-cue-trig'), h = this.q('.g-cue-ham'), sp = this.q('.g-cue-spin');
    if (!t) return;
    t.classList.toggle('on', show && this.trig < 0.05);
    h.classList.toggle('on', show && !this.cocked && this.trig < 0.05);
    sp.classList.toggle('on', show && !this.spun && this.trig < 0.05);
    if (!show) return;
    setTimeout(() => {
      if (!this.el) return;
      const a = this.toScreen(372, 350), b = this.toScreen(246, 100), c = this.toScreen(394, 219);
      const cx = (x) => Math.max(46, Math.min(innerWidth - 46, x));
      t.style.left = cx(a.x + 62) + 'px'; t.style.top = a.y + 'px';
      h.style.left = cx(b.x + 8) + 'px'; h.style.top = b.y + 62 + 'px';
      sp.style.left = cx(c.x - 78) + 'px'; sp.style.top = c.y + 'px';
    }, 650);
  }

  // ------------------------------------------------------------ input
  rearPt(e) {
    const m = this.rear.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  chamberAt(p) {
    for (let k = 0; k < 6; k++) {
      const a = (k * 60 - 90) * Math.PI / 180;
      if (Math.hypot(p.x - 120 * Math.cos(a), p.y - 120 * Math.sin(a)) < 58) return k;
    }
    return -1;
  }

  down(e) {
    if (e.target.closest('[data-g]')) return;
    const st = this.stage;
    if (st === 'load') {
      const p = this.rearPt(e);
      const k = this.chamberAt(p);
      if (k >= 0 && this.slots.includes(k)) {
        this.drag = { kind: 'bullet', from: k, x0: e.clientX, y0: e.clientY, moved: false };
        sfx.play('click'); vibrate(8);
      } else if (k >= 0 && this.pick != null) {
        this.moveBullet(this.pick, k); this.pick = null; this.paintSlots();
        this.drag = null;
      } else this.drag = { kind: 'swipe', x0: e.clientX, y0: e.clientY, t0: performance.now() };
      this.el.setPointerCapture?.(e.pointerId);
      return;
    }
    if (st === 'closed') {
      const p = this.toGun(e.clientX, e.clientY);
      const dH = Math.hypot(p.x - 252, p.y - 110), dT = Math.hypot(p.x - 368, p.y - 345);
      const onCyl = p.x > 300 && p.x < 490 && p.y > 120 && p.y < 300;
      if (dH < 90 && !this.cocked && dH < dT) this.drag = { kind: 'hammer', x0: e.clientX, y0: e.clientY, moved: false };
      else if (onCyl && this.trig < 0.05) {
        this.drag = { kind: 'cyl', last: this.spinAlong(e), hist: [{ t: performance.now(), c: this.cyl }] };
        this.cw = 0;
      } else if (dT < 150 || (p.y > 280 && p.x < 470 && p.x > 150)) {
        this.drag = { kind: 'trigger', x0: e.clientX, y0: e.clientY };
        this.cw = 0; this.snapCyl();
        vibrate(10);
      } else this.drag = null;
      if (this.drag) this.el.setPointerCapture?.(e.pointerId);
    }
  }
  spinAlong(e) { const d = this.spinDir(); return (e.clientX * d.x + e.clientY * d.y) / this.scale; }
  move(e) {
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'bullet') {
      d.moved = d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8;
      if (!d.moved) return;
      const p = this.rearPt(e);
      const ghost = this.rear.querySelector('.r-drag');
      ghost.style.display = '';
      ghost.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(1.12)`);
      this.rear.querySelector(`.ch[data-k="${d.from}"] .rd`).style.display = 'none';
      return;
    }
    if (d.kind === 'swipe') {
      if (e.clientY - d.y0 > 70 && Math.abs(e.clientY - d.y0) > Math.abs(e.clientX - d.x0) * 1.3) { this.drag = null; this.close(); }
      return;
    }
    if (d.kind === 'cyl') {
      const now = this.spinAlong(e);
      this.cyl += now - d.last;
      d.last = now;
      this.spun = true;
      const t = performance.now();
      d.hist.push({ t, c: this.cyl });
      while (d.hist.length > 2 && t - d.hist[0].t > 90) d.hist.shift();
      return;
    }
    const dir = this.pullDir();
    const along = (e.clientX - d.x0) * dir.x + (e.clientY - d.y0) * dir.y;
    const units = along / this.scale;
    if (d.kind === 'hammer') {
      d.moved = d.moved || Math.abs(along) > 6;
      this.hammer = clamp(units / 70, 0, 1);
      if (this.hammer >= 1) { this.drag = null; this.cock(); }
      return;
    }
    if (d.kind === 'trigger') {
      const need = this.cocked ? PULL_SA : PULL_DA;
      const p = clamp(units / need, 0, 1);
      if (Math.floor(p * 5) > Math.floor(this.trig * 5)) vibrate(6);
      this.trig = p;
      if (!this.cocked) { this.hammer = p * 0.92; this.extra = p * FLUTE_PITCH; }
      if (p >= 1) { this.drag = null; this.fire(); }
    }
  }
  up(e, cancelled) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'bullet') {
      this.rear.querySelector('.r-drag').style.display = 'none';
      if (!d.moved) { this.pick = this.pick === d.from ? null : d.from; this.paintSlots(); return; }
      const k = this.chamberAt(this.rearPt(e));
      if (k >= 0 && !this.slots.includes(k)) this.moveBullet(d.from, k);
      this.paintSlots();
      return;
    }
    if (d.kind === 'swipe') {
      const dt = performance.now() - d.t0;
      if (!cancelled && dt < 250 && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 10) {
        const r = this.gunwrap.getBoundingClientRect();
        if (e.clientY > r.top - 20) this.close();
      }
      return;
    }
    if (d.kind === 'cyl') {
      const h = d.hist;
      if (h.length >= 2) {
        const a = h[0], b = h[h.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0.005) this.flick(((b.c - a.c) / dt) * 1.1);
      }
      if (Math.abs(this.cw) < 60) this.snapCyl();
      this.placeCues();
      return;
    }
    if (d.kind === 'hammer') {
      if (!d.moved || this.hammer > 0.6) this.cock();
      else this.springHammer();
      return;
    }
    if (d.kind === 'trigger' && this.stage === 'closed') this.springTrigger();
  }

  moveBullet(from, to) {
    if (from === to || this.slots.includes(to)) return;
    this.slots = this.slots.map((k) => (k === from ? to : k)).sort();
    sfx.play('cock'); vibrate(14);
    this.stream(true);
  }

  flick(w) {
    if (this.stage !== 'closed' || this.trig > 0.05) return;
    this.cw = clamp(w, -4200, 4200);
    this.spun = true;
    this.placeCues();
    if (Math.abs(this.cw) > 300) { sfx.play('spin', { vol: Math.min(0.35, Math.abs(this.cw) / 7000) }); vibrate(12); }
  }
  snapCyl() {
    const to = Math.round(this.cyl / FLUTE_PITCH) * FLUTE_PITCH;
    this.snapTo = to;
  }

  cock() {
    if (this.cocked || this.stage !== 'closed') return;
    this.cocked = true;
    this.hammer = 1;
    this.cw = 0; this.snapCyl();
    const t0 = performance.now(), from = this.extra;
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 120); this.extra = from + (FLUTE_PITCH - from) * k; if (k < 1) requestAnimationFrame(step); };
    step();
    sfx.play('cock'); vibrate([18, 90, 22]);
    this.setHint(); this.placeCues();
  }
  springHammer() {
    const from = this.hammer, t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 140); this.hammer = from * (1 - k); if (k < 1 && !this.cocked) requestAnimationFrame(step); };
    step();
  }
  springTrigger() {
    const from = this.trig, fromH = this.hammer, fromX = this.extra, t0 = performance.now();
    const step = () => {
      if (this.stage !== 'closed') return;
      const k = Math.min(1, (performance.now() - t0) / 160);
      this.trig = from * (1 - k);
      if (!this.cocked) { this.hammer = fromH * (1 - k); this.extra = fromX * (1 - k); }
      if (k < 1) requestAnimationFrame(step); else this.placeCues();
    };
    step();
  }

  close() {
    if (this.stage !== 'load') return;
    this.stage = 'closing';
    this.pick = null;
    this.setHint();
    this.el.classList.remove('open');
    const sideCyl = this.q('.g-cylside').getBoundingClientRect();
    const cr = this.cylwrap.getBoundingClientRect();
    const dx = sideCyl.left + sideCyl.width / 2 - (cr.left + cr.width / 2);
    const dy = sideCyl.top + sideCyl.height / 2 - (cr.top + cr.height / 2);
    const k = sideCyl.height / cr.height;
    sfx.play('spin', { vol: 0.15 });
    const a = this.cylwrap.animate([
      { transform: 'translate(-50%, -50%)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${k}) rotateY(70deg) rotate(200deg)`, opacity: 0.2 },
    ], { duration: 360, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' });
    a.onfinish = () => {
      if (!this.el) return;
      this.stage = 'closed';
      this.setHint();
      sfx.play('close'); vibrate(45);
      this.gunwrap.animate([{ filter: 'brightness(2)' }, { filter: 'none' }], { duration: 220 });
      this.layout();
      this.stream(true);
    };
  }

  fire() {
    if (this.stage !== 'closed') return;
    this.stage = 'fired';
    this.trig = 1;
    this.cw = 0;
    this.placeCues();
    this.setHint();
    const fromH = this.hammer, t0 = performance.now();
    const drop = () => { const k = Math.min(1, (performance.now() - t0) / 55); this.hammer = fromH * (1 - k); if (k < 1) requestAnimationFrame(drop); };
    drop();
    this.stream(true);
    if (this.o.onFire) this.o.onFire();
    if (this.live === true || this.live === false) setTimeout(() => this.showResult(this.live), 60);
    else this.waitTimer = setTimeout(() => { if (this.stage === 'fired') this.q('.g-hint').textContent = '…'; }, 900);
  }

  setResult(dead) {
    if (this.result !== null) return;
    if (this.stage === 'fired') { this.showResult(dead); return; }
    this.autoPlay(dead);
  }

  // scripted run: load, spin, pull — spectators of bots, auto-fire and the test bench
  async autoPlay(dead = null) {
    if (this.auto) return;
    this.auto = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (this.stage === 'load') { await wait(dead === null ? 700 : 300); this.close(); await wait(650); }
    while (this.stage === 'closing') await wait(50);
    if (this.stage === 'closed') {
      this.flick(2400 + Math.random() * 1200);
      await wait(dead === null ? 1300 : 900);
      this.cw = 0; this.snapCyl();
      const t0 = performance.now();
      await new Promise((res) => {
        const step = () => {
          if (!this.el || this.stage !== 'closed') return res();
          const k = Math.min(1, (performance.now() - t0) / 700);
          this.trig = k; this.hammer = k * 0.92; this.extra = k * FLUTE_PITCH;
          if (k < 1) setTimeout(step, 16); else res();
        };
        step();
      });
      if (this.watch || dead !== null) {
        this.stage = 'fired'; this.hammer = 0;
        if (dead !== null) this.showResult(dead);
      } else this.fire();
    } else if (this.stage === 'fired' && dead !== null) this.showResult(dead);
  }
  showResult(dead) {
    if (this.result !== null || !this.el) return;
    this.result = dead;
    this.stage = 'result';
    clearTimeout(this.waitTimer);
    this.hammer = 0; this.trig = 0;
    this.setHint();
    const res = this.q('.g-result');
    const name = this.watch ? esc(this.o.name) : 'You';
    if (dead) {
      sfx.play('bang');
      vibrate([650, 80, 300]);
      this.el.classList.add('bang');
      // muzzle flash
      this.flashG.animate([{ opacity: 1, transform: 'translate(982px,178px) scale(.6)' }, { opacity: 1, transform: 'translate(982px,178px) scale(1.25)', offset: 0.35 }, { opacity: 0, transform: 'translate(982px,178px) scale(1.5)' }], { duration: 170, easing: 'ease-out' });
      this.q('.g-white').animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
      // recoil: back along the barrel, muzzle flips up
      const base = this.rot ? 'translate(-50%, -50%) rotate(-90deg)' : 'translate(-50%, -50%)';
      this.gunwrap.animate([
        { transform: base },
        { transform: `${base} translateX(-${46 * this.scale * 2}px) rotate(-14deg)`, offset: 0.12 },
        { transform: `${base} translateX(-${12 * this.scale * 2}px) rotate(-4deg)`, offset: 0.5 },
        { transform: base },
      ], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' });
      this.el.animate([0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ transform: i === 7 ? 'none' : `translate(${(Math.random() - 0.5) * 34}px, ${(Math.random() - 0.5) * 34}px)` })), { duration: 420 });
      this.smoke();
      this.crack();
      setTimeout(() => sfx.play('death'), 900);
      setTimeout(() => {
        if (!this.el) return;
        this.el.classList.add('dead');
        res.innerHTML = `<div class="r-big">BANG</div><div class="r-skull">💀</div><div class="r-txt">${this.watch ? `${name} is dead` : "You're dead"}</div>
          <div class="r-sub">${this.watch ? 'One less liar at the table.' : 'You are a ghost now 👻 Keep betting on every TIPU! call.'}</div>`;
        res.classList.add('on');
      }, 650);
    } else {
      sfx.play('dry');
      vibrate(28);
      this.el.classList.add('click');
      const base = this.rot ? 'translate(-50%, -50%) rotate(-90deg)' : 'translate(-50%, -50%)';
      this.gunwrap.animate([{ transform: base }, { transform: `${base} translateX(-4px)` }, { transform: base }], { duration: 120 });
      setTimeout(() => { sfx.play('heart'); }, 450);
      setTimeout(() => { sfx.play('heart'); }, 1250);
      setTimeout(() => {
        if (!this.el) return;
        sfx.play('relief');
        this.el.classList.add('alive');
        const b = this.o.bullets || 1;
        res.innerHTML = `<div class="r-big small">*click*</div><div class="r-txt">${this.watch ? `${name} lives` : 'You live'}</div>
          <div class="r-sub">Still ${b} in 6 next time.</div>`;
        res.classList.add('on');
      }, 700);
    }
    if (this.o.onResult) this.o.onResult(dead);
  }

  smoke() {
    const box = this.q('.g-smoke');
    const m = this.toScreen(990, 178);
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('i');
      const sz = 30 + Math.random() * 60;
      s.style.cssText = `left:${m.x - sz / 2}px;top:${m.y - sz / 2}px;width:${sz}px;height:${sz}px`;
      box.appendChild(s);
      const dir = this.rot ? { x: (Math.random() - 0.5) * 120, y: -80 - Math.random() * 200 } : { x: 80 + Math.random() * 200, y: -40 - Math.random() * 120 };
      s.animate([{ transform: 'scale(.2)', opacity: 0.85 }, { transform: `translate(${dir.x}px, ${dir.y}px) scale(${2 + Math.random() * 2})`, opacity: 0 }], { duration: 1600 + Math.random() * 1400, delay: i * 30, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    }
  }

  crack() {
    const svg = this.q('.g-crack');
    const cx = 30 + Math.random() * 40, cy = 18 + Math.random() * 30;
    let html = '';
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + Math.random() * 0.4;
      let x = cx, y = cy, d = `M${cx} ${cy}`;
      const len = 4 + Math.random() * 7;
      for (let k = 0; k < 6; k++) { x += Math.cos(a + (Math.random() - 0.5) * 0.7) * len; y += Math.sin(a + (Math.random() - 0.5) * 0.7) * len * 0.6; d += ` L${x.toFixed(1)} ${y.toFixed(1)}`; }
      html += `<path d="${d}" pathLength="1"/>`;
    }
    for (let r = 3; r < 14; r += 4) {
      let d = '';
      for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2; const rr = r * (0.8 + Math.random() * 0.4); d += `${k ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr * 0.6).toFixed(1)} `; }
      html += `<path d="${d}" pathLength="1" class="ring"/>`;
    }
    svg.innerHTML = html;
    svg.classList.add('on');
  }

  // ------------------------------------------------------------ spectators
  applyStream(m) {
    if (!this.watch || !m) return;
    if (Array.isArray(m.b) && this.stage === 'load') { this.slots = m.b.filter((k) => k >= 0 && k < 6); this.paintSlots(); }
    if ((m.st === 'closed' || m.st === 'fired') && this.stage === 'load') this.close();
    if (this.stage === 'closed') {
      this.trig = m.tr || 0; this.hammer = m.h || 0; this.cocked = !!m.ck;
      this.extra = this.cocked ? FLUTE_PITCH : (m.tr || 0) * FLUTE_PITCH;
      if (typeof m.c === 'number') { this.cyl = m.c; this.cw = m.w || 0; this.snapTo = null; }
    }
    if (m.st === 'fired' && this.stage === 'closed') { this.stage = 'fired'; this.hammer = 0; this.trig = 1; this.cw = 0; this.setHint(); }
  }

  stream(force = false) {
    if (this.watch || !this.o.onStream) return;
    const now = performance.now();
    if (!force && now - this.lastStream < 110) return;
    const st = this.stage === 'closing' ? 'load' : this.stage === 'result' ? 'fired' : this.stage;
    const m = { st, b: this.slots, c: Math.round(this.cyl), w: Math.round(this.cw), h: +this.hammer.toFixed(2), tr: +this.trig.toFixed(2), ck: this.cocked ? 1 : 0 };
    const key = JSON.stringify(m);
    if (!force && key === this.streamKey) return;
    this.streamKey = key; this.lastStream = now;
    this.o.onStream(m);
  }

  // ------------------------------------------------------------ animation
  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.stage === 'closed' && (!this.drag || this.drag.kind !== 'cyl')) {
      if (Math.abs(this.cw) > 40) {
        this.cyl += this.cw * dt;
        this.cw *= Math.exp(-(Math.abs(this.cw) > 600 ? 0.5 : 1.3) * dt);
        this.snapTo = null;
      } else {
        this.cw = 0;
        if (this.snapTo == null) this.snapCyl();
        this.cyl += (this.snapTo - this.cyl) * Math.min(1, dt * 12);
      }
    }
    const idx = Math.floor((this.cyl + this.extra) / FLUTE_PITCH);
    if (this.lastTickIdx !== null && idx !== this.lastTickIdx && t - this.lastTickAt > 28) {
      this.lastTickAt = t;
      sfx.play('tick', { vol: clamp(0.25 + Math.abs(this.cw) / 5000, 0.25, 0.6) });
      if (Math.abs(this.cw) < 1000) vibrate(4);
    }
    this.lastTickIdx = idx;
    this.render();
    if (this.stage !== 'result') this.stream();
  }

  render() {
    const sp = Math.abs(this.cw);
    this.blurEl.setAttribute('opacity', clamp((sp - 200) / 1600, 0, 0.92).toFixed(2));
    this.hamG.setAttribute('transform', `rotate(${(HAMMER_COCKED * this.hammer).toFixed(2)} 286 196)`);
    this.trigG.setAttribute('transform', `rotate(${(TRIGGER_MAX * this.trig).toFixed(2)} 377 300)`);
    const off = (((this.cyl + this.extra) % FLUTE_PITCH) + FLUTE_PITCH) % FLUTE_PITCH;
    this.flutesG.setAttribute('transform', `translate(0 ${off.toFixed(2)})`);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
    clearTimeout(this.waitTimer);
    const el = this.el;
    this.el = null;
    if (el) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).onfinish = () => el.remove(); }
  }
}
