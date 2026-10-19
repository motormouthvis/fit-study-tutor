import test from "node:test"; import assert from "node:assert";
import worker, { SYNC } from "../src/index.js";
const O = "https://motormouthvis.github.io", CODE = "abcde-fghjk-mnpqr-stuvw-xyz23-45678";
function kv() { const m = new Map(); let writes = 0; return { m, get w() { return writes; }, get: async (k, o) => { const v = m.get(k); return v == null ? null : (o && o.type === "json" ? JSON.parse(v) : v); }, put: async (k, v) => { writes++; m.set(k, v); } }; }
const r = (method, code, body, origin = O) => new Request("https://w.example/progress/" + code, { method, headers: Object.assign({ "Content-Type": "application/json" }, origin ? { Origin: origin } : {}), body: body ? JSON.stringify(body) : undefined });
test("sync: GET empty, PUT stores, GET returns it; code never stored in the key", async () => {
  const env = { SYNC_KV: kv() };
  let j = await (await worker.fetch(r("GET", CODE), env)).json(); assert.equal(j.doc, null);
  const res = await worker.fetch(r("PUT", CODE, { doc: { cards: { a: { seen: 1, got: 1, miss: 0, u: 5 } } } }), env);
  assert.equal(res.status, 200); assert.equal(res.headers.get("Access-Control-Allow-Origin"), O);
  j = await (await worker.fetch(r("GET", CODE), env)).json(); assert.equal(j.doc.cards.a.got, 1);
  assert.ok([...env.SYNC_KV.m.keys()].every(k => k.startsWith("p:") && !k.includes(CODE)));
});
test("sync: PUT merges with what is stored (newest card wins, history union) and skips unchanged writes", async () => {
  const env = { SYNC_KV: kv() }; let now = 1e12;
  const put = async (doc) => { now += 5000; const { handleSync } = await import("../src/index.js"); return (await handleSync(r("PUT", CODE, { doc }), env, O, CODE, now)).json(); };
  await put({ cards: { a: { seen: 1, got: 1, u: 10 } }, hist: { s: [{ id: "x", t: 1, n: 1 }] } });
  const j = await put({ cards: { a: { seen: 2, got: 1, miss: 1, u: 5 }, b: { seen: 1, u: 7 } }, hist: { s: [{ id: "y", t: 2, n: 3 }] } });
  assert.equal(j.doc.cards.a.u, 10); assert.ok(j.doc.cards.b); assert.deepEqual(j.doc.hist.s.map(e => e.id), ["y", "x"]);
  const w = env.SYNC_KV.w; const k = await put({ cards: { a: { seen: 1, got: 1, u: 10 } } }); assert.equal(k.unchanged, true); assert.equal(env.SYNC_KV.w, w);
});
test("sync: origin check, bad code, size cap, write throttle", async () => {
  const env = { SYNC_KV: kv() };
  assert.equal((await worker.fetch(r("GET", CODE, null, "https://evil.example"), env)).status, 403);
  assert.equal((await worker.fetch(r("GET", CODE, null, null), env)).status, 403);
  assert.equal((await worker.fetch(r("GET", "short"), env)).status, 400);
  assert.equal((await worker.fetch(r("PUT", CODE, { doc: { cards: { a: { x: "y".repeat(SYNC.maxBytes) } } } }), env)).status, 413);
  assert.equal((await worker.fetch(r("PUT", CODE, { doc: { cards: { a: { u: 1, seen: 1 } } } }), env)).status, 200);
  const t = await worker.fetch(r("PUT", CODE, { doc: { cards: { b: { u: 2, seen: 1 } } } }), env); assert.equal(t.status, 429);
  const pre = await worker.fetch(new Request("https://w/progress/" + CODE, { method: "OPTIONS", headers: { Origin: O } }), env); assert.match(pre.headers.get("Access-Control-Allow-Methods"), /PUT/);
  assert.equal((await worker.fetch(r("GET", CODE), {})).status, 503);
});
