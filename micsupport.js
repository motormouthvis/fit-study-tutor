/* v5.9.13: what the microphone / speech recognition can and cannot do in THIS browser (pure, no DOM, unit-tested).
   The Tesla (Cybertruck) in-car browser is Chromium-based but does not always ship the Web Speech API, and its
   getUserMedia only works on newer software (2026.26 and later, per Tesla's release notes; older software blocked it).
   So nothing here assumes a mic: every piece is detected on its own and every failure becomes one plain sentence. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.MicSupport = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function isTesla(ua) { return /QtCarBrowser|Tesla/i.test(String(ua || "")); }
  // win = window, nav = navigator (both injectable for tests)
  function capabilities(win, nav) {
    win = win || {}; nav = nav || {};
    var md = nav.mediaDevices, SRc = win.SpeechRecognition || win.webkitSpeechRecognition || null;
    return {
      secure: win.isSecureContext !== false,                                   // false only when the browser says so
      sr: !!SRc, srName: win.SpeechRecognition ? "SpeechRecognition" : win.webkitSpeechRecognition ? "webkitSpeechRecognition" : "",
      gum: !!(md && typeof md.getUserMedia === "function") || !!(nav.getUserMedia || nav.webkitGetUserMedia),
      gumModern: !!(md && typeof md.getUserMedia === "function"),
      recorder: typeof win.MediaRecorder !== "undefined",
      audioCtx: !!(win.AudioContext || win.webkitAudioContext),
      perms: !!(nav.permissions && typeof nav.permissions.query === "function"),
      tesla: isTesla(nav.userAgent), ua: String(nav.userAgent || "")
    };
  }
  /* A speech-recognition error code (or one of our own: "no-start", "start-threw", "nothing-heard", "no-api", "insecure")
     -> { kind, message, retry, fatal }. retry = show a Try again button. fatal = trying again will probably not help. */
  function classifyError(code, caps) {
    caps = caps || {}; var car = caps.tesla ? " On the car, tap Allow when the screen asks about the microphone." : "";
    switch (code) {
      case "not-allowed": return { kind: "blocked", fatal: false, retry: true, message: "The browser blocked the microphone." + car + " If it stays blocked, allow Microphone for this site in the browser's site settings, then tap Try again. You can still use the buttons or the type box." };
      case "service-not-allowed": return { kind: "service-off", fatal: true, retry: true, message: "This browser has speech-to-text switched off, even if the microphone itself works. Use the buttons or the type box." };
      case "no-speech": return { kind: "no-speech", fatal: false, retry: true, message: "I did not hear anything. Tap Try again and start talking right after it says Listening." };
      case "audio-capture": return { kind: "no-mic", fatal: false, retry: true, message: "No microphone was found, or another app is using it. Check the microphone, then tap Try again, or use the buttons or the type box." };
      case "network": return { kind: "network", fatal: false, retry: true, message: "This browser's speech-to-text service did not answer. Your internet is probably fine: some car and in-app browsers cannot reach the speech service even when the connection works. Tap Try again once, or use the buttons or the type box." };
      case "aborted": return { kind: "stopped", fatal: false, retry: true, message: "Listening was stopped. Tap Try again when you are ready." };
      case "language-not-supported": return { kind: "language", fatal: true, retry: false, message: "This browser cannot recognise English speech. Use the buttons or the type box." };
      case "no-api": return { kind: "no-api", fatal: true, retry: false, message: "This browser can't listen. Use the buttons or the type box." + (caps.gum ? " (The microphone looks available, but there is no speech-to-text here.)" : "") };
      case "insecure": return { kind: "insecure", fatal: true, retry: false, message: "The microphone only works on a secure (https) page. Open the app from its https address, or use the buttons or the type box." };
      case "no-start": return { kind: "no-start", fatal: false, retry: true, message: "The microphone did not start. Some car and in-app browsers need a tap each time. Tap Try again, or use the type box." + car };
      case "start-threw": return { kind: "no-start", fatal: false, retry: true, message: "The browser would not start listening. Wait a second and tap Try again, or use the type box." };
      case "nothing-heard": return { kind: "no-speech", fatal: false, retry: true, message: "I did not catch anything. Tap Try again and speak clearly, or use the type box." };
      default: return { kind: "other", fatal: false, retry: true, message: "Listening stopped" + (code ? " (" + code + ")" : "") + ". Tap Try again, or use the buttons or the type box." };
    }
  }
  // getUserMedia rejects with a DOMException name
  function classifyMediaError(name, caps) {
    switch (name) {
      case "NotAllowedError": case "PermissionDeniedError": case "SecurityError": return classifyError("not-allowed", caps);
      case "NotFoundError": case "DevicesNotFoundError": case "OverconstrainedError": return classifyError("audio-capture", caps);
      case "NotReadableError": case "TrackStartError": case "AbortError": return { kind: "busy", fatal: false, retry: true, message: "The microphone is busy or could not be opened. Close other apps using it, then tap Try again." };
      case "TypeError": return classifyError("insecure", caps);
      default: return classifyError(name || "", caps);
    }
  }
  /* The report on the Test microphone screen. r = { caps, perm, gum: { ok, error }, level: { peak, heard }, devices, sr: { ok, text, error } } */
  function verdict(r) {
    r = r || {}; var c = r.caps || {}; var micOk = !!(r.gum && r.gum.ok), srOk = !!(r.sr && r.sr.ok);
    if (!c.sr) return micOk ? "No voice commands here: this browser has a microphone but no speech-to-text. Use the buttons and the type box." : "No voice here: this browser can't listen. Use the buttons and the type box.";
    if (r.sr && r.sr.error) return "Speech-to-text failed (" + r.sr.error + "). " + classifyError(r.sr.error, c).message;
    if (srOk) return "Voice works: the browser heard \u201C" + (r.sr.text || "") + "\u201D.";
    if (r.gum && r.gum.error) return classifyMediaError(r.gum.error, c).message;
    if (micOk && r.level && r.level.heard === false) return "The microphone opened but I heard only silence. Tap the screen once, speak close to it, and run the test again.";
    return micOk ? "The microphone works. Now tap \u201CTest speech-to-text\u201D and say a few words." : "Tap \u201CCheck the microphone\u201D to start.";
  }
  function reportText(r, version) {
    r = r || {}; var c = r.caps || {}, L = [];
    L.push("Microphone test" + (version ? " (" + version + ")" : ""));
    L.push("Secure page (https): " + (c.secure ? "yes" : "NO"));
    L.push("Speech API: " + (c.sr ? "yes (" + c.srName + ")" : "NO"));
    L.push("getUserMedia: " + (c.gum ? "yes" : "NO") + " | MediaRecorder: " + (c.recorder ? "yes" : "no") + " | AudioContext: " + (c.audioCtx ? "yes" : "no"));
    L.push("Permission: " + (r.perm || "unknown"));
    L.push("Mic opened: " + (!r.gum ? "not tested" : r.gum.ok ? "yes" : "NO (" + (r.gum.error || "?") + ")"));
    L.push("Audio level: " + (!r.level ? "not tested" : (r.level.heard ? "sound heard" : "silence") + " (peak " + Math.round((r.level.peak || 0) * 100) + "%)"));
    if (r.devices != null) L.push("Microphones listed: " + r.devices);
    L.push("Speech-to-text: " + (!r.sr ? "not tested" : r.sr.ok ? "heard \u201C" + r.sr.text + "\u201D" : "NO (" + (r.sr.error || "?") + ")"));
    L.push("Browser: " + (c.tesla ? "Tesla car browser | " : "") + (c.ua || "?"));
    L.push("Result: " + verdict(r));
    return L.join("\n");
  }
  return { capabilities: capabilities, classifyError: classifyError, classifyMediaError: classifyMediaError, verdict: verdict, reportText: reportText, isTesla: isTesla };
});
