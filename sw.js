/* Offline cache. Bump VERSION whenever any file changes. */
var VERSION = "study-tutor-v1";
var FILES = ["./", "index.html", "style.css", "app.js", "engine.js", "questions.js", "lessons-data.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(e.request).then(function (r) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); return r; }).catch(function () { return caches.match("index.html"); });
  }));
});
