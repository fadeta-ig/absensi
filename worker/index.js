// Custom Service Worker for Push Notifications
// next-pwa will merge this into the main sw.js during build

function toAbsoluteUrl(path) {
    try {
        return new URL(path, self.location.origin).href;
    } catch {
        return self.location.origin + "/employee";
    }
}

self.addEventListener("push", function (event) {
    if (!event.data) return;

    let title = "WIG HRIS";
    let options;
    try {
        const data = event.data.json();
        title = data.title || title;
        options = {
            body: data.body || "",
            icon: data.icon || "/icons/android-chrome-192x192.png",
            badge: data.badge || "/icons/android-chrome-192x192.png",
            tag: data.tag || "wig-" + Date.now(),
            vibrate: [200, 100, 200],
            data: {
                url: data.url || "/employee",
            },
        };
    } catch (err) {
        // Payload bukan JSON (mis. uji via web-push CLI): tampilkan teks mentahnya
        // agar push yang masuk tidak hilang diam-diam.
        let text = "";
        try {
            text = event.data.text();
        } catch {
            text = "";
        }
        if (!text) {
            console.error("[SW] Push parse error:", err);
            return;
        }
        title = "WIG HRIS";
        options = {
            body: text,
            icon: "/icons/android-chrome-192x192.png",
            badge: "/icons/android-chrome-192x192.png",
            tag: "wig-" + Date.now(),
            vibrate: [200, 100, 200],
            data: { url: "/employee" },
        };
    }

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();

    const targetUrl = toAbsoluteUrl(event.notification.data?.url || "/employee");

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
            for (const client of clients) {
                if (client.url.startsWith(self.location.origin) && "focus" in client) {
                    return client.navigate(targetUrl).then(function (navigatedClient) {
                        return (navigatedClient || client).focus();
                    });
                }
            }
            return self.clients.openWindow(targetUrl);
        })
    );
});

// Rotasi kunci browser (Chrome periodic refresh): daftar ulang + simpan ke server
// agar endpoint lama tidak basi diam-diam.
self.addEventListener("pushsubscriptionchange", function (event) {
    event.waitUntil(
        self.registration.pushManager
            .subscribe({ userVisibleOnly: true, applicationServerKey: event.oldSubscription ? event.oldSubscription.options.applicationServerKey : undefined })
            .then(function (subscription) {
                return fetch("/api/push/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(subscription.toJSON()),
                    credentials: "same-origin",
                });
            })
            .catch(function (err) {
                console.error("[SW] Resubscribe gagal:", err);
            })
    );
});
