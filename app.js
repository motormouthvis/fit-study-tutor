/* app.js: browser glue (speech, microphone, wake lock, screens). Logic lives in engine.js */
(function () {
  "use strict";
  var E = window.Engine, B = window.Bank, LD = window.LessonData;
  var $ = function (id) { return document.getElementById(id); };
  var LS = "tutor.v1.";

  /* ---------- storage ---------- */
  var storage = {
    load: function (k, d) { try { var v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    save: function (k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { showAlert("Could not save to this phone (storage full or blocked)."); } }
  };
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }

  /* ---------- text to speech ---------- */
  var synth = window.speechSynthesis, voices = [], ttsToken = 0, ttsWatch = null;
  function loadVoices() { if (!synth) return; voices = synth.getVoices() || []; fillVoiceSelect(); }
  if (synth) { loadVoices(); if (synth.addEventListener) synth.addEventListener("voiceschanged", loadVoices); }
  function pickVoice() {
    if (!voices.length) return null;
    var uri = tutor.settings.voiceURI, v = voices.filter(function (x) { return x.voiceURI === uri; })[0];
    if (v) return v;
    var en = voices.filter(function (x) { return /^en[-_]US/i.test(x.lang); });
    return en.filter(function (x) { return /google/i.test(x.name); })[0] || en[0] || voices.filter(function (x) { return /^en/i.test(x.lang); })[0] || null;
  }
  function speak(text, done) {
    var token = ++ttsToken, finished = false;
    function fin() { if (finished || token !== ttsToken) return; finished = true; clearTimeout(ttsWatch); setTimeout(function () { if (done) done(); }, 120); }
    if (!synth) { setTimeout(fin, Math.min(8000, text.length * 40)); return; }
    var parts = E.chunkText(text, 220), i = 0;
    var est = Math.max(2500, text.length * 85 / Math.max(0.5, tutor.settings.rate)) + 4000;
    clearTimeout(ttsWatch); ttsWatch = setTimeout(fin, est * 1.6);
    try { synth.cancel(); } catch (e) {}
    function next() {
      if (token !== ttsToken) return;
      if (i >= parts.length) return fin();
      var u = new SpeechSynthesisUtterance(parts[i++]);
      u.rate = tutor.settings.rate; u.lang = "en-US"; var v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; }
      u.onend = function () { next(); };
      u.onerror = function () { if (token === ttsToken) next(); };
      try { synth.speak(u); } catch (e) { fin(); }
    }
    setTimeout(next, 60);
  }
  function cancelSpeech() { ttsToken++; clearTimeout(ttsWatch); if (synth) { try { synth.cancel(); } catch (e) {} } }

  /* ---------- tutor ---------- */
  var io = {
    speak: speak, cancelSpeech: cancelSpeech,
    setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (id) { clearTimeout(id); },
    now: function () { return Date.now(); }, rng: Math.random,
    load: storage.load, save: storage.save, emit: function (s) { render(s); }
  };
  var tutor = new E.Tutor(io, { topics: B.TOPICS, questions: B.QUESTIONS, generators: B.GENERATORS, lessons: LD, subjects: B.SUBJECTS });
  window.__tutor = tutor; window.__E = E;

  /* ---------- microphone / speech recognition ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, recOn = false, consumed = false, micError = "", restartTimer = null, recentStarts = [], userMicOff = false, lastHeard = "";
  function shouldListen() {
    if (!SR || userMicOff || !tutor.running || micError === "fatal") return false;
    if (tutor.muted) return tutor.settings.muteMode !== "off";
    if (tutor.speaking && !tutor.settings.bargeIn) return false;
    return true;
  }
  function syncMic() {
    var want = shouldListen();
    if (want && !recOn && !restartTimer) startRec();
    if (!want && recOn) stopRec();
    updateBanner();
  }
  function startRec() {
    if (!SR) return;
    try {
      consumed = false; rec = new SR(); rec.lang = "en-US"; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 3;
      rec.onstart = function () { recOn = true; consumed = false; if (micError !== "fatal") micError = ""; updateBanner(); };
      rec.onresult = onResult;
      rec.onerror = function (ev) {
        var e = ev && ev.error;
        if (e === "not-allowed" || e === "service-not-allowed") { micError = "fatal"; showAlert("The microphone is blocked. Tap the lock icon in Chrome's address bar, allow Microphone for this site, then reload. You can still use the buttons."); }
        else if (e === "audio-capture") { micError = "fatal"; showAlert("No microphone found. You can still use the buttons."); }
        else if (e === "network") { micError = "network"; showAlert("Voice listening needs an internet connection. Use the buttons until you are back online."); }
        else if (e === "no-speech" || e === "aborted") { /* normal */ }
      };
      rec.onend = function () {
        recOn = false; rec = null; updateBanner();
        if (!shouldListen()) return;
        var now = Date.now(); recentStarts = recentStarts.filter(function (t) { return now - t < 6000; }); recentStarts.push(now);
        var delay = micError === "network" ? 3000 : (recentStarts.length > 12 ? 1500 : 220);
        restartTimer = setTimeout(function () { restartTimer = null; syncMic(); }, delay);
      };
      rec.start();
    } catch (e) { recOn = false; rec = null; restartTimer = setTimeout(function () { restartTimer = null; syncMic(); }, 1500); }
  }
  function stopRec() { try { if (rec) { rec.onend = null; rec.abort(); } } catch (e) {} rec = null; recOn = false; clearTimeout(restartTimer); restartTimer = null; updateBanner(); }
  function onResult(ev) {
    var res = ev.results[ev.results.length - 1]; if (!res) return;
    var alts = []; for (var i = 0; i < res.length; i++) if (res[i].transcript) alts.push(res[i].transcript);
    if (!alts.length) return;
    var isFinal = !!res.isFinal;
    if (consumed && isFinal) return;                         // rest of an utterance that already did something
    if (tutor.muted) { var r = tutor.heard(alts, isFinal); if (r.action === "unmute") { consumed = true; lastHeard = ""; } return; }   // never display or keep anything heard while muted
    if (tutor.speaking) {
      if (!tutor.settings.bargeIn) return;
      if (E.isEcho(alts[0], tutor.spokenNow)) return;        // that was probably me
    }
    lastHeard = alts[0]; showHeard(lastHeard);
    var out = tutor.heard(alts, isFinal);
    if (out.action === "mute" || out.action === "command" || out.action === "answer") consumed = true;
  }

  /* ---------- wake lock ---------- */
  var wake = null;
  function acquireWake() {
    if (!tutor.settings.wakeLock || !navigator.wakeLock || !tutor.running) return;
    navigator.wakeLock.request("screen").then(function (l) { wake = l; l.addEventListener("release", function () { wake = null; updateBanner(); }); updateBanner(); }).catch(function () {});
  }
  function releaseWake() { if (wake) { try { wake.release(); } catch (e) {} wake = null; } }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      if (tutor.running) { acquireWake(); syncMic(); if (hiddenWhileRunning) { showAlert("The screen was off or you switched apps, so Chrome paused the microphone. It is back on now. Keep the screen on during a session."); hiddenWhileRunning = false; } }
    } else if (tutor.running) hiddenWhileRunning = true;
  });
  var hiddenWhileRunning = false;

  /* ---------- rendering ---------- */
  var lastSnap = null;
  function render(s) {
    lastSnap = s || tutor.snapshot(); s = lastSnap;
    updateBanner();
    var running = s.running;
    $("startCard").hidden = running;
    $("ctrlCard").hidden = !running;
    var showQuiz = running && s.mode === "quiz" && s.question, showLesson = running && s.mode === "lesson" && s.lesson;
    $("quizCard").hidden = !showQuiz; $("lessonCard").hidden = !showLesson;
    if (showQuiz) renderQuiz(s);
    if (showLesson) { $("lName").textContent = s.lesson.name; $("lPart").textContent = "Part " + (s.lesson.seg + 1) + " of " + s.lesson.count; $("lVariant").textContent = s.lesson.variant === "simple" ? "Simple version" : s.lesson.variant === "summary" ? "Short version" : "Full lesson"; $("lText").textContent = s.lesson.text; }
    $("sessCount").textContent = s.session.answered; $("sessRight").textContent = s.session.correct;
    $("gymSub").textContent = s.muted ? 'Say "' + tutor.settings.unmuteKeyword + '" or tap the button' : (s.running ? "Say mute to pause" : "");
    renderGym(s);
    if (!s.running) releaseWake();
    syncMic();
    if (!$("tab-progress").hidden && $("tab-progress").classList.contains("active")) renderProgress();
  }
  function renderQuiz(s) {
    var q = s.question, st = s;
    $("qSubj").textContent = q.subj === "acct" ? "Accounting" : "Economics"; $("qTopic").textContent = q.topicName; $("qDiff").textContent = ["", "Easy", "Medium", "Hard"][q.diff];
    $("qText").textContent = q.q + (q.unit && q.type === "num" ? "  (answer in " + q.unit + ")" : "");
    var opts = $("qOpts"), fb = s.last && s.phase !== "asking" && lastQid === q.id ? s.last : null;
    if (renderedQ !== q.id + "|" + (s.phase === "asking")) {
      opts.innerHTML = "";
      if (q.type === "mc") q.options.forEach(function (o) {
        var b = document.createElement("button"); b.className = "opt"; b.dataset.letter = o.letter; b.innerHTML = "<b></b><span></span>"; b.firstChild.textContent = o.letter + "."; b.lastChild.textContent = o.text;
        b.addEventListener("click", function () { if (tutor.phase === "asking") tutor.tapChoice(o.letter); }); opts.appendChild(b);
      });
      renderedQ = q.id + "|" + (s.phase === "asking");
      if (s.phase === "asking") { $("qInput").value = ""; }
    }
    var asking = s.phase === "asking";
    $("qInputRow").hidden = !(q.type !== "mc" && asking);
    $("btnGradeNow").hidden = !(q.type === "explain" && asking);
    $("btnDontKnow").hidden = !asking; $("btnSkip").hidden = !asking;
    $("bufferLine").hidden = !(q.type === "explain" && asking && tutor.buffer);
    $("bufferLine").textContent = tutor.buffer ? "I heard: " + tutor.buffer : "";
    var f = $("feedback");
    if (!asking && s.last) {
      f.hidden = false; f.className = "feedback " + (s.last.correct ? "ok" : "bad");
      $("fbHead").textContent = s.last.correct ? "CORRECT" : "NOT QUITE"; $("fbHead").style.color = s.last.correct ? "var(--green)" : "var(--red)";
      $("fbBody").textContent = "You: " + (s.last.answer || "") + "   |   Answer: " + s.last.correctAnswer + "\n" + s.last.ex;
      $("fbBody").style.whiteSpace = "pre-wrap";
      var note = ""; if (s.last.detail) note += "Key ideas found: " + s.last.detail.matched.length + " of " + s.last.detail.total + (s.last.detail.missed.length ? ". Missing: " + s.last.detail.missed.join(", ") : "") + ". ";
      if (s.last.fuzzy) note += "This kind of answer is graded by keywords, so it is approximate. Tap a button if I got it wrong. ";
      if (s.last.overridden) note += "(You changed this grade.)";
      $("fbNote").textContent = note;
      Array.prototype.forEach.call(opts.children, function (b) {
        var o = q.options && q.options.filter(function (x) { return x.letter === b.dataset.letter; })[0];
        b.classList.remove("right", "wrong");
        if (s.last.q_correctLetter === b.dataset.letter) b.classList.add("right");
      });
    } else { f.hidden = true; }
    if (!asking && tutor.cur && tutor.cur.type === "mc") {
      var cl = tutor.cur.options[tutor.cur.correctIndex].letter, given = (s.last && s.last.answer || "").charAt(0);
      Array.prototype.forEach.call(opts.children, function (b) { b.classList.toggle("right", b.dataset.letter === cl); b.classList.toggle("wrong", b.dataset.letter === given && given !== cl); });
    }
  }
  var renderedQ = "", lastQid = null;
  tutor.__origSubmit = tutor.submit;

  function updateBanner() {
    var b = $("statusBanner"), w = $("statusWord"), sub = $("statusSub"), s = tutor;
    var cls = "ready", word = "READY", text = "Tap START to begin.";
    if (!SR && s.running) { /* buttons only */ }
    if (s.running) {
      if (s.muted) { cls = "muted"; word = "MUTED"; text = tutor.settings.muteMode === "off" ? "Microphone is OFF. Tap UNMUTE." : 'Ignoring everything. Say "' + tutor.settings.unmuteKeyword + '" or tap UNMUTE.'; }
      else if (!SR || micError === "fatal" || userMicOff) { cls = "micoff"; word = "BUTTONS ONLY"; text = "Voice listening is not available. Tap the buttons."; }
      else if (s.speaking) { cls = "speaking"; word = "SPEAKING"; text = tutor.settings.bargeIn ? "You can say mute or a command." : "Wait for me to finish."; }
      else { cls = recOn ? "listening" : "micoff"; word = recOn ? "LISTENING" : "STARTING MIC"; text = recOn ? "Go ahead and speak. Say mute to pause me." : "One moment..."; }
      if (wake) text += "  Screen stays on."; else if (tutor.settings.wakeLock && navigator.wakeLock) text += "";
    }
    b.className = "banner " + cls; w.textContent = word; sub.textContent = text;
    $("btnMute").hidden = !(s.running && !s.muted); $("btnUnmute").hidden = !(s.running && s.muted);
    $("heardLine").hidden = !(s.running && !s.muted && lastHeard);
    if (s.muted) { lastHeard = ""; $("heardLine").hidden = true; }
  }
  function showHeard(t) { $("heardLine").hidden = false; $("heardLine").textContent = "I heard: " + t; }
  function showAlert(t) { $("alert").hidden = false; $("alert").textContent = t; clearTimeout(showAlert.t); showAlert.t = setTimeout(function () { $("alert").hidden = true; }, 14000); }
  function renderGym(s) {
    var g = $("gym"); if (g.hidden) return;
    $("gymStatus").textContent = s.muted ? "MUTED" : (s.running ? (s.speaking ? "SPEAKING" : "LISTENING") : "READY");
    $("gymStatus").className = "gymword" + (s.muted ? " muted" : "");
    var gb = $("gymMute"); gb.textContent = s.muted ? "UNMUTE" : "MUTE"; gb.className = "gymbtn" + (s.muted ? " un" : "");
  }

  /* ---------- progress / lessons / log screens ---------- */
  function pct(x) { return Math.round(x * 100) + "%"; }
  function renderProgress() {
    var ts = tutor.stats(), ov = E.overall(tutor.log), box = $("overall");
    if (!ov.n) box.innerHTML = "<p>No answers yet. Start a quiz and your strengths and weak spots will show up here.</p>";
    else {
      var h = "<div style='font-size:2rem;font-weight:900'>" + pct(ov.acc) + " <span class='small'>correct overall (" + ov.correct + " of " + ov.n + ")</span></div>";
      Object.keys(B.SUBJECTS).forEach(function (k) { var o = ov.bySubj[k]; if (o) h += "<div class='small'>" + B.SUBJECTS[k] + ": " + pct(o.c / o.n) + " (" + o.n + " answers)</div>"; });
      box.innerHTML = h;
    }
    var arr = Object.keys(ts).map(function (k) { return ts[k]; }), seen = arr.filter(function (t) { return t.n > 0; }).sort(function (a, b) { return a.acc - b.acc; });
    var wl = $("weakList"); wl.innerHTML = "";
    if (!seen.length) wl.innerHTML = "<p>Nothing yet.</p>"; else seen.slice(0, 4).forEach(function (t) { wl.appendChild(topicRow(t)); });
    var tl = $("topicList"); tl.innerHTML = "";
    ["acct", "econ"].forEach(function (sj) {
      var hd = document.createElement("div"); hd.className = "grp"; hd.textContent = B.SUBJECTS[sj]; tl.appendChild(hd);
      arr.filter(function (t) { return t.subj === sj; }).forEach(function (t) { tl.appendChild(topicRow(t)); });
    });
  }
  function topicRow(t) {
    var d = document.createElement("div"); d.className = "trow";
    var lab = { strong: "STRONG", ok: "OKAY", weak: "WEAK", "new": "NEW" }[t.status];
    d.innerHTML = "<div class='nm'><span></span><span><span class='tag st-" + t.status + "'>" + lab + "</span> " + (t.n ? pct(t.acc) : "-") + "</span></div><div class='bar'><i class='st-" + t.status + "' style='width:" + (t.n ? Math.round(t.acc * 100) : 0) + "%'></i></div><div class='small'>" + t.n + " answered, " + t.correct + " right</div>";
    d.firstChild.firstChild.textContent = t.name; return d;
  }
  function renderLessons() {
    var box = $("lessonList"); box.innerHTML = "";
    ["acct", "econ"].forEach(function (sj) {
      var hd = document.createElement("div"); hd.className = "grp"; hd.textContent = B.SUBJECTS[sj]; box.appendChild(hd);
      B.TOPICS.filter(function (t) { return t.subj === sj; }).forEach(function (t) {
        var r = document.createElement("div"); r.className = "lrow"; var b = document.createElement("button"); b.className = "btn"; b.textContent = "\u25B6  " + t.name; b.dataset.topic = t.key;
        b.addEventListener("click", function () { startSession({ lesson: t.key }); }); r.appendChild(b); box.appendChild(r);
      });
    });
  }
  function renderLog() {
    var log = tutor.log, box = $("logList"); box.innerHTML = "";
    $("logInfo").textContent = log.length + " answers saved on this phone.";
    log.slice(-60).reverse().forEach(function (e) {
      var d = document.createElement("div"); d.className = "logrow";
      d.innerHTML = "<div class='small'></div><div class='q'></div><div></div>";
      d.children[0].textContent = new Date(e.ts).toLocaleString() + "  \u00B7  " + e.topic + "  \u00B7  " + e.source;
      d.children[1].textContent = e.qtext;
      d.children[2].innerHTML = "<span class='" + (e.correct ? "good" : "bad") + "'>" + (e.correct ? "Correct" : "Incorrect") + (e.overridden ? " (edited)" : "") + "</span> &nbsp; <span></span>"; d.children[2].lastChild.textContent = "You: " + e.given;
      box.appendChild(d);
    });
  }
  function renderHelp() {
    var box = $("cmdList"), groups = {}, order = [];
    E.COMMANDS.forEach(function (c) { if (!groups[c.group]) { groups[c.group] = []; order.push(c.group); } groups[c.group].push(c); });
    box.innerHTML = "";
    order.forEach(function (g) {
      var h = document.createElement("div"); h.className = "grp"; h.textContent = g; box.appendChild(h);
      groups[g].forEach(function (c) { var d = document.createElement("div"); d.className = "cmd"; d.innerHTML = "<b></b><div></div>"; d.firstChild.textContent = "Say: " + c.say.replace("resume tutor", tutor.settings.unmuteKeyword); d.lastChild.textContent = c.does.replace("resume tutor", tutor.settings.unmuteKeyword); box.appendChild(d); });
    });
  }
  function fillVoiceSelect() {
    var sel = $("setVoice"); if (!sel || !tutor) return; sel.innerHTML = "";
    var o = document.createElement("option"); o.value = ""; o.textContent = "Automatic (recommended)"; sel.appendChild(o);
    voices.filter(function (v) { return /^en/i.test(v.lang); }).forEach(function (v) { var op = document.createElement("option"); op.value = v.voiceURI; op.textContent = v.name + " (" + v.lang + ")"; sel.appendChild(op); });
    sel.value = tutor.settings.voiceURI || "";
  }
  function renderSettings() {
    $("setKeyword").value = tutor.settings.unmuteKeyword; $("setRate").value = tutor.settings.rate; $("rateVal").textContent = tutor.settings.rate.toFixed(2) + "x";
    $("setBarge").checked = tutor.settings.bargeIn; $("setAuto").checked = tutor.settings.autoAdvance; $("setWake").checked = tutor.settings.wakeLock;
    Array.prototype.forEach.call(document.getElementsByName("muteMode"), function (r) { r.checked = r.value === tutor.settings.muteMode; });
    document.documentElement.style.fontSize = (20 * tutor.settings.fontScale) + "px";
    fillVoiceSelect();
  }

  /* ---------- actions ---------- */
  function startSession(opts) {
    opts = opts || {};
    var f = $("focusSel").value, focus = f === "weak" ? { weak: true } : (f === "acct" || f === "econ") ? { subj: f } : {};
    micError = micError === "fatal" ? "fatal" : "";
    if (!opts.lesson) opts.focus = focus; else opts.focus = {};
    switchTab("tutor");
    userMicOff = false;
    tutor.start(opts);
    acquireWake();
    syncMic();
  }
  function switchTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    Array.prototype.forEach.call(document.querySelectorAll(".panel"), function (p) { var on = p.id === "tab-" + name; p.classList.toggle("active", on); p.hidden = !on; });
    if (name === "progress") renderProgress(); if (name === "log") renderLog(); if (name === "lessons") renderLessons(); if (name === "settings") renderSettings(); if (name === "help") renderHelp();
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { showAlert("Copied " + tutor.log.length + " answers to the clipboard."); }, fallback);
    fallback();
    function fallback() { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); showAlert("Copied."); } catch (e) { showAlert("Could not copy. Use Download instead."); } ta.remove(); }
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) { b.addEventListener("click", function () { switchTab(b.dataset.tab); }); });
    Array.prototype.forEach.call(document.querySelectorAll(".panel"), function (p) { p.hidden = !p.classList.contains("active"); });
    $("btnStart").addEventListener("click", function () { startSession({}); });
    $("btnStartLesson").addEventListener("click", function () { startSession({ lesson: tutor.topics[0].key }); });
    $("btnMute").addEventListener("click", function () { tutor.mute(); syncMic(); });
    $("btnUnmute").addEventListener("click", function () { tutor.unmute(); syncMic(); });
    $("gymMute").addEventListener("click", function () { if (tutor.muted) tutor.unmute(); else tutor.mute(); syncMic(); renderGym(tutor.snapshot()); });
    $("btnGym").addEventListener("click", function () { $("gym").hidden = false; renderGym(tutor.snapshot()); acquireWake(); });
    $("gymExit").addEventListener("click", function () { $("gym").hidden = true; });
    $("btnSubmit").addEventListener("click", function () { tutor.submitText($("qInput").value); });
    $("qInput").addEventListener("keydown", function (e) { if (e.key === "Enter") tutor.submitText($("qInput").value); });
    $("btnGradeNow").addEventListener("click", function () { tutor.tapGradeNow(); });
    $("btnDontKnow").addEventListener("click", function () { tutor.tapDontKnow(); });
    $("btnSkip").addEventListener("click", function () { tutor.ui("skip"); });
    $("btnRight").addEventListener("click", function () { tutor.hardStopSpeech(); tutor.override(true); });
    $("btnWrong").addEventListener("click", function () { tutor.hardStopSpeech(); tutor.override(false); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-ui]"), function (b) { b.addEventListener("click", function () { tutor.ui(b.dataset.ui); }); });
    $("btnPracticeWeak").addEventListener("click", function () { $("focusSel").value = "weak"; if (tutor.running) { tutor.ui("stop"); } switchTab("tutor"); startSession({}); });
    $("btnCsv").addEventListener("click", function () { download("study-tutor-log.csv", E.toCSV(tutor.log), "text/csv"); });
    $("btnJson").addEventListener("click", function () { download("study-tutor-log.json", JSON.stringify(tutor.log, null, 2), "application/json"); });
    $("btnCopy").addEventListener("click", function () { copyText(E.toCSV(tutor.log)); });
    $("btnSaveKeyword").addEventListener("click", function () {
      var v = $("setKeyword").value.trim().toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(), m = $("kwMsg");
      if (!v) { m.textContent = "Please type a phrase."; return; }
      if (E.isMuteCommand([v])) { m.textContent = "That phrase contains a mute word. Choose another."; return; }
      var n = v.split(" ").length; tutor.setSetting("unmuteKeyword", v);
      m.textContent = n < 2 ? 'Saved: "' + v + '". One word can trigger by accident; two or three words is safer.' : 'Saved. Say "' + v + '" to unmute.';
    });
    $("setRate").addEventListener("input", function () { tutor.setSetting("rate", parseFloat(this.value)); $("rateVal").textContent = parseFloat(this.value).toFixed(2) + "x"; });
    $("setVoice").addEventListener("change", function () { tutor.setSetting("voiceURI", this.value); });
    $("btnTestVoice").addEventListener("click", function () { speak("Hi Bill. This is how I sound at this speed. Say mute to pause me.", function () {}); });
    $("setBarge").addEventListener("change", function () { tutor.setSetting("bargeIn", this.checked); syncMic(); });
    $("setAuto").addEventListener("change", function () { tutor.setSetting("autoAdvance", this.checked); });
    $("setWake").addEventListener("change", function () { tutor.setSetting("wakeLock", this.checked); if (this.checked) acquireWake(); else releaseWake(); });
    Array.prototype.forEach.call(document.getElementsByName("muteMode"), function (r) { r.addEventListener("change", function () { if (this.checked) { tutor.setSetting("muteMode", this.value); syncMic(); } }); });
    $("fontUp").addEventListener("click", function () { tutor.setSetting("fontScale", Math.min(1.6, +(tutor.settings.fontScale + 0.1).toFixed(2))); renderSettings(); });
    $("fontDown").addEventListener("click", function () { tutor.setSetting("fontScale", Math.max(0.8, +(tutor.settings.fontScale - 0.1).toFixed(2))); renderSettings(); });
    $("btnReset").addEventListener("click", function () { if (confirm("Erase all saved answers on this phone? This cannot be undone. Download a copy first if you want one.")) { tutor.log = []; tutor.saveLog(); tutor.last = null; renderProgress(); renderLog(); render(); } });
    window.addEventListener("online", netNote); window.addEventListener("offline", netNote); netNote();
    var dip; window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); dip = e; $("btnInstall").hidden = false; });
    $("btnInstall").addEventListener("click", function () { if (dip) { dip.prompt(); dip = null; $("btnInstall").hidden = true; } });
    $("supportNote").textContent = (SR ? "Voice listening is available." : "This browser can not listen to your voice. Use Chrome on Android. You can still use the buttons.") + (synth ? "" : " Speaking is not available here.");
    renderSettings(); renderHelp(); renderLessons(); render();
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  function netNote() { $("netNote").hidden = navigator.onLine; }
  tutor.mute = (function (orig) { return function () { orig.call(tutor); if (typeof syncMic === "function") syncMic(); }; })(tutor.mute);
  tutor.unmute = (function (orig) { return function () { orig.call(tutor); if (typeof syncMic === "function") syncMic(); }; })(tutor.unmute);
  var origSubmit = tutor.submit; tutor.submit = function (r, s) { origSubmit.call(tutor, r, s); lastQid = tutor.cur && tutor.cur.id; };
  window.__app = { syncMic: syncMic, state: function () { return { recOn: recOn, micError: micError }; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
