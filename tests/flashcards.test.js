const test = require("node:test"), assert = require("node:assert");
const F = require("../flashcards.js");

test("deck size: 250+ course cards and 40+ statement cards", () => {
  assert.ok(F.CARDS.length >= 250, "course cards " + F.CARDS.length);
  assert.ok(F.SA.length >= 40, "statement cards " + F.SA.length);
  assert.equal(F.ALL.length, F.CARDS.length + F.BK.length + F.SA.length);
});
test("every card has a unique id, a known topic and course, and non-empty text", () => {
  const ids = new Set(), topics = new Set(F.TOPICS.map(t => t.key));
  for (const c of F.ALL) {
    assert.ok(!ids.has(c.id), "dup " + c.id); ids.add(c.id);
    assert.ok(topics.has(c.topic) || (c.book && c.topic.indexOf("book:") === 0), c.id);
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
  const orig = JSON.parse(require("fs").readFileSync(__dirname + "/cards-v4-originals.json", "utf8"));
  const find = s => { const o = orig.find(x => x.f.includes(s)); assert.ok(o, s); return F.CARDS.find(c => c.id === o.id).b; };
  assert.match(find("A 0.10, B 0.20"), /Answer: 2\.83/); assert.ok(Math.abs(1.2*.1 + 1.4*.2 + 3.3*.1 + .6*1 + 1.5 - 2.83) < 1e-9);
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
  assert.equal(q.indexOf(first), 7); assert.equal(q.length, 8);
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

// ---- v5.0: every course card says exactly what to produce ----
test("v5.0: all 331 course cards are re-worded: task-label fronts, labeled backs, ids unchanged", () => {
  const R = require("../cards-v50.js"), TASK = /^(Define|Formula|Explain in one sentence|Explain|Calculate|Compare|List|Give an example|State|Describe|Apply|Decide|Interpret|Write the journal entry):|^[A-Za-z][^:]{2,60}: (write|state|give|say|define|explain|list)/;
  assert.equal(F.CARDS.length, 331); assert.equal(Object.keys(R).length, 331);
  for (const c of F.CARDS) {
    assert.ok(R[c.id], "no rewrite for " + c.id);
    assert.ok(TASK.test(c.f), "front does not state the task: " + c.id + " " + c.f);
    assert.ok(c.f.length > 20 && c.f.length <= 260, "front length " + c.id);
    assert.ok(/^[A-Z][A-Za-z' ]+:/.test(c.b), "back is not labeled: " + c.id + " " + c.b.slice(0, 40));
    assert.ok(c.b.length <= 900, "back too long " + c.id);
    assert.ok(!/[*#`]/.test(c.f + c.b), "markdown in " + c.id);
  }
});
test("v5.0: journal entries in the cards balance (Dr total = Cr total)", () => {
  let n = 0;
  for (const c of F.CARDS) for (const sent of c.b.split(/(?<=[a-z0-9\)])\.\s+|\n/)) {
    const items = [...sent.matchAll(/\b(Dr|Cr)\b[^/;]*?\s(\d[\d,]*(?:\.\d+)?)\s*(?=\/|$|\.|;|,|\))/g)];
    if (!items.length) continue; n++;
    const sum = t => items.filter(m => m[1] === t).reduce((a, m) => a + parseFloat(m[2].replace(/,/g, "")), 0);
    assert.ok(sum("Dr") > 0 && Math.abs(sum("Dr") - sum("Cr")) < 0.01, c.id + " unbalanced: " + sent);
  }
  assert.ok(n >= 20, "expected 20+ example entries, found " + n);
});
test("v5.0: numbers from the original cards are all still there (facts kept)", () => {
  const orig = JSON.parse(require("fs").readFileSync(__dirname + "/cards-v4-originals.json", "utf8")), nums = t => new Set((t.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => x.replace(/,/g, "")));
  for (const o of orig) { const c = F.CARDS.find(x => x.id === o.id), have = nums(c.f + " " + c.b); for (const n of nums(o.f + " " + o.b)) if (n !== "0" && n !== "1") assert.ok(have.has(n), o.id + " lost number " + n); }
});
test("v5.0: Statement Analysis prompts say what to calculate", () => {
  for (const c of F.SA) assert.ok(/^Calculate .* from the (balance sheet|income statement|statements) below, then say what it tells you/.test(c.q), c.q);
});

/* ---------- v5.1: books/chapters and sections ---------- */
test("v5.1: Chapter 1 key terms are built in: 82 cards, stable unique ids, course 5601, own section with the long title", () => {
  const ch = F.BOOKS[0].chapters[0];
  const W = F.BK.filter(c => c.book === "wt16");
  assert.equal(W.length, 82); assert.equal(F.BK.filter(c => c.topic === ch.key).length, 82);
  assert.ok(W.every(c => c.course === "acct" && /^wt16-ch01-[a-z0-9-]+$/.test(c.id) && c.f && c.b));
  assert.equal(ch.title_full, "Course 5601 - Book: Financial & Managerial Accounting, Chapter 1: Introduction to Accounting and Business");
  const sec = F.sectionById(ch.key); assert.equal(sec.title, ch.title_full);
  assert.equal(F.sectionStats(sec, F.newState()).total, 82);
});
test("v5.1: every card belongs to a section (course topics, book chapters, Statement Analysis) and nothing was dropped", () => {
  const gs = F.sectionList(), secs = [].concat(...gs.map(g => g.sections)).filter(s => s.id !== "all" && s.id !== "mine");
  for (const c of F.ALL) assert.ok(secs.some(s => s.test(c)), "no section for " + c.id);
  assert.equal(F.sectionStats(F.sectionById("all"), F.newState()).total, F.ALL.length);
  assert.equal(F.sectionStats(F.sectionById("sa"), F.newState()).total, F.SA.length);
  assert.equal(F.CARDS.length, 331); assert.equal(F.ALL.length, 331 + 82 + 84 + 68 + 48);
});
test("v5.1: section counts: right / wrong / unseen add up to total; restudy overlaps; legacy progress without lastOk still counts", () => {
  const st = F.newState(), sec = F.sectionById("topic:balance"), ids = F.ALL.filter(c => c.topic === "balance").map(c => c.id);
  let n = F.sectionStats(sec, st); assert.deepEqual([n.right, n.wrong, n.unseen, n.restudy], [0, 0, ids.length, 0]);
  let q = ids.slice(); q = F.answer(st, q, ids[0], true); q = F.answer(st, q, ids[1], false); q = F.answer(st, q, ids[2], false); q = F.answer(st, q, ids[2], true);
  n = F.sectionStats(sec, st); assert.equal(n.right, 2); assert.equal(n.wrong, 1); assert.equal(n.restudy, 2); assert.equal(n.right + n.wrong + n.unseen, n.total);
  st.cards[ids[3]] = { seen: 3, got: 1, miss: 2 }; st.cards[ids[4]] = { seen: 2, got: 2, miss: 0 };   // saved by an older version (no lastOk)
  n = F.sectionStats(sec, st); assert.equal(n.wrong, 2); assert.equal(n.right, 3);
});
test("v5.1: Study all / missed / restudy filters pick the right cards", () => {
  const st = F.newState(), ids = F.ALL.filter(c => c.topic === "balance").map(c => c.id);
  F.answer(st, ids.slice(), ids[0], true); F.answer(st, ids.slice(), ids[1], false); F.setRestudy(st, ids[0], true);
  const f = m => F.filterCards("sec:topic:balance:" + m, st).map(c => c.id);
  assert.equal(f("all").length, ids.length); assert.deepEqual(f("wrong"), [ids[1]]); assert.deepEqual(f("restudy").sort(), [ids[0], ids[1]].sort());
  assert.equal(F.filterCards("sec:book:wt16-ch01:all", st).length, 82); assert.equal(F.filterCards("sec:sa:wrong", st).length, 0);
  assert.deepEqual(F.parseSec("sec:book:wt16-ch01:wrong"), { id: "book:wt16-ch01", mode: "wrong" });
});
test("v5.1: session history keeps the latest 20 per section, newest first", () => {
  const st = F.newState(); for (let i = 0; i < 25; i++) F.addHistory(st, "sa", "all", { t: i, n: 1, got: 1, miss: 0 });
  assert.equal(st.hist.sa.length, 20); assert.equal(st.hist.sa[0].t, 24); assert.deepEqual(F.filterSection("topic:balance"), { id: "topic:balance", mode: "all" }); assert.equal(F.filterSection("restudy"), null);
});
test("v5.1: books-data.js is well formed (unique slugs, no empty text)", () => {
  const B = require("../books-data.js"); const seen = new Set();
  for (const b of B.books) { assert.ok(b.id && ["acct", "econ"].includes(b.course) && b.courseNo && b.title); for (const ch of b.chapters) { assert.ok(ch.n > 0 && ch.title);
    for (const [slug, f, bk] of ch.cards) { assert.match(slug, /^[a-z0-9-]+$/); const k = b.id + ch.n + slug; assert.ok(!seen.has(k), "dup " + k); seen.add(k); assert.ok(f.length > 5 && bk.length > 5, slug); } } }
});

test("v5.7: Froeb Chapters 1-3 and 6 cards: course 5421, page refs, long section titles", () => {
  const FR = F.BK.filter(c => c.book === "froeb");
  assert.equal(FR.length, 84); assert.equal(F.BK.length, 234);
  // every card carries a page ref, except the ones quoted word for word from the book (see the v5.9 test)
  const VERBATIM = ["froeb-ch01-what-is-a-price-floor", "froeb-ch01-what-is-a-price-ceiling",
    "froeb-ch02-does-the-government-create-wealth", "froeb-ch02-what-is-the-one-lesson-of-economics",
    "froeb-ch02-what-is-the-opposite-of-a-tax", "froeb-ch02-how-do-taxes-destroy-wealth-blocked-trades"];
  // the Ch 3 "Summary of Main Points" cards are quoted word for word from a page we do not know, so they carry no page ref either
  const noPage = c => VERBATIM.includes(c.id) || /^froeb-ch03-ch3-summary-\d+$/.test(c.id);
  assert.ok(FR.every(c => c.course === "econ" && /^froeb-ch0[1-36]-[a-z0-9-]+$/.test(c.id) && (noPage(c) || / \((p\. \d+|page not given)\)$/.test(c.b))));
  const b = F.BOOKS.find(x => x.id === "froeb");
  assert.deepEqual(b.chapters.map(ch => FR.filter(c => c.topic === ch.key).length), [23, 25, 33, 3]);
  assert.equal(b.chapters[1].title_full, "Course 5421 - Book: Managerial Economics (Froeb, 5th ed.), Chapter 2: The One Lesson of Business");
});

test("v5.7.2: missed card is requeued to the end, after every remaining card", () => {
  const st = F.newState(), ids = ["a", "b", "c", "d", "e"];
  let q = F.answer(st, ids, "a", false);
  assert.deepEqual(q, ["b", "c", "d", "e", "a"]);
  q = F.answer(st, q, "b", false); assert.deepEqual(q, ["c", "d", "e", "a", "b"]);
  q = F.answer(st, q, "c", true); assert.deepEqual(q, ["d", "e", "a", "b"]);
  assert.deepEqual(F.answer(st, ["z"], "z", false), ["z"]);
  assert.equal(st.life.miss, 3); assert.equal(st.life.got, 1); assert.equal(st.cards.a.miss, 1);
});

test("v5.7.3: Scott Chapters 1-3 cards: 66 cards, course 5601, page refs, no Q: prefix", () => {
  const S = F.BK.filter(c => c.book === "scott");
  assert.equal(S.length, 68);
  assert.ok(S.every(c => c.course === "acct" && /^scott-ch0[1-3]-[a-z0-9-]+$/.test(c.id) && / \((p\. \d+|page not given)\)$/.test(c.b) && !/^Q:/.test(c.f)));
  const b = F.BOOKS.find(x => x.id === "scott");
  assert.deepEqual(b.chapters.map(ch => S.filter(c => c.topic === ch.key).length), [30, 23, 15]);
  assert.equal(b.chapters[2].title_full, "Course 5601 - Book: College Accounting: A Career Approach (Scott, 13th ed.), Chapter 3: The General Journal and the General Ledger");
});

/* ---------- v5.9: Froeb Ch 3 wealth/government card, and the Important star ---------- */
test("v5.9: Froeb Ch 2 has the 'Does the Government Create Wealth?' card, word for word from the textbook", () => {
  const c = F.ALL.find(x => x.id === "froeb-ch02-does-the-government-create-wealth");
  assert.ok(c, "card missing"); assert.equal(c.course, "econ"); assert.equal(c.topic, "book:froeb-ch02");
  assert.equal(c.f, "Does the Government Create Wealth?");
  assert.equal(c.b, "Governments play a critical role in the wealth-creating process by enforcing property rights and contracts\u2014legal mechanisms that facilitate voluntary transactions. By making sure that buyers and sellers can keep the gains from trade, our legal system makes trade more likely, which contributes to America's enormous wealth-creating ability.");
  assert.equal(F.BOOKS.find(x => x.id === "froeb").chapters.filter(ch => ch.n === 3).length, 1);   // no new chapter was created
});

test("v5.9: Froeb Ch 1 has the price floor and price ceiling cards, word for word, and only one of each", () => {
  const want = {
    "froeb-ch01-what-is-a-price-floor": ["What is a price floor?",
      "A government-set minimum price below which a good or service cannot legally be sold. It is binding when set above the market equilibrium price, causing a surplus \u2014 quantity supplied exceeds quantity demanded."],
    "froeb-ch01-what-is-a-price-ceiling": ["What is a price ceiling?",
      "A government-set maximum price above which a good or service cannot legally be sold. It is binding when set below the market equilibrium price, causing a shortage \u2014 quantity demanded exceeds quantity supplied."]
  };
  for (const id of Object.keys(want)) {
    const c = F.ALL.find(x => x.id === id);
    assert.ok(c, id + " missing"); assert.equal(c.course, "econ"); assert.equal(c.topic, "book:froeb-ch01");
    assert.equal(c.f, want[id][0]); assert.equal(c.b, want[id][1]);
  }
  assert.equal(F.ALL.filter(c => /^What is a price (floor|ceiling)\?$/.test(c.f)).length, 2);   // defined once each, nowhere duplicated
  assert.equal(F.ALL.filter(c => c.topic === "book:froeb-ch02" && /price (floor|ceiling)/i.test(c.f)).length, 1);   // Ch 2 keeps only its rent-cap / minimum-wage card
});

test("v5.9: the other three Froeb Ch 2 cards are word for word from the textbook too", () => {
  const want = {
    "froeb-ch02-what-is-the-one-lesson-of-economics": ["What is the one lesson of economics?",
      "The art of economics consists in looking not merely at the immediate but at the longer effects of any act or policy; it consists of tracing the consequences of that policy not merely for one group but for all groups."],
    "froeb-ch02-what-is-the-opposite-of-a-tax": ["What is the opposite of a tax, and what does it do to wealth?",
      "A subsidy. By encouraging low-value consumers to buy or high-value sellers to sell, subsidies destroy wealth by moving assets from higher- to lower-valued uses\u2014in exactly the wrong direction."],
    "froeb-ch02-how-do-taxes-destroy-wealth-blocked-trades": ["How do taxes destroy wealth?",
      "A tax raises the cost of something, so fewer people buy and some trades that should have happened don't \u2014 it blocks good trades that would have created wealth."]
  };
  for (const id of Object.keys(want)) {
    const c = F.ALL.find(x => x.id === id);
    assert.ok(c, id + " missing"); assert.equal(c.course, "econ"); assert.equal(c.topic, "book:froeb-ch02");
    assert.equal(c.f, want[id][0]); assert.equal(c.b, want[id][1]);
  }
});

test("v5.9: Important is a separate star: set, clear, count per section and lifetime, and it never changes on a miss", () => {
  const st = F.newState(), ids = F.ALL.filter(c => c.topic === "balance").map(c => c.id), sec = F.sectionById("topic:balance");
  assert.equal(F.sectionStats(sec, st).important, 0);
  F.setImportant(st, ids[0], true); F.setImportant(st, ids[1], true);
  assert.ok(F.isImportant(st, ids[0])); assert.equal(F.sectionStats(sec, st).important, 2);
  assert.equal(F.stats(st).important, 2);
  F.setImportant(st, ids[1], false);
  assert.ok(!F.isImportant(st, ids[1])); assert.equal(F.sectionStats(sec, st).important, 1);
  F.answer(st, ids.slice(), ids[2], false);                       // a miss sets Restudy, never Important
  assert.ok(st.cards[ids[2]].restudy); assert.ok(!F.isImportant(st, ids[2]));
  const n = F.sectionStats(sec, st); assert.equal(n.right + n.wrong + n.unseen, n.total);   // Important overlaps, it is not a status
});

test("v5.9: Study important picks only the starred cards, in a section and across all sections", () => {
  const st = F.newState(), bal = F.ALL.filter(c => c.topic === "balance").map(c => c.id), sa = F.SA[0].id;
  F.setImportant(st, bal[0], true); F.setImportant(st, sa, true);
  assert.deepEqual(F.parseSec("sec:topic:balance:important"), { id: "topic:balance", mode: "important" });
  assert.deepEqual(F.filterCards("sec:topic:balance:important", st).map(c => c.id), [bal[0]]);
  assert.deepEqual(F.filterCards("sec:all:important", st).map(c => c.id).sort(), [bal[0], sa].sort());
  assert.deepEqual(F.filterCards("important", st).map(c => c.id).sort(), [bal[0], sa].sort());
  assert.deepEqual(F.filterSection("sec:topic:balance:important"), { id: "topic:balance", mode: "important" });
});

test("v5.9: old saved progress still works and Important rides along with the existing sync merge", () => {
  const SMx = require("../sync-merge.js"), st = F.newState();
  st.cards["balance-1"] = { seen: 2, got: 1, miss: 1 };                                  // saved by an older version: no imp, no lastOk
  assert.equal(F.cardStatus(st.cards["balance-1"]), "right"); assert.ok(!F.isImportant(st, "balance-1"));
  F.setImportant(st, "balance-1", true); st.cards["balance-1"].u = 2000;
  const merged = SMx.merge({ cards: { "balance-1": { seen: 2, got: 1, miss: 1, u: 1000 } } }, { cards: st.cards });
  assert.equal(merged.cards["balance-1"].imp, true);                                     // newest write wins, Important included
});

test("v5.9.3: Froeb Ch 3 cost cards are word for word from the textbook, and nothing existing was touched", () => {
  const want = {
    "froeb-ch03-explicit-costs-what-the-book-calls-them": ["Explicit costs: what are they, and what does Froeb call them?",
      "The book does not use the term \"explicit costs\" by itself; it calls them accounting costs: costs paid to suppliers for product ingredients, general operating expenses (such as salaries to factory managers and marketing expenses), depreciation expenses related to investments in buildings and equipment, and interest payments on borrowed funds. \"These types of expenses are the accounting costs of the business.\" (p. 28)"],
    "froeb-ch03-what-are-implicit-costs": ["What are implicit costs?",
      "\"Economists, however, are interested in all the relevant costs of decisions, including the implicit costs that do not show up in the accounting statements.\" Example: the income statement \"reflects no charge for equity even though this is an important consideration for investment decisions.\" (p. 28)"],
    "froeb-ch03-what-are-the-relevant-costs-and-benefits-of-a-decision": ["What are the relevant costs and benefits of a decision?",
      "\"Consider all costs and benefits that vary with the consequence of a decision (If you miss some, that is the hidden-cost fallacy.)\" and \"But consider only costs and benefits that vary with the consequence of the decision. (If you take account of irrelevant costs or benefits, that is the sunk- or fixed-cost fallacy.)\" \"These are the relevant costs and benefit of a decision.\" (p. 30)"],
    "froeb-ch03-explicit-vs-implicit-costs-accounting-profit-economic-loss": ["Explicit vs implicit costs: why can a firm show an accounting profit but an economic loss?",
      "\"In practical terms, a firm may show an accounting profit while experiencing an economic loss. The two amounts are not the same because economic profit recognizes both explicit and implicit costs of capital.\" (p. 29)"]
  };
  for (const id of Object.keys(want)) {
    const c = F.ALL.find(x => x.id === id);
    assert.ok(c, id + " missing"); assert.equal(c.course, "econ"); assert.equal(c.topic, "book:froeb-ch03");
    assert.equal(c.f, want[id][0]); assert.equal(c.b, want[id][1]);
  }
  const ch3 = F.ALL.filter(c => c.topic === "book:froeb-ch03");
  assert.equal(ch3.length, 33);                                                   // 20, then 4 cost cards, 8 summary cards, and problem 3-1
  for (const old of ["opportunity-cost", "implicit-costs", "accounting-costs", "economic-profit", "key-maxim-of-chapter-3"])
    assert.ok(ch3.some(c => c.id === "froeb-ch03-" + old), "existing card lost: " + old);
});

test("v5.9.4: every point of the Froeb Ch 3 Summary of Main Points is a card, word for word and with no page ref", () => {
  const want = [
    ["Chapter 3 summary: how are costs related to decisions?",
      "Costs are associated with decisions."],
    ["Chapter 3 summary: what is the opportunity cost of an alternative?",
      "The opportunity cost of an alternative is the profit you give up to pursue it."],
    ["Chapter 3 summary: which costs and benefits should you consider in a decision, and what are they called?",
      "Consider all costs and benefits that vary with the consequences of a decision and only costs and benefits that vary with the consequences of a decision. These are the relevant costs and relevant benefits of a decision."],
    ["Chapter 3 summary: fixed costs vs variable costs, and which change when a decision changes output?",
      "Fixed costs do not vary with the amount of output. Variable costs change as output changes. Decisions that change output change only variable costs."],
    ["Chapter 3 summary: does accounting profit equal economic profit?",
      "Accounting profit does not necessarily correspond to economic profit."],
    ["Chapter 3 summary: what is the fixed-cost fallacy (sunk-cost fallacy), and what is a common example?",
      "The fixed-cost fallacy or sunk-cost fallacy means that you consider irrelevant costs. A common fixed-cost fallacy is to let overhead or depreciation costs influence short-run decisions."],
    ["Chapter 3 summary: what is the hidden-cost fallacy, and what is a common example?",
      "The hidden-cost fallacy occurs when you ignore relevant costs. A common hidden-cost fallacy is to ignore the opportunity cost of capital when making investment or shutdown decisions."],
    ["Chapter 3 summary: where should you begin when analyzing a decision?",
      "If you begin by looking at the costs, you will always get confused; if you begin with the decision you are considering, you will never get confused."]
  ];
  want.forEach(([f, b], i) => {
    const c = F.ALL.find(x => x.id === "froeb-ch03-ch3-summary-" + (i + 1));
    assert.ok(c, "summary card " + (i + 1) + " missing");
    assert.equal(c.course, "econ"); assert.equal(c.topic, "book:froeb-ch03");
    assert.equal(c.f, f); assert.equal(c.b, b);
    assert.ok(!/\(p\. \d+\)|\(page not given\)/.test(c.b), "summary card " + (i + 1) + " should carry no page reference");
  });
  assert.equal(F.ALL.filter(c => c.topic === "book:froeb-ch03").length, 33);   // 24, then the 8 summary cards, then problem 3-1
});

test("v5.9.5: the problem 3-1 card teaches profit given up, not the price of the alternative", () => {
  const c = F.ALL.find(x => x.id === "froeb-ch03-opp-cost-profit-given-up");
  assert.ok(c, "card missing"); assert.equal(c.course, "econ"); assert.equal(c.topic, "book:froeb-ch03");
  for (const bit of ["free ticket", "Springsteen", "U2", "$80", "$100", "cannot resell"]) assert.ok(c.f.includes(bit), "front is missing " + bit);
  assert.ok(/opportunity cost of seeing Springsteen\?$/.test(c.f), c.f);
  assert.ok(c.b.startsWith("$20, not $80."), c.b.slice(0, 40));              // the answer, and the wrong answer he gave, up front
  assert.ok(c.b.includes("$100 - $80 = $20"), "the arithmetic is not shown");
  assert.ok(c.b.includes("\"The opportunity cost of an alternative is what you give up to pursue it,\""), "book principle missing");
  assert.ok(c.b.includes("\"the forgone opportunity to earn profit from the other.\""), "book wording missing");
  assert.match(c.b, / \(p\. 29\)$/);
});
