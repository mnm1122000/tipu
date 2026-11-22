// TIPU! — what everyone else sees while someone takes the gun: the shooter as a character in a
// spotlight, their profile picture for a face, revolver raised to the temple. It follows the
// shooter's real phone live (loading, gun up, finger tightening on the trigger), then BANG or *click*.
import { sfx, vibrate } from './sfx.js?v=3';
import { sideGunSVG } from './gun.js?v=3';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ARM_DOWN = 105;     // degrees: gun resting by the hip
const SHOULDER = [250, 284];
const MUZZLE = [262, 160];
let uid = 0;

// ten looks, one per seat, so nobody at the table looks the same
export const OUTFITS = [
  { name: 'The Boss', skin: '#c8916b', top: 'suit', c1: '#17181d', c2: '#f2ede4', c3: '#a3141f', hair: 'short', hc: '#1b1310', hat: 'fedora', hatc: '#3a3a40', legs: '#17181d' },
  { name: 'Lady in Red', skin: '#e0ac88', top: 'dress', c1: '#b3132a', hair: 'long', hc: '#140c0a', jewel: 'necklace', legs: 'skin' },
  { name: 'The Cowboy', skin: '#b47a55', top: 'plaid', c1: '#8e2a22', c2: '#3a1612', c3: '#6b4423', hair: 'short', hc: '#4a2e18', hat: 'cowboy', hatc: '#a87a45', legs: '#2c4a7a' },
  { name: 'Hijabi', skin: '#d8a27c', top: 'kurung', c1: '#c9a6e0', c2: '#8a5fb0', hair: 'none', hijab: '#6a3d8f', legs: '#c9a6e0' },
  { name: 'The Biker', skin: '#f0c4a0', top: 'leather', c1: '#121214', c2: '#2a2a2e', hair: 'spiky', hc: '#5a3a22', legs: '#1e2a44' },
  { name: 'Bartender', skin: '#8a5a3c', top: 'vest', c1: '#f4f1ea', c2: '#141416', c3: '#b3132a', hair: 'slick', hc: '#0e0a08', legs: '#141416' },
  { name: 'The Diva', skin: '#f3caa8', top: 'sequin', c1: '#1f9a62', hair: 'bob', hc: '#e8c25a', jewel: 'earrings', legs: 'skin' },
  { name: 'Hoodie', skin: '#c48a63', top: 'hoodie', c1: '#6b6f78', c2: '#4b4e55', hair: 'ponytail', hc: '#8a3a1c', legs: '#22262e' },
  { name: 'Baju Melayu', skin: '#b98258', top: 'melayu', c1: '#1f2f6b', c2: '#d6a836', hair: 'short', hc: '#120c08', hat: 'songkok', hatc: '#0c0c0e', legs: '#1f2f6b' },
  { name: 'The CEO', skin: '#e9b996', top: 'blazer', c1: '#1d2b4f', c2: '#f4f1ea', hair: 'bun', hc: '#3a2214', jewel: 'pearls', legs: '#1d2b4f' },
];

const TORSO = 'M124 490 Q110 336 152 276 Q200 258 248 276 Q290 336 276 490 Q200 510 124 490 Z';

function hairBack(o) {
  const c = o.hc;
  switch (o.hair) {
    case 'long': return `<path d="M130 176 Q122 92 200 92 Q278 92 270 176 Q282 250 290 318 Q244 334 200 330 Q156 334 110 318 Q118 250 130 176 Z" fill="${c}"/>`;
    case 'bob': return `<path d="M132 178 Q126 94 200 94 Q274 94 268 178 L274 238 Q240 250 200 246 Q160 250 126 238 Z" fill="${c}"/>`;
    case 'ponytail': return `<path d="M138 160 Q140 96 200 94 Q260 96 262 160 Z" fill="${c}"/><path d="M252 112 q52 18 44 104 q-4 22 -16 26 q-6 -60 -40 -100 z" fill="${c}"/>`;
    case 'bun': return `<path d="M138 160 Q140 98 200 96 Q260 98 262 160 Z" fill="${c}"/><circle cx="200" cy="90" r="24" fill="${c}"/>`;
    case 'short': case 'slick': return `<path d="M136 158 Q138 96 200 94 Q262 96 264 158 Z" fill="${c}"/>`;
    case 'spiky': return `<path d="M136 158 L132 112 L152 122 L156 92 L176 112 L190 84 L204 108 L222 84 L230 112 L252 94 L250 122 L270 114 L264 158 Z" fill="${c}"/>`;
    default: return '';
  }
}
function hairFront(o) {
  const c = o.hc;
  switch (o.hair) {
    case 'long': case 'bob': return `<path d="M140 150 Q150 104 200 102 Q252 104 262 150 Q232 126 200 128 Q168 126 140 150 Z" fill="${c}"/>`;
    case 'slick': return `<path d="M142 140 Q160 102 200 100 Q246 102 260 136 Q226 116 182 122 Q160 126 142 140 Z" fill="${c}"/><path d="M160 118 Q200 104 246 120" stroke="rgba(255,255,255,.25)" stroke-width="3" fill="none"/>`;
    case 'short': case 'spiky': case 'ponytail': case 'bun': return `<path d="M142 138 Q160 104 200 102 Q240 104 258 138 Q230 120 200 122 Q170 120 142 138 Z" fill="${c}"/>`;
    default: return '';
  }
}
function hat(o) {
  const c = o.hatc;
  if (o.hat === 'fedora') return `<path d="M112 116 Q200 96 288 116 Q262 128 200 126 Q138 128 112 116 Z" fill="${c}"/><path d="M146 114 Q144 66 200 64 Q256 66 254 114 Q200 104 146 114 Z" fill="${c}"/><path d="M148 104 Q200 96 252 104 L252 114 Q200 104 148 114 Z" fill="#111"/><path d="M180 70 Q200 80 220 70" stroke="rgba(0,0,0,.35)" stroke-width="4" fill="none"/>`;
  if (o.hat === 'cowboy') return `<path d="M96 104 Q120 128 200 124 Q280 128 304 104 Q292 132 200 136 Q108 132 96 104 Z" fill="${c}"/><path d="M150 120 Q144 60 176 62 Q200 76 224 62 Q256 60 250 120 Q200 112 150 120 Z" fill="${c}"/><path d="M150 108 Q200 100 250 108 L250 118 Q200 110 150 118 Z" fill="#4a2a12"/>`;
  if (o.hat === 'songkok') return `<path d="M144 116 L148 70 Q200 60 252 70 L256 116 Q200 106 144 116 Z" fill="${c}"/><path d="M148 72 Q200 62 252 72" stroke="rgba(255,255,255,.18)" stroke-width="3" fill="none"/>`;
  return '';
}
function hijabBack(o) {
  if (!o.hijab) return '';
  return `<path d="M120 172 Q118 84 200 82 Q282 84 280 172 Q292 260 262 304 L200 344 L138 304 Q108 260 120 172 Z" fill="${o.hijab}"/>`;
}
function hijabFront(o) {
  if (!o.hijab) return '';
  return `<circle cx="200" cy="168" r="66" fill="none" stroke="${o.hijab}" stroke-width="10"/><path d="M140 214 Q200 262 260 214 L262 300 Q200 330 138 300 Z" fill="${o.hijab}"/><path d="M150 236 Q200 268 250 236" stroke="rgba(0,0,0,.18)" stroke-width="3" fill="none"/>`;
}
function torso(o) {
  const t = o.top, c1 = o.c1, c2 = o.c2, c3 = o.c3, sk = o.skin;
  switch (t) {
    case 'suit': return `<path d="${TORSO}" fill="${c1}"/><path d="M178 268 L200 340 L222 268 Z" fill="${c2}"/><path d="M196 276 L204 276 L210 346 L200 362 L190 346 Z" fill="${c3}"/>
      <path d="M160 274 L192 352 L176 360 Z M240 274 L208 352 L224 360 Z" fill="rgba(255,255,255,.08)"/><circle cx="200" cy="396" r="4" fill="#333"/><circle cx="200" cy="430" r="4" fill="#333"/>`;
    case 'vest': return `<path d="${TORSO}" fill="${c1}"/><path d="M150 290 Q160 400 150 484 Q176 500 196 498 L196 300 Z M250 290 Q240 400 250 484 Q224 500 204 498 L204 300 Z" fill="${c2}"/>
      <path d="M186 278 L200 286 L214 278 L214 294 L200 286 L186 294 Z" fill="${c3}"/><circle cx="200" cy="330" r="3" fill="#ccc"/><circle cx="200" cy="370" r="3" fill="#ccc"/>`;
    case 'leather': return `<path d="${TORSO}" fill="${c1}"/><path d="M200 268 L200 494" stroke="#777" stroke-width="3" stroke-dasharray="4 3"/><path d="M160 272 L196 320 L176 336 Z M240 272 L204 320 L224 336 Z" fill="${c2}"/>
      <path d="M140 420 L180 420 M220 420 L260 420" stroke="#555" stroke-width="3"/><path d="M132 340 Q150 330 160 360" stroke="rgba(255,255,255,.12)" stroke-width="6" fill="none"/>`;
    case 'hoodie': return `<path d="M136 272 Q200 236 264 272 Q240 300 200 296 Q160 300 136 272 Z" fill="${c2}"/><path d="${TORSO}" fill="${c1}"/><path d="M186 284 L182 350 M214 284 L218 350" stroke="#ddd" stroke-width="3"/>
      <path d="M150 410 Q200 400 250 410 L240 464 Q200 470 160 464 Z" fill="${c2}"/>`;
    case 'dress': return `<path d="${TORSO}" fill="${c1}"/><path d="M168 268 Q200 312 232 268 Z" fill="${sk}"/><path d="M118 470 Q200 500 282 470 L300 556 Q200 580 100 556 Z" fill="${c1}"/><path d="M160 276 Q200 300 240 276" stroke="rgba(0,0,0,.25)" stroke-width="3" fill="none"/>`;
    case 'sequin': {
      let dots = '';
      for (let y = 290; y < 560; y += 14) for (let x = 120; x < 290; x += 14) dots += `<circle cx="${x + ((y / 14) % 2) * 7}" cy="${y}" r="2.2" fill="rgba(255,255,255,${(0.15 + ((x * y) % 7) / 20).toFixed(2)})"/>`;
      return `<clipPath id="seq${o.k}"><path d="${TORSO} M118 470 Q200 500 282 470 L296 556 Q200 580 104 556 Z"/></clipPath>
        <path d="${TORSO}" fill="${c1}"/><path d="M118 470 Q200 500 282 470 L296 556 Q200 580 104 556 Z" fill="${c1}"/><path d="M176 268 Q200 300 224 268 Z" fill="${sk}"/><g clip-path="url(#seq${o.k})">${dots}</g>`;
    }
    case 'kurung': return `<path d="M120 500 Q106 336 152 276 Q200 258 248 276 Q294 336 280 500 L292 560 Q200 578 108 560 Z" fill="${c1}"/><path d="M200 300 L200 360" stroke="${c2}" stroke-width="3"/>
      ${[0, 1, 2, 3].map((i) => `<circle cx="${150 + i * 34}" cy="${430 + (i % 2) * 40}" r="7" fill="${c2}" opacity=".6"/>`).join('')}`;
    case 'melayu': return `<path d="${TORSO}" fill="${c1}"/><path d="M182 264 L218 264 L216 280 L184 280 Z" fill="${c1}" stroke="rgba(255,255,255,.25)" stroke-width="2"/><path d="M200 280 L200 340" stroke="rgba(255,255,255,.3)" stroke-width="2"/>
      <circle cx="200" cy="300" r="3" fill="${c2}"/><circle cx="200" cy="320" r="3" fill="${c2}"/><path d="M118 444 Q200 462 282 444 L288 540 Q200 560 112 540 Z" fill="${c2}"/>
      <path d="M118 470 Q200 488 282 470 M116 500 Q200 518 284 500" stroke="#8a5a10" stroke-width="3" fill="none"/>`;
    case 'plaid': {
      let lines = '';
      for (let x = 110; x < 300; x += 22) lines += `<path d="M${x} 250 L${x} 520" stroke="${c2}" stroke-width="6" opacity=".55"/>`;
      for (let y = 280; y < 520; y += 22) lines += `<path d="M100 ${y} L300 ${y}" stroke="${c2}" stroke-width="6" opacity=".55"/>`;
      return `<clipPath id="pl${o.k}"><path d="${TORSO}"/></clipPath><path d="${TORSO}" fill="${c1}"/><g clip-path="url(#pl${o.k})">${lines}</g>
        <path d="M148 290 Q158 400 148 486 Q176 500 190 498 L186 300 Z M252 290 Q242 400 252 486 Q224 500 210 498 L214 300 Z" fill="${c3}"/><path d="M182 268 L200 290 L218 268" stroke="${c2}" stroke-width="5" fill="none"/>`;
    }
    case 'blazer': return `<path d="${TORSO}" fill="${c1}"/><path d="M178 268 Q200 300 222 268 L218 360 L182 360 Z" fill="${c2}"/><path d="M160 274 L190 360 L172 372 Z M240 274 L210 360 L228 372 Z" fill="rgba(255,255,255,.1)"/>`;
  }
  return `<path d="${TORSO}" fill="${c1}"/>`;
}
function jewels(o) {
  if (o.jewel === 'necklace') return `<path d="M172 272 Q200 304 228 272" stroke="#e7b64a" stroke-width="3" fill="none"/><circle cx="200" cy="298" r="6" fill="#e7b64a"/>`;
  if (o.jewel === 'pearls') return `${Array.from({ length: 9 }, (_, i) => { const a = Math.PI * (0.15 + 0.7 * i / 8); return `<circle cx="${(200 - 30 * Math.cos(a)).toFixed(1)}" cy="${(268 + 24 * Math.sin(a)).toFixed(1)}" r="4" fill="#f4f1ea" stroke="#bbb"/>`; }).join('')}`;
  return '';
}
const sleeve = (o) => (o.top === 'dress' || o.top === 'sequin' ? o.skin : o.c1);
const legC = (o) => (o.legs === 'skin' ? o.skin : o.legs);

// a fist around the grip, index finger on the trigger, thumb up on the hammer side
function fistSVG(sk) {
  return `<g class="a-fist">
    <path d="M340 172 q-8 0 -9 9 l-1 22 q1 10 11 11 l14 1 q10 0 11 -10 l1 -24 q-1 -9 -10 -9 Z" fill="${sk}" stroke="rgba(0,0,0,.35)" stroke-width="2"/>
    <path d="M331 186 l12 0 M331 196 l12 0 M332 206 l11 0" stroke="rgba(0,0,0,.3)" stroke-width="2" stroke-linecap="round"/>
    <path d="M334 178 q-6 -2 -10 2" stroke="${sk}" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M362 176 q6 -8 2 -16" stroke="${sk}" stroke-width="8" stroke-linecap="round" fill="none"/></g>`;
}
function restHandSVG(sk) {
  return `<path d="M158 448 q12 -10 30 -6 q12 4 12 14 q-2 10 -12 12 l-26 2 q-10 0 -10 -9 Z" fill="${sk}" stroke="rgba(0,0,0,.3)" stroke-width="2"/>
    <path d="M176 450 l4 18 M186 448 l4 19 M194 450 l2 16" stroke="rgba(0,0,0,.25)" stroke-width="2" fill="none"/>`;
}

function sceneSVG(o, id, gun) {
  o = { ...o, k: id };
  const sk = o.skin;
  const face = o.photo
    ? `<image href="${o.photo}" x="138" y="106" width="124" height="124" clip-path="url(#aFace${id})" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="200" cy="168" r="62" fill="${sk}"/><text x="200" y="192" font-size="66" text-anchor="middle">${esc(o.emoji || '🙂')}</text>`;
  const legs = legC(o);
  const heels = o.legs === 'skin';
  return `<svg class="a-svg" viewBox="0 0 400 620" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="aFace${id}"><circle cx="200" cy="168" r="62"/></clipPath>
    <radialGradient id="aShade${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <radialGradient id="aBody${id}" cx=".3" cy=".25" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <radialGradient id="aFlash${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffe9a0"/><stop offset=".7" stop-color="#ff8a1f" stop-opacity=".8"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse class="a-shadow" cx="200" cy="592" rx="150" ry="18" fill="rgba(0,0,0,.6)"/>
  <g stroke="#3b1d10" stroke-width="10" stroke-linecap="round"><path d="M140 522 L118 592 M260 522 L282 592 M200 527 L200 594"/></g>
  <ellipse cx="200" cy="516" rx="96" ry="20" fill="#5a2c14" stroke="#2a1006" stroke-width="5"/>
  <g class="a-fig">
    <!-- legs -->
    <path d="M160 480 L150 566 M240 480 L252 566" stroke="${legs}" stroke-width="${heels ? 22 : 36}" stroke-linecap="round"/>
    ${heels ? '<path d="M140 572 l22 0 l-4 10 M240 572 l22 0 l4 10" stroke="#111" stroke-width="7" stroke-linecap="round" fill="none"/>' : '<path d="M132 574 l-26 6 M268 574 l26 6" stroke="#0b0b0d" stroke-width="15" stroke-linecap="round"/>'}
    <g transform="translate(0 16)">${hijabBack(o)}</g>
    <!-- neck + body -->
    <path d="M186 226 L214 226 L216 266 Q200 274 184 266 Z" fill="${sk}"/><path d="M188 252 Q200 258 212 252" stroke="rgba(0,0,0,.18)" stroke-width="4" fill="none"/>
    ${torso(o)}
    <path d="${TORSO}" fill="url(#aBody${id})"/>
    ${jewels(o)}
    <!-- resting arm -->
    <path d="M150 286 C122 312 112 372 122 418 C128 444 148 454 166 452" fill="none" stroke="${sleeve(o)}" stroke-width="30" stroke-linecap="round"/>
    ${restHandSVG(sk)}
    <!-- head -->
    <g class="a-head"><g transform="translate(0 16)">
      ${hairBack(o)}
      <ellipse cx="137" cy="172" rx="10" ry="14" fill="${sk}"/><ellipse cx="263" cy="172" rx="10" ry="14" fill="${sk}"/>
      ${o.jewel === 'earrings' ? '<circle cx="136" cy="190" r="5" fill="#e7b64a"/><circle cx="264" cy="190" r="5" fill="#e7b64a"/>' : ''}
      <circle cx="200" cy="168" r="65" fill="#0e0405"/>
      ${face}
      <circle cx="200" cy="168" r="62" fill="url(#aShade${id})"/>
      ${hijabFront(o)}${hairFront(o)}${hat(o)}
      <g class="a-sweat"><path d="M154 126 q-6 12 0 16 q6 -4 0 -16 Z" fill="#bfe7ff"/><path d="M244 116 q-5 10 0 13 q5 -3 0 -13 Z" fill="#bfe7ff"/></g>
    </g></g>
    <!-- gun arm -->
    <g class="a-arm">
      <path d="M250 286 Q318 294 342 270 Q358 252 352 230" fill="none" stroke="${sleeve(o)}" stroke-width="28" stroke-linecap="round"/>
      <g transform="translate(0 16)"><g class="a-gun"><g transform="translate(379.8 138.6) scale(-0.12 0.12)">${gun}</g></g>
      ${fistSVG(sk)}
      <g class="a-flash" opacity="0"><circle cx="${MUZZLE[0]}" cy="${MUZZLE[1]}" r="46" fill="url(#aFlash${id})"/></g>
    </g></g>
  </g>
</svg>`;
}

function miniGun(id) {
  // the real revolver art, embedded as an inner drawing
  return sideGunSVG('_a' + id).replace(/<svg class="g-side"[^>]*>/, '<svg x="0" y="0" width="1000" height="560" viewBox="0 0 1000 560" overflow="visible">');
}

export class Actor {
  // opts: { name, photo, emoji, pulls, bullets, extra, onResult(dead) }
  constructor(opts) {
    this.o = opts;
    this.watch = true;
    this.id = ++uid;
    this.stage = 'load';
    this.result = null;
    this.live = null;
    this.arm = ARM_DOWN; this.armTo = ARM_DOWN;
    this.trig = 0; this.cocked = false;
    this.fall = 0; this.headKick = 0;
    this.mount();
  }

  mount() {
    const o = this.o;
    const el = document.createElement('div');
    el.id = 'gun';
    el.className = 'gun watch actor';
    el.innerHTML = `
      <div class="g-vig"></div>
      <div class="g-top">
        <div class="g-who"><b>${esc(o.name)}</b> takes the gun</div>
        <div class="g-odds"><div class="g-dots">${Array.from({ length: 6 }, (_, i) => `<span class="${i < (o.bullets || 1) ? 'now' : ''}"></span>`).join('')}</div>
          <div class="g-pct">Pull #${(o.pulls || 0) + 1} · <b>${o.bullets || 1} in 6</b> chance</div></div>
        ${o.extra ? `<div class="g-extra">${o.extra}</div>` : ''}
      </div>
      <div class="a-stage"><div class="a-spot"></div><div class="a-wrap">${sceneSVG({ ...OUTFITS[(o.outfit || 0) % OUTFITS.length], photo: o.photo, emoji: o.emoji }, this.id, miniGun(this.id))}</div><div class="a-blood"></div><div class="a-ghost">👻</div></div>
      <div class="g-hint"></div>
      <div class="g-white"></div>
      <div class="g-result"></div>
      <button class="g-x" data-g="hide">✕</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.q = (s) => el.querySelector(s);
    this.armG = this.q('.a-arm'); this.headG = this.q('.a-head'); this.figG = this.q('.a-fig'); this.gunG = this.q('.a-gun');
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { e.stopPropagation(); el.classList.toggle('mini'); } });
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    this.hint('Loading the gun…');
    this.last = performance.now();
    const loop = (t) => { if (!this.el) return; this.frame(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  hint(t) { const h = this.q('.g-hint'); if (h) h.textContent = t; }

  raise() {
    if (this.stage !== 'load') return;
    this.stage = 'closed';
    this.armTo = 0;
    sfx.play('close');
    this.hint('Gun to the head…');
    this.heartT = setInterval(() => { if (this.stage === 'closed' && this.trig > 0.15) sfx.play('heart'); }, 950);
  }

  applyStream(m) {
    if (!m || this.result !== null) return;
    if ((m.st === 'closed' || m.st === 'fired') && this.stage === 'load') this.raise();
    if (this.stage === 'closed') {
      if (m.ck && !this.cocked) { this.cocked = true; sfx.play('cock'); }
      this.trig = m.tr || 0;
      if (this.trig > 0.05) this.hint('Finger on the trigger…');
      if (Math.abs(m.w || 0) > 300) this.hint('Spinning the cylinder…');
    }
    if (m.st === 'fired' && this.stage === 'closed') { this.stage = 'fired'; this.trig = 1; this.hint(''); }
  }

  setResult(dead) {
    if (this.result !== null) return;
    if (this.stage === 'fired') { this.showResult(dead); return; }
    this.autoPlay(dead);
  }

  async autoPlay(dead = null) {
    if (this.auto) return;
    this.auto = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (this.stage === 'load') { await wait(500); this.raise(); }
    await wait(1100);
    for (let k = 0; k <= 10; k++) { this.trig = k / 10; await wait(70); }
    this.stage = 'fired';
    if (dead !== null) this.showResult(dead);
  }

  showResult(dead) {
    if (this.result !== null || !this.el) return;
    this.result = dead;
    this.stage = 'result';
    clearInterval(this.heartT);
    this.hint('');
    const res = this.q('.g-result');
    const name = esc(this.o.name);
    if (dead) {
      sfx.play('bang');
      vibrate([400, 60, 200]);
      this.el.classList.add('bang');
      this.q('.a-flash').animate([{ opacity: 1, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1.4)', offset: 0.3 }, { opacity: 0, transform: 'scale(1.8)' }], { duration: 200 });
      this.q('.g-white').animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
      this.el.animate([0, 1, 2, 3, 4, 5, 6].map((i) => ({ transform: i === 6 ? 'none' : `translate(${(Math.random() - 0.5) * 30}px, ${(Math.random() - 0.5) * 30}px)` })), { duration: 380 });
      this.headKick = 1;
      this.splat();
      // the gun drops, the body goes over
      this.gunG.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: 'translate(70px, 380px) rotate(320deg)' }], { duration: 900, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' });
      const t0 = performance.now();
      const fallStep = () => { if (!this.el) return; const k = Math.min(1, (performance.now() - t0) / 900); this.fall = k * k; this.armTo = 60; if (k < 1) requestAnimationFrame(fallStep); };
      setTimeout(fallStep, 180);
      setTimeout(() => sfx.play('death'), 700);
      setTimeout(() => { if (!this.el) return; this.el.classList.add('dead'); this.q('.a-ghost').classList.add('on'); sfx.play('ghost'); }, 1300);
      setTimeout(() => {
        if (!this.el) return;
        res.innerHTML = `<div class="r-big">BANG</div><div class="r-txt">${name} is dead</div><div class="r-sub">One less liar at the table.</div>`;
        res.classList.add('on');
      }, 800);
    } else {
      sfx.play('dry');
      vibrate(25);
      this.el.classList.add('click');
      this.gunG.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(3px,-2px)' }, { transform: 'none' }], { duration: 120 });
      setTimeout(() => sfx.play('heart'), 450);
      setTimeout(() => {
        if (!this.el) return;
        sfx.play('relief');
        this.armTo = ARM_DOWN; this.trig = 0; this.slump = 1;
        this.el.classList.add('alive');
        res.innerHTML = `<div class="r-big small">*click*</div><div class="r-txt">${name} lives</div><div class="r-sub">Still ${this.o.bullets || 1} in 6 next time.</div>`;
        res.classList.add('on');
      }, 750);
    }
    if (this.o.onResult) this.o.onResult(dead);
  }

  splat() {
    const box = this.q('.a-blood');
    const r = this.q('.a-svg').getBoundingClientRect();
    const sx = r.width / 400;
    const x = r.left + 138 * sx - box.getBoundingClientRect().left, y = r.top + 181 * sx - box.getBoundingClientRect().top;
    for (let i = 0; i < 22; i++) {
      const d = document.createElement('i');
      const sz = 4 + Math.random() * 10;
      d.style.cssText = `left:${x}px;top:${y}px;width:${sz}px;height:${sz}px`;
      box.appendChild(d);
      const a = Math.PI + (Math.random() - 0.5) * 1.3;
      const dist = 60 + Math.random() * 150;
      d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist + 40 + Math.random() * 60}px) scale(.6)`, opacity: 0.85, offset: 0.6 }, { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist + 120}px) scale(.5)`, opacity: 0 }], { duration: 1200 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    }
  }

  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.arm += (this.armTo - this.arm) * Math.min(1, dt * (this.armTo < this.arm ? 4.5 : 3));
    const fear = this.stage === 'closed' || this.stage === 'fired' ? 0.6 + this.trig * 3.4 : this.stage === 'load' ? 0.4 : 0;
    const sx = (Math.random() - 0.5) * fear, sy = (Math.random() - 0.5) * fear;
    this.armG.setAttribute('transform', `rotate(${(this.arm + sx * 0.6).toFixed(2)} ${SHOULDER[0]} ${SHOULDER[1]}) translate(${sx.toFixed(2)} ${sy.toFixed(2)})`);
    const tilt = -this.trig * 7 - this.headKick * 32 + (this.slump || 0) * 9;
    if (this.headKick) this.headKick = Math.max(0.6, this.headKick - dt * 0.3);
    if (this.slump) this.slump = Math.max(0, this.slump - dt * 0.35);
    this.headG.setAttribute('transform', `rotate(${tilt.toFixed(2)} 200 252) translate(${(-this.headKick * 14).toFixed(1)} 0)`);
    this.figG.setAttribute('transform', `rotate(${(-this.fall * 28).toFixed(2)} 220 530) translate(${(this.fall * 12).toFixed(1)} ${(this.fall * 34).toFixed(1)})`);
    this.q('.a-sweat').style.opacity = this.stage === 'closed' || this.stage === 'fired' ? clamp(0.3 + this.trig, 0, 1) : 0;
    const hm = this.q('.a-gun .g-hammer');
    if (hm) hm.setAttribute('transform', `rotate(${(-34 * Math.max(this.cocked ? 1 : 0, this.trig)).toFixed(1)} 286 196)`);
    const tg = this.q('.a-gun .g-trigger');
    if (tg) tg.setAttribute('transform', `rotate(${(24 * this.trig).toFixed(1)} 377 300)`);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.heartT);
    const el = this.el;
    this.el = null;
    if (el) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).onfinish = () => el.remove(); }
  }
}
