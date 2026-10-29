// v5.9.13: the voice phrases of the single "?" card button
const test = require("node:test"), assert = require("node:assert");
const CV = require("../cardvoice.js");
const act = (t) => CV.parse(t).action;
test("every action is reachable by at least one spoken phrase", () => {
  const phrases = {
    discuss: "discuss this card", explain: "explain this card", improve: "improve this card", similar: "make another card like this", create: "create a new card about working capital",
    important: "mark important", restudy: "restudy", flip: "flip", got: "got it", missed: "missed it", prev: "previous", next: "skip",
    reset: "reset to original", delete: "delete this card", close: "close", help: "what can I say"
  };
  CV.ACTIONS.forEach((a) => { assert.ok(phrases[a], "test phrase for " + a); assert.strictEqual(act(phrases[a]), a, a); });
  Object.keys(phrases).forEach((a) => assert.ok(CV.ACTIONS.indexOf(a) >= 0, a + " is a known action"));
});
test("explain / improve / more like it / create", () => {
  assert.strictEqual(act("what does this mean"), "explain");
  assert.strictEqual(act("make more cards like it"), "similar");
  assert.strictEqual(act("give me similar cards"), "similar");
  assert.deepStrictEqual(CV.parse("make another card like this").note, "");
});
test("improve takes his words as a note (feedback), or none", () => {
  assert.deepStrictEqual([CV.parse("improve this card").action, CV.parse("improve this card").note], ["improve", ""]);
  assert.strictEqual(CV.parse("improve it, make it shorter").note, "make it shorter");
  assert.deepStrictEqual([act("make it shorter and clearer"), CV.parse("make it shorter and clearer").note], ["improve", "make it shorter and clearer"]);
});
test("create takes the topic as the note, or none", () => {
  assert.strictEqual(CV.parse("create a new card about working capital").note, "working capital");
  assert.strictEqual(CV.parse("new card on liquidity ratios").note, "liquidity ratios");
  assert.strictEqual(CV.parse("add a card about the current ratio").action, "create");
  assert.strictEqual(CV.parse("create a brand new flash card").note, "");
});
test("card controls by voice", () => {
  [["show the answer", "flip"], ["i got it", "got"], ["i missed it", "missed"], ["skip", "next"], ["next", "next"], ["go back", "prev"], ["star it", "restudy"], ["help", "help"]]
    .forEach(([t, a]) => assert.strictEqual(act(t), a, t));
});
test("unknown speech does nothing, and the empty string is safe", () => {
  assert.strictEqual(act("blah blah"), "none"); assert.strictEqual(act(""), "none"); assert.strictEqual(act(null), "none");
});
test("sheet commands (preview screens)", () => {
  assert.strictEqual(CV.parseSheet("save it"), "save"); assert.strictEqual(CV.parseSheet("cancel"), "cancel"); assert.strictEqual(CV.parseSheet("try again"), "again");
  assert.strictEqual(CV.parseSheet("purple"), "none");
});
test("a phrase list exists for the help text", () => { CV.ACTIONS.filter((a) => a !== "help").forEach((a) => assert.ok(CV.PHRASES[a], "phrase for " + a)); });
test("v5.9.15: discuss phrases open the discussion, with an optional first question", () => {
  ["discuss this card", "discuss it", "let's talk", "lets talk about this card", "talk about this card", "talk it through", "let\u2019s discuss"].forEach((t) => assert.equal(CV.parse(t).action, "discuss", t));
  assert.equal(CV.parse("discuss this card").note, "");
  assert.equal(CV.parse("talk about this card, why is it six dollars").note, "why is it six dollars");
  assert.equal(CV.parse("delete this card").action, "delete");
  assert.equal(CV.parse("explain this card").action, "explain");
});
