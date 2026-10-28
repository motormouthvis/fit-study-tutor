// v5.9.12 Always on: default-on, persistence-facing logic, re-acquire, fallback. Run: node --test tests/keepawake.test.js
const test = require("node:test"), assert = require("node:assert");
const KA = require("../keepawake.js");

function fakeDoc() {
  const L = {}, kids = [];
  const mk = (tag) => { const el = { tag, attrs: {}, style: {}, children: [], listeners: {}, played: 0, paused: true,
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; },
    addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); },
    play() { if (el.denyPlay) return Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })); el.played++; el.paused = false; return Promise.resolve(); },
    pause() { el.paused = true; } }; return el; };
  const doc = { visibilityState: "visible", body: { appendChild(c) { kids.push(c); return c; } }, createElement: mk, kids,
    addEventListener(n, f) { (L[n] = L[n] || []).push(f); }, fire(n) { (L[n] || []).forEach((f) => f({})); } };
  return doc;
}
function fakeWin() { const L = {}; return { addEventListener(n, f) { (L[n] = L[n] || []).push(f); }, fire(n) { (L[n] || []).forEach((f) => f({})); }, setInterval() { return 1; }, clearInterval() {} }; }
function fakeLock(opts = {}) {
  const lock = { requests: 0, sentinels: [], fail: opts.fail,
    request() { lock.requests++; if (lock.fail) return Promise.reject(Object.assign(new Error("denied"), { name: lock.fail }));
      const s = { released: false, ls: [], release() { s.released = true; s.ls.forEach((f) => f()); }, addEventListener(n, f) { if (n === "release") s.ls.push(f); } };
      lock.sentinels.push(s); return Promise.resolve(s); } };
  return lock;
}
const tick = () => new Promise((r) => setTimeout(r, 0));
function setup(o = {}) {
  const doc = fakeDoc(), win = fakeWin(), lock = o.noLock ? undefined : fakeLock({ fail: o.fail });
  const cfg = { enabled: o.enabled !== false }; const changes = [];
  const ka = KA.create({ nav: { wakeLock: lock }, doc, win, safetyMs: 0, getEnabled: () => cfg.enabled, onChange: (s) => changes.push(s) });
  return { doc, win, lock, cfg, ka, changes };
}

test("on by default: acquires the wake lock and reports active", async () => {
  const t = setup(); await t.ka.sync();
  assert.equal(t.lock.requests, 1); const s = t.ka.state(); assert.equal(s.active, true); assert.equal(s.mode, "wakelock");
  assert.equal(KA.label(s), "Always on: On");
});
test("switch off releases it and asks for nothing more", async () => {
  const t = setup(); await t.ka.sync(); t.cfg.enabled = false; await t.ka.sync();
  assert.equal(t.lock.sentinels[0].released, true); assert.equal(t.ka.state().active, false); assert.equal(KA.label(t.ka.state()), "Always on: Off");
  t.doc.fire("visibilitychange"); t.win.fire("focus"); await tick(); assert.equal(t.lock.requests, 1);
});
test("re-acquires when the browser releases it while the page is visible", async () => {
  const t = setup(); await t.ka.sync(); t.lock.sentinels[0].release(); await tick(); await tick();
  assert.equal(t.lock.requests, 2); assert.equal(t.ka.state().active, true);
});
test("hidden then visible: re-acquires on visibilitychange, focus, pageshow, resume", async () => {
  for (const [target, ev] of [["doc", "visibilitychange"], ["win", "focus"], ["win", "pageshow"], ["doc", "resume"]]) {
    const t = setup(); await t.ka.sync(); t.doc.visibilityState = "hidden"; t.lock.sentinels[0].release(); await tick();
    assert.equal(t.lock.requests, 1, ev + ": no request while hidden");
    t.doc.visibilityState = "visible"; t[target].fire(ev); await tick(); await tick();
    assert.equal(t.lock.requests, 2, ev); assert.equal(t.ka.state().active, true, ev);
  }
});
test("a tap re-acquires when it is not active (browser needs a gesture)", async () => {
  const t = setup({ fail: "NotAllowedError" }); t.doc.createElement = ((orig) => (tag) => { const e = orig(tag); e.denyPlay = true; return e; })(t.doc.createElement);
  await t.ka.sync();
  assert.equal(t.ka.state().active, false); assert.match(t.ka.state().note, /Battery Saver|tap/i);
  t.lock.fail = null; t.doc.fire("pointerdown"); await tick(); await tick(); assert.equal(t.ka.state().active, true); assert.equal(t.ka.state().mode, "wakelock");
});
test("audio starting (kick) re-acquires", async () => {
  const t = setup(); await t.ka.sync(); t.lock.sentinels[0].release(); t.doc.visibilityState = "hidden"; await tick();
  t.doc.visibilityState = "visible"; await t.ka.kick(); assert.equal(t.ka.state().active, true);
});
test("does not loop forever if the browser keeps releasing it", async () => {
  const t = setup(); await t.ka.sync();
  for (let i = 0; i < 10; i++) { const s = t.lock.sentinels[t.lock.sentinels.length - 1]; s.release(); await tick(); await tick(); }
  assert.ok(t.lock.requests <= 5, "requests " + t.lock.requests);
});
test("no Wake Lock API: silent looping video fallback, started after a gesture", async () => {
  const t = setup({ noLock: true }); await t.ka.sync();
  assert.equal(t.ka.state().mode, "video"); const v = t.doc.kids[0];
  assert.equal(v.tag, "video"); assert.equal(v.attrs.loop, ""); assert.equal(v.muted, true); assert.equal(v.played, 1);
  assert.equal(KA.label(t.ka.state()), "Always on: On");
});
test("video fallback refused until a tap, then starts; plain-English note meanwhile", async () => {
  const t = setup({ noLock: true }); t.doc.createElement = ((orig) => (tag) => { const e = orig(tag); e.denyPlay = true; return e; })(t.doc.createElement);
  await t.ka.sync(); assert.equal(t.ka.state().active, false); assert.equal(t.ka.state().needTap, true); assert.match(KA.label(t.ka.state()), /tap/);
  t.doc.kids[0].denyPlay = false; t.doc.fire("click"); await tick(); await tick(); assert.equal(t.ka.state().mode, "video");
});
test("wake lock refused: falls back to the video, which then keeps the screen on", async () => {
  const t = setup({ fail: "NotAllowedError" }); await t.ka.sync();
  assert.equal(t.ka.state().mode, "video"); assert.equal(t.ka.state().active, true);
});
test("explain() gives plain English", () => {
  assert.match(KA.explain({ name: "NotAllowedError" }), /Battery Saver/); assert.match(KA.explain({ name: "SecurityError" }), /secure/);
});
