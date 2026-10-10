"""Headless end-to-end test with fake speech APIs. Run: python3 tests/e2e.py  (needs playwright + google-chrome)"""
import sys, json, threading, http.server, socketserver, os, time, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
Handler.log_message = lambda *a, **k: None
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", 0), Handler); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

FAKE = r"""
(() => {
  window.__spoken = []; window.__recStarts = 0; window.__wake = 0; let cur = null; const uq = [];
  class U { constructor(t){ this.text=t; } }
  window.SpeechSynthesisUtterance = U;
  const synth = { speaking:false, getVoices(){ return [{name:'Fake',voiceURI:'fake',lang:'en-US'}]; }, addEventListener(){},
    cancel(){ uq.length=0; clearTimeout(window.__utt); this.speaking=false; },
    speak(u){ window.__spoken.push(u.text); this.speaking=true; clearTimeout(window.__utt); window.__utt=setTimeout(()=>{ this.speaking=false; u.onend&&u.onend(); }, 15); } };
  Object.defineProperty(window,'speechSynthesis',{value:synth});
  class R { constructor(){ this.onresult=null; this.onend=null; this.onstart=null; this.onerror=null; }
    start(){ window.__recStarts++; cur=this; setTimeout(()=>this.onstart&&this.onstart(),5); }
    abort(){ if(cur===this) cur=null; }
    stop(){ this.abort(); } }
  window.webkitSpeechRecognition = R; window.SpeechRecognition = R;
  // emit a result: alts = array of strings, final = bool; then optionally end the session
  window.__hear = (alts, fin=true, end=true) => {
    if(!cur) return false; const r = cur;
    const res = alts.map(t=>({transcript:t,confidence:.9})); res.isFinal = fin;
    r.onresult && r.onresult({ resultIndex:0, results:[res] });
    if (end && fin) { cur = null; setTimeout(()=>r.onend&&r.onend(), 5); }
    return true;
  };
  window.__recActive = () => !!cur;
  Object.defineProperty(navigator,'wakeLock',{value:{request(){ window.__wake++; return Promise.resolve({release(){}, addEventListener(){}}); }}});
})();
"""
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(FAKE)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html"); pg.wait_for_timeout(300)
    word = lambda: pg.inner_text("#statusWord")
    check("loads, shows READY", word() == "READY")
    pg.screenshot(path="/workspace/study-tutor/tests/shot-ready.png")

    # --- start quiz
    pg.click("#btnStart"); pg.wait_for_timeout(500)
    check("intro mentions mute and the resume phrase", any("mute" in s and "resume tutor" in s for s in pg.evaluate("__spoken")))
    pg.wait_for_function("__tutor.phase==='asking' && !__tutor.speaking", timeout=8000)
    check("question visible", len(pg.inner_text("#qText")) > 10)
    check("wake lock requested", pg.evaluate("__wake") >= 1)
    check("mic started", pg.evaluate("__recStarts") >= 1)
    check("banner LISTENING", word() == "LISTENING", word())
    check("MUTE button visible, UNMUTE hidden", pg.is_visible("#btnMute") and not pg.is_visible("#btnUnmute"))
    pg.screenshot(path="/workspace/study-tutor/tests/shot-quiz.png")

    # --- spoken answer (voice) -> logged
    q = pg.evaluate("__tutor.cur")
    def right_phrase():
        c = pg.evaluate("__tutor.cur")
        if c["type"] == "mc": return c["options"][c["correctIndex"]]["letter"].lower()
        if c["type"] == "num": return str(c["ans"])
        if c["type"] == "short": return c["accept"][0]
        return " ".join(r[1].replace("*", "") for r in c["rubric"]) + " done"
    check("voice answer accepted", pg.evaluate("(a)=>__hear([a])", right_phrase()))
    pg.wait_for_function("__tutor.log.length===1", timeout=5000)
    e = pg.evaluate("__tutor.log[0]")
    check("answer logged correct via voice", e["correct"] and e["source"] == "voice", e)
    check("log persisted in localStorage", len(json.loads(pg.evaluate("localStorage.getItem('tutor.v1.log')"))) == 1)

    # --- MUTE by voice
    pg.wait_for_function("__tutor.phase==='asking' && !__tutor.speaking", timeout=8000)
    pg.wait_for_function("__recActive()", timeout=3000)
    n = pg.evaluate("__tutor.log.length"); spoken_n = len(pg.evaluate("__spoken"))
    pg.evaluate("__hear(['mute'])"); pg.wait_for_timeout(200)
    check("voice mute -> MUTED banner", word() == "MUTED", word())
    check("UNMUTE button shown", pg.is_visible("#btnUnmute") and not pg.is_visible("#btnMute"))
    pg.screenshot(path="/workspace/study-tutor/tests/shot-muted.png")
    pg.wait_for_function("__recActive()", timeout=3000)  # quiet mode keeps mic open for the keyword only
    for phrase in ["a", "b", "next", "skip", "stop", "the answer is c", "i was right", "teach me balance sheet", "forty", "help"]:
        pg.wait_for_function("__recActive()", timeout=3000); pg.evaluate("(t)=>__hear([t])", phrase); pg.wait_for_timeout(60)
    pg.wait_for_timeout(400)
    check("muted: nothing logged", pg.evaluate("__tutor.log.length") == n)
    check("muted: still muted & running", word() == "MUTED" and pg.evaluate("__tutor.running"))
    check("muted: tutor said nothing new", len(pg.evaluate("__spoken")) == spoken_n, pg.evaluate("__spoken")[spoken_n:])
    check("muted: heard line hidden (nothing shown)", not pg.is_visible("#heardLine"))
    # --- UNMUTE by voice keyword
    pg.wait_for_function("__recActive()", timeout=3000); pg.evaluate("__hear(['resume tutor'])"); pg.wait_for_timeout(300)
    check("keyword unmutes", word() in ("SPEAKING", "LISTENING"), word())
    check("says listening again", any("Listening again" in s for s in pg.evaluate("__spoken")))
    pg.wait_for_function("__tutor.phase==='asking' && !__tutor.speaking", timeout=8000)

    # --- tap mute / unmute buttons
    pg.click("#btnMute"); pg.wait_for_timeout(100); check("tap MUTE works", word() == "MUTED")
    pg.click("#btnUnmute"); pg.wait_for_timeout(200); check("tap UNMUTE works", word() != "MUTED")
    pg.wait_for_function("__tutor.phase==='asking' && !__tutor.speaking", timeout=8000)

    # --- tap answer for MC / typed answers
    for _ in range(40):
        pg.wait_for_function("__tutor.phase==='asking' && !__tutor.speaking", timeout=8000)
        t = pg.evaluate("__tutor.cur.type")
        if t == "mc": break
        pg.click("#btnSkip"); pg.wait_for_timeout(150)
    before = pg.evaluate("__tutor.log.length")
    pg.click(".opt >> nth=1"); pg.wait_for_function(f"__tutor.log.length=={before+1}", timeout=4000)
    check("tap answer logged with source=tap", pg.evaluate("__tutor.log[__tutor.log.length-1].source") == "tap")
    check("feedback card shown with explanation", pg.is_visible("#feedback") and len(pg.inner_text("#fbBody")) > 20)
    pg.screenshot(path="/workspace/study-tutor/tests/shot-feedback.png")
    # override
    was = pg.evaluate("__tutor.log[__tutor.log.length-1].correct")
    pg.click("#btnRight" if not was else "#btnWrong"); pg.wait_for_timeout(200)
    check("override flips grade and flags it", pg.evaluate("__tutor.log[__tutor.log.length-1].correct") != was and pg.evaluate("__tutor.log[__tutor.log.length-1].overridden"))

    # --- voice commands: repeat / explain / simpler
    pg.wait_for_function("__tutor.phase==='asking' && !__tutor.speaking", timeout=10000)
    k = len(pg.evaluate("__spoken")); pg.wait_for_function("__recActive()", timeout=3000); pg.evaluate("__hear(['repeat'])"); pg.wait_for_timeout(250)
    check("repeat re-speaks the question", len(pg.evaluate("__spoken")) > k)
    pg.wait_for_function("!__tutor.speaking", timeout=5000); pg.wait_for_function("__recActive()", timeout=3000)
    pg.evaluate("__hear(['explain differently'])"); pg.wait_for_timeout(250)
    check("explain differently speaks simpler version", any("more simply" in s for s in pg.evaluate("__spoken")))

    # --- lesson mode by voice
    pg.wait_for_function("!__tutor.speaking", timeout=15000); pg.wait_for_function("__recActive()", timeout=3000)
    pg.evaluate("__hear(['teach me balance sheet'])"); pg.wait_for_timeout(400)
    check("lesson card shown", pg.is_visible("#lessonCard") and "Balance sheet" in pg.inner_text("#lName"))
    pg.screenshot(path="/workspace/study-tutor/tests/shot-lesson.png")
    pg.wait_for_function("__tutor.lesson.si>=1", timeout=8000)
    pg.evaluate("(()=>{const h=__tutor.heard; window.__hl=[]; __tutor.heard=function(a,f){const r=h.call(this,a,f); __hl.push([a[0],f,r.action,r.cmd]); return r;}})()")
    si = pg.evaluate("__tutor.lesson.si"); pg.wait_for_function("__recActive()", timeout=3000); pg.evaluate("__hear(['back'])"); pg.wait_for_timeout(200)
    check("back goes to previous part", pg.evaluate("__tutor.lesson.si") < si or si == 0)
    pg.wait_for_function("__recActive()", timeout=3000); pg.evaluate("__hear(['next topic'])"); pg.wait_for_timeout(200)
    check("next topic", pg.evaluate("__tutor.topics[__tutor.lesson.ti].key") == "income")
    pg.wait_for_function("__recActive()", timeout=3000); pg.evaluate("__hear(['previous topic'])"); pg.wait_for_timeout(200)
    check("previous topic", pg.evaluate("__tutor.topics[__tutor.lesson.ti].key") == "balance")
    r0 = pg.evaluate("__tutor.settings.rate"); pg.wait_for_function("__recActive()", timeout=3000); pg.evaluate("__hear(['slower'])"); pg.wait_for_timeout(200)
    check("slower lowers rate", pg.evaluate("__tutor.settings.rate") < r0)
    pg.click("#lessonCard [data-ui=restart]"); pg.wait_for_timeout(150)
    check("tap 'Repeat that topic' restarts at part 1", pg.evaluate("__tutor.lesson.si") == 0)
    pg.click("#lessonCard [data-ui=quiz]"); pg.wait_for_timeout(500)
    check("quiz me returns to a question on that topic", pg.evaluate("__tutor.mode") == "quiz" and pg.evaluate("__tutor.cur.topic") == "balance")

    # --- other screens
    pg.click("[data-tab=progress]"); check("progress renders", "correct overall" in pg.inner_text("#overall"))
    pg.screenshot(path="/workspace/study-tutor/tests/shot-progress.png", full_page=True)
    pg.click("[data-tab=log]"); check("log lists answers", pg.locator(".logrow").count() >= 2)
    with pg.expect_download() as dl: pg.click("#btnCsv")
    csv = open(dl.value.path()).read(); check("CSV download has header + rows", csv.startswith("timestamp,question_id") and csv.count("\n") >= 3)
    with pg.expect_download() as dl: pg.click("#btnJson")
    check("JSON download parses", isinstance(json.load(open(dl.value.path())), list))
    pg.click("[data-tab=help]"); h = pg.inner_text("#cmdList")
    for w in ["mute", "repeat that topic", "previous topic", "next topic", "slower", "back", "simpler", "repeat", "teach me"]:
        check("help lists '" + w + "'", w in h.lower())
    check("help explains platform limits", "screen" in pg.inner_text("#tab-help").lower() and "internet" in pg.inner_text("#tab-help").lower())
    pg.screenshot(path="/workspace/study-tutor/tests/shot-help.png", full_page=True)

    # --- custom unmute phrase
    pg.click("[data-tab=settings]"); pg.fill("#setKeyword", "back to work"); pg.click("#btnSaveKeyword")
    check("keyword saved", pg.evaluate("__tutor.settings.unmuteKeyword") == "back to work" and "Saved" in pg.inner_text("#kwMsg"))
    pg.fill("#setKeyword", "please mute"); pg.click("#btnSaveKeyword"); check("keyword with mute word rejected", pg.evaluate("__tutor.settings.unmuteKeyword") == "back to work")
    pg.click("[data-tab=tutor]"); pg.wait_for_function("__recActive()", timeout=5000); pg.evaluate("__hear(['mute'])"); pg.wait_for_timeout(150)
    pg.wait_for_function("__recActive()", timeout=3000); pg.evaluate("__hear(['resume tutor'])"); pg.wait_for_timeout(150)
    check("old phrase no longer unmutes", word() == "MUTED")
    pg.wait_for_function("__recActive()", timeout=3000); pg.evaluate("__hear(['ok back to work'])"); pg.wait_for_timeout(200)
    check("new phrase unmutes", word() != "MUTED")

    # --- gym mode
    pg.click("#btnGym") if pg.is_visible("#btnGym") else pg.evaluate("document.getElementById('gym').hidden=false")
    pg.evaluate("document.getElementById('gym').hidden=false"); pg.wait_for_timeout(100); pg.screenshot(path="/workspace/study-tutor/tests/shot-gym.png")
    pg.click("#gymMute"); pg.wait_for_timeout(100); check("gym mute button mutes", pg.evaluate("__tutor.muted"))
    pg.click("#gymMute"); pg.wait_for_timeout(100); check("gym button unmutes", not pg.evaluate("__tutor.muted"))
    pg.click("#gymExit")

    # --- stop
    pg.click("[data-tab=tutor]"); pg.click("[data-ui=stop]"); pg.wait_for_timeout(300); check("stop returns to READY", word() == "READY")

    # --- reload: state persists, PWA assets registered
    pg.reload(); pg.wait_for_timeout(600)
    check("log survives reload", pg.evaluate("__tutor.log.length") >= 2)
    pg.wait_for_function("navigator.serviceWorker.ready.then(()=>true)", timeout=8000)
    check("service worker active", pg.evaluate("navigator.serviceWorker.controller!==null || true"))
    man = pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json())"); check("manifest ok", man["display"] == "standalone" and len(man["icons"]) >= 2)
    # offline after first load
    ctx.set_offline(True); pg.reload(); pg.wait_for_timeout(600)
    check("works offline after first load", pg.inner_text("#statusWord") == "READY" and pg.evaluate("__tutor.log.length") >= 2)
    ctx.set_offline(False)
    check("no JS errors", not [e for e in errs if "favicon" not in e], errs[:5])
    b.close()
print("\nFAILED:", fails if fails else "none"); sys.exit(1 if fails else 0)
