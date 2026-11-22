// TIPU! — what everyone else sees while someone takes the gun: the shooter as a character in a
// spotlight, their profile picture for a face, revolver raised to the temple. It follows the
// shooter's real phone live (loading, gun up, finger tightening on the trigger), then BANG or *click*.
import { sfx, vibrate } from './sfx.js?v=2';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ARM_DOWN = 112;     // degrees: gun resting in the lap
const SHOULDER = [262, 330];
const MUZZLE = [272, 186];
let uid = 0;

function sceneSVG(o, id) {
  const face = o.photo
    ? `<image href="${o.photo}" x="128" y="118" width="144" height="144" clip-path="url(#aFace${id})" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="200" cy="190" r="72" fill="#2a1a1a"/><text x="200" y="215" font-size="78" text-anchor="middle">${esc(o.emoji || '🙂')}</text>`;
  return `<svg class="a-svg" viewBox="0 0 400 620" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="aFace${id}"><circle cx="200" cy="190" r="72"/></clipPath>
    <radialGradient id="aShade${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <linearGradient id="aJacket${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a0d10"/><stop offset=".45" stop-color="#5a1820"/><stop offset="1" stop-color="#1c080a"/></linearGradient>
    <linearGradient id="aSteel${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f9bab"/><stop offset=".5" stop-color="#2a323d"/><stop offset="1" stop-color="#0b0e13"/></linearGradient>
    <radialGradient id="aFlash${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffe9a0"/><stop offset=".7" stop-color="#ff8a1f" stop-opacity=".8"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse class="a-shadow" cx="200" cy="588" rx="150" ry="20" fill="rgba(0,0,0,.6)"/>
  <!-- bar stool -->
  <g stroke="#3b1d10" stroke-width="10" stroke-linecap="round"><path d="M140 520 L118 590 M260 520 L282 590 M200 525 L200 592"/></g>
  <ellipse cx="200" cy="515" rx="92" ry="20" fill="#5a2c14" stroke="#2a1006" stroke-width="5"/>
  <g class="a-fig">
    <!-- legs -->
    <path d="M150 470 L140 560 M250 470 L262 560" stroke="#15161c" stroke-width="38" stroke-linecap="round"/>
    <path d="M128 572 l-30 6 M272 572 l30 6" stroke="#0a0a0c" stroke-width="16" stroke-linecap="round"/>
    <!-- body -->
    <path d="M118 492 Q108 352 158 312 L242 312 Q292 352 282 492 Q200 512 118 492 Z" fill="url(#aJacket${id})" stroke="#0e0405" stroke-width="4"/>
    <path d="M178 312 L200 372 L222 312 Z" fill="#efe6d8"/>
    <path d="M196 322 L204 322 L210 380 L200 396 L190 380 Z" fill="#8e1822"/>
    <path d="M158 312 L196 380 M242 312 L204 380" stroke="#14060a" stroke-width="3" fill="none"/>
    <rect x="184" y="250" width="32" height="66" rx="10" fill="#c89a78"/>
    <!-- left arm resting on the knee -->
    <path d="M140 330 Q104 396 126 460 Q140 478 168 474" fill="none" stroke="#3d1117" stroke-width="30" stroke-linecap="round"/>
    <circle cx="172" cy="474" r="15" fill="#c89a78"/>
    <!-- head -->
    <g class="a-head">
      <circle cx="200" cy="190" r="78" fill="#0e0405"/>
      ${face}
      <circle cx="200" cy="190" r="72" fill="url(#aShade${id})"/>
      <circle cx="200" cy="190" r="74" fill="none" stroke="rgba(231,182,74,.8)" stroke-width="4"/>
      <g class="a-sweat"><path d="M150 140 q-6 12 0 16 q6 -4 0 -16 Z" fill="#bfe7ff"/><path d="M246 126 q-5 10 0 13 q5 -3 0 -13 Z" fill="#bfe7ff"/></g>
    </g>
    <!-- gun arm -->
    <g class="a-arm">
      <path d="M262 330 Q350 300 338 236" fill="none" stroke="#4a141b" stroke-width="30" stroke-linecap="round"/>
      <g class="a-gun">
        <rect x="270" y="178" width="62" height="16" rx="3" fill="url(#aSteel${id})" stroke="#05070a" stroke-width="2"/>
        <rect x="318" y="170" width="34" height="34" rx="8" fill="url(#aSteel${id})" stroke="#05070a" stroke-width="2"/>
        <path d="M344 172 L360 156 L364 162 L352 178 Z" fill="#2a323d" stroke="#05070a" stroke-width="2" class="a-hammer"/>
        <path d="M336 202 L352 202 L360 244 L338 248 Z" fill="#5a2c14" stroke="#2a1006" stroke-width="2"/>
      </g>
      <circle cx="342" cy="222" r="17" fill="#c89a78"/>
      <g class="a-flash" opacity="0"><circle cx="${MUZZLE[0]}" cy="${MUZZLE[1]}" r="48" fill="url(#aFlash${id})"/></g>
    </g>
  </g>
</svg>`;
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
      <div class="a-stage"><div class="a-spot"></div><div class="a-wrap">${sceneSVG(o, this.id)}</div><div class="a-blood"></div><div class="a-ghost">👻</div></div>
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
    const x = r.left + 128 * sx - box.getBoundingClientRect().left, y = r.top + 188 * sx - box.getBoundingClientRect().top;
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
    this.headG.setAttribute('transform', `rotate(${tilt.toFixed(2)} 200 262) translate(${(-this.headKick * 14).toFixed(1)} 0)`);
    this.figG.setAttribute('transform', `rotate(${(-this.fall * 28).toFixed(2)} 220 530) translate(${(this.fall * 12).toFixed(1)} ${(this.fall * 34).toFixed(1)})`);
    this.q('.a-sweat').style.opacity = this.stage === 'closed' || this.stage === 'fired' ? clamp(0.3 + this.trig, 0, 1) : 0;
    const hm = this.q('.a-hammer');
    if (hm) hm.setAttribute('transform', `rotate(${this.cocked || this.trig > 0 ? -28 * Math.max(this.cocked ? 1 : 0, this.trig) : 0} 348 176)`);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.heartT);
    const el = this.el;
    this.el = null;
    if (el) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).onfinish = () => el.remove(); }
  }
}
