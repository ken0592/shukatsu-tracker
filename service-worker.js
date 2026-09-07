const cacheName = "shukatsu-tracker-v55";
const assets = [
  "./",
  "./index.html",
  "./styles.css",
  "./quotes.js",
  "./ai.js",
  "./company-icons.js",
  "./company-groups.js",
  "./csv-import.js",
  "./AI_SETUP.md",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
  "./assets/mascot.png",
  "./assets/mascot-cutout.png",
  "./assets/mascot-spring-open.png",
  "./assets/mascot-spring-smile.png",
  "./assets/mascot-spring-angry.png",
  "./assets/mascot-summer-open.png",
  "./assets/mascot-summer-smile.png",
  "./assets/mascot-summer-angry.png",
  "./assets/mascot-autumn-open.png",
  "./assets/mascot-autumn-smile.png",
  "./assets/mascot-autumn-angry.png",
  "./assets/mascot-winter-open.png",
  "./assets/mascot-winter-smile.png",
  "./assets/mascot-winter-angry.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("shukatsu-tracker-") && key !== cacheName).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // APIの接続状態や認証情報をオフライン用キャッシュに残さない。
  if (url.origin !== self.location.origin || /^\/api(?:\/|$)/u.test(url.pathname) || event.request.headers.has("Authorization")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && !/no-store|private/iu.test(response.headers.get("Cache-Control") || "")) {
          const copy = response.clone();
          event.waitUntil(caches.open(cacheName).then((cache) => cache.put(event.request, copy)).catch(() => {}));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
