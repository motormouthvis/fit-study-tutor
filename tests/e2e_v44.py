"""v4.4: desktop Read mode keyboard (←/→ part, Shift+←/→ topic, ↑/↓ PgUp/PgDn scroll). Run: python3 tests/e2e_v44.py"""
import os, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC, goto
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
POS = "(()=>{const f=window.__stmtState.focus;return [f.key,f.si]})()"
TABOK = """(()=>{const s=window.__stmtState,f=s.focus,w=Statements.partLink(f.key,f.si,f.text,'script');const a=(document.querySelector('.stab.active')||{}).dataset;return w.stmt===s.shown&&a&&a.stmt===w.stmt})()"""
SCROLL = "document.getElementById('rText').scrollTop"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(500)
    check("v4.4 label", "v4.4" in pg.inner_text("#ver"))
    # Listen mode: arrows do nothing to the reader
    pg.mouse.move(700, 400); start = pg.evaluate(POS); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(100)
    check("Listen mode: → does nothing", pg.evaluate(POS) == start)
    pg.click("[data-view=read]"); pg.mouse.move(700, 450); pg.wait_for_timeout(900)
    check("keyboard hint line shown in Read mode", pg.is_visible("#rKeys") and "Shift" in pg.inner_text("#rKeys"))
    pg.click("#lessonList .trw[data-topic=cashflow]"); pg.wait_for_timeout(150)
    k0, s0 = pg.evaluate(POS)
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(120)
    check("→ next part", pg.evaluate(POS) == [k0, s0 + 1], pg.evaluate(POS))
    check("position label updates", ("Part %d" % (s0 + 2)) in pg.inner_text("#rPos"), pg.inner_text("#rPos"))
    bad = []
    for i in range(10):
        pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(60)
        if not pg.evaluate(TABOK): bad.append(pg.evaluate(POS))
    check("statements panel follows every → step (right tab)", not bad, bad)
    pg.click(".stab[data-stmt=bs]"); pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(100)
    check("← previous part (and panel switches back from a manual tab pick)", pg.evaluate(TABOK) and pg.evaluate(POS)[1] == s0 + 10, pg.evaluate(POS))
    pg.keyboard.press("Shift+ArrowRight"); pg.wait_for_timeout(150); k1 = pg.evaluate(POS)
    check("Shift+→ next topic", k1[0] != k0 and k1[1] == 0 and pg.evaluate(TABOK), k1)
    pg.keyboard.press("Shift+ArrowLeft"); pg.wait_for_timeout(150)
    check("Shift+← previous topic", pg.evaluate(POS)[0] == k0, pg.evaluate(POS))
    pg.click("#lessonList .trw[data-topic=altman]"); pg.wait_for_timeout(150); pg.mouse.move(700, 600)
    pg.evaluate("document.getElementById('rText').scrollTop=0"); pos = pg.evaluate(POS)
    pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(500); a = pg.evaluate(SCROLL)
    check("↓ scrolls the article a few lines", 60 <= a <= 160, a)
    check("↓ does not change the part", pg.evaluate(POS) == pos)
    pg.keyboard.press("ArrowUp"); pg.wait_for_timeout(500); check("↑ scrolls back", pg.evaluate(SCROLL) < a, pg.evaluate(SCROLL))
    pg.keyboard.press("PageDown"); pg.wait_for_timeout(600); pd = pg.evaluate(SCROLL); ch = pg.evaluate("document.getElementById('rText').clientHeight")
    check("PageDown scrolls about a screen", pd > ch * 0.6, (pd, ch))
    pg.keyboard.press("PageUp"); pg.wait_for_timeout(600); check("PageUp scrolls back", pg.evaluate(SCROLL) < pd * 0.5)
    pg.evaluate("document.getElementById('rText').scrollTop=0")
    pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(60); mid = pg.evaluate(SCROLL)
    check("smooth: still moving shortly after the key press", 0 <= mid < a and pg.evaluate("getComputedStyle(document.getElementById('rText')).scrollBehavior") in ("auto","smooth"), mid)
    # inputs: no trigger
    pos = pg.evaluate(POS)
    pg.evaluate("""(()=>{const i=document.createElement('input');i.id='tmpIn';document.getElementById('readCard').appendChild(i);i.focus();})()""")
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(100)
    check("typing in an input: arrows don't change parts", pg.evaluate(POS) == pos, pg.evaluate(POS))
    pg.evaluate("document.getElementById('tmpIn').remove()")
    # menu open: no trigger
    pg.mouse.move(700, 10); pg.wait_for_timeout(400); pg.click("#btnMenu"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(100)
    check("menu open: arrows ignored", pg.evaluate(POS) == pos); pg.click("#menuClose")
    # flash cards: arrows still mean got/missed, reader untouched
    pg.mouse.move(700, 10); pg.wait_for_timeout(400); goto(pg, "cards"); pg.wait_for_timeout(150); pg.keyboard.press("Space"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(100)
    st = pg.evaluate("JSON.parse(localStorage.getItem('tutor.v1.fc'))")
    check("flash cards: → still = Got it, reader not moved", st["life"]["got"] == 1 and pg.evaluate(POS) == pos)
    pg.keyboard.press("Space"); pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(100)
    check("flash cards: ← still = Missed, reader not moved", pg.evaluate("JSON.parse(localStorage.getItem('tutor.v1.fc'))")["life"]["miss"] == 1 and pg.evaluate(POS) == pos)
    pg.click("[data-tab=lessons]"); pg.mouse.move(700, 600); pg.wait_for_timeout(900)
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v44-read-keys.png"))
    check("no JS errors", not errs, errs); ctx.close()
    # phone: no hint, no handler
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True); ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
    pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(500)
    check("phone: no Read-mode keyboard hint", pg.is_hidden("#rKeys")); ctx.close(); b.close()
print("\nFAILED: " + (", ".join(fails) if fails else "none"))
sys.exit(1 if fails else 0)
