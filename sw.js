/* Offline cache. v2: app files are network-first (so updates arrive quickly); audio clips are cached on demand
   in a separate cache that survives version bumps. Bump VERSION whenever any app file changes. */
var VERSION = "study-tutor-v5.9.3";
var AUDIO_CACHE = "study-tutor-audio-v1";
var FILES = ["./", "index.html", "style.css", "app.js", "engine.js", "questions.js", "lessons-data.js", "statements.js", "cards-v50.js", "books-data.js", "sync-merge.js", "flashcards.js", "practice-data.js", "practice.js", "ask-config.js", "audio-manifest.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(new Request(f, { cache: "reload" })); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    var upgrade = ks.indexOf("study-tutor-v1") >= 0;
    return Promise.all(ks.filter(function (k) { return k !== VERSION && k !== AUDIO_CACHE; }).map(function (k) { return caches.delete(k); }))
      .then(function () { return self.clients.claim(); })
      .then(function () { return self.clients.matchAll({ type: "window" }); })
      .then(function (cs) {
        cs.forEach(function (c) {
          c.postMessage({ type: "sw-activated", version: VERSION });
          if (upgrade) { try { c.navigate(c.url); } catch (e) {} }   // v1 pages cannot hear the message: reload them once
        });
      });
  }));
});
function audioResponse(req) {
  var url = req.url;
  return caches.open(AUDIO_CACHE).then(function (cache) {
    return cache.match(url).then(function (hit) {
      if (hit) return hit;
      return fetch(url).then(function (net) { if (net.ok && net.status === 200) cache.put(url, net.clone()); return net; });
    });
  }).then(function (res) {
    var range = req.headers.get("range");
    if (!range || res.status !== 200) return res;
    return res.arrayBuffer().then(function (buf) {
      var m = /bytes=(\d*)-(\d*)/.exec(range), size = buf.byteLength, start = m && m[1] ? parseInt(m[1], 10) : 0, end = m && m[2] ? parseInt(m[2], 10) : size - 1;
      if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
      end = Math.min(end, size - 1);
      if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
      return new Response(buf.slice(start, end + 1), { status: 206, headers: { "Content-Type": "audio/mpeg", "Content-Length": String(end - start + 1), "Content-Range": "bytes " + start + "-" + end + "/" + size, "Accept-Ranges": "bytes" } });
    });
  });
}
function shellResponse(req) {
  var fresh = fetch(req.url, { cache: "no-cache" }).then(function (r) {
    if (r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return r;
  });
  var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("slow")); }, 4000); });
  return Promise.race([fresh, timeout]).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || fresh.catch(function () { return caches.match("index.html"); }); });
  });
}
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var u = new URL(req.url);
  if (u.origin !== location.origin) return;
  if (/\/audio\/[^/]+\.mp3$/.test(u.pathname)) { e.respondWith(audioResponse(req)); return; }
  e.respondWith(shellResponse(req));
});
