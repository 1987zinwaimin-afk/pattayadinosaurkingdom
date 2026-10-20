const CACHE_NAME = "pattaya-dinosaur-kingdom-quota-safe-sync-v94";
const APP_SHELL = ["./", "./index.html", "./style.css?v=android-ios-responsive-20261020e", "./app.js?v=remove-owner-reports-20261021j", "./firebase-auth.js?v=staff-logout-presence-20261020j", "./cloud-ticket-sync.js?v=quota-safe-sync-20261021c", "./staff-accounts.js?v=presence-state-fix-20261020i", "./pwa.js?v=staff-home-launch-20261020a", "./manifest.webmanifest", "./staff-portal.html?v=staff-route-fallback-20261020a", "./staff-install.html", "./staff-app.html", "./staff-portal.js?v=staff-route-fallback-20261020a", "./staff-manifest.webmanifest", "./staff-manifest.webmanifest?v=staff-app-start-20261020a", "./file_000000006da082119bbf212e4f6fad52.png?v=20261018-logo3"];
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
  }).catch(() => caches.match(event.request).then(cached => {
    if (cached) return cached;
    // Do not substitute the Owner login page for a failed Staff-link navigation.
    const url = new URL(event.request.url);
    const isAppHome = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
    return event.request.mode === "navigate" && isAppHome ? caches.match("./index.html") : undefined;
  })));
});