/* ══════════════════════════════════════════════════════════════════════════
   VIV service worker — WEB PUSH ONLY.

   Deliberately does NOT cache anything. No fetch handler, no offline shell.
   The app ships new builds constantly; a caching worker is the fastest way to
   serve a member a stale bundle. This file exists for two events only:

     push              → draw the notification
     notificationclick → focus the open tab (or open a new one) at the URL

   Payload contract (scripts/send-push.mjs sends exactly this JSON):
     { title, body, url, tag }
   Anything missing falls back to a safe default, and a payload that fails to
   parse still shows a generic notification — a push event MUST result in a
   visible notification or the browser revokes the permission.
   ══════════════════════════════════════════════════════════════════════════ */

const ICON = '/icon-192.png';
const BADGE = '/icon-192.png';
const FALLBACK_TITLE = 'VIV';
const FALLBACK_BODY = 'Something new in the Vault.';

self.addEventListener('install', () => {
  // Take over immediately so the very first enable can receive a test push.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    try {
      data = { body: event.data ? event.data.text() : '' };
    } catch (e2) {
      data = {};
    }
  }

  const title = data.title || FALLBACK_TITLE;
  const url = data.url || '/';
  const options = {
    body: data.body || FALLBACK_BODY,
    icon: ICON,
    badge: BADGE,
    // `tag` collapses repeats of the same kind (e.g. two live-trade pings) into
    // one entry instead of stacking the tray. renotify still buzzes the device.
    tag: data.tag || 'viv',
    renotify: true,
    timestamp: Date.now(),
    data: { url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const origin = self.location.origin;
      const absolute = new URL(target, origin).href;

      for (const client of list) {
        // Already have the app open somewhere → reuse that tab. navigate() can
        // reject (cross-origin / not allowed); focusing is the important half.
        if (client.url.startsWith(origin)) {
          const focused = client.focus();
          if ('navigate' in client) {
            return Promise.resolve(focused).then(() => client.navigate(absolute).catch(() => {}));
          }
          return focused;
        }
      }
      return self.clients.openWindow(absolute);
    })
  );
});
