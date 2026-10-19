const test = require("node:test"), assert = require("node:assert"), M = require("../sync-merge.js");
test("v5.2 sync merge: newest card result wins; legacy results (no u) use the last-answer time", () => {
  const a = { cards: { x: { seen: 1, got: 1, miss: 0, last: 100 }, y: { seen: 1, got: 0, miss: 1, u: 50 } } };
  const b = { cards: { x: { seen: 2, got: 1, miss: 1, u: 200 }, y: { seen: 3, got: 3, miss: 0, last: 40 } } };
  const m = M.merge(a, b); assert.equal(m.cards.x.u, 200); assert.equal(m.cards.y.u, 50);
});
test("v5.2 sync merge: order does not matter and merging again changes nothing", () => {
  const a = { cards: { x: { seen: 1, u: 5 } }, hist: { s: [{ id: "1", t: 1, n: 2 }] }, my: { cards: { m: { id: "m", f: "a", b: "b", u: 1 } } }, sessions: 3 };
  const b = { cards: { x: { seen: 2, u: 5 }, z: { seen: 1, u: 1 } }, hist: { s: [{ id: "1", t: 2, n: 4 }, { id: "2", t: 3, n: 1 }] }, my: { del: { "c:m": 2 } }, sessions: 1 };
  const ab = M.merge(a, b), ba = M.merge(b, a); assert.ok(M.same(ab, ba)); assert.ok(M.same(M.merge(ab, a), ab)); assert.ok(M.same(M.merge(ab, b), ab));
  assert.deepEqual(ab.hist.s.map(e => [e.id, e.n]), [["2", 1], ["1", 4]]); assert.equal(ab.sessions, 3); assert.deepEqual(ab.my.cards, {});
});
test("v5.2 sync merge: history keeps 20 per section; a card re-added after a delete comes back", () => {
  const h = []; for (let i = 0; i < 30; i++) h.push({ id: "s" + i, t: i, n: 1 });
  assert.equal(M.merge({ hist: { s: h } }, {}).hist.s.length, 20);
  const m = M.merge({ my: { cards: { m: { id: "m", f: "a", b: "b", u: 9 } } } }, { my: { del: { "c:m": 5 } } }); assert.ok(m.my.cards.m);
  const o = M.merge({ my: { over: { "balance-4": { f: "x", b: "y", u: 3 } } } }, { my: { del: { "o:balance-4": 4 } } }); assert.deepEqual(o.my.over, {});
});

test("v5.4 mergePass: same pass combines done cards, different pass newest wins", () => {
  const SM = require("../sync-merge.js");
  const a = { id: "p1", order: ["x", "y", "z"], done: { x: 1 }, u: 10 };
  const b = { id: "p1", order: ["x", "y", "z"], done: { y: 1 }, u: 20 };
  const m = SM.mergePass({ "sec:a:all": a }, { "sec:a:all": b })["sec:a:all"];
  require("assert").deepStrictEqual(Object.keys(m.done).sort(), ["x", "y"]); require("assert").strictEqual(m.u, 20);
  const c = { id: "p2", order: ["z"], done: {}, u: 30 };
  require("assert").strictEqual(SM.mergePass({ k: a }, { k: c }).k.id, "p2");
  require("assert").ok(SM.merge({ pass: { k: a } }, {}).pass.k);
});
