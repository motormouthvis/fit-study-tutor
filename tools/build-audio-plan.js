// Enumerates EVERY piece of text the tutor can speak from fixed content (not the randomly generated
// number problems), by driving the real Tutor with a recording io. Writes tools/audio-plan.json {key: text}.
// The same engine code builds the clips at runtime, so the clip texts always match what the app asks for.
const fs = require("fs"), path = require("path");
const E = require("../engine.js"), B = require("../questions.js"), LD = require("../lessons-data.js");

function collect() {
  const rec = new Map();
  const add = (parts) => parts.forEach(p => { if (typeof p !== "string" && p.dyn) return; const t = E.partText(p); const k = E.clipKey(t); if (rec.has(k) && rec.get(k) !== t) throw new Error("hash collision " + t); rec.set(k, t); });
  function mk(settings) {
    let t = 1760000000000, n = 0; const store = settings ? { settings } : {};
    const io = { speak(parts, cb) { add(parts); }, cancelSpeech() {}, setTimer() { return ++n; }, clearTimer() {}, now() { return t; }, rng: E.mulberry(11),
      load(k, d) { return k in store ? JSON.parse(JSON.stringify(store[k])) : d; }, save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); }, emit() {} };
    const tu = new E.Tutor(io, { topics: B.TOPICS, questions: B.QUESTIONS, generators: B.GENERATORS, lessons: LD, subjects: B.SUBJECTS });
    tu.running = true; return tu;
  }
  // lessons: every variant, every part (with and without the title lead), ends, explain
  const tu = mk();
  B.TOPICS.forEach((tp, ti) => ["script", "summary", "simple"].forEach(v => {
    tu.lesson = { ti, si: 0, variant: v }; tu.mode = "lesson";
    const segs = tu.lessonSegs();
    segs.forEach((_, si) => { tu.lesson.si = si; tu.playSegment(); tu.playSegment(true); });
    if (v === "script") { tu.lessonEnd(); }
    tu.lesson = { ti, si: 0, variant: v }; tu.explain(false); tu.explain(true);
    tu.mode = "quiz"; tu.lesson = null; tu.cur = { topic: tp.key }; tu.explainVariant = {}; tu.explain(true); tu.explain(false); tu.explain(false);
    tu.cur = null;
    tu.last = { entry: { topic: tp.key, correct: true } }; tu.override(false);
  }));
  tu.mode = "lesson"; tu.lesson = { ti: 0, si: 0, variant: "script" }; tu.lessonTopic(-1);
  tu.lesson = { ti: B.TOPICS.length - 1, si: 0, variant: "script" }; tu.lessonEnd(); tu.lessonTopic(1);
  // questions
  const rng = E.mulberry(5);
  const qs = B.QUESTIONS.concat(B.GENERATORS.map(g => g));
  B.QUESTIONS.concat(B.GENERATORS).forEach(q => {
    [false, true].forEach(follow => [0, 1, 2].forEach(variant => {
      const x = mk(); x.mode = "quiz";
      x.cur = E.prepare(q, rng); x.curFollow = follow; x.askedLead = false; x.phase = "asking"; x.fails = 0;
      x.askAgain();
      if (variant === 0) {
        if (x.cur.type === "mc") { x.handleAnswer(["zzzz qqqq"], "voice"); x.handleAnswer(["zzzz qqqq"], "voice"); }
        if (x.cur.type === "num") x.handleAnswer(["zzzz"], "voice");
        if (x.cur.type === "explain") { x.buffer = ""; x.gradeBuffer(true); }
      }
      const fuzzy = x.cur.type === "short" || x.cur.type === "explain";
      const detail = x.cur.type === "explain" ? { matched: ["a"], missed: ["b"], total: 2 } : null;
      x.settings.explainNotes = 0;
      x.submit(variant === 2 ? { correct: false, given: "I don't know", heard: "", fuzzy, detail } : { correct: variant === 1, given: "x", heard: "x", fuzzy, detail }, "voice");
    }));
  });
  // control / misc phrases
  [{ introCount: 0, alsoUnmute: true }, { introCount: 5, alsoUnmute: true }, { introCount: 0, alsoUnmute: false }].forEach(s => { const x = mk(Object.assign({ schema: 2 }, s)); x.start({}); });
  const x = mk(); x.mode = "quiz";
  x.speakHelp(); x.speakDashboard(); x.mute(); x.unmute();
  ["weak", "acct", "econ", "all"].concat(B.TOPICS.map(t => t.key)).forEach(a => x.setFocus(a));
  x.settings.rate = 1; x.changeRate(-0.1); x.changeRate(0.1); x.settings.rate = 0.5; x.changeRate(-0.1); x.settings.rate = 1.5; x.changeRate(0.1);
  x.runCommand({ cmd: "quizme" }); x.runCommand({ cmd: "teach", raw: "zzz" });
  x.last = null; x.override(true); x.override(false);
  x.last = { entry: { topic: B.TOPICS[0].key, correct: true } }; x.override(true); x.override(false);
  x.last = { entry: { topic: B.TOPICS[0].key, correct: false } }; x.override(false); x.override(true);
  add(E.PRAISE);
  x.cur = E.prepare(B.QUESTIONS[0], rng); x.phase = "asking"; x.skipQuestion();
  x.settings.autoAdvance = false; x.afterFeedback();
  x.session = { answered: 0, correct: 0 }; x.stop(); x.session = { answered: 3, correct: 2 }; x.stop();
  add(E.SOUND_CLIPS);
  return rec;
}
if (require.main === module) {
  const rec = collect(); const plan = {}; [...rec.keys()].sort().forEach(k => plan[k] = rec.get(k));
  fs.writeFileSync(path.join(__dirname, "audio-plan.json"), JSON.stringify(plan, null, 0));
  const chars = Object.values(plan).reduce((a, t) => a + t.length, 0);
  console.log(Object.keys(plan).length, "clips,", chars, "characters (~" + Math.round(chars / 15 / 60) + " min of speech)");
}
module.exports = { collect };
