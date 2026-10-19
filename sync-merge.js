/* v5.2: flash card progress sync - the merge rules, shared by the app and the Cloudflare Worker (pure, no DOM).
   doc = { v: 1, cards: { <cardId>: { seen, got, miss, restudy, lastOk, last, u } },
           hist: { <sectionId>: [ { id, t, mode, n, got, miss } ] },
           my: { cards: { <id>: { id, topic, f, b, ai, ts, orig?, u } }, over: { <baseId>: { f, b, ts, u } }, del: { "c:<id>" | "o:<id>": time } },
           sessions: n }
   Rules: per card the newest change wins (u = updated time; older saves without u use the last-answer time).
   History: union by session id (same session on two devices: the one with more cards studied wins), newest first, 20 per section.
   My cards / improved cards: newest wins; a delete (or "reset to original") wins over anything older than it.
   merge(a, b) is order-independent, so devices that sync in any order end up the same. */
(function (r, f) { if (typeof module === "object" && module.exports) module.exports = f(); else r.SyncMerge = f(); })(typeof self !== "undefined" ? self : this, function () {
  var MAXH = 20;
  function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
  function ts(s) { return isObj(s) ? (+s.u || +s.last || +s.ts || 0) : 0; }
  // stable stringify (sorted keys) so two equal docs compare equal
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (isObj(v)) return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  function pick(x, y) { // newest wins; tie -> deterministic (larger stable string) so merge(a,b) == merge(b,a)
    if (!isObj(x)) return y; if (!isObj(y)) return x;
    var a = ts(x), b = ts(y); if (a !== b) return a > b ? x : y;
    var sx = stable(x), sy = stable(y); return sx >= sy ? x : y;
  }
  function mergeMap(a, b) { a = isObj(a) ? a : {}; b = isObj(b) ? b : {}; var out = {}, k;
    for (k in a) if (isObj(a[k])) out[k] = a[k];
    for (k in b) if (isObj(b[k])) out[k] = out[k] ? pick(out[k], b[k]) : b[k];
    return out; }
  function histId(e) { return typeof e.id === "string" && e.id ? e.id : "L" + (+e.t || 0) + "-" + (e.mode || "all"); }
  function hbetter(x, y) { if ((+x.n || 0) !== (+y.n || 0)) return (+x.n || 0) > (+y.n || 0) ? x : y; if ((+x.t || 0) !== (+y.t || 0)) return (+x.t || 0) > (+y.t || 0) ? x : y; return stable(x) >= stable(y) ? x : y; }
  function mergeHist(a, b) {
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {}; var out = {}, secs = {}, k;
    for (k in a) secs[k] = 1; for (k in b) secs[k] = 1;
    Object.keys(secs).forEach(function (sec) {
      var m = {};
      [a[sec], b[sec]].forEach(function (arr) { (Array.isArray(arr) ? arr : []).forEach(function (e) { if (!isObj(e)) return; var id = histId(e), c = {}; for (var q in e) c[q] = e[q]; c.id = id; m[id] = m[id] ? hbetter(m[id], c) : c; }); });
      var list = Object.keys(m).map(function (id) { return m[id]; }).sort(function (x, y) { return (+y.t || 0) - (+x.t || 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0); });
      if (list.length > MAXH) list.length = MAXH; if (list.length) out[sec] = list;
    });
    return out;
  }
  function mergeMy(a, b) {
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
    var del = {}, k; [a.del, b.del].forEach(function (d) { if (isObj(d)) for (k in d) { var t = +d[k] || 0; if (!del[k] || t > del[k]) del[k] = t; } });
    var cards = mergeMap(a.cards, b.cards), over = mergeMap(a.over, b.over);
    for (k in cards) if (del["c:" + k] && del["c:" + k] >= ts(cards[k])) delete cards[k];
    for (k in over) if (del["o:" + k] && del["o:" + k] >= ts(over[k])) delete over[k];
    return { cards: cards, over: over, del: del };
  }
  function merge(a, b) {
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
    return { v: 1, cards: mergeMap(a.cards, b.cards), hist: mergeHist(a.hist, b.hist), my: mergeMy(a.my, b.my), sessions: Math.max(+a.sessions || 0, +b.sessions || 0) };
  }
  function same(a, b) { return stable(a) === stable(b); }
  return { merge: merge, same: same, stable: stable, ts: ts, MAXH: MAXH };
});
