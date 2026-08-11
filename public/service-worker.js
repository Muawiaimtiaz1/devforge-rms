self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch (_) { data = { title: 'RMS notification', body: event.data?.text() || '' }; }
  const title = data.title || 'RMS notification';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag: data.tag || 'rms-notification',
    renotify: true,
    requireInteraction: Boolean(data.requireInteraction),
    vibrate: [180, 100, 180],
    data: { url: data.url || '/dashboard', orderId: data.orderId || null },
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      clients.forEach(client => client.postMessage({ type: 'RMS_PUSH', payload: data }));
    }),
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  }));
});
