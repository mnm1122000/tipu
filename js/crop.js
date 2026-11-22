// TIPU! — photo cropper. Drag to move, pinch / slider / mouse wheel to zoom, so the face sits right in the circle.
// openCrop(src, prev) resolves { photo, crop } (photo = 200×200 JPEG data URL) or null when cancelled.
const OUT = 200;
const Z_MIN = 0.5, Z_MAX = 5;

export function openCrop(src, prev = null) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => run(img);
    img.src = src;

    function run(img) {
      const el = document.createElement('div');
      el.id = 'crop';
      el.innerHTML = `
        <div class="cr-title">Fit your face in the circle</div>
        <div class="cr-stage"><img alt="" draggable="false"><div class="cr-ring"></div></div>
        <div class="cr-zoom"><span>−</span><input type="range" min="${Z_MIN}" max="${Z_MAX}" step="0.01"><span>+</span></div>
        <div class="cr-hint">Drag to move · pinch or slide to zoom</div>
        <div class="cr-btns"><button class="btn ghost" data-c="no">Cancel</button><button class="btn ghost" data-c="reset">↺ Reset</button><button class="btn primary" data-c="ok">✓ Use photo</button></div>`;
      document.body.appendChild(el);
      const stage = el.querySelector('.cr-stage');
      const pic = el.querySelector('img');
      const range = el.querySelector('input');
      pic.src = src;
      const W = img.naturalWidth, H = img.naturalHeight;

      // state is kept relative to the stage size: x/y = image centre offset as a fraction of the stage, z = zoom (1 = short side fills the circle)
      let z = prev?.z ?? 1, x = prev?.x ?? 0, y = prev?.y ?? 0;
      const S = () => stage.clientWidth;
      const clamp = () => {
        z = Math.min(Z_MAX, Math.max(Z_MIN, z));
        const sc = z / Math.min(W, H); // stage-fractions per image pixel
        const lx = Math.abs(W * sc - 1) / 2, ly = Math.abs(H * sc - 1) / 2;
        x = Math.min(lx, Math.max(-lx, x));
        y = Math.min(ly, Math.max(-ly, y));
      };
      const paint = () => {
        clamp();
        const s = S(), sc = (z * s) / Math.min(W, H);
        pic.style.width = W * sc + 'px';
        pic.style.height = H * sc + 'px';
        pic.style.transform = `translate(${s / 2 + x * s - (W * sc) / 2}px, ${s / 2 + y * s - (H * sc) / 2}px)`;
        range.value = z;
      };
      paint();

      // drag + pinch
      const pts = new Map();
      let start = null;
      const snap = () => {
        const p = [...pts.values()];
        const c = p.length > 1 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0];
        start = { c, d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0, x, y, z };
      };
      stage.addEventListener('pointerdown', (e) => {
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        snap();
      });
      stage.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = [...pts.values()], s = S();
        const c = p.length > 1 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0];
        // pinch zooms around the middle of the circle, the fingers' midpoint pans
        const k = p.length > 1 && start.d ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / start.d : 1;
        z = start.z * k;
        x = start.x * k + (c.x - start.c.x) / s;
        y = start.y * k + (c.y - start.c.y) / s;
        paint();
      });
      const up = (e) => { pts.delete(e.pointerId); if (pts.size) snap(); };
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
      stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        const k = Math.exp(-e.deltaY / 400);
        z *= k; x *= k; y *= k;
        paint();
      }, { passive: false });
      range.addEventListener('input', () => {
        const k = +range.value / z;
        z = +range.value; x *= k; y *= k;
        paint();
      });
      window.addEventListener('resize', paint);

      const done = (out) => {
        window.removeEventListener('resize', paint);
        el.classList.add('out');
        setTimeout(() => el.remove(), 200);
        resolve(out);
      };
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        if (b.dataset.c === 'no') done(null);
        if (b.dataset.c === 'reset') { z = 1; x = 0; y = 0; paint(); }
        if (b.dataset.c === 'ok') {
          clamp();
          const c = document.createElement('canvas');
          c.width = c.height = OUT;
          const g = c.getContext('2d');
          g.fillStyle = '#2a1a1c';
          g.fillRect(0, 0, OUT, OUT);
          const sc = (z * OUT) / Math.min(W, H);
          g.drawImage(img, OUT / 2 + x * OUT - (W * sc) / 2, OUT / 2 + y * OUT - (H * sc) / 2, W * sc, H * sc);
          done({ photo: c.toDataURL('image/jpeg', 0.75), crop: { z, x, y } });
        }
      });
    }
  });
}
