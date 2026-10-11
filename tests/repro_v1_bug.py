"""Reproduces Bill's bug with the OLD (v1) code, then shows the new code does not do it.
Run: python3 tests/repro_v1_bug.py   (needs playwright + google-chrome; v1 is read from git commit 4b76680)"""
import os, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC, BROKEN_TTS
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V1 = tempfile.mkdtemp(prefix="v1-")
subprocess.run(f"git -C {ROOT} archive 4b76680 | tar -x -C {V1}", shell=True, check=True)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if extra else "")); 
    if not cond: fails.append(name)

JS = "__tutor.lesson ? __tutor.lesson.ti*100 + __tutor.lesson.si*10 + (__tutor.phase==='lessonEnd'?5:0) : -1"
def sample(pg, ms=4000, step=250, wait_start=True):
    if wait_start:   # v2 plays a spoken intro first (several seconds of real audio); v1 starts at once
        try: pg.wait_for_function("__tutor.lesson", timeout=20000)
        except Exception: pass
    seq = []
    t0 = time.time()
    while (time.time() - t0) * 1000 < ms:
        seq.append(pg.evaluate(JS)); pg.wait_for_timeout(step)
    return seq

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    for mode in ("error", "instant-end"):
        # ---- OLD code
        srv, port = serve(V1)
        ctx = b.new_context(); ctx.add_init_script(FAKE_REC); ctx.add_init_script(BROKEN_TTS(mode))
        pg = ctx.new_page(); pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(300)
        pg.click("#btnStartLesson"); seq = sample(pg, 5000, wait_start=False)
        print("v1 [%s] lesson position (topic*100+part*10, +5 = reached end of topic) every 0.25 s:" % mode, seq[:20])
        raced = max(seq) > min(x for x in seq if x >= 0) and (max(seq) % 10 == 5 or max(seq) >= 100 or max(seq) >= 10)
        check(f"BUG REPRODUCED on v1 ({mode}): whole topic raced by in under 5 s with no sound", raced, seq)
        ctx.close(); srv.shutdown()
        # ---- NEW code, same broken speechSynthesis, real audio works
        srv, port = serve(ROOT)
        ctx = b.new_context(); ctx.add_init_script(FAKE_REC); ctx.add_init_script(BROKEN_TTS(mode))
        ctx.add_init_script("localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}))")
        pg = ctx.new_page(); pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(300)
        pg.click("#btnStartLesson"); seq = sample(pg, 5000)
        print("v2 [%s] lesson position over 5 s:" % mode, seq[:20])
        check(f"FIXED on v2 ({mode} stub, real mp3 audio): stays on part 1 while the clip plays", max(seq) - min(seq) == 0 and seq[-1] == 0, seq)
        check("v2 never used speechSynthesis for lesson audio", pg.evaluate("__ttsCalls") == 0)
        ctx.close()
        # ---- NEW code, audio files unreachable too: must stop and show red message, not advance
        ctx = b.new_context(); ctx.add_init_script(FAKE_REC); ctx.add_init_script(BROKEN_TTS(mode))
        ctx.add_init_script("localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}))")
        ctx.route("**/audio/*.mp3", lambda r: r.abort())
        pg = ctx.new_page(); pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(300)
        pg.click("#btnStartLesson"); seq = sample(pg, 4000, wait_start=False)
        check(f"v2 ({mode}) with ALL audio failing: no advance, waits", set(seq) <= {0, -1} and max(seq) <= 0, seq)
        check("v2 shows the red 'couldn't play sound' message", pg.is_visible("#audioErr") and "couldn't play sound" in pg.inner_text("#audioErr").lower() and pg.inner_text("#statusWord") == "NO SOUND", pg.inner_text("#statusWord"))
        check("TEST SOUND button visible", pg.is_visible("#btnTestSound"))
        print("   debug line:", pg.inner_text("#dbgLine")[:260])
        ctx.close(); srv.shutdown()
    b.close()
print("\nFAILED:", fails) if fails else print("\nALL PASS")
sys.exit(1 if fails else 0)
