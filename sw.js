const CACHE_NAME = "pattaya-dinosaur-kingdom-remember-staff-session-v61";
const APP_SHELL = ["./", "./index.html", "./style.css?v=backup-atomic-20261019a", "./app.js?v=thai-live-switch-20261019d", "./firebase-auth.js?v=separate-staff-owner-auth-20261019a", "./cloud-ticket-sync.js?v=live-reconnect-sync-20261020c", "./staff-accounts.js?v=staff-account-usage-20261019a", "./pwa.js?v=staff-home-launch-20261020a", "./manifest.webmanifest", "./staff-portal.html?v=staff-install-menu-only-20261019c", "./staff-install.html", "./staff-app.html", "./staff-portal.js?v=staff-account-tracking-20261019a", "./staff-manifest.webmanifest", "./staff-manifest.webmanifest?v=staff-app-start-20261020a", "./file_000000006da082119bbf212e4f6fad52.png?v=20261018-logo3"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./index.html") : undefined))));
});