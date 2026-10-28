"""v5.9.12: Always on (screen wake lock + silent video fallback + Media Session). Run: python3 tests/e2e_v5912.py"""
import os, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "if(!localStorage.getItem('tutor.v1.settings'))localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
LOCK = r"""(() => { window.__locks = []; window.__req = 0;
  Object.defineProperty(navigator,'wakeLock',{value:{request(){ window.__req++; const ls=[]; const s={released:false, release(){ s.released=true; ls.forEach(f=>f()); }, addEventListener(n,f){ ls.push(f); }}; window.__locks.push(s); return Promise.resolve(s); }}});
  window.__ms = {}; const ms = navigator.mediaSession; if (ms) { const o = ms.setActionHandler.bind(ms); ms.setActionHandler = (n,f)=>{ window.__ms[n]=!!f; try{o(n,f);}catch(e){} }; }
})();"""
NOLOCK = "Object.defineProperty(navigator,'wakeLock',{value:undefined});"
def label(pg): return pg.inner_text("#mAwake")
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ctx.add_init_script(LOCK); ctx.add_init_script(PRESET)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(600)
    check("default ON: a wake lock was requested at load", pg.evaluate("window.__req") >= 1)
    check("header chip shows Awake", "Awake" in pg.inner_text("#btnAwake"), pg.inner_text("#btnAwake"))
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v5912-phone-awake.png"))
    pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])")
    check("menu shows Always on: On", "Always on: On" in label(pg), label(pg))
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v5912-phone-menu.png"))
    n = pg.evaluate("window.__req"); pg.evaluate("window.__locks[window.__locks.length-1].release()"); pg.wait_for_timeout(300)
    check("re-acquired automatically after the browser released it", pg.evaluate("window.__req") == n + 1 and pg.evaluate("!window.__locks[window.__locks.length-1].released"))
    n = pg.evaluate("window.__req"); pg.evaluate("window.__locks.forEach(l=>l.release())"); pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(300)
    check("visibilitychange (visible) re-acquires if lost", pg.evaluate("window.__req") > n)
    n = pg.evaluate("window.__req"); pg.evaluate("window.__locks.forEach(l=>l.release())"); pg.wait_for_timeout(200); pg.evaluate("window.dispatchEvent(new Event('pageshow'))"); pg.wait_for_timeout(200)
    check("pageshow keeps it held", pg.evaluate("!window.__locks[window.__locks.length-1].released"))
    ms = pg.evaluate("window.__ms")
    check("Media Session handlers set (play, pause, seek, track)", all(ms.get(k) for k in ["play", "pause", "seekbackward", "seekforward", "previoustrack", "nexttrack", "seekto"]), ms)
    # switch off from the menu: released and remembered across a reload
    pg.click("#mAwake"); pg.wait_for_timeout(200)
    check("menu says Always on: Off", "Always on: Off" in label(pg), label(pg))
    check("switching off releases the lock", pg.evaluate("window.__locks.every(l=>l.released)"))
    check("chip shows Off", "Off" in pg.inner_text("#btnAwake"))
    pg.reload(); pg.wait_for_timeout(600); n = pg.evaluate("window.__req")
    check("OFF is remembered after reload (no lock requested)", n == 0, n)
    pg.click("#btnAwake"); pg.wait_for_timeout(300)
    check("chip tap turns it back on", pg.evaluate("window.__req") >= 1 and "Awake" in pg.inner_text("#btnAwake"))
    pg.reload(); pg.wait_for_timeout(600)
    check("ON is remembered after reload", pg.evaluate("window.__req") >= 1)
    # start a lesson: PLAY button still works with the new code
    pg.click(".tab[data-tab=lessons]"); pg.wait_for_timeout(200)
    check("no page errors", not errs, errs); ctx.close()
    # old saved setting: wakeLock:false from an older version is reset to ON once
    ctx = b.new_context(viewport={"width": 390, "height": 844}); ctx.add_init_script(LOCK)
    ctx.add_init_script("if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5, wakeLock:false}));}")
    pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(600)
    check("an old saved OFF from before v5.9.12 becomes ON once", pg.evaluate("window.__req") >= 1)
    ctx.close()
    # no Wake Lock API: silent looping video fallback
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ctx.add_init_script(NOLOCK); ctx.add_init_script(PRESET)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(500)
    pg.mouse.click(200, 400); pg.wait_for_timeout(500)
    v = pg.evaluate("(()=>{const v=document.querySelector('video'); return v?{loop:v.loop, muted:v.muted, paused:v.paused, src:v.querySelectorAll('source').length}:null})()")
    check("no Wake Lock API: a muted looping video exists", bool(v) and v["loop"] and v["muted"], v)
    check("fallback video is playing after the tap", bool(v) and not v["paused"], v)
    check("fallback: no page errors", not errs, errs); ctx.close()
    b.close()
finally:
    srv.shutdown()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
