// Minimal service worker for qkit. It does NOT cache anything (no offline /
// stale-asset risk) — its only jobs are to (a) control open pages so the order
// page can call registration.showNotification (the only notification form
// Android Chrome allows), and (b) focus/open the order on notification click.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Claim already-open tabs so navigator.serviceWorker.controller is set without
  // a reload — fireReadyNotification gates on that.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })(),
  );
});
