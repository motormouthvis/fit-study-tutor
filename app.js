/* app.js: browser glue (speech, microphone, wake lock, screens). Logic lives in engine.js */
(function () {
  "use strict";
  var E = window.Engine, B = window.Bank, LD = window.LessonData;
  var $ = function (id) { return document.getElementById(id); };
  var LS = "tutor.v1.";
  var APP_VERSION = "v5.8.3";
  var MAN = (window.AUDIO_MANIFEST && window.AUDIO_MANIFEST.clips) || {};

  /* ---------- storage ---------- */
  var storage = {
    load: function (k, d) { try { var v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    save: function (k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { showAlert("Could not save to this phone (storage full or blocked)."); } }
  };
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }

  /* ---------- debug / status line ---------- */
  var dbg = { last: "-", audio: "idle", rec: "off", heard: "-", muted: 0 }, dbgLog = [], recStats = { starts: 0, results: 0, errors: 0, quick: 0, lastErr: "" };
  function ev(msg) {
    dbg.last = msg; var d = new Date(); dbgLog.push(("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2) + " " + msg); if (dbgLog.length > 60) dbgLog.shift();
    renderDbg();
  }
  function renderDbg() {
    var el = $("dbgLine"); if (!el) return;
    var a = audioEl, pos = a && a.src && !a.ended ? " " + (a.currentTime || 0).toFixed(1) + "/" + (isFinite(a.duration) ? a.duration.toFixed(1) : "?") + "s" : "";
    el.textContent = APP_VERSION + " | ev: " + dbg.last + " | audio: " + dbg.audio + pos + " | mic: " + (recOn ? "on" : (micError || "off")) + " (starts " + recStats.starts + ", heard " + recStats.results + ", errs " + recStats.errors + (recStats.lastErr ? " " + recStats.lastErr : "") + ") | heard: " + dbg.heard;
    var lg = $("dbgLog"); if (lg && lg.parentNode.open) lg.textContent = dbgLog.join("\n");
  }
  setInterval(renderDbg, 500);

  /* ---------- audio: pre-recorded MP3 clips through one <audio> element ----------
     A clip counts as played only if the element really started ("playing") and then fired "ended" after
     real playback. Anything else (error, blocked, stalled, instant end) is a FAILURE: we stop and wait.
     Text with no recorded clip (the random number problems) falls back to speechSynthesis, same rules. */
  var audioEl = document.getElementById("player") || document.body.appendChild(Object.assign(document.createElement("audio"), { id: "player" })), synth = window.speechSynthesis, voices = [];
  var P = { token: 0, intentional: false, heldNext: null, abort: null };
  function loadVoices() { if (!synth) return; voices = synth.getVoices() || []; fillVoiceSelect(); }
  if (synth) { loadVoices(); if (synth.addEventListener) synth.addEventListener("voiceschanged", loadVoices); }
  function pickVoice() {
    if (!voices.length) return null;
    var uri = tutor.settings.voiceURI, v = voices.filter(function (x) { return x.voiceURI === uri; })[0];
    if (v) return v;
    var en = voices.filter(function (x) { return /^en[-_]US/i.test(x.lang); });
    return en.filter(function (x) { return /google/i.test(x.name); })[0] || en[0] || voices.filter(function (x) { return /^en/i.test(x.lang); })[0] || null;
  }
  function clipUrl(text) { var k = E.clipKey(text); return MAN[k] !== undefined ? "audio/" + k + ".mp3" : null; }
  function setAudioState(st) { dbg.audio = st; renderDbg(); }

  function playClip(url, text, cb) {
    var done = false, started = false, lastT = -1, stall = 0, t0 = Date.now(), iv, st, a = audioEl;
    function cleanup() { clearTimeout(st); clearInterval(iv); a.onplaying = a.onended = a.onerror = a.onpause = null; P.abort = null; }
    function fin(ok, why) { if (done) return; done = true; cleanup(); cb(ok, why); }
    P.abort = function () { done = true; cleanup(); };
    a.onplaying = function () { started = true; clearTimeout(st); setAudioState("playing"); ev("playing " + url.slice(6, 12)); };
    a.onended = function () {
      var d = a.duration, t = a.currentTime;
      if (started && d > 0 && t >= Math.min(0.5, d * 0.8)) { ev("ended ok " + url.slice(6, 12) + " (" + t.toFixed(1) + "s)"); fin(true); }
      else fin(false, "clip ended without really playing (played " + (t || 0).toFixed(2) + "s of " + d + ")");
    };
    a.onerror = function () { fin(false, "audio error " + (a.error ? a.error.code + " " + (a.error.message || "") : "?") + " for " + url); };
    a.onpause = function () {
      if (P.intentional || a.ended || done) return;
      ev("paused by system - retrying");
      if (tutor.settings.bargeIn && (recOn || rec)) {
        // Some Android phones pause audio when the microphone opens. Protect the audio: turn off listen-while-talking.
        tutor.setSetting("bargeIn", false); stopRec();
        showAlert("Your phone paused the audio when the microphone opened, so I turned off \"Listen while I talk\". Tap the big MUTE / PAUSE button while I talk, or speak in the quiet gap after each lesson part.");
        ev("auto-disabled listen-while-talking (audio was paused by the phone)");
      }
      setTimeout(function () {
        if (done || P.intentional) return;
        var pr = a.play(); if (pr && pr.catch) pr.catch(function (e) { fin(false, "audio was paused by the phone and would not resume (" + e.name + ")"); });
        setTimeout(function () { if (!done && !P.intentional && a.paused && !a.ended) fin(false, "audio was paused by the phone and would not resume"); }, 1500);
      }, 250);
    };
    st = setTimeout(function () { if (!started) fin(false, "audio did not start within 10 seconds (" + url + ")"); }, 10000);
    iv = setInterval(function () {
      if (!started || P.intentional || a.paused) { stall = 0; return; }
      if (a.currentTime === lastT) { if (++stall >= 7) fin(false, "audio stalled"); } else { stall = 0; lastT = a.currentTime; }
    }, 1000);
    try {
      var rate = window.__testRate || tutor.settings.rate || 1;
      a.defaultPlaybackRate = rate; a.src = url; a.playbackRate = rate; try { a.preservesPitch = true; } catch (e) {}
      setAudioState("loading");
      var pr = a.play(); if (pr && pr.catch) pr.catch(function (e) { if (e && e.name === "AbortError") return; fin(false, "play() was blocked: " + (e && e.name) + " " + (e && e.message || "")); });
    } catch (e) { fin(false, "play() threw " + e); }
  }
  function playTTS(text, cb) {
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return cb(false, "no speech synthesizer for a number problem");
    var done = false, started = false, t0 = Date.now(), wd;
    function fin(ok, why) { if (done) return; done = true; clearTimeout(wd); P.abort = null; cb(ok, why); }
    P.abort = function () { done = true; clearTimeout(wd); };
    try {
      try { synth.cancel(); } catch (e) {}
      var u = new SpeechSynthesisUtterance(text); u.rate = tutor.settings.rate || 1; u.lang = "en-US"; var v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; }
      u.onstart = function () { started = true; setAudioState("playing (backup voice)"); };
      u.onend = function () { var el = Date.now() - t0; if (started && el >= 250) fin(true); else fin(false, "backup voice ended instantly (" + el + " ms)"); };
      u.onerror = function (e) { fin(false, "backup voice error " + (e && e.error)); };
      wd = setTimeout(function () { if (!done) { try { synth.cancel(); } catch (e) {} fin(false, "backup voice timed out"); } }, 5000 + text.length * 110);
      setAudioState("loading (backup voice)");
      synth.speak(u);
    } catch (e) { fin(false, "backup voice threw " + e); }
  }
  function prefetch(url) { try { fetch(url).catch(function () {}); } catch (e) {} }
  function cancelSpeech() {
    P.token++; if (P.abort) P.abort(); P.heldNext = null; P.intentional = false; P.curText = ""; P.doneText = "";
    try { audioEl.pause(); audioEl.removeAttribute("src"); audioEl.load(); } catch (e) {}
    if (synth) { try { synth.cancel(); } catch (e) {} }
    setAudioState("idle");
  }
  function pauseAudio() { P.intentional = true; try { audioEl.pause(); } catch (e) {} if (synth && synth.speaking) { try { synth.pause(); } catch (e) {} } setAudioState("paused"); ev("audio paused (button)"); }
  function resumeAudio() {
    P.intentional = false;
    var h = P.heldNext; P.heldNext = null;
    if (h) { ev("audio resumed"); return h(); }
    if (audioEl.src && !audioEl.ended && audioEl.paused) { var pr = audioEl.play(); if (pr && pr.catch) pr.catch(function (e) { ev("resume failed " + e.name); }); setAudioState("playing"); }
    if (synth && synth.paused) { try { synth.resume(); } catch (e) {} }
    ev("audio resumed");
  }
  // parts: list of clip texts (strings or {t,dyn,soft}); done(ok, why)
  function speak(parts, done) {
    cancelSpeech();
    (window.__spokenLog = window.__spokenLog || []).push(parts.map(function (p) { return typeof p === "string" ? p : p.t; }).join(" "));
    var tok = ++P.token, i = 0, played = 0, finished = false;
    parts = parts.map(function (p) { return typeof p === "string" ? { t: p } : p; });
    function finish(ok, why) {
      if (finished || tok !== P.token) return; finished = true; setAudioState(ok ? "idle" : "FAILED");
      if (!ok) ev("FAILED: " + why);
      dbg.failWhy = ok ? "" : why;
      setTimeout(function () { if (tok === P.token) done(ok, why); }, ok ? 60 : 0);
    }
    function next() {
      if (tok !== P.token) return;
      if (P.intentional) { P.heldNext = next; return; }
      if (i >= parts.length) return finish(played > 0, played > 0 ? "" : "nothing could be played");
      var p = parts[i++], url = clipUrl(p.t);
      P.curText = p.t;
      function cont(ok, why) {
        if (tok !== P.token) return;
        if (ok) { P.doneText = p.t; played++; setTimeout(next, 90); }
        else if (p.soft) { ev("skipped a part: " + why); next(); }
        else finish(false, why);
      }
      if (url) playClip(url, p.t, cont); else { if (!p.dyn) ev("no recorded clip, using backup voice"); playTTS(p.t, cont); }
    }
    parts.forEach(function (p, k) { if (k > 0) { var u = clipUrl(p.t); if (u) prefetch(u); } });
    next();
  }

  /* ---------- tutor ---------- */
  var io = {
    speak: speak, cancelSpeech: cancelSpeech, pauseAudio: pauseAudio, resumeAudio: resumeAudio,
    setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (id) { clearTimeout(id); },
    now: function () { return Date.now(); }, rng: Math.random,
    load: storage.load, save: storage.save, emit: function (s) { render(s); },
    clipDuration: function (text) { return MAN[E.clipKey(text)] || 0; }
  };
  var tutor = new E.Tutor(io, { topics: B.TOPICS, questions: B.QUESTIONS, generators: B.GENERATORS, lessons: LD, subjects: B.SUBJECTS });
  window.__tutor = tutor; window.__E = E;

  /* ---------- microphone / speech recognition ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var netFails = 0, rec = null, recOn = false, consumed = false, micError = "", restartTimer = null, userMicOff = false, lastHeard = "";
  var recStartedAt = 0, recGotResult = false, micHoldUntil = 0, wasSpeaking = false;
  function maxQuick() { return window.__maxQuick || 25; }   // consecutive sessions that ended within 4 s with nothing heard
  function shouldListen() {
    if (!SR || userMicOff || !tutor.running || micError === "fatal" || micError === "loop" || micError === "voice-off") return false;
    if (tutor.muted) return tutor.settings.muteMode !== "off";
    if (tutor.speaking && !tutor.settings.bargeIn) return false;
    return true;
  }
  function syncMic() {
    // after the tutor stops talking, wait a moment before opening the mic (stops open/close flapping between clips)
    if (tutor.speaking && !wasSpeaking) { wasSpeaking = true; }
    if (!tutor.speaking && wasSpeaking) { wasSpeaking = false; micHoldUntil = Date.now() + 700; }
    var want = shouldListen();
    if (want && !recOn && !restartTimer) {
      var wait = micHoldUntil - Date.now();
      if (wait > 0 && !tutor.muted) restartTimer = setTimeout(function () { restartTimer = null; syncMic(); }, wait); else startRec();
    }
    if (!want && recOn) stopRec();
    updateBanner();
  }
  function startRec() {
    if (!SR) return;
    try {
      consumed = false; rec = new SR(); rec.lang = "en-US"; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 3;
      rec.onstart = function () { recOn = true; consumed = false; recStarts(); if (micError !== "fatal" && micError !== "loop" && micError !== "voice-off") micError = ""; updateBanner(); };
      rec.onresult = onResult;
      rec.onerror = function (ev2) {
        var e = ev2 && ev2.error; recStats.errors++; recStats.lastErr = e || "?";
        if (e === "not-allowed" || e === "service-not-allowed") { micError = "fatal"; showAlert("The microphone is blocked. Tap the lock icon in Chrome's address bar, allow Microphone for this site, then reload. You can still use the buttons."); }
        else if (e === "audio-capture") { micError = "fatal"; showAlert("No microphone found. You can still use the buttons."); }
        else if (e === "network") {
          // calm handling: retry quietly a couple of times, then give up until the user asks again or the connection returns
          netFails++; micError = netFails >= 3 ? "voice-off" : "network";
          if (micError === "voice-off") { tutor.voiceOff = true; ev("voice commands unavailable (network) - stopped retrying"); stopRec(); tutor.emit(); }
        }
        else if (e === "no-speech" || e === "aborted") { /* normal */ }
        ev("mic error: " + e);
      };
      rec.onend = function () {
        recOn = false; rec = null; updateBanner();
        var life = Date.now() - recStartedAt;
        if (recGotResult || life > 4000) recStats.quick = 0; else recStats.quick++;
        if (!shouldListen()) return;
        if (recStats.quick >= maxQuick()) { micError = "loop"; tutor.voiceOff = true; ev("mic gave up after " + recStats.quick + " quick restarts"); tutor.emit(); updateBanner(); return; }
        // exponential backoff: 0.25 s for the first few, then 0.5, 1, 2, 4, max 5 s
        var delay = micError === "network" ? 2000 * netFails : Math.min(5000, 250 * Math.pow(2, Math.max(0, recStats.quick - 3)));
        restartTimer = setTimeout(function () { restartTimer = null; syncMic(); }, delay);
      };
      rec.start();
    } catch (e) { recOn = false; rec = null; recStats.errors++; recStats.lastErr = "start-threw"; restartTimer = setTimeout(function () { restartTimer = null; syncMic(); }, 1500); }
  }
  function recStarts() { recStats.starts++; recStartedAt = Date.now(); recGotResult = false; }
  function stopRec() { try { if (rec) { rec.onend = null; rec.abort(); } } catch (e) {} rec = null; recOn = false; clearTimeout(restartTimer); restartTimer = null; updateBanner(); }
  function restartMic() { micError = micError === "fatal" ? "fatal" : ""; netFails = 0; tutor.voiceOff = micError === "fatal"; recStats.quick = 0; stopRec(); syncMic(); ev("mic restarted by button"); }
  function onResult(ev2) {
    var res = ev2.results[ev2.results.length - 1]; if (!res) return;
    var alts = []; for (var i = 0; i < res.length; i++) if (res[i].transcript) alts.push(res[i].transcript);
    if (!alts.length) return;
    var isFinal = !!res.isFinal; recGotResult = true; recStats.results++; netFails = 0;
    if (consumed && isFinal) return;                         // rest of an utterance that already did something
    if (tutor.muted) { var r = tutor.heard(alts, isFinal); dbg.heard = "(muted: heard something, ignored" + (r.action === "unmute" ? " - UNMUTE" : "") + ")"; if (r.action === "unmute") { consumed = true; lastHeard = ""; ev("unmuted by voice"); } return; }   // never display or keep anything heard while muted
    if (tutor.speaking) {
      if (!tutor.settings.bargeIn) return;
      if (E.isEcho(alts[0], tutor.spokenNow)) { dbg.heard = '"' + alts[0] + '" (ignored: my own voice)'; return; }        // that was probably me
    }
    lastHeard = alts[0]; showHeard(lastHeard);
    var out = tutor.heard(alts, isFinal);
    dbg.heard = '"' + alts[0] + '"' + (isFinal ? "" : " (interim)") + " -> " + out.action + (out.cmd ? ":" + out.cmd : "");
    if (out.action === "mute") ev("MUTE heard: audio stopped");
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
    var showQuiz = running && s.mode === "quiz" && s.question, showLesson = running && s.mode === "lesson" && s.lesson;
    $("startCard").hidden = running && s.mode === "quiz";
    $("quizBar").hidden = !(running && s.mode === "quiz");
    $("quizCard").hidden = !showQuiz;
    // lesson playback lives on Learn, quiz on Quiz: follow the mode automatically
    var tab = activeTab();
    if (showLesson && !prevShowLesson && tab === "tutor") switchTab("lessons");
    if (prevShowLesson && s.mode === "quiz" && running && tab === "lessons") switchTab("tutor");
    prevShowLesson = !!showLesson;
    if (showQuiz) renderQuiz(s);
    if ($("lAsk")) $("lAsk").hidden = !(showLesson && s.lesson && s.lesson.text);
    if (showLesson) { $("lText").textContent = s.lesson.text; $("lMsg").textContent = s.audioError ? "" : (s.phase === "lessonWait" || s.phase === "lessonEnd" ? (s.message || "") : ""); }
    if (audioEl.getAttribute("src")) { try { audioEl.playbackRate = window.__testRate || tutor.settings.rate || 1; } catch (e) {} }
    $("sessCount").textContent = s.session.answered; $("sessRight").textContent = s.session.correct;
    $("gymSub").textContent = s.muted ? 'Say "' + tutor.settings.unmuteKeyword + '" or tap the button' : (s.running ? "Tap the button to pause" : "");
    renderGym(s);
    if (!s.running) releaseWake();
    updateLessonsView(s);
    if (window.__v4ready) updateLearnLayout();
    syncMic();
    Array.prototype.forEach.call(document.querySelectorAll(".micbtn"), function (b) { b.hidden = !running; b.textContent = s.muted ? "\uD83C\uDFA4 Unmute" : "\uD83C\uDFA4 Mute"; b.classList.toggle("muted", !!s.muted); });
    var mi = $("menu"); Array.prototype.forEach.call(mi.querySelectorAll(".m-lesson"), function (e) { e.hidden = !(running && s.mode === "lesson"); });
    Array.prototype.forEach.call(mi.querySelectorAll(".m-quiz"), function (e) { e.hidden = !(running && s.mode === "quiz"); });
    Array.prototype.forEach.call(mi.querySelectorAll(".m-run"), function (e) { e.hidden = !running; });
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
    var cls = "ready", word = "READY", text = "Tap PLAY to begin.";
    var voiceMsg = "Voice commands unavailable (no connection) \u2013 use the buttons.";
    if (s.running) {
      if (s.muted) { cls = "muted"; word = "MUTED"; text = tutor.settings.muteMode === "off" || micError === "voice-off" || micError === "fatal" ? "Tap Unmute to continue." : 'Say "' + tutor.settings.unmuteKeyword + '" or tap Unmute.'; }
      else if (s.audioError) { cls = "error"; word = "NO SOUND"; text = "I couldn't play sound."; }
      else if (s.audioPaused) { cls = "paused"; word = "PAUSED"; text = "Tap PLAY to continue."; }
      else if (!SR || micError === "fatal" || userMicOff) { cls = "micoff"; word = s.speaking ? "PLAYING" : "BUTTONS ONLY"; text = "Voice not available \u2013 use the buttons."; }
      else if (micError === "voice-off" || micError === "loop") { cls = "voiceoff"; word = s.speaking ? "PLAYING" : (micError === "loop" ? "MIC PAUSED" : "WAITING"); text = micError === "loop" ? "Voice paused \u2013 use the buttons, or Menu > Restart microphone." : voiceMsg; }
      else if (s.speaking) { cls = "speaking"; word = "PLAYING"; text = tutor.settings.bargeIn ? "You can say mute." : ""; }
      else { cls = recOn ? "listening" : "micoff"; word = recOn ? "LISTENING" : "STARTING MIC"; text = recOn ? "Go ahead and speak." : ""; }
    }
    b.className = "slim " + cls; w.textContent = word; sub.textContent = text;
    $("heardLine").hidden = !(s.running && !s.muted && lastHeard);
    var err = $("audioErr"); var showErr = !!(s.running && s.audioError) || !!soundFail;
    err.hidden = !showErr;
    if (showErr) $("audioErrWhy").textContent = (s.audioError || soundFail || "") + "";
    if (s.muted) { lastHeard = ""; $("heardLine").hidden = true; }
  }
  function showHeard(t) { $("heardLine").hidden = false; $("heardLine").textContent = "I heard: " + t; }
  function showAlert(t) { $("alert").hidden = false; $("alert").textContent = t; clearTimeout(showAlert.t); showAlert.t = setTimeout(function () { $("alert").hidden = true; }, 14000); }
  function renderGym(s) {
    var g = $("gym"); if (g.hidden) return;
    $("gymStatus").textContent = s.muted ? "MUTED" : (s.running ? (s.audioError ? "NO SOUND" : s.audioPaused ? "PAUSED" : s.speaking ? "PLAYING" : "LISTENING") : "READY");
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
  var prevShowLesson = false, topicRows = {};
  function activeTab() { var t = document.querySelector(".tab.active"); return t ? t.dataset.tab : ""; }
  function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2); }
  function fmtLeft(sec) {
    var m = Math.max(1, Math.round(sec / 60)); if (m < 60) return "about " + m + " min";
    var h = Math.floor(m / 60); return "about " + h + " h " + (m % 60) + " min";
  }
  function sum(arr) { return arr.reduce(function (x, y) { return x + y; }, 0); }
  // which topic a "Start / Continue" button should open
  function nextLessonKey(s) {
    var lp = s.lessonProgress, keys = B.TOPICS.map(function (t) { return t.key; });
    var k = lp.last && keys.indexOf(lp.last) >= 0 ? lp.last : null;
    if (k && lp.done.indexOf(k) < 0) return k;
    var from = k ? keys.indexOf(k) + 1 : 0;
    for (var n = 0; n < keys.length; n++) { var c = keys[(from + n) % keys.length]; if (lp.done.indexOf(c) < 0) return c; }
    return keys[0];
  }
  function renderLessons() {
    var box = $("lessonList"); box.innerHTML = ""; topicRows = {};
    ["acct", "econ"].forEach(function (sj) {
      var hd = document.createElement("div"); hd.className = "grp"; hd.textContent = B.SUBJECTS[sj]; box.appendChild(hd);
      B.TOPICS.filter(function (t) { return t.subj === sj; }).forEach(function (t) {
        var b = document.createElement("button"); b.className = "trw"; b.dataset.topic = t.key;
        b.innerHTML = "<span class='tick'></span><span class='tn'></span><span class='tm'></span>"; b.children[1].textContent = t.name;
        b.addEventListener("click", function () { var s = lastSnap || tutor.snapshot(); if (learnView() === "read" && !(s.running && s.mode === "lesson")) { rd.key = t.key; rd.si = 0; updateLearnLayout(); window.scrollTo(0, 0); return; } if (tutor.running) tutor.ui("teach", t.key); else startSession({ lesson: t.key }); });
        box.appendChild(b); topicRows[t.key] = b;
      });
    });
    updateLessonsView(lastSnap || tutor.snapshot());
  }
  // everything on the Lessons tab that depends on progress. Cheap; called on every state change and by the ticker.
  function updateLessonsView(s) {
    if (!s || !s.lessonProgress) return;
    var lp = s.lessonProgress, secs = lp.topicSecs, total = lp.total || 0, doneN = lp.done.length, L = (s.running && s.mode === "lesson") ? s.lesson : null, rate = tutor.settings.rate || 1;
    var doneSecs = 0; B.TOPICS.forEach(function (t, i) { if (lp.done.indexOf(t.key) >= 0) doneSecs += secs[i] || 0; });
    // topic list
    B.TOPICS.forEach(function (t, i) {
      var r = topicRows[t.key]; if (!r) return;
      var isDone = lp.done.indexOf(t.key) >= 0, isCur = !!(L && L.topic === t.key);
      r.classList.toggle("done", isDone); r.classList.toggle("current", isCur);
      r.children[0].textContent = isCur ? "\u25B6" : isDone ? "\u2713" : "\u25CB";
      r.children[2].textContent = isCur ? "Part " + (L.seg + 1) + "/" + L.count : fmtClock(secs[i] || 0);
      r.setAttribute("aria-label", t.name + (isDone ? ", heard" : "") + (isCur ? ", playing now" : ""));
    });
    $("lTopicsSummary").textContent = doneN + " of " + B.TOPICS.length + " topics heard all the way through" + (total ? " \u00B7 " + fmtLeft((total - doneSecs) / rate) + " of audio left" : "");
    // main player (always visible; shows the next lesson when idle)
    var key = nextLessonKey(s), tp = tutor.topic(key), fresh = doneN === 0 && !lp.last;
    var ps = L ? (L.partSecs || []) : [], d = L ? (ps[L.seg] || 0) : 0, t = 0;
    var playing = false;
    if (L) {
      if (P.curText === L.text && audioEl.getAttribute("src")) t = audioEl.currentTime || 0; else if (P.doneText === L.text) t = d;
      if (d) t = Math.min(t, d);
      playing = !s.muted && !s.audioPaused && !s.audioError && s.phase !== "lessonWait";
    }
    var pb = $("btnPlay");
    pb.innerHTML = playing ? "&#10074;&#10074; PAUSE" : (L && s.audioPaused ? "&#9654; RESUME" : "&#9654; PLAY"); pb.classList.toggle("pausing", playing);
    $("btnSpeed").textContent = (Math.round(rate * 100) / 100) + "\u00D7";
    $("btnBack10").disabled = !L; $("btnFwd10").disabled = !L; $("btnBack10").style.opacity = $("btnFwd10").style.opacity = L ? 1 : 0.4;
    var overallHeard = function (frac) { return doneSecs + frac; };
    if (!L) {
      $("lName").textContent = "Lessons"; $("lPos").textContent = fresh ? "Ready to start" : "Up next: " + tp.name; $("lTopicNo").textContent = "";
      $("lText").textContent = fresh ? "Tap PLAY to start listening." : "Tap PLAY to continue where you left off.";
      $("lMsg").textContent = ""; $("lVariant").textContent = ""; $("lClipBar").style.width = "0%"; $("lClipTime").textContent = "";
      $("lBar").style.width = (total ? Math.round(100 * doneSecs / total) : 0) + "%";
      $("lAllLabel").textContent = doneN + " of " + B.TOPICS.length + " topics done"; $("lAllTime").textContent = total ? fmtLeft((total - doneSecs) / rate) + " left" : "";
      return;
    }
    var topicTotal = (L.titleSecs || 0) + sum(ps), played = (L.seg > 0 ? (L.titleSecs || 0) : 0) + sum(ps.slice(0, L.seg)) + t, topicLeft = Math.max(0, topicTotal - played);
    $("lName").textContent = L.name; $("lVariant").textContent = L.variant === "simple" ? "Simple version" : L.variant === "summary" ? "Short version" : "";
    $("lPos").textContent = "Part " + (L.seg + 1) + " of " + L.count;
    $("lTopicNo").textContent = "\u00B7 Topic " + (L.ti + 1) + " of " + L.tcount + (topicTotal ? " \u00B7 " + fmtLeft(topicLeft / rate) + " left" : "");
    $("lClipBar").style.width = (d ? Math.round(100 * t / d) : 0) + "%"; $("lClipTime").textContent = fmtClock(t) + " / " + fmtClock(d);
    var curDone = lp.done.indexOf(L.topic) >= 0, frac = topicTotal ? played / topicTotal : 0;
    var heard = doneSecs + (curDone ? 0 : frac * (secs[L.ti] || 0));
    $("lBar").style.width = (total ? Math.min(100, Math.round(100 * heard / total)) : 0) + "%";
    $("lAllLabel").textContent = doneN + " of " + L.tcount + " topics done"; $("lAllTime").textContent = total ? fmtLeft((total - heard) / rate) + " left" : "";
  }
  setInterval(function () { if (lastSnap && lastSnap.running && lastSnap.mode === "lesson" && !$("tab-lessons").hidden) updateLessonsView(lastSnap); }, 250);
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
    $("setBarge").checked = tutor.settings.bargeIn; $("setAuto").checked = tutor.settings.autoAdvance; $("setLessonAuto").checked = tutor.settings.lessonAuto; $("setAlsoUnmute").checked = tutor.settings.alsoUnmute; $("setWake").checked = tutor.settings.wakeLock;
    Array.prototype.forEach.call(document.getElementsByName("muteMode"), function (r) { r.checked = r.value === tutor.settings.muteMode; });
    document.documentElement.style.fontSize = (20 * tutor.settings.fontScale) + "px";
    fillVoiceSelect();
  }

  /* ---------- actions ---------- */
  var pendingStart = null, soundFail = "", soundCardMode = "";
  function startSession(opts) {
    opts = opts || {};
    if (!soundConfirmed()) { pendingStart = opts; openSoundCard("First, a quick sound check."); return; }
    doStart(opts);
  }
  function doStart(opts) {
    var f = $("focusSel").value, focus = f === "weak" ? { weak: true } : (f === "acct" || f === "econ") ? { subj: f } : {};
    micError = micError === "fatal" ? "fatal" : ""; recStats.quick = 0; soundFail = "";
    if (!opts.lesson) opts.focus = focus; else opts.focus = {};
    switchTab(opts.lesson ? "lessons" : "tutor");
    userMicOff = false;
    tutor.start(opts);
    acquireWake();
    syncMic();
  }
  /* ---------- sound check ---------- */
  // v5.8.2: YES/NO is visible as soon as the sound check opens (it used to appear only after the test clip
  // reported "played to the end", so on phones where that never fired there was no YES button at all).
  var SOUND_OK_KEY = "studyTutor.soundOk";
  function soundConfirmed() { try { if (localStorage.getItem(SOUND_OK_KEY) === "1") return true; } catch (e) {} return !!tutor.settings.soundOk; }
  function openSoundCard(msg) {
    $("soundCard").hidden = false; $("scMsg").textContent = msg || ""; $("scAsk").hidden = false; $("scHelp").hidden = true;
  }
  function testSound() {
    // plays a beep and then a spoken sentence. Always a direct result of a tap.
    if (tutor.running) tutor.hardStopSpeech();
    soundFail = ""; $("soundCard").hidden = false; $("scAsk").hidden = false; $("scHelp").hidden = true; $("scMsg").textContent = "Playing... you should hear a beep, then my voice.";
    speak(E.SOUND_CLIPS.slice(0, 2), function (ok, why) {
      if (ok) { $("scMsg").textContent = ""; $("scAsk").hidden = false; ev("test sound played to the end"); }
      else { soundFail = "I couldn't play sound. " + why; $("scMsg").textContent = ""; $("scHelp").hidden = false; $("scHelp").textContent = "I couldn't play sound. Tap TEST SOUND to try again. Check: phone volume (media volume, not ringer) is up, silent/Do Not Disturb is off, Bluetooth is connected to the right device, and Chrome is not muted for this site. Details: " + why; }
      updateBanner();
      if (tutor.running) { tutor.message = ""; tutor.emit(); }
    });
  }
  function soundAnswer(yes) {
    if (yes) {
      $("scAsk").hidden = true; try { localStorage.setItem(SOUND_OK_KEY, "1"); } catch (e) {}
      soundFail = ""; tutor.setSetting("soundOk", true); $("soundCard").hidden = true; ev("sound check: YES");
      var o = pendingStart; pendingStart = null;
      if (o) doStart(o); else { $("startCard").hidden = tutor.running; showAlert("Great, the sound works."); }
      updateBanner();
    } else {
      ev("sound check: NO"); $("scHelp").hidden = false;
      $("scHelp").textContent = "No sound. Try this: 1) turn the MEDIA volume up with the volume button, then tap TEST SOUND again; 2) make sure silent or Do Not Disturb is off; 3) if you use Bluetooth earbuds, check they are connected; 4) in Chrome, tap the lock icon near the address bar and make sure Sound is allowed; 5) close the app and open it again. I will not start a lesson until you hear this.";
    }
  }
  var MAIN_TABS = { lessons: 1, tutor: 1, cards: 1, progress: 1 }, lastMain = "lessons";
  function switchTab(name, keep) {
    if (name === "cards" && fc && !(keep && fc.view === "study")) fc.view = "sections";   // v5.1: Flash Cards always opens on the sections list (the menu items keep an open session)
    var about = name === "help-about"; if (about) name = "help";
    if (MAIN_TABS[name]) lastMain = name;
    $("menu").hidden = true;
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    Array.prototype.forEach.call(document.querySelectorAll(".panel"), function (p) { var on = p.id === "tab-" + name; p.classList.toggle("active", on); p.hidden = !on; });
    if (name !== "cards") fcUnfit();
    if (name === "progress") { renderProgress(); renderFcStats(); } if (name === "cards") renderFlash(); if (name === "log") renderLog(); if (name === "lessons") renderLessons(); if (name === "settings") renderSettings(); if (name === "help") renderHelp();
    if (window.__v4ready) updateLearnLayout();
    if (about) { var dd = $("dbgLine").parentNode; dd.open = true; renderDbg(); dd.scrollIntoView && dd.scrollIntoView(); } else window.scrollTo(0, 0);
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


  /* ================= v4.2: Flash Cards ================= */
  var FL = window.Flash, fc = null;
  function fcEsc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fcSave() { syncStampFc(); storage.save("fc", fc.st); storage.save("fcFilter", fc.filter); storage.save("fcShuffle", fc.shuffle); }
  function fcNum(v) { var a = Math.abs(v).toLocaleString("en-US"); return v < 0 ? "(" + a + ")" : a; }
  function fcTable(t) {
    var h = "<table class='fctbl'><caption>" + fcEsc(t.title) + "</caption>";
    t.rows.forEach(function (r) { h += "<tr" + (r[2] ? " class='" + r[2] + "'" : "") + "><td>" + fcEsc(r[0]) + "</td><td class='n'>" + fcNum(r[1]) + "</td></tr>"; });
    return h + "</table>";
  }
  // v5.0: the task label on the front (Define:, Calculate: ...) and the answer labels on the back (Definition:, Example entry: ...) are shown in bold
  var FC_TASK = /^(Define|Formula|Explain in one sentence|Explain|Calculate|Compare|List|Give an example|State|Describe|Apply|Decide|Interpret|Write the journal entry):/;
  var FC_LABEL = /^(Definition|Formula|Example entry|Example|What it tells you|What each shows|The rule|Answer|Working|Why|Compare|Difference|Rule|Steps|Entry|Entries|Journal entry|Interpretation|Decision|Takeaway|Watch out|Common mistake|Test|Use|Limits|Limit|Meaning|Effect|Result|Explanation|Description|Problems|Related):/;
  function fcFrontHtml(t) { var m = FC_TASK.exec(t); return m ? "<b class='fctask'>" + fcEsc(m[1]) + ":</b>" + fcEsc(t.slice(m[0].length)) : fcEsc(t); }
  function fcBackHtml(t) {
    return String(t).split("\n").map(function (ln) { var m = FC_LABEL.exec(ln); return "<div class='fcl'>" + (m ? "<b class='fclab'>" + fcEsc(m[1]) + ":</b>" + fcEsc(ln.slice(m[0].length)) : fcEsc(ln)) + "</div>"; }).join("");
  }
  function fcFilterOptions() {
    var sel = $("fcFilter"), h = "<option value='all'>All cards</option><option value='course:acct'>BUS 5601 Accounting (all)</option><option value='course:econ'>BUS 5421 Economics (all)</option>" +
      "<option value='sa'>Statement Analysis</option><option value='mine'>My cards (AI) (" + FL.filterCards("mine").length + ")</option><option value='restudy'>Restudy only</option><option value='unseen'>Unseen</option>";
    ["acct", "econ"].forEach(function (co) {
      h += "<optgroup label='" + (co === "acct" ? "BUS 5601 topics" : "BUS 5421 topics") + "'>";
      FL.TOPICS.filter(function (t) { return t.course === co; }).forEach(function (t) { h += "<option value='topic:" + t.key + "'>" + fcEsc(t.name) + "</option>"; });
      h += "</optgroup>";
    });
    if (/^sec:/.test(fc.filter)) h = "<option value='" + fcEsc(fc.filter) + "'>" + fcEsc(fcSecLabel(fc.filter)) + "</option>" + h;
    sel.innerHTML = h; sel.value = fc.filter; if (sel.value !== fc.filter) { fc.filter = "all"; sel.value = "all"; }
  }
  /* v5.4: each section + mode keeps its deck order and which cards you got right in this pass ("pass"), so the next trip resumes where you stopped.
     Saved in fc.st.pass (synced). Missed cards stay in the pass until you get them right. */
  function fcPassKey(f) { f = f || fc.filter; if (!/^sec:/.test(f)) return null; var m = FL.parseSec(f); return "sec:" + m.id + ":" + m.mode; }
  function fcPassInfo(key) {
    var p = fc.st.pass && fc.st.pass[key]; if (!p || !Array.isArray(p.order)) return null;
    var ids = p.order.filter(function (id) { return !!fcCard(id); }), done = ids.filter(function (id) { return p.done && p.done[id]; }).length;
    return { total: ids.length, done: done, pos: Math.min(done + 1, ids.length), left: ids.length - done, u: p.u || 0 };
  }
  function fcNewPass(key, cards) {
    var now = Date.now(); fc.st.pass = fc.st.pass || {};
    return (fc.st.pass[key] = { id: "p" + now.toString(36) + Math.floor(Math.random() * 1679616).toString(36), order: FL.buildQueue(cards, fc.st, now & 0x7fffffff, fc.shuffle), done: {}, u: now });
  }
  function fcStart(fresh) {
    var cards = FL.filterCards(fc.filter, fc.st), key = fcPassKey();
    fc.flipped = false; fc.histRef = null;
    if (key) {
      fc.st.pass = fc.st.pass || {}; var p = fc.st.pass[key], inF = {}, mode = FL.parseSec(fc.filter).mode;
      cards.forEach(function (c) { inF[c.id] = 1; });
      if (fresh || !p || !Array.isArray(p.order)) p = fcNewPass(key, cards);
      else {
        if (!p.done || typeof p.done !== "object") p.done = {};
        var has = {}; p.order.forEach(function (id) { has[id] = 1; });
        var add = cards.filter(function (c) { return !has[c.id]; }).map(function (c) { return c.id; });   // new cards in the section join the pass
        if (add.length) { p.order = p.order.concat(add); p.u = Date.now(); }
      }
      fc.queue = p.order.filter(function (id) { return !p.done[id] && inF[id]; });
      if (!fc.queue.length && cards.length && mode !== "all") { p = fcNewPass(key, cards); fc.queue = p.order.slice(); }   // missed / restudy: a new round when cards need it again
      fc.sess = { got: 0, miss: 0, total: fc.queue.length, pass: true };
    } else {
      fc.queue = FL.buildQueue(cards, fc.st, Date.now() & 0x7fffffff, fc.shuffle);
      fc.sess = { got: 0, miss: 0, total: cards.length };
    }
    if (cards.length) fc.st.sessions = (fc.st.sessions || 0) + 1;
    fcSave(); fcRender();
  }
  function fcStartOver() { fcStart(true); }
  function fcCard(id) { for (var i = 0; i < FL.ALL.length; i++) if (FL.ALL[i].id === id) return FL.ALL[i]; return null; }
  function fcRender() {
    if (fc.view !== "study" || !fc.queue) { renderSections(); return; }
    $("fcStudy").hidden = false; $("fcSections").hidden = true;
    $("fcSecName").textContent = fcSecLabel(fc.filter); $("fcSecName").title = fcSecLabel(fc.filter); document.body.classList.add("fcstudy");
    var st = FL.stats(fc.st), id = fc.queue[0], c = id && fcCard(id);
    var pinf = fcPassKey() && fcPassInfo(fcPassKey());
    $("fcScore").innerHTML = (pinf && pinf.left ? "<b>Card " + pinf.pos + " of " + pinf.total + "</b> &middot; " : "") + "<b>This session:</b> " + fc.sess.got + " got, " + fc.sess.miss + " missed &middot; " + fc.queue.length + " left" +
      " &middot; <b>Lifetime:</b> " + (st.got + st.miss ? Math.round(st.acc * 100) + "%" : "new") + " &middot; " + st.restudy + " Restudy";
    $("fcScore").title = "Lifetime: " + st.got + " got, " + st.miss + " missed";
    $("fcStage").hidden = !c; $("fcEmpty").hidden = !!c;
    var fpk = fcPassKey(), finf = fpk && fcPassInfo(fpk);
    if (!c && finf && finf.total) {
      var fm = FL.parseSec(fc.filter), fsec = FL.sectionById(fm.id), nw = fsec ? FL.sectionStats(fsec, fc.st).wrong : 0;
      $("fcStage").hidden = true; $("fcEmpty").hidden = false;
      $("fcEmpty").innerHTML = "<h2>You finished this deck</h2><p style='font-size:1.15rem'>" + finf.total + " of " + finf.total + " cards done" + (fc.sess.got + fc.sess.miss ? " &middot; this session " + fc.sess.got + " got it, " + fc.sess.miss + " missed" : "") + ".</p>" +
        "<button class='bigbtn go' id='fcOver'>&#8635; Start over</button><button class='bigbtn' id='fcFinMissed'" + (nw ? "" : " disabled") + ">Study missed (" + nw + ")</button><button class='bigbtn' id='fcToSec'>&#8249; Back to all sections</button>";
      $("fcOver").onclick = fcStartOver; $("fcFinMissed").onclick = function () { fcOpenSection(fm.id, "wrong", true); };
      $("fcToSec").onclick = function () { fc.view = "sections"; fcRender(); window.scrollTo(0, 0); };
      fcFit(); return;
    }
    if (!c) {
      var none = !fc.sess.total;
      $("fcEmpty").innerHTML = none ? "<p>No cards match this filter" + (fc.filter === "mine" ? ". You have no saved cards yet. Use the ... menu on a card to create one." : fc.filter === "restudy" ? ". Nothing is marked Restudy yet." : fc.filter === "unseen" ? ". You have seen every card." : ".") + "</p><button class='bigbtn' id='fcAll'>Show all cards</button><button class='bigbtn' id='fcToSec'>&#8249; Back to all sections</button>"
        : "<h2>Session done</h2><p style='font-size:1.3rem'>" + fc.sess.got + " got it, " + fc.sess.miss + " missed.</p><button class='bigbtn go' id='fcAgain'>Go again</button><button class='bigbtn' id='fcToSec'>&#8249; Back to all sections</button>" + (st.restudy ? "<button class='bigbtn' id='fcRe'>Restudy only (" + st.restudy + ")</button>" : "");
      var b; if ((b = $("fcToSec"))) b.onclick = function () { fc.view = "sections"; fcRender(); window.scrollTo(0, 0); };
      if ((b = $("fcAll"))) b.onclick = function () { fcSetFilter("all"); };
      if ((b = $("fcAgain"))) b.onclick = function () { fcStart(); }; if ((b = $("fcRe"))) b.onclick = function () { fcSetFilter("restudy"); };
      return;
    }
    var s = fc.st.cards[c.id] || {};
    var ttl = c.course === "sa" ? "Statement Analysis · " + c.health : c.custom ? (c.course === "acct" ? "BUS 5601 · " : c.course === "econ" ? "BUS 5421 · " : "") + FL.topicName(c.topic) + " · My card" : (c.course === "acct" ? "BUS 5601 · " : "BUS 5421 · ") + FL.topicName(c.topic);
    $("fcTopic").innerHTML = fcEsc(ttl + (s.seen ? "" : " · new")) + (c.custom ? "<span class='aibadge' title='Written with Grok'>AI</span>" : "") + (c.improved ? "<span class='aibadge imp' title='Improved with Grok on this device'>" + (c.custom ? "IMPROVED" : "AI IMPROVED") + "</span>" : "");
    $("fcStar").innerHTML = s.restudy ? "&#9733; Restudy" : "&#9734; Restudy"; $("fcStar").setAttribute("aria-pressed", s.restudy ? "true" : "false"); $("fcStar").classList.toggle("on", !!s.restudy);
    if (c.kind === "statement") {
      $("fcFront").innerHTML = "<div class='fcq'>" + fcEsc(c.company) + ": " + fcEsc(c.q) + "</div><div class='fctbls'>" + c.tables.map(fcTable).join("") + "</div>";
      $("fcBack").innerHTML = "<div class='fcans'>" + fcEsc(c.answer) + "</div><div class='fcwork'><b>Working:</b> " + fcEsc(c.work) + "</div><div class='fcint'><b>What it means:</b> " + fcEsc(c.interp) + "</div>";
    } else {
      $("fcFront").innerHTML = "<div class='fcq big" + (c.f.length > 170 ? " sm" : c.f.length > 90 ? " mid" : "") + "'>" + fcFrontHtml(c.f) + "</div>";
      $("fcBack").innerHTML = "<div class='fcbacktxt'>" + fcBackHtml(c.b) + "</div>";
    }
    ["fcFront", "fcBack"].forEach(function (fid) { var mb = document.createElement("button"); mb.type = "button"; mb.className = "fcmorebtn"; mb.textContent = "\u22EF"; mb.setAttribute("aria-label", "Card actions: improve, expand, create"); mb.setAttribute("aria-haspopup", "menu"); mb.title = "More: improve, expand, create"; mb.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); if (!$("fcMore").hidden) fcMoreClose(); else fcMoreOpen(mb); }); var qb = askButton(function () { openAskCard(c); }, "Ask Grok to explain this card in more depth"); qb.classList.add("fcask"); qb.title = "Ask Grok to explain this card"; $(fid).insertBefore(qb, $(fid).firstChild); $(fid).insertBefore(mb, $(fid).firstChild); });
    $("fcCard").classList.toggle("statement", c.kind === "statement");
    $("fcBack").hidden = !fc.flipped; $("fcCard").classList.toggle("flipped", fc.flipped);
    $("fcHint").textContent = fc.flipped ? (device === "desktop" ? "Did you get it? G or → got it, M or ← missed" : "Did you get it?") : (device === "desktop" ? "Click the card or press Space to flip" : "Tap the card to flip");
    $("fcGot").disabled = $("fcMissed").disabled = !fc.flipped;
    fcFit();
  }
  function fcFlip() { if (!fc.queue.length) return; fc.flipped = !fc.flipped; fcRender(); if (fc.flipped && device !== "desktop") { var b = $("fcBack"); b.scrollIntoView && b.scrollIntoView({ block: "nearest" }); } }
  function fcAnswer(got) {
    if (!fc.queue.length || !fc.flipped) return;
    var aid = fc.queue[0], pk = fcPassKey(), pp = pk && fc.st.pass && fc.st.pass[pk];
    if (pp && got) { if (!pp.done) pp.done = {}; pp.done[aid] = 1; pp.u = Date.now(); }
    fc.queue = FL.answer(fc.st, fc.queue, fc.queue[0], got); fc.sess[got ? "got" : "miss"]++; fcHist(got); fc.flipped = false; fcSave(); fcRender();
    if (device !== "desktop") window.scrollTo(0, 0);
  }
  function fcSkip() { if (fc.queue.length > 1) { fc.queue.push(fc.queue.shift()); fc.flipped = false; fcRender(); } }
  function fcStar() { var id = fc.queue[0]; if (!id) return; var s = fc.st.cards[id] || {}; FL.setRestudy(fc.st, id, !s.restudy); fcSave(); fcRender(); }
  function fcSetFilter(v) { fc.filter = v; $("fcFilter").value = v; fcSave(); fcStart(); }
  function renderFlash() { if (fc.view === "study" && fc.queue) fcRender(); else { fc.view = "sections"; renderSections(); } }
  /* ---- v5.1: sections list (book chapters, topics, Statement Analysis, My cards) ---- */
  function fcSecLabel(filter) {
    var m = /^sec:/.test(filter) ? FL.parseSec(filter) : FL.filterSection(filter); if (!m) return "";
    var sec = FL.sectionById(m.id); if (!sec) return ""; var mode = { all: "Study all", wrong: "Study missed", restudy: "Study restudy" }[m.mode];
    return sec.title + (mode ? " \u00B7 " + mode : "");
  }
  // keep a small log per section: one entry per study session (date, mode, cards studied, right, wrong)
  function fcHist(got) {
    var m = FL.filterSection(fc.filter); if (!m) return;
    if (!fc.histRef) fc.histRef = FL.addHistory(fc.st, m.id, m.mode, { t: Date.now(), n: 0, got: 0, miss: 0 });
    fc.histRef.n++; fc.histRef[got ? "got" : "miss"]++; fc.histRef.t = Date.now();
  }
  function fcDate(t) { var d = new Date(t), mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()], h = d.getHours(), ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return mo + " " + d.getDate() + ", " + h + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes() + ap; }
  function fcSecHtml(sec) {
    var n = FL.sectionStats(sec, fc.st), hist = (fc.st.hist && fc.st.hist[sec.id]) || [], key = fcEsc(sec.id);
    function btn(mode, label, count, extra) {
      var pi = fcPassInfo("sec:" + sec.id + ":" + mode), at = pi && pi.done > 0 && pi.left > 0 ? " &middot; at " + pi.pos : "";
      return "<button class='fcsbtn" + (extra || "") + "' data-sec='" + key + "' data-mode='" + mode + "'" + (count ? "" : " disabled") + "><b>" + label + "</b><span>" + count + (count === 1 ? " card" : " cards") + at + "</span></button>";
    }
    var h = "<div class='fcsec' data-secid='" + key + "'><div class='fcsectitle'>" + fcEsc(sec.title) + "</div>" +
      "<div class='fcsecnums' aria-label='Counts'><span class='n right'><b>" + n.right + "</b> Right</span><span class='n wrong'><b>" + n.wrong + "</b> Wrong</span><span class='n restudy'><b>" + n.restudy + "</b> Restudy</span><span class='n unseen'><b>" + n.unseen + "</b> Unseen</span><span class='n total'><b>" + n.total + "</b> Total</span></div>" +
      "<div class='fcsecbtns'>" + btn("all", "Study all", n.total, " go") + btn("wrong", "Study missed", n.wrong, " miss") + btn("restudy", "Study restudy", n.restudy, " rs") + "</div>";
    h += "<details class='fchist'><summary>History (" + hist.length + (hist.length ? " session" + (hist.length === 1 ? "" : "s") : "") + ")</summary>";
    if (!hist.length) h += "<div class='small'>No sessions yet.</div>";
    else h += "<table class='fchtbl'><tr><th>When</th><th>Cards</th><th>Studied</th><th>Right</th><th>Wrong</th></tr>" + hist.slice(0, 10).map(function (e) {
      return "<tr><td>" + fcDate(e.t) + "</td><td>" + ({ all: "All", wrong: "Missed", restudy: "Restudy" }[e.mode] || "All") + "</td><td>" + e.n + "</td><td class='r'>" + e.got + "</td><td class='w'>" + e.miss + "</td></tr>"; }).join("") + "</table>";
    return h + "</details></div>";
  }
  // v5.3: the study screen fits the window: the card fills the space left above the grade buttons, and its text shrinks until it all fits (no page scrolling)
  function fcFit() {
    var stg = $("fcStudy"), card = $("fcCard"); if (!stg || stg.hidden || !document.body.classList.contains("fcstudy")) return;
    window.scrollTo(0, 0); var top = stg.getBoundingClientRect().top; stg.style.height = Math.max(320, window.innerHeight - top - 6) + "px";
    var faces = card.querySelectorAll(".fcmeta, .fcface, .fchint"), z = 1;
    function setZ(v) { Array.prototype.forEach.call(faces, function (f) { f.style.zoom = v; }); }
    setZ(1); while (card.scrollHeight > card.clientHeight + 1 && z > 0.42) { z = Math.round((z - 0.04) * 100) / 100; setZ(z); }
    card.classList.toggle("fcover", card.scrollHeight > card.clientHeight + 1);
  }
  function fcUnfit() { document.body.classList.remove("fcstudy"); var stg = $("fcStudy"); if (stg) stg.style.height = ""; }
  window.addEventListener("resize", function () { if (fc && fc.view === "study") { clearTimeout(fcFit.t); fcFit.t = setTimeout(fcFit, 80); } });
  function renderSections() {
    var box = $("fcSections"); if (!box || !fc) return; fcUnfit();
    $("fcStudy").hidden = true; box.hidden = false;
    var open = {}; Array.prototype.forEach.call(box.querySelectorAll("details[data-g]"), function (d) { open[d.dataset.g] = d.open; });
    var openHist = {}; Array.prototype.forEach.call(box.querySelectorAll(".fcsec"), function (d) { var x = d.querySelector(".fchist"); if (x && x.open) openHist[d.dataset.secid] = 1; });
    var h = "<h2 class='fcsechead'>Flash Cards</h2><p class='small fcsecintro'>Pick a section. Right = your last answer was Got it. Wrong = your last answer was Missed. Restudy = starred cards (a miss stars a card for you).</p>";
    var best = null; Object.keys(fc.st.pass || {}).forEach(function (k) { var inf = fcPassInfo(k), m = FL.parseSec(k); if (inf && inf.left > 0 && inf.done > 0 && FL.sectionById(m.id) && (!best || inf.u > best.inf.u)) best = { k: k, inf: inf, m: m }; });
    if (best) h += "<button class='bigbtn go fcresume' id='fcResume' data-sec='" + fcEsc(best.m.id) + "' data-mode='" + best.m.mode + "'>&#9654; Continue &middot; " + fcEsc(fcSecLabel(best.k)) + " &middot; " + best.inf.pos + " of " + best.inf.total + "</button>";
    FL.sectionList().forEach(function (g) {
      var inner = g.sections.map(fcSecHtml).join(""), many = g.sections.length > 2, dflt = g.id === "all" || g.id === "books" || g.id === "other";
      if (!many && g.id === "all") { h += "<div class='fcgroup'>" + inner + "</div>"; return; }
      var isOpen = (g.id in open) ? open[g.id] : dflt;
      h += "<details class='fcgroup' data-g='" + g.id + "'" + (isOpen ? " open" : "") + "><summary>" + fcEsc(g.title) + " <span class='small'>(" + g.sections.length + " section" + (g.sections.length === 1 ? "" : "s") + ")</span></summary>" + inner + "</details>";
    });
    box.innerHTML = h;
    Array.prototype.forEach.call(box.querySelectorAll(".fcsec"), function (d) { if (openHist[d.dataset.secid]) d.querySelector(".fchist").open = true; });
    Array.prototype.forEach.call(box.querySelectorAll(".fcsbtn"), function (b) { b.addEventListener("click", function () { if (!b.disabled) fcOpenSection(b.dataset.sec, b.dataset.mode); }); });
    var r = $("fcResume"); if (r) r.onclick = function () { fcOpenSection(r.dataset.sec, r.dataset.mode); };
  }
  function fcOpenSection(secId, mode, fresh) {
    fc.view = "study"; fc.filter = "sec:" + secId + ":" + mode; fcFilterOptions(); fcSave(); fcStart(fresh); window.scrollTo(0, 0);
  }
  function renderFcStats() {
    var box = $("fcStats"); if (!box || !FL) return;
    var s = FL.stats(fc.st), h = "<div style='font-size:1.6rem;font-weight:900'>" + s.seen + " of " + s.total + " <span class='small'>cards seen</span></div>" +
      "<div class='small'>Lifetime: " + s.got + " got it, " + s.miss + " missed" + (s.got + s.miss ? " (" + Math.round(s.acc * 100) + "%)" : "") + " &middot; " + s.mastered + " mastered &middot; " + s.restudy + " marked Restudy &middot; " + s.sessions + " sessions</div>";
    Object.keys(FL.COURSES).forEach(function (k) { var b = s.byCourse[k]; if (!b) return; var n = b.got + b.miss;
      h += "<div class='small'>" + fcEsc(FL.COURSES[k]) + ": seen " + b.seen + "/" + b.total + (n ? ", " + Math.round(b.got / n * 100) + "% got" : "") + "</div>"; });
    if (s.byCourse.mine) { var bm = s.byCourse.mine, nm = bm.got + bm.miss; h += "<div class='small'>My cards (AI): " + bm.total + " saved, seen " + bm.seen + (nm ? ", " + Math.round(bm.got / nm * 100) + "% got" : "") + "</div>"; }
    h += "<button class='btn' id='fcGoStats'>Open flash cards</button>"; box.innerHTML = h; $("fcGoStats").onclick = function () { switchTab("cards"); };
  }
  function initFlash() {
    if (!FL) return;
    fc = { st: storage.load("fc", null) || FL.newState(), filter: storage.load("fcFilter", "all"), shuffle: storage.load("fcShuffle", true), queue: null, sess: null, flipped: false, view: "sections", histRef: null };
    if (!fc.st.hist || typeof fc.st.hist !== "object") fc.st.hist = {};
    if (!fc.st.cards) fc.st = FL.newState(); if (!fc.st.life) fc.st.life = { got: 0, miss: 0 };
    initAiCards(); migrateOldChapterCards(); fcFilterOptions();
    var sh = $("fcShuffle"); function shLabel() { sh.innerHTML = fc.shuffle ? "&#128256; Shuffle on" : "&#10145; In order"; sh.setAttribute("aria-pressed", fc.shuffle ? "true" : "false"); } shLabel();
    sh.addEventListener("click", function () { fc.shuffle = !fc.shuffle; shLabel(); fcSave(); fcStart(true); });   // a new order = a new pass
    $("fcRestart").addEventListener("click", function () { var b = $("fcRestart"); if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.classList.add("sure"); b.querySelector(".fcrtxt").textContent = " Tap again"; setTimeout(function () { b.dataset.sure = ""; b.classList.remove("sure"); b.querySelector(".fcrtxt").textContent = " Start over"; }, 3000); return; }
      b.dataset.sure = ""; b.classList.remove("sure"); b.querySelector(".fcrtxt").textContent = " Start over"; fcStartOver(); });
    $("fcBackSec").addEventListener("click", function () { fc.view = "sections"; fcRender(); window.scrollTo(0, 0); });
    $("fcFilter").addEventListener("change", function () { fcSetFilter($("fcFilter").value); });
    $("fcCard").addEventListener("click", function (e) { if (e.target.closest("#fcStar")) return; fcFlip(); });
    $("fcStar").addEventListener("click", function (e) { e.stopPropagation(); fcStar(); });
    $("fcGot").addEventListener("click", function () { fcAnswer(true); });
    $("fcMissed").addEventListener("click", function () { fcAnswer(false); });
    document.addEventListener("keydown", function (e) {
      if (!$("tab-cards").classList.contains("active") || fc.view !== "study" || e.ctrlKey || e.metaKey || e.altKey) return;
      var tg = e.target, tag = tg && tg.tagName; if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
      if (!$("menu").hidden || !$("fcMore").hidden || (document.querySelector(".sheet:not([hidden])"))) return;
      var k = e.key;
      if (tg && tg.classList && (tg.classList.contains("askq") || tg.classList.contains("fcmorebtn")) && (k === " " || k === "Enter")) return;
      if (k === " ") { e.preventDefault(); fcFlip(); }
      else if (k === "Enter" && tg === $("fcCard")) { e.preventDefault(); fcFlip(); }
      else if (k === "g" || k === "G" || k === "ArrowRight") { e.preventDefault(); fcAnswer(true); }
      else if (k === "m" || k === "M" || k === "ArrowLeft") { e.preventDefault(); fcAnswer(false); }
      else if (k === "r" || k === "R") { e.preventDefault(); fcStar(); }
      else if (k === "n" || k === "N") { e.preventDefault(); fcSkip(); }
    });
    window.__fc = fc;
  }


  /* ================= v5.2: sync flash card progress across devices (Cloudflare Worker + KV) =================
     localStorage stays the offline copy. Each card result carries u (updated time); SyncMerge (sync-merge.js) merges: newest card wins,
     history = union by session id, My cards / improved cards newest wins with delete markers. Sync on load, after grading (debounced),
     when the app is hidden or shown again, and when the connection comes back. */
  var SM = window.SyncMerge, SY = { code: "", last: 0, snapFc: {}, snapH: "", snapC: {}, snapO: {}, dirty: 0, timer: 0, first: 0, busy: false, pending: false, msg: "", err: false, retry: 0 };
  var SYNC_IDLE_MS = window.__SYNC_IDLE_MS || 20000, SYNC_MAX_MS = window.__SYNC_MAX_MS || 90000;   // free-tier friendly: at most about one write per 20-90 s while studying
  function syncUrl() { var u = window.__SYNC_URL || (window.ASK_CONFIG && window.ASK_CONFIG.url) || ""; return u.replace(/\/+$/, ""); }
  function sigNoU(o) { var c = {}; for (var k in o) if (k !== "u") c[k] = o[k]; return SM.stable(c); }
  function syncSnap() {
    if (!fc || !SM) return; SY.snapFc = {}; for (var id in fc.st.cards) SY.snapFc[id] = sigNoU(fc.st.cards[id]); SY.snapH = SM.stable(fc.st.hist || {}); SY.snapP = SM.stable(fc.st.pass || {});
    SY.snapC = {}; MYC.cards.forEach(function (c) { SY.snapC[c.id] = sigNoU(c); }); SY.snapO = {}; for (var o in MYC.over) SY.snapO[o] = sigNoU(MYC.over[o]);
  }
  function syncStampFc() {
    if (!fc || !SM || !SY.ready) return; var now = Date.now(), ch = false, id;
    for (id in fc.st.cards) { var g = sigNoU(fc.st.cards[id]); if (SY.snapFc[id] !== g) { fc.st.cards[id].u = now; SY.snapFc[id] = g; ch = true; } }
    var h = fc.st.hist || {}; for (var sec in h) h[sec].forEach(function (e) { if (!e.id) e.id = "s" + (e.t || now).toString(36) + Math.floor(Math.random() * 1679616).toString(36); });
    var hs = SM.stable(h); if (hs !== SY.snapH) { SY.snapH = hs; ch = true; }
    var ps = SM.stable(fc.st.pass || {}); if (ps !== SY.snapP) { SY.snapP = ps; ch = true; }
    if (ch) syncDirty();
  }
  function syncStampMy() {
    if (!SM || !SY.ready) return; var now = Date.now(), seen = {}, k; if (!MYC.del || typeof MYC.del !== "object") MYC.del = {};
    MYC.cards.forEach(function (c) { seen[c.id] = 1; var g = sigNoU(c); if (SY.snapC[c.id] !== g) { c.u = now; SY.snapC[c.id] = g; } });
    for (k in SY.snapC) if (!seen[k]) { MYC.del["c:" + k] = now; delete SY.snapC[k]; }
    for (k in MYC.over) { var g2 = sigNoU(MYC.over[k]); if (SY.snapO[k] !== g2) { MYC.over[k].u = now; SY.snapO[k] = g2; } }
    for (k in SY.snapO) if (!MYC.over[k]) { MYC.del["o:" + k] = now; delete SY.snapO[k]; }
  }
  function syncDirty() { if (!SY.ready) return; SY.dirty++; if (!SY.code) return; var now = Date.now(); if (!SY.first) SY.first = now; syncSchedule(Math.max(0, Math.min(SYNC_IDLE_MS, SY.first + SYNC_MAX_MS - now))); }
  function syncSchedule(ms) { clearTimeout(SY.timer); SY.timer = setTimeout(function () { syncNow(); }, ms); }
  function syncLocalDoc() {
    var cards = {}; MYC.cards.forEach(function (c) { cards[c.id] = c; });
    return { v: 1, cards: fc.st.cards, hist: fc.st.hist || {}, pass: fc.st.pass || {}, my: { cards: cards, over: MYC.over, del: MYC.del || {} }, sessions: fc.st.sessions || 0 };
  }
  function sumGM(cards) { var g = 0, m = 0; for (var id in cards) { g += +cards[id].got || 0; m += +cards[id].miss || 0; } return { g: g, m: m }; }
  function syncApply(d) {
    var before = sumGM(fc.st.cards), offG = Math.max(0, (fc.st.life.got || 0) - before.g), offM = Math.max(0, (fc.st.life.miss || 0) - before.m);
    fc.st.cards = d.cards || {}; fc.st.hist = d.hist || {}; fc.st.pass = d.pass || {}; fc.st.sessions = Math.max(fc.st.sessions || 0, d.sessions || 0);
    var after = sumGM(fc.st.cards); fc.st.life = { got: after.g + offG, miss: after.m + offM };
    if (fc.histRef && fc.histRef.id) { var hr = null; for (var sec in fc.st.hist) fc.st.hist[sec].forEach(function (e) { if (e.id === fc.histRef.id) hr = e; }); fc.histRef = hr; }
    var my = d.my || {}; MYC.cards = Object.keys(my.cards || {}).map(function (k) { return my.cards[k]; }).sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    MYC.over = my.over || {}; MYC.del = my.del || {}; FL.setUser(MYC);
    storage.save("fc", fc.st); storage.save("mycards", MYC); syncSnap();
    if (fc.queue) fc.queue = fc.queue.filter(function (id) { return !!fcCard(id); });
    fcFilterOptions(); if ($("tab-cards").classList.contains("active")) fcRender(); if ($("tab-progress").classList.contains("active")) renderFcStats();
  }
  function syncStatus(msg, err) { SY.msg = msg; SY.err = !!err; renderSync(); }
  function syncReq(method, doc, keep) {
    var o = { method: method, cache: "no-store", headers: {} };
    if (doc) { o.body = JSON.stringify({ doc: doc }); o.headers["Content-Type"] = "application/json"; if (keep && o.body.length < 60000) o.keepalive = true; }
    return fetch(syncUrl() + "/progress/" + encodeURIComponent(SY.code), o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); });
  }
  function syncNow(keep) {
    if (!SY.code || !SM || !fc) return Promise.resolve();
    if (!syncUrl()) { syncStatus("Sync is not available (no server address).", true); return Promise.resolve(); }
    if (navigator.onLine === false) { syncStatus("Offline. Your results are saved on this device and will sync when you are back online.", true); return Promise.resolve(); }
    if (SY.busy) { SY.pending = true; return Promise.resolve(); }
    clearTimeout(SY.timer); SY.busy = true; var sent = SY.dirty, put = sent > 0;
    if (!SY.msg || SY.err) syncStatus("Syncing...");
    return syncReq(put ? "PUT" : "GET", put ? syncLocalDoc() : null, keep).then(function (j) {
      if (j.status === 429) { if (j.doc) syncMergeIn(j.doc); SY.retry = (+j.retryAfter || 5) * 1000; if (j.error === "daily_limit") { syncStatus("Sync paused for today (daily limit). Your results are safe on this device.", true); return; } syncSchedule(Math.min(SY.retry, 600000)); return; }
      if (j.status !== 200) { syncStatus(j.error === "bad_code" ? "That sync code is not valid. Check it and try again." : "Could not sync right now (" + (j.error || ("error " + j.status)) + "). I will try again.", true); if (j.error !== "bad_code") syncSchedule(60000); return; }
      var remote = j.doc, merged = syncMergeIn(remote);
      if (put) { if (SY.dirty === sent) { SY.dirty = 0; SY.first = 0; } }
      else if (!remote || !SM.same(merged, SM.merge(remote, {}))) { SY.dirty = Math.max(SY.dirty, 1); SY.pending = true; }
      SY.last = Date.now(); storage.save("sync", { code: SY.code, last: SY.last }); syncStatus("");
    }, function () { syncStatus("Could not reach the sync server. Your results are saved on this device; I will try again.", true); syncSchedule(60000); })
      .then(function () { SY.busy = false; if (SY.pending) { SY.pending = false; syncSchedule(SY.dirty ? 2500 : 0); } });
  }
  function syncMergeIn(remote) {
    var local = syncLocalDoc(), merged = SM.merge(local, remote || {});
    if (!SM.same(merged, SM.merge(local, {}))) syncApply(merged);
    return merged;
  }
  var SYNC_ABC = "abcdefghjkmnpqrstuvwxyz23456789";
  function syncNewCode() {
    var out = "", b = new Uint8Array(64), i = 0; crypto.getRandomValues(b);
    while (out.replace(/-/g, "").length < 30) { if (i >= b.length) { crypto.getRandomValues(b); i = 0; } var x = b[i++]; if (x >= 248) continue; out += SYNC_ABC[x % 31]; if (out.replace(/-/g, "").length % 5 === 0 && out.replace(/-/g, "").length < 30) out += "-"; }
    return out;
  }
  function syncNorm(t) { var c = String(t || "").toLowerCase().replace(/[^a-z0-9]/g, ""); if (c.length !== 30) return ""; return c.match(/.{5}/g).join("-"); }
  function syncUse(code) {
    SY.code = code; SY.last = 0; storage.save("sync", { code: code, last: 0 }); SY.dirty = Math.max(SY.dirty, 1); SY.first = 0;
    syncStatus("Syncing..."); return syncNow();
  }
  function renderSync() {
    var on = !!SY.code, st = $("syncStatus"); if (!st) return;
    $("syncOn").hidden = !on; $("syncOff").hidden = on; $("syncCode").textContent = SY.code;
    var t = SY.msg || (on ? (SY.last ? "Sync is on. Last synced " + new Date(SY.last).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + "." : "Sync is on.") : "Sync is off on this device. Results stay on this device only.");
    st.textContent = t; st.className = "syncstatus" + (on && !SY.err && !SY.msg ? " ok" : SY.err ? " err" : "");
  }
  function initSync() {
    if (!fc || !SM) return;
    var sv = storage.load("sync", null); if (sv && sv.code) { SY.code = sv.code; SY.last = sv.last || 0; }
    syncSnap(); SY.ready = true; renderSync();
    $("btnSyncNew").addEventListener("click", function () { syncUse(syncNewCode()); });
    $("btnSyncUse").addEventListener("click", function () { var c = syncNorm($("syncInput").value); if (!c) { syncStatus("That does not look like a sync code. It has 30 letters and numbers (dashes optional).", true); return; } $("syncInput").value = ""; syncUse(c); });
    $("btnSyncNow").addEventListener("click", function () { syncNow(); });
    $("btnSyncCopy").addEventListener("click", function () { var c = SY.code; function done() { syncStatus("Code copied. Paste it into Settings on your other device."); setTimeout(function () { syncStatus(""); }, 5000); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(done, function () { syncStatus("Could not copy. Select the code and copy it by hand.", true); }); else syncStatus("Select the code and copy it by hand.", true); });
    $("btnSyncOff").addEventListener("click", function () { var b = $("btnSyncOff"); if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tap again to turn off sync here"; setTimeout(function () { b.dataset.sure = ""; b.textContent = "Turn off sync on this device"; }, 4000); return; }
      b.dataset.sure = ""; b.textContent = "Turn off sync on this device"; clearTimeout(SY.timer); SY.code = ""; SY.msg = ""; storage.save("sync", null); syncStatus("Sync turned off on this device. Your results stay here; other devices keep syncing."); });
    document.addEventListener("visibilitychange", function () { if (!SY.code) return; if (document.visibilityState === "hidden") { if (SY.dirty) syncNow(true); } else syncNow(); });
    window.addEventListener("online", function () { if (SY.code) syncNow(); });
    window.addEventListener("pagehide", function () { if (SY.code && SY.dirty && !SY.busy) syncNow(true); });
    if (SY.code) syncNow();
    window.__sync = SY; window.__syncNow = syncNow;
  }


  /* ================= v4.9: AI flash cards (Improve / Expand / Create), My cards, export / import ================= */
  var MYC = { cards: [], over: {} }, AI = { mode: null, card: null, busy: false, res: null, err: "", prompt: "", topic: "mine", tries: 0 };
  function mycLoad() {
    var m = storage.load("mycards", null); MYC = (m && typeof m === "object") ? m : {};
    if (!Array.isArray(MYC.cards)) MYC.cards = []; if (!MYC.over || typeof MYC.over !== "object") MYC.over = {};
    FL.setUser(MYC);
  }
  // v5.1: the Chapter 1 key-term cards are now built in. If Bill had already imported the earlier "my-ch1-..." file, drop those copies and move their scores to the built-in cards.
  function migrateOldChapterCards() {
    if (!fc || !FL.BK.length) return; var byFront = {}; FL.BK.forEach(function (c) { byFront[c.f] = c.id; }); var moved = 0;
    MYC.cards = MYC.cards.filter(function (c) {
      var nid = /^my-ch\d+-/.test(c.id) && byFront[c.f]; if (!nid) return true;
      var o = fc.st.cards[c.id]; if (o && !fc.st.cards[nid]) fc.st.cards[nid] = o; delete fc.st.cards[c.id]; moved++; return false;
    });
    if (moved) { mycSave(); fcSave(); }
  }
  function mycSave() { syncStampMy(); storage.save("mycards", MYC); FL.setUser(MYC); syncDirty(); }
  function mycNewId() { var id; do { id = "my-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 46656).toString(36); } while (MYC.cards.some(function (c) { return c.id === id; })); return id; }
  function aiErrText(status, j) {
    j = j || {};
    if (status === 429) { var mins = Math.max(1, Math.round((j.retryAfter || 3600) / 60)); return j.scope === "day" ? "You have reached today's limit of Grok questions. It resets in about " + Math.round(mins / 60) + " hours." : "That is a lot of Grok requests this hour. Try again in about " + mins + " minutes."; }
    if (status === 503) return "Ask Grok is not switched on yet.";
    return "Grok could not do that right now (error " + status + "). Tap Try again.";
  }
  function aiValid(arr, max) {
    if (!Array.isArray(arr)) return null; var out = [];
    arr.forEach(function (c) {
      if (!c || typeof c !== "object") return; var f = c.front != null ? c.front : c.f, b = c.back != null ? c.back : c.b;
      if (typeof f !== "string" || typeof b !== "string") return; f = f.trim().slice(0, 300); b = b.trim().slice(0, 900); if (f && b) out.push({ f: f, b: b });
    });
    return out.length ? out.slice(0, max || 5) : null;
  }
  function aiParse(text) {
    if (typeof text !== "string") return null; var t = text.replace(/```(?:json)?/gi, ""), a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) return null; try { var o = JSON.parse(t.slice(a, b + 1)); return o && o.cards; } catch (e) { return null; }
  }
  // one request to the Worker's JSON card modes. Resolves to [{f,b}], rejects with a friendly Error.
  function aiCall(kind, o) {
    if (!ASK.url) return Promise.reject(new Error("AI cards need Ask Grok, which is not switched on yet."));
    var body = { kind: kind, topic: String(o.topic || "").slice(0, 200), partText: String(o.text || "").slice(0, 4000), prompt: String(o.prompt || "").slice(0, 300) };
    return fetch(ASK.url + "/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .catch(function () { throw new Error(navigator.onLine === false ? "No internet connection. AI cards need internet." : "Could not reach Grok. Check the connection and tap Try again."); })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(aiErrText(r.status, j)); });
        return r.json().catch(function () { return {}; });
      })
      .then(function (j) {
        if (Array.isArray(j.cards) && !j.cards.length) throw new Error("Grok could not make a card from that. Try rephrasing, with an accounting, economics or finance topic.");
        var max = kind === "expand" ? 5 : 1, cards = aiValid(j.cards, max) || aiValid(aiParse(j.content), max);
        if (!cards) throw new Error("Grok's answer was not in the right format. Tap Try again.");
        return cards;
      });
  }
  function fcCurrent() { var id = fc && fc.view === "study" && fc.queue && fc.queue[0]; return id ? fcCard(id) : null; }
  function fcSay(t) { var m = $("fcImpMsg"); if (!m) return; m.textContent = t; m.hidden = !t; clearTimeout(fcSay.t); if (t) fcSay.t = setTimeout(function () { m.hidden = true; }, 9000); }
  function fcAddToQueue(ids) {
    if (!fc.queue || !fc.queue.length) { fcStart(); return; }
    var ok = FL.filterCards(fc.filter, fc.st).map(function (c) { return c.id; });
    ids.slice().reverse().forEach(function (id) { if (ok.indexOf(id) >= 0 && fc.queue.indexOf(id) < 0) { fc.queue.splice(1, 0, id); fc.sess.total++; } });
  }
  /* ---- the small card menu ---- */
  function fcMoreClose() { $("fcMore").hidden = true; }
  function fcMoreOpen(btn) {
    var c = fcCurrent(); if (!c) return; var m = $("fcMore");
    var isSt = c.kind === "statement";
    $("fcmImprove").hidden = isSt; $("fcmReset").hidden = !(c.improved); $("fcmDelete").hidden = !c.custom;
    $("fcmDelete").textContent = "\uD83D\uDDD1 Delete this card"; $("fcmDelete").dataset.sure = "";
    m.hidden = false; var r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    var left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    m.style.left = left + "px"; m.style.top = top + "px";
    var first = m.querySelector("button:not([hidden])"); if (first) first.focus();
  }
  /* ---- the Improve / Expand / Create sheet ---- */
  function aiTopicOptions(sel) {
    var h = "<option value='mine'>Any topic (goes in My cards)</option>";
    [["acct", "BUS 5601 topics"], ["econ", "BUS 5421 topics"]].forEach(function (g) {
      h += "<optgroup label='" + g[1] + "'>"; FL.TOPICS.filter(function (t) { return t.course === g[0]; }).forEach(function (t) { h += "<option value='" + t.key + "'" + (t.key === sel ? " selected" : "") + ">" + fcEsc(t.name) + "</option>"; }); h += "</optgroup>";
    });
    return h;
  }
  function aiShow() { $("fcAi").hidden = false; }
  function aiClose() { $("fcAi").hidden = true; AI.mode = null; AI.card = null; AI.res = null; AI.busy = false; AI.tries++; try { var a = document.activeElement; if (a && a.blur) a.blur(); if ($("tab-cards").classList.contains("active")) $("fcCard").focus({ preventScroll: true }); } catch (e) {} }
  function aiFoot(btns) { var f = $("fcAiFoot"); f.innerHTML = btns.map(function (b) { return "<button class='btn " + (b.cls || "") + "' id='" + b.id + "'" + (b.dis ? " disabled" : "") + ">" + b.t + "</button>"; }).join(""); btns.forEach(function (b) { $(b.id).addEventListener("click", b.fn); }); }
  function aiRender() {
    var body = $("fcAiBody"), c = AI.card, title = { improve: "\u2728 Improve this card", expand: "\u2795 More cards like this", create: "\uD83D\uDCDD Create a card" }[AI.mode] || "";
    $("fcAiTitle").textContent = title;
    var err = AI.err ? "<div class='aierr' role='alert'>" + fcEsc(AI.err) + "</div>" : "";
    if (AI.busy) { body.innerHTML = "<div class='aibusy'>Grok is " + (AI.mode === "create" ? "writing your card" : AI.mode === "expand" ? "writing new cards" : "rewriting this card") + "\u2026</div>"; aiFoot([{ id: "aiCancel", t: "Cancel", fn: aiClose }]); return; }
    if (AI.mode === "create" && !AI.res) {
      body.innerHTML = "<label class='lbl' for='aiPrompt'>What should the card be about?</label><textarea id='aiPrompt' rows='3' maxlength='300' placeholder='Type a topic or a question, e.g. What is working capital?'>" + fcEsc(AI.prompt) + "</textarea>" +
        "<label class='lbl' for='aiTopic'>Course topic (optional)</label><select id='aiTopic'>" + aiTopicOptions(AI.topic) + "</select>" + err;
      aiFoot([{ id: "aiDraft", t: "Draft the card", cls: "go", fn: aiDoCreate }, { id: "aiCancel", t: "Cancel", fn: aiClose }]);
      $("aiPrompt").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); aiDoCreate(); } });
      $("aiPrompt").focus(); return;
    }
    if (!AI.res) { body.innerHTML = err; aiFoot([{ id: "aiAgain", t: "\u21BB Try again", cls: "go", fn: aiRun }, { id: "aiCancel", t: "Close", fn: aiClose }]); return; }
    if (AI.mode === "improve") {
      var n = AI.res[0];
      body.innerHTML = "<div class='aicmp'><div class='aicol'><h4>Before</h4><div class='f'>" + fcEsc(c.f) + "</div><div class='b'>" + fcEsc(c.b) + "</div></div><div class='aicol new'><h4>After (Grok)</h4><div class='f'>" + fcEsc(n.f) + "</div><div class='b'>" + fcEsc(n.b) + "</div></div></div>" + err;
      aiFoot([{ id: "aiSave", t: "Save", cls: "go", fn: aiSaveImprove }, { id: "aiDiscard", t: "Discard", fn: aiClose }, { id: "aiAgain", t: "\u21BB Try again", fn: aiRun }]); $("aiSave").focus();
    } else if (AI.mode === "expand") {
      body.innerHTML = "<p class='small'>Tick the cards to keep.</p>" + AI.res.map(function (x, i) { return "<label class='aipick'><input type='checkbox' data-i='" + i + "' checked><div><div class='f'>" + fcEsc(x.f) + "</div><div class='b'>" + fcEsc(x.b) + "</div></div></label>"; }).join("") + err;
      var upd = function () { var k = body.querySelectorAll("input:checked").length; var sv = $("aiSave"); sv.disabled = !k; sv.textContent = k ? "Save " + k + " card" + (k === 1 ? "" : "s") : "Save"; };
      aiFoot([{ id: "aiSave", t: "Save", cls: "go", fn: aiSaveExpand }, { id: "aiDiscard", t: "Discard", fn: aiClose }, { id: "aiAgain", t: "\u21BB Try again", fn: aiRun }]);
      Array.prototype.forEach.call(body.querySelectorAll("input"), function (i) { i.addEventListener("change", upd); }); upd();
    } else {
      var d = AI.res[0];
      body.innerHTML = "<p class='small'>Draft from Grok. You can edit it before saving.</p><label class='lbl' for='aiF'>Front (question or term)</label><textarea id='aiF' rows='2' maxlength='600'>" + fcEsc(d.f) + "</textarea><label class='lbl' for='aiB'>Back (answer)</label><textarea id='aiB' rows='5' maxlength='1500'>" + fcEsc(d.b) + "</textarea>" + err;
      aiFoot([{ id: "aiSave", t: "Save card", cls: "go", fn: aiSaveCreate }, { id: "aiDiscard", t: "Discard", fn: aiClose }, { id: "aiAgain", t: "\u21BB Redraft", fn: aiRun }]);
    }
  }
  function aiRun() {
    var tok = ++AI.tries; AI.busy = true; AI.err = ""; AI.res = (AI.mode === "create") ? null : null; aiRender();
    var c = AI.card, name = c ? (c.course === "sa" ? "Statement Analysis" : FL.topicName(c.topic)) : (AI.topic !== "mine" ? FL.topicName(AI.topic) : "");
    var p = AI.mode === "create" ? aiCall("create", { topic: name, prompt: AI.prompt }) : aiCall(AI.mode, { topic: name, text: askCardText(c) });
    p.then(function (cards) { if (tok !== AI.tries) return; AI.busy = false; AI.res = cards; aiRender(); },
      function (e) { if (tok !== AI.tries) return; AI.busy = false; AI.res = null; AI.err = e.message; aiRender(); });
  }
  function aiDoCreate() {
    var v = ($("aiPrompt").value || "").trim(); if (!v) { AI.err = "Type a topic or a question first."; aiRender(); return; }
    AI.prompt = v.slice(0, 300); AI.topic = $("aiTopic").value; aiRun();
  }
  function aiOpen(mode, card) {
    $("menu").hidden = true; fcMoreClose();
    if (mode !== "create" && !card) { fcSay("No card is showing. Open Flash Cards first."); return; }
    if (mode === "improve" && card.kind === "statement") { fcSay("Improve works on the text cards. Statement Analysis cards are generated with checked arithmetic."); return; }
    AI = { mode: mode, card: card || null, busy: false, res: null, err: "", prompt: "", topic: (card && card.topic && FL.validTopic(card.topic)) ? card.topic : "mine", tries: AI.tries + 1 };
    aiShow();
    if (mode === "create") aiRender(); else aiRun();
  }
  function aiSaveImprove() {
    var c = AI.card, n = AI.res && AI.res[0]; if (!c || !n) return;
    var mc = c.custom && MYC.cards.filter(function (x) { return x.id === c.id; })[0];
    if (mc) { if (!mc.orig) mc.orig = { f: mc.f, b: mc.b }; mc.f = n.f; mc.b = n.b; } else MYC.over[c.id] = { f: n.f, b: n.b, ts: Date.now() };
    mycSave(); aiClose(); fcRender(); fcSay("Saved. The improved card replaces the original on this device (Reset to original is in the ... menu).");
  }
  function aiSaveExpand() {
    var c = AI.card, picks = [], ids = [];
    Array.prototype.forEach.call($("fcAiBody").querySelectorAll("input:checked"), function (i) { picks.push(AI.res[+i.dataset.i]); });
    if (!picks.length) return;
    var topic = c && FL.validTopic(c.topic) ? c.topic : "mine";
    picks.forEach(function (x) { var id = mycNewId(); ids.push(id); MYC.cards.push({ id: id, topic: topic, f: x.f, b: x.b, ai: true, ts: Date.now() }); });
    mycSave(); fcFilterOptions(); fcAddToQueue(ids); aiClose(); fcRender(); fcSay("Saved " + ids.length + " new card" + (ids.length === 1 ? "" : "s") + " to My cards.");
  }
  function aiSaveCreate() {
    var f = ($("aiF").value || "").trim(), b = ($("aiB").value || "").trim(); if (!f || !b) { AI.err = "Both the front and the back need some text."; var e = $("fcAiBody").querySelector(".aierr"); if (!e) { e = document.createElement("div"); e.className = "aierr"; $("fcAiBody").appendChild(e); } e.textContent = AI.err; return; }
    var id = mycNewId(); MYC.cards.push({ id: id, topic: FL.validTopic(AI.topic) ? AI.topic : "mine", f: f.slice(0, 600), b: b.slice(0, 1500), ai: true, ts: Date.now() });
    mycSave(); fcFilterOptions(); fcAddToQueue([id]); aiClose(); fcRender(); fcSay("Saved to My cards.");
  }
  function fcResetCard() {
    var c = fcCurrent(); if (!c) return; fcMoreClose();
    var mc = c.custom && MYC.cards.filter(function (x) { return x.id === c.id; })[0];
    if (mc && mc.orig) { mc.f = mc.orig.f; mc.b = mc.orig.b; delete mc.orig; } else delete MYC.over[c.id];
    mycSave(); fcRender(); fcSay("Back to the original card.");
  }
  function fcDeleteCard() {
    var c = fcCurrent(); if (!c || !c.custom) return; var b = $("fcmDelete");
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tap again to delete"; setTimeout(function () { b.dataset.sure = ""; b.textContent = "\uD83D\uDDD1 Delete this card"; }, 4000); return; }
    fcMoreClose(); MYC.cards = MYC.cards.filter(function (x) { return x.id !== c.id; }); delete fc.st.cards[c.id]; mycSave();
    fc.queue = fc.queue.filter(function (id) { return id !== c.id; }); fc.flipped = false; fcSave(); fcFilterOptions(); fcRender(); fcSay("Card deleted.");
  }
  function mycExport() {
    var data = { app: "mba-study-tutor", kind: "my-cards", version: 1, exported: new Date().toISOString(), cards: MYC.cards, over: MYC.over };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "my-flash-cards.json"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    $("menu").hidden = true; var n = MYC.cards.length, o = Object.keys(MYC.over).length; fcSay("Exported " + n + " card" + (n === 1 ? "" : "s") + (o ? " and " + o + " improved card" + (o === 1 ? "" : "s") : "") + " to my-flash-cards.json.");
    return data;
  }
  function mycImportText(text) {
    var d; try { d = JSON.parse(text); } catch (e) { return { err: "That file is not valid JSON." }; }
    if (!d || typeof d !== "object" || !Array.isArray(d.cards) && !d.over) return { err: "That file does not look like exported flash cards." };
    var added = 0, replaced = 0, imp = 0, skipped = 0;
    (Array.isArray(d.cards) ? d.cards : []).forEach(function (c) {
      var f = c && typeof c.f === "string" ? c.f.trim().slice(0, 600) : "", b = c && typeof c.b === "string" ? c.b.trim().slice(0, 1500) : "";
      if (!f || !b || !c.id || typeof c.id !== "string" || !/^my-[a-z0-9-]{3,40}$/.test(c.id)) { skipped++; return; }
      var n = { id: c.id, topic: FL.validTopic(c.topic) ? c.topic : "mine", f: f, b: b, ai: c.ai !== false, ts: +c.ts || Date.now() };
      if (c.orig && typeof c.orig.f === "string" && typeof c.orig.b === "string") n.orig = { f: c.orig.f.slice(0, 600), b: c.orig.b.slice(0, 1500) };
      var i = -1; MYC.cards.forEach(function (x, k) { if (x.id === n.id) i = k; });
      if (i >= 0) { MYC.cards[i] = n; replaced++; } else { MYC.cards.push(n); added++; }
    });
    var ov = d.over && typeof d.over === "object" ? d.over : {};
    Object.keys(ov).forEach(function (id) { var o = ov[id], bc = FL.baseCard(id); if (!bc || bc.kind === "statement" || !o || typeof o.f !== "string" || typeof o.b !== "string" || !o.f.trim() || !o.b.trim()) return; MYC.over[id] = { f: o.f.trim().slice(0, 600), b: o.b.trim().slice(0, 1500), ts: +o.ts || Date.now() }; imp++; });
    mycSave(); migrateOldChapterCards(); fcFilterOptions(); if (fc.queue && fc.view === "study") fcStart(); else renderSections();
    return { added: added, replaced: replaced, improved: imp, skipped: skipped };
  }
  function initAiCards() {
    mycLoad();
    $("fcAiClose").addEventListener("click", aiClose);
    $("fcAi").addEventListener("click", function (e) { if (e.target === $("fcAi")) aiClose(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (!$("fcAi").hidden) aiClose(); else if (!$("fcMore").hidden) { fcMoreClose(); try { $("fcCard").focus({ preventScroll: true }); } catch (x) {} } } });
    document.addEventListener("click", function (e) { if (!$("fcMore").hidden && !e.target.closest("#fcMore") && !e.target.closest(".fcmorebtn")) fcMoreClose(); });
    $("fcmImprove").addEventListener("click", function () { aiOpen("improve", fcCurrent()); });
    $("fcmExpand").addEventListener("click", function () { aiOpen("expand", fcCurrent()); });
    $("fcmCreate").addEventListener("click", function () { aiOpen("create", fcCurrent()); });
    $("fcmReset").addEventListener("click", fcResetCard); $("fcmDelete").addEventListener("click", fcDeleteCard);
    function viaCards(fn) { return function () { $("menu").hidden = true; switchTab("cards", true); fn(); }; }
    $("mCreate").addEventListener("click", viaCards(function () { aiOpen("create", fcCurrent()); }));
    $("mImprove").addEventListener("click", viaCards(function () { aiOpen("improve", fcCurrent()); }));
    $("mExpand").addEventListener("click", viaCards(function () { aiOpen("expand", fcCurrent()); }));
    $("mExport").addEventListener("click", function () { mycExport(); });
    $("mImport").addEventListener("click", function () { $("fcImportFile").value = ""; $("fcImportFile").click(); });
    $("fcImportFile").addEventListener("change", function () {
      var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        var r = mycImportText(String(rd.result || "")); $("menu").hidden = true; switchTab("cards");
        fcSay(r.err ? r.err : "Imported " + r.added + " new card" + (r.added === 1 ? "" : "s") + (r.replaced ? ", updated " + r.replaced : "") + (r.improved ? ", " + r.improved + " improved card" + (r.improved === 1 ? "" : "s") : "") + (r.skipped ? " (" + r.skipped + " skipped)" : "") + ".");
      };
      rd.readAsText(f);
    });
    window.__myc = function () { return MYC; }; window.__aiOpen = aiOpen; window.__mycImport = mycImportText;
  }

  /* ================= v4.6: Ask Grok ("?" on each part -> explain further + follow-ups) ================= */
  var ASK = { url: ((window.ASK_CONFIG && window.ASK_CONFIG.url) || "").replace(/\/+$/, ""), cur: null, busy: false, ctrl: null };
  var ASK_MAX_FOLLOWUPS = 6, ASK_MAX_THREADS = 80;
  function askStore() { return storage.load("ask", {}) || {}; }
  function askSave(all) {
    var keys = Object.keys(all); if (keys.length > ASK_MAX_THREADS) { keys.sort(function (a, b) { return (all[a].ts || 0) - (all[b].ts || 0); }); keys.slice(0, keys.length - ASK_MAX_THREADS).forEach(function (k) { delete all[k]; }); }
    storage.save("ask", all);
  }
  function askEsc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function askFormat(t) {
    return askEsc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").split(/\n{2,}/).map(function (p) { return "<p>" + p.replace(/\n/g, "<br>") + "</p>"; }).join("");
  }
  function askThread() { var all = askStore(); return (ASK.cur && all[ASK.cur.id]) || { msgs: [] }; }
  function askRender() {
    var th = askThread(), box = $("askLog"), h = "";
    $("askPart").textContent = ASK.cur ? (ASK.cur.label || ASK.cur.topicName + " \u00B7 Part " + (ASK.cur.si + 1)) : "";
    $("askQuote").textContent = ASK.cur ? ASK.cur.text : "";
    if (!ASK.url) h = "<div class='asknote'><b>Ask Grok is coming soon.</b><br>This button will send this part to Grok and explain it further in plain English, and you will be able to ask follow-up questions. It is being set up now.</div>";
    th.msgs.forEach(function (m, i) {
      if (i === 0 && m.role === "user") return; // the automatic "explain further" request
      h += "<div class='askmsg " + (m.role === "user" ? "me" : "ai") + "'>" + (m.role === "user" ? askEsc(m.content) : askFormat(m.content)) + "</div>";
    });
    box.innerHTML = h;
    var fu = th.msgs.filter(function (m) { return m.role === "user"; }).length - 1, left = ASK_MAX_FOLLOWUPS - Math.max(0, fu);
    var can = !!ASK.url && !ASK.busy && th.msgs.length > 0 && left > 0;
    $("askInput").disabled = !can; $("askSend").disabled = !can;
    $("askInput").placeholder = !ASK.url ? "Coming soon" : left <= 0 ? "Follow-up limit reached for this part" : "Ask a follow-up question\u2026";
    $("askLeft").textContent = ASK.url && th.msgs.length ? (left > 0 ? left + " follow-up" + (left === 1 ? "" : "s") + " left for this part" : "") : "";
    $("askRetry").hidden = !(ASK.url && !ASK.busy && th.msgs.length && th.msgs[th.msgs.length - 1].role === "user");
    box.scrollTop = box.scrollHeight;
  }
  function openAsk(topicKey, si, text) {
    var tp = tutor.topic(topicKey);
    ASK.cur = { id: topicKey + ":" + si, key: topicKey, si: si, text: text, topicName: tp ? tp.name : topicKey };
    var s = lastSnap || tutor.snapshot();
    if (s.running && s.mode === "lesson" && !s.audioPaused && !s.muted && s.speaking) tutor.ui("pauseaudio");
    $("menu").hidden = true; $("askPanel").hidden = false; document.body.classList.add("asking"); fitArticleSoon();
    askRender();
    var th = askThread();
    if (ASK.url && !th.msgs.length) askSend(null); else $("askInput").focus();
  }
  function askCardText(c) {
    if (c.kind === "statement") {
      var tb = (c.tables || []).map(function (t) { return t.title + ": " + t.rows.map(function (r) { return r[0] + " " + fcNum(r[1]); }).join("; "); }).join("\n");
      return ("Front: " + c.company + ": " + c.q + "\n" + tb + "\n\nBack: " + c.answer + "\nWorking: " + c.work + "\nWhat it means: " + c.interp).slice(0, 4000);
    }
    return ("Front: " + c.f + "\n\nBack: " + c.b).slice(0, 4000);
  }
  function openAskCard(c) {
    $("fcMore").hidden = true;
    var name = c.course === "sa" ? "Statement Analysis" : FL.topicName(c.topic);
    ASK.cur = { id: "card:" + c.id, key: "card:" + c.id, si: 0, kind: "card", text: askCardText(c), topicName: name, label: "Flash card \u00B7 " + name };
    $("menu").hidden = true; $("askPanel").hidden = false; document.body.classList.add("asking");
    askRender();
    if (ASK.url && !askThread().msgs.length) askSend(null); else $("askInput").focus();
  }
  function closeAsk() { if (ASK.ctrl) try { ASK.ctrl.abort(); } catch (e) {} var ae = document.activeElement; if (ae && $("askPanel").contains(ae)) { ae.blur(); if (ASK.cur && ASK.cur.kind === "card" && $("tab-cards").classList.contains("active")) try { $("fcCard").focus({ preventScroll: true }); } catch (e) {} }
    $("askPanel").hidden = true; document.body.classList.remove("asking"); fitArticleSoon(); }
  function askSend(question) {
    if (!ASK.url || ASK.busy || !ASK.cur) return;
    var all = askStore(), id = ASK.cur.id, th = all[id] || { msgs: [] };
    if (question != null) { question = String(question).trim().slice(0, 1500); if (!question) return; th.msgs.push({ role: "user", content: question }); }
    else if (!th.msgs.length) th.msgs.push({ role: "user", content: "Explain further" });
    th.ts = Date.now(); th.topic = ASK.cur.key; th.si = ASK.cur.si; all[id] = th; askSave(all);
    var payload = { kind: ASK.cur.kind || "part", topic: ASK.cur.topicName, partText: ASK.cur.text.slice(0, 4000), messages: th.msgs.slice(1).map(function (m) { return { role: m.role, content: m.content }; }) };
    ASK.busy = true; $("askInput").value = ""; askRender();
    var log = $("askLog"), out = document.createElement("div"); out.className = "askmsg ai streaming"; out.innerHTML = "<span class='askdots'>Grok is thinking\u2026</span>"; log.appendChild(out); log.scrollTop = log.scrollHeight;
    var text = "", ctrl = window.AbortController ? new AbortController() : null; ASK.ctrl = ctrl;
    function fail(msg) { ASK.busy = false; ASK.ctrl = null; out.classList.remove("streaming"); out.classList.add("err"); out.textContent = msg; $("askRetry").hidden = false; $("askInput").disabled = $("askSend").disabled = false; }
    function finish() {
      ASK.busy = false; ASK.ctrl = null;
      if (!text.trim()) return fail("Grok sent an empty answer. Tap Try again.");
      var a2 = askStore(), t2 = a2[id] || th; t2.msgs.push({ role: "assistant", content: text }); t2.ts = Date.now(); a2[id] = t2; askSave(a2);
      if (ASK.cur && ASK.cur.id === id) askRender();
    }
    fetch(ASK.url + "/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 429) { var mins = Math.max(1, Math.round((j.retryAfter || 3600) / 60)); fail(j.scope === "day" ? "You have reached today's limit of questions. It resets in about " + Math.round(mins / 60) + " hours." : "That is a lot of questions this hour. Try again in about " + mins + " minutes."); }
          else if (r.status === 503) fail("Ask Grok is not switched on yet.");
          else fail("Grok could not answer right now (error " + r.status + "). Tap Try again.");
        });
        if (!r.body || !r.body.getReader) return r.text().then(function (t) { parse(t); finish(); });
        var rd = r.body.getReader(), dec = new TextDecoder(), buf = "";
        function parse(chunk) {
          buf += chunk; var lines = buf.split("\n"); buf = lines.pop();
          lines.forEach(function (ln) {
            ln = ln.trim(); if (ln.indexOf("data:") !== 0) return; var d = ln.slice(5).trim(); if (d === "[DONE]") return;
            try { var j = JSON.parse(d), c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (c) { text += c; out.innerHTML = askFormat(text); log.scrollTop = log.scrollHeight; } } catch (e) {}
          });
        }
        function pump() { return rd.read().then(function (x) { if (x.done) { parse("\n"); return finish(); } parse(dec.decode(x.value, { stream: true })); return pump(); }); }
        return pump();
      })
      .catch(function (e) { if (e && e.name === "AbortError") { ASK.busy = false; return; } fail(navigator.onLine === false ? "No internet connection. Ask Grok needs internet." : "Could not reach Grok. Check the connection and tap Try again."); });
  }
  function askButton(onClick, label) {
    var b = document.createElement("button"); b.type = "button"; b.className = "askq"; b.setAttribute("aria-label", label || "Ask Grok to explain this part"); b.title = "Ask Grok to explain this part"; b.textContent = "?";
    b.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); onClick(); }); return b;
  }
  function askListenPart() {
    var s = lastSnap || tutor.snapshot();
    if (s.running && s.mode === "lesson" && s.lesson) { var segs = tutor.readSegs(s.lesson.topic); return { key: s.lesson.topic, si: s.lesson.seg, text: (s.lesson.text || segs[s.lesson.seg] || $("lText").textContent) }; }
    return null;
  }
  function updateListenAsk() { var p = askListenPart(); $("lAsk").hidden = !p; }
  function initAsk() {
    $("askClose").addEventListener("click", closeAsk);
    $("askSend").addEventListener("click", function () { askSend($("askInput").value); });
    $("askInput").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askSend($("askInput").value); } });
    $("askRetry").addEventListener("click", function () {
      var all = askStore(), th = all[ASK.cur.id]; if (!th || !th.msgs.length) return askSend(null);
      var last = th.msgs.pop(); all[ASK.cur.id] = th; askSave(all); askSend(th.msgs.length ? last.content : null);
    });
    $("askClear").addEventListener("click", function () { var all = askStore(); delete all[ASK.cur.id]; askSave(all); askRender(); if (ASK.url) askSend(null); });
    $("askPanel").addEventListener("click", function (e) { if (e.target === $("askPanel")) closeAsk(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("askPanel").hidden) closeAsk(); });
    $("lText").parentNode.insertBefore(askButton(function () { var p = askListenPart(); if (p) openAsk(p.key, p.si, p.text); }, "Ask Grok to explain this part"), $("lText")).id = "lAsk";
    $("lAsk").hidden = true;
    window.__ask = ASK; window.__openAsk = openAsk; window.__openAskCard = openAskCard;
  }

  /* ================= v4: device type, Read mode, sample statements ================= */
  var ST = window.Statements, device = "phone", rd = { key: null, si: 0 }, stmtShown = "bs", stmtFocusSig = "", stmtUserPick = false;
  function deviceInfo() {
    var mm = function (q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
    return { width: window.innerWidth, coarse: mm("(pointer: coarse)"), fine: mm("(any-pointer: fine)"), touch: (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window };
  }
  function applyDevice() {
    var d = E.detectDevice(deviceInfo(), tutor.settings.deviceMode);
    var changed = d !== device; device = d;
    document.body.classList.toggle("dev-desktop", d === "desktop"); document.body.classList.toggle("dev-phone", d !== "desktop");
    if ($("devDetected")) $("devDetected").textContent = E.detectDevice(deviceInfo(), "auto") === "desktop" ? "desktop" : "phone / tablet";
    placeStatements();
    if (changed) ev("device: " + d);
    updateLearnLayout();
  }
  // v4.1: desktop Read mode hides the top rows; they slide back when the mouse nears the top edge or keyboard focus enters them
  var immersive = false, chromeTimer = null;
  function setImmersive(on) {
    if (on === immersive) return; immersive = on;
    document.body.classList.toggle("immersive", on);
    if (!on) { clearTimeout(chromeTimer); $("chrome").classList.remove("show"); }
  }
  function showChrome() { if (!immersive) return; clearTimeout(chromeTimer); $("chrome").classList.add("show"); }
  function hideChromeSoon(ms) {
    if (!immersive) return; clearTimeout(chromeTimer);
    chromeTimer = setTimeout(function () {
      var c = $("chrome");
      if (c.querySelector(":focus-visible") || c.matches(":hover") || !$("audioErr").hidden || !$("alert").hidden) return;
      c.classList.remove("show");
    }, ms == null ? 700 : ms);
  }
  function initChrome() {
    var c = $("chrome");
    document.addEventListener("mousemove", function (e) { if (!immersive) return; if (e.clientY <= 40) showChrome(); else if (c.classList.contains("show") && e.clientY > c.getBoundingClientRect().bottom + 20) hideChromeSoon(); });
    c.addEventListener("mouseleave", function () { hideChromeSoon(); });
    c.addEventListener("focusin", function () { if (c.querySelector(":focus-visible")) showChrome(); });
    c.addEventListener("focusout", function () { hideChromeSoon(300); });
    $("chromeHot").addEventListener("mouseenter", showChrome);
  }
  function learnView() { return device === "desktop" ? (tutor.settings.learnView || "listen") : "listen"; }
  // the lesson part the screen is "about": the playing part, else the part open in Read mode
  function focusPart() {
    var s = lastSnap || tutor.snapshot();
    if (s.running && s.mode === "lesson" && s.lesson) return { key: s.lesson.topic, si: s.lesson.seg, text: s.lesson.text, live: true, variant: s.lesson.variant };
    if (learnView() === "read" && rd.key) { var segs = tutor.readSegs(rd.key); return { key: rd.key, si: rd.si, text: segs[rd.si] || "", live: false }; }
    return { key: nextLessonKey(s), si: -1, text: "", live: false };
  }
  function placeStatements() {
    var panel = $("stmtPanel"), want = device === "desktop" ? $("stmtCol") : $("stmtSlot");
    if (panel.parentNode !== want) want.appendChild(panel);
    if (device === "desktop") $("stmtSheet").hidden = true;
  }
  // v4.5: the article box must end above the bottom of the window so its last line can always be scrolled fully into view
  var ART_GAP = 14;
  function fitArticle() {
    var a = $("rText"); if (!a) return;
    if (!readModeActive()) { a.style.maxHeight = ""; return; }
    var top = a.getBoundingClientRect().top + window.scrollY;
    a.style.maxHeight = Math.max(220, Math.floor(window.innerHeight - top - ART_GAP)) + "px";
  }
  function fitArticleSoon() { requestAnimationFrame(function () { fitArticle(); setTimeout(fitArticle, 350); }); }
  function articleScroll(dy) {
    var a = $("rText"), max = Math.max(0, a.scrollHeight - a.clientHeight), to = Math.min(max, Math.max(0, a.scrollTop + dy));
    if (a.scrollTo) a.scrollTo({ top: to, behavior: "smooth" }); else a.scrollTop = to;
  }
  function updateLearnLayout() {
    var f = focusPart(), rel = ST.relevant(f.key), desk = device === "desktop", wrap = $("learnWrap");
    var split = desk && rel;
    $("stmtCol").hidden = !split; $("splitBar").hidden = !split;
    wrap.classList.toggle("split", split);
    if (split) wrap.style.gridTemplateColumns = (tutor.settings.splitPct || 50) + "% 10px minmax(0, 1fr)"; else wrap.style.gridTemplateColumns = "";
    var v = learnView(), onLearn = activeTab() === "lessons";
    $("viewToggle").hidden = !desk || !onLearn;
    setImmersive(desk && v === "read" && onLearn);
    Array.prototype.forEach.call(document.querySelectorAll(".segbtn"), function (b) { var on = b.dataset.view === v; b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    $("lessonCard").hidden = v === "read"; $("readCard").hidden = v !== "read"; $("rNav").hidden = v !== "read";
    var s = lastSnap || tutor.snapshot();
    $("btnStmt").hidden = !(device !== "desktop" && s.running && s.mode === "lesson" && rel);
    if (v === "read") renderReader();
    renderStatements(false); fitArticleSoon();
  }
  // ---- Read mode
  function renderReader() {
    var s = lastSnap || tutor.snapshot(), live = s.running && s.mode === "lesson" && s.lesson;
    if (live) { rd.key = s.lesson.topic; rd.si = s.lesson.seg; }
    if (!rd.key) rd.key = nextLessonKey(s);
    var tp = tutor.topic(rd.key), segs = tutor.readSegs(rd.key), box = $("rText");
    rd.si = Math.max(0, Math.min(rd.si, segs.length - 1));
    $("rName").textContent = tp.name;
    $("rPos").textContent = "Part " + (rd.si + 1) + " of " + segs.length; $("rPartTitle").textContent = partTitle(segs[rd.si] || "");
    $("rPrevTopic").disabled = !live && B.TOPICS[0].key === rd.key; $("rNextTopic").disabled = !live && B.TOPICS[B.TOPICS.length - 1].key === rd.key;
    var playingNow = live && !s.audioPaused && !s.muted && s.speaking;
    $("rHint").textContent = live ? (playingNow ? "\u00B7 reading along with the audio" : "\u00B7 audio paused") : "\u00B7 read at your own pace";
    $("rListen").innerHTML = live ? (s.audioPaused ? "&#9654; Resume audio" : "&#10074;&#10074; Pause audio") : "&#128266; Listen from here";
    if (box.dataset.key !== rd.key) {
      box.dataset.key = rd.key; box.innerHTML = "";
      segs.forEach(function (t, i) {
        var p = document.createElement("p"); p.dataset.si = i; p.textContent = t; p.tabIndex = 0;
        p.appendChild(askButton(function () { openAsk(rd.key, i, t); }, "Ask Grok to explain part " + (i + 1)));
        p.addEventListener("click", function () { readGo(i); });
        box.appendChild(p);
      });
      box.dataset.cur = "";
    }
    Array.prototype.forEach.call(box.children, function (p, i) { p.classList.toggle("cur", i === rd.si); p.classList.toggle("playing", i === rd.si && !!playingNow); });
    if (box.dataset.cur !== String(rd.si)) {
      box.dataset.cur = String(rd.si);
      var el = box.children[rd.si]; if (el) { var top = Math.max(0, el.offsetTop - box.clientHeight / 4); if (box.scrollTo) box.scrollTo({ top: top, behavior: live ? "smooth" : "auto" }); else box.scrollTop = top; }
    }
    $("rPrev").disabled = rd.si <= 0 && !live; $("rNext").disabled = rd.si >= segs.length - 1 && !live;
  }
  // short title for a part: its first sentence, trimmed
  function partTitle(t) {
    var m = String(t).trim().match(/^(.+?[.?!])(\s|$)/), s = (m ? m[1] : String(t)).replace(/[.]$/, "");
    if (s.length < 14 && m) { var m2 = String(t).trim().slice(m[0].length).match(/^(.+?[.?!])(\s|$)/); if (m2) s += ". " + m2[1].replace(/[.]$/, ""); }
    return s.length > 64 ? s.slice(0, 61).replace(/\s+\S*$/, "") + "\u2026" : s;
  }
  function readGo(si) {
    var s = lastSnap || tutor.snapshot();
    if (s.running && s.mode === "lesson" && s.lesson && s.lesson.topic === rd.key) { tutor.ui("teachat", { key: rd.key, si: si }); return; }
    rd.si = si; stmtUserPick = false; updateLearnLayout();
  }
  function readStep(d) {
    var s = lastSnap || tutor.snapshot();
    if (s.running && s.mode === "lesson" && s.lesson) { tutor.ui(d > 0 ? "nextpart" : "back"); return; }
    var n = tutor.readSegs(rd.key).length, si = rd.si + d;
    if (si >= n) return readTopic(1); if (si < 0) return readTopic(-1, true);
    rd.si = si; stmtUserPick = false; updateLearnLayout();
  }
  function readTopic(d, toEnd) {
    var s = lastSnap || tutor.snapshot();
    if (s.running && s.mode === "lesson" && s.lesson) { tutor.ui(d > 0 ? "next" : "prev"); return; }
    var keys = B.TOPICS.map(function (t) { return t.key; }), i = keys.indexOf(rd.key) + d;
    if (i < 0 || i >= keys.length) return;
    rd.key = keys[i]; rd.si = toEnd ? tutor.readSegs(rd.key).length - 1 : 0; stmtUserPick = false; updateLearnLayout();
    window.scrollTo(0, 0);
  }
  // v4.4: desktop Read mode keyboard
  function readModeActive() { return device === "desktop" && learnView() === "read" && $("tab-lessons").classList.contains("active") && !$("readCard").hidden; }
  function readKeys(e) {
    if (!readModeActive() || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable) || (t && t.id === "splitBar")) return;
    if (!$("menu").hidden || document.querySelector(".sheet:not([hidden])")) return;
    var art = $("rText"), line = 36, k = e.key;
    if (k === "ArrowRight" || k === "ArrowLeft") { var d = k === "ArrowRight" ? 1 : -1; if (e.shiftKey) readTopic(d); else readStep(d); }
    else if (k === "ArrowDown" || k === "ArrowUp") { if (e.shiftKey) return; articleScroll((k === "ArrowDown" ? 1 : -1) * line * 3); }
    else if (k === "PageDown" || k === "PageUp") articleScroll((k === "PageDown" ? 1 : -1) * Math.max(120, art.clientHeight * 0.85));
    else return;
    e.preventDefault();
  }
  function readListen() {
    var s = lastSnap || tutor.snapshot();
    if (s.running && s.mode === "lesson" && s.lesson) return onPlay();
    if (s.running) tutor.ui("teachat", { key: rd.key, si: rd.si }); else startSession({ lesson: rd.key, si: rd.si });
  }
  // ---- statements
  function money(x) { var a = Math.abs(x), t = a.toLocaleString("en-US"); return x < 0 ? "(" + t + ")" : t; }
  function pct(x) { return (Math.round(x * 1000) / 10).toFixed(1) + "%"; }
  function fmtRatio(r, x) { return r.fmt === "%" ? pct(x) : r.fmt === "$" ? money(x) : (Math.round(x * 100) / 100).toFixed(2); }
  function stmtTable(code) {
    var yrs = ST.YEARS, h = "";
    if (code === "ratios") {
      h += "<table class='stmt'><thead><tr><th>Ratio</th>" + yrs.map(function (y) { return "<th>" + y + "</th>"; }).join("") + "</tr></thead><tbody>";
      ST.RATIOS.forEach(function (r) {
        h += "<tr data-r='" + r.k + "'><td><b>" + r.label + "</b><div class='f'>" + r.f + "</div></td>" + yrs.map(function (y, i) { return "<td>" + fmtRatio(r, r.calc(i)) + "</td>"; }).join("") + "</tr>";
      });
      h += "</tbody></table><p class='small'>Year-end balances, as in the lesson. Altman uses market value of equity of $" + ST.MARKET_EQUITY.join("K, $") + "K. Above 2.99 = safe zone.</p>";
      return h;
    }
    var st = ST.STATEMENTS[code];
    h += "<div class='stitle'>" + st.title + "</div><table class='stmt'><thead><tr><th></th>" + yrs.map(function (y, i) { return "<th>" + y + "</th><th class='cs y" + i + "'>%</th>"; }).join("") + "</tr></thead><tbody>";
    st.rows.forEach(function (r) {
      if (r.h) { h += "<tr class='sh'><td colspan='" + (1 + yrs.length * 2) + "'>" + r.h + "</td></tr>"; return; }
      h += "<tr data-k='" + r.k + "' class='" + (r.total === 2 ? "t2" : r.total ? "t1" : "") + (r.sub ? " sub" : "") + "'><td>" + r.label.trim() + "</td>" +
        yrs.map(function (y, i) { return "<td>" + money(r.v[i]) + "</td><td class='cs y" + i + "'>" + pct(ST.commonSize(st, r.k, i)) + "</td>"; }).join("") + "</tr>";
    });
    h += "</tbody></table><p class='small'>% column = " + st.baseLabel + " (common-size).</p>";
    return h;
  }
  function renderStatements(force) {
    var f = focusPart(), sig = f.key + ":" + f.si + ":" + (f.variant || "script"), rel = ST.relevant(f.key);
    var link = rel && f.text ? ST.partLink(f.key, f.si, f.text, f.variant) : { stmt: ST.TOPIC_STMT[f.key] || "bs", keys: [], ratios: [] };
    if (sig !== stmtFocusSig) { stmtFocusSig = sig; stmtShown = link.stmt; force = true; }
    var body = $("stmtBody");
    if (force || body.dataset.code !== stmtShown) { body.dataset.code = stmtShown; body.innerHTML = stmtTable(stmtShown); }
    Array.prototype.forEach.call(document.querySelectorAll(".stab"), function (b) { b.classList.toggle("active", b.dataset.stmt === stmtShown); });
    var first = null;
    Array.prototype.forEach.call(body.querySelectorAll("tr[data-k]"), function (tr) { var on = link.keys.indexOf(tr.dataset.k) >= 0; tr.classList.toggle("hl", on); if (on && !first) first = tr; });
    Array.prototype.forEach.call(body.querySelectorAll("tr[data-r]"), function (tr) { var on = link.ratios.indexOf(tr.dataset.r) >= 0; tr.classList.toggle("hl", on); if (on && !first) first = tr; });
    var names = link.keys.filter(function (k) { return ST.WHERE[k] === stmtShown; }).length;
    $("stmtNote").textContent = !rel ? "These statements go with the accounting lessons." :
      link.keys.length ? (stmtShown === "ratios" ? "Highlighted: the ratio this part is about." : names ? "Highlighted: the lines this part is talking about." : "This part's lines are on another tab (" + link.keys.map(function (k) { return { bs: "Balance sheet", is: "Income", cf: "Cash flow" }[ST.WHERE[k]]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(", ") + ").") : "";
    if (first && force && first.scrollIntoView) { var sc = device === "desktop" ? $("stmtCol") : $("stmtSheet").querySelector(".sheetbox"); if (sc) { var r1 = first.getBoundingClientRect(), r0 = sc.getBoundingClientRect(); if (r1.bottom > r0.bottom - 10 || r1.top < r0.top + 110) sc.scrollTop = Math.max(0, sc.scrollTop + (r1.top - r0.top) - 140); } }
    window.__stmtState = { shown: stmtShown, keys: link.keys, ratios: link.ratios, focus: f };
  }
  function openStatements() { $("menu").hidden = true; if (device === "desktop") { switchTab("lessons"); renderStatements(true); return; } $("stmtSheet").hidden = false; renderStatements(true); }
  function initV4() {
    Array.prototype.forEach.call(document.querySelectorAll(".segbtn"), function (b) { b.addEventListener("click", function () { tutor.setSetting("learnView", b.dataset.view); if (b.dataset.view === "read" && !rd.key) { var f = focusPart(); rd.key = f.key; rd.si = Math.max(0, f.si); } updateLearnLayout(); }); });
    Array.prototype.forEach.call(document.querySelectorAll(".stab"), function (b) { b.addEventListener("click", function () { stmtShown = b.dataset.stmt; stmtUserPick = true; renderStatements(true); stmtUserPick = false; }); });
    $("rPrev").addEventListener("click", function () { readStep(-1); }); $("rNext").addEventListener("click", function () { readStep(1); });
    $("rPrevTopic").addEventListener("click", function () { readTopic(-1); }); $("rNextTopic").addEventListener("click", function () { readTopic(1); });
    $("rListen").addEventListener("click", readListen);
    $("btnStmt").addEventListener("click", openStatements); $("mStmt").addEventListener("click", openStatements);
    $("stmtClose").addEventListener("click", function () { $("stmtSheet").hidden = true; });
    $("stmtSheet").addEventListener("click", function (e) { if (e.target === $("stmtSheet")) $("stmtSheet").hidden = true; });
    Array.prototype.forEach.call(document.getElementsByName("deviceMode"), function (r) { r.checked = r.value === tutor.settings.deviceMode; r.addEventListener("change", function () { if (this.checked) { tutor.setSetting("deviceMode", this.value); applyDevice(); } }); });
    // resizable split
    var bar = $("splitBar"), drag = false;
    function setPct(p) { p = Math.max(30, Math.min(72, p)); tutor.settings.splitPct = Math.round(p); $("learnWrap").style.gridTemplateColumns = p + "% 10px minmax(0, 1fr)"; }
    bar.addEventListener("pointerdown", function (e) { drag = true; try { bar.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
    bar.addEventListener("pointermove", function (e) { if (!drag) return; var r = $("learnWrap").getBoundingClientRect(); setPct(100 * (e.clientX - r.left) / r.width); });
    bar.addEventListener("pointerup", function () { if (drag) { drag = false; tutor.setSetting("splitPct", tutor.settings.splitPct); } });
    bar.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { setPct((tutor.settings.splitPct || 50) + (e.key === "ArrowLeft" ? -3 : 3)); tutor.setSetting("splitPct", tutor.settings.splitPct); } });
    initChrome(); document.addEventListener("keydown", readKeys);
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { applyDevice(); fitArticle(); }, 150); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitArticle);
    applyDevice();
  }
  window.__v4 = { device: function () { return device; }, rd: rd, focus: function () { return focusPart(); } };

  /* ---------- the big PLAY / PAUSE button and 10-second skips ---------- */
  function onPlay() {
    var s = tutor.snapshot();
    if (!s.running || s.mode !== "lesson") { var k = nextLessonKey(s); if (s.running) tutor.ui("teach", k); else startSession({ lesson: k }); return; }
    if (s.muted) return tutor.unmute();
    if (s.audioError) return tutor.ui("repeat");
    if (s.phase === "lessonWait") return tutor.ui("nextpart");
    tutor.ui("pauseaudio");
  }
  function seek(delta) {
    var s = lastSnap; if (!s || !s.running || s.mode !== "lesson" || !s.lesson) return;
    var d = audioEl.duration, t = audioEl.currentTime, L = s.lesson, onPart = P.curText === L.text;
    if (!audioEl.getAttribute("src") || !(d > 0)) { tutor.ui(delta < 0 ? "back" : "nextpart"); return; }
    var nt = t + delta;
    if (nt < 0) { if (onPart && L.seg > 0) tutor.ui("back"); else audioEl.currentTime = 0; return; }
    if (nt > d - 0.4) { if (onPart) tutor.ui("nextpart"); else audioEl.currentTime = Math.max(0, d - 0.4); return; }
    audioEl.currentTime = nt; ev("seek " + (delta > 0 ? "+" : "") + delta + "s");
    updateLessonsView(lastSnap);
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) { b.addEventListener("click", function () { switchTab(b.dataset.tab); }); });
    Array.prototype.forEach.call(document.querySelectorAll(".panel"), function (p) { p.hidden = !p.classList.contains("active"); });
    $("btnStart").addEventListener("click", function () { startSession({}); });
    $("btnTestSound").addEventListener("click", testSound); $("btnTestSound2").addEventListener("click", function () { $("menu").hidden = true; testSound(); });
    $("scPlay").addEventListener("click", testSound); $("scYes").addEventListener("click", function () { soundAnswer(true); }); $("scNo").addEventListener("click", function () { soundAnswer(false); });
    $("scCancel").addEventListener("click", function () { pendingStart = null; $("soundCard").hidden = true; $("startCard").hidden = tutor.running; });
    $("btnMicRetry").addEventListener("click", function () { $("menu").hidden = true; restartMic(); showAlert("Trying the microphone again."); });
    $("btnSaveAudio").addEventListener("click", saveAllAudio);
    $("ver").textContent = APP_VERSION; $("ver2").textContent = APP_VERSION;
    $("btnPlay").addEventListener("click", onPlay);
    $("btnBack10").addEventListener("click", function () { seek(-10); }); $("btnFwd10").addEventListener("click", function () { seek(10); });
    $("btnSpeed").addEventListener("click", function () { var steps = [0.8, 1, 1.25, 1.5], r = tutor.settings.rate || 1, nx = steps.filter(function (x) { return x > r + 0.001; })[0] || steps[0]; tutor.setSetting("rate", nx); renderSettings(); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-mic]"), function (b) { b.addEventListener("click", function () { if (tutor.muted) tutor.unmute(); else tutor.mute(); syncMic(); ev("mic toggle: " + (tutor.muted ? "muted" : "unmuted")); }); });
    $("btnMenu").addEventListener("click", function () { $("menu").hidden = false; render(); });
    $("menuClose").addEventListener("click", function () { $("menu").hidden = true; });
    $("menu").addEventListener("click", function (e) { if (e.target === $("menu")) $("menu").hidden = true; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-goto]"), function (b) { b.addEventListener("click", function () { switchTab(b.dataset.goto); }); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (b) { b.addEventListener("click", function () { switchTab(lastMain); }); });
    $("btnResetLessons").addEventListener("click", function () { if (confirm("Clear all lesson check marks?")) tutor.resetLessonProgress(); });
    $("gymMute").addEventListener("click", function () { if (tutor.muted) tutor.unmute(); else tutor.mute(); syncMic(); renderGym(tutor.snapshot()); });
    $("btnGym").addEventListener("click", function () { $("menu").hidden = true; $("gym").hidden = false; renderGym(tutor.snapshot()); acquireWake(); });
    $("gymExit").addEventListener("click", function () { $("gym").hidden = true; });
    $("btnSubmit").addEventListener("click", function () { tutor.submitText($("qInput").value); });
    $("qInput").addEventListener("keydown", function (e) { if (e.key === "Enter") tutor.submitText($("qInput").value); });
    $("btnGradeNow").addEventListener("click", function () { tutor.tapGradeNow(); });
    $("btnDontKnow").addEventListener("click", function () { tutor.tapDontKnow(); });
    $("btnSkip").addEventListener("click", function () { tutor.ui("skip"); });
    $("btnRight").addEventListener("click", function () { tutor.hardStopSpeech(); tutor.override(true); });
    $("btnWrong").addEventListener("click", function () { tutor.hardStopSpeech(); tutor.override(false); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-ui]"), function (b) { b.addEventListener("click", function () { $("menu").hidden = true; tutor.ui(b.dataset.ui); }); });
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
    $("btnTestVoice").addEventListener("click", testSound);
    $("setLessonAuto").addEventListener("change", function () { tutor.setSetting("lessonAuto", this.checked); });
    $("setAlsoUnmute").addEventListener("change", function () { tutor.setSetting("alsoUnmute", this.checked); });
    $("setBarge").addEventListener("change", function () { tutor.setSetting("bargeIn", this.checked); syncMic(); });
    $("setAuto").addEventListener("change", function () { tutor.setSetting("autoAdvance", this.checked); });
    $("setWake").addEventListener("change", function () { tutor.setSetting("wakeLock", this.checked); if (this.checked) acquireWake(); else releaseWake(); });
    Array.prototype.forEach.call(document.getElementsByName("muteMode"), function (r) { r.addEventListener("change", function () { if (this.checked) { tutor.setSetting("muteMode", this.value); syncMic(); } }); });
    $("fontUp").addEventListener("click", function () { tutor.setSetting("fontScale", Math.min(1.6, +(tutor.settings.fontScale + 0.1).toFixed(2))); renderSettings(); });
    $("fontDown").addEventListener("click", function () { tutor.setSetting("fontScale", Math.max(0.8, +(tutor.settings.fontScale - 0.1).toFixed(2))); renderSettings(); });
    $("btnReset").addEventListener("click", function () { if (confirm("Erase all saved answers on this phone? This cannot be undone. Download a copy first if you want one.")) { tutor.log = []; tutor.saveLog(); tutor.last = null; renderProgress(); renderLog(); render(); } });
    window.addEventListener("online", function () { if (micError === "voice-off" && tutor.running) restartMic(); });
    window.addEventListener("online", netNote); window.addEventListener("offline", netNote); netNote();
    var dip = null; window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); dip = e; });
    window.addEventListener("appinstalled", function () { dip = null; showAlert("Installed. Open it from your home screen or apps list."); });
    function isInstalled() { return (window.matchMedia && (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches || matchMedia("(display-mode: minimal-ui)").matches)) || navigator.standalone === true; }
    function installPlatform() {
      var ua = navigator.userAgent || "", iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (iOS) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-other" : "ios";
      if (/Android/.test(ua)) return /SamsungBrowser/.test(ua) ? "samsung" : /Firefox/.test(ua) ? "android-firefox" : "android";
      if (/Edg\//.test(ua)) return "edge"; if (/Chrome\//.test(ua)) return "chrome"; if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return "mac-safari"; return "other";
    }
    var INSTALL_STEPS = {
      android: ["Tap the <b>&#8942;</b> menu (three dots, top right of Chrome).", "Tap <b>Install app</b> (or <b>Add to Home screen</b>).", "Tap <b>Install</b>. The icon appears on your home screen."],
      samsung: ["Tap the <b>&#9776;</b> menu at the bottom.", "Tap <b>Add page to</b> &gt; <b>Home screen</b>."],
      "android-firefox": ["Tap the <b>&#8942;</b> menu.", "Tap <b>Install</b> (or <b>Add to Home screen</b>)."],
      ios: ["Tap the <b>Share</b> button (square with an arrow, bottom of Safari).", "Scroll down and tap <b>Add to Home Screen</b>.", "Tap <b>Add</b>. The icon appears on your home screen."],
      "ios-other": ["Open this page in <b>Safari</b> (installing works best there).", "Tap <b>Share</b> &gt; <b>Add to Home Screen</b> &gt; <b>Add</b>."],
      chrome: ["Click the <b>install icon</b> at the right end of the address bar (a screen with a down arrow).", "Or click <b>&#8942;</b> &gt; <b>Cast, save and share</b> &gt; <b>Install page as app</b> (older Chrome: <b>&#8942;</b> &gt; <b>Install MBA Study Tutor</b>).", "Click <b>Install</b>."],
      edge: ["Click the <b>App available</b> icon in the address bar.", "Or click <b>&#8943;</b> &gt; <b>Apps</b> &gt; <b>Install this site as an app</b>.", "Click <b>Install</b>."],
      "mac-safari": ["In Safari's menu bar choose <b>File</b> &gt; <b>Add to Dock</b>.", "Click <b>Add</b>."],
      other: ["Open this page in <b>Chrome</b> or <b>Edge</b> on a computer or Android phone, or <b>Safari</b> on an iPhone.", "Then use the browser's <b>Install</b> or <b>Add to Home Screen</b> option."]
    };
    var INSTALL_NAMES = { android: "Android (Chrome)", samsung: "Android (Samsung Internet)", "android-firefox": "Android (Firefox)", ios: "iPhone / iPad (Safari)", "ios-other": "iPhone / iPad", chrome: "Computer (Chrome)", edge: "Computer (Edge)", "mac-safari": "Mac (Safari)", other: "This browser" };
    function showInstallSheet(state) {
      var h;
      if (state === "installed") { $("instTitle").textContent = "Already installed \u2713"; h = "<p style='font-size:1.3rem'><b>Already installed &#10003;</b></p><p>You are using the installed app. Open it any time from your home screen or apps list.</p>"; }
      else { var pf = installPlatform(); $("instTitle").textContent = "Install on my Phone or Computer";
        h = "<p class='small'>Detected: <b id='instPlat' data-plat='" + pf + "'>" + INSTALL_NAMES[pf] + "</b></p><ol class='inststeps'>" + INSTALL_STEPS[pf].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol>" +
          "<p class='small'>Once installed it opens full-screen like a normal app and works offline (voice listening still needs internet).</p>"; }
      $("instBody").innerHTML = h; $("menu").hidden = true; $("installSheet").hidden = false; $("instClose").focus();
    }
    function doInstall() {
      if (isInstalled()) return showInstallSheet("installed");
      if (dip) { var ev = dip; dip = null; $("menu").hidden = true; ev.prompt(); if (ev.userChoice) ev.userChoice.then(function (r) { if (r && r.outcome === "accepted") showAlert("Installing..."); }); return; }
      showInstallSheet("steps");
    }
    $("btnInstall").addEventListener("click", doInstall); $("btnInstall2").addEventListener("click", doInstall);
    $("instClose").addEventListener("click", function () { $("installSheet").hidden = true; });
    $("installSheet").addEventListener("click", function (e) { if (e.target === $("installSheet")) $("installSheet").hidden = true; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("installSheet").hidden) $("installSheet").hidden = true; });
    window.__install = { isInstalled: isInstalled, platform: installPlatform, hasPrompt: function () { return !!dip; } };
    $("supportNote").textContent = (SR ? "Voice listening is available." : "This browser can not listen to your voice. Use Chrome on Android. You can still use the buttons.");
    initFlash(); initSync(); initAsk(); initV4(); window.__v4ready = true;
    renderSettings(); renderHelp(); renderLessons(); render(); renderDbg();
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").then(function (reg) { try { reg.update(); } catch (e) {} }).catch(function () {});
      navigator.serviceWorker.addEventListener("message", function (m) { if (m.data && m.data.type === "sw-activated") { if (!tutor.running) location.reload(); else showAlert("A new version was installed. It will load next time you open the app."); } });
    }
    audioEl.addEventListener("error", function () { ev("audio element error"); });
  }
  function netNote() { $("netNote").hidden = navigator.onLine; }
  tutor.mute = (function (orig) { return function () { orig.call(tutor); if (typeof syncMic === "function") syncMic(); }; })(tutor.mute);
  tutor.unmute = (function (orig) { return function () { orig.call(tutor); if (typeof syncMic === "function") syncMic(); }; })(tutor.unmute);
  var origSubmit = tutor.submit; tutor.submit = function (r, s) { origSubmit.call(tutor, r, s); lastQid = tutor.cur && tutor.cur.id; };
  /* ---------- optional: save every audio clip on the phone for offline use ---------- */
  function saveAllAudio() {
    var keys = Object.keys(MAN), n = 0, i = 0, fails = 0, btn = $("btnSaveAudio"), msg = $("saveAudioMsg");
    if (!navigator.onLine) { msg.textContent = "You are offline. Do this on Wi-Fi."; return; }
    btn.disabled = true;
    function worker() {
      if (i >= keys.length) return Promise.resolve();
      var k = keys[i++];
      return fetch("audio/" + k + ".mp3").then(function (r) { if (!r.ok) fails++; return r.arrayBuffer(); }).catch(function () { fails++; }).then(function () { n++; if (n % 20 === 0 || n === keys.length) msg.textContent = "Saved " + n + " of " + keys.length + " clips..."; return worker(); });
    }
    Promise.all([worker(), worker(), worker(), worker()]).then(function () { btn.disabled = false; msg.textContent = fails ? "Done, but " + fails + " clips failed. Tap again to retry." : "All " + keys.length + " clips are saved. Lessons now work without internet (but voice listening still needs it)."; });
  }
  window.__player = { state: function () { return { token: P.token, intentional: P.intentional, audio: dbg.audio, last: dbg.last, failWhy: dbg.failWhy || "", paused: audioEl.paused, t: audioEl.currentTime, d: audioEl.duration, src: audioEl.getAttribute("src") }; }, log: function () { return dbgLog.slice(); }, recStats: recStats };
  window.__app = { syncMic: syncMic, state: function () { return { recOn: recOn, micError: micError }; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
