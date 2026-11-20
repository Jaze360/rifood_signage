const cacheName = 'signage-shell-v2';
const shell = ['/player.html', '/player.css', '/player.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('signage-shell-') && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  const player = event.request.mode === 'navigate' && /^\/scherm\/(pi-[12]|wyse-[123])\/?$/.test(url.pathname);
  if (!player && !shell.includes(url.pathname)) return;
  const path = player ? '/player.html' : url.pathname;
  event.respondWith(fetch(event.request).catch(async () =>
    (await caches.open(cacheName)).match(path)
  ));
});
