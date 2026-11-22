// TIPU! — what everyone else sees while someone takes the gun: the shooter as a flat-cartoon
// 1920s-style character under a spotlight. Their whole head is their profile picture. They wear the
// outfit they picked in the wardrobe and hold the revolver they picked. The arm follows the shooter's
// real phone live (gun comes up, finger tightens on the trigger), then BANG or *click*.
import { sfx, vibrate } from './sfx.js?v=5';
import { sideGunSVG, muzzleX, GUNS } from './gun.js?v=5';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

// body landmarks (viewBox 0 0 300 680)
const HEAD = [150, 118], HEAD_R = 62;
const SHOULDER = [200, 212];
const L1 = 80, L2 = 76;          // upper arm, forearm
const GRIP = [275, 400];         // the point on the revolver drawing the hand holds
const GUN_SCALE = 0.105;
const DOWN = { w: [214, 396], a: 100 };   // wrist position + gun angle with the gun at the hip
const TEMPLE = [HEAD[0] + HEAD_R - 2, 112];

// ---------------------------------------------------------------- wardrobe
// g: m / f · top: suit | shirt | vest | trench | overcoat | dress | pantsuit | melayu | hijabdress
export const OUTFITS = [
  { name: 'Pinstripe Boss', g: 'm', skin: '#d9a27a', top: 'suit', c1: '#45454e', c2: '#f2ede4', c3: '#b3132a', pin: 1, hat: 'fedora', hatc: '#1c1c22', band: '#b3132a', legs: '#45454e' },
  { name: 'Suspenders', g: 'm', skin: '#c88d63', top: 'shirt', c1: '#f4f0e6', c2: '#b3132a', c3: '#8e1822', hat: 'fedora', hatc: '#5e5e66', band: '#2a2a30', legs: '#7a4a28' },
  { name: 'Waistcoat', g: 'm', skin: '#e8b48c', top: 'vest', c1: '#f4f0e6', c2: '#56565e', c3: '#a3141f', hat: 'fedora', hatc: '#4a4a52', band: '#1c1c20', legs: '#56565e' },
  { name: 'Trench Coat', g: 'm', skin: '#b98258', top: 'trench', c1: '#b08a52', c2: '#f2ede4', c3: '#3a2a1c', hat: 'fedora', hatc: '#5a4030', band: '#2a1c12', legs: '#2c2a30' },
  { name: 'Brown Suit', g: 'm', skin: '#a8734d', top: 'suit', c1: '#5a3a2a', c2: '#f2ede4', c3: '#b3132a', rose: 1, hat: 'fedora', hatc: '#3a2a20', band: '#b3132a', legs: '#5a3a2a' },
  { name: 'Fur Coat Don', g: 'm', skin: '#e2ad86', top: 'overcoat', c1: '#6a6e76', c2: '#a3141f', c3: '#e6ddcc', hat: 'fedora', hatc: '#3a3a40', band: '#111', legs: '#2a2a30' },
  { name: 'Green Overcoat', g: 'm', skin: '#8c5a3a', top: 'overcoat', c1: '#2f5a4a', c2: '#f2ede4', c3: '#2f5a4a', hat: 'fedora', hatc: '#24342e', band: '#111', legs: '#1e2622' },
  { name: 'The Dandy', g: 'm', skin: '#f0c4a0', top: 'suit', c1: '#6a1a2a', c2: '#f4f0e6', c3: '#111', bow: 1, hat: 'boater', hatc: '#e0c070', band: '#111', legs: '#6a1a2a' },
  { name: 'The Driver', g: 'm', skin: '#c48a63', top: 'vest', c1: '#dfe6ee', c2: '#6a4a30', c3: '#2a3a5a', hat: 'flatcap', hatc: '#6a5a48', legs: '#5a5a62' },
  { name: 'Baju Melayu', g: 'm', skin: '#b98258', top: 'melayu', c1: '#1f2f6b', c2: '#d6a836', hat: 'songkok', hatc: '#0c0c0e', legs: '#1f2f6b' },
  { name: 'The Flapper', g: 'f', skin: '#f3caa8', top: 'dress', len: 'short', fringe: 1, c1: '#f2c230', hat: 'feather', hatc: '#111', hair: 'bob', hc: '#141010', legs: 'skin' },
  { name: 'Lady in Red', g: 'f', skin: '#e0ac88', top: 'dress', len: 'long', c1: '#b3132a', hair: 'waves', hc: '#5a1a10', legs: 'skin', jewel: 'necklace' },
  { name: 'Blue Pantsuit', g: 'f', skin: '#d8a27c', top: 'pantsuit', c1: '#2a4a8a', c2: '#f4f0e6', hat: 'fedora', hatc: '#1c2a4a', band: '#f4f0e6', hair: 'bob', hc: '#3a2214', legs: '#2a4a8a' },
  { name: 'Noir Hijab', g: 'f', skin: '#c48a63', top: 'hijabdress', c1: '#c8a040', c2: '#141416', hijab: '#141416', legs: 'skin' },
  { name: 'Emerald Diva', g: 'f', skin: '#f6d2b4', top: 'dress', len: 'long', sequin: 1, c1: '#1f8a5a', hat: 'cloche', hatc: '#16603e', hair: 'waves', hc: '#e8c25a', legs: 'skin', jewel: 'pearls' },
];

const shade = 'rgba(0,0,0,.2)';
const sleeveOf = (o) => ({ dress: o.skin, hijabdress: o.c2 }[o.top] || o.c1);
const cuffOf = (o) => ({ suit: o.c2, pantsuit: o.c2, trench: o.c2, overcoat: o.c2 }[o.top] || null);

function legs(o) {
  const skinLegs = o.legs === 'skin';
  const c = skinLegs ? o.skin : o.legs;
  if (skinLegs) {
    return `<g class="a-legs">
      <path d="M124 392 L126 646 L142 646 L148 398 Z M152 398 L158 646 L174 646 L176 392 Z" fill="${c}"/>
      <path d="M152 398 L158 646 L166 646 L176 392 Z" fill="${shade}"/>
      <path d="M120 644 l24 0 l2 9 l-28 0 Z M156 644 l24 0 l4 9 l-28 0 Z" fill="#111"/><path d="M142 652 l2 10 M180 652 l3 10" stroke="#111" stroke-width="4"/></g>`;
  }
  return `<g class="a-legs">
    <path d="M108 392 L112 646 L146 646 L148 400 Z M152 400 L154 646 L188 646 L192 392 Z" fill="${c}"/>
    <path d="M152 400 L154 646 L170 646 L192 392 Z" fill="${shade}"/>
    <path d="M130 412 L129 640 M172 412 L173 640" stroke="rgba(0,0,0,.18)" stroke-width="2"/>
    <path d="M108 642 Q104 660 132 660 L146 660 L146 642 Z M154 642 L154 660 L168 660 Q196 660 192 642 Z" fill="#0c0c0e"/></g>`;
}

function torso(o) {
  const c1 = o.c1, c2 = o.c2, c3 = o.c3;
  const M = 'M92 208 Q96 198 114 196 L186 196 Q204 198 208 208 L200 400 Q150 412 100 400 Z';
  const F = 'M104 208 Q108 198 120 196 L180 196 Q192 198 196 208 L188 300 Q182 340 186 388 Q150 398 114 388 Q118 340 112 300 Z';
  const rightShade = (bottom) => `<path d="M150 196 L186 196 Q204 198 208 208 L200 ${bottom} Q175 ${bottom + 8} 150 ${bottom + 10} Z" fill="${shade}"/>`;
  const tie = o.bow ? `<path d="M138 206 L150 212 L162 206 L162 220 L150 214 L138 220 Z" fill="${c3}"/>`
    : `<path d="M146 204 L154 204 L158 286 L150 300 L142 286 Z" fill="${c3}"/>`;
  switch (o.top) {
    case 'suit': {
      let pin = '';
      if (o.pin) for (let x = 98; x < 206; x += 9) pin += `<path d="M${x} 200 L${(x + (x - 150) * 0.03).toFixed(1)} 400" stroke="rgba(255,255,255,.13)" stroke-width="1.4"/>`;
      return `<path d="${M}" fill="${c1}"/>${pin}<path d="M134 198 L150 300 L166 198 Z" fill="${c2}"/>${tie}
        <path d="M128 198 L150 300 L140 304 L118 220 Z M172 198 L150 300 L160 304 L182 220 Z" fill="rgba(0,0,0,.25)"/>
        <circle cx="150" cy="330" r="3.5" fill="#111"/><circle cx="150" cy="360" r="3.5" fill="#111"/>
        <path d="M110 300 L134 300 M166 300 L190 300" stroke="rgba(0,0,0,.25)" stroke-width="3"/>
        ${o.rose ? '<circle cx="176" cy="232" r="7" fill="#d4142a"/><circle cx="174" cy="230" r="3" fill="#ff4a5e"/>' : ''}${rightShade(400)}`;
    }
    case 'pantsuit':
      return `<path d="${F}" fill="${c1}"/><path d="M134 198 Q150 240 166 198 L162 286 L138 286 Z" fill="${c2}"/>
        <path d="M128 198 L148 290 L138 296 L118 220 Z M172 198 L152 290 L162 296 L182 220 Z" fill="rgba(0,0,0,.25)"/><circle cx="150" cy="320" r="3.5" fill="#111"/>
        <path d="M150 196 L180 196 Q192 198 196 208 L188 300 Q182 340 186 388 Q168 394 150 396 Z" fill="${shade}"/>`;
    case 'shirt':
      return `<path d="${M}" fill="${c1}"/>${tie}<path d="M118 200 L124 400 M182 200 L176 400" stroke="${c2}" stroke-width="8"/>
        <path d="M134 198 L150 212 L166 198" stroke="rgba(0,0,0,.2)" stroke-width="3" fill="none"/><path d="M100 388 L200 388" stroke="#2a1a10" stroke-width="10"/>${rightShade(400)}`;
    case 'vest':
      return `<path d="${M}" fill="${c1}"/>${tie}
        <path d="M106 220 Q104 330 106 396 Q128 404 146 404 L146 260 L128 214 Z M194 220 Q196 330 194 396 Q172 404 154 404 L154 260 L172 214 Z" fill="${c2}"/>
        <circle cx="140" cy="290" r="3" fill="#ddd"/><circle cx="140" cy="320" r="3" fill="#ddd"/><circle cx="140" cy="350" r="3" fill="#ddd"/>
        <path d="M168 300 q10 4 18 0" stroke="#e7b64a" stroke-width="2" fill="none"/>${rightShade(400)}`;
    case 'trench':
      return `<path d="M88 208 Q94 196 114 194 L186 194 Q206 196 212 208 L214 560 Q150 574 86 560 Z" fill="${c1}"/>
        <path d="M134 196 L150 270 L166 196 Z" fill="${c2}"/>${tie}
        <path d="M114 196 L150 286 L132 300 L104 222 Z M186 196 L150 286 L168 300 L196 222 Z" fill="rgba(0,0,0,.18)"/>
        <path d="M90 370 L210 370" stroke="${c3}" stroke-width="12"/><rect x="142" y="362" width="16" height="16" rx="3" fill="none" stroke="#e7b64a" stroke-width="3"/>
        <path d="M150 286 L150 560" stroke="rgba(0,0,0,.25)" stroke-width="3"/><circle cx="138" cy="320" r="4" fill="#3a2a1c"/><circle cx="162" cy="320" r="4" fill="#3a2a1c"/>
        <path d="M150 196 L186 194 Q206 196 212 208 L214 560 Q182 568 150 570 Z" fill="${shade}"/>`;
    case 'overcoat':
      return `<path d="M88 208 Q94 196 114 194 L186 194 Q206 196 212 208 L212 540 Q150 554 88 540 Z" fill="${c1}"/>
        <path d="M134 196 L150 260 L166 196 Z" fill="${c2}"/>
        <path d="M100 200 Q150 230 200 200 L196 232 Q150 270 104 232 Z" fill="${c3}"/>
        <path d="M150 262 L150 540" stroke="rgba(0,0,0,.3)" stroke-width="3"/><circle cx="140" cy="300" r="4" fill="#111"/><circle cx="140" cy="350" r="4" fill="#111"/><circle cx="140" cy="400" r="4" fill="#111"/>
        <path d="M150 196 L186 194 Q206 196 212 208 L212 540 Q182 548 150 550 Z" fill="${shade}"/>`;
    case 'dress': {
      const hem = o.len === 'long' ? 636 : 520;
      const D = `M110 208 Q114 198 124 196 L176 196 Q186 198 190 208 L186 300 Q180 340 186 384 Q204 ${hem - 60} 212 ${hem} Q150 ${hem + 14} 88 ${hem} Q96 ${hem - 60} 114 384 Q120 340 114 300 Z`;
      let deco = '';
      if (o.fringe) for (let y = 300; y < hem; y += 26) deco += `<path d="M96 ${y} Q150 ${y + 8} 204 ${y}" stroke="rgba(0,0,0,.22)" stroke-width="2" fill="none"/>${Array.from({ length: 14 }, (_, i) => `<path d="M${98 + i * 8} ${y + 2} l0 12" stroke="rgba(120,80,0,.35)" stroke-width="2"/>`).join('')}`;
      if (o.sequin) for (let y = 210; y < hem; y += 12) for (let x = 90; x < 212; x += 12) deco += `<circle cx="${x + ((y / 12) % 2) * 6}" cy="${y}" r="1.8" fill="rgba(255,255,255,${(0.12 + ((x * y) % 9) / 30).toFixed(2)})"/>`;
      return `<clipPath id="dr${o.k}"><path d="${D}"/></clipPath><path d="${D}" fill="${c1}"/>
        <g clip-path="url(#dr${o.k})">${deco}<path d="M150 190 L230 190 L230 ${hem + 20} L150 ${hem + 20} Z" fill="${shade}"/></g>
        <path d="M128 196 Q150 230 172 196 Z" fill="${o.skin}"/>
        ${o.fringe ? '' : '<path d="M114 384 Q150 394 186 384" stroke="rgba(0,0,0,.25)" stroke-width="3" fill="none"/>'}`;
    }
    case 'hijabdress':
      return `<path d="M104 208 Q108 198 120 196 L180 196 Q192 198 196 208 L198 380 Q212 520 216 636 Q150 650 84 636 Q88 520 102 380 Z" fill="${c1}"/>
        <path d="M102 372 L198 372" stroke="${c2}" stroke-width="8"/><path d="M150 196 L180 196 Q192 198 196 208 L198 380 Q212 520 216 636 Q182 644 150 646 Z" fill="${shade}"/>`;
    case 'melayu':
      return `<path d="${M}" fill="${c1}"/><path d="M138 196 L162 196 L160 212 L140 212 Z" fill="${c1}" stroke="rgba(255,255,255,.3)" stroke-width="2"/>
        <path d="M150 212 L150 270" stroke="rgba(255,255,255,.3)" stroke-width="2"/><circle cx="150" cy="228" r="2.5" fill="${c2}"/><circle cx="150" cy="248" r="2.5" fill="${c2}"/>
        <path d="M98 352 Q150 368 202 352 L208 470 Q150 486 92 470 Z" fill="${c2}"/><path d="M98 380 Q150 396 202 380 M96 420 Q150 436 204 420" stroke="#8a5a10" stroke-width="3" fill="none"/>
        ${rightShade(352)}`;
  }
  return `<path d="${M}" fill="${c1}"/>`;
}

function jewels(o) {
  if (o.jewel === 'necklace') return `<path d="M128 200 Q150 232 172 200" stroke="#e7b64a" stroke-width="3" fill="none"/><circle cx="150" cy="224" r="5" fill="#e7b64a"/>`;
  if (o.jewel === 'pearls') return Array.from({ length: 9 }, (_, i) => { const a = Math.PI * (0.12 + 0.76 * i / 8); return `<circle cx="${(150 - 24 * Math.cos(a)).toFixed(1)}" cy="${(198 + 22 * Math.sin(a)).toFixed(1)}" r="3.6" fill="#f4f1ea" stroke="#bbb" stroke-width=".8"/>`; }).join('');
  return '';
}

// the hand that isn't holding the gun: in the pocket for suits and coats, hanging otherwise
function restArm(o) {
  const sl = sleeveOf(o);
  const pocket = ['suit', 'trench', 'overcoat', 'pantsuit'].includes(o.top);
  if (pocket) return `<path d="M104 212 Q86 260 92 318 Q96 350 114 366" fill="none" stroke="${sl}" stroke-width="22" stroke-linecap="round"/><path d="M104 214 Q90 260 96 316" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>`;
  const thin = o.top === 'dress';
  return `<path d="M102 212 Q84 270 88 330 Q90 360 94 378" fill="none" stroke="${sl}" stroke-width="${thin ? 15 : 21}" stroke-linecap="round"/>
    <path d="M88 378 Q84 392 88 404 Q92 414 100 412 Q106 410 106 400 L106 384 Q104 374 96 372 Z" fill="${o.skin}"/>
    <path d="M90 392 L104 392 M90 400 L103 400" stroke="rgba(0,0,0,.18)" stroke-width="1.6"/><path d="M106 386 q6 2 6 10" stroke="${o.skin}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
}

function hairBack(o) {
  if (o.hair === 'bob') return `<path d="M84 128 Q80 50 150 48 Q220 50 216 128 L220 178 Q186 192 150 190 Q114 192 80 178 Z" fill="${o.hc}"/>`;
  if (o.hair === 'waves') return `<path d="M84 128 Q78 46 150 46 Q222 46 216 128 Q232 190 222 232 Q204 248 186 238 Q150 250 114 238 Q96 248 78 232 Q68 190 84 128 Z" fill="${o.hc}"/>`;
  return '';
}
function hatSVG(o) {
  const c = o.hatc;
  switch (o.hat) {
    case 'fedora': return `<path d="M66 72 Q150 52 234 72 Q214 86 150 84 Q86 86 66 72 Z" fill="${c}"/><path d="M98 72 Q92 24 124 18 Q150 30 176 18 Q208 24 202 72 Q150 62 98 72 Z" fill="${c}"/>
      <path d="M98 64 Q150 54 202 64 L202 74 Q150 64 98 74 Z" fill="${o.band || '#111'}"/><path d="M124 22 Q150 40 176 22" stroke="rgba(0,0,0,.3)" stroke-width="4" fill="none"/><path d="M150 26 Q176 18 196 40 L200 70 Q176 60 150 62 Z" fill="${shade}"/>`;
    case 'boater': return `<ellipse cx="150" cy="70" rx="86" ry="13" fill="${c}"/><path d="M104 70 L106 36 Q150 28 194 36 L196 70 Q150 62 104 70 Z" fill="${c}"/><path d="M105 52 Q150 44 195 52 L196 64 Q150 56 104 64 Z" fill="${o.band}"/>
      <path d="M150 30 Q190 32 194 36 L196 70 Q172 64 150 64 Z" fill="${shade}"/>`;
    case 'flatcap': return `<path d="M90 78 Q86 30 150 28 Q214 30 214 70 Q236 76 236 86 Q190 84 150 82 Q110 84 90 78 Z" fill="${c}"/><path d="M150 30 L150 76" stroke="rgba(0,0,0,.25)" stroke-width="3"/><circle cx="150" cy="30" r="5" fill="${c}"/>`;
    case 'songkok': return `<path d="M94 80 L98 38 Q150 28 202 38 L206 80 Q150 70 94 80 Z" fill="${c}"/><path d="M98 40 Q150 30 202 40" stroke="rgba(255,255,255,.18)" stroke-width="3" fill="none"/>`;
    case 'cloche': return `<path d="M82 112 Q76 44 150 40 Q224 44 218 112 Q206 92 150 90 Q94 92 82 112 Z" fill="${c}"/><path d="M84 100 Q150 80 216 100" stroke="rgba(0,0,0,.3)" stroke-width="7" fill="none"/><circle cx="196" cy="88" r="9" fill="#e7b64a"/>`;
    case 'feather': return `<path d="M88 92 Q150 74 212 92 L212 102 Q150 84 88 102 Z" fill="${c}"/><circle cx="194" cy="88" r="6" fill="#e7b64a"/><path d="M196 86 Q232 30 214 10 Q206 40 190 84 Z" fill="#f4f0e6"/><path d="M200 80 Q218 40 214 14" stroke="#ccc" stroke-width="1.5" fill="none"/>`;
  }
  return '';
}
function hijabBack(o) {
  if (!o.hijab) return '';
  return `<path d="M78 120 Q74 44 150 40 Q226 44 222 120 Q232 196 212 238 L150 270 L88 238 Q68 196 78 120 Z" fill="${o.hijab}"/>`;
}
function hijabFront(o) {
  if (!o.hijab) return '';
  return `<circle cx="${HEAD[0]}" cy="${HEAD[1]}" r="${HEAD_R + 5}" fill="none" stroke="${o.hijab}" stroke-width="12"/><path d="M96 168 Q150 222 204 168 L210 250 Q150 282 90 250 Z" fill="${o.hijab}"/>`;
}

// the gun hand: fist round the grip, index finger on the trigger, thumb over the back
function fist(o) {
  const sk = o.skin;
  return `<rect x="-11" y="-13" width="23" height="24" rx="7" fill="${sk}"/>
    <path d="M-10 -5 L5 -5 M-10 1 L5 1 M-9 7 L5 7" stroke="rgba(0,0,0,.2)" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M6 -10 Q12 -9 13 -5" stroke="${sk}" stroke-width="4.5" stroke-linecap="round" fill="none"/>
    <path d="M-6 -12 Q-4 -19 3 -19" stroke="${sk}" stroke-width="6" stroke-linecap="round" fill="none"/>`;
}

// two-bone arm: the wrist travels from the hip to the temple, the elbow bends outwards
function armPose(t, gunKind) {
  const k = ease(clamp(t, 0, 1));
  const muzz = [(muzzleX(gunKind) - GRIP[0]) * GUN_SCALE, (178 - GRIP[1]) * GUN_SCALE];
  // pointing left (180°) with the drawing flipped so the grip stays down: muzzle sits at (-mx, +my) from the wrist
  const wUp = [TEMPLE[0] + muzz[0], TEMPLE[1] - muzz[1]];
  const w = [lerp(DOWN.w[0], wUp[0], k), lerp(DOWN.w[1], wUp[1], k)];
  const ang = lerp(DOWN.a, 180, k);
  const dx = w[0] - SHOULDER[0], dy = w[1] - SHOULDER[1];
  const d = clamp(Math.hypot(dx, dy), 1, L1 + L2 - 0.5);
  const base = Math.atan2(dy, dx);
  const alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const e = [SHOULDER[0] + L1 * Math.cos(base + alpha), SHOULDER[1] + L1 * Math.sin(base + alpha)];
  const a = ang * Math.PI / 180;
  const mx = muzz[0], my = -muzz[1];
  const m = [w[0] + mx * Math.cos(a) - my * Math.sin(a), w[1] + mx * Math.sin(a) + my * Math.cos(a)];
  return { w, e, ang, m };
}
const handTf = (w, ang) => `translate(${w[0].toFixed(1)} ${w[1].toFixed(1)}) rotate(${ang.toFixed(1)}) scale(1 -1)`;

export function lookOf(outfit) { return OUTFITS[((outfit ?? 0) % OUTFITS.length + OUTFITS.length) % OUTFITS.length]; }

// the whole character as one SVG (wardrobe previews use it too)
export function characterSVG(look, id, { pose = 'up' } = {}) {
  const o = { ...lookOf(look.outfit), k: id };
  const gunKind = GUNS[look.gun] ? look.gun : 'classic';
  const gun = sideGunSVG('_c' + id, gunKind).replace(/<svg class="g-side"[^>]*>/, '<svg x="0" y="0" width="1000" height="560" viewBox="0 0 1000 560" overflow="visible">');
  const face = look.photo
    ? `<image href="${look.photo}" x="${HEAD[0] - HEAD_R}" y="${HEAD[1] - HEAD_R}" width="${HEAD_R * 2}" height="${HEAD_R * 2}" clip-path="url(#cFace${id})" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${HEAD[0]}" cy="${HEAD[1]}" r="${HEAD_R}" fill="${o.skin}"/><text x="${HEAD[0]}" y="${HEAD[1] + 40}" font-size="116" text-anchor="middle">${esc(look.emoji || '🙂')}</text>`;
  const sl = sleeveOf(o), cuff = cuffOf(o);
  const arm = armPose(pose === 'up' ? 1 : 0, gunKind);
  const thin = o.top === 'dress';
  return `<svg class="a-svg" viewBox="0 0 300 680" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="cFace${id}"><circle cx="${HEAD[0]}" cy="${HEAD[1]}" r="${HEAD_R}"/></clipPath>
    <radialGradient id="cShade${id}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".65" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
    <radialGradient id="cFlash${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffe9a0"/><stop offset=".7" stop-color="#ff8a1f" stop-opacity=".8"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse class="a-shadow" cx="150" cy="664" rx="96" ry="12" fill="rgba(0,0,0,.55)"/>
  <g class="a-fig">
    ${legs(o)}
    <g class="a-upper">
      ${hijabBack(o)}${hairBack(o)}
      <path d="M138 172 L162 172 L164 204 Q150 210 136 204 Z" fill="${o.skin}"/><path d="M138 192 Q150 198 162 192" stroke="rgba(0,0,0,.18)" stroke-width="3" fill="none"/>
      ${torso(o)}${jewels(o)}
      ${restArm(o)}
      <g class="a-head">
        <circle cx="${HEAD[0]}" cy="${HEAD[1]}" r="${HEAD_R + 3}" fill="#120708"/>
        ${face}
        <circle cx="${HEAD[0]}" cy="${HEAD[1]}" r="${HEAD_R}" fill="url(#cShade${id})"/>
        ${hijabFront(o)}${hatSVG(o)}
        <g class="a-sweat" style="opacity:0"><path d="M96 88 q-6 12 0 16 q6 -4 0 -16 Z" fill="#bfe7ff"/><path d="M110 70 q-5 10 0 13 q5 -3 0 -13 Z" fill="#bfe7ff"/></g>
      </g>
      <g class="a-arm">
        <line class="a-up" x1="${SHOULDER[0]}" y1="${SHOULDER[1]}" x2="${arm.e[0].toFixed(1)}" y2="${arm.e[1].toFixed(1)}" stroke="${sl}" stroke-width="${thin ? 15 : 22}" stroke-linecap="round"/>
        <line class="a-fore" x1="${arm.e[0].toFixed(1)}" y1="${arm.e[1].toFixed(1)}" x2="${arm.w[0].toFixed(1)}" y2="${arm.w[1].toFixed(1)}" stroke="${sl}" stroke-width="${thin ? 13 : 19}" stroke-linecap="round"/>
        <g class="a-hand" transform="${handTf(arm.w, arm.ang)}">
          <g transform="scale(${GUN_SCALE}) translate(${-GRIP[0]} ${-GRIP[1]})"><g class="a-gun">${gun}</g></g>
          ${cuff ? `<path d="M-14 6 L-14 -10" stroke="${cuff}" stroke-width="6" stroke-linecap="round"/>` : ''}
          ${fist(o)}
        </g>
        <g class="a-flash" opacity="0" transform="translate(${arm.m[0].toFixed(1)} ${arm.m[1].toFixed(1)})"><circle cx="0" cy="0" r="40" fill="url(#cFlash${id})"/></g>
      </g>
    </g>
  </g>
</svg>`;
}

export class Actor {
  // opts: { name, photo, emoji, outfit, gun, pulls, bullets, extra, onResult(dead) }
  constructor(opts) {
    this.o = opts;
    this.watch = true;
    this.id = 'a' + Math.random().toString(36).slice(2, 8);
    this.gunKind = GUNS[opts.gun] ? opts.gun : 'classic';
    this.stage = 'load';
    this.result = null;
    this.live = null;
    this.t = 0; this.tTo = 0;
    this.trig = 0; this.cocked = false;
    this.drop = 0; this.headKick = 0; this.slump = 0;
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
      <div class="a-stage"><div class="a-spot"></div><div class="a-wrap">${characterSVG(o, this.id, { pose: 'down' })}</div><div class="a-blood"></div><div class="a-ghost">👻</div></div>
      <div class="g-hint"></div>
      <div class="g-white"></div>
      <div class="g-result"></div>
      <button class="g-x" data-g="hide">✕</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.q = (s) => el.querySelector(s);
    this.parts = { up: this.q('.a-up'), fore: this.q('.a-fore'), hand: this.q('.a-hand'), flash: this.q('.a-flash'), head: this.q('.a-head'), upper: this.q('.a-upper'), legs: this.q('.a-legs'), sweat: this.q('.a-sweat'), hammer: this.q('.a-gun .g-hammer'), trigger: this.q('.a-gun .g-trigger') };
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
    this.tTo = 1;
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
      else if (Math.abs(m.w || 0) > 300) this.hint('Spinning the cylinder…');
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
    if (this.stage === 'load') { await wait(400); this.raise(); }
    await wait(1100);
    for (let k = 0; k <= 10; k++) { this.trig = k / 10; await wait(60); }
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
      this.flashAt = performance.now();
      this.q('.g-white').animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
      this.el.animate([0, 1, 2, 3, 4, 5, 6].map((i) => ({ transform: i === 6 ? 'none' : `translate(${(Math.random() - 0.5) * 30}px, ${(Math.random() - 0.5) * 30}px)` })), { duration: 380 });
      this.headKick = 1;
      this.splat();
      this.gunFall = performance.now() + 120;
      const t0 = performance.now() + 150;
      const step = () => { if (!this.el) return; const k = clamp((performance.now() - t0) / 800, 0, 1); this.drop = k * k; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
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
      setTimeout(() => sfx.play('heart'), 450);
      setTimeout(() => {
        if (!this.el) return;
        sfx.play('relief');
        this.tTo = 0; this.trig = 0; this.slump = 1;
        this.el.classList.add('alive');
        res.innerHTML = `<div class="r-big small">*click*</div><div class="r-txt">${name} lives</div><div class="r-sub">Still ${this.o.bullets || 1} in 6 next time.</div>`;
        res.classList.add('on');
      }, 750);
    }
    if (this.o.onResult) this.o.onResult(dead);
  }

  splat() {
    const box = this.q('.a-blood');
    const svg = this.q('.a-svg');
    const r = svg.getBoundingClientRect(), b = box.getBoundingClientRect();
    const s = r.height / 680;
    const ox = r.left + (r.width - 300 * s) / 2;
    const x = ox + (HEAD[0] - HEAD_R + 6) * s - b.left, y = r.top + HEAD[1] * s - b.top;
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

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += (this.tTo - this.t) * Math.min(1, dt * (this.tTo < this.t ? 2.5 : 3.2));
    const P = this.parts;
    const arm = armPose(this.t, this.gunKind);
    const fear = this.stage === 'closed' || this.stage === 'fired' ? 0.5 + this.trig * 3 : this.stage === 'load' ? 0.3 : 0;
    const sx = (Math.random() - 0.5) * fear, sy = (Math.random() - 0.5) * fear;
    const w = [arm.w[0] + sx, arm.w[1] + sy];
    P.up.setAttribute('x2', arm.e[0].toFixed(1)); P.up.setAttribute('y2', arm.e[1].toFixed(1));
    P.fore.setAttribute('x1', arm.e[0].toFixed(1)); P.fore.setAttribute('y1', arm.e[1].toFixed(1));
    P.fore.setAttribute('x2', w[0].toFixed(1)); P.fore.setAttribute('y2', w[1].toFixed(1));
    if (this.gunFall && now > this.gunFall) {
      // the gun falls out of the hand
      const k = Math.min(1, (now - this.gunFall) / 900);
      if (!this.fallFrom) this.fallFrom = w.slice();
      P.hand.setAttribute('transform', `translate(${(this.fallFrom[0] + 40 * k).toFixed(1)} ${(this.fallFrom[1] + 430 * k * k).toFixed(1)}) rotate(${(180 + 300 * k).toFixed(1)}) scale(1 -1)`);
    } else P.hand.setAttribute('transform', handTf(w, arm.ang));
    P.flash.setAttribute('transform', `translate(${arm.m[0].toFixed(1)} ${arm.m[1].toFixed(1)})`);
    if (this.flashAt) {
      const k = (now - this.flashAt) / 200;
      P.flash.setAttribute('opacity', k < 1 ? (1 - k * 0.6).toFixed(2) : '0');
      P.flash.setAttribute('transform', `translate(${arm.m[0].toFixed(1)} ${arm.m[1].toFixed(1)}) scale(${(0.6 + Math.min(1, k) * 1.4).toFixed(2)})`);
      if (k >= 1) this.flashAt = 0;
    }
    const tilt = -this.trig * 6 - this.headKick * 30 + this.slump * 10;
    if (this.headKick) this.headKick = Math.max(0.55, this.headKick - dt * 0.3);
    if (this.slump) this.slump = Math.max(0, this.slump - dt * 0.35);
    P.head.setAttribute('transform', `rotate(${tilt.toFixed(2)} ${HEAD[0]} 182) translate(${(-this.headKick * 12).toFixed(1)} 0)`);
    // dead: the knees go (legs fold down to the floor), the body drops and keels over
    if (this.drop) {
      P.legs.setAttribute('transform', `translate(0 ${(660 * 0.45 * this.drop).toFixed(1)}) scale(1 ${(1 - 0.45 * this.drop).toFixed(3)})`);
      P.upper.setAttribute('transform', `translate(0 ${(118 * this.drop).toFixed(1)}) rotate(${(-24 * this.drop).toFixed(1)} 150 400)`);
    }
    if (P.sweat) P.sweat.style.opacity = this.stage === 'closed' || this.stage === 'fired' ? clamp(0.3 + this.trig, 0, 1) : 0;
    if (P.hammer) P.hammer.setAttribute('transform', `rotate(${(-34 * Math.max(this.cocked ? 1 : 0, this.trig)).toFixed(1)} 286 196)`);
    if (P.trigger) P.trigger.setAttribute('transform', `rotate(${(24 * this.trig).toFixed(1)} 377 300)`);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.heartT);
    const el = this.el;
    this.el = null;
    if (el) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).onfinish = () => el.remove(); }
  }
}
