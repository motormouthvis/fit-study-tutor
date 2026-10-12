"""v4.2: Flash Cards (desktop + phone). Run: python3 tests/e2e_v42.py"""
import os, sys, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC, goto
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "if(!localStorage.getItem('tutor.v1.settings'))localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
FC = "JSON.parse(localStorage.getItem('tutor.v1.fc')||'null')"
TOP = "document.getElementById('fcStage').hidden ? null : window.__fc.queue[0]"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    def newpage(w, h, mobile=False):
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=mobile, is_mobile=mobile)
        ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(500); return ctx, pg

    # ---------------- desktop ----------------
    ctx, pg = newpage(1440, 900)
    check("v4.x label", "v4." in pg.inner_text("#ver"))
    pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])")
    check("Flash Cards is in the menu", pg.is_visible("#menu [data-goto=cards]") and "Flash Cards" in pg.inner_text("#mCards"))
    pg.click("#menu [data-goto=cards]"); pg.wait_for_timeout(200)
    check("Flash Cards screen opens", pg.is_visible("#fcCard") and pg.is_visible("#fcFilter"))
    nall = pg.evaluate("Flash.ALL.length"); check("deck loaded (300+ cards)", nall >= 290, nall)
    check("score shows session and lifetime", "This session" in pg.inner_text("#fcScore") and "Lifetime" in pg.inner_text("#fcScore"))
    check("answer buttons disabled until flipped", pg.is_disabled("#fcGot") and pg.is_disabled("#fcMissed") and pg.is_hidden("#fcBack"))
    check("keyboard hints shown on desktop", pg.is_visible(".fckeys"))
    pg.keyboard.press("Space"); pg.wait_for_timeout(100)
    check("Space flips the card", pg.is_visible("#fcBack") and pg.is_enabled("#fcGot"))
    pg.keyboard.press("Space"); pg.wait_for_timeout(100); check("Space flips it back", pg.is_hidden("#fcBack"))
    pg.click("#fcFront"); pg.wait_for_timeout(100); check("click flips", pg.is_visible("#fcBack"))
    first = pg.evaluate(TOP)
    pg.keyboard.press("m"); pg.wait_for_timeout(100)
    st = pg.evaluate(FC)
    check("M = missed: counted, marked Restudy, saved", st["life"]["miss"] == 1 and st["cards"][first]["restudy"] is True, st and st["life"])
    q = pg.evaluate("window.__fc.queue")
    check("missed card returns 3 cards later", q.index(first) == 3, q[:5])
    check("session score updated", "0 got, 1 missed" in pg.inner_text("#fcScore"))
    second = pg.evaluate(TOP); pg.keyboard.press("Space"); pg.keyboard.press("g"); pg.wait_for_timeout(100)
    check("G = got it", pg.evaluate(FC)["life"]["got"] == 1 and second not in pg.evaluate("window.__fc.queue"))
    pg.keyboard.press("Space"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(100)
    pg.keyboard.press("Space"); pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(100)
    st = pg.evaluate(FC); check("arrow keys work (→ got, ← missed)", st["life"] == {"got": 2, "miss": 2}, st["life"])
    pg.keyboard.press("g"); pg.wait_for_timeout(50)
    check("Got/Missed ignored until the card is flipped", pg.evaluate(FC)["life"] == {"got": 2, "miss": 2})
    cur = pg.evaluate(TOP); was = bool((pg.evaluate(FC)["cards"].get(cur) or {}).get("restudy"))
    if was: pg.click("#fcStar"); pg.wait_for_timeout(50)
    pg.keyboard.press("r"); pg.wait_for_timeout(50)
    check("R stars the card for restudy", pg.evaluate(FC)["cards"][cur]["restudy"] is True and "on" in pg.get_attribute("#fcStar", "class"))
    pg.click("#fcStar"); pg.wait_for_timeout(50)
    check("star button unmarks it (and does not flip)", pg.evaluate(FC)["cards"][cur]["restudy"] is False and pg.is_hidden("#fcBack"))
    pg.keyboard.press("r"); pg.wait_for_timeout(50)
    pg.keyboard.press("n"); pg.wait_for_timeout(50); check("N skips", pg.evaluate(TOP) != cur)
    # filters
    pg.select_option("#fcFilter", "restudy"); pg.wait_for_timeout(100)
    rq = pg.evaluate("window.__fc.queue"); st = pg.evaluate(FC)
    check("Restudy only filter", len(rq) == 2 and all(st["cards"][i]["restudy"] for i in rq), rq)
    pg.select_option("#fcFilter", "sa"); pg.wait_for_timeout(100)
    check("Statement Analysis filter", pg.evaluate("window.__fc.queue.every(id=>id.startsWith('sa-'))") and pg.evaluate("window.__fc.queue.length") >= 40)
    check("statement card shows a balance sheet table", pg.locator("#fcFront table.fctbl").count() >= 1 and "Total assets" in pg.inner_text("#fcFront"))
    # find an IS card
    for _ in range(60):
        if pg.locator("#fcFront table.fctbl").count() == 2: break
        pg.keyboard.press("n"); pg.wait_for_timeout(20)
    check("some statement cards include an income statement", pg.locator("#fcFront table.fctbl").count() == 2)
    pg.keyboard.press("Space"); pg.wait_for_timeout(100)
    back = pg.inner_text("#fcBack")
    check("back shows answer, working and plain-English meaning", "Working" in back and "What it means" in back and pg.is_visible(".fcans"), back[:120])
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v42-desktop-statement.png"))
    pg.select_option("#fcFilter", "course:econ"); pg.wait_for_timeout(100)
    check("course filter (BUS 5421)", pg.evaluate("window.__fc.queue.every(id=>Flash.ALL.find(c=>c.id===id).course==='econ')") and pg.evaluate("window.__fc.queue.length") >= 120)
    pg.select_option("#fcFilter", "topic:elasticity"); pg.wait_for_timeout(100)
    check("topic filter", pg.evaluate("window.__fc.queue.every(id=>id.startsWith('elasticity-'))"))
    pg.select_option("#fcFilter", "unseen"); pg.wait_for_timeout(100)
    seen = len([k for k, v in pg.evaluate(FC)["cards"].items() if v.get("seen")])
    check("Unseen filter excludes seen cards", pg.evaluate("window.__fc.queue.length") == nall - seen, (pg.evaluate("window.__fc.queue.length"), nall, seen))
    pg.click("#fcShuffle"); pg.wait_for_timeout(50)
    pg.select_option("#fcFilter", "topic:tvm"); pg.wait_for_timeout(100)
    check("shuffle off keeps deck order", pg.evaluate("window.__fc.queue.slice(0,3)") == ["tvm-1", "tvm-2", "tvm-3"], pg.evaluate("window.__fc.queue.slice(0,3)"))
    pg.click("#fcShuffle"); pg.wait_for_timeout(50); check("shuffle toggles back on", "Shuffle on" in pg.inner_text("#fcShuffle"))
    # finish a small session
    pg.select_option("#fcFilter", "topic:altman"); pg.wait_for_timeout(100)
    for _ in range(30):
        if pg.is_hidden("#fcStage"): break
        pg.keyboard.press("Space"); pg.keyboard.press("g"); pg.wait_for_timeout(20)
    check("session-done screen", pg.is_visible("#fcEmpty") and "Session done" in pg.inner_text("#fcEmpty"))
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v42-desktop-done.png"))
    pg.click("#fcAgain"); pg.wait_for_timeout(100); check("Go again restarts", pg.is_visible("#fcCard"))
    # persistence + My Stats
    pg.reload(); pg.wait_for_timeout(500)
    goto(pg, "cards"); pg.wait_for_timeout(100)
    check("filter and lifetime score persist after reload", pg.input_value("#fcFilter") == "topic:altman" and "Lifetime:" in pg.inner_text("#fcScore") and pg.evaluate(FC)["life"]["got"] >= 9)
    pg.click("[data-tab=progress]"); pg.wait_for_timeout(150)
    s = pg.inner_text("#fcStats")
    check("My Stats shows flash card stats", "cards seen" in s and "Restudy" in s and "BUS 5421" in s and "Statement Analysis" in s, s)
    goto(pg, "cards"); pg.select_option("#fcFilter", "all"); pg.wait_for_timeout(100)
    # find a plain term card for a screenshot
    for _ in range(40):
        if pg.locator("#fcFront .fcq.big").count(): break
        pg.keyboard.press("n"); pg.wait_for_timeout(20)
    pg.keyboard.press("Space"); pg.wait_for_timeout(100)
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v42-desktop-term.png"))
    pg.keyboard.press("Space"); pg.focus("#fcFilter"); pg.keyboard.press("Space"); pg.wait_for_timeout(100)
    check("Space inside the filter dropdown does not flip", pg.is_hidden("#fcBack"))
    pg.keyboard.press("Escape")
    check("no JS errors (desktop)", not pg.errs, pg.errs)
    ctx.close()

    # ---------------- phone ----------------
    ctx, pg = newpage(390, 844, True)
    check("phone: Learn screen unchanged (no flash UI)", pg.is_hidden("#tab-cards") and pg.is_visible("#tab-lessons"))
    goto(pg, "cards"); pg.wait_for_timeout(150)
    check("phone: Flash Cards opens from menu", pg.is_visible("#fcCard"))
    check("phone: keyboard hints hidden", pg.is_hidden(".fckeys") and pg.is_hidden(".kbd"))
    pg.tap("#fcCard"); pg.wait_for_timeout(100); check("phone: tap flips", pg.is_visible("#fcBack"))
    pg.tap("#fcMissed"); pg.wait_for_timeout(100); check("phone: Missed button works", pg.evaluate(FC)["life"]["miss"] == 1)
    pg.tap("#fcCard"); pg.tap("#fcGot"); pg.wait_for_timeout(100); check("phone: Got it button works", pg.evaluate(FC)["life"]["got"] == 1)
    pg.select_option("#fcFilter", "sa"); pg.wait_for_timeout(150)
    for _ in range(60):
        if pg.locator("#fcFront table.fctbl").count() == 2: break
        pg.evaluate("(()=>{const q=window.__fc.queue;q.push(q.shift());})()"); pg.tap("#fcCard"); pg.tap("#fcCard"); pg.wait_for_timeout(20)
    sw = pg.evaluate("document.documentElement.scrollWidth")
    check("phone: no horizontal scroll with statement tables (fits 390px)", sw <= 390, sw)
    wide = pg.evaluate("Math.max(...[...document.querySelectorAll('#fcFront table')].map(t=>t.getBoundingClientRect().right))")
    check("phone: tables inside the screen", wide <= 390, wide)
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v42-phone-statement.png"), full_page=True)
    pg.tap("#fcCard"); pg.wait_for_timeout(150)
    check("phone: back fits too", pg.evaluate("document.documentElement.scrollWidth") <= 390)
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v42-phone-back.png"), full_page=True)
    pg.click("[data-tab=progress]"); pg.wait_for_timeout(150); check("phone: My Stats has flash card stats", "cards seen" in pg.inner_text("#fcStats"))
    check("no JS errors (phone)", not pg.errs, pg.errs)
    ctx.close(); b.close()
print("\nFAILED: " + (", ".join(fails) if fails else "none"))
sys.exit(1 if fails else 0)
