// TIPU! — sound engine. Every sound (gunshot, hammer, cylinder, cards) is synthesised live
// with Web Audio, so nothing has to load and the bang lands the instant the hammer falls.

const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

class Sfx {
  constructor() {
    this.ctx = null; this.master = null; this.noise = null; this.muted = false;
    try { this.muted = localStorage.getItem('tipu_muted') === '1'; } catch (_) {}
  }

  // Call inside a tap. Everything before the first await runs inside the gesture (iOS/Android rule).
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}
    if (!this.mediaEl) {
      // a looping silent <audio> moves iPhones into the media session, so the silent switch doesn't mute us
      const a = document.createElement('audio');
      a.src = 'assets/sfx/silence.mp3'; a.loop = true; a.preload = 'auto';
      a.setAttribute('playsinline', ''); a.setAttribute('webkit-playsinline', '');
      document.body.appendChild(a);
      this.mediaEl = a;
    }
    if (this.mediaEl.paused) { const pr = this.mediaEl.play(); if (pr && pr.catch) pr.catch(() => {}); }
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      const makeup = this.ctx.createGain(); makeup.gain.value = 1.4;
      this.master.connect(comp).connect(makeup).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // small dark room: a decaying-noise impulse response, so the bang has a tail
      try {
        const rl = Math.floor(this.ctx.sampleRate * 1.6);
        const ir = this.ctx.createBuffer(2, rl, this.ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const b = ir.getChannelData(ch); for (let i = 0; i < rl; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2); }
        this.verb = this.ctx.createConvolver(); this.verb.buffer = ir;
        const vg = this.ctx.createGain(); vg.gain.value = 0.5;
        this.verb.connect(vg).connect(this.master);
      } catch (_) { this.verb = null; }
    }
    try { const b = this.ctx.createBuffer(1, 1, 22050); const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); } catch (_) {}
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('tipu_muted', m ? '1' : '0'); } catch (_) {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  // ---- building blocks ----
  // filtered noise burst
  nz(t, dur, { f = 3000, q = 1, type = 'bandpass', vol = 0.5, f2 = null, wet = 0 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.006, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.master);
    if (wet && this.verb) { const w = c.createGain(); w.gain.value = wet; g.connect(w).connect(this.verb); }
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  // oscillator note with optional glide
  tone(t, dur, { f = 440, f2 = null, type = 'sine', vol = 0.3, att = 0.005, wet = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    if (wet && this.verb) { const w = c.createGain(); w.gain.value = wet; g.connect(w).connect(this.verb); }
    o.start(t); o.stop(t + dur + 0.02);
  }

  play(name, opts = {}) {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') { this.ctx.resume().catch(() => {}); }
    const t = this.ctx.currentTime + 0.01 + (opts.delay || 0);
    const fn = SOUNDS[name];
    if (fn) try { fn(this, t, opts); } catch (_) {}
  }
}


const SOUNDS = {
  // ------------------------------------------------------------ the revolver
  // a real-feeling gunshot: supersonic crack, body blast, sub thump, room tail
  bang(s, t) {
    s.nz(t, 0.025, { f: 9000, type: 'highpass', q: 0.5, vol: 1.0 });
    s.nz(t, 0.35, { f: 7000, f2: 400, type: 'lowpass', q: 0.7, vol: 1.0, wet: 0.9 });
    s.nz(t + 0.004, 0.9, { f: 1800, f2: 120, type: 'lowpass', q: 0.4, vol: 0.55, wet: 1 });
    s.tone(t, 0.32, { f: 150, f2: 32, type: 'sine', vol: 0.95, att: 0.002 });
    s.tone(t, 0.12, { f: 75, f2: 40, type: 'triangle', vol: 0.6, att: 0.001 });
    s.nz(t + 0.06, 1.8, { f: 500, f2: 90, type: 'lowpass', q: 0.3, vol: 0.18, wet: 1 });
    // ringing ears
    s.tone(t + 0.15, 2.6, { f: 3950, type: 'sine', vol: 0.025, att: 0.3 });
  },
  // a lighter shot for the back-room gallery
  pop(s, t) {
    s.nz(t, 0.02, { f: 8000, type: 'highpass', vol: 0.7 });
    s.nz(t, 0.18, { f: 5000, f2: 500, type: 'lowpass', vol: 0.6, wet: 0.3 });
    s.tone(t, 0.12, { f: 130, f2: 45, vol: 0.5, att: 0.002 });
  },
  // a bottle shatters
  glass(s, t) {
    for (let i = 0; i < 9; i++) s.nz(t + 0.02 + Math.random() * 0.18, 0.05 + Math.random() * 0.08, { f: 4000 + Math.random() * 5000, q: 8, vol: 0.25 });
    [2637, 3520, 4186].forEach((f, i) => s.tone(t + 0.03 + i * 0.02, 0.25, { f: f * (0.95 + Math.random() * 0.1), type: 'sine', vol: 0.05 }));
  },
  // the hammer falls on an empty chamber
  dry(s, t) {
    s.nz(t, 0.012, { f: 5200, q: 6, vol: 0.9 });
    s.nz(t + 0.004, 0.05, { f: 2400, q: 4, vol: 0.45 });
    s.tone(t, 0.06, { f: 2100, f2: 1700, type: 'square', vol: 0.06 });
    s.nz(t + 0.03, 0.15, { f: 900, q: 3, vol: 0.12, wet: 0.5 });
  },
  // thumb pulls the hammer back: two-stage ratchet
  cock(s, t) {
    s.nz(t, 0.02, { f: 3800, q: 5, vol: 0.6 });
    s.nz(t + 0.12, 0.016, { f: 4600, q: 6, vol: 0.75 });
    s.tone(t + 0.12, 0.03, { f: 2600, type: 'square', vol: 0.05 });
  },
  // one chamber passing the pawl while the cylinder spins
  tick(s, t, { vol = 0.5 } = {}) {
    s.nz(t, 0.008, { f: 5200 + Math.random() * 800, q: 7, vol });
  },
  // the cylinder swings out
  open(s, t) {
    s.nz(t, 0.05, { f: 3000, q: 4, vol: 0.5 });
    s.nz(t + 0.03, 0.22, { f: 1500, f2: 4500, q: 2, vol: 0.18 });
  },
  // ...and slaps back into the frame
  close(s, t) {
    s.nz(t, 0.03, { f: 2600, q: 2.5, vol: 0.9 });
    s.tone(t, 0.07, { f: 420, f2: 180, type: 'triangle', vol: 0.35 });
    s.nz(t + 0.02, 0.2, { f: 1200, q: 3, vol: 0.12, wet: 0.6 });
  },
  // a whoosh of spin
  spin(s, t, { vol = 0.25 } = {}) { s.nz(t, 0.35, { f: 1800, f2: 5200, q: 1.2, vol }); },
  heart(s, t) {
    s.tone(t, 0.12, { f: 62, f2: 45, vol: 0.7 });
    s.tone(t + 0.2, 0.12, { f: 55, f2: 40, vol: 0.5 });
  },
  // survived: a long breath out and a warm chord
  relief(s, t) {
    s.nz(t, 0.9, { f: 1400, f2: 500, q: 0.6, vol: 0.12 });
    [392, 494, 587, 784].forEach((f, i) => s.tone(t + 0.1 + i * 0.05, 1.2, { f, type: 'triangle', vol: 0.09, att: 0.08 }));
  },
  // dead: a low drone falling away
  death(s, t) {
    s.tone(t, 2.2, { f: 98, f2: 41, type: 'sawtooth', vol: 0.12, att: 0.2 });
    s.tone(t, 2.2, { f: 103, f2: 43, type: 'sawtooth', vol: 0.1, att: 0.2 });
    s.nz(t, 2, { f: 400, f2: 80, type: 'lowpass', vol: 0.15, wet: 1 });
  },
  // ------------------------------------------------------------ the table
  shuffle(s, t) {
    const n = 40, len = 0.9;
    for (let i = 0; i < n; i++) s.nz(t + (i / n) * len + Math.random() * 0.01, 0.011, { f: 2200 + Math.random() * 2500, q: 2, vol: 0.3 + 0.2 * Math.sin((i / n) * Math.PI) });
    s.nz(t + len, 0.12, { f: 700, q: 0.8, vol: 0.5, type: 'lowpass' });
  },
  deal(s, t) {
    s.nz(t, 0.16, { f: 5000, f2: 900, q: 0.7, vol: 0.28 });
    s.nz(t + 0.16, 0.03, { f: 1800, q: 1.5, vol: 0.45 });
  },
  // cards slid face down onto the table
  play(s, t, { n = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      s.nz(t + i * 0.09, 0.14, { f: 3200, f2: 1400, q: 0.8, vol: 0.35 });
      s.nz(t + i * 0.09 + 0.12, 0.05, { f: 1500, type: 'lowpass', vol: 0.5 });
    }
  },
  // TIPU! — a brass stab and a slammed table
  liar(s, t) {
    s.tone(t, 0.18, { f: 90, f2: 45, vol: 0.8 });
    s.nz(t, 0.12, { f: 900, type: 'lowpass', vol: 0.9 });
    [233, 277, 349, 466].forEach((f) => s.tone(t + 0.02, 0.6, { f, type: 'sawtooth', vol: 0.07, att: 0.01, wet: 0.5 }));
  },
  flip(s, t) {
    s.nz(t, 0.06, { f: 4200, q: 1.2, vol: 0.35 });
    s.nz(t + 0.06, 0.03, { f: 1600, type: 'lowpass', vol: 0.4 });
  },
  drum(s, t, { len = 1.4 } = {}) {
    const n = Math.round(len * 22);
    for (let i = 0; i < n; i++) s.nz(t + i * (len / n), 0.05, { f: 380, type: 'lowpass', vol: 0.15 + 0.4 * (i / n) });
  },
  // caught lying: falling sad brass
  caught(s, t) {
    [392, 370, 349, 294].forEach((f, i) => s.tone(t + i * 0.22, i === 3 ? 0.7 : 0.22, { f, f2: i === 3 ? f * 0.94 : null, type: 'sawtooth', vol: 0.08, att: 0.02 }));
    s.tone(t, 0.25, { f: 70, f2: 40, vol: 0.6 });
  },
  // the claim was true: the caller is in trouble
  honest(s, t) {
    [523, 659, 784].forEach((f, i) => s.tone(t + i * 0.08, 0.3, { f, type: 'triangle', vol: 0.18 }));
    s.tone(t + 0.4, 0.6, { f: 110, f2: 55, type: 'sawtooth', vol: 0.12 });
  },
  devil(s, t) {
    [110, 117, 155, 165].forEach((f) => s.tone(t, 2, { f, type: 'sawtooth', vol: 0.07, att: 0.05, wet: 1 }));
    s.tone(t, 0.6, { f: 60, f2: 30, vol: 0.8 });
    s.nz(t, 1.5, { f: 300, f2: 2000, q: 2, vol: 0.12, wet: 1 });
  },
  turn(s, t) {
    s.tone(t, 0.12, { f: 659, type: 'triangle', vol: 0.3 });
    s.tone(t + 0.1, 0.25, { f: 988, type: 'triangle', vol: 0.3 });
  },
  bet(s, t) { s.tone(t, 0.08, { f: 1300, f2: 1700, vol: 0.12 }); s.nz(t, 0.03, { f: 3000, q: 2, vol: 0.2 }); },
  ghost(s, t) { s.tone(t, 1.2, { f: 600, f2: 900, type: 'sine', vol: 0.06, att: 0.3, wet: 1 }); s.tone(t + 0.1, 1.2, { f: 605, f2: 1210, type: 'sine', vol: 0.05, att: 0.4, wet: 1 }); },
  clock(s, t) { s.nz(t, 0.012, { f: 2500, q: 5, vol: 0.3 }); },
  win(s, t) {
    const seq = [392, 523, 659, 784, 659, 784, 1047];
    seq.forEach((f, i) => s.tone(t + i * 0.12, i === seq.length - 1 ? 0.9 : 0.16, { f, type: 'triangle', vol: 0.24 }));
    [523, 659, 784].forEach((f) => s.tone(t + 0.84, 1.0, { f: f * 2, type: 'sine', vol: 0.08, wet: 0.6 }));
  },
  join(s, t) { s.tone(t, 0.12, { f: 600, f2: 1000, vol: 0.25 }); },
  click(s, t) { s.nz(t, 0.02, { f: 3000, q: 2, vol: 0.22 }); },
  error(s, t) { s.tone(t, 0.15, { f: 160, type: 'square', vol: 0.1 }); },
};

export const sfx = new Sfx();

// Android vibrates; iPhone fakes a Taptic tick by toggling a hidden <input switch> (iOS 18+).
function iosTick() {
  try {
    const label = document.createElement('label');
    label.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
    const input = document.createElement('input'); input.type = 'checkbox'; input.setAttribute('switch', '');
    label.appendChild(input); document.body.appendChild(label); label.click();
    setTimeout(() => label.remove(), 50);
  } catch (_) {}
}
export function vibrate(pattern) {
  const arr = Array.isArray(pattern) ? pattern : [pattern];
  let done = false;
  try { if (typeof navigator.vibrate === 'function') done = navigator.vibrate(arr); } catch (_) {}
  if (done || !IS_IOS) return;
  let t = 0;
  arr.forEach((ms, i) => {
    if (i % 2 === 0) for (let k = 0; k < Math.max(1, Math.round(ms / 110)); k++) setTimeout(iosTick, t + k * 110);
    t += ms;
  });
}
