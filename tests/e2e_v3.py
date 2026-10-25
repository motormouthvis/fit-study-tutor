"""v3 simplified-UI tests: one main screen, slim banner, 3 tabs, menu, +/-10 s, speed chip, graceful 'network' mic errors.
Run: python3 tests/e2e_v3.py"""
import os, sys, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC, mclick, mid, dbg, goto
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "if(!localStorage.getItem('tutor.v1.settings')) localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5, bargeIn:true, lessonGapMs:300}));"
# Android-style failure: the mic opens, then Chrome reports 'network', then the session ends - every single time
NET_REC = r"""(() => { window.__recStarts=0; class R{ constructor(){} start(){ window.__recStarts++; setTimeout(()=>this.onstart&&this.onstart(),5);
  setTimeout(()=>{ this.onerror&&this.onerror({error:'network'}); this.onend&&this.onend(); },60); } abort(){} stop(){} }
  window.webkitSpeechRecognition=R; window.SpeechRecognition=R;
  Object.defineProperty(navigator,'wakeLock',{value:{request(){ return Promise.resolve({release(){}, addEventListener(){}}); }}}); })();"""
word = lambda pg: pg.inner_text("#statusWord")
vis = lambda pg, sel: pg.locator(sel + ":visible").count()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    def newpage(rec=FAKE_REC, rate=None):
        ctx = b.new_context(viewport={"width": 390, "height": 760}, service_workers="allow")
        ctx.add_init_script(rec); ctx.add_init_script(PRESET)
        if rate: ctx.add_init_script(f"window.__testRate={rate};")
        pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(300); return ctx, pg

    # ===== 1. the main screen is simple
    ctx, pg = newpage()
    check("exactly 4 tabs (v5.1): Learn, Quiz, Flash Cards, My Stats", [t.strip() for t in pg.locator(".tab").all_inner_texts()] == ["Learn", "Quiz", "Flash Cards", "My Stats"])
    ids = ["btnPlay", "btnBack10", "btnFwd10", "btnSpeed"]
    check("main screen shows PLAY, back 10, forward 10, speed", all(pg.is_visible("#" + i) for i in ids))
    n = vis(pg, "#lessonCard button")
    check("player card has only 4 buttons before starting (play, back, forward, speed)", n == 4, n)
    check("status banner is one slim line (under 60 px)", pg.locator("#statusBanner").bounding_box()["height"] < 60, pg.locator("#statusBanner").bounding_box())
    check("diagnostics line hidden on the main screen", not pg.is_visible("#dbgLine"))
    box = pg.locator("#btnPlay").bounding_box()
    check("PLAY button is fully visible without scrolling on a 760 px screen", box["y"] + box["height"] < 760, box)
    check("topic list is on the same screen, tappable", pg.locator("#lessonList .trw").count() == 24)
    for old in ["btnMute", "btnUnmute", "btnPauseAudio", "ctrlCard"]:
        check("old clutter gone: #" + old, pg.locator("#" + old).count() == 0)
    # menu holds everything else
    pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])")
    check("menu (idle) has log, settings, help, test sound, restart mic, gym, about", all(pg.is_visible(s) for s in ["[data-goto=log]", "[data-goto=settings]", "[data-goto=help]", "#btnTestSound2", "#btnMicRetry", "#btnGym", "[data-goto=help-about]"]))
    check("menu hides lesson/quiz items when idle", not pg.is_visible("#menu [data-ui=prev]") and not pg.is_visible("#menu [data-ui=stop]"))
    pg.click("#menuClose")
    goto(pg, "help-about"); check("About shows diagnostics line", pg.is_visible("#dbgLine") and ("v4" in dbg(pg) or "v5" in dbg(pg)))
    pg.click(".panel.active [data-back]"); check("Back returns to Learn", pg.is_visible("#btnPlay"))
    goto(pg, "log"); check("Log reachable from menu", pg.is_visible("#btnCsv")); pg.click(".panel.active [data-back]")
    goto(pg, "settings"); check("Settings reachable from menu", pg.is_visible("#setKeyword")); pg.click(".panel.active [data-back]")
    ctx.close()

    # ===== 2. playing: play/pause, +-10 s, speed, menu items while a lesson runs
    ctx, pg = newpage()
    pg.click("#btnPlay")
    pg.wait_for_function("__tutor.lesson && __tutor.lesson.si===0 && __player.state().audio==='playing' && __player.state().d>10", timeout=40000)
    check("playing: button says PAUSE, banner PLAYING", "PAUSE" in pg.inner_text("#btnPlay") and word(pg) == "PLAYING", (pg.inner_text("#btnPlay"), word(pg)))
    n = vis(pg, "#lessonCard button:not(#btnStmt):not(#lAsk)"); check("while playing: 5 buttons (back, play, forward, speed, mute) + v4 Statements on accounting topics", n == 5 and vis(pg, "#lessonCard button:not(#lAsk)") <= 6, n)
    check("progress shows part x of y, topic x of N and time left", pg.inner_text("#lPos").startswith("Part 1 of") and "Topic 1 of 24" in pg.inner_text("#lTopicNo") and "left" in pg.inner_text("#lAllTime"), (pg.inner_text("#lPos"), pg.inner_text("#lTopicNo"), pg.inner_text("#lAllTime")))
    t0 = pg.evaluate("__player.state().t"); pg.click("#btnFwd10"); pg.wait_for_timeout(300); t1 = pg.evaluate("__player.state().t")
    check("forward 10 s jumps ahead about 10 s", 8.5 < t1 - t0 < 12.5, (t0, t1))
    pg.click("#btnBack10"); pg.wait_for_timeout(300); t2 = pg.evaluate("__player.state().t")
    check("back 10 s jumps back about 10 s", 8 < t1 - t2 < 11.5, (t1, t2))
    pg.click("#btnPlay"); pg.wait_for_timeout(300); st = pg.evaluate("__player.state()")
    check("PLAY/PAUSE pauses instantly", st["audio"] != "playing" and "RESUME" in pg.inner_text("#btnPlay") and word(pg) == "PAUSED", (st, word(pg)))
    tp = pg.evaluate("__player.state().t"); pg.wait_for_timeout(1000); check("paused stays put", abs(pg.evaluate("__player.state().t") - tp) < 0.15)
    pg.click("#btnPlay"); pg.wait_for_timeout(500); check("tap again resumes", pg.evaluate("__player.state().audio") == "playing" and "PAUSE" in pg.inner_text("#btnPlay"))
    r = []
    for _ in range(4): pg.click("#btnSpeed"); r.append(pg.inner_text("#btnSpeed"))
    check("speed chip cycles 1.25 > 1.5 > 0.8 > 1", [x.replace("\u00d7", "") for x in r] == ["1.25", "1.5", "0.8", "1"], r)
    pg.click("#btnSpeed"); pg.wait_for_timeout(300)
    check("speed actually changes audio playbackRate", abs(pg.evaluate("document.getElementById('player').playbackRate") - 1.25) < 0.01)
    # back at the start of part 2 goes to part 1
    pg.evaluate("__tutor.ui('nextpart')"); pg.wait_for_function("__tutor.lesson.si===1 && __player.state().audio==='playing'", timeout=10000)
    pg.click("#btnBack10"); pg.wait_for_timeout(500)
    check("back 10 s near the start of a part goes to the previous part", pg.evaluate("__tutor.lesson.si") == 0)
    # mic toggle
    pg.click("#tab-lessons .micbtn"); pg.wait_for_timeout(200)
    # v5.9.6: the pill is a microphone switch. The lesson keeps playing; only the mic goes quiet.
    check("small Mute toggle switches the mic off and keeps the lesson playing",
          pg.evaluate("__mic.off()") is True and pg.evaluate("__tutor.muted") is False and not pg.evaluate("__recActive()")
          and "Mic off" in pg.inner_text("#tab-lessons .micbtn"), pg.inner_text("#tab-lessons .micbtn"))
    pg.click("#tab-lessons .micbtn"); pg.wait_for_timeout(500); check("and listens again", pg.evaluate("__mic.off()") is False)
    # menu while a lesson runs
    pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])")
    check("menu (lesson) has prev/next topic, repeat, simpler, quiz me, stop", all(pg.locator("#menu [data-ui=%s]:visible" % u).count() >= 1 for u in ["prev", "next", "repeat", "simpler", "quiz", "stop"]))
    pg.click("#menu [data-ui=next]"); pg.wait_for_timeout(500)
    check("menu Next topic works and closes the menu", pg.evaluate("__tutor.lesson.ti") == 1 and not pg.is_visible("#menu"))
    # tapping a topic in the list jumps to it
    pg.click("#lessonList .trw >> nth=4"); pg.wait_for_timeout(700)
    check("tapping a topic jumps to it", pg.evaluate("__tutor.lesson.ti") == 4, pg.evaluate("__tutor.lesson.ti"))
    mclick(pg, "stop"); pg.wait_for_timeout(300); check("Stop session from menu", word(pg) == "READY" and not pg.evaluate("__tutor.running"))
    check("no JS errors", not pg.errs, pg.errs[:3]); ctx.close()

    # ===== 3. 'network' speech errors: calm, no thrash, buttons keep working, playback undisturbed
    ctx, pg = newpage(rec=NET_REC)
    pg.click("#btnPlay")
    pg.wait_for_function("__tutor.lesson && __player.state().audio==='playing'", timeout=40000)
    pg.wait_for_timeout(9000)
    starts = pg.evaluate("__recStarts"); check("mic stops retrying after a few network errors", starts <= 4, starts)
    pg.wait_for_timeout(5000); check("and stays stopped (no thrash)", pg.evaluate("__recStarts") == starts, (starts, pg.evaluate("__recStarts")))
    sub = pg.inner_text("#statusBanner")
    check("one calm line: 'Voice commands unavailable (no connection) - use the buttons'", "Voice commands unavailable (no connection)" in sub and "use the buttons" in sub, sub)
    check("no loud pop-up alert", not pg.is_visible("#alert"))
    check("banner still slim (a calm line, never half the screen)", pg.locator("#statusBanner").bounding_box()["height"] < 70, pg.locator("#statusBanner").bounding_box())
    adv = pg.evaluate("__tutor.lesson.ti*10+__tutor.lesson.si"); check("playback not disturbed (audio still playing / advancing)", pg.evaluate("__tutor.running") and pg.evaluate("__tutor.lesson") is not None and not pg.evaluate("!!__tutor.audioError"))
    pg.click("#btnPlay"); pg.wait_for_timeout(300); check("PLAY/PAUSE still works with voice off", pg.evaluate("__tutor.audioPaused") is True)
    pg.click("#btnPlay"); pg.wait_for_timeout(300); check("resume works", pg.evaluate("__tutor.audioPaused") is False)
    pg.click("#tab-lessons .micbtn"); pg.wait_for_timeout(200); check("Mute button switches the mic off with voice off", pg.evaluate("__mic.off()") is True and "Mic off" in pg.inner_text("#tab-lessons .micbtn"), pg.inner_text("#tab-lessons .micbtn"))
    pg.click("#tab-lessons .micbtn"); pg.wait_for_timeout(300)
    pg.evaluate("__tutor.ui('nextpart')"); pg.wait_for_timeout(400)
    n0 = pg.evaluate("__recStarts"); mid(pg, "btnMicRetry"); pg.wait_for_timeout(800)
    check("menu 'Restart microphone' tries again", pg.evaluate("__recStarts") > n0, (n0, pg.evaluate("__recStarts")))
    pg.wait_for_timeout(9000); check("and gives up quietly again", "Voice commands unavailable" in pg.inner_text("#statusBanner"))
    check("no JS errors", not pg.errs, pg.errs[:3]); ctx.close()

    # ===== 4. no mic support at all: buttons only, calm
    ctx, pg = newpage(rec="delete window.SpeechRecognition; delete window.webkitSpeechRecognition;")
    pg.click("#btnPlay"); pg.wait_for_function("__tutor.lesson && __player.state().audio==='playing'", timeout=40000)
    check("no speech support: calm 'use the buttons' line", "use the buttons" in pg.inner_text("#statusBanner").lower(), pg.inner_text("#statusBanner"))
    ctx.close()

    # ===== 5. quiz screen is simple too
    ctx, pg = newpage()
    pg.click("[data-tab=tutor]"); pg.click("#btnStart")
    pg.wait_for_function("__tutor.phase==='asking' && !__tutor.speaking", timeout=40000)
    check("quiz: question, answers, 'I don't know', Skip, Repeat, Mute only (no old control block)", pg.locator("#ctrlCard").count() == 0 and pg.is_visible("#quizBar") and pg.is_visible("#btnSkip") and pg.is_visible("#btnDontKnow"))
    pg.click("#btnMenu"); check("quiz menu has explain, simpler, skip, score, stop", all(pg.locator("#menu [data-ui=%s]:visible" % u).count() >= 1 for u in ["explain", "simpler", "skip", "dashboard", "stop"]) and not pg.is_visible("#menu [data-ui=prev]"))
    pg.click("#menuClose")
    c = pg.evaluate("__tutor.cur")
    if c["type"] == "mc":
        pg.click(".opt >> nth=0"); pg.wait_for_selector("#btnNextQ:visible", timeout=5000)
        check("after answering: a big NEXT QUESTION button", pg.is_visible("#btnNextQ"))
        pg.click("#btnNextQ"); pg.wait_for_timeout(500); check("NEXT QUESTION moves on", pg.evaluate("__tutor.log.length") == 1)
    pg.click("[data-tab=progress]"); check("My Stats tab shows stats", pg.is_visible("#overall"))
    ctx.close()
    b.close()
print("\nFAILED:", fails if fails else "none"); sys.exit(1 if fails else 0)
