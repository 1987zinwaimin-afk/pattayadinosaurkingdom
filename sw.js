const CACHE_NAME = "pattaya-dinosaur-kingdom-safe-sync-v57";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=ticket-order-original-20261019f",
  "./language-default.js?v=english-default-migration-v2-20261019b",
  "./app.js?v=owner-delete-order-fix-20261019a",
  "./firebase-auth.js?v=separate-staff-owner-auth-20261019a",
  "./cloud-ticket-sync.js?v=retry-quantity-after-catalog-20261019c",
  "./staff-history.js?v=staff-login-history-20261018a",
  "./staff-accounts.js?v=staff-account-usage-20261019a",
  "./pwa.js?v=settings-install-20261018d",
  "./manifest.webmanifest",
  "./staff-portal.html",
  "./staff-portal.js?v=staff-login-hide-language-fix-20261019b",
  "./staff-manifest.webmanifest",
  "./file_000000006da082119bbf212e4f6fad52.png?v=20261018-logo3"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  // Clear only old Cache Storage entries. Ticket data, daily quantities and
  // reports live in IndexedDB and are deliberately never touched here.
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
