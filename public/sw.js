/* WEB_PUSH_V1 — Chocoberry dashboard service worker.
   Receives push events (even when the app is closed) and shows a notification.
   Clicking it focuses/opens the app at the relevant view. */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || "Chocoberry";
  const options = {
    body: data.body || "",
    icon: "/logo192.png",
    badge: "/logo192.png",
    tag: data.tag || undefined,
    data: { linkView: data.linkView || null, url: data.url || "/" },
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const linkView = event.notification.data && event.notification.data.linkView;
  const targetUrl = linkView ? `/?view=${encodeURIComponent(linkView)}` : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing window if open; else open a new one.
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if (linkView && "navigate" in client) client.navigate(targetUrl).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
