/* My Family My Life — service worker
   IMPORTANT: This SW is intentionally minimal. It uses NETWORK-FIRST for
   HTML/JS/CSS so deployed builds are NEVER stale. It only caches static
   media as a stale-while-revalidate. API calls go through the network and
   fall back to cache only when offline.
*/
const CACHE_VERSION = "mfml-cache-v3";

self.addEventListener("install", (event) => {
  // Activate new SW immediately on install
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clean ALL old caches so users always pick up new deploys
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isNavigation(req) {
  return req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
}

function isCodeAsset(url) {
  const p = url.pathname;
  return p.endsWith(".js") || p.endsWith(".css") || p.endsWith(".map");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // NETWORK-FIRST for navigation requests, JS, CSS — never serve stale code
  if (isNavigation(req) || isCodeAsset(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Stale-while-revalidate for images / static media
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
