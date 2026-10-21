const test = require("node:test"), assert = require("node:assert");
const P = require("../practice-data.js");
const HW = ["2-2", "2-3", "3-2", "3-5", "3-7"];
test("froeb chapters 1-3 present", () => { assert.deepEqual(Object.keys(P.froeb.chapters), ["1", "2", "3"]); });
test("no graded homework problems anywhere", () => {
  for (const [n, c] of Object.entries(P.froeb.chapters)) for (const p of c.problems) assert.ok(!HW.includes(p.num), p.num);
  const raw = require("fs").readFileSync(__dirname + "/../practice-data.js", "utf8");
  for (const h of HW) assert.ok(!new RegExp("\\b" + h + "\\b").test(raw), h + " found in file");
  assert.ok(!/HOMEWORK - omitted/i.test(raw));
});
test("every MC has 4 options, a valid key and a why", () => {
  for (const c of Object.values(P.froeb.chapters)) { assert.equal(c.mc.length, 10);
    for (const m of c.mc) { assert.equal(m.opts.length, 4); assert.ok(Number.isInteger(m.key) && m.key >= 0 && m.key < 4); assert.ok(m.why.length > 10); } }
});
test("copy text includes question text and answers", () => {
  const t = P.__text("froeb", "3", "all", { "froeb|3|problems|3-1": "my ans" });
  assert.ok(t.includes("3-1. Concert Opportunity Cost") && t.includes("My answer: my ans") && t.includes("S1. Explain in your own words"));
});
