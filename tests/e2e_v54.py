"""v5.4: each deck remembers where you are: resume after reload, on a second device, finished screen, Start over.
Run: python3 tests/e2e_v54.py"""
import os, sys, json, subprocess, time, socket
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
s = socket.socket(); s.bind(("127.0.0.1", 0)); WPORT = s.getsockname()[1]; s.close()
wk = subprocess.Popen(["node", os.path.join(ROOT, "worker", "local-server.mjs")], env=dict(os.environ, PORT=str(WPORT), ALLOWED_ORIGINS=f"http://127.0.0.1:{PORT}", XAI_API_KEY=""), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "if(!localStorage.getItem('tutor.v1.settings'))localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
HOOK = f"window.__SYNC_URL='http://127.0.0.1:{WPORT}'; window.__SYNC_IDLE_MS=400; window.__SYNC_MAX_MS=1500;"
CH = "book:wt16-ch01"
def nums(pg, sid=CH):
    return pg.evaluate("""(sid)=>{var e=document.querySelector(".fcsec[data-secid='"+sid+"']");var o={};['right','wrong','restudy','unseen','total'].forEach(function(k){o[k]=+e.querySelector('.n.'+k+' b').textContent});o.hist=e.querySelector('.fchist summary').textContent;return o}""", sid)
def device(b, w, h, mob, seed=None):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob); ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET); ctx.add_init_script(HOOK)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=f"http://127.0.0.1:{PORT}")
    pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(500)
    if seed: pg.evaluate(seed); pg.reload(); pg.wait_for_timeout(500)
    return ctx, pg
def settings(pg):
    pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])"); pg.click("#menu [data-goto=settings]"); pg.wait_for_timeout(200)
def cards(pg): pg.click(".tab[data-tab=cards]"); pg.wait_for_timeout(250)
def study(pg, sid=CH, mode="all"): cards(pg); pg.click(".fcsbtn[data-sec='%s'][data-mode='%s']" % (sid, mode)); pg.wait_for_timeout(250)
def grade(pg, seq):
    for g in seq: pg.click("#fcCard"); pg.wait_for_timeout(80); pg.click("#fcGot" if g else "#fcMissed"); pg.wait_for_timeout(100)
def settle(pg, ms=2500):
    pg.wait_for_function("()=>window.__sync && !window.__sync.busy && !window.__sync.dirty", timeout=ms + 8000); pg.wait_for_timeout(200)
def pull(pg): pg.evaluate("window.__syncNow()"); settle(pg)
def score(pg): return pg.inner_text("#fcScore")
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ca, A = device(b, 1180, 700, True)
    settings(A); A.click("#btnSyncNew"); settle(A); code = A.inner_text("#syncCode").strip()
    study(A); N = A.evaluate("window.__fc.queue.length")
    check("starts at Card 1 of N", ("Card 1 of %d" % N) in score(A), score(A))
    first25 = A.evaluate("window.__fc.queue.slice(0,25)"); nxt = A.evaluate("window.__fc.queue[25]")
    grade(A, [True] * 25)
    check("after 25 shows Card 26", ("Card 26 of %d" % N) in score(A), score(A))
    A.reload(); A.wait_for_timeout(600); cards(A)
    check("Continue button says 26 of N", ("26 of %d" % N) in A.inner_text("#fcResume"), A.inner_text("#fcResume"))
    A.click("#fcResume"); A.wait_for_timeout(250)
    check("reload resumes at Card 26 on the next card", ("Card 26 of %d" % N) in score(A) and A.evaluate("window.__fc.queue[0]") == nxt, score(A))
    settle(A, 4000)
    cb, B = device(b, 390, 844, True)
    settings(B); B.fill("#syncInput", code); B.click("#btnSyncUse"); settle(B)
    study(B)
    check("second device resumes at Card 26", ("Card 26 of %d" % N) in score(B) and B.evaluate("window.__fc.queue[0]") == nxt, score(B))
    B.screenshot(path=os.path.join(ROOT, "tests", "shot-v54-phone-resume.png"))
    A.screenshot(path=os.path.join(ROOT, "tests", "shot-v54-truck-resume.png"))
    # finish: all remaining got except one missed then got
    left = N - 25
    grade(A, [False] + [True] * (left - 1)); grade(A, [True])
    check("finishing shows the finished screen", "You finished this deck" in A.inner_text("#fcStudy") and A.is_visible("#fcOver"), A.inner_text("#fcStudy")[:200])
    check("Study missed button shown (off when nothing is missed)", A.is_visible("#fcFinMissed") and A.is_disabled("#fcFinMissed"))
    A.screenshot(path=os.path.join(ROOT, "tests", "shot-v54-truck-finished.png"))
    A.click("#fcOver"); A.wait_for_timeout(250)
    check("Start over resets to Card 1", ("Card 1 of %d" % N) in score(A), score(A))
    grade(A, [True] * 3)
    A.click("#fcRestart"); A.wait_for_timeout(100)
    check("study-row Start over asks for a second tap", "sure" in A.get_attribute("#fcRestart", "class"))
    A.click("#fcRestart"); A.wait_for_timeout(250)
    check("second tap starts over at Card 1", ("Card 1 of %d" % N) in score(A), score(A))
    check("no page errors", not A.errs and not B.errs, A.errs + B.errs)
    b.close()
finally:
    wk.terminate(); srv.shutdown()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
