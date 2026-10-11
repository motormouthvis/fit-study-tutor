/* app.js: browser glue (speech, microphone, wake lock, screens). Logic lives in engine.js */
(function () {
  "use strict";
  var E = window.Engine, B = window.Bank, LD = window.LessonData;
  var $ = function (id) { return document.getElementById(id); };
  var LS = "tutor.v1.";
  var APP_VERSION = "v2";
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
    P.token++; if (P.abort) P.abort(); P.heldNext = null; P.intentional = false;
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
      function cont(ok, why) {
        if (tok !== P.token) return;
        if (ok) { played++; setTimeout(next, 90); }
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
    load: storage.load, save: storage.save, emit: function (s) { render(s); }
  };
  var tutor = new E.Tutor(io, { topics: B.TOPICS, questions: B.QUESTIONS, generators: B.GENERATORS, lessons: LD, subjects: B.SUBJECTS });
  window.__tutor = tutor; window.__E = E;

  /* ---------- microphone / speech recognition ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, recOn = false, consumed = false, micError = "", restartTimer = null, userMicOff = false, lastHeard = "";
  var recStartedAt = 0, recGotResult = false, micHoldUntil = 0, wasSpeaking = false;
  function maxQuick() { return window.__maxQuick || 25; }   // consecutive sessions that ended within 4 s with nothing heard
  function shouldListen() {
    if (!SR || userMicOff || !tutor.running || micError === "fatal" || micError === "loop") return false;
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
      rec.onstart = function () { recOn = true; consumed = false; recStarts(); if (micError !== "fatal" && micError !== "loop") micError = ""; updateBanner(); };
      rec.onresult = onResult;
      rec.onerror = function (ev2) {
        var e = ev2 && ev2.error; recStats.errors++; recStats.lastErr = e || "?";
        if (e === "not-allowed" || e === "service-not-allowed") { micError = "fatal"; showAlert("The microphone is blocked. Tap the lock icon in Chrome's address bar, allow Microphone for this site, then reload. You can still use the buttons."); }
        else if (e === "audio-capture") { micError = "fatal"; showAlert("No microphone found. You can still use the buttons."); }
        else if (e === "network") { micError = "network"; showAlert("Voice listening needs an internet connection. Use the buttons until you are back online."); }
        else if (e === "no-speech" || e === "aborted") { /* normal */ }
        ev("mic error: " + e);
      };
      rec.onend = function () {
        recOn = false; rec = null; updateBanner();
        var life = Date.now() - recStartedAt;
        if (recGotResult || life > 4000) recStats.quick = 0; else recStats.quick++;
        if (!shouldListen()) return;
        if (recStats.quick >= maxQuick()) { micError = "loop"; ev("mic gave up after " + recStats.quick + " quick restarts"); showAlert("The microphone keeps stopping, so I paused listening to avoid beeping. Tap RESTART MIC to try again, or use the buttons."); updateBanner(); return; }
        // exponential backoff: 0.25 s for the first few, then 0.5, 1, 2, 4, max 5 s
        var delay = micError === "network" ? 3000 : Math.min(5000, 250 * Math.pow(2, Math.max(0, recStats.quick - 3)));
        restartTimer = setTimeout(function () { restartTimer = null; syncMic(); }, delay);
      };
      rec.start();
    } catch (e) { recOn = false; rec = null; recStats.errors++; recStats.lastErr = "start-threw"; restartTimer = setTimeout(function () { restartTimer = null; syncMic(); }, 1500); }
  }
  function recStarts() { recStats.starts++; recStartedAt = Date.now(); recGotResult = false; }
  function stopRec() { try { if (rec) { rec.onend = null; rec.abort(); } } catch (e) {} rec = null; recOn = false; clearTimeout(restartTimer); restartTimer = null; updateBanner(); }
  function restartMic() { micError = micError === "fatal" ? "fatal" : ""; recStats.quick = 0; stopRec(); syncMic(); ev("mic restarted by button"); }
  function onResult(ev2) {
    var res = ev2.results[ev2.results.length - 1]; if (!res) return;
    var alts = []; for (var i = 0; i < res.length; i++) if (res[i].transcript) alts.push(res[i].transcript);
    if (!alts.length) return;
    var isFinal = !!res.isFinal; recGotResult = true; recStats.results++;
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
    $("startCard").hidden = running;
    $("ctrlCard").hidden = !running;
    var showQuiz = running && s.mode === "quiz" && s.question, showLesson = running && s.mode === "lesson" && s.lesson;
    $("quizCard").hidden = !showQuiz; $("lessonCard").hidden = !showLesson;
    if (showQuiz) renderQuiz(s);
    if (showLesson) { $("lName").textContent = s.lesson.name; $("lPart").textContent = "Part " + (s.lesson.seg + 1) + " of " + s.lesson.count; $("lVariant").textContent = s.lesson.variant === "simple" ? "Simple version" : s.lesson.variant === "summary" ? "Short version" : "Full lesson"; $("lText").textContent = s.lesson.text; $("lBar").style.width = Math.round(100 * (s.lesson.seg + (s.speaking ? 0.5 : 1)) / s.lesson.count) + "%"; $("lTopicNo").textContent = "Topic " + (s.lesson.ti + 1) + " of " + s.lesson.tcount; $("lMsg").textContent = s.audioError ? "" : (s.phase === "lessonWait" || s.phase === "lessonEnd" ? (s.message || "") : ""); }
    $("sessCount").textContent = s.session.answered; $("sessRight").textContent = s.session.correct;
    $("gymSub").textContent = s.muted ? 'Say "' + tutor.settings.unmuteKeyword + '" or tap the button' : (s.running ? "Tap the button to pause" : "");
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
    if (s.running) {
      if (s.muted) { cls = "muted"; word = "MUTED"; text = tutor.settings.muteMode === "off" ? "Microphone is OFF. Tap UNMUTE." : 'Ignoring everything. Say "' + tutor.settings.unmuteKeyword + '" or "unmute", or tap UNMUTE.'; }
      else if (s.audioError) { cls = "error"; word = "NO SOUND"; text = "I couldn't play sound. Tap TEST SOUND."; }
      else if (s.audioPaused) { cls = "paused"; word = "PAUSED"; text = "Audio is paused. Tap RESUME or say resume."; }
      else if (!SR || micError === "fatal" || userMicOff) { cls = "micoff"; word = "BUTTONS ONLY"; text = "Voice listening is not available. Tap the buttons."; }
      else if (micError === "loop") { cls = "micoff"; word = "MIC PAUSED"; text = "The mic kept stopping. Tap RESTART MIC."; }
      else if (s.speaking) { cls = "speaking"; word = "PLAYING"; text = tutor.settings.bargeIn ? "You can say mute or a command." : "Tap MUTE / PAUSE to stop me, or say mute. I listen again when I finish."; }
      else { cls = recOn ? "listening" : "micoff"; word = recOn ? "LISTENING" : "STARTING MIC"; text = recOn ? "Go ahead and speak. Say mute to pause me." : "One moment..."; }
      if (wake) text += "  Screen stays on."; else if (tutor.settings.wakeLock && navigator.wakeLock) text += "";
    }
    b.className = "banner " + cls; w.textContent = word; sub.textContent = text;
    $("btnMute").hidden = !(s.running && !s.muted); $("btnUnmute").hidden = !(s.running && s.muted);
    $("heardLine").hidden = !(s.running && !s.muted && lastHeard);
    var err = $("audioErr"); var showErr = !!(s.running && s.audioError) || !!soundFail;
    err.hidden = !showErr;
    if (showErr) $("audioErrWhy").textContent = (s.audioError || soundFail || "") + "";
    $("btnMicRetry").hidden = !(s.running && (micError === "loop" || (SR && !recOn && !s.muted && micError !== "fatal" && false)));
    var pa = $("btnPauseAudio"); if (pa) { pa.hidden = !(s.running && !s.muted); pa.textContent = s.audioPaused ? "\u25B6 RESUME" : "\u23F8 PAUSE AUDIO"; }
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
    $("setBarge").checked = tutor.settings.bargeIn; $("setAuto").checked = tutor.settings.autoAdvance; $("setLessonAuto").checked = tutor.settings.lessonAuto; $("setAlsoUnmute").checked = tutor.settings.alsoUnmute; $("setWake").checked = tutor.settings.wakeLock;
    Array.prototype.forEach.call(document.getElementsByName("muteMode"), function (r) { r.checked = r.value === tutor.settings.muteMode; });
    document.documentElement.style.fontSize = (20 * tutor.settings.fontScale) + "px";
    fillVoiceSelect();
  }

  /* ---------- actions ---------- */
  var pendingStart = null, soundFail = "", soundCardMode = "";
  function startSession(opts) {
    opts = opts || {};
    if (!tutor.settings.soundOk) { pendingStart = opts; openSoundCard("First, a quick sound check."); return; }
    doStart(opts);
  }
  function doStart(opts) {
    var f = $("focusSel").value, focus = f === "weak" ? { weak: true } : (f === "acct" || f === "econ") ? { subj: f } : {};
    micError = micError === "fatal" ? "fatal" : ""; recStats.quick = 0; soundFail = "";
    if (!opts.lesson) opts.focus = focus; else opts.focus = {};
    switchTab("tutor");
    userMicOff = false;
    tutor.start(opts);
    acquireWake();
    syncMic();
  }
  /* ---------- sound check ---------- */
  function openSoundCard(msg) {
    switchTab("tutor"); $("soundCard").hidden = false; $("startCard").hidden = true; $("scMsg").textContent = msg || ""; $("scAsk").hidden = true; $("scHelp").hidden = true;
    $("soundCard").scrollIntoView && $("soundCard").scrollIntoView({ block: "center" });
  }
  function testSound() {
    // plays a beep and then a spoken sentence. Always a direct result of a tap.
    if (tutor.running) tutor.hardStopSpeech();
    soundFail = ""; $("soundCard").hidden = false; $("scAsk").hidden = true; $("scHelp").hidden = true; $("scMsg").textContent = "Playing... you should hear a beep, then my voice.";
    speak(E.SOUND_CLIPS.slice(0, 2), function (ok, why) {
      if (ok) { $("scMsg").textContent = ""; $("scAsk").hidden = false; ev("test sound played to the end"); }
      else { soundFail = "I couldn't play sound. " + why; $("scMsg").textContent = ""; $("scHelp").hidden = false; $("scHelp").textContent = "I couldn't play sound. Tap TEST SOUND to try again. Check: phone volume (media volume, not ringer) is up, silent/Do Not Disturb is off, Bluetooth is connected to the right device, and Chrome is not muted for this site. Details: " + why; }
      updateBanner();
      if (tutor.running) { tutor.message = ""; tutor.emit(); }
    });
  }
  function soundAnswer(yes) {
    $("scAsk").hidden = true;
    if (yes) {
      soundFail = ""; tutor.setSetting("soundOk", true); $("soundCard").hidden = true; ev("sound check: YES");
      var o = pendingStart; pendingStart = null;
      if (o) doStart(o); else { $("startCard").hidden = tutor.running; showAlert("Great, the sound works."); }
      updateBanner();
    } else {
      ev("sound check: NO"); $("scHelp").hidden = false;
      $("scHelp").textContent = "No sound. Try this: 1) turn the MEDIA volume up with the volume button, then tap TEST SOUND again; 2) make sure silent or Do Not Disturb is off; 3) if you use Bluetooth earbuds, check they are connected; 4) in Chrome, tap the lock icon near the address bar and make sure Sound is allowed; 5) close the app and open it again. I will not start a lesson until you hear this.";
    }
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
    $("btnTestSound").addEventListener("click", testSound); $("btnTestSound2").addEventListener("click", testSound); $("btnTestSound3").addEventListener("click", testSound);
    $("scPlay").addEventListener("click", testSound); $("scYes").addEventListener("click", function () { soundAnswer(true); }); $("scNo").addEventListener("click", function () { soundAnswer(false); });
    $("scCancel").addEventListener("click", function () { pendingStart = null; $("soundCard").hidden = true; $("startCard").hidden = tutor.running; });
    $("btnMicRetry").addEventListener("click", restartMic); $("btnMicRetry2").addEventListener("click", restartMic);
    $("btnPauseAudio").addEventListener("click", function () { tutor.ui("pauseaudio"); });
    $("btnSaveAudio").addEventListener("click", saveAllAudio);
    $("ver").textContent = APP_VERSION; $("ver2").textContent = APP_VERSION;
    $("btnStartLesson").addEventListener("click", function () { startSession({ lesson: tutor.topics[0].key }); });
    $("btnMute").addEventListener("click", function () { tutor.mute(); syncMic(); ev("MUTE button"); });
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
    window.addEventListener("online", netNote); window.addEventListener("offline", netNote); netNote();
    var dip; window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); dip = e; $("btnInstall").hidden = false; });
    $("btnInstall").addEventListener("click", function () { if (dip) { dip.prompt(); dip = null; $("btnInstall").hidden = true; } });
    $("supportNote").textContent = (SR ? "Voice listening is available." : "This browser can not listen to your voice. Use Chrome on Android. You can still use the buttons.");
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
