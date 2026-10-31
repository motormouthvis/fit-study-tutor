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
  const W = F.BK.filter(c => c.book === "wt16" && c.topic === ch.key);
  assert.equal(W.length, 77); assert.equal(F.BK.filter(c => c.topic === ch.key).length, 77);
  assert.ok(W.every(c => c.course === "acct" && /^wt16-ch01-[a-z0-9-]+$/.test(c.id) && c.f && c.b));
  assert.equal(ch.title_full, "Course 5601 - Book: Financial & Managerial Accounting, Chapter 1: Introduction to Accounting and Business");
  const sec = F.sectionById(ch.key); assert.equal(sec.title, ch.title_full);
  assert.equal(F.sectionStats(sec, F.newState()).total, 77);
});
test("v5.1: every card belongs to a section (course topics, book chapters, Statement Analysis) and nothing was dropped", () => {
  const gs = F.sectionList(), secs = [].concat(...gs.map(g => g.sections)).filter(s => s.id !== "all" && s.id !== "mine");
  for (const c of F.ALL) assert.ok(secs.some(s => s.test(c)), "no section for " + c.id);
  assert.equal(F.sectionStats(F.sectionById("all"), F.newState()).total, F.ALL.length);
  assert.equal(F.sectionStats(F.sectionById("sa"), F.newState()).total, F.SA.length);
  assert.equal(F.CARDS.length, 331); assert.equal(F.ALL.length, 331 + 82 + 166 + 32 + 68 + 48 + 71 - 17 + 14); // v5.9.22: Froeb Ch6 +19, Warren Ch12 +5, -10 Froeb Ch2/Ch3 duplicates; // v5.9.21: audit fixes (-23 duplicate/near-duplicate cards, +6 new term/scope cards); v5.9.18: +71 (Scott Ch 4-5, Warren Ch 12); v5.9.17: Ch 3-5 rebuilt, study-doc deck folded in (net +32 after removing duplicates)
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
  assert.equal(F.filterCards("sec:book:wt16-ch01:all", st).length, 77); assert.equal(F.filterCards("sec:sa:wrong", st).length, 0);
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

test("v5.7: Froeb Chapters 1-6 cards: course 5421, page refs, long section titles", () => {
  const FR = F.BK.filter(c => c.book === "froeb");
  assert.equal(FR.length, 166 + 32 - 9 + 9); assert.equal(F.BK.length, 316 + 32 + 71 - 17 + 14); // v5.9.22: Ch6 +19, Ch2 -2, Ch3 -8; // v5.9.17 Ch 3-5 rebuild; v5.9.21 audit trims
  // every card carries a page ref, except the ones quoted word for word from the book (see the v5.9 test)
  const VERBATIM = []; // v5.9.22: no word-for-word cards remain
  // the Ch 3 "Summary of Main Points" cards are quoted word for word from a page we do not know, so they carry no page ref either
  const noPage = c => VERBATIM.includes(c.id) || /^froeb-ch03-ch3-summary-\d+$/.test(c.id) || /^froeb-ch05-study-/.test(c.id); // Ch 5 study-doc deck comes from Bill's own notes, no page refs
  // Chapter 4 is written in our own words from the chapter, so its answers end with a section reference instead of a page
  const ch4ref = c => /^froeb-ch04-/.test(c.id) && / \(Ch 4, [^)]+\)$/.test(c.b);
  // Chapter 5 is also in our own words; each answer ends with a section and page reference, or the overview
  const ch5ref = c => /^froeb-ch05-/.test(c.id) && / \(Ch 5, (overview|sect 5\.[1-6], p\. \d+)(; summary)?\)$/.test(c.b);
  assert.ok(FR.every(c => c.course === "econ" && /^froeb-ch0[1-6]-[a-z0-9-]+$/.test(c.id) && (noPage(c) || ch4ref(c) || ch5ref(c) || / \((p\. \d+|page not given)\)$/.test(c.b))));
  const b = F.BOOKS.find(x => x.id === "froeb");
  assert.deepEqual(b.chapters.map(ch => FR.filter(c => c.topic === ch.key).length), [22, 23, 26, 55, 50, 22]);
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
  const S = F.BK.filter(c => c.book === "scott" && /^scott-ch0[1-3]-/.test(c.id));
  assert.equal(S.length, 65); // v5.9.21: -3 duplicates
  assert.ok(S.every(c => c.course === "acct" && /^scott-ch0[1-3]-[a-z0-9-]+$/.test(c.id) && / \((p\. \d+|page not given)\)$/.test(c.b) && !/^Q:/.test(c.f)));
  const b = F.BOOKS.find(x => x.id === "scott");
  assert.deepEqual(b.chapters.slice(0, 3).map(ch => S.filter(c => c.topic === ch.key).length), [29, 21, 15]);
  assert.equal(b.chapters[2].title_full, "Course 5601 - Book: College Accounting: A Career Approach (Scott, 13th ed.), Chapter 3: The General Journal and the General Ledger");
});

/* ---------- v5.9: Froeb Ch 3 wealth/government card, and the Important star ---------- */
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

test("v5.9.7: Froeb Chapter 4 is a chapter like the others: 55 cards, stable ids, in every chapter filter", () => {
  const b = F.BOOKS.find(x => x.id === "froeb"), ch = b.chapters.find(c => c.n === 4);
  assert.ok(ch, "no chapter 4"); assert.equal(ch.title, "Extent (How Much) Decisions");
  assert.equal(ch.key, "book:froeb-ch04");
  assert.equal(ch.title_full, "Course 5421 - Book: Managerial Economics (Froeb, 5th ed.), Chapter 4: Extent (How Much) Decisions");
  const cards = F.ALL.filter(c => c.topic === "book:froeb-ch04");
  assert.equal(cards.length, 55);
  assert.ok(cards.every(c => c.course === "econ" && c.book === "froeb" && c.chapter === 4 && /^froeb-ch04-[a-z0-9-]+$/.test(c.id)));
  // the sections list builds the chapter pickers, so Chapter 4 gets Study all / missed / restudy / important for free
  const sec = F.sectionById("book:froeb-ch04");
  assert.ok(sec, "chapter 4 has no section"); assert.equal(sec.title, ch.title_full);
  const books = F.sectionList().find(g => g.id === "books");
  assert.ok(books.sections.some(s => s.id === "book:froeb-ch04"), "chapter 4 missing from Books and chapters");
  assert.equal(F.sectionStats(sec, F.newState()).total, 55);
  const st = F.newState(); F.setImportant(st, cards[0].id, true);
  assert.deepEqual(F.filterCards("sec:book:froeb-ch04:important", st).map(c => c.id), [cards[0].id]);
  assert.equal(F.sectionStats(sec, st).important, 1);
  assert.equal(F.filterCards("sec:book:froeb-ch04:all", st).length, 55);
});
test("v5.9.7: every Chapter 4 card matches the written wording, front and back, in order", () => {
  const want = [
    ["extent-decision-vs-discrete", "What is an extent decision, and how is it different from a discrete decision?", "An extent decision asks HOW MUCH to do: how many units to make, how much to spend, how hard to work. A discrete decision asks WHETHER to do something at all.\nExample: \"Should we open a store in a new city?\" is discrete. \"How many staff should we schedule on Saturday?\" is extent. (Ch 4, p. 36)"],
    ["marginal-cost", "What is marginal cost (MC)?", "The extra cost of producing one more unit. Think \"the next one,\" not the average of all of them. (Ch 4, sect 4.2, pp. 39-40; summary)"],
    ["marginal-revenue", "What is marginal revenue (MR)?", "The extra revenue you get from selling one more unit. (Ch 4, sect 4.2, pp. 39-40; summary)"],
    ["decision-rule-mr-vs-mc", "What is the decision rule for how much to do?", "If MR is more than MC, do more. If MR is less than MC, do less. You are at the right amount when MR equals MC.\nExample: The next unit adds $22 of revenue and $18 of cost. Do more, because that unit adds $4 of profit. (Ch 4, sect 4.2; summary)"],
    ["why-mr-mc-does-not-say-how-far", "The MR vs. MC rule tells you which direction to go. Why doesn't it tell you how far?", "Because MC usually rises and MR usually falls as you do more. So the answer changes with every step. Take a step, recheck MR and MC, and stop when they meet. (Ch 4, sect 4.2, pp. 39-40)"],
    ["average-cost-vs-marginal-cost", "Average cost vs. marginal cost: what is the difference?", "Average cost is total cost (fixed plus variable) divided by the number of units. Marginal cost is only the extra cost of one more unit. For a \"do one more?\" decision, use marginal cost. Do not mix them up.\nExample: Total cost for 10 units is $100, so average cost is $10. If unit 11 pushes total cost to $108, the marginal cost of unit 11 is $8. (Ch 4, summary)"],
    ["fixed-cost-part-is-irrelevant", "Which part of average cost is irrelevant to an extent decision?", "The fixed-cost part. Fixed costs do not change when you do one more, so they play no role in the how-much decision. Only marginal cost matters. (Ch 4, sect 4.1, pp. 37-38; summary)"],
    ["hospital-fixed-cost-fallacy", "A hospital's average cost per delivery is higher than its average revenue per delivery, so the CEO refuses to expand. What mistake is this?", "The fixed-cost fallacy. Average cost includes fixed overhead that does not change with one more delivery. The right test is whether the marginal revenue of one more delivery beats its marginal cost. (Ch 4, sect 4.1, pp. 37-38)"],
    ["rising-average-cost", "What does it mean when average cost is rising? How does that connect to marginal cost?", "Average cost rises only when the marginal cost of the latest unit is above the current average. If MC is below the average, the average falls. (Ch 4, end-of-chapter questions)"],
    ["how-much-to-spend-on-advertising", "How do you decide how much to spend on advertising?", "Keep spending as long as the extra revenue from the next ad dollar is bigger than its cost. Stop where the marginal cost of winning one more customer (the customer acquisition cost) equals the marginal revenue from that customer.\nExample (the radio-station case): Each new listener is worth about $21 in donations. Ad spending stops being worth it when the cost of winning one more listener rises to $21. (Ch 4, sect 4.2, pp. 39-40)"],
    ["splitting-a-fixed-budget", "You have a fixed budget to split between two options. How do you divide it?", "Move dollars toward the option where the next dollar wins more (lower marginal cost). Keep shifting until the marginal costs of the two options are equal. At that point, no move can improve the result. (Ch 4, sect 4.3, pp. 40-43)"],
    ["opportunity-cost-of-a-budget-dollar", "With a fixed budget, what is the opportunity cost of a dollar spent on option A?", "The benefit that same dollar would have produced on option B. That is why the two marginal costs must be equal at the best split. (Ch 4, sect 4.3, pp. 40-43)"],
    ["comparing-plants-cost-per-hour", "When you compare plants by cost per hour of work, what should you check before shifting production?", "(1) Take fixed overhead out, since it is not marginal. (2) Check that cost per hour is a good stand-in for true marginal cost. (3) Watch for hidden costs, such as politics or disruption, that limit how far you can shift. (Ch 4, sect 4.3, pp. 40-43)"],
    ["when-to-cut-a-growing-tree", "When should you cut a tree that is still growing in value?", "When its value stops growing faster than your next-best return. While growth beats that return, wait. Once growth falls below it, harvest and invest the money. (Ch 4, sect 4.2, p. 40)"],
    ["fixed-fee-does-not-change-effort", "Why doesn't a fixed fee change how hard someone works?", "Effort is an extent decision. A fixed fee does not change what one more unit of effort earns, so the marginal benefit of effort is the same either way. Only pay that moves with output changes behavior. (Ch 4, sect 4.4, pp. 43-44; summary)"],
    ["fixed-fee-vs-per-tree-charge", "A logger pays a fixed fee for the right to cut trees. How does that differ from paying per tree?", "The fixed fee is a sunk cost, so the logger cuts every tree that earns any profit. A per-tree charge raises the marginal cost of each tree, so the least valuable trees are left standing. (Ch 4, sect 4.4, pp. 43-44)"],
    ["lower-commission-and-shirking", "Why can a lower commission rate make a salesperson shirk, even with a salary added?", "The salary does not change the payoff from one more sale. A lower commission cuts the marginal benefit of each sale. Hard sales stop being worth the effort, so only the easy ones get made. (Ch 4, sect 4.4, pp. 43-44)"],
    ["pay-on-measures-that-reflect-effort", "What does \"tie pay to performance measures that reflect effort\" mean?", "Pay people on results they can actually influence. If the measure moves for reasons they do not control, the pay does not reward effort.\nExample: A manager is measured on revenue and only the costs he controls, not shared overhead. (Ch 4, sect 4.5, pp. 44-45; summary)"],
    ["incentive-must-reach-the-worker", "Why does it matter that an incentive reaches the person who does the work?", "Effort responds to the share of the gain that person keeps. If part of the payoff goes to someone else, the marginal incentive shrinks and so does effort. (Ch 4, sect 4.5, pp. 44-45)"],
    ["limits-of-incentive-pay", "What limits incentive pay?", "(1) Performance can be hard to measure, so people chase the measure instead of the goal. (2) It works best where effort really changes results. (3) Some jobs cover many tasks, so recognition and other non-money rewards also matter. (Ch 4, sect 4.5, pp. 44-45)"],
    ["procedural-vs-outcome-fairness", "Procedural fairness vs. outcome fairness: what is the difference?", "Procedural fairness means everyone gets the same rules and the same chance. Outcome fairness means everyone ends up with the same result. Incentive pay is fair in the first sense but produces unequal results. (Ch 4, sect 4.6, pp. 45-46)"],
    ["trade-offs-of-incentive-pay", "What are the trade-offs of incentive pay?", "Benefit: higher productivity. Costs: more inequality in outcomes and more risk for workers, since pay moves with results. (Ch 4, sect 4.6, pp. 45-46)"],
    ["one-more-shift-marginal-not-average", "\"Should we add one more shift this week?\" Is that a marginal question or an average-cost question?", "Marginal. Compare the extra revenue of the added shift to its extra cost. The average cost of the shifts you already run does not matter. (Ch 4, summary)"],
    ["marginal-cost-from-a-total-cost-table", "How do you find marginal cost from a table of total costs?", "Subtract: MC of a unit = total cost with that unit minus total cost without it. Do not divide.\nExample: Total cost is $30 at 1 unit, $34 at 2 units, and $39 at 3 units. The MC of unit 2 is $4, and the MC of unit 3 is $5. (Ch 4, practice-problem skill)"],
    ["price-below-marginal-cost", "If the price of the last unit is less than its marginal cost, what should you do?", "Make fewer. That unit loses money at the margin.\nExample: A caterer can sell a meal for $20, but the next meal costs $25 to make. Each extra meal loses $5. (Ch 4, summary)"],
    ["marginal-cost-of-one-more-worker", "When hiring one more worker means raising the wage of everyone already working, what is the worker's marginal cost?", "The new worker's pay plus the raises given to all the others. Do not use only the new worker's wage.\nExample: 9 workers earn $10 an hour, and a tenth would only join at $12, which is then paid to all 10. Total pay goes from $90 to $120, so the marginal cost is $30 an hour, not $12. (Ch 4, practice-problem skill)"],
    ["which-facility-to-cut", "Sales volume falls and you must cut capacity at one of two facilities. Which costs guide the choice?", "Compare the variable (marginal) cost per unit at each facility, and cut where it is highest. Ignore the fixed costs, since they do not change with the volume you shift. (Unless the choice would actually shut a facility and avoid its fixed costs.) (Ch 4, practice-problem skill; sect 4.1)"],
    ["more-workers-or-more-machines", "You can add either more workers or more machines. How do you decide?", "Compare how much extra output each adds PER DOLLAR it costs. Put the next dollar where output per dollar is higher. Stop shifting when the two are equal. (Ch 4, practice-problem skill; sect 4.3)"],
    ["decision-rule-for-effort", "The decision rule for effort: when does a worker put in more effort?", "When the marginal benefit to the worker of the extra effort (MR) is greater than its marginal cost to the worker (MC). So an incentive raises effort only if it raises that marginal benefit or lowers that marginal cost; fixed fees and flat pay do neither. (Ch 4, sect 4.4; summary)"],
  ];
  assert.equal(want.length, 29);
  const cards = F.ALL.filter(c => c.topic === "book:froeb-ch04");
  assert.ok(cards.length >= want.length, "chapter 4 lost cards");   // later cards are checked by their own tests
  want.forEach(([slug, f, b]) => {   // v5.9.17: the deck was reordered (terms first), so match by id
    const c = cards.find(x => x.id === "froeb-ch04-" + slug); assert.ok(c, slug + " missing");
    assert.equal(c.f, f, "front " + slug); assert.equal(c.b, b, "back " + slug);
    assert.ok(!/[*\\]/.test(c.f + c.b), "markdown left in " + slug);
  });
});

test("v5.9.17: Chapter 4 opens with terms, the AC-rising duplicate is folded into rising-average-cost", () => {
  const cards = F.ALL.filter(c => c.topic === "book:froeb-ch04"), ids = cards.map(c => c.id.replace("froeb-ch04-", ""));
  assert.deepEqual(ids.slice(0, 3), ["tr-total-revenue", "tc-total-cost", "profit-term"]);
  assert.ok(!ids.includes("ac-rising-mc-above"));
  const at = s => ids.indexOf(s);
  for (const [a, b] of [["marginal-cost", "decision-rule-mr-vs-mc"], ["avoidable-cost", "shutdown-rule-short-vs-long-run"], ["average-variable-cost", "shutdown-price"], ["break-even-price", "break-even-quantity-formula"], ["break-even-quantity-formula", "practice-open-or-exit-avc-6-atc-9"], ["fixed-cost-part-is-irrelevant", "hospital-fixed-cost-fallacy"]])
    assert.ok(at(a) >= 0 && at(a) < at(b), a + " before " + b);
  for (const c of cards) { assert.match(c.b, / \(Ch 4, [^)]+\)$/); assert.equal(F.ALL.filter(x => x.id === c.id).length, 1); }
});

test("v5.9.10: Froeb Chapter 5 is a chapter like the others: 50 cards, between Chapters 4 and 6, in every chapter filter", () => {
  const b = F.BOOKS.find(x => x.id === "froeb"), ch = b.chapters.find(c => c.n === 5);
  assert.ok(ch, "no chapter 5"); assert.equal(ch.title, "Investment Decisions: Look Ahead and Reason Back");
  assert.equal(ch.key, "book:froeb-ch05");
  assert.equal(ch.title_full, "Course 5421 - Book: Managerial Economics (Froeb, 5th ed.), Chapter 5: Investment Decisions: Look Ahead and Reason Back");
  assert.deepEqual(b.chapters.map(c => c.n), [1, 2, 3, 4, 5, 6]); // v5.9.17: study-doc deck folded into Ch 3-5
  const cards = F.ALL.filter(c => c.topic === "book:froeb-ch05");
  assert.equal(cards.length, 50);
  assert.ok(cards.every(c => c.course === "econ" && c.book === "froeb" && c.chapter === 5 && /^froeb-ch05-[a-z0-9-]+$/.test(c.id)));
  assert.equal(new Set(cards.map(c => c.id)).size, 50, "duplicate ids");
  // page references come from the section pages in the notes
  const pages = { "5.1": 49, "5.2": 51, "5.3": 53, "5.4": 55, "5.5": 56, "5.6": 56 };
  for (const c of cards) { const m = c.b.match(/\(Ch 5, sect (5\.\d), p\. (\d+)/); if (m) assert.equal(+m[2], pages[m[1]], c.id); else assert.match(c.b, /\(Ch 5, overview\)$/, c.id); }
  const sec = F.sectionById("book:froeb-ch05");
  assert.ok(sec, "chapter 5 has no section"); assert.equal(sec.title, ch.title_full);
  const books = F.sectionList().find(g => g.id === "books").sections.map(s => s.id);
  assert.ok(books.indexOf("book:froeb-ch04") < books.indexOf("book:froeb-ch05") && books.indexOf("book:froeb-ch05") < books.indexOf("book:froeb-ch06"), "chapter order");
  assert.equal(F.sectionStats(sec, F.newState()).total, 50);
  const st = F.newState(); F.setImportant(st, cards[0].id, true);
  assert.deepEqual(F.filterCards("sec:book:froeb-ch05:important", st).map(c => c.id), [cards[0].id]);
  assert.equal(F.filterCards("sec:book:froeb-ch05:all", st).length, 50);
});
test("v5.9.10: Chapter 5 covers the seven summary points and the key worked numbers", () => {
  const cards = F.ALL.filter(c => c.topic === "book:froeb-ch05"), txt = cards.map(c => c.b).join("\n");
  assert.equal(cards.filter(c => /; summary\)$/.test(c.b)).length, 8);
  for (const re of [/7\.4%/, /10\.125%/, /\$20,485/, /\+\$0\.88/, /-\$1\.20/, /7\.93%/, /40,000 trucks/, /9,600 trucks/, /Q = 5/, /\$6\./, /\$6 \+ \$2 = \$8/, /look ahead and reason back/])
    assert.match(txt, re, String(re));
  // no duplicates of Ch 4 concepts: none of these Ch 5 slugs repeats a Ch 4 slug
  const ch4 = new Set(F.ALL.filter(c => c.topic === "book:froeb-ch04").map(c => c.id.replace("froeb-ch04-", "")));
  for (const c of cards) assert.ok(!ch4.has(c.id.replace("froeb-ch05-", "")), c.id);
});

test("v5.9.11: skip moves next / previous, wraps at the ends, and never changes card state", () => {
  const st = F.newState(), before = JSON.stringify(st), q = ["a", "b", "c", "d"];
  assert.deepEqual(F.skip(q, 1), ["b", "c", "d", "a"]);
  assert.deepEqual(F.skip(q, -1), ["d", "a", "b", "c"], "previous from the first card wraps to the last");
  assert.deepEqual(F.skip(F.skip(q, 1), -1), q, "next then previous returns to the same card");
  let r = q; for (let i = 0; i < 4; i++) r = F.skip(r, 1); assert.deepEqual(r, q, "next from the last card wraps to the first");
  assert.deepEqual(q, ["a", "b", "c", "d"], "input queue is not mutated");
  assert.deepEqual(F.skip(["a"], 1), ["a"]); assert.deepEqual(F.skip([], -1), []);
  assert.equal(JSON.stringify(st), before, "no stats recorded");
});

test("v5.9.13: the IRR-by-trial-and-error card sits right after the IRR worked example in Chapter 5, as a normal card", () => {
  const cards = F.ALL.filter(c => c.topic === "book:froeb-ch05"), i = cards.findIndex(c => c.id === "froeb-ch05-irr-by-trial-and-error");
  assert.ok(i > 0 && cards[i - 1].id === "froeb-ch05-irr-worked-example", "placed after the IRR worked example");
  const c = cards[i]; assert.equal(c.course, "econ"); assert.equal(c.book, "froeb"); assert.equal(c.chapter, 5);
  assert.match(c.f, /How do you find the IRR by trial and error/); assert.match(c.f, /\$100/); assert.match(c.f, /\$50 a year for 5 years/);
  for (const re of [/50 \/ \(1 \+ r\)\^n/, /too low/, /too high/, /189\.54/, /149\.53/, /101\.76/, /just above 40%/, /\(Ch 5, sect 5\.2, p\. 51\)$/]) assert.match(c.b, re, String(re));
  // the numbers are right: the sum of discounted payments at each guessed rate, and the IRR is a little above 40%
  const pv = r => [1, 2, 3, 4, 5].reduce((s, n) => s + 50 / Math.pow(1 + r, n), 0);
  assert.equal(pv(0.1).toFixed(2), "189.54"); assert.equal(pv(0.2).toFixed(2), "149.53"); assert.equal(pv(0.4).toFixed(2), "101.76");
  assert.ok(pv(0.4) > 100 && pv(0.42) < 100);
  assert.ok(!F.newState().cards[c.id], "not marked important or restudy by default");
  assert.deepEqual(F.filterCards("sec:book:froeb-ch05:important", F.newState()).map(x => x.id), []);
});

test("v5.9.18: BUS 5601 Week 2 decks: Scott Ch 4 (25) and Ch 5 (21), Warren Ch 12 (25), terms first", () => {
  const n = (id, ch) => F.BK.filter(c => c.topic === "book:" + id + "-ch" + String(ch).padStart(2, "0")).length;
  assert.equal(n("scott", 4), 25); assert.equal(n("scott", 5), 21); assert.equal(n("wt16", 12), 30); // v5.9.22: +5 stock dividend / split / no-par cards
  const s4 = F.BK.filter(c => c.topic === "book:scott-ch04"); assert.match(s4[0].f, /cash basis/);
  const w12 = F.BK.filter(c => c.topic === "book:wt16-ch12"); assert.match(w12[0].f, /What is a corporation/);
  assert.ok(F.BK.filter(c => /^(scott-ch0[45]|wt16-ch12)-/.test(c.id)).every(c => c.course === "acct"));
});

test("v5.9.21: audit fixes: terms before use, consistent Scott cycle, duplicates trimmed, ids kept", () => {
  const ids = t => F.ALL.filter(c => c.topic === t).map(c => c.id.replace(/^[a-z0-9]+-ch\d\d-/, ""));
  const w = ids("book:wt16-ch01"), at = (a, x) => a.indexOf(x);
  for (const [x, y] of [["assets", "account-payable"], ["liabilities", "account-payable"], ["equity", "the-accounting-equation"], ["revenue", "net-income-or-net-profit"], ["net-income-or-net-profit", "retained-earnings"], ["dividends", "retained-earnings"]])
    assert.ok(at(w, x) >= 0 && at(w, x) < at(w, y), x + " before " + y);
  for (const gone of ["earnings", "profit", "historical-cost-principle", "owner-s-equity", "stockholders-equity"]) assert.ok(!w.includes(gone), gone);
  const f5 = ids("book:froeb-ch05");
  assert.deepEqual(f5.slice(0, 6), ["contribution-margin", "present-value-term", "discounting-term", "cost-of-capital-term", "npv-term", "irr-term"]);
  for (const [x, y] of [["irr-by-trial-and-error", "irr-is-harder-use-npv"], ["apartment-wacc-example", "max-price-from-profit-and-cost-of-capital"], ["higher-cost-of-capital-lowers-value", "firms-have-different-discount-rates"], ["shutdown-price-lease-example", "more-avoidable-costs-higher-shutdown-price"]])
    assert.ok(at(f5, x) >= 0 && at(f5, x) < at(f5, y), x + " before " + y);
  const sd = F.ALL.find(c => c.id === "froeb-ch05-shutdown-benefit-versus-cost");
  assert.match(sd.b, /only when all costs are avoidable/);
  assert.ok(!F.ALL.some(c => c.id === "scott-ch03-accounting-cycle-eight-steps"));
  const cyc = F.ALL.find(c => c.id === "scott-ch05-order-main-accounting-cycle-steps").b;
  assert.ok(cyc.indexOf("financial statements") < cyc.indexOf("adjusting entries") && cyc.indexOf("adjusting entries") < cyc.indexOf("closing entries"));
  assert.ok(!/cash flows/.test(cyc));
  assert.match(F.ALL.find(c => c.id === "froeb-ch01-rational-actor-paradigm").b, /The lever: change the incentives/);
  assert.match(F.ALL.find(c => c.id === "wt16-ch01-debit-credit-rules").b, /^Debits increase Assets/);
});

test("v5.9.22: audit leftovers: own words, Froeb Ch6 built out, Scott Ch1 teaching order, Warren Ch12 stock dividends and splits", () => {
  const ids = t => F.ALL.filter(c => c.topic === t).map(c => c.id.replace(/^[a-z0-9]+-ch\d\d-/, ""));
  for (const id of ["froeb-ch01-what-is-a-price-floor", "froeb-ch01-what-is-a-price-ceiling", "froeb-ch02-does-the-government-create-wealth", "froeb-ch02-what-is-the-opposite-of-a-tax", "froeb-ch03-ch3-summary-6", "froeb-ch03-ch3-summary-7"]) {
    const c = F.ALL.find(x => x.id === id); assert.ok(c, id); assert.ok(/\((p\. \d+|page not given)\)$/.test(c.b), id); }
  assert.match(F.ALL.find(x => x.id === "froeb-ch02-does-the-government-create-wealth").b, /^Not directly/);
  const c2 = ids("book:froeb-ch02"), c3 = ids("book:froeb-ch03");
  for (const gone of ["what-is-the-one-lesson-of-economics", "how-do-taxes-destroy-wealth-blocked-trades"]) assert.ok(!c2.includes(gone), gone);
  for (const gone of ["what-are-implicit-costs", "explicit-costs-what-the-book-calls-them", "ch3-summary-1", "ch3-summary-2", "ch3-summary-3", "ch3-summary-4", "ch3-summary-5", "ch3-summary-8"]) assert.ok(!c3.includes(gone), gone);
  for (const keep of ["implicit-costs", "accounting-costs", "opportunity-cost", "key-maxim-of-chapter-3"]) assert.ok(c3.includes(keep), keep);
  const f6 = ids("book:froeb-ch06");
  assert.equal(f6.length, 22); assert.equal(f6[0], "demand-curve-term");
  for (const k of ["elasticity-sign-size-direction", "gasoline-short-vs-long-run-elasticity", "positive-price-elasticity-is-rare"]) assert.ok(f6.includes(k), k);
  assert.ok(f6.indexOf("price-elasticity-term") < f6.indexOf("elasticity-sign-size-direction") && f6.indexOf("elasticity-and-revenue") < f6.indexOf("markup-rule-formula"));
  const s1 = ids("book:scott-ch01"); assert.equal(s1.length, 29); assert.equal(s1[0], "sole-proprietorship");
  assert.ok(s1.indexOf("assets") < s1.indexOf("accounts-payable") && s1.indexOf("liabilities") < s1.indexOf("fundamental-accounting-equation-assets-liabilities"));
  assert.ok(F.ALL.filter(c => /^scott-ch0[12]-/.test(c.id)).every(c => !/^"/.test(c.b)), "Scott Ch1-2 definitions are in our own words");
  const w = ids("book:wt16-ch12");
  for (const k of ["entry-issue-nopar-stock", "entry-stock-dividend-declared", "practice-stock-dividend", "stock-split", "practice-stock-split"]) assert.ok(w.includes(k), k);
  assert.ok(w.indexOf("stock-dividend") < w.indexOf("entry-stock-dividend-declared"));
});
