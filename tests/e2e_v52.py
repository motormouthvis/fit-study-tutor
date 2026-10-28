"""v5.2: flash card progress syncs between devices (two browser contexts = two devices) through the Worker (run locally with an in-memory KV).
Run: python3 tests/e2e_v52.py"""
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
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    # Device A = phone (fresh). Device B = laptop that already has older v5.1 progress (no update stamps) on a balance-sheet card.
    ca, A = device(b, 390, 844, True)
    cb, B = device(b, 1440, 900, False, "localStorage.setItem('tutor.v1.fc', JSON.stringify({cards:{'balance-6':{seen:3,got:1,miss:2,restudy:true,last:1000}}, life:{got:1,miss:2}, sessions:1}))")
    check("v5.2 label", "v5." in A.inner_text("#ver"))
    settings(A); check("A: sync starts off with a plain message", "Sync is off" in A.inner_text("#syncStatus") and A.is_visible("#btnSyncNew"))
    A.click("#btnSyncNew"); settle(A)
    code = A.inner_text("#syncCode").strip()
    check("A: Turn on sync makes a long private code and shows it", len(code) == 35 and code.count("-") == 5, code)
    check("A: status says sync is on", "Sync is on" in A.inner_text("#syncStatus"), A.inner_text("#syncStatus"))
    A.click("#btnSyncCopy"); A.wait_for_timeout(200); check("A: Copy code puts the code on the clipboard", A.evaluate("navigator.clipboard.readText()") == code)
    # A studies Chapter 1: got, got, missed
    study(A); grade(A, [True, True, False]); settle(A)
    cards(A); na = nums(A); check("A: chapter counts after grading (2 right, 1 wrong)", na["right"] == 2 and na["wrong"] == 1, na)
    # B enters the code (with spaces and capitals, as typed on a keyboard)
    settings(B); B.fill("#syncInput", "  " + code.upper().replace("-", " ") + " "); B.click("#btnSyncUse"); settle(B)
    check("B: code accepted, sync on", "Sync is on" in B.inner_text("#syncStatus") and B.inner_text("#syncCode").strip() == code, B.inner_text("#syncStatus"))
    cards(B); nb = nums(B)
    check("B: sees A's Chapter 1 results (2 right, 1 wrong, 1 restudy) and A's history", nb["right"] == 2 and nb["wrong"] == 1 and nb["restudy"] == 1 and "1 session" in nb["hist"], nb)
    nbal = nums(B, "topic:balance"); check("B: its own older balance-sheet result is kept", nbal["wrong"] == 1 and nbal["restudy"] == 1, nbal)
    # A pulls (as when the app comes back to the screen) and gets B's balance-sheet result
    A.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); settle(A); cards(A)
    check("A: gets B's older balance-sheet result after coming back to the app", nums(A, "topic:balance")["wrong"] == 1)
    # B studies more Chapter 1 cards OFFLINE, then comes back online
    cb.set_offline(True); B.evaluate("window.dispatchEvent(new Event('offline'))")
    study(B, CH, "all"); grade(B, [True, True]); B.wait_for_timeout(1800)
    settings(B); check("B offline: plain message, results kept on the device", "Offline" in B.inner_text("#syncStatus"), B.inner_text("#syncStatus"))
    cards(B); nbo = nums(B); check("B offline: counts still update locally", nbo["right"] >= 3, nbo)
    cb.set_offline(False); B.evaluate("window.dispatchEvent(new Event('online'))"); settle(B)
    pull(A); cards(A); na2 = nums(A)
    check("A: after B is back online, A sees B's offline results too", na2 == nums(B), [na2, nums(B)])
    check("A and B show the same history for Chapter 1", "2 sessions" in na2["hist"] and nums(B)["hist"] == na2["hist"], [na2["hist"], nums(B)["hist"]])
    # same card graded on both devices: the newest answer wins everywhere
    cid = A.evaluate("Object.keys(JSON.parse(localStorage.getItem('tutor.v1.fc')).cards).filter(i=>i.indexOf('wt16-ch01-')===0)[0]")
    A.evaluate("""(id)=>{window.__fc.view='study';window.__fc.filter='sec:book:wt16-ch01:all';window.__fc.queue=[id];window.__fc.sess={got:0,miss:0,total:1};window.__fc.flipped=true;}""", cid); cards(A)
    study(A); A.evaluate("(id)=>{window.__fc.queue=[id].concat(window.__fc.queue.filter(x=>x!==id));window.__fc.flipped=false}", cid); A.click("#fcStar"); A.click("#fcStar"); grade(A, [False]); settle(A)
    B.wait_for_timeout(50); study(B); B.evaluate("(id)=>{window.__fc.queue=[id].concat(window.__fc.queue.filter(x=>x!==id));window.__fc.flipped=false}", cid); B.click("#fcStar"); B.click("#fcStar"); grade(B, [True]); settle(B)
    pull(A); la = A.evaluate("(id)=>JSON.parse(localStorage.getItem('tutor.v1.fc')).cards[id].lastOk", cid)
    check("same card graded on both: the newest answer (B: Got it) wins on A too", la is True, la)
    # My cards: import one on A -> appears on B; B deletes it -> gone on A
    myfile = os.path.join(ROOT, "tests", "_sync_mycard.json"); json.dump({"app": "mba-study-tutor", "kind": "my-cards", "version": 1, "cards": [{"id": "my-sync-test", "topic": "mine", "f": "Sync test front", "b": "Sync test back", "ai": True, "ts": 1}], "over": {"balance-4": {"f": "SYNCED FRONT", "b": "SYNCED BACK"}}}, open(myfile, "w"))
    A.click("#btnMenu"); A.wait_for_selector("#menu:not([hidden])")
    with A.expect_file_chooser() as fcz: A.click("#mImport")
    fcz.value.set_files(myfile); A.wait_for_timeout(300); settle(A); os.remove(myfile)
    pull(B); check("My card and improved card made on A appear on B", B.evaluate("!!Flash.ALL.find(c=>c.id==='my-sync-test') && Flash.ALL.find(c=>c.id==='balance-4').f==='SYNCED FRONT'"))
    B.evaluate("""()=>{var m=JSON.parse(localStorage.getItem('tutor.v1.mycards'));}""")
    study(B, "mine", "all"); B.click("#fcFront .fcinfo"); B.wait_for_timeout(100); B.click("#fcmDelete"); B.click("#fcmDelete"); B.wait_for_timeout(200); settle(B)
    pull(A); check("a My card deleted on B is deleted on A", A.evaluate("!Flash.ALL.find(c=>c.id==='my-sync-test')"))
    # reload keeps the code and the synced results
    A.reload(); A.wait_for_timeout(800); settle(A); cards(A); check("A: after reload, code kept and counts the same", nums(A) == nums(B) and A.evaluate("JSON.parse(localStorage.getItem('tutor.v1.sync')).code") == code)
    # a wrong code is refused politely
    cc, C = device(b, 390, 844, True); settings(C); C.fill("#syncInput", "abc"); C.click("#btnSyncUse"); C.wait_for_timeout(200)
    check("C: a too-short code is refused with a plain message", "does not look like a sync code" in C.inner_text("#syncStatus"))
    # turn off on B
    settings(B); B.click("#btnSyncOff"); B.click("#btnSyncOff"); B.wait_for_timeout(200)
    check("B: Turn off sync keeps local results and shows the off state", "turned off" in B.inner_text("#syncStatus") and B.is_visible("#btnSyncNew") and B.evaluate("Object.keys(JSON.parse(localStorage.getItem('tutor.v1.fc')).cards).length") > 3)
    settings(A); A.screenshot(path=os.path.join(ROOT, "tests", "shot-v52-phone-sync-settings.png"))
    settings(B); B.fill("#syncInput", ""); B.screenshot(path=os.path.join(ROOT, "tests", "shot-v52-desktop-sync-off.png"))
    # writes are batched: count PUTs A sent while grading 4 cards quickly
    A.evaluate("window.__puts=0; var of=window.fetch; window.fetch=function(u,o){ if(o&&o.method==='PUT') window.__puts++; return of.apply(this,arguments); }")
    study(A); grade(A, [True, True, False, True]); settle(A)
    puts = A.evaluate("window.__puts"); check("grading 4 cards quickly sends one batched save, not one per card", 1 <= puts <= 2, puts)
    for nm, pg in (("A", A), ("B", B), ("C", C)): check(nm + ": no JS errors", not pg.errs, pg.errs)
    b.close()
finally:
    wk.terminate()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
