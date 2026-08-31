const CACHE_NAME = 'rms-public-shell-v1';
const PUBLIC_SHELL = ['/offline.html', '/manifest.json', '/icons/icon-96.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') { event.respondWith(fetch(request).catch(() => caches.match('/offline.html'))); return; }
  if (/^\/app\/assets\/.+\.[a-z0-9_-]{8,}\.(?:js|css)$/i.test(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && response.type === 'basic') caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});
function safeNotificationPath(value) {
  try { const url = new URL(String(value || '/app/lobby'), self.location.origin); if (url.origin !== self.location.origin) return '/app/lobby'; return /^\/(?:app(?:\/|$)|dashboard(?:$|#)|$)/.test(`${url.pathname}${url.hash}`) ? `${url.pathname}${url.search}${url.hash}` : '/app/lobby'; } catch { return '/app/lobby'; }
}
self.addEventListener('push', event => {
  let data = {}; try { data = event.data?.json() || {}; } catch { data = { title: 'RMS notification', body: event.data?.text() || '' }; }
  const title = String(data.title || 'RMS notification').slice(0, 120);
  const options = { body: String(data.body || '').slice(0, 500), icon: '/icons/icon-192.png', badge: '/icons/icon-96.png', tag: String(data.tag || 'rms-notification').slice(0, 120), renotify: true, requireInteraction: Boolean(data.requireInteraction), vibrate: [180, 100, 180], data: { url: safeNotificationPath(data.url), orderId: data.orderId || null } };
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => clients.forEach(client => client.postMessage({ type: 'RMS_PUSH', payload: data })))]));
});
self.addEventListener('notificationclick', event => {
  event.notification.close(); const url = safeNotificationPath(event.notification.data?.url);
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => { const existing = clients.find(client => new URL(client.url).origin === self.location.origin); if (existing) { existing.navigate(url); return existing.focus(); } return self.clients.openWindow(url); }));
});
