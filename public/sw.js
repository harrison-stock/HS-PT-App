// Service worker: makes the app installable, and receives web push.
//
// Network passthrough (no offline caching); takes control immediately.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* default network handling */ });

// ── Push ────────────────────────────────────────────────────────────
// iOS only delivers these to an app installed to the home screen, and only
// while a notification is actually shown - a push handled silently costs the
// site its permission. So every branch here ends in showNotification, including
// the one where the payload is unreadable.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { /* non-JSON payload */ }

  const title = d.title || 'HS PT';
  const options = {
    body: d.body || '',
    icon: '/web-app-manifest-192x192.png',
    badge: '/favicon-96x96.png',
    // Same tag replaces rather than stacks: five overdue check-ins should be
    // one line in the shade, not five.
    tag: d.tag || 'hs-pt',
    renotify: !!d.tag,
    data: { link: d.link || null, url: d.url || '/' },
    // A rest timer running out is the one push worth a buzz - the client is
    // mid-session with the phone face down.
    vibrate: d.vibrate === false ? undefined : [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification should land on the thing it was about. Focus an open
// window if there is one and tell the app where to go, rather than opening a
// second copy of a single-page app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        c.postMessage({ type: 'push-nav', link: data.link });
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(data.url || '/');
  })());
});
