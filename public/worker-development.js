/******/ (() => { // webpackBootstrap
// Custom Service Worker for Push Notifications
// next-pwa will merge this into the main sw.js during build

self.addEventListener("push", function (event) {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || "WIG Absensi";
    const options = {
      body: data.body || "",
      icon: data.icon || "/icons/icon-192x192.svg",
      badge: data.badge || "/icons/icon-192x192.svg",
      tag: data.tag || "default",
      vibrate: [200, 100, 200],
      data: {
        url: data.url || "/employee"
      }
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("[SW] Push parse error:", err);
  }
});
self.addEventListener("notificationclick", function (event) {
  var _event$notification$d;
  event.notification.close();
  const targetUrl = ((_event$notification$d = event.notification.data) === null || _event$notification$d === void 0 ? void 0 : _event$notification$d.url) || "/employee";
  event.waitUntil(self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  }).then(function (clients) {
    for (const client of clients) {
      if (client.url.includes(self.location.origin) && "focus" in client) {
        client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  }));
});
/******/ })()
;