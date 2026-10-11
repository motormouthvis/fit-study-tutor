"""v2 end-to-end test with REAL <audio> playback of the real MP3 clips in headless Chrome (autoplay allowed).
Run: python3 tests/e2e_audio.py"""
import os, sys, json, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "if(!localStorage.getItem('tutor.v1.settings')) localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5, listenGapMs:400, topicGapMs:1500}));"
AUD = "(()=>{const a=document.getElementById('player'); return {paused:a.paused, t:a.currentTime, d:a.duration, ended:a.ended, src:a.getAttribute('src')}})()"
word = lambda pg: pg.inner_text("#statusWord")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    def newpage(preset=True, rate=None, rec=FAKE_REC, extra=""):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, service_workers="allow")
        ctx.add_init_script(rec)
        if preset: ctx.add_init_script(PRESET)
        if rate: ctx.add_init_script(f"window.__testRate={rate};")
        if extra: ctx.add_init_script(extra)
        pg = ctx.new_page(); pg.errs = []
        pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(300)
        return ctx, pg

    # ===== 1. first-run sound check blocks the session until Bill hears the sound
    ctx, pg = newpage(preset=False, rate=8)
    check("version label v2 visible", "v2" in pg.inner_text(".top"))
    check("debug line visible", "v2" in pg.inner_text("#dbgLine") and "audio:" in pg.inner_text("#dbgLine") and "mic:" in pg.inner_text("#dbgLine"))
    check("TEST SOUND button on the start screen", pg.is_visible("#btnTestSound2"))
    pg.click("#btnStartLesson"); pg.wait_for_timeout(300)
    check("START shows sound check first (no session yet)", pg.is_visible("#soundCard") and not pg.evaluate("__tutor.running"))
    pg.click("#scPlay"); pg.wait_for_selector("#scAsk:not([hidden])", timeout=8000)
    check("sound check asks 'Did you hear that?' after real playback", "hear that" in pg.inner_text("#soundCard").lower())
    pg.click("#scNo"); pg.wait_for_timeout(100)
    check("answering NO shows troubleshooting and still does not start", pg.is_visible("#scHelp") and not pg.evaluate("__tutor.running"))
    pg.click("#scPlay"); pg.wait_for_selector("#scAsk:not([hidden])", timeout=8000); pg.click("#scYes"); pg.wait_for_timeout(500)
    pg.wait_for_function("__tutor.lesson", timeout=20000)
    check("answering YES starts the session (spoken intro, then the lesson)", pg.evaluate("__tutor.running") and pg.evaluate("__tutor.mode") == "lesson")
    check("remembered for next time", json.loads(pg.evaluate("localStorage.getItem('tutor.v1.settings')"))["soundOk"] is True)
    ctx.close()

    # ===== 2. lesson advances ONLY after the clip's real ended event (normal speed, real time)
    ctx, pg = newpage()
    pg.click("#btnStartLesson")
    pg.wait_for_function("__player.state().audio==='playing'", timeout=8000)
    pg.wait_for_function("__tutor.lesson", timeout=20000)
    pg.wait_for_function("__player.state().audio==='playing'", timeout=8000)
    seen = []
    # wait for first lesson clip (after the title clip)
    for _ in range(60):
        st = pg.evaluate("__player.state()"); seen.append(st["t"])
        if pg.evaluate("__tutor.speaking") and pg.evaluate("__tutor.lesson.si") == 0 and st["d"] and st["d"] > 6: break
        pg.wait_for_timeout(250)
    d = pg.evaluate("__player.state().d"); check("lesson clip is a real MP3 with a real duration", d and d > 6, d)
    pg.wait_for_timeout(1500)
    st = pg.evaluate("__player.state()")
    check("while the clip plays: still part 1, audio actually moving", pg.evaluate("__tutor.lesson.si") == 0 and not st["paused"] and st["t"] > 0.5, st)
    check("banner says PLAYING and part 1 of N shown", word(pg) == "PLAYING" and pg.inner_text("#lPart").startswith("Part 1 of"), word(pg))
    pg.evaluate("(()=>{const a=document.getElementById('player'); a.currentTime=a.duration-0.4;})()")   # let it really finish
    pg.wait_for_function("__tutor.lesson.si===1", timeout=6000)
    check("advanced to part 2 only after the real ended event", pg.inner_text("#lPart").startswith("Part 2 of"))
    log = pg.evaluate("__player.log()"); check("debug log recorded 'ended ok'", any("ended ok" in l for l in log), log[-5:])
    pg.screenshot(path=os.path.join(ROOT, "tests/shot-v2-lesson.png"))

    # ===== 3. big MUTE / PAUSE button stops audio instantly; nothing advances; unmute resumes
    pg.wait_for_function("__tutor.speaking && __player.state().t>0.3", timeout=8000)
    pg.click("#btnMute"); st = pg.evaluate("__player.state()")
    check("MUTE button pauses/stops audio immediately", word(pg) == "MUTED" and (st["paused"] or not st["src"]), st)
    si = pg.evaluate("__tutor.lesson.si"); pg.wait_for_timeout(1500)
    check("muted: no advance, no audio", pg.evaluate("__tutor.lesson.si") == si and pg.evaluate("__player.state().paused") or not pg.evaluate("__player.state().src"))
    pg.wait_for_function("__recActive()", timeout=4000)
    pg.evaluate("__hear(['mood'])"); pg.wait_for_timeout(200)   # a stray word while muted must NOT unmute
    check("muted: stray words do not unmute", word(pg) == "MUTED")
    pg.wait_for_function("__recActive()", timeout=4000); pg.evaluate("__hear(['unmute'])"); pg.wait_for_timeout(300)
    check("voice 'unmute' unmutes", word(pg) != "MUTED")
    pg.wait_for_function("__tutor.speaking && __player.state().audio==='playing'", timeout=8000)
    check("after unmute the tutor says 'Listening again' then repeats the part", any("Listening again" in s for s in pg.evaluate("__spokenLog")))

    # ===== 4. PAUSE AUDIO / RESUME keeps position
    pg.wait_for_function("__player.state().t>1.2 && __player.state().d>5", timeout=15000)
    pg.click("#btnPauseAudio"); t1 = pg.evaluate("__player.state().t"); pg.wait_for_timeout(1200); st = pg.evaluate("__player.state()")
    check("PAUSE AUDIO freezes the clip in place", st["paused"] and abs(st["t"] - t1) < 0.2 and word(pg) == "PAUSED", (t1, st))
    check("button now says RESUME", "RESUME" in pg.inner_text("#btnPauseAudio"))
    pg.click("#btnPauseAudio"); pg.wait_for_timeout(1000); st = pg.evaluate("__player.state()")
    check("RESUME continues from the same spot", not st["paused"] and st["t"] > t1 + 0.5, (t1, st))
    # voice pause (= mute)
    pg.evaluate("__tutor.setSetting('bargeIn', true)"); pg.wait_for_timeout(300)
    pg.click("#lessonCard [data-ui=repeat]"); pg.wait_for_function("__player.state().audio==='playing' && __player.state().t>0.4", timeout=8000)
    check("with Listen-while-talking on, the mic is open during playback", pg.evaluate("__recActive()"))
    pg.evaluate("__hear(['paws'], false, false)"); pg.wait_for_timeout(100); st = pg.evaluate("__player.state()")
    check("saying 'paws' (mis-heard pause) mutes and stops the audio instantly, even as an interim result", word(pg) == "MUTED" and (st["paused"] or not st["src"]), st)
    pg.click("#btnUnmute"); pg.wait_for_timeout(300); pg.evaluate("__tutor.setSetting('bargeIn', false)")

    # ===== 5. tap controls
    pg.wait_for_selector("#lessonCard:not([hidden])"); 
    pg.click("#lessonCard [data-ui=restart]"); pg.wait_for_timeout(300); check("Repeat that topic -> part 1", pg.evaluate("__tutor.lesson.si") == 0)
    pg.click("#lessonCard [data-ui=nextpart]"); pg.wait_for_timeout(300); check("Next part button", pg.evaluate("__tutor.lesson.si") == 1)
    pg.click("#lessonCard [data-ui=back]"); pg.wait_for_timeout(300); check("Back button", pg.evaluate("__tutor.lesson.si") == 0)
    pg.click("#lessonCard [data-ui=next]"); pg.wait_for_timeout(400); check("Next topic button", pg.evaluate("__tutor.lesson.ti") == 1)
    pg.click("#lessonCard [data-ui=prev]"); pg.wait_for_timeout(400); check("Previous topic button", pg.evaluate("__tutor.lesson.ti") == 0)
    pg.evaluate("__tutor.setSetting('lessonAuto', false)"); pg.click("#lessonCard [data-ui=repeat]")
    pg.wait_for_function("__player.state().d>3", timeout=8000)
    pg.evaluate("(()=>{const a=document.getElementById('player'); a.currentTime=a.duration-0.3;})()"); pg.wait_for_timeout(2500)
    check("auto-continue OFF: part ended, tutor waits (stays on the part)", pg.evaluate("__tutor.lesson.si") == 0 and pg.evaluate("__tutor.phase") == "lessonWait", pg.evaluate("[__tutor.lesson.si,__tutor.phase]"))
    pg.evaluate("__tutor.setSetting('lessonAuto', true)")
    pg.click("[data-ui=stop]"); pg.wait_for_timeout(500)
    ctx.close()

    # ===== 6. audio that fails: stop, red message, wait; recovers via TEST SOUND
    ctx, pg = newpage(); aborted = {"on": True}
    ctx.route("**/audio/*.mp3", lambda r: r.abort() if aborted["on"] else r.continue_())
    pg.click("#btnStartLesson"); pg.wait_for_timeout(2500)
    check("failed audio: red 'couldn't play sound' + NO SOUND banner + TEST SOUND button", pg.is_visible("#audioErr") and word(pg) == "NO SOUND" and pg.is_visible("#btnTestSound"))
    check("failed audio: nothing advanced (lesson never started)", pg.evaluate("!__tutor.lesson || (__tutor.lesson.si===0 && __tutor.lesson.ti===0)"))
    pg.wait_for_timeout(3000); check("still waiting 3 s later", pg.evaluate("!__tutor.lesson || __tutor.lesson.si===0") and word(pg) == "NO SOUND")
    check("debug line explains why", "FAILED" in pg.inner_text("#dbgLine") or "error" in pg.inner_text("#dbgLine").lower(), pg.inner_text("#dbgLine"))
    pg.screenshot(path=os.path.join(ROOT, "tests/shot-v2-nosound.png"))
    aborted["on"] = False
    pg.click("#btnTestSound"); pg.wait_for_selector("#scAsk:not([hidden])", timeout=8000)
    check("TEST SOUND works once audio is reachable again", True)
    ctx.close()
    # failure in the MIDDLE of a lesson: the network drops after the lesson has started
    ctx, pg = newpage(rate=8); aborted = {"on": False}
    ctx.route("**/audio/*.mp3", lambda r: r.abort() if aborted["on"] else r.continue_())
    pg.click("#btnStartLesson"); pg.wait_for_function("__tutor.lesson && __tutor.lesson.si>=1", timeout=20000)
    aborted["on"] = True; pg.click("#lessonCard [data-ui=nextpart]"); pg.wait_for_timeout(300)
    si = pg.evaluate("__tutor.lesson.si"); pg.wait_for_timeout(4000)
    check("mid-lesson failure: stops with red message and does not advance", word(pg) == "NO SOUND" and pg.evaluate("__tutor.lesson.si") == si and pg.is_visible("#audioErr"), (word(pg), si))
    aborted["on"] = False; pg.click("#lessonCard [data-ui=repeat]"); pg.wait_for_timeout(1500)
    check("mid-lesson: Repeat after the network is back clears the error and plays", word(pg) != "NO SOUND" and not pg.is_visible("#audioErr"), word(pg))
    ctx.close()

    # ===== 7. offline: clips are cached on demand by the service worker, then play with no network
    ctx, pg = newpage(rate=8)
    pg.wait_for_function("navigator.serviceWorker.ready.then(()=>true)", timeout=8000); pg.reload(); pg.wait_for_timeout(800)
    pg.click("#btnStartLesson"); pg.wait_for_function("__tutor.lesson && __tutor.lesson.si>=1", timeout=15000)
    pg.click("[data-ui=stop]"); pg.wait_for_timeout(600)
    caches = pg.evaluate("caches.keys()"); check("service worker caches: app v2 + audio", "study-tutor-v2" in caches and "study-tutor-audio-v1" in caches, caches)
    ctx.set_offline(True); pg.reload(); pg.wait_for_timeout(800)
    check("offline: app loads from cache and shows v2", word(pg) == "READY" and "v2" in pg.inner_text(".top"))
    pg.evaluate("window.__spokenLog=[]"); pg.click("#btnStartLesson"); pg.wait_for_function("__tutor.lesson && __tutor.lesson.si>=1", timeout=15000)
    log = pg.evaluate("__player.log()"); check("offline: cached clips really played (ended ok, no failure)", any("ended ok" in l for l in log) and not any("FAILED" in l for l in log), log[-6:])
    ctx.set_offline(False); ctx.close()

    # ===== 8. microphone restart does not thrash: backoff + cap + visible state + RESTART MIC
    DEAD_REC = r"""(() => { window.__recStarts=0; class R{ constructor(){} start(){ window.__recStarts++; setTimeout(()=>this.onstart&&this.onstart(),5); setTimeout(()=>this.onend&&this.onend(),30); } abort(){} stop(){} }
      window.webkitSpeechRecognition=R; window.SpeechRecognition=R; Object.defineProperty(navigator,'wakeLock',{value:{request(){return Promise.resolve({release(){},addEventListener(){}})}}}); window.__maxQuick=6; })();"""
    ctx, pg = newpage(rec=DEAD_REC, rate=8); pg.click("#btnStart"); pg.wait_for_function("__tutor.phase==='asking' && !__tutor.speaking", timeout=30000)
    pg.wait_for_timeout(1200); s0 = pg.evaluate("__recStarts"); pg.wait_for_timeout(6000); s1 = pg.evaluate("__recStarts")
    check("mic restarts back off (not a beep loop)", s1 - s0 <= 6, (s0, s1))
    check("mic gives up after the cap and shows MIC PAUSED + RESTART MIC", word(pg) == "MIC PAUSED" and pg.is_visible("#btnMicRetry"), word(pg))
    check("debug line shows mic state", "mic:" in pg.inner_text("#dbgLine") and "starts" in pg.inner_text("#dbgLine"))
    n0 = pg.evaluate("__recStarts"); pg.click("#btnMicRetry"); pg.wait_for_timeout(500)
    check("RESTART MIC tries again", pg.evaluate("__recStarts") > n0)
    ctx.close()

    # ===== 9. random number problems use the backup voice; if it fails -> red error, no advance
    GOOD_TTS = r"""(()=>{ class U{constructor(t){this.text=t}} window.SpeechSynthesisUtterance=U; window.__tts=[];
      Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,getVoices(){return[]},addEventListener(){},cancel(){},pause(){},resume(){},speak(u){window.__tts.push(u.text);setTimeout(()=>{u.onstart&&u.onstart();},20);setTimeout(()=>{u.onend&&u.onend();},600);}}});})();"""
    for label, tts, expect_ok in (("working backup voice", GOOD_TTS, True), ("broken backup voice", "(()=>{class U{constructor(t){this.text=t}} window.SpeechSynthesisUtterance=U; Object.defineProperty(window,'speechSynthesis',{value:{getVoices(){return[]},addEventListener(){},cancel(){},speak(u){setTimeout(()=>{u.onend&&u.onend();},0)}}});})();", False)):
        ctx, pg = newpage(extra=tts, rate=8); pg.click("#btnStart"); pg.wait_for_function("__tutor.phase==='asking'", timeout=30000); pg.wait_for_timeout(500)
        pg.evaluate("(()=>{__tutor.hardStopSpeech(); __tutor.followups.push(__tutor.generators[0]); __tutor.ask();})()"); pg.wait_for_timeout(2000)
        isgen = pg.evaluate("!!__tutor.cur.gen")
        if expect_ok: check(f"number problem ({label}): spoken by backup voice, then waits for the answer", isgen and len(pg.evaluate("__tts")) >= 1 and word(pg) in ("LISTENING", "STARTING MIC"), word(pg))
        else: check(f"number problem ({label}): red error, waits (question still on screen)", isgen and word(pg) == "NO SOUND" and len(pg.inner_text("#qText")) > 10, word(pg))
        ctx.close()

    # ===== 10. quiz by voice with real audio (answer, mute, unmute)
    ctx, pg = newpage(rate=8); pg.click("#btnStart"); pg.wait_for_function("__tutor.phase==='asking' && !__tutor.speaking", timeout=15000)
    pg.wait_for_function("__recActive()", timeout=5000)
    c = pg.evaluate("__tutor.cur"); ans = c["options"][c["correctIndex"]]["letter"].lower() if c["type"] == "mc" else (str(c["ans"]) if c["type"] == "num" else (c["accept"][0] if c["type"] == "short" else "x"))
    if c["type"] != "explain":
        pg.evaluate("(a)=>__hear([a])", ans); pg.wait_for_function("__tutor.log.length===1", timeout=5000)
        check("quiz: voice answer logged correct (real audio feedback follows)", pg.evaluate("__tutor.log[0].correct"))
        pg.wait_for_function("__tutor.phase==='asking' && !__tutor.speaking", timeout=20000)
        check("quiz: after feedback audio ended, next question asked", pg.evaluate("__tutor.log.length") == 1 and pg.evaluate("__player.log()").__len__() > 3)
    check("no JS errors", not pg.errs, pg.errs[:3])
    ctx.close()

    # ===== 11. voice-while-talking: default ON; OFF gives a listening gap; phone that pauses audio when mic opens -> auto fallback
    ctx, pg = newpage(rate=8)
    check("default: Listen-while-talking is ON", pg.evaluate("__tutor.settings.bargeIn") is True)
    pg.click("#btnStartLesson"); pg.wait_for_function("__tutor.lesson && __tutor.speaking", timeout=30000)
    pg.wait_for_function("__recActive()", timeout=5000)
    pg.evaluate("__hear(['mute'], false, false)"); pg.wait_for_timeout(150)
    check("default settings: interim 'mute' while a clip plays stops it", word(pg) == "MUTED" and pg.evaluate("__player.state().paused || !__player.state().src"))
    ctx.close()
    ctx, pg = newpage(rate=8, extra="localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5, bargeIn:false, listenGapMs:2500, topicGapMs:1500}));")
    pg.click("#btnStartLesson"); pg.wait_for_function("__tutor.lesson && __tutor.speaking", timeout=30000)
    pg.wait_for_timeout(100); check("listen-while-talking OFF: mic is closed while audio plays", not pg.evaluate("__recActive()"))
    pg.wait_for_function("!__tutor.speaking && __tutor.lesson.si===0", timeout=15000)
    pg.wait_for_function("__recActive()", timeout=3000)
    check("OFF: mic opens in the quiet gap after the part ends", pg.evaluate("!__tutor.speaking"))
    pg.evaluate("__hear(['next'])"); pg.wait_for_timeout(300)
    check("OFF: a spoken command in the gap works (next)", pg.evaluate("__tutor.lesson.si") >= 1)
    ctx.close()
    PAUSER = r"""(() => { window.__recStarts=0; class R{ constructor(){} start(){ window.__recStarts++; setTimeout(()=>this.onstart&&this.onstart(),5); setTimeout(()=>{ const a=document.getElementById('player'); if(a && !a.paused) a.pause(); },150); } abort(){} stop(){} }
      window.webkitSpeechRecognition=R; window.SpeechRecognition=R; Object.defineProperty(navigator,'wakeLock',{value:{request(){return Promise.resolve({release(){},addEventListener(){}})}}}); })();"""
    ctx, pg = newpage(rec=PAUSER, rate=4); pg.click("#btnStartLesson"); pg.wait_for_function("__tutor.lesson", timeout=40000)
    pg.wait_for_timeout(2500)
    check("phone pauses audio when mic opens -> app turns Listen-while-talking OFF by itself", pg.evaluate("__tutor.settings.bargeIn") is False and "turned off" in pg.inner_text("#alert"), pg.evaluate("__tutor.settings.bargeIn"))
    check("...and the audio carried on (no error, session still running)", word(pg) != "NO SOUND" and pg.evaluate("__tutor.running"), word(pg))
    ctx.close(); b.close()
print("\nFAILED:", fails if fails else "none"); sys.exit(1 if fails else 0)
