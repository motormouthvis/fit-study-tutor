// v5.9.13: microphone capability detection + plain-English error messages (the Cybertruck-browser fix)
const test = require("node:test"), assert = require("node:assert");
const MS = require("../micsupport.js");
const TESLA = "Mozilla/5.0 (X11; GNU/Linux) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/6.5 Chrome/108 Safari/537.36 Tesla/2026.26.6.5";
test("speech API and getUserMedia are detected separately", () => {
  const a = MS.capabilities({ webkitSpeechRecognition: function () {} }, {});
  assert.strictEqual(a.sr, true); assert.strictEqual(a.gum, false);
  const b = MS.capabilities({}, { mediaDevices: { getUserMedia() {} } });
  assert.strictEqual(b.sr, false); assert.strictEqual(b.gum, true); assert.strictEqual(b.gumModern, true);
  const c = MS.capabilities({}, {}); assert.strictEqual(c.sr || c.gum, false);
});
test("insecure pages are noticed, an unknown value is not an error", () => {
  assert.strictEqual(MS.capabilities({ isSecureContext: false }, {}).secure, false);
  assert.strictEqual(MS.capabilities({}, {}).secure, true);
});
test("Tesla browser is recognised from the user agent", () => {
  assert.strictEqual(MS.capabilities({}, { userAgent: TESLA }).tesla, true);
  assert.strictEqual(MS.capabilities({}, { userAgent: "Mozilla/5.0 Chrome/120" }).tesla, false);
});
test("every speech error code has a retry-able plain-English message (no code words shown raw)", () => {
  ["not-allowed", "service-not-allowed", "no-speech", "audio-capture", "network", "aborted", "no-start", "start-threw", "nothing-heard"].forEach((code) => {
    const e = MS.classifyError(code, {});
    assert.ok(e.message.length > 20, code); assert.strictEqual(typeof e.retry, "boolean", code);
    assert.ok(!/not-allowed|service-not-allowed|audio-capture/.test(e.message), code + " message has no raw code");
  });
  assert.strictEqual(MS.classifyError("not-allowed").retry, true);
  assert.strictEqual(MS.classifyError("service-not-allowed").fatal, true);
  assert.strictEqual(MS.classifyError("no-speech").retry, true);
  assert.match(MS.classifyError("network").message, /internet/i);
  assert.match(MS.classifyError("audio-capture").message, /microphone/i);
  assert.match(MS.classifyError("no-api").message, /buttons or the type box/);
  assert.strictEqual(MS.classifyError("no-api").retry, false);
});
test("the Tesla variant tells him to tap Allow on the car screen", () => {
  assert.match(MS.classifyError("not-allowed", { tesla: true }).message, /tap Allow/);
  assert.doesNotMatch(MS.classifyError("not-allowed", { tesla: false }).message, /On the car/);
});
test("getUserMedia error names map to the same messages", () => {
  assert.strictEqual(MS.classifyMediaError("NotAllowedError").kind, "blocked");
  assert.strictEqual(MS.classifyMediaError("NotFoundError").kind, "no-mic");
  assert.strictEqual(MS.classifyMediaError("NotReadableError").kind, "busy");
});
test("the report names speech API, permission and audio level, and ends with a verdict", () => {
  const caps = MS.capabilities({ webkitSpeechRecognition: function () {} }, { mediaDevices: { getUserMedia() {} }, userAgent: TESLA });
  const t = MS.reportText({ caps, perm: "granted", gum: { ok: true }, level: { peak: 0.4, heard: true }, sr: null }, "v5.9.13");
  assert.match(t, /Speech API: yes/); assert.match(t, /Permission: granted/); assert.match(t, /Audio level: sound heard/); assert.match(t, /Tesla car browser/); assert.match(t, /Result: /);
  const none = MS.reportText({ caps: MS.capabilities({}, {}) });
  assert.match(none, /Speech API: NO/); assert.match(none, /getUserMedia: NO/);
});
test("verdict: no speech API, blocked mic, silent mic, success", () => {
  const noSr = MS.capabilities({}, { mediaDevices: { getUserMedia() {} } });
  assert.match(MS.verdict({ caps: noSr, gum: { ok: true } }), /no speech-to-text/);
  const sr = MS.capabilities({ SpeechRecognition: function () {} }, { mediaDevices: { getUserMedia() {} } });
  assert.match(MS.verdict({ caps: sr, gum: { ok: false, error: "NotAllowedError" } }), /blocked the microphone/);
  assert.match(MS.verdict({ caps: sr, gum: { ok: true }, level: { heard: false } }), /silence/);
  assert.match(MS.verdict({ caps: sr, gum: { ok: true }, sr: { ok: true, text: "hello" } }), /Voice works/);
});
