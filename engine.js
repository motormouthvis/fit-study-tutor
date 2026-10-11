/* engine.js: all the logic (no DOM). Runs in the browser and in node for tests. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------- text helpers ---------------- */
  function clean(s) { return String(s == null ? "" : s).toLowerCase().replace(/['\u2019]/g, "").replace(/(\d),(?=\d{3}(\D|$))/g, "$1").replace(/%/g, " percent "); }
  function tokens(s) { return clean(s).match(/\d+(?:\.\d+)?|[a-z]+/g) || []; }
  function stem(w) {
    if (/^\d/.test(w)) return w;
    if (w.length > 4 && w.slice(-3) === "ies") return w.slice(0, -3) + "y";
    if (w.length > 4 && /(xes|ches|shes|sses)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && w.slice(-1) === "s" && w.slice(-2) !== "ss") return w.slice(0, -1);
    return w;
  }
  function lev(a, b) {
    var m = a.length, n = b.length, i, j, d = [];
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function asArray(a) { return (Array.isArray(a) ? a : [a]).filter(function (x) { return typeof x === "string" && x.trim(); }); }
  function shuffle(arr, rng) { var a = arr.slice(), i, j, t; for (i = a.length - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // keyword/phrase match with * prefix wildcard, on stemmed tokens
  function kwMatch(toks, kw) {
    var kws = clean(kw).match(/\d+(?:\.\d+)?\*?|[a-z]+\*?/g) || [], i, j, ok;
    if (!kws.length) return false;
    for (i = 0; i + kws.length <= toks.length; i++) {
      ok = true;
      for (j = 0; j < kws.length; j++) {
        var k = kws[j], t = toks[i + j];
        if (k.slice(-1) === "*") { if (t.indexOf(k.slice(0, -1)) !== 0) { ok = false; break; } }
        else if (stem(k) !== stem(t)) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  // make text friendly for the speech synthesizer
  function speakable(s) {
    return String(s)
      .replace(/-\$/g, "minus $").replace(/\u2212/g, "minus ")
      .replace(/\bE B I T\b/g, "E B I T").replace(/\bEBIT\b/g, "E B I T")
      .replace(/\bROE\b/g, "R O E").replace(/\bROA\b/g, "R O A").replace(/\bDSO\b/g, "D S O")
      .replace(/\b10-K\b/g, "ten K").replace(/\b10-Q\b/g, "ten Q").replace(/\bM D and A\b/g, "M D and A")
      .replace(/\bItem 1A\b/g, "Item one A").replace(/\bItem 7A\b/g, "Item seven A").replace(/\bItem 1\b/g, "Item one")
      .replace(/\bItem 7\b/g, "Item seven").replace(/\bItem 8\b/g, "Item eight")
      .replace(/\be\.g\./gi, "for example").replace(/\bvs\.?\b/gi, "versus")
      .replace(/ \/ /g, " divided by ").replace(/ = /g, " equals ").replace(/ \+ /g, " plus ").replace(/ \* /g, " times ")
      .replace(/ > /g, " greater than ").replace(/ < /g, " less than ")
      .replace(/\$\s?(\d[\d,]*(?:\.\d+)?)/g, "$$$1")
      .replace(/\s*&\s*/g, " and ")
      .replace(/\s+/g, " ").trim();
  }
  // stable key for a spoken text (same function builds the audio manifest and looks clips up in the browser)
  function clipKey(text) {
    var t = String(text), h1 = 0xdeadbeef ^ 17, h2 = 0x41c6ce57 ^ 17;
    for (var i = 0; i < t.length; i++) {
      var ch = t.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ("00000000" + (h2 >>> 0).toString(16)).slice(-8) + ("00000000" + (h1 >>> 0).toString(16)).slice(-8);
  }
  function chunkText(text, limit) {
    limit = limit || 300;
    var sents = String(text).split(/(?<=[.!?])\s+/), res = [], buf = "";
    sents.forEach(function (s) { if (buf && (buf.length + s.length + 1) > limit) { res.push(buf); buf = s; } else buf = (buf + " " + s).trim(); });
    if (buf) res.push(buf);
    return res;
  }

  /* ---------------- number parsing from speech ---------------- */
  var UNITS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var SCALES = { thousand: 1e3, million: 1e6, billion: 1e9 };
  function isNumWord(w) { return w in UNITS || w in TENS || w === "hundred" || w in SCALES; }
  function parseNumbers(text) {
    var t = clean(text).replace(/\$/g, " ");
    var tk = t.match(/-?\d+(?:\.\d+)?k?\b|[a-z]+/g) || [], out = [], i = 0, neg;
    while (i < tk.length) {
      var w = tk[i];
      neg = false;
      if ((w === "minus" || w === "negative") && i + 1 < tk.length && (/^\d/.test(tk[i + 1]) || isNumWord(tk[i + 1]) || tk[i + 1] === "point")) { neg = true; i++; w = tk[i]; }
      if (/^-?\d/.test(w)) {
        var v = parseFloat(w.replace(/k$/, "")); if (/k$/.test(w)) v *= 1000;
        var nx = tk[i + 1];
        if (nx === "hundred") { v *= 100; i++; nx = tk[i + 1]; }
        if (nx in SCALES) { v *= SCALES[nx]; i++; }
        out.push(neg ? -Math.abs(v) : v); i++; continue;
      }
      if (isNumWord(w) || (w === "a" && (tk[i + 1] === "hundred" || tk[i + 1] in SCALES)) || (w === "point" && tk[i + 1] in UNITS)) {
        var total = 0, cur = 0, seen = false, j = i;
        if (w === "a") { cur = 1; j++; seen = true; }
        while (j < tk.length) {
          var x = tk[j];
          if (x in UNITS && !(x === "oh" && !seen)) { cur += UNITS[x]; seen = true; }
          else if (x in TENS) { cur += TENS[x]; seen = true; }
          else if (x === "hundred") { cur = (cur || 1) * 100; seen = true; }
          else if (x in SCALES) { total += (cur || 1) * SCALES[x]; cur = 0; seen = true; }
          else if (x === "and" && seen && j + 1 < tk.length && isNumWord(tk[j + 1])) { /* skip */ }
          else break;
          j++;
        }
        var val = total + cur;
        if (tk[j] === "point") {
          var ds = "", k = j + 1;
          while (k < tk.length && tk[k] in UNITS && UNITS[tk[k]] < 10) { ds += UNITS[tk[k]]; k++; }
          if (/^\d+$/.test(tk[k] || "") && !ds) { ds = tk[k]; k++; }
          if (ds) { val = val + parseFloat("0." + ds); j = k; seen = true; }
        }
        if (seen) { out.push(neg ? -val : val); }
        i = Math.max(j, i + 1); continue;
      }
      i++;
    }
    return out;
  }

  /* ---------------- grading ---------------- */
  var LETTERS = { a: "A", eh: "A", ay: "A", hey: "A", b: "B", be: "B", bee: "B", bea: "B", c: "C", see: "C", sea: "C", cee: "C", si: "C", d: "D", dee: "D", de: "D",
    first: "A", second: "B", third: "C", fourth: "D" };
  var CUE = { option: 1, letter: 1, choice: 1, answer: 1, number: 1 };
  var FILL = { the: 1, answer: 1, is: 1, option: 1, letter: 1, choice: 1, number: 1, its: 1, i: 1, say: 1, think: 1, pick: 1, choose: 1, would: 1, go: 1, with: 1, final: 1, my: 1, ill: 1, lets: 1, it: 1, should: 1, be: 0, please: 1, uh: 1, um: 1, thats: 1 };
  var STOP = { the: 1, a: 1, an: 1, of: 1, to: 1, and: 1, in: 1, is: 1, are: 1, for: 1, on: 1, by: 1, it: 1, its: 1, that: 1, this: 1, with: 1, as: 1, at: 1, or: 1, be: 1, than: 1, from: 1 };
  var DIGITS = { "1": "A", "2": "B", "3": "C", "4": "D" };

  function matchChoice(alts, options) {
    var texts = options.map(function (o) { return o.text; }), best = -1;
    alts = asArray(alts);
    for (var ai = 0; ai < alts.length; ai++) {
      var raw = tokens(alts[ai]), hasCue = raw.some(function (t) { return CUE[t]; });
      var tk = raw.filter(function (t) { return !FILL[t]; });
      // 1. cue or single token letter
      var letters = tk.filter(function (t) { return LETTERS[t] || (hasCue && DIGITS[t]); });
      if (tk.length === 1 && letters.length === 1) return idxOf(LETTERS[tk[0]] || DIGITS[tk[0]]);
      if (hasCue && tk.length <= 2 && letters.length === 1) return idxOf(LETTERS[letters[0]] || DIGITS[letters[0]]);
      // 2. option text overlap
      var set = {}; raw.forEach(function (t) { set[stem(t)] = 1; });
      var scores = texts.map(function (tx) {
        var cw = tokens(tx).filter(function (t) { return !STOP[t]; }).map(stem); if (!cw.length) return 0;
        var m = 0; cw.forEach(function (w) { if (set[w]) m++; }); return m / cw.length;
      });
      var order = scores.map(function (s, i) { return [s, i]; }).sort(function (x, y) { return y[0] - x[0]; });
      if (order[0][0] >= 0.6 && order[0][0] - order[1][0] >= 0.25) return order[0][1];
      // 3. short utterance with exactly one letter-like token
      if (tk.length <= 3 && letters.length === 1) best = idxOf(LETTERS[letters[0]] || DIGITS[letters[0]]);
    }
    return best;
    function idxOf(L) { return "ABCD".indexOf(L); }
  }
  function gradeNum(alts, q) {
    var nums = []; asArray(alts).forEach(function (a) { nums = nums.concat(parseNumbers(a)); });
    if (!nums.length) return { heard: false };
    var tol = q.tol != null ? q.tol : 0, eps = Math.max(tol, Math.abs(q.ans) * 0.005, 1e-9), ok = false;
    nums.forEach(function (n) {
      if (Math.abs(n - q.ans) <= eps) ok = true;
      if (q.pct && Math.abs(n * 100 - q.ans) <= eps) ok = true;
      if (q.pct && Math.abs(n / 100 - q.ans) <= eps / 100 && n > 0 && n < 1 && false) ok = true;
    });
    return { heard: true, correct: ok, given: nums[0] };
  }
  function gradeShort(alts, q) {
    var ok = false;
    asArray(alts).forEach(function (a) { var tk = tokens(a); q.accept.forEach(function (k) { if (kwMatch(tk, k)) ok = true; }); });
    return { correct: ok, given: asArray(alts)[0] || "" };
  }
  function gradeExplain(text, q) {
    var tk = tokens(text), matched = [], missed = [];
    q.rubric.forEach(function (c) {
      var hit = c.slice(1).some(function (k) { return kwMatch(tk, k); });
      (hit ? matched : missed).push(c[0]);
    });
    var need = q.need || Math.ceil(q.rubric.length * 0.6);
    return { correct: matched.length >= need, matched: matched, missed: missed, need: need, total: q.rubric.length, given: text };
  }

  /* ---------------- voice command parsing ---------------- */
  // includes likely mis-hearings of "mute" and "pause"
  var MUTE_WORDS = { mute: 1, muted: 1, mutes: 1, moot: 1, mood: 1, mutt: 1, mewt: 1, pause: 1, paused: 1, pauses: 1, paws: 1, pawz: 1, quiet: 1, silence: 1, shush: 1 };
  function isUnmuteWord(a) {
    var tk = tokens(a);
    for (var i = 0; i < tk.length; i++) {
      if (/^(unmute|unmuted|unmuting|unmutes)$/.test(tk[i])) return true;
      if (/^(mute|muted|moot|mood)$/.test(tk[i]) && i > 0 && /^(un|on|an|in|and|um)$/.test(tk[i - 1]) && tk.length <= 3) return true;
    }
    return false;
  }
  function hasUnmuteWord(alts) { return asArray(alts).some(isUnmuteWord); }
  var CMD_FILL = { please: 1, tutor: 1, the: 1, now: 1, just: 1, ok: 1, okay: 1, hey: 1, can: 1, you: 1, could: 1 };
  function cmdTokens(s) { return tokens(s).filter(function (t) { return !CMD_FILL[t]; }); }
  var KW_FILL = { please: 1, the: 1, now: 1, just: 1, ok: 1, okay: 1, hey: 1, a: 1, my: 1, um: 1, uh: 1 };
  function kwTokens(s) { return tokens(s).filter(function (t) { return !KW_FILL[t]; }); }
  function isMuteCommand(alts) {
    return asArray(alts).some(function (a) {
      if (isUnmuteWord(a)) return false;
      var tk = cmdTokens(a); if (!tk.length || tk.length > 4) return false;
      var j = tk.join(" ");
      return tk.some(function (t) { return MUTE_WORDS[t]; }) || /^hold on$|^be quiet$|^shut up$|^wait a second$/.test(j);
    });
  }
  var KW_ALIAS = { tutor: ["tudor", "tooter", "tutors", "tutter", "tuter", "tooter", "tutorial", "teacher"], resume: ["resumed", "resumes", "reasume", "rezoom"] };
  function wordClose(k, t) {
    if (k === t) return true;
    if (KW_ALIAS[k] && KW_ALIAS[k].indexOf(t) >= 0) return true;
    var tol = k.length >= 9 ? 2 : (k.length >= 5 ? 1 : 0);
    return tol > 0 && lev(k, t) <= tol;
  }
  function keywordMatch(alts, keyword) {
    var kw = kwTokens(keyword); if (!kw.length) return false;
    var joinedKw = kw.join(""), jtol = joinedKw.length >= 5 ? Math.max(1, Math.floor(joinedKw.length * 0.15)) : 0;
    return asArray(alts).some(function (a) {
      var tk = kwTokens(a);
      for (var i = 0; i + kw.length <= tk.length; i++) {
        var ok = true;
        for (var j = 0; j < kw.length; j++) if (!wordClose(kw[j], tk[i + j])) { ok = false; break; }
        if (ok) return true;
      }
      // tolerant: compare with the words glued together ("re some tutor" ~ "resume tutor")
      if (kw.length > 1 && jtol) {
        for (var n = Math.max(1, kw.length - 1); n <= kw.length + 1; n++)
          for (var k = 0; k + n <= tk.length; k++)
            if (lev(joinedKw, tk.slice(k, k + n).join("")) <= jtol) return true;
      }
      return false;
    });
  }
  function isEcho(heard, spoken) {
    var h = tokens(heard).join(" "), s = tokens(spoken).join(" ");
    return !!h && !!s && (" " + s + " ").indexOf(" " + h + " ") >= 0;
  }

  function resolveTopic(text, topics) {
    var tk = tokens(text), best = null, bl = 0;
    topics.forEach(function (t) {
      (t.aliases.concat([t.name.toLowerCase()])).forEach(function (al) {
        if (al.length > bl && kwMatch(tk, al)) { best = t; bl = al.length; }
      });
    });
    return best;
  }

  // The master command list. Used for the help screen, spoken help and tests.
  var COMMANDS = [
    { say: "mute  /  pause", does: "I stop talking right away and ignore everything you say until you say your unmute phrase (default: resume tutor, or just unmute). Works while I am talking only if Listen-while-talking is on; otherwise tap the big MUTE button.", group: "Control" },
    { say: "resume tutor  /  unmute", does: "Unmute (the phrase can be changed in Settings). It is the only thing I listen for while muted.", group: "Control" },
    { say: "resume  /  play", does: "After you tap PAUSE AUDIO, carry on from the same spot.", group: "Control" },
    { say: "stop", does: "End the session.", group: "Control" },
    { say: "repeat", does: "Say the last question, explanation, or lesson part again.", group: "Quiz and lessons" },
    { say: "skip", does: "Skip this question (or this topic in lesson mode).", group: "Quiz" },
    { say: "next", does: "Go to the next question (or next part in a lesson).", group: "Quiz and lessons" },
    { say: "explain", does: "Hear the lesson for this topic.", group: "Quiz" },
    { say: "explain differently  /  simpler", does: "Hear the same idea again in plainer words. Say it again to rotate between versions.", group: "Quiz and lessons" },
    { say: "I don't know", does: "Gives up on the question, tells you the answer, and teaches it.", group: "Quiz" },
    { say: "done  /  that's it", does: "Finish a long spoken answer and grade it now.", group: "Quiz" },
    { say: "I was right  /  I was wrong", does: "Overrule my grade on the last answer.", group: "Quiz" },
    { say: "A, B, C or D", does: "Answer a multiple choice question. You can also say the answer itself.", group: "Quiz" },
    { say: "teach me [topic]", does: "Start lesson mode on a topic, for example: teach me balance sheet.", group: "Lessons" },
    { say: "back", does: "Lesson mode: go back one part.", group: "Lessons" },
    { say: "repeat that topic", does: "Lesson mode: start this topic over.", group: "Lessons" },
    { say: "previous topic  /  next topic", does: "Lesson mode: move between topics.", group: "Lessons" },
    { say: "slower  /  faster", does: "Change how fast I talk.", group: "Lessons" },
    { say: "quiz me  /  quiz me on [accounting, economics, my weak areas, or a topic]", does: "Back to questions, optionally focused.", group: "Quiz" },
    { say: "how am I doing", does: "I read out your score and weak spots.", group: "Quiz" },
    { say: "help", does: "I list what you can say.", group: "Control" }
  ];

  function parseCommand(alts, topics) {
    alts = asArray(alts);
    for (var i = 0; i < alts.length; i++) {
      var tk = tokens(alts[i]).filter(function (t) { return !CMD_FILL[t] || t === "can" && false; });
      if (!tk.length || tk.length > 9) continue;
      var t = tk.join(" "), m;
      if (/^(stop|end|quit|exit|end session|stop session|stop quiz|stop tutor|finish session)$/.test(t)) return { cmd: "stop" };
      if (/^(repeat that topic|repeat this topic|repeat topic|restart topic|restart that topic|restart this topic|start this topic over|start that topic over|start topic over|start over|from the top|replay that topic|replay this topic|replay topic|go to the beginning|beginning)$/.test(t)) return { cmd: "restarttopic" };
      if (/^(previous topic|last topic|prior topic|go to the previous topic|back one topic|back a topic|go back a topic|go back one topic|previous lesson)$/.test(t)) return { cmd: "prevtopic" };
      if (/^(next topic|skip topic|skip this topic|go to the next topic|next lesson|go to next topic)$/.test(t)) return { cmd: "nexttopic" };
      if (/^(repeat|repeat that|repeat it|repeat question|repeat the question|repeat this|say that again|say it again|again|one more time|come again|what was that|say again|replay)$/.test(t)) return { cmd: "repeat" };
      if (/^(back|go back|back up|previous|previous one|previous part|go back a bit|rewind|last part|go back a little)$/.test(t)) return { cmd: "back" };
      if (/^(resume|play|play it|unpause|resume lesson|resume audio|play audio|continue playing|keep playing)$/.test(t)) return { cmd: "resumeaudio" };
      if (/^(next|next one|next question|next part|go on|continue|move on|keep going|carry on)$/.test(t)) return { cmd: "next" };
      if (/^(skip|skip it|skip this|skip question|skip this question|pass)$/.test(t)) return { cmd: "skip" };
      if (/^(explain differently|explain it differently|explain that differently|explain this differently|explain simpler|explain it simpler|explain that simpler|explain simply|explain more simply|explain it simply|explain that simply|explain again differently|explain in a different way|explain another way|explain in plain english|explain in simple terms|simpler|more simply|say it differently|say it simply|say it another way|in plain english|differently|make it simpler|simplify|simplify it|dumb it down|i dont understand|i dont get it|i do not understand|im confused|i am confused|say it in plain english|another way|simple version|simple)$/.test(t)) return { cmd: "simpler" };
      if (/^(explain|explain it|explain that|explain this|explain the answer|why|teach me this|explain more|tell me more)$/.test(t)) return { cmd: "explain" };
      if (/^(slower|slow down|speak slower|talk slower|slow it down|too fast|go slower)$/.test(t)) return { cmd: "slower" };
      if (/^(faster|speed up|speak faster|talk faster|too slow|go faster)$/.test(t)) return { cmd: "faster" };
      if (/^(i dont know|dont know|no idea|not sure|i give up|i have no idea|dunno|i do not know)$/.test(t)) return { cmd: "dontknow" };
      if (/^(done|im done|thats it|thats all|that is all|that is it|finished|im finished|finish|grade it|grade me|go ahead|thats my answer)$/.test(t)) return { cmd: "done", strong: /^(im done|finished|im finished|finish)$/.test(t) };
      if (/^(i was right|that was right|i got it right|i got that right|mark it right|mark it correct|mark that right|mark that correct|mark as correct|mark as right|mark it as correct|mark it as right|count it right|count it correct|count that right|count that correct|that was correct|i was correct|i was right about that)$/.test(t)) return { cmd: "right" };
      if (/^(i was wrong|that was wrong|i got it wrong|i got that wrong|mark it wrong|mark it incorrect|mark that wrong|mark as wrong|mark as incorrect|mark it as wrong|count it wrong|count that wrong|that was incorrect|i was incorrect|i was wrong about that)$/.test(t)) return { cmd: "wrong" };
      if (/^(how am i doing|how did i do|my score|score|my progress|progress|dashboard|status|my stats|where am i weak|what are my weak areas|weak areas|how are my scores)$/.test(t)) return { cmd: "dashboard" };
      if (/^(help|what can i say|what i say|commands|list commands|options|list the commands)$/.test(t)) return { cmd: "help" };
      if (/^(lesson mode|play lessons|start lessons|lessons|play lesson)$/.test(t)) return { cmd: "teach", arg: null };
      m = /^(?:teach me|tell me about|lesson on|lesson|review|explain|study|go over|play lesson on|play the lesson on)(?: about| on)? (.+)$/.exec(t);
      if (m) { var tp = resolveTopic(m[1], topics); if (tp) return { cmd: "teach", arg: tp.key }; if (!/^explain/.test(t)) return { cmd: "teach", arg: null, raw: m[1] }; }
      m = /^(?:quiz me|test me|practice|drill|focus|ask me|quiz)(?: on| in| about| with)?(?: my)?(.*)$/.exec(t);
      if (m) {
        var arg = m[1].trim();
        if (!arg) return { cmd: "quizme", arg: null };
        if (/^(weak|weak areas|weak topics|weak spots|weakest|weakest areas|what i miss|my weak areas|areas)$/.test(arg)) return { cmd: "focus", arg: "weak" };
        if (/^(everything|all|anything|mixed|random|all topics|both)$/.test(arg)) return { cmd: "focus", arg: "all" };
        if (/accounting|finance|business development/.test(arg) && !resolveTopic(arg, topics)) return { cmd: "focus", arg: "acct" };
        if (/^(economics|econ|managerial economics|economic)$/.test(arg)) return { cmd: "focus", arg: "econ" };
        var tp2 = resolveTopic(arg, topics); if (tp2) return { cmd: "focus", arg: tp2.key };
        if (/accounting|finance/.test(arg)) return { cmd: "focus", arg: "acct" };
        if (/econom/.test(arg)) return { cmd: "focus", arg: "econ" };
      }
    }
    return null;
  }

  /* ---------------- history, stats, adaptive selection ---------------- */
  var DAY = 86400000, MIN = 60000;
  var INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY];

  function questionStates(log) {
    var s = {};
    log.forEach(function (e) {
      var o = s[e.qid] || (s[e.qid] = { box: 0, attempts: 0, correct: 0, last: 0, lastCorrect: null });
      o.attempts++; if (e.correct) { o.correct++; o.box = Math.min(5, o.box + 1); } else o.box = 0;
      o.last = e.ts; o.lastCorrect = !!e.correct;
    });
    return s;
  }
  function topicStats(log, topics) {
    var by = {}, res = {};
    log.forEach(function (e) { (by[e.topic] || (by[e.topic] = [])).push(e); });
    topics.forEach(function (t) {
      var arr = by[t.key] || [], n = arr.length, recent = arr.slice(-25), sw = 0, sc = 0, k, w, correct = 0;
      for (k = 0; k < recent.length; k++) { w = Math.pow(0.85, recent.length - 1 - k); sw += w; if (recent[k].correct) sc += w; }
      arr.forEach(function (e) { if (e.correct) correct++; });
      var acc = (sc + 0.5) / (sw + 1);
      var status = n < 3 ? "new" : acc >= 0.8 ? "strong" : acc >= 0.6 ? "ok" : "weak";
      res[t.key] = { key: t.key, name: t.name, subj: t.subj, n: n, correct: correct, acc: acc, rawAcc: n ? correct / n : null, status: status, last: n ? arr[n - 1].ts : 0 };
    });
    return res;
  }
  function overall(log) {
    var n = log.length, c = log.filter(function (e) { return e.correct; }).length, bySubj = {};
    log.forEach(function (e) { var o = bySubj[e.subj] || (bySubj[e.subj] = { n: 0, c: 0 }); o.n++; if (e.correct) o.c++; });
    return { n: n, correct: c, acc: n ? c / n : null, bySubj: bySubj };
  }

  function candidatePool(questions, gens, focus) {
    var pool = questions.concat(gens);
    if (focus && focus.topic) pool = pool.filter(function (q) { return q.topic === focus.topic; });
    else if (focus && focus.subj) pool = pool.filter(function (q) { return q.subj === focus.subj; });
    return pool;
  }
  function weightFor(q, tstat, qstate, now) {
    var acc = tstat.n ? tstat.acc : 0.5;
    var tf = tstat.n === 0 ? 2.0 : 0.5 + 3 * (1 - acc);
    var due = !qstate || (now - qstate.last >= INTERVALS[qstate.box]);
    var df = due ? 1 : 0.25; if (qstate && !qstate.lastCorrect && qstate.attempts) df = 1.5;
    var nf = qstate ? 1 : 1.4;
    var target = acc < 0.5 ? 1 : acc < 0.8 ? 2 : 3;
    var ff = 1 / (1 + Math.abs(q.diff - target) * 0.5);
    return tf * df * nf * ff;
  }
  function pickNext(o) {
    var questions = o.questions, gens = o.generators || [], log = o.log, now = o.now, rng = o.rng, recent = o.recent || [], focus = o.focus || {};
    var topics = o.topics, ts = topicStats(log, topics), qs = questionStates(log);
    var pool = candidatePool(questions, gens, focus);
    if (focus.weak) {
      var weakKeys = topics.filter(function (t) { return ts[t.key].status === "weak" || ts[t.key].status === "new" || ts[t.key].acc < 0.7; }).map(function (t) { return t.key; });
      var wp = pool.filter(function (q) { return weakKeys.indexOf(q.topic) >= 0; });
      if (wp.length) pool = wp;
    }
    var excl = recent.slice(-6), cand = pool.filter(function (q) { return excl.indexOf(q.id) < 0; });
    if (cand.length < 2) { var l1 = recent.slice(-1); cand = pool.filter(function (q) { return l1.indexOf(q.id) < 0; }); if (!cand.length) cand = pool; }
    var ws = cand.map(function (q) { return weightFor(q, ts[q.topic], qs[q.id], now); });
    var sum = ws.reduce(function (a, b) { return a + b; }, 0), r = rng() * sum, i;
    for (i = 0; i < cand.length; i++) { r -= ws[i]; if (r <= 0) return cand[i]; }
    return cand[cand.length - 1];
  }
  function pickFollowup(o) {
    var q = o.missed, pool = o.questions.concat(o.generators || []).filter(function (x) { return x.topic === q.topic && x.id !== q.id && (o.recent || []).slice(-3).indexOf(x.id) < 0; });
    if (!pool.length) return null;
    var qs = questionStates(o.log);
    var sc = pool.map(function (x) { var st = qs[x.id]; return (x.diff <= q.diff ? 2 : 1) + (st ? (st.lastCorrect ? 0 : 1) : 1.5) + (x.type === q.type ? 0.5 : 0) + (x.make ? 0.3 : 0) + o.rng() * 0.8; });
    var bi = 0; sc.forEach(function (s, i) { if (s > sc[bi]) bi = i; });
    return pool[bi];
  }

  function prepare(q, rng) {
    var base = { id: q.id, subj: q.subj, topic: q.topic, diff: q.diff, type: q.type };
    if (q.make) {
      var inst = null, tries = 0;
      while (!inst && tries++ < 20) inst = q.make(rng);
      base.type = "num"; base.gen = true; base.q = inst.q; base.say = inst.say; base.ans = inst.ans; base.tol = inst.tol; base.pct = !!inst.pct; base.unit = inst.unit || ""; base.ex = inst.ex;
    } else {
      base.q = q.q; base.say = q.say; base.ex = q.ex;
      if (q.type === "mc") {
        var order = shuffle(q.opts.map(function (_, i) { return i; }), rng);
        base.options = order.map(function (oi, k) { return { letter: "ABCD"[k], text: q.opts[oi], correct: oi === 0 }; });
        base.correctIndex = base.options.findIndex(function (o) { return o.correct; });
      } else if (q.type === "num") { base.ans = q.ans; base.tol = q.tol; base.pct = q.pct; base.unit = q.unit; }
      else if (q.type === "short") { base.accept = q.accept; base.show = q.show; }
      else if (q.type === "explain") { base.rubric = q.rubric; base.need = q.need; base.model = q.model; }
    }
    return base;
  }
  // a question as an array of separately recorded clips (stem, then one clip per option letter + option text)
  function questionParts(p) {
    var dyn = !!p.gen;
    var parts = [{ t: speakable(p.say || p.q), dyn: dyn }];
    if (p.type === "mc") p.options.forEach(function (o) { parts.push("Option " + o.letter + ".", speakable(o.text)); });
    else if (p.type === "explain") parts.push("Take your time. Say done when you finish.");
    return parts;
  }
  function partText(x) { return typeof x === "string" ? x : x.t; }
  function spokenQuestion(p) { return questionParts(p).map(partText).join(" "); }
  function correctText(p) {
    if (p.type === "mc") { var o = p.options[p.correctIndex]; return o.letter + ": " + o.text; }
    if (p.type === "num") return String(p.ans) + (p.unit ? " " + p.unit : "");
    if (p.type === "short") return p.show || p.accept[0];
    return p.model;
  }

  function csvEscape(v) { v = v == null ? "" : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  var CSV_COLS = ["timestamp", "question_id", "subject", "topic", "difficulty", "type", "question", "your_answer", "correct_answer", "correct", "overridden", "source", "followup"];
  function toCSV(log) {
    var rows = [CSV_COLS.join(",")];
    log.forEach(function (e) {
      rows.push([e.iso, e.qid, e.subj, e.topic, e.diff, e.type, e.qtext, e.given, e.correctAnswer, e.correct ? "correct" : "incorrect", e.overridden ? "yes" : "no", e.source, e.followup ? "yes" : "no"].map(csvEscape).join(","));
    });
    return rows.join("\r\n") + "\r\n";
  }

  /* ---------------- the Tutor (session logic, no DOM) ---------------- */
  var DEFAULTS = { unmuteKeyword: "resume tutor", rate: 1, voiceURI: "", bargeIn: true, alsoUnmute: true, autoAdvance: true, lessonAuto: true, soundOk: false, schema: 2, wakeLock: true, fontScale: 1, muteMode: "keyword", introCount: 0, explainNotes: 0, explainWaitMs: 3500, lessonGapMs: 600, listenGapMs: 3000, topicGapMs: 7000 };
  var PRAISE = ["Correct.", "That's right.", "Yes.", "Good.", "Right."];
  var sp = speakable;
  function lessonChunks(tp, simple) { return chunkText(simple ? tp.simple : tp.lesson, 260).map(sp); }

  function Tutor(io, data) {
    this.io = io; this.topics = data.topics; this.questions = data.questions; this.generators = data.generators || []; this.lessonData = data.lessons || {};
    this.subjects = data.subjects || {};
    this.log = io.load("log", []);
    var saved = io.load("settings", {});
    this.settings = Object.assign({}, DEFAULTS, saved);
    // v1 saved a speech-synthesis speed (0.95); v2 uses it as audio playback speed, so reset it once
    if (!saved.schema || saved.schema < 2) { this.settings.rate = 1; this.settings.schema = 2; io.save("settings", this.settings); }
    this.running = false; this.muted = false; this.speaking = false; this.spokenNow = "";
    this.mode = "quiz"; this.phase = "idle"; this.cur = null; this.last = null; this.revealed = false;
    this.recent = []; this.followups = []; this.focus = {}; this.epoch = 0; this.timer = null; this.buffer = ""; this.fails = 0;
    this.session = { answered: 0, correct: 0 }; this.lastLessonAt = {}; this.explainVariant = {};
    this.lesson = null; this.repeatFn = null; this.message = ""; this.audioPaused = false; this.audioError = ""; this.held = null; this.timerFn = null;
  }
  var P = Tutor.prototype;
  P.topic = function (k) { for (var i = 0; i < this.topics.length; i++) if (this.topics[i].key === k) return this.topics[i]; return null; };
  P.saveSettings = function () { this.io.save("settings", this.settings); };
  P.setSetting = function (k, v) { this.settings[k] = v; this.saveSettings(); this.emit(); };
  P.saveLog = function () { this.io.save("log", this.log); };
  P.stats = function () { return topicStats(this.log, this.topics); };

  P.emit = function () { if (this.io.emit) this.io.emit(this.snapshot()); };
  P.snapshot = function () {
    var c = this.cur, pub = null;
    if (c) pub = { id: c.id, type: c.type, subj: c.subj, topic: c.topic, topicName: (this.topic(c.topic) || {}).name, diff: c.diff, q: c.q, unit: c.unit, options: c.options ? c.options.map(function (o) { return { letter: o.letter, text: o.text }; }) : null };
    var L = null;
    if (this.lesson) { var segs = this.lessonSegs(); L = { topic: this.topics[this.lesson.ti].key, name: this.topics[this.lesson.ti].name, seg: this.lesson.si, count: segs.length, variant: this.lesson.variant, text: segs[this.lesson.si] || "", ti: this.lesson.ti, tcount: this.topics.length }; }
    return { running: this.running, muted: this.muted, speaking: this.speaking, mode: this.mode, phase: this.phase, question: pub, last: this.last ? { correct: this.last.entry.correct, answer: this.last.entry.given, correctAnswer: this.last.entry.correctAnswer, ex: this.last.ex, fuzzy: this.last.fuzzy, detail: this.last.detail, overridden: !!this.last.entry.overridden } : null, lesson: L, session: this.session, focus: this.focus, message: this.message, audioPaused: this.audioPaused, audioError: this.audioError };
  };

  /* Speaking = playing a list of clips (strings, or {t, dyn, soft}). The io layer reports ok=false when
     playback really failed; then we STOP and wait (never advance on a failure). */
  P.say = function (parts, cb) {
    var self = this, e = this.epoch;
    if (!Array.isArray(parts)) parts = [parts];
    this.speaking = true; this.audioError = ""; this.spokenNow = parts.map(partText).join(" "); this.emit();
    this.io.speak(parts, function (ok, info) {
      if (e !== self.epoch) return;
      self.speaking = false; self.spokenNow = "";
      if (ok === false) { self.audioError = info || "playback failed"; self.message = "I couldn't play sound. Tap TEST SOUND."; self.emit(); return; }
      self.emit(); if (cb) cb();
    });
  };
  P.later = function (ms, fn) {
    var self = this, e = this.epoch; this.clearT();
    var run = function () { self.timer = null; self.timerFn = null; if (e !== self.epoch || self.muted || !self.running) return; if (self.audioPaused) { self.held = run; return; } fn(); };
    this.timerFn = run; this.timer = this.io.setTimer(run, ms);
  };
  P.clearT = function () { if (this.timer != null) { this.io.clearTimer(this.timer); this.timer = null; } this.timerFn = null; };
  P.hardStopSpeech = function () { this.epoch++; this.clearT(); this.held = null; this.audioPaused = false; this.io.cancelSpeech(); this.speaking = false; this.spokenNow = ""; };
  // tap-controlled pause: just freezes the audio where it is (the mic keeps listening for commands)
  P.pauseAudio = function () {
    if (!this.running || this.muted || this.audioPaused) return;
    this.audioPaused = true;
    if (this.timer != null) { var fn = this.timerFn; this.io.clearTimer(this.timer); this.timer = null; this.held = fn; }
    if (this.io.pauseAudio) this.io.pauseAudio();
    this.emit();
  };
  P.resumeAudio = function () {
    if (!this.audioPaused) return;
    this.audioPaused = false;
    var h = this.held; this.held = null;
    if (h) h(); else if (this.io.resumeAudio) this.io.resumeAudio();
    this.emit();
  };

  /* ------------- session control ------------- */
  P.start = function (opts) {
    opts = opts || {};
    this.running = true; this.muted = false; this.audioPaused = false; this.session = { answered: 0, correct: 0 }; this.epoch++; this.message = ""; this.audioError = "";
    if (opts.focus) this.focus = opts.focus;
    var self = this, kwp = { t: this.settings.unmuteKeyword, soft: true }, also = this.settings.alsoUnmute;
    var intro = this.settings.introCount < 2
      ? ["Hi Bill. I'll ask questions and listen for your answers. Say mute any time and I will stop talking and ignore everything you say. To bring me back, say", kwp, also ? "or just say unmute. Here we go." : "Here we go."]
      : ["Ready. Say mute to pause me, or", kwp, "to bring me back."];
    this.settings.introCount++; this.saveSettings();
    this.say(intro, function () { if (opts.lesson) self.startLesson(opts.lesson); else self.ask(); });
  };
  P.stop = function () {
    var n = this.session.answered, c = this.session.correct;
    this.hardStopSpeech(); this.running = false; this.muted = false; this.phase = "idle"; this.mode = "quiz"; this.lesson = null; this.buffer = "";
    this.emit();
    this.running = false;
    var parts = n ? ["Session ended.", { t: "You answered " + n + " question" + (n === 1 ? "" : "s") + " and got " + c + " right.", dyn: true, soft: true }, "Nice work."] : ["Session ended."];
    this.speakFinal(parts);
  };
  P.speakFinal = function (parts) { var self = this; this.io.speak(parts, function () { self.speaking = false; self.emit(); }); };
  P.mute = function () {
    if (this.muted) return;
    this.hardStopSpeech(); this.muted = true; this.buffer = ""; this.resumePhase = this.phase; this.emit();
  };
  P.unmute = function () {
    if (!this.muted) return;
    this.muted = false; this.epoch++; this.emit();
    var self = this;
    this.say(["Listening again."], function () { self.resume(); });
  };
  P.resume = function () {
    if (!this.running) return;
    if (this.mode === "lesson" && this.lesson) return this.playSegment();
    if (this.phase === "asking" && this.cur) return this.askAgain();
    return this.ask();
  };

  /* ------------- heard something ------------- */
  P.heard = function (alts, isFinal) {
    alts = asArray(alts);
    if (!alts.length) return { action: "none" };
    if (this.muted) {
      if (keywordMatch(alts, this.settings.unmuteKeyword) || (this.settings.alsoUnmute && hasUnmuteWord(alts))) { this.unmute(); return { action: "unmute" }; }
      return { action: "ignored-muted" };
    }
    if (!this.running) return { action: "ignored-idle" };
    if (isMuteCommand(alts)) { this.mute(); return { action: "mute" }; }
    if (keywordMatch(alts, this.settings.unmuteKeyword) && kwTokens(alts[0]).length <= kwTokens(this.settings.unmuteKeyword).length + 1) return { action: "ignored-unmute-while-listening" };
    if (this.settings.alsoUnmute && hasUnmuteWord(alts)) return { action: "ignored-unmute-while-listening" };
    if (!isFinal) return { action: "interim" };
    var cmd = parseCommand(alts, this.topics);
    if (cmd) { this.runCommand(cmd); return { action: "command", cmd: cmd.cmd }; }
    if (this.speaking) return { action: "ignored-while-speaking" };
    if (this.mode === "quiz" && this.phase === "asking" && this.cur) { this.handleAnswer(alts, "voice"); return { action: "answer" }; }
    return { action: "ignored" };
  };

  P.runCommand = function (c) {
    var self = this, lesson = this.mode === "lesson" && this.lesson;
    this.clearT();
    switch (c.cmd) {
      case "stop": return this.stop();
      case "repeat": return lesson ? this.playSegment() : this.repeatLast();
      case "back": return lesson ? this.lessonBack() : this.repeatLast();
      case "resumeaudio": if (this.audioPaused) return this.resumeAudio(); return this.resume();
      case "next": if (this.audioPaused) return this.resumeAudio(); return lesson ? this.lessonNext() : this.nextQuestion();
      case "skip": return lesson ? this.lessonTopic(1) : this.skipQuestion();
      case "restarttopic": return lesson ? this.lessonRestart() : this.startLesson(this.cur ? this.cur.topic : (this.last && this.last.entry.topic), "script");
      case "prevtopic": return lesson ? this.lessonTopic(-1) : this.startLesson(this.cur ? this.cur.topic : null, "script", -1);
      case "nexttopic": return lesson ? this.lessonTopic(1) : this.startLesson(this.cur ? this.cur.topic : null, "script", 1);
      case "explain": return this.explain(false);
      case "simpler": return this.explain(true);
      case "slower": return this.changeRate(-0.1);
      case "faster": return this.changeRate(0.1);
      case "dontknow": return this.mode === "quiz" && this.phase === "asking" && this.cur ? this.giveUp() : undefined;
      case "done": if (this.mode === "quiz" && this.phase === "asking" && this.cur && this.cur.type === "explain") return this.gradeBuffer(true);
        return c.strong ? this.stop() : undefined;
      case "right": return this.override(true);
      case "wrong": return this.override(false);
      case "dashboard": return this.speakDashboard();
      case "help": return this.speakHelp();
      case "teach": return c.arg ? this.startLesson(c.arg, "script") : (c.raw ? this.say(["I don't have a lesson with that name. Try balance sheet, ratios, opportunity cost, or game theory."], function () { self.resume(); }) : this.startLesson(null, "script"));
      case "quizme": var tk = this.lesson ? this.topics[this.lesson.ti].key : null; this.lesson = null; this.mode = "quiz"; this.focus = tk ? { topic: tk } : {}; this.forced = tk ? 3 : 0; return this.say(["Okay, questions."], function () { self.ask(); });
      case "focus": return this.setFocus(c.arg);
    }
  };

  P.setFocus = function (arg) {
    var self = this, f = {}, label = "everything";
    if (arg === "weak") { f = { weak: true }; label = "your weak areas"; }
    else if (arg === "acct" || arg === "econ") { f = { subj: arg }; label = arg === "acct" ? "accounting" : "economics"; }
    else if (arg !== "all") { f = { topic: arg }; label = (this.topic(arg) || {}).name || arg; }
    this.focus = f; this.lesson = null; this.mode = "quiz"; this.followups = [];
    this.say(["Okay. Quizzing you on", sp(label) + "."], function () { self.ask(); });
  };
  P.changeRate = function (d) {
    var r = Math.max(0.5, Math.min(1.5, Math.round((this.settings.rate + d) * 100) / 100)); this.settings.rate = r; this.saveSettings();
    var self = this, parts = [d < 0 ? "Slower." : "Faster."];
    if (r <= 0.5 || r >= 1.5) parts.push("That is as " + (d < 0 ? "slow" : "fast") + " as I go.");
    parts.push("How is this?");
    this.say(parts, function () { self.resume(); });
  };

  /* ------------- quiz flow ------------- */
  P.nextQuestionPick = function () {
    if (this.followups.length) { var f = this.followups.shift(); return { q: f, follow: true }; }
    var focus = this.focus;
    var clear = false;
    if (this.forced > 0) { this.forced--; if (this.forced === 0) clear = true; }
    var picked = { q: pickNext({ questions: this.questions, generators: this.generators, log: this.log, now: this.io.now(), rng: this.io.rng, recent: this.recent, focus: focus, topics: this.topics }), follow: false };
    if (clear) this.focus = {};
    return picked;
  };
  P.ask = function () {
    var pk = this.nextQuestionPick(), p = prepare(pk.q, this.io.rng);
    this.mode = "quiz"; this.lesson = null; this.cur = p; this.curFollow = pk.follow; this.phase = "asking"; this.buffer = ""; this.fails = 0; this.revealed = false; this.message = "";
    this.recent.push(pk.q.id); if (this.recent.length > 12) this.recent.shift();
    this.askAgain();
  };
  P.askAgain = function () {
    var p = this.cur, self = this; this.phase = "asking"; this.buffer = "";
    var lead = this.curFollow && !this.askedLead ? ["Here is a similar one."] : []; this.askedLead = this.curFollow;
    this.repeatFn = function () { self.say(questionParts(p), function () { self.emit(); }); };
    this.say(lead.concat(questionParts(p)), function () { self.emit(); });
  };
  P.repeatLast = function () {
    var self = this;
    if (this.phase === "asking" && this.cur) { this.phase = "asking"; this.buffer = ""; return this.say(questionParts(this.cur), function () { self.emit(); }); }
    if (this.lastFeedbackParts) return this.say(this.lastFeedbackParts, function () { self.afterFeedback(); });
    return this.ask();
  };
  P.nextQuestion = function () { this.ask(); };
  P.skipQuestion = function () {
    var self = this;
    if (this.phase === "asking") { this.say(["Skipping."], function () { self.ask(); }); } else this.ask();
  };
  P.giveUp = function () { this.submit({ correct: false, given: "I don't know", heard: "I don't know", fuzzy: false, detail: null }, "voice"); };

  P.handleAnswer = function (alts, source) {
    var q = this.cur, self = this, g;
    if (q.type === "mc") {
      var idx = matchChoice(alts, q.options);
      if (idx < 0) {
        this.fails++;
        var msg = ["I didn't catch that. Say A, B, C or D."];
        if (this.fails >= 2) { msg = ["Sorry, I still didn't get it."]; q.options.forEach(function (o) { msg.push("Option " + o.letter + ".", sp(o.text)); }); msg.push("Say A, B, C or D."); }
        return this.say(msg, function () { self.emit(); });
      }
      var o = q.options[idx];
      return this.submit({ correct: idx === q.correctIndex, given: o.letter + ": " + o.text, heard: alts[0], fuzzy: false }, source);
    }
    if (q.type === "num") {
      g = gradeNum(alts, q);
      if (!g.heard) { return this.say(["I didn't hear a number. Say it again, or say skip."], function () { self.emit(); }); }
      return this.submit({ correct: g.correct, given: String(g.given), heard: alts[0], fuzzy: false }, source);
    }
    if (q.type === "short") {
      g = gradeShort(alts, q);
      return this.submit({ correct: g.correct, given: g.given, heard: alts[0], fuzzy: true }, source);
    }
    // explain: accumulate speech, grade after a quiet moment
    this.buffer = (this.buffer + " " + alts[0]).trim(); this.emit();
    this.later(this.settings.explainWaitMs, function () { self.gradeBuffer(false); });
  };
  P.gradeBuffer = function (now) {
    var q = this.cur; this.clearT();
    if (!q || q.type !== "explain" || this.phase !== "asking") return;
    var text = this.buffer;
    if (tokens(text).length < 2) { var self = this; return this.say(["I didn't catch an answer. Try again, or say skip."], function () { self.emit(); }); }
    var g = gradeExplain(text, q);
    this.submit({ correct: g.correct, given: text, heard: text, fuzzy: true, detail: g }, "voice");
  };
  P.tapChoice = function (letter) {
    if (!this.running || this.muted || this.phase !== "asking" || !this.cur || this.cur.type !== "mc") return;
    this.hardStopSpeech();
    var idx = "ABCD".indexOf(letter), q = this.cur, o = q.options[idx]; if (!o) return;
    this.submit({ correct: idx === q.correctIndex, given: o.letter + ": " + o.text, heard: letter, fuzzy: false }, "tap");
  };
  P.submitText = function (text) {
    if (!this.running || this.phase !== "asking" || !this.cur) return;
    text = String(text || "").trim(); if (!text) return;
    this.hardStopSpeech();
    var q = this.cur;
    if (q.type === "explain") { this.buffer = text; return this.gradeBuffer(true); }
    this.handleAnswer([text], "type");
  };
  P.tapDontKnow = function () { if (this.phase === "asking" && this.cur) { this.hardStopSpeech(); this.giveUp(); } };
  P.tapGradeNow = function () { if (this.phase === "asking" && this.cur && this.cur.type === "explain") this.gradeBuffer(true); };

  P.submit = function (res, source) {
    var q = this.cur, self = this, now = this.io.now(), d = new Date(now);
    this.clearT(); this.hardStopSpeech();
    var entry = { ts: now, iso: d.toISOString(), qid: q.id, subj: q.subj, topic: q.topic, diff: q.diff, type: q.type, qtext: q.q, given: res.given, heard: res.heard, correctAnswer: correctText(q), correct: !!res.correct, overridden: false, source: source, followup: !!this.curFollow };
    this.log.push(entry); this.saveLog();
    this.session.answered++; if (entry.correct) this.session.correct++;
    this.last = { entry: entry, q: q, ex: q.ex, fuzzy: !!res.fuzzy, detail: res.detail || null };
    this.phase = "feedback"; this.revealed = true;
    var text = this.feedbackParts(q, res);
    this.lastFeedbackParts = text;
    if (!entry.correct) {
      var f = pickFollowup({ missed: { id: q.id, topic: q.topic, diff: q.diff, type: q.type }, questions: this.questions, generators: this.generators, log: this.log, recent: this.recent, rng: this.io.rng });
      if (f) this.followups.push(f);
    }
    this.say(text, function () { self.afterFeedback(); });
  };
  P.feedbackParts = function (q, res) {
    var parts = [], gen = !!q.gen;
    if (res.correct) {
      parts.push(PRAISE[Math.floor(this.io.rng() * PRAISE.length)]);
      parts.push({ t: sp(q.ex), dyn: gen });
    } else {
      parts.push(res.given === "I don't know" ? "No problem." : "Not quite.");
      if (q.type === "explain" && res.detail && res.detail.missed.length) parts.push({ t: "You were missing: " + res.detail.missed.join(", ") + ".", dyn: true, soft: true });
      if (q.type === "mc") { var o = q.options[q.correctIndex]; parts.push("The answer is", "Option " + o.letter + ".", sp(o.text)); }
      else parts.push({ t: "The answer is " + sp(correctText(q)) + ".", dyn: gen });
      parts.push({ t: sp(q.ex), dyn: gen });
      var tp = this.topic(q.topic), now = this.io.now();
      if (tp && !(this.lastLessonAt[tp.key] && now - this.lastLessonAt[tp.key] < 180000)) { parts.push("Let me teach that."); parts = parts.concat(lessonChunks(tp, false)); this.lastLessonAt[tp.key] = now; }
      parts.push("Let's try a similar one.");
    }
    if (res.fuzzy && this.settings.explainNotes < 3) { parts.push("I grade this kind of answer by keywords, so if I got it wrong, say: I was right."); this.settings.explainNotes++; this.saveSettings(); }
    return parts;
  };
  // plain-text version of the feedback (for tests / display)
  P.feedbackText = function (q, res) { return this.feedbackParts(q, res).map(partText).join(" "); };
  P.afterFeedback = function () {
    var self = this; this.phase = "between"; this.emit();
    if (this.settings.autoAdvance) this.later(900, function () { self.ask(); });
    else this.say(["Say next when you're ready."], function () { self.emit(); });
  };
  P.override = function (correct) {
    var self = this; if (!this.last) return this.say(["There is nothing to change yet."], function () { self.resume(); });
    var e = this.last.entry; this.hardStopSpeech();
    if (e.correct === correct) return this.say([correct ? "It's already marked right." : "It's already marked wrong."], function () { self.afterFeedback(); });
    e.correct = correct; e.overridden = true; this.saveLog();
    this.session.correct += correct ? 1 : -1;
    var txt = correct ? ["Okay, marked right. Good for you."] : ["Okay, marked wrong. Here is the idea."].concat(lessonChunks(this.topic(e.topic), false));
    this.emit(); this.say(txt, function () { self.afterFeedback(); });
  };

  /* ------------- explain / simpler ------------- */
  P.currentTopicKey = function () {
    if (this.lesson) return this.topics[this.lesson.ti].key;
    if (this.cur) return this.cur.topic;
    return this.last ? this.last.entry.topic : this.topics[0].key;
  };
  P.explain = function (simpler) {
    var self = this, key = this.currentTopicKey(), tp = this.topic(key);
    if (this.mode === "lesson" && this.lesson) {
      var v = this.lesson.variant, nv;
      if (simpler) nv = v === "simple" ? "summary" : "simple"; else nv = v === "script" ? "summary" : v === "summary" ? "simple" : "script";
      this.lesson.variant = nv; this.lesson.si = 0;
      return this.say([nv === "simple" ? "Here it is in simpler words." : nv === "summary" ? "Here is the short version." : "Here is the full version."], function () { self.playSegment(true); });
    }
    var last = this.explainVariant[key]; var useSimple = simpler ? true : (last === "lesson");
    this.explainVariant[key] = useSimple ? "simple" : "lesson";
    var parts = useSimple ? ["Let me say that more simply."].concat(lessonChunks(tp, true)) : lessonChunks(tp, false);
    this.say(parts, function () { self.afterExplain(); });
  };
  P.afterExplain = function () {
    if (this.phase === "asking" && this.cur) return this.askAgain();
    this.afterFeedback();
  };

  /* ------------- dashboard / help speech ------------- */
  P.speakDashboard = function () {
    var self = this, ov = overall(this.log);
    if (!ov.n) return this.say(["You haven't answered anything yet. Let's get started."], function () { self.resume(); });
    var ts = this.stats(), arr = Object.keys(ts).map(function (k) { return ts[k]; }).filter(function (t) { return t.n >= 2; }).sort(function (a, b) { return a.acc - b.acc; });
    var msg = "You have answered " + ov.n + " questions and " + Math.round(ov.acc * 100) + " percent are right overall. ";
    if (arr.length) { msg += "Weakest: " + arr.slice(0, 3).map(function (t) { return t.name + ", " + Math.round(t.acc * 100) + " percent"; }).join("; ") + ". ";
      var st = arr.slice().reverse().slice(0, 2); msg += "Strongest: " + st.map(function (t) { return t.name; }).join(" and ") + "."; }
    this.say([{ t: msg, dyn: true }], function () { self.resume(); });
  };
  P.speakHelp = function () {
    var self = this;
    this.say(["Here is what you can say. Mute or pause, and I go quiet until you say", { t: this.settings.unmuteKeyword, soft: true }, "or unmute. Repeat. Skip. Next. Explain. Explain differently, for a simpler version. I don't know. I was right, or I was wrong. Teach me, then a topic, to start a lesson. In a lesson, say back, repeat that topic, previous topic, next topic, slower, or faster. Say quiz me to go back to questions. Say stop to end."], function () { self.resume(); });
  };

  /* ------------- lesson mode ------------- */
  P.lessonSegs = function () {
    var L = this.lesson, tp = this.topics[L.ti];
    if (L.variant === "simple") return lessonChunks(tp, true);
    if (L.variant === "summary") return lessonChunks(tp, false);
    var d = this.lessonData[tp.key];
    return d && d.length ? d.map(sp) : lessonChunks(tp, false);
  };
  P.startLesson = function (key, variant, delta) {
    var ti = 0, self = this;
    if (key) { ti = this.topics.findIndex(function (t) { return t.key === key; }); if (ti < 0) ti = 0; }
    else if (this.last) ti = Math.max(0, this.topics.findIndex(function (t) { return t.key === self.last.entry.topic; }));
    if (delta) ti = Math.max(0, Math.min(this.topics.length - 1, ti + delta));
    this.hardStopSpeech(); this.mode = "lesson"; this.phase = "lesson"; this.cur = null;
    this.lesson = { ti: ti, si: 0, variant: variant || "script" };
    this.playSegment();
  };
  P.playSegment = function (noTitle) {
    var self = this, L = this.lesson; if (!L) return;
    var segs = this.lessonSegs(), tp = this.topics[L.ti], text = segs[L.si] || "";
    this.phase = "lesson"; this.mode = "lesson";
    var parts = [];
    if (L.si === 0 && !noTitle) parts.push(sp("Lesson: " + tp.name + (L.variant === "simple" ? ", the simpler version" : "") + "."));
    parts.push(text);
    this.repeatFn = function () { self.playSegment(); };
    this.say(parts, function () {
      // only reached after the audio REALLY finished (the io layer reports failures separately)
      if (L.si + 1 < segs.length) {
        if (self.settings.lessonAuto) self.later(self.lessonGap(), function () { L.si++; self.playSegment(); });
        else { self.phase = "lessonWait"; self.message = "Part finished. Say next, or tap NEXT."; self.emit(); }
      } else self.lessonEnd();
    });
  };
  P.lessonGap = function () { return this.settings.bargeIn ? this.settings.lessonGapMs : Math.max(this.settings.lessonGapMs, this.settings.listenGapMs); };
  P.lessonEnd = function () {
    var self = this, tp = this.topics[this.lesson.ti], last = this.lesson.ti >= this.topics.length - 1;
    this.phase = "lessonEnd";
    this.say([sp("That is the end of " + tp.name + "."), last ? "That was the last topic. Say quiz me, or repeat that topic." : "Say quiz me to practice it, or repeat that topic. Otherwise I will move on."], function () {
      if (!last && self.settings.lessonAuto) self.later(self.settings.topicGapMs, function () { self.lessonTopic(1); });
      else if (!last) { self.message = "Topic finished. Say next topic, or tap NEXT TOPIC."; self.emit(); }
    });
  };
  P.lessonNext = function () { var segs = this.lessonSegs(); if (this.lesson.si + 1 < segs.length) { this.lesson.si++; this.playSegment(); } else this.lessonTopic(1); };
  P.lessonBack = function () { if (this.lesson.si > 0) { this.lesson.si--; this.playSegment(); } else this.lessonTopic(-1); };
  P.lessonRestart = function () { this.lesson.si = 0; this.lesson.variant = "script"; this.playSegment(); };
  P.lessonTopic = function (d) {
    var self = this, ti = this.lesson.ti + d;
    if (ti < 0) return this.say(["This is the first topic."], function () { self.playSegment(); });
    if (ti >= this.topics.length) return this.say(["That was the last topic. Say quiz me, or previous topic."], function () { });
    this.hardStopSpeech(); this.lesson = { ti: ti, si: 0, variant: "script" }; this.playSegment();
  };
  // UI-driven lesson buttons
  P.ui = function (name, arg) {
    if (!this.running) return;
    if (this.muted && name !== "stop") return;
    if (name === "pauseaudio") return this.audioPaused ? this.resumeAudio() : this.pauseAudio();
    if (name === "resumeaudio") return this.resumeAudio();
    this.hardStopSpeech();
    var map = { back: "back", repeat: "repeat", restart: "restarttopic", prev: "prevtopic", next: "nexttopic", nextpart: "next", slower: "slower", faster: "faster", simpler: "simpler", explain: "explain", skip: "skip", quiz: "quizme", stop: "stop", dashboard: "dashboard", help: "help" };
    if (name === "teach") return this.startLesson(arg, "script");
    if (map[name]) this.runCommand({ cmd: map[name] });
  };

  var SOUND_CLIPS = ["[beep]", "Hi Bill. This is your study tutor. If you can hear my voice, tap Yes.", "Great. The sound is working."];
  return {
    SOUND_CLIPS: SOUND_CLIPS, PRAISE: PRAISE, DEFAULTS: DEFAULTS, COMMANDS: COMMANDS, Tutor: Tutor,
    tokens: tokens, stem: stem, lev: lev, kwMatch: kwMatch, speakable: speakable, chunkText: chunkText, mulberry: mulberry, shuffle: shuffle,
    parseNumbers: parseNumbers, matchChoice: matchChoice, gradeNum: gradeNum, gradeShort: gradeShort, gradeExplain: gradeExplain,
    isMuteCommand: isMuteCommand, keywordMatch: keywordMatch, isEcho: isEcho, parseCommand: parseCommand, resolveTopic: resolveTopic,
    questionStates: questionStates, topicStats: topicStats, overall: overall, pickNext: pickNext, pickFollowup: pickFollowup, prepare: prepare,
    spokenQuestion: spokenQuestion, questionParts: questionParts, partText: partText, clipKey: clipKey, lessonChunks: lessonChunks, isUnmuteWord: isUnmuteWord, hasUnmuteWord: hasUnmuteWord, correctText: correctText, toCSV: toCSV, INTERVALS: INTERVALS
  };
});
