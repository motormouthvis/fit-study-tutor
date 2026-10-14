"""v4 tests: device detection, desktop Read/Listen + split statements, phone bottom sheet. Desktop 1440 px and phone 390 px.
Run: python3 tests/e2e_v4.py"""
import os, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC, mclick, mid, goto
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "if(!localStorage.getItem('tutor.v1.settings')) localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5, lessonGapMs:300}));"
HL = "Array.from(document.querySelectorAll('#stmtBody tr.hl')).map(r=>r.dataset.k||r.dataset.r)"
st = lambda pg: pg.evaluate("window.__stmtState")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    def newpage(w, h, mobile=False, rate=None):
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=mobile, is_mobile=mobile, device_scale_factor=1)
        ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        if rate: ctx.add_init_script(f"window.__testRate={rate};")
        pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(500); return ctx, pg

    # ================= DESKTOP 1440 =================
    ctx, pg = newpage(1440, 900)
    check("desktop detected at 1440 px with a mouse", pg.evaluate("__v4.device()") == "desktop")
    check("v4 label", "v4" in pg.inner_text(".top"))
    check("Read / Listen toggle shown on desktop", pg.is_visible("#viewToggle") and pg.is_visible("[data-view=read]"))
    check("statements side by side with the lesson (accounting topic)", pg.is_visible("#stmtCol") and pg.is_visible("#splitBar") and pg.locator("#stmtCol").bounding_box()["x"] > 600)
    check("statements show 3 years with common-size % columns", pg.locator("#stmtBody thead th").count() == 7 and "100.0%" in pg.inner_text("#stmtBody"))
    # Read mode
    pg.click("[data-view=read]"); pg.wait_for_timeout(200)
    check("Read mode shows the lesson as an article", pg.is_visible("#readCard") and not pg.is_visible("#lessonCard") and pg.locator("#rText p").count() >= 2)
    fs = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#rText p')).fontSize)"); check("large readable font (>= 24 px)", fs >= 24, fs)
    pg.click("#lessonList .trw[data-topic=liquidity]"); pg.wait_for_timeout(200)
    check("tapping a topic in Read mode opens it to read (no audio started)", pg.inner_text("#rName") == "Liquidity ratios" and not pg.evaluate("__tutor.running"))
    for _ in range(8): pg.click("#rNext")
    pg.wait_for_timeout(200)
    check("next part moves at my pace (part 9 = the current ratio)", pg.inner_text("#rPos").startswith("Part 9 of") and pg.inner_text("#rText p.cur").startswith("The current ratio"))
    check("current ratio part highlights current assets + current liabilities on the balance sheet", st(pg)["shown"] == "bs" and sorted(pg.evaluate(HL)) == ["tca", "tcl"], pg.evaluate(HL))
    pg.click("#rPrev"); pg.wait_for_timeout(100); check("previous part works", pg.inner_text("#rPos").startswith("Part 8 of")); pg.click("#rNext")
    pg.click(".stab[data-stmt=ratios]"); pg.wait_for_timeout(100)
    check("Ratios tab highlights the current ratio = 2.00 for 2026", pg.evaluate(HL) == ["current"] and "2.00" in pg.inner_text("#stmtBody tr[data-r=current]"))
    pg.click("#rNext"); pg.click("#rNext"); pg.wait_for_timeout(100)
    check("quick ratio part: cash, receivables, current liabilities", sorted(pg.evaluate(HL)) == ["ar", "cash", "tcl"] and st(pg)["shown"] == "bs", pg.evaluate(HL))
    pg.click("#lessonList .trw[data-topic=leverage]"); pg.wait_for_timeout(100)
    for _ in range(3): pg.click("#rNext")
    check("times interest earned opens the income statement with EBIT + interest", st(pg)["shown"] == "is" and sorted(pg.evaluate(HL)) == ["ebit", "int"], (st(pg)["shown"], pg.evaluate(HL)))
    pg.click("#lessonList .trw[data-topic=cashflow]"); pg.wait_for_timeout(100)
    for _ in range(7): pg.click("#rNext")
    check("cash flow investing part highlights equipment purchase on the cash flow statement", st(pg)["shown"] == "cf" and "capex" in pg.evaluate(HL), (st(pg)["shown"], pg.evaluate(HL)))
    pg.click("#lessonList .trw[data-topic=oppcost]"); pg.wait_for_timeout(200)
    check("economics topic: no statements column (full-width reading)", not pg.is_visible("#stmtCol") and pg.is_visible("#readCard"))
    pg.click("#lessonList .trw[data-topic=liquidity]"); pg.wait_for_timeout(100)
    for _ in range(8): pg.click("#rNext")
    # resize the split
    bb = pg.locator("#splitBar").bounding_box(); x0 = pg.locator("#stmtCol").bounding_box()["x"]
    pg.mouse.move(bb["x"] + 5, bb["y"] + 100); pg.mouse.down(); pg.mouse.move(bb["x"] - 200, bb["y"] + 100, steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    x1 = pg.locator("#stmtCol").bounding_box()["x"]
    check("split is resizable by dragging", x1 < x0 - 120 and pg.evaluate("__tutor.settings.splitPct") < 50, (x0, x1, pg.evaluate("__tutor.settings.splitPct")))
    pg.screenshot(path=os.path.join(ROOT, "tests/shot-v4-desktop-read.png"))
    # Listen from here + read-along
    pg.click("#rListen")
    pg.wait_for_function("__tutor.running && __tutor.lesson && __player.state().audio==='playing'", timeout=40000)
    check("'Listen from here' starts the audio at that part", pg.evaluate("__tutor.lesson.si") == 8 and pg.evaluate("__tutor.topics[__tutor.lesson.ti].key") == "liquidity")
    pg.wait_for_function("document.querySelector('#rText p.playing')", timeout=15000)
    check("read-along: the playing part is highlighted in the article", pg.inner_text("#rText p.playing").startswith("The current ratio"))
    pg.click("#rNext"); pg.wait_for_function("__tutor.lesson.si===9", timeout=5000); pg.wait_for_timeout(400)
    check("Next part while playing moves the audio, and the article follows", pg.inner_text("#rText p.cur").startswith(pg.evaluate("__tutor.snapshot().lesson.text")[:20]) and pg.inner_text("#rPos").startswith("Part 10"))
    pg.click("#rListen"); pg.wait_for_timeout(300); check("in Read mode the button pauses the audio", pg.evaluate("__tutor.audioPaused"))
    pg.mouse.move(700, 10); pg.wait_for_timeout(450)   # v4.1: Read mode hides the top rows until the mouse nears the top
    pg.click("[data-view=listen]"); pg.wait_for_timeout(200)
    check("Listen mode = the audio player, statements still beside it", pg.is_visible("#lessonCard") and pg.is_visible("#btnPlay") and pg.is_visible("#stmtCol"))
    pg.evaluate("__tutor.ui('teachat', {key:'liquidity', si:8})"); pg.wait_for_timeout(400)
    check("in Listen mode the statements follow the playing part", sorted(pg.evaluate(HL)) == ["tca", "tcl"] and st(pg)["focus"]["live"])
    pg.screenshot(path=os.path.join(ROOT, "tests/shot-v4-desktop-listen.png"))
    mclick(pg, "stop"); pg.wait_for_timeout(300)
    # manual override
    goto(pg, "settings"); check("Settings shows the detected screen type", "desktop" in pg.inner_text("#devDetected"))
    pg.check("input[name=deviceMode][value=phone]"); pg.wait_for_timeout(200)
    check("override to phone: simple layout on a desktop", pg.evaluate("__v4.device()") == "phone" and pg.evaluate("document.body.classList.contains('dev-phone')"))
    pg.check("input[name=deviceMode][value=auto]"); pg.wait_for_timeout(200); check("back to automatic = desktop", pg.evaluate("__v4.device()") == "desktop")
    pg.click(".panel.active [data-back]")
    check("no JS errors (desktop)", not pg.errs, pg.errs[:3]); ctx.close()

    # ================= PHONE 390 (touch) =================
    ctx, pg = newpage(390, 800, mobile=True)
    check("phone detected at 390 px touch", pg.evaluate("__v4.device()") == "phone")
    check("phone: no Read/Listen toggle, no statements column", not pg.is_visible("#viewToggle") and not pg.is_visible("#stmtCol") and not pg.is_visible("#readCard"))
    n = pg.locator("#lessonCard button:visible").count(); check("phone main screen still 4 buttons when idle (v3 simplicity)", n == 4, n)
    check("phone: no Statements button until an accounting lesson plays", not pg.is_visible("#btnStmt"))
    pg.click("#lessonList .trw[data-topic=liquidity]")
    pg.wait_for_function("__tutor.lesson && __player.state().audio==='playing'", timeout=40000)
    check("phone: small 'Statements' button appears during an accounting lesson", pg.is_visible("#btnStmt"))
    n = pg.locator("#lessonCard button:not(#lAsk):visible").count(); check("phone while playing: 6 buttons at most (+ v4.6 ? ask)", n <= 6, n)
    pg.evaluate("__tutor.ui('teachat', {key:'liquidity', si:8})"); pg.wait_for_timeout(300)
    pg.click("#btnStmt"); pg.wait_for_selector("#stmtSheet:not([hidden])")
    check("phone: statements open as a bottom sheet with the right lines highlighted", pg.is_visible("#stmtPanel") and sorted(pg.evaluate(HL)) == ["tca", "tcl"])
    bx = pg.locator("#stmtSheet .sheetbox").bounding_box(); check("sheet fits the phone width", bx["width"] <= 391, bx)
    pg.screenshot(path=os.path.join(ROOT, "tests/shot-v4-phone-sheet.png"))
    pg.click("#stmtClose"); check("sheet closes", not pg.is_visible("#stmtSheet"))
    pg.click("#btnMenu"); pg.click("#mStmt"); pg.wait_for_timeout(200); check("menu 'Show statements' opens the sheet too", pg.is_visible("#stmtSheet")); pg.click("#stmtClose")
    mclick(pg, "stop"); pg.wait_for_timeout(300)
    goto(pg, "settings"); pg.check("input[name=deviceMode][value=desktop]"); pg.wait_for_timeout(200)
    check("phone override to desktop works", pg.evaluate("__v4.device()") == "desktop"); pg.check("input[name=deviceMode][value=auto]")
    check("no JS errors (phone)", not pg.errs, pg.errs[:3]); ctx.close()

    # ================= big touch tablet =================
    ctx, pg = newpage(1180, 820, mobile=True)
    check("1180 px touch-only tablet gets the simple layout", pg.evaluate("__v4.device()") == "phone", pg.evaluate("JSON.stringify([innerWidth, matchMedia('(pointer: coarse)').matches, matchMedia('(any-pointer: fine)').matches])"))
    ctx.close()
    b.close()
print("\nFAILED:", fails if fails else "none"); sys.exit(1 if fails else 0)
