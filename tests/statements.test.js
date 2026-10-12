const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../statements.js");
const E = require("../engine.js");
const LD = require("../lessons-data.js");
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const v = (st, k, i) => S.val(st, k, i);
const Y = [0, 1, 2];

test("balance sheet: every subtotal adds up and assets = liabilities + equity, every year", () => {
  for (const i of Y) {
    const b = (k) => v(S.BS, k, i);
    assert.equal(b("cash") + b("ar") + b("inv"), b("tca"));
    assert.equal(b("tca") + b("ppe"), b("ta"));
    assert.equal(b("ap") + b("wages"), b("tcl"));
    assert.equal(b("tcl") + b("loan"), b("tl"));
    assert.equal(b("paid") + b("re"), b("te"));
    assert.equal(b("tl") + b("te"), b("tle"));
    assert.equal(b("ta"), b("tle"), "assets = liabilities + equity in " + S.YEARS[i]);
  }
  const o = S.OPEN; assert.equal(o.cash + o.ar + o.inv, o.tca); assert.equal(o.tca + o.ppe, o.ta); assert.equal(o.ap + o.wages, o.tcl);
  assert.equal(o.tcl + o.loan, o.tl); assert.equal(o.paid + o.re, o.te); assert.equal(o.tl + o.te, o.ta);
});
test("income statement adds up every year", () => {
  for (const i of Y) {
    const n = (k) => v(S.IS, k, i);
    assert.equal(n("rev") - n("cogs"), n("gp")); assert.equal(n("gp") - n("opex"), n("ebit"));
    assert.equal(n("ebit") - n("int"), n("ebt")); assert.equal(n("ebt") - n("tax"), n("ni"));
    assert.ok(n("dep") < n("opex"));
  }
});
test("net income ties to the change in retained earnings (less dividends)", () => {
  for (const i of Y) assert.equal(S.prevBS("re", i) + v(S.IS, "ni", i) + v(S.CF, "div", i), v(S.BS, "re", i), String(S.YEARS[i]));
});
test("cash flow statement adds up and ties to the balance sheet's cash", () => {
  for (const i of Y) {
    const c = (k) => v(S.CF, k, i), d = (k) => v(S.BS, k, i) - S.prevBS(k, i);
    assert.equal(c("cf_ni"), v(S.IS, "ni", i)); assert.equal(c("cf_dep"), v(S.IS, "dep", i));
    assert.equal(c("cf_ar") + d("ar"), 0); assert.equal(c("cf_inv") + d("inv"), 0); assert.equal(c("cf_ap"), d("ap")); assert.equal(c("cf_wages"), d("wages"));
    assert.equal(c("cf_ni") + c("cf_dep") + c("cf_ar") + c("cf_inv") + c("cf_ap") + c("cf_wages"), c("cfo"));
    assert.equal(c("capex"), c("cfi")); assert.equal(c("cf_loan"), d("loan")); assert.equal(c("cf_loan") + c("div"), c("cff"));
    assert.equal(c("cfo") + c("cfi") + c("cff"), c("netcash"));
    assert.equal(c("cash0"), S.prevBS("cash", i)); assert.equal(c("cash1"), v(S.BS, "cash", i)); assert.equal(c("cash0") + c("netcash"), c("cash1"));
    // equipment roll-forward: last year + purchases - depreciation = this year
    assert.equal(S.prevBS("ppe", i) - c("capex") - v(S.IS, "dep", i), v(S.BS, "ppe", i));
  }
});
test("2026 numbers are exactly the ones in the audio script", () => {
  const b = (k) => v(S.BS, k, 2), n = (k) => v(S.IS, k, 2), c = (k) => v(S.CF, k, 2);
  assert.deepEqual([b("cash"), b("ar"), b("inv"), b("tca"), b("ppe"), b("ta"), b("ap"), b("wages"), b("tcl"), b("loan"), b("tl"), b("te"), b("re")], [50, 30, 20, 100, 300, 400, 40, 10, 50, 150, 200, 200, 120]);
  assert.deepEqual([n("rev"), n("cogs"), n("gp"), n("opex"), n("ebit"), n("int"), n("ebt"), n("tax"), n("ni")], [600, 360, 240, 150, 90, 10, 80, 20, 60]);
  assert.deepEqual([c("cf_dep"), c("cf_ar"), c("cfo"), c("cfi"), c("cf_loan"), c("div"), c("cff"), c("netcash")], [25, -10, 75, -40, -20, -5, -25, 10]);
  assert.equal(v(S.IS, "rev", 1), 500); assert.equal(v(S.IS, "ni", 1), 40); // the horizontal-analysis example
  near(S.growth(S.IS, "rev", 2), 0.2); near(S.growth(S.IS, "ni", 2), 0.5);
});
test("ratios are computed correctly (2026 = the script's answers)", () => {
  const r = (k) => S.ratio(k, 2);
  near(r("current"), 2); near(r("quick"), 1.6); assert.equal(r("wc"), 50); near(r("de"), 1); near(r("tie"), 9);
  near(r("gm"), 0.4); near(r("nm"), 0.1); near(r("roa"), 0.15); near(r("roe"), 0.3); near(r("at"), 1.5); near(r("it"), 18);
  const z = S.altman(2); near(z.A, 0.125); near(z.B, 0.3); near(z.C, 0.225); near(z.D, 1.5); near(z.E, 1.5); near(z.z, 3.7125);
  near(S.ratio("current", 0), 65 / 45); near(S.ratio("roe", 1), 40 / 145);
});
test("common-size percentages: base line is 100%, balance sheet sides each sum to 100%", () => {
  for (const i of Y) {
    near(S.commonSize(S.BS, "ta", i), 1); near(S.commonSize(S.IS, "rev", i), 1); near(S.commonSize(S.BS, "tle", i), 1);
    near(S.commonSize(S.BS, "tca", i) + S.commonSize(S.BS, "ppe", i), 1); near(S.commonSize(S.BS, "tl", i) + S.commonSize(S.BS, "te", i), 1);
  }
  near(S.commonSize(S.IS, "cogs", 2), 0.6); near(S.commonSize(S.IS, "opex", 2), 0.25); near(S.commonSize(S.BS, "cash", 2), 0.125); near(S.commonSize(S.BS, "ppe", 2), 0.75);
});
test("lesson parts are linked to the right statement lines", () => {
  const find = (topic, re) => LD[topic].find((t) => re.test(t));
  let x = S.linesFor(find("liquidity", /^The current ratio/), "liquidity"); assert.equal(x.stmt, "bs"); assert.deepEqual(x.keys.sort(), ["tca", "tcl"]);
  x = S.linesFor(find("liquidity", /quick ratio/), "liquidity"); assert.deepEqual(x.keys.sort(), ["ar", "cash", "tcl"]);
  x = S.linesFor(find("leverage", /^Times interest earned/), "leverage"); assert.equal(x.stmt, "is"); assert.deepEqual(x.keys.sort(), ["ebit", "int"]);
  x = S.linesFor(find("cashflow", /^Investing\. Skyline/), "cashflow"); assert.equal(x.stmt, "cf"); assert.ok(x.keys.includes("capex"));
  x = S.linesFor(find("income", /^Here is Skyline's year/), "income"); assert.equal(x.stmt, "is"); assert.ok(["rev", "cogs", "gp", "ni"].every((k) => x.keys.includes(k)));
  x = S.linesFor(find("altman", /^B, retained/), "altman"); assert.deepEqual(x.keys.sort(), ["re", "ta"]);
  // every highlighted key exists on a statement, every accounting topic is linked, economics topics are not
  for (const k of Object.keys(LD)) for (const t of LD[k]) for (const key of S.linesFor(t, k).keys) assert.ok(S.WHERE[key], key);
  for (const k of ["balance", "income", "cashflow", "liquidity", "leverage", "profit", "efficiency", "hv", "altman"]) {
    assert.ok(S.relevant(k)); assert.ok(LD[k].some((t) => S.linesFor(t, k).keys.length), k + " has highlighted parts");
  }
  assert.ok(!S.relevant("oppcost") && !S.relevant("game"));
});
test("device detection: width + pointer + touch, with a manual override", () => {
  const d = E.detectDevice;
  assert.equal(d({ width: 390, coarse: true, fine: false, touch: true }), "phone");
  assert.equal(d({ width: 800, coarse: true, fine: false, touch: true }), "phone");      // small tablet
  assert.equal(d({ width: 1180, coarse: true, fine: false, touch: true }), "phone");     // big tablet, touch only -> simple UI
  assert.equal(d({ width: 1440, coarse: false, fine: true, touch: false }), "desktop");
  assert.equal(d({ width: 1440, coarse: true, fine: true, touch: true }), "desktop");    // touchscreen laptop with a mouse
  assert.equal(d({ width: 700, coarse: false, fine: true, touch: false }), "phone");     // narrow desktop window
  assert.equal(d({ width: 390, coarse: true, touch: true }, "desktop"), "desktop");
  assert.equal(d({ width: 1440, fine: true }, "phone"), "phone");
  assert.equal(d({ width: 1440, fine: true }, "auto"), "desktop");
});
test("Read mode helpers: readSegs gives a topic's parts without a session; 'teachat' starts listening at a chosen part", () => {
  const B = require("../questions.js"); const store = {}; let id = 0;
  const io = { speak(p, cb) { io.cb = cb; }, cancelSpeech() {}, pauseAudio() {}, resumeAudio() {}, setTimer() { return ++id; }, clearTimer() {}, now: () => 1760000000000,
    rng: E.mulberry(3), load: (k, d) => (k in store ? store[k] : d), save: (k, v) => { store[k] = v; }, emit() {} };
  const tu = new E.Tutor(io, { topics: B.TOPICS, questions: B.QUESTIONS, generators: B.GENERATORS, lessons: LD, subjects: B.SUBJECTS });
  const segs = tu.readSegs("liquidity"); assert.equal(segs.length, LD.liquidity.length);
  assert.equal(tu.settings.deviceMode, "auto"); assert.equal(tu.settings.learnView, "listen");
  tu.start({ lesson: "liquidity" }); tu.ui("teachat", { key: "liquidity", si: 8 });
  assert.equal(tu.topics[tu.lesson.ti].key, "liquidity"); assert.equal(tu.lesson.si, 8);
});
test("every accounting lesson part opens the correct statement tab (audited table)", () => {
  const EXPECT = {
    equation: "bs bs", balance: "bs ".repeat(16).trim(), income: "is ".repeat(8).trim(),
    cashflow: "cf cf cf cf cf cf cf cf cf cf cf bs", accrual: "is is is is",
    liquidity: "bs bs bs bs bs bs is bs bs bs bs bs bs", leverage: "bs bs bs is", profit: "is is is is is is",
    efficiency: "is is is is ratios is is", hv: "is is is is is is bs is",
    altman: "bs bs bs bs bs bs bs bs ratios ratios ratios bs bs bs bs bs bs ratios bs bs",
    tenk: "bs bs bs bs bs bs bs is bs bs bs bs"
  };
  assert.deepEqual(Object.keys(EXPECT).sort(), Object.keys(S.TOPIC_STMT).sort());
  for (const [topic, want] of Object.entries(EXPECT)) {
    const tabs = want.split(" "); assert.equal(LD[topic].length, tabs.length, topic + " part count");
    LD[topic].forEach((t, i) => {
      const x = S.partLink(topic, i, E.speakable ? E.speakable(t) : t, "script");
      assert.equal(x.stmt, tabs[i], `${topic} part ${i + 1}: "${t.slice(0, 50)}"`);
      // highlighted lines must exist; when the tab is a statement, the main highlighted lines are on it (or none)
      for (const k of x.keys) assert.ok(S.WHERE[k], k);
      if (x.stmt === "ratios") assert.ok(x.ratios.length, topic + " " + i + " ratio highlighted");
      else if (x.keys.length) assert.ok(x.keys.some((k) => S.WHERE[k] === x.stmt), `${topic} part ${i + 1}: some highlight is on the ${x.stmt} tab (${x.keys})`);
    });
  }
  // the weak spots that are now explicit
  assert.equal(S.partLink("cashflow", 0, LD.cashflow[0]).stmt, "cf");
  assert.deepEqual(S.partLink("balance", 15, LD.balance[15]).keys.sort(), ["paid", "re", "te"]);
  assert.deepEqual(S.partLink("tenk", 11, LD.tenk[11]).keys, []);   // "interesting" is not interest expense
  assert.equal(S.partLink("altman", 17, LD.altman[17]).stmt, "ratios");
  // simpler / summary variants have different parts: no explicit index mapping, rules only
  assert.equal(S.partLink("cashflow", 0, "Revenue is money from customers.", "simple").stmt, "is");
});
