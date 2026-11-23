// TIPU! — home screen toys: the logo cylinder you can flick (it spins by itself every few seconds too),
// title letters that jump when tapped, drifting cards that follow your finger / phone tilt, and the BETA splash.
// The home screen is re-rendered as HTML now and then, so everything here finds its elements again every frame.
import { sfx, vibrate } from './sfx.js?v=7';

const SPLASH_MS = 2200;

export function showSplash() {
  const el = document.createElement('div');
  el.id = 'splash';
  el.innerHTML = `<div class="sp-in">
    <div class="sp-logo">${cylSVG()}</div>
    <div class="sp-title">TIPU!</div>
    <div class="sp-beta">BETA</div>
    <div class="sp-by">made by <b>mnm</b></div></div>`;
  document.body.appendChild(el);
  const go = () => { if (!el.isConnected) return; el.classList.add('out'); setTimeout(() => el.remove(), 450); };
  el.addEventListener('pointerdown', go);
  setTimeout(go, SPLASH_MS);
}

export function cylSVG() {
  return `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="#1a1012" stroke="#c9a24a" stroke-width="4"/>
    ${[0, 1, 2, 3, 4, 5].map((k) => { const a = (k * 60 - 90) * Math.PI / 180; return `<circle cx="${(60 + 30 * Math.cos(a)).toFixed(2)}" cy="${(60 + 30 * Math.sin(a)).toFixed(2)}" r="12" fill="${k === 0 ? '#e8394a' : '#0a0607'}" stroke="#c9a24a" stroke-width="2.5"/>`; }).join('')}
    <circle cx="60" cy="60" r="8" fill="#c9a24a"/></svg>`;
}

// drifting background cards (HTML for rHome)
export function homeBgHTML() {
  const items = ['K', 'Q', 'A', '🃏', 'K', 'A', 'Q', '•', 'A', 'K', '•', 'Q'];
  return `<div class="home-bg" aria-hidden="true">${items.map((t, i) => {
    const r = (n) => ((Math.sin(i * 97.13 + n * 13.7) + 1) / 2);
    const bullet = t === '•';
    return `<i class="${bullet ? 'hb-bullet' : 'hb-card'}" style="left:${(4 + r(1) * 88).toFixed(1)}%;--d:${(16 + r(2) * 14).toFixed(1)}s;--dl:-${(r(3) * 30).toFixed(1)}s;--rot:${(r(4) * 80 - 40).toFixed(0)}deg;--z:${(0.5 + r(5)).toFixed(2)};--s:${(0.7 + r(6) * 0.6).toFixed(2)}">${bullet ? '' : t}</i>`;
  }).join('')}</div>`;
}

// title letters, each one jumps on tap
export function titleHTML(text = 'TIPU!') {
  return [...text].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
}

export function startHomeFx() {
  const S = { a: 0, v: 0, drag: null, user: false, settled: true, nextKick: performance.now() + 1200, chamber: 0 };
  let last = performance.now();

  const logo = () => document.querySelector('.home .logo-gun');
  const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const angleAt = (el, e) => { const [cx, cy] = centre(el); return Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI; };

  document.addEventListener('pointerdown', (e) => {
    const L = e.target.closest('.home .logo-gun');
    if (L) {
      e.preventDefault();
      S.drag = { a0: angleAt(L, e), at: S.a, t: performance.now(), x: e.clientX, y: e.clientY, moved: 0, hist: [[performance.now(), S.a]] };
      S.v = 0;
      return;
    }
    const T = e.target.closest('.home .logo-title');
    if (T) {
      T.classList.remove('jump'); void T.offsetWidth; T.classList.add('jump');
      sfx.play('pop'); vibrate(10);
    }
  });
  document.addEventListener('pointermove', (e) => {
    // parallax for the drifting cards
    document.documentElement.style.setProperty('--px', ((e.clientX / innerWidth) - 0.5).toFixed(3));
    document.documentElement.style.setProperty('--py', ((e.clientY / innerHeight) - 0.5).toFixed(3));
    if (!S.drag) return;
    const L = logo();
    if (!L) { S.drag = null; return; }
    let d = angleAt(L, e) - S.drag.a0;
    d = ((d + 540) % 360) - 180;
    S.drag.a0 += d;
    S.a += d;
    S.drag.moved += Math.abs(d);
    const now = performance.now();
    S.drag.hist.push([now, S.a]);
    while (S.drag.hist.length > 2 && now - S.drag.hist[0][0] > 90) S.drag.hist.shift();
  });
  const release = () => {
    if (!S.drag) return;
    const h = S.drag.hist;
    const [t0, a0] = h[0], [t1, a1] = h[h.length - 1];
    let v = t1 > t0 ? ((a1 - a0) / (t1 - t0)) * 1000 : 0;
    // a tap (barely moved) gives it a good random spin
    if (S.drag.moved < 6) v = (Math.random() < 0.5 ? -1 : 1) * (900 + Math.random() * 900);
    S.v = Math.max(-2600, Math.min(2600, v));
    S.user = Math.abs(S.v) > 200;
    S.settled = false;
    S.drag = null;
    if (S.user) { sfx.play('spin'); vibrate(15); }
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    document.documentElement.style.setProperty('--px', (Math.max(-30, Math.min(30, e.gamma)) / 60).toFixed(3));
    document.documentElement.style.setProperty('--py', (Math.max(-30, Math.min(30, (e.beta || 0) - 40)) / 60).toFixed(3));
  });

  function result(L) {
    const k = ((Math.round(S.a / 60) % 6) + 6) % 6;
    const home = L.closest('.home');
    const tag = home && home.querySelector('.logo-res');
    if (k === 0) {
      sfx.play('bang'); vibrate([200, 40, 80]);
      if (home) { home.classList.remove('hbang'); void home.offsetWidth; home.classList.add('hbang'); }
      if (tag) { tag.textContent = 'BANG!'; tag.className = 'logo-res on bang'; }
    } else {
      sfx.play('dry'); vibrate(20);
      if (tag) { tag.textContent = '*click*'; tag.className = 'logo-res on'; }
    }
    clearTimeout(S.tagT);
    S.tagT = setTimeout(() => { const t = document.querySelector('.home .logo-res'); if (t) t.classList.remove('on'); }, 1400);
  }

  function frame(now) {
    // fixed small steps so the spin keeps real time even when frames are slow
    const total = Math.min(1, (now - last) / 1000);
    last = now;
    const L = logo();
    for (let left = total; left > 1e-6; left -= 0.02) step(Math.min(0.02, left), now, L);
    paint(L);
    requestAnimationFrame(frame);
  }
  function step(dt, now, L) {
    if (L && !S.drag) {
      // spins by itself every few seconds when nobody is playing with it
      if (S.settled && now > S.nextKick) {
        S.v = (Math.random() < 0.5 ? -1 : 1) * (600 + Math.random() * 700);
        S.user = false; S.settled = false;
        S.nextKick = now + 2600 + Math.random() * 2200;
      }
      if (!S.settled) {
        S.v *= Math.exp(-dt * 1.5);
        S.a += S.v * dt;
        if (Math.abs(S.v) < 40) {
          // ratchet into the nearest chamber
          const target = Math.round(S.a / 60) * 60;
          S.a += (target - S.a) * Math.min(1, dt * 12);
          S.v = 0;
          if (Math.abs(target - S.a) < 0.4) {
            S.a = target; S.settled = true;
            if (S.user) { result(L); S.nextKick = now + 4000; }
          }
        }
      }
    }
  }
  function paint(L) {
    if (L) {
      const c = Math.floor(S.a / 60);
      if (c !== S.chamber) { S.chamber = c; if (S.user || S.drag) sfx.play('tick', { vol: 0.25 }); }
      const blur = Math.min(1, Math.abs(S.v) / 1500);
      L.style.transform = `rotate(${S.a.toFixed(1)}deg)`;
      L.style.filter = `drop-shadow(0 8px 20px rgba(232,57,74,.35)) blur(${(blur * 1.2).toFixed(2)}px)`;
    }
  }
  requestAnimationFrame(frame);
}
