// TIPU! — the back room. A little shooting gallery for ghosts while the living keep lying.
// Bottles pop up on three shelves. Tap to shoot. 6 shots, then swipe down to reload.
// 🍾 = 1 point, golden bottle = 3, skull bottle = −3 (don't shoot it). 30 seconds a round.
import { sfx, vibrate } from './sfx.js?v=3';

const ROUND_MS = 30000;
const SLOTS = 5;   // per shelf
const SHELVES = 3;

export function openIdle({ best = 0, onScore = () => {}, onClose = () => {} } = {}) {
  const el = document.createElement('div');
  el.id = 'idle';
  el.innerHTML = `
    <div class="id-top"><div class="id-sc">0</div><div class="id-time"><i></i></div><div class="id-best">best ${best}</div><button class="id-x" data-i="x">✕</button></div>
    <div class="id-title">👻 THE BACK ROOM</div>
    <div class="id-room">${Array.from({ length: SHELVES }, (_, r) => `<div class="id-shelf" style="--r:${r}">${Array.from({ length: SLOTS }, (_, c) => `<div class="id-slot" data-s="${r * SLOTS + c}"></div>`).join('')}<div class="id-plank"></div></div>`).join('')}</div>
    <div class="id-ammo"></div>
    <div class="id-msg"></div>`;
  document.body.appendChild(el);
  const $ = (s) => el.querySelector(s);
  let score = 0, ammo = 6, running = false, endAt = 0, spawnT = null, tickT = null, bestNow = best;
  const live = new Map(); // slot -> { kind, until }

  const paintAmmo = () => { $('.id-ammo').innerHTML = Array.from({ length: 6 }, (_, i) => `<i class="${i < ammo ? 'on' : ''}"></i>`).join('') + (ammo ? '' : '<span>swipe ↓ to reload</span>'); };
  const msg = (html) => { const m = $('.id-msg'); m.innerHTML = html; m.classList.toggle('on', !!html); };

  function start() {
    score = 0; ammo = 6; running = true; endAt = Date.now() + ROUND_MS;
    $('.id-sc').textContent = '0';
    msg('');
    paintAmmo();
    sfx.play('cock');
    clearTimeout(spawnT); clearInterval(tickT);
    const spawn = () => {
      if (!running) return;
      const free = [...el.querySelectorAll('.id-slot')].filter((s) => !live.has(s.dataset.s));
      if (free.length) {
        const slot = free[Math.floor(Math.random() * free.length)];
        const r = Math.random();
        const kind = r < 0.12 ? 'gold' : r < 0.27 ? 'skull' : 'bottle';
        const life = 900 + Math.random() * 900 - Math.min(400, (ROUND_MS - (endAt - Date.now())) / 60);
        live.set(slot.dataset.s, { kind });
        slot.innerHTML = `<div class="id-b ${kind}">${kind === 'skull' ? '☠️' : '🍾'}</div>`;
        setTimeout(() => {
          if (live.get(slot.dataset.s)?.kind === kind && slot.firstElementChild && !slot.firstElementChild.classList.contains('hit')) {
            slot.firstElementChild.classList.add('gone');
            setTimeout(() => { if (slot.querySelector('.gone')) slot.innerHTML = ''; live.delete(slot.dataset.s); }, 220);
          }
        }, life);
      }
      spawnT = setTimeout(spawn, 260 + Math.random() * 380);
    };
    spawn();
    tickT = setInterval(() => {
      const left = Math.max(0, endAt - Date.now());
      $('.id-time i').style.transform = `scaleX(${left / ROUND_MS})`;
      if (!left) finish();
    }, 100);
  }

  function finish() {
    running = false;
    clearTimeout(spawnT); clearInterval(tickT);
    el.querySelectorAll('.id-slot').forEach((s) => { s.innerHTML = ''; });
    live.clear();
    const nb = score > bestNow;
    if (nb) bestNow = score;
    $('.id-best').textContent = 'best ' + bestNow;
    sfx.play(nb ? 'win' : 'relief');
    msg(`<b>${score}</b> bottles${nb ? '<br>🏆 new best!' : ''}<button class="btn primary" data-i="again">🔁 Again</button><button class="btn ghost" data-i="x">Back to the table</button>`);
    onScore(score);
  }

  function shoot(x, y, target) {
    if (!running) return;
    if (!ammo) { sfx.play('dry'); vibrate(20); return; }
    ammo--; paintAmmo();
    sfx.play('pop'); vibrate(25);
    el.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(3px,-4px)' }, { transform: 'none' }], { duration: 90 });
    const hole = document.createElement('i');
    hole.className = 'id-hole';
    hole.style.left = x + 'px'; hole.style.top = y + 'px';
    el.appendChild(hole);
    setTimeout(() => hole.remove(), 1800);
    const b = target && target.closest('.id-b');
    if (!b || b.classList.contains('hit') || b.classList.contains('gone')) return;
    const slot = b.parentElement;
    const kind = live.get(slot.dataset.s)?.kind;
    b.classList.add('hit');
    sfx.play('glass');
    const pts = kind === 'gold' ? 3 : kind === 'skull' ? -3 : 1;
    score = Math.max(0, score + pts);
    $('.id-sc').textContent = score;
    const pop = document.createElement('div');
    pop.className = 'id-pts ' + (pts < 0 ? 'neg' : '');
    pop.textContent = (pts > 0 ? '+' : '') + pts;
    slot.appendChild(pop);
    for (let i = 0; i < 7; i++) {
      const sh = document.createElement('i');
      sh.className = 'id-shard';
      slot.appendChild(sh);
      sh.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 120}px, ${40 + Math.random() * 80}px) rotate(${Math.random() * 600}deg)`, opacity: 0 }], { duration: 600 + Math.random() * 300, easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' });
    }
    setTimeout(() => { slot.innerHTML = ''; live.delete(slot.dataset.s); }, 650);
  }

  let sw = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-i]')) return;
    sw = { x: e.clientX, y: e.clientY, t: performance.now(), target: e.target };
  });
  el.addEventListener('pointerup', (e) => {
    if (!sw) return;
    const dy = e.clientY - sw.y;
    if (dy > 60 && Math.abs(e.clientX - sw.x) < dy) {
      if (running && ammo < 6) { ammo = 6; paintAmmo(); sfx.play('close'); sfx.play('cock', { delay: 0.18 }); vibrate([20, 60, 20]); }
    } else if (Math.hypot(e.clientX - sw.x, dy) < 20) shoot(e.clientX, e.clientY, sw.target);
    sw = null;
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.i === 'again') start();
    if (b.dataset.i === 'x') close();
  });

  function close() {
    running = false;
    clearTimeout(spawnT); clearInterval(tickT);
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
    onClose();
  }

  paintAmmo();
  msg(`Shoot the 🍾 · gold = +3 · don't hit ☠️ (−3)<br>6 shots, swipe ↓ to reload<button class="btn primary" data-i="again">🔫 Start</button>`);
  return { close };
}
