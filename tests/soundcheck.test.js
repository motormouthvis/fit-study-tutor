const test = require("node:test"), assert = require("node:assert"), fs = require("fs");
const html = fs.readFileSync(__dirname + "/../index.html", "utf8"), app = fs.readFileSync(__dirname + "/../app.js", "utf8");
test("v5.8.2 sound check: YES button exists and is not hidden by default", () => {
  assert.match(html, /<div id="scAsk">/); assert.match(html, /id="scYes"[^>]*>YES</);
});
test("v5.8.2 sound check: YES shown when the card opens / test plays, not only after playback ends", () => {
  assert.ok(!/\$\("scAsk"\)\.hidden = true; \$\("scHelp"\)\.hidden = true;/.test(app));
});
test("v5.8.2 sound check: YES is remembered in localStorage and skips the prompt", () => {
  assert.match(app, /localStorage\.setItem\(SOUND_OK_KEY, "1"\)/);
  assert.match(app, /if \(!soundConfirmed\(\)\) \{ pendingStart/);
});
