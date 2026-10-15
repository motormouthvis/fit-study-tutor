const test = require("node:test"), assert = require("node:assert");
const F = require("../flashcards.js");

test("deck size: 250+ course cards and 40+ statement cards", () => {
  assert.ok(F.CARDS.length >= 250, "course cards " + F.CARDS.length);
  assert.ok(F.SA.length >= 40, "statement cards " + F.SA.length);
  assert.equal(F.ALL.length, F.CARDS.length + F.SA.length);
});
test("every card has a unique id, a known topic and course, and non-empty text", () => {
  const ids = new Set(), topics = new Set(F.TOPICS.map(t => t.key));
  for (const c of F.ALL) {
    assert.ok(!ids.has(c.id), "dup " + c.id); ids.add(c.id);
    assert.ok(topics.has(c.topic), c.id);
    assert.ok(["acct", "econ", "sa"].includes(c.course), c.id);
    assert.ok(c.f && c.f.length > 2 && c.b && c.b.length > 2, c.id);
  }
});
test("every topic has cards; both courses well covered", () => {
  for (const t of F.TOPICS) assert.ok(F.ALL.filter(c => c.topic === t.key).length >= 5, t.key);
  assert.ok(F.CARDS.filter(c => c.course === "acct").length >= 120);
  assert.ok(F.CARDS.filter(c => c.course === "econ").length >= 120);
});
test("syllabus weeks of BUS 5421 each have a topic", () => {
  for (const k of ["found", "sunk", "structures", "sd", "pricing", "game", "asymmetric", "incentives"]) assert.ok(F.TOPICS.find(t => t.key === k), k);
});
test("statement companies balance: assets = liabilities + equity, subtotals add up", () => {
  for (const c of F.COMPANIES) {
    assert.equal(c.ca, c.cash + c.ar + c.inv + c.oca); assert.equal(c.ta, c.ca + c.ppe);
    assert.equal(c.cl, c.ap + c.std + c.ocl); assert.equal(c.tl, c.cl + c.ltd);
    assert.equal(c.ta, c.tl + c.eq, c.name);
    assert.ok(c.eq > 0, c.name + " equity positive");
    assert.equal(c.gp, c.rev - c.cogs); assert.equal(c.ebit, c.gp - c.opex); assert.equal(c.ni, c.ebit - c.int - c.taxes);
  }
  for (const card of F.SA) {
    const bs = card.tables[0].rows, v = Object.fromEntries(bs.map(r => [r[0], r[1]]));
    assert.equal(v["Total assets"], v["Total liab. + equity"], card.id);
    assert.equal(v["Cash"] + v["Receivables"] + v["Inventory"] + v["Other current"], v["Total current assets"]);
    if (card.tables[1]) { const is = Object.fromEntries(card.tables[1].rows.map(r => [r[0], r[1]]));
      assert.equal(is["Revenue"] + is["COGS"] + is["Operating expenses"] + is["Interest"] + is["Taxes"], is["Net income"], card.id); }
  }
});
test("statement answers recompute independently from the printed tables", () => {
  for (const card of F.SA) {
    const v = Object.fromEntries(card.tables.flatMap(t => t.rows.map(r => [r[0], r[1]])));
    const exp = { current: v["Total current assets"] / v["Total current liab."], quick: (v["Cash"] + v["Receivables"]) / v["Total current liab."],
      wc: v["Total current assets"] - v["Total current liab."], de: v["Total liabilities"] / v["Equity"],
      roa: v["Net income"] / v["Total assets"] * 100, roe: v["Net income"] / v["Equity"] * 100,
      gm: v["Gross profit"] / v["Revenue"] * 100, nm: v["Net income"] / v["Revenue"] * 100, tie: v["EBIT"] / -v["Interest"] }[card.metric];
    assert.ok(Math.abs(exp - card.value) < 1e-9, card.id);
    const shown = parseFloat(card.answer.replace(/[$,k%x]/g, ""));
    const dp = card.metric === "wc" ? 0 : /%$/.test(card.answer) || card.metric === "tie" ? 1 : 2;
    assert.ok(Math.abs(shown - exp) <= 0.5 * Math.pow(10, -dp) + 1e-9, card.id + " shown " + card.answer + " exp " + exp);
    assert.ok(card.work && card.interp && card.interp.length > 20, card.id);
    // income-statement metrics must include the income statement
    if (["roa", "roe", "gm", "nm", "tie"].includes(card.metric)) assert.equal(card.tables.length, 2, card.id);
  }
});
test("interpretations match the numbers (spot checks)", () => {
  for (const c of F.SA) {
    if (c.metric === "current" && c.value < 1) assert.match(c.interp, /Below 1/);
    if (c.metric === "wc" && c.value < 0) assert.match(c.interp, /Negative/);
    if (c.metric === "tie" && c.value < 1.5) assert.match(c.interp, /Danger/);
    if (c.metric === "de" && c.value >= 2) assert.match(c.interp, /Highly leveraged/);
    if ((c.metric === "nm" || c.metric === "roa" || c.metric === "roe") && c.value < 0) assert.match(c.interp, /Negative|Losing/);
  }
});
test("statement deck mixes healthy and distressed firms across industries", () => {
  const h = new Set(F.COMPANIES.map(c => c.health)), ind = new Set(F.COMPANIES.map(c => c.industry));
  assert.ok(h.has("healthy") && h.has("distressed")); assert.ok(ind.size >= 10);
  for (const m of ["current", "quick", "wc", "de", "roa", "roe", "gm", "nm"]) assert.ok(F.SA.filter(c => c.metric === m).length >= 3, m);
});
test("hand-checked formula answers", () => {
  const find = s => F.CARDS.find(c => c.f.includes(s)).b;
  assert.match(find("A 0.10, B 0.20"), /^2\.83/); assert.ok(Math.abs(1.2*.1 + 1.4*.2 + 3.3*.1 + .6*1 + 1.5 - 2.83) < 1e-9);
  assert.match(find("10 units at $5, then 10 at $7. Sold 12. COGS under FIFO"), /\$64/);
  assert.match(find("COGS under LIFO"), /\$80/);
  assert.match(find("MC $60, demand elasticity -3"), /\$90/); assert.ok(Math.abs((90 - 60) / 90 - 1 / 3) < 1e-9);
  assert.match(find("Qd = 100 - 2P"), /P = 20, Q = 60/);
  assert.match(find("shares 40, 30, 20, 10"), /3,000/);
  assert.match(find("$100 today, get $115"), /4\.55/); assert.ok(Math.abs(115 / 1.1 - 100 - 4.545) < 0.001);
  const mid = (-20 / 90) / (2 / 11); assert.ok(Math.abs(mid + 1.22) < 0.005); assert.match(find("Price $10 -> $12"), /-1\.22/);
  assert.match(find("Net income $80k, depreciation $20k"), /\$90k/);
  assert.match(find("Price $50, variable cost $30, fixed costs $40k"), /2,000/);
});
test("filters: course, topic, statement, restudy, unseen", () => {
  const st = F.newState();
  assert.equal(F.filterCards("all", st).length, F.ALL.length);
  assert.ok(F.filterCards("course:acct", st).every(c => c.course === "acct"));
  assert.ok(F.filterCards("course:econ", st).every(c => c.course === "econ"));
  assert.equal(F.filterCards("sa", st).length, F.SA.length);
  assert.ok(F.filterCards("topic:elasticity", st).every(c => c.topic === "elasticity"));
  assert.equal(F.filterCards("restudy", st).length, 0);
  assert.equal(F.filterCards("unseen", st).length, F.ALL.length);
  let q = F.buildQueue(F.ALL.slice(0, 10), st, 1, false);
  q = F.answer(st, q, q[0], false, 1); q = F.answer(st, q, q[0], true, 2);
  assert.equal(F.filterCards("restudy", st).length, 1);
  assert.equal(F.filterCards("unseen", st).length, F.ALL.length - 2);
  F.setRestudy(st, F.ALL[0].id, false); assert.equal(F.filterCards("restudy", st).length, 0);
  F.setRestudy(st, F.ALL[5].id, true); assert.equal(F.filterCards("restudy", st)[0].id, F.ALL[5].id);
});
test("missed card returns sooner; got card leaves the session; scores tally", () => {
  const st = F.newState(), cards = F.ALL.slice(0, 8);
  let q = F.buildQueue(cards, st, 7, false);
  const first = q[0]; q = F.answer(st, q, first, false);
  assert.equal(q.indexOf(first), F.REQUEUE_GAP); assert.equal(q.length, 8);
  assert.ok(st.cards[first].restudy);
  const second = q[0]; q = F.answer(st, q, second, true);
  assert.equal(q.indexOf(second), -1); assert.equal(q.length, 7);
  assert.deepEqual(st.life, { got: 1, miss: 1 });
  // near the end, a missed card goes to the back
  let q2 = ["a", "b"]; q2 = F.answer(st, q2, "a", false); assert.deepEqual(q2, ["b", "a"]);
});
test("shuffle is a permutation and restudy cards lead the next session", () => {
  const st = F.newState(), cards = F.ALL.slice(0, 30);
  const q = F.buildQueue(cards, st, 42, true);
  assert.deepEqual([...q].sort(), cards.map(c => c.id).sort());
  assert.notDeepEqual(q, cards.map(c => c.id));
  F.setRestudy(st, cards[20].id, true);
  assert.equal(F.buildQueue(cards, st, 42, true)[0], cards[20].id);
});
test("stats", () => {
  const st = F.newState(); let q = F.buildQueue(F.ALL, st, 3);
  q = F.answer(st, q, q[0], true); q = F.answer(st, q, q[0], false);
  const s = F.stats(st);
  assert.equal(s.seen, 2); assert.equal(s.got, 1); assert.equal(s.miss, 1); assert.equal(s.restudy, 1); assert.equal(s.mastered, 1);
  assert.equal(s.total, F.ALL.length); assert.equal(s.acc, 0.5);
});

// ---- v4.9: My cards + improved overrides ----
test("setUser: custom cards join ALL (filters, stats, queue), improved cards override, reset restores", () => {
  const base = F.BASE.length, c0 = F.BASE.find(c => c.kind === "term"), st = F.newState();
  F.setUser({ cards: [{ id: "my-a", topic: "liquidity", f: "Q1", b: "A1", ai: true }, { id: "my-b", topic: "nonsense", f: "Q2", b: "A2" }, { id: "my-bad", topic: "liquidity", f: "", b: "x" }],
    over: { [c0.id]: { f: "NEW F", b: "NEW B" }, "no-such": { f: "x", b: "y" } } });
  assert.equal(F.ALL.length, base + 2);
  const a = F.ALL.find(c => c.id === "my-a"), b = F.ALL.find(c => c.id === "my-b");
  assert.equal(a.course, "acct"); assert.equal(a.custom, true); assert.equal(a.ai, true);
  assert.equal(b.topic, "mine"); assert.equal(b.course, "mine");
  const o = F.ALL.find(c => c.id === c0.id); assert.equal(o.f, "NEW F"); assert.equal(o.improved, true);
  assert.equal(F.baseCard(c0.id).f, c0.f, "original untouched");
  assert.ok(F.filterCards("all", st).some(c => c.id === "my-a"));
  assert.ok(F.filterCards("topic:liquidity", st).some(c => c.id === "my-a"));
  assert.ok(F.filterCards("course:acct", st).some(c => c.id === "my-a"));
  assert.deepEqual(F.filterCards("mine", st).map(c => c.id).sort(), ["my-a", "my-b"]);
  F.answer(st, ["my-a"], "my-a", false); F.setRestudy(st, "my-b", true);
  assert.ok(F.filterCards("restudy", st).some(c => c.id === "my-a") && F.filterCards("restudy", st).some(c => c.id === "my-b"));
  assert.equal(F.filterCards("unseen", st).some(c => c.id === "my-a"), false);
  const s = F.stats(st); assert.equal(s.total, base + 2); assert.equal(s.byCourse.mine.total, 1); assert.equal(s.restudy, 2);
  F.setUser({}); assert.equal(F.ALL.length, base); assert.equal(F.ALL.find(c => c.id === c0.id).f, c0.f);
});
test("setUser never lets an override touch a Statement Analysis card", () => {
  const sa = F.SA[0]; F.setUser({ over: { [sa.id]: { f: "x", b: "y" } } });
  assert.equal(F.ALL.find(c => c.id === sa.id).kind, "statement"); assert.ok(!F.ALL.find(c => c.id === sa.id).improved); F.setUser({});
});
