const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const B = require("../questions.js");
const LD = require("../lessons-data.js");

function makeIO(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  let t = 1760000000000, id = 0; const timers = {};
  const io = {
    spoken: [], pending: null, cancels: 0, store,
    spokenParts: [], paused: 0, resumed: 0,
    speak(parts, cb) { assert.ok(Array.isArray(parts), "speak gets a clip list"); io.spokenParts.push(parts); io.spoken.push(parts.map(E.partText).join(" ")); io.pending = cb; if (opts.auto) { const c = cb; io.pending = null; c && c(true); } },
    cancelSpeech() { io.cancels++; io.pending = null; },
    pauseAudio() { io.paused++; }, resumeAudio() { io.resumed++; },
    failSpeech(info) { const c = io.pending; io.pending = null; if (c) c(false, info || "test failure"); },
    setTimer(fn, ms) { const k = ++id; timers[k] = { fn, ms }; return k; },
    clearTimer(k) { delete timers[k]; },
    now() { return t; }, advance(ms) { t += ms; },
    rng: E.mulberry(opts.seed || 7),
    load(k, d) { return k in store ? JSON.parse(JSON.stringify(store[k])) : d; },
    save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    emit() {},
    endSpeech() { const c = io.pending; io.pending = null; if (c) c(); },
    fire() { const ks = Object.keys(timers); ks.forEach(k => { const x = timers[k]; delete timers[k]; x.fn(); }); return ks.length; },
    timerCount() { return Object.keys(timers).length; }
  };
  return io;
}
function makeTutor(opts) {
  const io = makeIO(opts);
  const tu = new E.Tutor(io, { topics: B.TOPICS, questions: B.QUESTIONS, generators: B.GENERATORS, lessons: LD, subjects: B.SUBJECTS });
  return { io, tu };
}
// drive: finish current speech and run timers until the tutor is waiting
function settle(io, n) { for (let i = 0; i < (n || 6); i++) { io.endSpeech(); io.fire(); } }
function startAsked(opts) { const x = makeTutor(opts); x.tu.start(); settle(x.io, 2); return x; }

/* ---------------- question bank ---------------- */
test("bank has 120+ questions and every topic has 5+", () => {
  assert.ok(B.QUESTIONS.length >= 120, "count " + B.QUESTIONS.length);
  B.TOPICS.forEach(t => assert.ok(B.QUESTIONS.filter(q => q.topic === t.key).length >= 5, t.key));
  const types = new Set(B.QUESTIONS.map(q => q.type)); ["mc", "num", "short", "explain"].forEach(x => assert.ok(types.has(x), x));
});
test("bank integrity: ids unique, mc has 4 distinct options, answers present", () => {
  const ids = new Set();
  B.QUESTIONS.forEach(q => {
    assert.ok(!ids.has(q.id), "dup " + q.id); ids.add(q.id);
    assert.ok(q.q && q.ex, q.id); assert.ok([1, 2, 3].includes(q.diff), q.id);
    assert.ok(B.SUBJECTS[q.subj], q.id);
    if (q.type === "mc") { assert.equal(q.opts.length, 4, q.id); assert.equal(new Set(q.opts).size, 4, q.id); }
    if (q.type === "num") { assert.equal(typeof q.ans, "number"); assert.ok(q.tol >= 0); }
    if (q.type === "short") { assert.ok(q.accept.length && q.show); }
    if (q.type === "explain") { assert.ok(q.rubric.length >= 2 && q.need >= 1 && q.need <= q.rubric.length && q.model, q.id); }
  });
});
test("every mc correct answer is graded correct when its letter is said, after shuffling", () => {
  const rng = E.mulberry(3);
  B.QUESTIONS.filter(q => q.type === "mc").forEach(q => {
    const p = E.prepare(q, rng);
    const L = p.options[p.correctIndex].letter;
    assert.equal(E.matchChoice([L.toLowerCase()], p.options), p.correctIndex, q.id);
    assert.equal(E.matchChoice(["option " + L], p.options), p.correctIndex, q.id);
  });
});
test("every num / short / explain question accepts its own correct answer", () => {
  B.QUESTIONS.forEach(q => {
    if (q.type === "num") { assert.ok(E.gradeNum([String(q.ans)], q).correct, q.id); assert.ok(!E.gradeNum([String(q.ans * 3 + 17)], q).correct, q.id + " wrong"); }
    if (q.type === "short") q.accept.forEach(a => assert.ok(E.gradeShort([a], q).correct, q.id + " " + a));
    if (q.type === "explain") { const kw = q.rubric.map(c => c[1].replace("*", "")).join(" "); assert.ok(E.gradeExplain(kw, q).correct, q.id + " kw: " + kw); assert.ok(!E.gradeExplain("banana", q).correct, q.id); }
  });
});
test("the model answers of explain questions pass their own rubric", () => {
  B.QUESTIONS.filter(q => q.type === "explain").forEach(q => assert.ok(E.gradeExplain(q.model, q).correct, q.id + ": " + q.model));
});
test("generators produce valid numeric questions that grade correctly", () => {
  const rng = E.mulberry(11);
  B.GENERATORS.forEach(g => {
    for (let i = 0; i < 60; i++) {
      const p = E.prepare(g, rng);
      assert.equal(p.type, "num"); assert.ok(Number.isFinite(p.ans), g.id); assert.ok(p.q.length > 10 && p.ex);
      assert.ok(E.gradeNum([String(p.ans)], p).correct, g.id + " " + p.q);
      assert.ok(!/NaN|undefined|null/.test(p.q + p.ex), g.id + p.q);
    }
  });
});
test("hand-checked numeric answers", () => {
  const byQ = (s) => B.QUESTIONS.find(q => q.q.indexOf(s) === 0);
  assert.equal(byQ("Cash is $50,000, receivables").ans, (50000 + 30000) / 50000);
  assert.equal(byQ("A machine costs $50,000, has").ans, (50000 - 5000) / 5);
  assert.equal(byQ("Receivables are $30,000 and annual").ans, 30000 / 600000 * 365 > 18 ? 18.25 : 0);
  assert.equal(byQ("Fixed costs are $10,000, price").ans, 10000 / (25 - 15));
  const z = 1.2 * 0.10 + 1.4 * 0.20 + 3.3 * 0.10 + 0.6 * 1.0 + 1.0 * 1.5;
  assert.ok(Math.abs(byQ("Use Z equals").ans - z) < 0.005);
  assert.equal(byQ("Quantity demanded is 100 minus 2 times price. Quantity supplied is 20 plus 2 times price. What is the equilibrium price").ans, 20);
});

/* ---------------- number parsing ---------------- */
test("parseNumbers", () => {
  const p = (s) => E.parseNumbers(s);
  assert.deepEqual(p("40 percent"), [40]); assert.deepEqual(p("forty percent"), [40]);
  assert.deepEqual(p("it is $240,000"), [240000]); assert.deepEqual(p("two hundred forty thousand"), [240000]);
  assert.deepEqual(p("one point five"), [1.5]); assert.deepEqual(p("1.6"), [1.6]); assert.deepEqual(p("two point eight three"), [2.83]);
  assert.deepEqual(p("2.5 million"), [2500000]); assert.deepEqual(p("240k"), [240000]); assert.deepEqual(p("fifteen hundred"), [1500]);
  assert.deepEqual(p("a hundred and twenty"), [120]); assert.deepEqual(p("minus ten thousand"), [-10000]); assert.deepEqual(p("-5"), [-5]);
  assert.deepEqual(p("twenty five"), [25]); assert.deepEqual(p("point five"), [0.5]); assert.deepEqual(p("nine times"), [9]);
  assert.deepEqual(p("no numbers here"), []);
});
test("gradeNum tolerances and percent as decimal", () => {
  const q = { ans: 40, tol: 0.5, pct: true };
  assert.ok(E.gradeNum(["forty percent"], q).correct); assert.ok(E.gradeNum(["0.4"], q).correct); assert.ok(!E.gradeNum(["41"], q).correct);
  assert.ok(!E.gradeNum(["banana"], q).heard);
  assert.ok(E.gradeNum(["I think it's about 18 days"], { ans: 18.25, tol: 0.6 }).correct);
  assert.ok(E.gradeNum(["maybe 20", "2000"], { ans: 2000, tol: 0 }).correct, "any alternative may match");
});

/* ---------------- multiple choice matching ---------------- */
test("matchChoice by letter, homophone, cue and option text", () => {
  const opts = [{ text: "A surplus" }, { text: "A shortage" }, { text: "No change" }, { text: "A price floor" }];
  const m = (s) => E.matchChoice(Array.isArray(s) ? s : [s], opts);
  assert.equal(m("b"), 1); assert.equal(m("bee"), 1); assert.equal(m("see"), 2); assert.equal(m("dee"), 3);
  assert.equal(m("the answer is C"), 2); assert.equal(m("option d"), 3); assert.equal(m("letter a"), 0); assert.equal(m("second"), 1);
  assert.equal(m("a shortage"), 1, "text match beats article a"); assert.equal(m("a surplus"), 0); assert.equal(m("no change"), 2);
  assert.equal(m("banana"), -1); assert.equal(m("hmm"), -1);
  assert.equal(m(["be", "b"]), 1);
});
test("matchChoice distinguishes similar options", () => {
  const opts = [{ text: "Both choose Low" }, { text: "Both choose High" }, { text: "One High, one Low" }, { text: "No equilibrium exists" }];
  assert.equal(E.matchChoice(["both choose low"], opts), 0); assert.equal(E.matchChoice(["both high"], opts), 1);
  assert.equal(E.matchChoice(["no equilibrium"], opts), 3);
});
test("short and explain grading", () => {
  assert.ok(E.gradeShort(["the balance sheet"], { accept: ["balance sheet"] }).correct);
  assert.ok(E.gradeShort(["accounts receivables"], { accept: ["accounts receivable"] }).correct);
  assert.ok(!E.gradeShort(["income statement"], { accept: ["balance sheet"] }).correct);
  const q = B.QUESTIONS.find(x => x.id === "cashflow-1");
  assert.ok(E.gradeExplain("operating and investing and financing", q).correct);
  const g = E.gradeExplain("operating and financing", q); assert.ok(!g.correct); assert.deepEqual(g.missed, ["investing"]);
});

/* ---------------- mute / unmute logic ---------------- */
test("isMuteCommand", () => {
  ["mute", "Mute.", "pause", "please pause", "mute tutor", "hold on", "be quiet", "pause the tutor"].forEach(s => assert.ok(E.isMuteCommand([s]), s));
  ["", "the balance sheet is a photograph", "I would pause and think about the opportunity cost of the choice", "next", "resume tutor"].forEach(s => assert.ok(!E.isMuteCommand([s]), s));
});
test("keywordMatch default phrase and variants", () => {
  const k = (s, kw) => E.keywordMatch([s], kw || "resume tutor");
  assert.ok(k("resume tutor")); assert.ok(k("Resume Tutor.")); assert.ok(k("resume the tutor")); assert.ok(k("okay resume tutor please"));
  assert.ok(k("resume tudor")); assert.ok(k("resume tutors")); assert.ok(k("resumes tutor"));
  assert.ok(!k("resume")); assert.ok(!k("tutor")); assert.ok(!k("next question")); assert.ok(!k("mute")); assert.ok(!k("assume the tutor"), "assume != resume? close");
  assert.ok(k("let's go professor", "lets go professor")); assert.ok(!k("resume tutor", "lets go professor"));
  assert.ok(E.keywordMatch(["noise", "um resume tutor"], "resume tutor"), "any alternative");
});
test("MUTED: everything is ignored except the keyword; nothing is logged or spoken", () => {
  const { io, tu } = startAsked({ seed: 5 });
  const before = io.spoken.length, logN = tu.log.length;
  assert.equal(tu.heard(["mute"], true).action, "mute");
  assert.equal(tu.muted, true); assert.ok(io.cancels > 0, "speech cancelled");
  ["a", "b", "next", "skip", "stop", "repeat", "explain", "I was right", "forty percent", "help", "teach me balance sheet", "quiz me on economics", "how am I doing", "pause", "mute", "i don't know", "done", "slower"].forEach(s => {
    const r = tu.heard([s], true); assert.equal(r.action, "ignored-muted", s);
    tu.heard([s], false);
  });
  assert.equal(tu.log.length, logN); assert.equal(io.spoken.length, before, "no speech while muted"); assert.equal(tu.muted, true); assert.equal(tu.running, true);
  assert.equal(io.timerCount(), 0, "no timers (no auto advance) while muted");
  tu.heard(["resume tutor"], false); // interim also works
  assert.equal(tu.muted, false);
});
test("unmute keyword turns listening on; tutor says listening again then repeats the question", () => {
  const { io, tu } = startAsked({ seed: 5 });
  const qid = tu.cur.id; tu.heard(["pause"], true); assert.equal(tu.muted, true);
  const r = tu.heard(["um resume tutor"], true); assert.equal(r.action, "unmute"); assert.equal(tu.muted, false);
  assert.match(io.spoken[io.spoken.length - 1], /Listening again/);
  io.endSpeech(); assert.match(io.spoken[io.spoken.length - 1], /\S/); assert.equal(tu.cur.id, qid, "same question re-asked");
  assert.equal(tu.phase, "asking");
});
test("custom unmute keyword; the old one no longer works", () => {
  const { io, tu } = startAsked({ seed: 5 }); tu.setSetting("unmuteKeyword", "back to work");
  tu.heard(["mute"], true); assert.equal(tu.heard(["resume tutor"], true).action, "ignored-muted"); assert.ok(tu.muted);
  assert.equal(tu.heard(["ok back to work"], true).action, "unmute"); assert.ok(!tu.muted);
});
test("mute during speech cancels it and drops the pending callbacks (no auto advance)", () => {
  const { io, tu } = makeTutor({ seed: 2 });
  tu.start(); io.endSpeech(); // intro done -> question being spoken
  assert.ok(tu.speaking); const q1 = tu.cur.id;
  tu.heard(["mute"], false); // interim mute is honoured immediately
  assert.ok(tu.muted); assert.equal(tu.speaking, false);
  io.endSpeech(); io.fire(); assert.equal(tu.cur.id, q1); assert.equal(tu.log.length, 0);
});
test("mute during feedback prevents auto advance, unmute continues with a new question", () => {
  const { io, tu } = startAsked({ seed: 9 });
  tu.submitText("zzz"); // whatever, may not grade for mc; use tap instead
  const x = startAsked({ seed: 9 }); const t2 = x.tu;
  if (t2.cur.type === "mc") t2.tapChoice("A"); else t2.submitText("banana 12345");
  assert.equal(t2.phase, "feedback"); t2.heard(["mute"], true); x.io.endSpeech(); x.io.fire();
  assert.equal(t2.phase, "feedback", "frozen while muted"); const n = t2.log.length;
  t2.heard(["resume tutor"], true); x.io.endSpeech(); x.io.fire(); x.io.endSpeech();
  assert.equal(t2.muted, false); assert.equal(t2.phase, "asking"); assert.equal(t2.log.length, n);
});
test("while listening, the unmute keyword is not treated as an answer", () => {
  const { tu } = startAsked({ seed: 5 }); const n = tu.log.length;
  assert.equal(tu.heard(["resume tutor"], true).action, "ignored-unmute-while-listening"); assert.equal(tu.log.length, n);
});
test("echo filter", () => {
  assert.ok(E.isEcho("say mute", "You can say mute to pause me."));
  assert.ok(!E.isEcho("mute", "The balance sheet is a photograph."));
});

/* ---------------- commands ---------------- */
test("parseCommand coverage", () => {
  const c = (s) => { const r = E.parseCommand([s], B.TOPICS); return r && (r.cmd + (r.arg ? ":" + r.arg : "")); };
  const cases = { "repeat": "repeat", "Repeat that.": "repeat", "say that again": "repeat", "skip": "skip", "next": "next", "next question": "next", "explain": "explain", "stop": "stop", "end session": "stop",
    "back": "back", "go back": "back", "repeat that topic": "restarttopic", "start over": "restarttopic", "previous topic": "prevtopic", "next topic": "nexttopic",
    "slower": "slower", "slow down": "slower", "faster": "faster", "explain differently": "simpler", "explain simpler": "simpler", "simpler": "simpler", "say it simply": "simpler", "i don't understand": "simpler",
    "i don't know": "dontknow", "done": "done", "that's it": "done", "i was right": "right", "i was wrong": "wrong", "mark it correct": "right",
    "how am i doing": "dashboard", "help": "help", "what can I say": "help",
    "teach me balance sheet": "teach:balance", "teach me about opportunity cost": "teach:oppcost", "explain game theory": "teach:game", "teach me the prisoner's dilemma": "teach:game",
    "teach me margins": "teach:profit", "lesson on altman z score": "teach:altman", "teach me 10-k": "teach:tenk", "lesson mode": "teach",
    "quiz me": "quizme", "quiz me on economics": "focus:econ", "quiz me on accounting": "focus:acct", "quiz me on my weak areas": "focus:weak", "quiz me on everything": "focus:all", "quiz me on elasticity": "focus:elasticity", "practice sunk costs": "focus:sunk" };
  Object.keys(cases).forEach(k => assert.equal(c(k), cases[k], k));
  ["the answer is b", "a", "operating investing financing", "banana", "I think the balance sheet is the photograph on a single date"].forEach(s => assert.equal(c(s), null, s));
});
test("commands list is complete for the help screen", () => {
  const all = E.COMMANDS.map(c => c.say).join(" | ").toLowerCase();
  ["mute", "resume tutor", "repeat", "skip", "next", "explain", "simpler", "back", "repeat that topic", "previous topic", "next topic", "slower", "teach me", "quiz me", "how am i doing", "stop"].forEach(w => assert.ok(all.includes(w), w));
});

/* ---------------- quiz flow, logging, tutoring ---------------- */
test("correct answer is logged with full fields; wrong answer teaches and queues a follow-up", () => {
  const { io, tu } = startAsked({ seed: 21 });
  let guard = 0, sawMiss = false, sawHit = false;
  while ((!sawMiss || !sawHit) && guard++ < 60) {
    const p = tu.cur;
    if (tu.phase !== "asking") { settle(io, 3); continue; }
    const wantRight = !sawHit;
    if (p.type === "mc") { const right = p.options[p.correctIndex].letter; const wrong = p.options.find(o => !o.correct).letter; tu.tapChoice(wantRight ? right : wrong); }
    else if (p.type === "num") tu.submitText(String(wantRight ? p.ans : p.ans * 7 + 3));
    else if (p.type === "short") tu.submitText(wantRight ? p.accept[0] : "banana");
    else tu.submitText(wantRight ? p.rubric.map(c => c[1].replace("*", "")).join(" ") : "banana");
    const e = tu.log[tu.log.length - 1];
    if (e.correct) sawHit = true; else { sawMiss = true; const said = io.spoken[io.spoken.length - 1]; assert.match(said, /Not quite|No problem/); assert.match(said, /similar one/); assert.ok(said.length > 150, "includes an explanation/lesson"); assert.ok(tu.followups.length >= 0); }
    settle(io, 4);
  }
  assert.ok(sawMiss && sawHit);
  tu.log.forEach(e => { ["ts", "iso", "qid", "subj", "topic", "diff", "type", "qtext", "given", "correctAnswer", "source"].forEach(k => assert.ok(e[k] !== undefined && e[k] !== "", k)); assert.equal(typeof e.correct, "boolean"); });
  assert.deepEqual(JSON.parse(JSON.stringify(io.store.log)), JSON.parse(JSON.stringify(tu.log)), "persisted");
});
test("after a miss the next question is a same-topic variation", () => {
  const { io, tu } = startAsked({ seed: 4 });
  const p = tu.cur; const topic = p.topic;
  if (p.type === "mc") tu.tapChoice(p.options.find(o => !o.correct).letter); else tu.submitText("banana 999999");
  assert.equal(tu.log[0].correct, false); settle(io, 4);
  assert.equal(tu.cur.topic, topic); assert.notEqual(tu.cur.id, p.id); assert.equal(tu.curFollow, true);
  io.endSpeech(); tu.heard(["skip"], true); settle(io, 4); assert.equal(tu.log.length, 1, "skip does not log");
});
test("I don't know gives the answer and teaches; I was right overrides", () => {
  const { io, tu } = startAsked({ seed: 4 });
  tu.heard(["I don't know"], true); const e = tu.log[0]; assert.equal(e.correct, false); assert.match(io.spoken[io.spoken.length - 1], /No problem/);
  io.endSpeech(); tu.heard(["I was right"], true); assert.equal(tu.log[0].correct, true); assert.equal(tu.log[0].overridden, true);
  io.endSpeech(); tu.heard(["I was wrong"], true); assert.equal(tu.log[0].correct, false);
});
test("spoken answers are processed by voice for every question type (explain waits for silence)", () => {
  ["mc", "num", "short", "explain"].forEach((type, k) => {
    const { io, tu } = makeTutor({ seed: 1 + k, auto: true });
    tu.start(); const q = B.QUESTIONS.find(x => x.type === type);
    tu.cur = E.prepare(q, io.rng); tu.phase = "asking";
    const p = tu.cur;
    if (type === "mc") tu.heard([p.options[p.correctIndex].letter.toLowerCase()], true);
    else if (type === "num") tu.heard(["it is " + p.ans + " " + (p.unit || "")], true);
    else if (type === "short") tu.heard(["it is " + p.accept[0]], true);
    else { tu.heard([p.rubric.map(c => c[1].replace("*", "")).join(" ")], true); assert.equal(tu.log.length, 0, "explain waits for silence"); io.fire(); }
    assert.equal(tu.log.length, 1, type); assert.ok(tu.log[0].correct, type + " " + tu.log[0].given); assert.equal(tu.log[0].source, "voice");
  });
});
test("explain answer: saying done grades immediately; partial answers are marked incorrect with missed ideas spoken", () => {
  const { io, tu } = makeTutor({ seed: 1, auto: true });
  tu.start(); const q = B.QUESTIONS.find(x => x.id === "cashflow-1");
  tu.cur = E.prepare(q, io.rng); tu.phase = "asking"; tu.speaking = false;
  tu.heard(["operating and financing"], true); tu.heard(["done"], true);
  assert.equal(tu.log.length, 1); assert.equal(tu.log[0].correct, false); assert.match(io.spoken[io.spoken.length - 1], /missing: investing/);
});

/* ---------------- stats & adaptive selection ---------------- */
function entries(topic, subj, pattern, t0) { return pattern.split("").map((c, i) => ({ ts: t0 + i * 1000, iso: "", qid: topic + "-x" + i, subj, topic, diff: 2, type: "mc", correct: c === "1" })); }
test("topicStats is recency weighted", () => {
  const a = E.topicStats(entries("sd", "econ", "00001111", 1), B.TOPICS).sd, b = E.topicStats(entries("sd", "econ", "11110000", 1), B.TOPICS).sd;
  assert.equal(a.n, 8); assert.equal(a.rawAcc, 0.5); assert.ok(a.acc > b.acc + 0.2, a.acc + " vs " + b.acc);
  assert.equal(E.topicStats([], B.TOPICS).sd.status, "new");
  assert.equal(E.topicStats(entries("sd", "econ", "1111111", 1), B.TOPICS).sd.status, "strong");
  assert.equal(E.topicStats(entries("sd", "econ", "0001000", 1), B.TOPICS).sd.status, "weak");
  assert.equal(E.topicStats(entries("sd", "econ", "1110110", 1), B.TOPICS).sd.status, "ok");
});
test("adaptive selection strongly favors the weak topic", () => {
  const t0 = 1760000000000; let log = [];
  B.TOPICS.forEach(t => { log = log.concat(entries(t.key, t.subj, t.key === "game" ? "000100" : "111111", t0)); });
  const rng = E.mulberry(5), counts = {};
  for (let i = 0; i < 2000; i++) { const q = E.pickNext({ questions: B.QUESTIONS, generators: B.GENERATORS, log, now: t0 + 60000, rng, recent: [], topics: B.TOPICS }); counts[q.topic] = (counts[q.topic] || 0) + 1; }
  const others = Object.keys(counts).filter(k => k !== "game").map(k => counts[k]); const avg = others.reduce((a, b) => a + b, 0) / others.length;
  assert.ok(counts.game > avg * 2.5, "game " + counts.game + " vs avg " + avg);
});
test("unseen topics get a boost, focus filters work, recent questions are not repeated", () => {
  const rng = E.mulberry(8), t0 = 1760000000000;
  for (let i = 0; i < 300; i++) { assert.equal(E.pickNext({ questions: B.QUESTIONS, generators: B.GENERATORS, log: [], now: t0, rng, recent: [], topics: B.TOPICS, focus: { subj: "econ" } }).subj, "econ"); }
  for (let i = 0; i < 300; i++) { assert.equal(E.pickNext({ questions: B.QUESTIONS, generators: B.GENERATORS, log: [], now: t0, rng, recent: [], topics: B.TOPICS, focus: { topic: "altman" } }).topic, "altman"); }
  const recent = B.QUESTIONS.filter(q => q.topic === "sunk").slice(0, 6).map(q => q.id);
  for (let i = 0; i < 300; i++) { const q = E.pickNext({ questions: B.QUESTIONS, generators: B.GENERATORS, log: [], now: t0, rng, recent, topics: B.TOPICS, focus: { topic: "sunk" } }); assert.ok(!recent.includes(q.id)); }
});
test("weak focus only returns weak/new topics when some exist", () => {
  const t0 = 1760000000000; let log = [];
  B.TOPICS.forEach(t => { log = log.concat(entries(t.key, t.subj, (t.key === "elasticity" || t.key === "leverage") ? "000000" : "111111", t0)); });
  const rng = E.mulberry(2);
  for (let i = 0; i < 200; i++) { const q = E.pickNext({ questions: B.QUESTIONS, generators: B.GENERATORS, log, now: t0 + 1000, rng, recent: [], topics: B.TOPICS, focus: { weak: true } }); assert.ok(["elasticity", "leverage"].includes(q.topic), q.topic); }
});
test("spaced repetition: a missed question is due again immediately, a mastered one is deprioritised", () => {
  const t0 = 1760000000000, qa = "sd-1", qb = "sd-2";
  const log = [{ ts: t0, qid: qa, topic: "sd", subj: "econ", correct: false }, { ts: t0, qid: qb, topic: "sd", subj: "econ", correct: true }];
  const st = E.questionStates(log); assert.equal(st[qa].box, 0); assert.equal(st[qb].box, 1);
  const rng = E.mulberry(1), c = { a: 0, b: 0 };
  const pool = B.QUESTIONS.filter(q => q.id === qa || q.id === qb);
  for (let i = 0; i < 1000; i++) { const q = E.pickNext({ questions: pool, generators: [], log, now: t0 + 60000, rng, recent: [], topics: B.TOPICS }); if (q.id === qa) c.a++; else c.b++; }
  assert.ok(c.a > c.b * 2, JSON.stringify(c));
});
test("CSV export escapes properly and has a header", () => {
  const log = [{ iso: "2026-10-10T18:00:00.000Z", qid: "sd-1", subj: "econ", topic: "sd", diff: 1, type: "mc", qtext: 'He said, "hi"', given: "A: x", correctAnswer: "A: x", correct: true, overridden: false, source: "voice", followup: false }];
  const csv = E.toCSV(log); const lines = csv.trim().split("\r\n");
  assert.equal(lines[0].split(",")[0], "timestamp"); assert.match(lines[1], /"He said, ""hi"""/); assert.match(lines[1], /,correct,no,voice,no$/);
});

/* ---------------- lesson mode ---------------- */
test("lesson data is split into short segments for every script topic", () => {
  B.TOPICS.forEach(t => { if (t.key !== "failure") assert.ok(LD[t.key] && LD[t.key].length >= 1, t.key); });
  Object.values(LD).flat().forEach(s => assert.ok(s.length <= 460 && !/\[PAUSE\]/.test(s)));
  assert.ok(Object.values(LD).flat().length > 150);
  Object.values(LD).flat().forEach(s => assert.ok(!/^Question (one|two|three|four|five)/.test(s)));
});
function lessonTutor() {
  const x = makeTutor({ seed: 3 }); x.tu.start({ lesson: "balance" }); x.io.endSpeech(); return x;
}
test("lesson mode: segments advance automatically and navigation commands work", () => {
  const { io, tu } = lessonTutor(); const segs = LD.balance;
  assert.equal(tu.mode, "lesson"); assert.match(io.spoken[io.spoken.length - 1], /^Lesson: Balance sheet/); assert.ok(io.spoken[io.spoken.length - 1].includes(segs[0]));
  io.endSpeech(); io.fire(); assert.equal(tu.lesson.si, 1); assert.ok(io.spoken[io.spoken.length - 1].includes(segs[1]));
  io.endSpeech(); io.fire(); assert.equal(tu.lesson.si, 2);
  tu.heard(["back"], true); assert.equal(tu.lesson.si, 1); assert.ok(io.spoken[io.spoken.length - 1].includes(segs[1]));
  tu.heard(["repeat"], true); assert.equal(tu.lesson.si, 1); assert.ok(io.spoken[io.spoken.length - 1].includes(segs[1]));
  tu.heard(["next"], true); assert.equal(tu.lesson.si, 2);
  tu.heard(["repeat that topic"], true); assert.equal(tu.lesson.si, 0); assert.match(io.spoken[io.spoken.length - 1], /^Lesson: Balance sheet/);
  tu.heard(["next topic"], true); assert.equal(tu.lesson.ti, B.TOPICS.findIndex(t => t.key === "balance") + 1);
  tu.heard(["previous topic"], true); assert.equal(tu.topics[tu.lesson.ti].key, "balance");
});
test("lesson mode: back at the first segment goes to the previous topic; clamps at the ends", () => {
  const x = makeTutor({ seed: 3 }); x.tu.start({ lesson: "equation" }); x.io.endSpeech();
  x.tu.heard(["previous topic"], true); assert.equal(x.tu.topics[x.tu.lesson.ti].key, "equation"); assert.match(x.io.spoken[x.io.spoken.length - 1], /first topic/);
  const y = makeTutor({ seed: 3 }); y.tu.start({ lesson: "balance" }); y.io.endSpeech(); y.tu.heard(["back"], true); assert.equal(y.tu.topics[y.tu.lesson.ti].key, "equation");
});
test("lesson mode: slower changes the speaking rate and persists; faster raises it; limits hold", () => {
  const { io, tu } = lessonTutor(); const r0 = tu.settings.rate;
  tu.heard(["slower"], true); assert.ok(Math.abs(tu.settings.rate - (r0 - 0.1)) < 1e-9); assert.ok(Math.abs(io.store.settings.rate - tu.settings.rate) < 1e-9);
  for (let i = 0; i < 10; i++) tu.heard(["slower"], true); assert.ok(tu.settings.rate >= 0.5 - 1e-9);
  for (let i = 0; i < 20; i++) tu.heard(["faster"], true); assert.ok(tu.settings.rate <= 1.5 + 1e-9);
});
test("lesson mode: explain differently/simpler rotates variants and plays the simple text", () => {
  const { io, tu } = lessonTutor(); tu.heard(["explain simpler"], true); io.endSpeech();
  assert.equal(tu.lesson.variant, "simple"); assert.ok(io.spoken[io.spoken.length - 1].includes("Here is the simple version") || io.spoken[io.spoken.length - 1].includes(tu.topics.find(t => t.key === "balance").simple.slice(0, 40)));
  tu.heard(["explain differently"], true); io.endSpeech(); assert.equal(tu.lesson.variant, "summary");
  tu.heard(["explain differently"], true); io.endSpeech(); assert.equal(tu.lesson.variant, "simple");
});
test("lesson mode: end of topic announces and moves on after the gap; quiz me returns to questions on that topic", () => {
  const x = makeTutor({ seed: 3 }); x.tu.start({ lesson: "tenk" }); const n = LD.tenk.length;
  for (let i = 0; i < n + 1; i++) { x.io.endSpeech(); x.io.fire(); }
  assert.equal(x.tu.phase, "lessonEnd"); assert.match(x.io.spoken[x.io.spoken.length - 1], /end of Reading a (10-K|ten K)/);
  x.io.endSpeech(); x.io.fire(); assert.equal(x.tu.topics[x.tu.lesson.ti].key, "oppcost");
  x.tu.heard(["quiz me"], true); x.io.endSpeech(); assert.equal(x.tu.mode, "quiz"); assert.equal(x.tu.cur.topic, "oppcost");
});
test("mute works in lesson mode and resume continues the same segment", () => {
  const { io, tu } = lessonTutor(); io.endSpeech(); io.fire(); const si = tu.lesson.si, seg = tu.lessonSegs()[si];
  tu.heard(["mute"], true); io.endSpeech(); io.fire(); assert.equal(tu.lesson.si, si, "no advance while muted");
  tu.heard(["next"], true); assert.equal(tu.lesson.si, si, "ignored");
  tu.heard(["resume tutor"], true); io.endSpeech(); assert.ok(io.spoken[io.spoken.length - 1].includes(seg));
});
test("teach me X works from quiz mode, and explain/simpler work during a question without losing it", () => {
  const { io, tu } = startAsked({ seed: 6 }); const qid = tu.cur.id, tk = tu.cur.topic;
  tu.heard(["explain"], true); assert.ok(io.spoken[io.spoken.length - 1].includes(tu.topic(tk).lesson.slice(0, 50))); io.endSpeech();
  assert.equal(tu.cur.id, qid, "question kept"); assert.equal(tu.phase, "asking");
  tu.heard(["explain differently"], true); assert.ok(io.spoken[io.spoken.length - 1].includes("more simply")); io.endSpeech(); io.endSpeech();
  tu.heard(["teach me game theory"], true); assert.equal(tu.mode, "lesson"); assert.equal(tu.topics[tu.lesson.ti].key, "game");
});
test("repeat during feedback repeats the explanation; during a question repeats the question", () => {
  const { io, tu } = startAsked({ seed: 6 }); io.endSpeech();
  tu.heard(["repeat"], true); assert.equal(io.spoken[io.spoken.length - 1], E.spokenQuestion(tu.cur));
  tu.heard(["I don't know"], true); const fb = io.spoken[io.spoken.length - 1]; io.endSpeech(); tu.heard(["repeat"], true); assert.equal(io.spoken[io.spoken.length - 1], tu.lastFeedbackParts.map(E.partText).join(' ')); assert.equal(fb, io.spoken[io.spoken.length - 1]);
});
test("stop ends the session and speaks a summary; heard() afterwards is ignored", () => {
  const { io, tu } = startAsked({ seed: 6 }); tu.heard(["stop"], true);
  assert.equal(tu.running, false); assert.match(io.spoken[io.spoken.length - 1], /Session ended/); assert.equal(tu.heard(["a"], true).action, "ignored-idle");
});
test("speakable cleans text for the voice", () => {
  assert.equal(E.speakable("E B I T / interest"), "E B I T divided by interest");
  assert.match(E.speakable("Item 1A and the 10-K"), /Item one A and the ten K/);
  assert.match(E.speakable("Cash is -$40,000"), /minus \$40,000/);
});

test("tap STOP works even while muted", () => {
  const { io, tu } = startAsked({ seed: 6 }); tu.heard(["mute"], true); tu.ui("next"); assert.equal(tu.muted, true); tu.ui("stop"); assert.equal(tu.running, false);
});
test("fuzz: thousands of random utterances never throw; nothing is logged while muted; log only grows via answers", () => {
  const { io, tu } = makeTutor({ seed: 99, auto: true });
  const rng = E.mulberry(1234); tu.start();
  const words = ["a", "b", "c", "d", "mute", "pause", "resume tutor", "next", "skip", "repeat", "explain", "explain differently", "back", "slower", "faster", "stop", "banana", "forty", "12", "balance sheet", "i don't know", "done", "i was right", "i was wrong", "teach me game theory", "quiz me on economics", "previous topic", "next topic", "repeat that topic", "help", "how am i doing", "quiz me", "", "  "];
  for (let i = 0; i < 4000; i++) {
    const w = words[Math.floor(rng() * words.length)], fin = rng() < 0.8, wasMuted = tu.muted, n = tu.log.length;
    if (!tu.running) tu.start();
    tu.heard([w, w + " x"], fin);
    if (wasMuted && !/resume tutor/.test(w)) assert.equal(tu.log.length, n, "logged while muted: " + w);
    if (rng() < 0.3) io.fire();
    if (rng() < 0.05 && tu.phase === "asking" && tu.cur.type === "mc") tu.tapChoice("ABCD"[Math.floor(rng() * 4)]);
  }
  assert.ok(tu.log.length > 20);
  const st = E.topicStats(tu.log, B.TOPICS); Object.values(st).forEach(s => assert.ok(s.acc >= 0 && s.acc <= 1));
});

/* ======================= v2: real audio playback state machine, mute, manifest ======================= */
const fs = require("fs"), path = require("path");
function lessonStarted(opts) { const x = makeTutor(Object.assign({ seed: 4, store: { settings: { schema: 2, introCount: 5 } } }, opts)); x.tu.start({ lesson: "balance" }); x.io.endSpeech(); return x; }

test("BUG REGRESSION: a failed/zero-length playback NEVER advances a lesson; it stops, shows the red message, and waits", () => {
  const { io, tu } = lessonStarted();
  assert.equal(tu.mode, "lesson"); assert.equal(tu.lesson.si, 0); assert.ok(tu.speaking);
  io.failSpeech("clip ended without really playing");
  assert.equal(tu.speaking, false); assert.equal(tu.lesson.si, 0, "did not advance");
  assert.match(tu.audioError, /without really playing/); assert.match(tu.message, /couldn't play sound.*TEST SOUND/);
  assert.equal(io.timerCount(), 0, "no timer that could advance the lesson");
  for (let i = 0; i < 20; i++) { io.fire(); io.endSpeech(); }
  assert.equal(tu.lesson.si, 0, "still waiting after any amount of time");
  assert.equal(tu.snapshot().audioError.length > 0, true);
});
test("after a failure, Repeat tries the same part again and a success clears the error and carries on", () => {
  const { io, tu } = lessonStarted(); io.failSpeech("x");
  tu.heard(["repeat"], true); assert.equal(tu.audioError, ""); assert.ok(tu.speaking); assert.equal(tu.lesson.si, 0);
  io.endSpeech(); assert.equal(io.timerCount(), 1, "now (and only now) the next part is scheduled"); io.fire(); assert.equal(tu.lesson.si, 1);
});
test("a question whose audio fails waits for the user (mic stays available), and a quiz answer after that still works", () => {
  const x = makeTutor({ seed: 3, store: { settings: { schema: 2, introCount: 5 } } }); x.tu.start(); x.io.endSpeech(); x.io.failSpeech("boom");
  assert.equal(x.tu.phase, "asking"); assert.equal(x.tu.speaking, false); assert.ok(x.tu.audioError);
  const q = x.tu.cur; if (q.type === "mc") x.tu.tapChoice("A"); else x.tu.heard(["12"], true);
  assert.equal(x.tu.log.length, 1);
});
test("audio failure during feedback does not auto-advance to the next question", () => {
  const x = makeTutor({ seed: 3, store: { settings: { schema: 2, introCount: 5 } } }); x.tu.start(); x.io.endSpeech(); x.io.endSpeech();
  if (x.tu.cur.type === "mc") x.tu.tapChoice("A"); else x.tu.heard(["12"], true);
  const qid = x.tu.cur.id; x.io.failSpeech("dead"); assert.equal(x.io.timerCount(), 0);
  for (let i = 0; i < 10; i++) x.io.fire(); assert.equal(x.tu.cur.id, qid);
});
test("lessons: auto-continue OFF waits for the user after a part genuinely finishes", () => {
  const { io, tu } = lessonStarted({ store: { settings: { schema: 2, introCount: 5, lessonAuto: false } } });
  io.endSpeech(); assert.equal(io.timerCount(), 0); assert.equal(tu.lesson.si, 0); assert.equal(tu.phase, "lessonWait");
  tu.heard(["next"], true); assert.equal(tu.lesson.si, 1);
});
test("lessons: auto-continue ON; the pause between parts is 0.6 s with listen-while-talking, 3 s (a listening window) without; shows part x of y", () => {
  const { io, tu } = lessonStarted(); const snap = tu.snapshot(); assert.ok(snap.lesson.count >= 2); assert.equal(snap.lesson.seg, 0);
  assert.equal(tu.lessonGap(), 600); tu.setSetting("bargeIn", false); assert.equal(tu.lessonGap(), 3000);
});
test("voice commands unavailable (mic network errors): no 3 s listening gap between parts, buttons still drive everything", () => {
  const { io, tu } = lessonStarted(); tu.setSetting("bargeIn", false); assert.equal(tu.lessonGap(), 3000);
  tu.voiceOff = true; assert.equal(tu.lessonGap(), 600);
  const si = tu.lesson.si; tu.ui("nextpart"); assert.equal(tu.lesson.si, si + 1); tu.ui("pauseaudio"); assert.equal(tu.audioPaused, true); tu.ui("pauseaudio"); assert.equal(tu.audioPaused, false);
});
test("PAUSE AUDIO button freezes the audio and any pending advance; RESUME carries on (also by voice)", () => {
  const { io, tu } = lessonStarted(); io.endSpeech(); assert.equal(io.timerCount(), 1);
  tu.ui("pauseaudio"); assert.ok(tu.audioPaused); assert.equal(io.paused, 1); assert.equal(io.timerCount(), 0, "advance timer frozen");
  assert.equal(tu.lesson.si, 0); tu.heard(["resume"], true); assert.equal(tu.audioPaused, false); assert.equal(tu.lesson.si, 1, "advance resumed");
  tu.ui("pauseaudio"); assert.equal(io.paused, 2); tu.ui("pauseaudio"); assert.equal(io.resumed, 1, "toggle resumes the audio where it was");
});
test("mute (voice, even interim) while a clip plays stops audio at once and nothing continues", () => {
  const { io, tu } = lessonStarted(); const c = io.cancels; assert.ok(tu.speaking);
  assert.equal(tu.heard(["mute"], false).action, "mute"); assert.ok(io.cancels > c); assert.equal(tu.speaking, false); assert.ok(tu.muted);
  io.endSpeech(); for (let i = 0; i < 5; i++) io.fire(); assert.equal(tu.lesson.si, 0);
});
test("tolerant mute: likely mis-hearings of mute and pause stop the tutor", () => {
  ["mute", "mood", "moot", "mutt", "pause", "paws", "paused", "mute please", "pause tutor", "ok mute", "hey pause", "muted"].forEach(w => {
    const { tu } = lessonStarted(); assert.equal(tu.heard([w], true).action, "mute", w); assert.ok(tu.muted, w);
  });
  ["the mood of the market is rising slowly today", "pause for two weeks and then restart", "unmute", "un mute", "on mute"].forEach(w => { const { tu } = lessonStarted(); assert.notEqual(tu.heard([w], true).action, "mute", w); });
});
test("tolerant unmute: keyword mis-hearings and plain 'unmute' bring it back", () => {
  ["resume tutor", "resume tudor", "re some tutor", "reasume tutor", "resumed tutor", "resume tutors", "unmute", "un mute", "on mute", "ok unmute please"].forEach(w => {
    const { tu } = lessonStarted(); tu.heard(["mute"], true); assert.equal(tu.heard([w], true).action, "unmute", w); assert.equal(tu.muted, false);
  });
  ["resume", "assume the tutor", "tutor", "next", "mute", "balance sheet"].forEach(w => { const { tu } = lessonStarted(); tu.heard(["mute"], true); assert.equal(tu.heard([w], true).action, "ignored-muted", w); });
  const { tu } = lessonStarted(); tu.setSetting("alsoUnmute", false); tu.heard(["mute"], true); assert.equal(tu.heard(["unmute"], true).action, "ignored-muted");
});
test("saying unmute while already listening is ignored (it is not a mute and not an answer)", () => {
  const { tu } = lessonStarted(); assert.equal(tu.heard(["unmute"], true).action, "ignored-unmute-while-listening"); assert.equal(tu.muted, false);
});
test("settings saved by v1 are migrated: custom keyword kept, playback speed reset to 1", () => {
  const { tu } = makeTutor({ store: { settings: { unmuteKeyword: "go go", bargeIn: true, rate: 0.95 } } });
  assert.equal(tu.settings.unmuteKeyword, "go go"); assert.equal(tu.settings.schema, 2); assert.equal(tu.settings.rate, 1);
});
test("clipKey is stable and distinct", () => {
  assert.equal(E.clipKey("Hello."), E.clipKey("Hello.")); assert.notEqual(E.clipKey("Hello."), E.clipKey("Hello")); assert.match(E.clipKey("x"), /^[0-9a-f]{16}$/);
});

const PLAN = require("../tools/build-audio-plan.js").collect();
test("audio plan: every fixed text the tutor can speak is planned (~1500 clips) and keys never collide", () => {
  assert.ok(PLAN.size > 1000, "plan size " + PLAN.size);
  assert.ok(E.SOUND_CLIPS.every(t => PLAN.get(E.clipKey(t)) === t));
});
test("PROPERTY: during random sessions every non-random clip the tutor speaks is in the audio plan (no silent gaps)", () => {
  const missing = new Set(); let spokenN = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const { io, tu } = makeTutor({ seed, auto: true, store: { settings: { schema: 2, introCount: seed % 3 * 2 } } });
    io.speak = (parts, cb) => { spokenN++; parts.forEach(p => { if (typeof p !== "string" && p.dyn) return; const t = E.partText(p); if (!PLAN.has(E.clipKey(t))) missing.add(t.slice(0, 80)); }); cb(true); };
    const rng = E.mulberry(seed * 77); tu.start(seed % 2 ? {} : { lesson: "ratios" });
    const words = ["a", "b", "c", "d", "mute", "resume tutor", "next", "skip", "repeat", "explain", "explain differently", "back", "slower", "faster", "banana", "forty", "12", "i don't know", "done", "i was right", "i was wrong", "teach me game theory", "teach me zzz", "quiz me on economics", "quiz me on my weak areas", "previous topic", "next topic", "repeat that topic", "help", "how am i doing", "quiz me", "pause", "unmute"];
    for (let i = 0; i < 1500; i++) {
      if (!tu.running) tu.start({});
      tu.heard([words[Math.floor(rng() * words.length)]], true); if (rng() < 0.5) io.fire();
      if (tu.phase === "asking" && tu.cur && rng() < 0.4) { if (tu.cur.type === "mc") tu.tapChoice("ABCD"[Math.floor(rng() * 4)]); else tu.submitText(["zero", "42", "profit and loss and cash", "x"][Math.floor(rng() * 4)]); }
      if (rng() < 0.1) tu.ui(["pauseaudio", "back", "nextpart", "simpler", "explain"][Math.floor(rng() * 5)]);
    }
  }
  assert.ok(spokenN > 2000); assert.deepEqual([...missing], []);
});
test("audio files: manifest matches the plan and every clip file exists (mp3, small)", () => {
  const root = path.join(__dirname, ".."); global.window = {}; require(path.join(root, "audio-manifest.js")); const man = global.window.AUDIO_MANIFEST.clips; delete global.window;
  let bytes = 0; PLAN.forEach((t, k) => { assert.ok(k in man, "manifest lacks " + t.slice(0, 60)); const f = path.join(root, "audio", k + ".mp3"); const st = fs.statSync(f); assert.ok(st.size > 500, f); bytes += st.size; assert.ok(man[k] > 0.3, "duration " + t); });
  assert.ok(bytes < 60 * 1024 * 1024, "total audio " + bytes);
});

/* ======================= v3: lesson progress, timing, topic jump ======================= */
test("lesson progress: a topic is ticked off only when its last part REALLY ends; failures and jumping away do not tick it", () => {
  const { io, tu } = lessonStarted();
  assert.deepEqual(Object.keys(tu.progress.done), []); assert.equal(tu.progress.last, "balance");
  const n = tu.lessonSegs().length;
  for (let i = 0; i < n - 1; i++) { io.endSpeech(); io.fire(); }
  assert.equal(tu.lesson.si, n - 1); assert.equal(tu.progress.done.balance, undefined, "not yet");
  io.failSpeech("dead"); assert.equal(tu.progress.done.balance, undefined, "failed last part: not done");
  tu.heard(["repeat"], true); io.endSpeech(); assert.equal(tu.phase, "lessonEnd"); assert.ok(tu.progress.done.balance, "ticked");
  assert.ok(tu.snapshot().lessonProgress.done.includes("balance"));
});
test("lesson progress persists across restarts and can be cleared; jumping to any topic works (teach)", () => {
  const x = lessonStarted(); x.tu.lessonEnd(); const store = x.io.store;
  const y = makeTutor({ store: JSON.parse(JSON.stringify(store)) }); assert.ok(y.tu.progress.done.balance); assert.equal(y.tu.progress.last, "balance");
  y.tu.start({ lesson: "balance" }); y.io.endSpeech(); y.tu.ui("teach", "elasticity"); assert.equal(y.tu.topics[y.tu.lesson.ti].key, "elasticity"); assert.equal(y.tu.lesson.si, 0); assert.equal(y.tu.progress.last, "elasticity");
  y.tu.resetLessonProgress(); assert.deepEqual(Object.keys(y.tu.progress.done), []);
});
test("lesson timing: part and topic durations come from the clip durations the io provides", () => {
  const x = makeTutor({ seed: 4, store: { settings: { schema: 2, introCount: 5 } } }); x.io.clipDuration = t => t.length / 15;
  const tu = new E.Tutor(x.io, { topics: B.TOPICS, questions: B.QUESTIONS, generators: B.GENERATORS, lessons: LD, subjects: B.SUBJECTS });
  const plan = tu.plan(); assert.equal(plan.topicSecs.length, B.TOPICS.length); assert.ok(plan.total > 600, "total " + plan.total);
  tu.running = true; tu.startLesson("balance"); const L = tu.snapshot().lesson; assert.equal(L.partSecs.length, L.count); assert.ok(L.partSecs.every(s => s > 0)); assert.ok(L.titleSecs > 0);
  const topicSum = L.partSecs.reduce((a, b) => a + b, 0) + L.titleSecs; assert.ok(Math.abs(topicSum - plan.topicSecs[tu.lesson.ti]) < 0.01);
});
