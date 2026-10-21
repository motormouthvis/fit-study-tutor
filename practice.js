// v5.8 Practice tests: pick book + chapter + type; MC auto-graded, written answers saved locally and copied for grading.
(function () {
  var P = window.PRACTICE; if (!P) return;
  var LS = "practiceAnswers.v1", st = { book: null, ch: null, type: null, mcPick: {}, graded: false };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function load() { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { return {}; } }
  function save(k, v) { var a = load(); a[k] = v; try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) {} }
  function key(kind, num) { return [st.book, st.ch, kind, num].join("|"); }
  var TYPES = { summary: "Summary points", mc: "Multiple choice", problems: "Individual problems", all: "All three" };
  function fill() {
    var bs = $("pqBook"); bs.innerHTML = Object.keys(P).map(function (b) { return '<option value="' + b + '">' + esc(P[b].title) + "</option>"; }).join("");
    bs.onchange = fillCh; fillCh();
  }
  function fillCh() { var b = P[$("pqBook").value]; $("pqCh").innerHTML = Object.keys(b.chapters).map(function (c) { return '<option value="' + c + '">Chapter ' + c + "</option>"; }).join(""); }
  function start() {
    st.book = $("pqBook").value; st.ch = $("pqCh").value; st.type = $("pqType").value; st.graded = false;
    var saved = load(); st.mcPick = {};
    var c = P[st.book].chapters[st.ch], h = "", show = function (t) { return st.type === "all" || st.type === t; };
    h += '<h2>' + esc(P[st.book].title) + " &middot; Chapter " + st.ch + "</h2>";
    if (show("summary")) {
      h += '<h3 class="pqh">Summary of main points</h3>';
      c.summary.forEach(function (s) { var k = key("summary", s.num);
        h += '<div class="pqq"><div class="pqtext"><b>S' + s.num + '.</b> Explain in your own words: ' + esc(s.text) + '</div><textarea class="pqta" data-k="' + k + '" rows="4">' + esc(saved[k] || "") + "</textarea></div>"; });
    }
    if (show("mc")) {
      h += '<h3 class="pqh">Multiple-choice questions</h3>';
      c.mc.forEach(function (m) {
        h += '<div class="pqq" id="pqmc' + m.num + '"><div class="pqtext"><b>' + m.num + ".</b> " + esc(m.q) + "</div>";
        m.opts.forEach(function (o, i) { h += '<label class="pqopt"><input type="radio" name="pqmc' + m.num + '" value="' + i + '"> <b>' + "ABCD"[i] + ".</b> " + esc(o) + "</label>"; });
        h += '<div class="pqres" hidden></div></div>';
      });
      h += '<button id="pqGrade" class="bigbtn go">SUBMIT MULTIPLE CHOICE</button><div id="pqScore" class="pqscore" hidden></div>';
    }
    if (show("problems")) {
      h += '<h3 class="pqh">Individual problems</h3><p class="small">Graded homework problems are not included here.</p>';
      c.problems.forEach(function (p) { var k = key("problems", p.num);
        h += '<div class="pqq"><div class="pqtext"><b>' + p.num + ". " + esc(p.title) + '</b><div class="pqbody">' + esc(p.text).replace(/\n/g, "<br>") + '</div></div><textarea class="pqta" data-k="' + k + '" rows="6">' + esc(saved[k] || "") + "</textarea></div>"; });
    }
    if (show("summary") || show("problems")) h += '<button id="pqCopy" class="bigbtn go">COPY ANSWERS FOR GRADING</button><p class="small">Paste into your Grok Bot chat to get graded. Answers save on this device as you type.</p>';
    h += '<button id="pqBack" class="btn wide">Back to quiz list</button>';
    $("pqPick").hidden = true; var w = $("pqWork"); w.innerHTML = h; w.hidden = false; w.scrollIntoView && w.scrollIntoView();
    Array.prototype.forEach.call(w.querySelectorAll(".pqta"), function (t) { t.addEventListener("input", function () { save(t.dataset.k, t.value); }); });
    Array.prototype.forEach.call(w.querySelectorAll("input[type=radio]"), function (r) { r.addEventListener("change", function () { st.mcPick[r.name.slice(4)] = +r.value; }); });
    if ($("pqGrade")) $("pqGrade").onclick = grade;
    if ($("pqCopy")) $("pqCopy").onclick = copy;
    $("pqBack").onclick = function () { w.hidden = true; $("pqPick").hidden = false; };
  }
  function grade() {
    var c = P[st.book].chapters[st.ch], right = 0, wrong = [];
    c.mc.forEach(function (m) {
      var pick = st.mcPick[m.num], ok = pick === m.key, box = $("pqmc" + m.num), r = box.querySelector(".pqres");
      if (ok) right++; else wrong.push(m.num);
      r.hidden = false; r.className = "pqres " + (ok ? "ok" : "bad");
      r.innerHTML = (ok ? "&#10004; Correct. " : "&#10008; " + (pick == null ? "Not answered. " : "You picked " + "ABCD"[pick] + ". ") + "Answer: <b>" + "ABCD"[m.key] + "</b>. ") + esc(m.why);
      Array.prototype.forEach.call(box.querySelectorAll("input"), function (i) { i.disabled = true; });
    });
    var s = $("pqScore"); s.hidden = false;
    s.innerHTML = "Score: <b>" + right + " / " + c.mc.length + "</b>" + (wrong.length ? " &middot; Missed: " + wrong.join(", ") : " &middot; Perfect!");
    $("pqGrade").disabled = true; s.scrollIntoView && s.scrollIntoView();
  }
  function textBlock(book, ch, type, answers) { return window.PracticeText(book, ch, type, answers); }
  function copy() {
    var t = textBlock(st.book, st.ch, st.type, load());
    function done() { var b = $("pqCopy"); b.textContent = "COPIED"; setTimeout(function () { b.textContent = "COPY ANSWERS FOR GRADING"; }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fb); else fb();
    function fb() { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} ta.remove(); }
  }
  function init() { if (!$("pqPick")) return; fill(); $("pqStart").onclick = start; }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
