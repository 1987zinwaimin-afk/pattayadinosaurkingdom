const CACHE_NAME = "pattaya-dinosaur-kingdom-ticket-drag-v53";
const APP_SHELL = ["./", "./index.html", "./style.css?v=ticket-reorder-20261019a", "./app.js?v=ticket-drag-drop-20261019b", "./firebase-auth.js?v=separate-staff-owner-auth-20261019a", "./cloud-ticket-sync.js?v=shared-leader-password-20261019b", "./staff-accounts.js?v=ticket-reorder-20261019a", "./pwa.js", "./manifest.webmanifest", "./file_000000006da082119bbf212e4f6fad52.png?v=20261018-logo3"];
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