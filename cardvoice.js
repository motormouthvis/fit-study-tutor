/* v5.9.13: what William says (or types) to the single "?" button on a flash card -> one action (pure, no DOM, unit-tested).
   parse(text) -> { action, note } where action is one of ACTIONS or "none". note is the extra instruction he spoke
   after the command ("improve this card, make it shorter" -> note "make it shorter"); the app treats a note as feedback
   about the card and NEVER puts it into the card text. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.CardVoice = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var ACTIONS = ["discuss", "explain", "improve", "similar", "create", "important", "restudy", "flip", "got", "missed", "prev", "next", "reset", "delete", "close", "help"];
  function norm(t) { return String(t || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim(); }
  // text after the matched command, minus filler words, e.g. "and make it shorter" -> "make it shorter"
  function tail(n, m) {
    var rest = n.slice(m.index + m[0].length).replace(/^( and| then| please| now| but| so| to| that| with| by| it| this| one| card)+ /, " ").trim();
    return rest.replace(/^(please |and |then )+/, "").trim();
  }
  var RULES = [
    ["delete", /\b(delete|remove|throw away|get rid of) (this |the )?(card|it)\b|^(delete|remove)$/],
    ["discuss", /\b(discuss|talk (about|through|over)|talk it (through|over)|talk this (through|over)|let'?s (talk|discuss|chat)|lets (talk|discuss|chat)|have a (talk|conversation|chat)|chat about|conversation about)\b/],
    ["similar", /\b(make|create|write|give me|add|generate|do)( me)?( one| a few| some| two| three| 2| 3)? (more|another|other|similar)( cards?| ones?| one)?( like (this|it|that)( one| card)?)?|\b(more|another|similar) cards? (like|about|on|from)\b|\bcards? like (this|it)\b|\bone more like\b|\bexpand( this| the)?( card)?\b/],
    ["create", /\b(create|make|write|add|start|build|draft|generate)( me)? (a |an |one )?(brand )?(new|blank|fresh|different) (flash ?)?card\b|\b(create|write|make|add) (a |an )?(flash ?)?card (about|on|for|covering|that)\b|\bnew card\b|\bcreate (a )?card\b|\bfrom scratch\b/],
    ["improve", /\b(improve|rewrite|fix|edit|revise|tweak|redo|polish|change|update)\b( this| the| my)?( card| question| answer)?|\bmake (it|this|the card|the question|the answer) (a (little|bit) )?(shorter|clearer|simpler|harder|easier|better|longer|more \w+|less \w+)|\b(better|simpler|shorter|clearer) (card|wording)\b/],
    ["explain", /\b(explain|elaborate|clarify|break (it|this) down|tell me more|ask grok|what does (this|it) mean|help me understand|i (don't|do not|dont) (understand|get)( it| this)?|i'm confused|im confused|confused|why is (this|that)|walk me through)\b/],
    ["missed", /\b(missed|miss it|got (it|that) wrong|i (didn't|did not|didnt|don't|dont) (get|know) (it|that)|wrong|incorrect|i forgot|didn't know)\b/],
    ["got", /\b(got it|i got it|got that|i knew (it|that)|knew it|correct|i was right|nailed it|easy)\b|^(right|yes i did|good)$/],
    ["important", /\bimportant\b/],
    ["restudy", /\b(re ?study|study (it |this )?again|review (it |this )?(later|again)|star( this| it)?|mark (it |this )?for (review|later)|come back to (this|it)|save for later)\b/],
    ["flip", /\b(flip|turn (it |the card )?over|show (me )?(the )?(answer|back)|reveal|see (the )?answer|what's the answer|whats the answer)\b/],
    ["prev", /\b(previous|prev|go back|last card|back one|one back|before this)\b|^back$/],
    ["next", /\b(next|skip|pass|move on|following card)\b/],
    ["reset", /\b(reset|undo|put (it )?back|original|revert|restore)\b/],
    ["close", /\b(close|cancel|never ?mind|exit|dismiss|go away|that's all|thats all|i'm done|im done|done|stop|quit)\b/],
    ["help", /\b(help|what can i say|commands|options|what can you do)\b/]
  ];
  function parse(text) {
    var n = norm(text); if (!n) return { action: "none", note: "", text: n };
    for (var i = 0; i < RULES.length; i++) {
      var m = RULES[i][1].exec(n); if (!m) continue; var a = RULES[i][0], note = "";
      if (a === "discuss") { note = tail(n, m).replace(/^(about|on|through|over|of)( this| the| it| that)?( card| one)?( |$)/, "").replace(/^(and |then |so )+/, "").replace(/^((this|the|that|it|one) )*(card|one|it)$/, "").trim(); }
      else if (a === "improve") {
        // "make it shorter" is itself the instruction; "improve this card, add an example" -> "add an example"
        note = /^make /.test(m[0]) || /^(better|simpler|shorter|clearer) /.test(m[0]) ? n.slice(m.index) : tail(n, m);
        if (/^(fix|change|edit|update|redo)$/.test(note)) note = "";
      } else if (a === "similar") { note = tail(n, m).replace(/^(like |but |that )+/, "").replace(/^(this|it|that)( one| card)?( |$)/, "").replace(/^(but |and )/, "").trim(); }
      else if (a === "create") {
        note = tail(n, m).replace(/^(about|on|for|covering|that covers|that is about|regarding|called|titled) /, "").trim();
        if (/^(please|one|a|an|new|card)$/.test(note)) note = "";
      }
      return { action: a, note: note, text: n };
    }
    return { action: "none", note: "", text: n };
  }
  /* on the Improve / More cards / Create preview screen: save it, cancel, or go again */
  function parseSheet(text) {
    var n = norm(text); if (!n) return "none";
    if (/\b(try again|again|redo|another one|different one|regenerate|redraft)\b/.test(n)) return "again";
    if (/\b(cancel|never ?mind|discard|close|no thanks|don't save|dont save|throw (it )?away)\b|^no$/.test(n)) return "cancel";
    if (/\b(save|keep (it|this)|looks good|that's good|thats good|use (it|this)|accept|replace (the )?card)\b|^(yes|ok|okay|good)$/.test(n)) return "save";
    return "none";
  }
  var PHRASES = {
    discuss: "\u201Cdiscuss this card\u201D or \u201Clet's talk\u201D", explain: "\u201Cexplain this card\u201D", improve: "\u201Cimprove this card\u201D (add what to change: \u201Cimprove this card, make it shorter\u201D)", similar: "\u201Cmake another card like it\u201D",
    create: "\u201Ccreate a new card about working capital\u201D", important: "\u201Cmark important\u201D", restudy: "\u201Crestudy\u201D", flip: "\u201Cflip\u201D", got: "\u201Cgot it\u201D", missed: "\u201Cmissed it\u201D",
    prev: "\u201Cprevious\u201D", next: "\u201Cnext\u201D or \u201Cskip\u201D", reset: "\u201Creset to original\u201D", delete: "\u201Cdelete this card\u201D (say it twice)", close: "\u201Cclose\u201D"
  };
  return { parse: parse, parseSheet: parseSheet, ACTIONS: ACTIONS, PHRASES: PHRASES, norm: norm };
});
