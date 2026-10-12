"""v4.1: desktop Read mode auto-hides the top rows (header, status, tabs, Read/Listen toggle). Run: python3 tests/e2e_v41.py"""
import os, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
CH = "(()=>{const r=document.getElementById('chrome').getBoundingClientRect();return {top:r.top,bottom:r.bottom,vis:(r.bottom>5?'visible':'hidden')}})()"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    def newpage(w, h, mobile=False):
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=mobile, is_mobile=mobile)
        ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(500); return ctx, pg
    ctx, pg = newpage(1366, 700)   # small laptop
    check("v4.1 label", "v4.1" in pg.inner_text("#ver"))
    check("Listen mode: top rows visible, not immersive", not pg.evaluate("document.body.classList.contains('immersive')") and pg.is_visible(".top") and pg.is_visible(".tabs"))
    pg.mouse.move(700, 400)
    art_listen_y = pg.locator("#lessonCard").bounding_box()["y"]
    pg.click("[data-view=read]"); pg.mouse.move(700, 450); pg.wait_for_timeout(1300)
    c = pg.evaluate(CH)
    check("Read mode: header/tabs/toggle slide away (off screen, hidden)", pg.evaluate("document.body.classList.contains('immersive')") and c["bottom"] <= 1 and c["vis"] == "hidden", c)
    rc = pg.locator("#rNav").bounding_box()
    check("reading area (nav + article) starts near the top of the window", rc["y"] < 30 and rc["y"] < art_listen_y - 100, (rc["y"], art_listen_y))
    ah = pg.locator("#rText").bounding_box()["height"]; check("article uses the freed height", ah > 700 * 0.55, ah)
    check("statements column uses the full height", pg.locator("#stmtCol").bounding_box()["y"] < 20 and pg.locator("#stmtCol").bounding_box()["height"] > 640, pg.locator("#stmtCol").bounding_box())
    y0 = rc["y"]
    pg.mouse.move(700, 15); pg.wait_for_timeout(450); c = pg.evaluate(CH)
    check("mouse at the top edge brings them back", c["top"] >= -1 and c["vis"] == "visible" and pg.is_visible("#viewToggle"), c)
    check("no layout jump: the article did not move when the rows appeared", abs(pg.locator("#rNav").bounding_box()["y"] - y0) < 1)
    pg.mouse.move(700, 60); pg.wait_for_timeout(300); check("still shown while the mouse is over them", pg.evaluate(CH)["vis"] == "visible")
    pg.mouse.move(700, 500); pg.wait_for_timeout(1300); c = pg.evaluate(CH)
    check("slide away again shortly after the mouse leaves", c["bottom"] <= 1 and c["vis"] == "hidden", c)
    pg.evaluate("document.getElementById('rPrev').focus()"); pg.keyboard.press("Shift+Tab"); pg.wait_for_timeout(450)
    check("Tab key lands in the top rows", pg.evaluate("document.getElementById('chrome').contains(document.activeElement)"), pg.evaluate("document.activeElement.id||document.activeElement.className"))
    check("keyboard focus entering the rows shows them", pg.evaluate(CH)["vis"] == "visible")
    pg.wait_for_timeout(1200); check("they stay while focused", pg.evaluate(CH)["vis"] == "visible")
    pg.evaluate("document.activeElement.blur()"); pg.wait_for_timeout(1200); check("hide again after focus leaves", pg.evaluate(CH)["vis"] == "hidden")
    trans = pg.evaluate("getComputedStyle(document.getElementById('chrome')).transitionProperty"); check("smooth transition", "transform" in trans, trans)
    pg.mouse.move(700, 10); pg.wait_for_timeout(450); pg.click("[data-view=listen]"); pg.wait_for_timeout(400)
    check("back to Listen: normal layout again", not pg.evaluate("document.body.classList.contains('immersive')") and pg.is_visible(".tabs") and pg.evaluate(CH)["top"] >= -1)
    pg.click("[data-view=read]"); pg.mouse.move(700, 10); pg.wait_for_timeout(400); pg.click("[data-tab=progress]"); pg.wait_for_timeout(300)
    check("other tabs are never immersive", not pg.evaluate("document.body.classList.contains('immersive')") and pg.is_visible(".tabs"))
    check("no JS errors", not pg.errs, pg.errs); ctx.close()

    # ---- sticky nav at the top of the article
    ctx, pg = newpage(1366, 700)
    pg.click("[data-view=read]"); pg.click("#lessonList .trw[data-topic=liquidity]"); pg.mouse.move(700, 450); pg.wait_for_timeout(1200)
    for _ in range(8): pg.click("#rNext")
    nav = pg.locator("#rNav").bounding_box()
    check("sticky nav at the very top while the header is hidden", nav["y"] < 30 and pg.is_visible("#rNav"), nav)
    check("line 1: arrows + topic name", pg.inner_text("#rName") == "Liquidity ratios" and pg.is_visible("#rPrevTopic") and pg.is_visible("#rNextTopic"))
    check("line 2: Part N of M: part title", pg.inner_text("#rNav .rpart").startswith("Part 9 of 13: The current ratio"), pg.inner_text("#rNav .rpart"))
    pg.mouse.wheel(0, 900); pg.wait_for_timeout(300)
    check("nav stays visible after scrolling the page", pg.locator("#rNav").bounding_box()["y"] < 12 and pg.locator("#rNav").bounding_box()["y"] > -2, pg.locator("#rNav").bounding_box())
    pg.click("#rNextTopic"); pg.wait_for_timeout(200); check("→ next topic", pg.inner_text("#rName") == "Leverage ratios" and pg.inner_text("#rPos") == "Part 1 of 4")
    pg.click("#rPrevTopic"); pg.wait_for_timeout(200); check("← previous topic", pg.inner_text("#rName") == "Liquidity ratios")
    pg.click("#rNext"); check("→ next part", pg.inner_text("#rPos") == "Part 2 of 13"); pg.click("#rPrev"); check("← previous part", pg.inner_text("#rPos") == "Part 1 of 13")
    pg.screenshot(path=os.path.join(ROOT, "tests/shot-v41-read-immersive.png"))

    # ---- correct statement tab + highlights for EVERY accounting part (Read-mode navigation)
    topics = pg.evaluate("Object.keys(Statements.TOPIC_STMT)"); bad = []; n = 0
    for tk in topics:
        pg.click(f"#lessonList .trw[data-topic={tk}]"); pg.wait_for_timeout(80)
        cnt = pg.evaluate(f"__tutor.readSegs('{tk}').length")
        for i in range(cnt):
            if i: pg.click("#rNext")
            r = pg.evaluate("""(()=>{const s=window.__stmtState, f=s.focus, want=Statements.partLink(f.key,f.si,f.text,'script');
              const hl=Array.from(document.querySelectorAll('#stmtBody tr.hl')).map(r=>r.dataset.k||r.dataset.r).sort();
              const exp=(want.stmt==='ratios'?want.ratios:want.keys.filter(k=>Statements.WHERE[k]===want.stmt)).slice().sort();
              const active=(document.querySelector('.stab.active')||{}).dataset; return {key:f.key, si:f.si, want:want.stmt, shown:s.shown, tab:active&&active.stmt, body:document.getElementById('stmtBody').dataset.code, ok: JSON.stringify(hl)===JSON.stringify(exp), hl:hl, exp:exp}})()""")
            n += 1
            if not (r["key"] == tk and r["si"] == i and r["want"] == r["shown"] == r["tab"] == r["body"] and r["ok"]): bad.append(r)
    check(f"every accounting part ({n}) opens the right tab with the right lines highlighted (Read nav)", not bad and n > 100, bad[:3])
    # same after the user picks another tab: the next part switches back to the right one
    pg.click("#lessonList .trw[data-topic=leverage]"); pg.click(".stab[data-stmt=cf]"); pg.click("#rNext")
    check("after a manual tab pick, the next part opens its own tab again", pg.evaluate("window.__stmtState.shown") == "bs")
    for _ in range(2): pg.click("#rNext")
    check("times interest earned -> Income tab", pg.evaluate("document.querySelector('.stab.active').dataset.stmt") == "is")
    # clicking a paragraph
    pg.click("#lessonList .trw[data-topic=cashflow]"); pg.click("#rText p >> nth=7"); pg.wait_for_timeout(100)
    check("clicking a paragraph: investing part -> Cash flow tab", pg.evaluate("window.__stmtState.shown") == "cf" and "capex" in pg.evaluate("window.__stmtState.keys"))
    # audio progress path: each part change while listening switches the tab
    pg.click("#rListen"); pg.wait_for_function("__tutor.running && __tutor.lesson && __player.state().audio==='playing'", timeout=40000)
    seq = []
    for tk, si, want in [("cashflow", 11, "bs"), ("liquidity", 6, "is"), ("altman", 17, "ratios"), ("leverage", 3, "is"), ("cashflow", 0, "cf"), ("hv", 6, "bs")]:
        pg.evaluate("(a)=>__tutor.ui('teachat', {key:a[0], si:a[1]})", [tk, si]); pg.wait_for_timeout(350)
        seq.append((tk, si, pg.evaluate("window.__stmtState.shown"), want))
    check("audio moving to a new part/topic switches the tab every time", all(s[2] == s[3] for s in seq), seq)
    pg.wait_for_function("__tutor.lesson.si===7 || true"); pg.evaluate("__tutor.ui('teachat', {key:'cashflow', si:6})"); pg.wait_for_timeout(300)
    pg.evaluate("__tutor.ui('nextpart')"); pg.wait_for_timeout(400)
    check("audio advancing by itself (next part) updates the tab and highlights", pg.evaluate("window.__stmtState.focus.si") == 7 and pg.evaluate("window.__stmtState.shown") == "cf" and "capex" in pg.evaluate("window.__stmtState.keys"))
    check("no JS errors (nav + statements)", not pg.errs, pg.errs[:3]); ctx.close()
    ctx, pg = newpage(390, 800, True)
    pg.evaluate("__tutor.setSetting('learnView','read')"); pg.evaluate("window.dispatchEvent(new Event('resize'))"); pg.wait_for_timeout(400)
    check("phone unchanged: never immersive, header visible", not pg.evaluate("document.body.classList.contains('immersive')") and pg.is_visible(".top") and pg.is_visible("#lessonCard"))
    ctx.close(); b.close()
print("\nFAILED:", fails if fails else "none"); sys.exit(1 if fails else 0)
