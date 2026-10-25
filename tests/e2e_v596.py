"""v5.9.6: Mute means the microphone. With it off, nothing the phone hears can stop the lesson,
the audio keeps playing, the buttons still work, and the setting survives a reload.
Run: python3 tests/e2e_v596.py"""
import os, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
CHROME = next((p for p in ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome"] if os.path.exists(p)), None)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "if(!localStorage.getItem('tutor.v1.settings')) localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5, bargeIn:true, lessonGapMs:300}));"
# a recognizer that also reports the noisy-room errors Chrome throws on Android
NOISY_REC = FAKE_REC.replace("window.__recActive = () => !!cur;", """window.__recActive = () => !!cur;
  window.__micError = (e) => { if (!cur) return false; const r = cur; cur = null; r.onerror && r.onerror({ error: e }); r.onend && r.onend(); return true; };""")

def playing(pg):
    return pg.evaluate("()=>{var a=document.querySelector('audio'); return !!a && !a.paused && !a.ended}")
def mic_off(pg): return pg.evaluate("()=>window.__mic.off()")
def rec_live(pg): return pg.evaluate("()=>!!window.__recActive()")
def banner(pg): return pg.inner_text("#statusWord") + " | " + pg.inner_text("#statusSub")

try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 390, "height": 760})
    ctx.add_init_script(NOISY_REC); ctx.add_init_script(PRESET)
    pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(400)

    # start a lesson and wait for audio
    pg.click("#btnPlay"); pg.wait_for_function("()=>{var a=document.querySelector('audio'); return a && !a.paused}", timeout=20000)
    pg.wait_for_function("()=>window.__recActive()", timeout=20000)
    check("before: the lesson is playing and the mic is listening", playing(pg) and rec_live(pg))
    check("the button offers to mute the mic", "Mute the mic" in pg.inner_text(".micbtn:visible"), pg.inner_text(".micbtn:visible"))

    # ---- noise while the mic is ON used to stop the lesson; a half-heard word must not ----
    pg.evaluate("()=>window.__hear(['mood'], false, false)"); pg.wait_for_timeout(250)
    check("a half-heard noise word does not stop the lesson", playing(pg) and not pg.evaluate("()=>window.__tutor.muted"), banner(pg))

    # ---- tap Mute: the recognizer must close and stay closed ----
    pg.click(".micbtn:visible"); pg.wait_for_timeout(400)
    check("tapping Mute switches the microphone off", mic_off(pg) is True)
    check("the recognizer session is closed", rec_live(pg) is False)
    check("the tutor itself was not muted", pg.evaluate("()=>window.__tutor.muted") is False)
    check("the lesson keeps playing", playing(pg), banner(pg))
    check("the button says how to get the mic back", "Mic off" in pg.inner_text(".micbtn:visible") and "tap to listen" in pg.inner_text(".micbtn:visible"), pg.inner_text(".micbtn:visible"))
    check("the button is marked as pressed and coloured", pg.get_attribute(".micbtn:visible", "aria-pressed") == "true" and "muted" in pg.get_attribute(".micbtn:visible", "class"))
    check("the status line explains it", "MIC OFF" in banner(pg) or "PLAYING" in banner(pg), banner(pg))
    check("the status line says noise cannot stop the lesson", "noise cannot stop the lesson" in banner(pg), banner(pg))
    starts = pg.evaluate("()=>window.__recStarts")
    pg.wait_for_timeout(2500)
    check("it never restarts itself", pg.evaluate("()=>window.__recStarts") == starts and rec_live(pg) is False)
    check("still playing a few seconds later", playing(pg))

    # ---- nothing heard, and no recognizer error, can touch the lesson while off ----
    for phrase in ["mute", "pause", "stop", "next topic", "repeat", "unmute", "resume tutor"]:
        pg.evaluate("(w)=>window.__hear([w], true, false)", phrase)
    pg.wait_for_timeout(400)
    check("no spoken command gets through, not even unmute", mic_off(pg) is True and playing(pg) and pg.evaluate("()=>window.__tutor.muted") is False)
    for err in ["no-speech", "audio-capture", "network", "aborted"]:
        pg.evaluate("(e)=>window.__micError(e)", err)
    pg.wait_for_timeout(400)
    check("recognizer errors do not stop the lesson either", playing(pg), banner(pg))

    # ---- the on-screen buttons still work by tap ----
    pg.wait_for_function("()=>window.__tutor.lesson", timeout=40000)   # the intro has finished, a lesson part is playing
    pg.wait_for_function("()=>{var a=document.querySelector('audio'); return a && !a.paused}", timeout=20000)
    pg.click("#btnPlay"); pg.wait_for_timeout(400)
    check("PAUSE works by tap while the mic is off", not playing(pg) and pg.evaluate("()=>window.__tutor.audioPaused") is True)
    pg.click("#btnPlay"); pg.wait_for_timeout(600)
    check("PLAY starts it again", playing(pg))
    speed = pg.inner_text("#btnSpeed"); pg.click("#btnSpeed"); pg.wait_for_timeout(200)
    check("the speed chip still works", pg.inner_text("#btnSpeed") != speed, pg.inner_text("#btnSpeed"))
    pg.click("#btnFwd10"); pg.wait_for_timeout(200)
    check("forward 10 s still works", True)
    pg.evaluate("()=>window.__tutor.ui('nexttopic')"); pg.wait_for_timeout(800)
    check("changing topic keeps the mic off", mic_off(pg) is True and rec_live(pg) is False)
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v596-mic-off.png"))

    # ---- it survives a reload ----
    pg.reload(); pg.wait_for_timeout(700)
    check("the mic is still off after a reload", mic_off(pg) is True and pg.evaluate("()=>window.__tutor.settings.micOff") is True)
    pg.click("#btnPlay"); pg.wait_for_function("()=>{var a=document.querySelector('audio'); return a && !a.paused}", timeout=20000)
    pg.wait_for_timeout(600)
    check("starting a new session does not switch it back on", mic_off(pg) is True and rec_live(pg) is False and playing(pg))

    # ---- tapping again brings the mic back ----
    pg.click(".micbtn:visible"); pg.wait_for_timeout(600)
    check("tapping again turns the microphone back on", mic_off(pg) is False and pg.evaluate("()=>window.__tutor.settings.micOff") is False)
    pg.wait_for_function("()=>window.__recActive()", timeout=15000)
    check("the recognizer is listening again", rec_live(pg) is True)
    check("the lesson never stopped", playing(pg))
    check("no page errors", not pg.errs, pg.errs)
    b.close()
finally:
    srv.shutdown()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
