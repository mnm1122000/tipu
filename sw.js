// TIPU! service worker. Code (html/js/css) is always revalidated so phones never run an old
// version; images/vendor files are cached. Bump CACHE when assets change.
const CACHE = 'tipu-assets-v5';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/(assets|vendor)\//.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
  } else {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(() => caches.match(e.request)));
  }
});
