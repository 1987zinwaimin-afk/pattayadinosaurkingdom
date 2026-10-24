const CACHE_NAME = "pattaya-dinosaur-kingdom-fast-ticket-cache-v159";
const APP_SHELL = ["./", "./index.html", "./dinosaur-login-wallpaper.svg?v=20261024c", "./login-mode.js?v=20261024b", "./dinosaur-kingdom-hero.svg?v=20261024b", "./shared-login.css?v=20261024o", "./style.css?v=login-wallpaper-20261020a", "./app.js?v=fast-ticket-cache-c86af444", "./firebase-auth.js?v=staff-logout-presence-20261020j", "./cloud-ticket-sync.js?v=fast-ticket-cache-196e48c8", "./luxury-3d.css?v=dashboard-compact-20261024c", "./staff-accounts.js?v=presence-state-fix-20261020i", "./pwa.js?v=staff-home-launch-20261020a", "./manifest.webmanifest", "./staff-portal.html?v=staff-route-fallback-20261020a", "./staff-install.html", "./staff-app.html", "./staff-portal.js?v=shared-login-20261024a", "./staff-manifest.webmanifest", "./staff-manifest.webmanifest?v=staff-app-start-20261020a", "./file_000000006da082119bbf212e4f6fad52.png?v=20261018-logo3"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === "navigate";
  const isStaticAsset = /\\.(?:js|css|png|jpe?g|webp|svg|woff2?|webmanifest)$/i.test(url.pathname);
  // Repeat visits should render cached scripts/styles/images immediately.
  // Refresh static assets in the background instead of blocking the display.
  if (isStaticAsset && !isNavigation) {
    event.respondWith(caches.match(event.request).then(cached => {
      if (cached) {
        event.waitUntil(fetch(event.request).then(response => {
          if (response && response.ok) return caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }).catch(() => {}));
        return cached;
      }
      return fetch(event.request).then(response => {
        if (response && response.ok) event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone())));
        return response;
      });
    }));
    return;
  }
  event.respondWith(fetch(event.request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(() => caches.match(event.request).then(cached => {
    if (cached) return cached;
    // Do not substitute the Owner login page for a failed Staff-link navigation.
    const isAppHome = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
    return isNavigation && isAppHome ? caches.match("./index.html") : undefined;
  })));
});