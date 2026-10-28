"""v5.9.11: skip arrows on the question side of a flash card. Run: python3 tests/e2e_v5911.py"""
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
PRESET = "if(!localStorage.getItem('tutor.v1.settings'))localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
CH = "book:froeb-ch05"
def cur(pg): return pg.evaluate("()=>document.getElementById('fcFront').textContent")
def pos(pg):
    import re; m = re.search(r"Card (\d+) of (\d+)", pg.inner_text("#fcScore")); return (int(m.group(1)), int(m.group(2))) if m else None
def life(pg): return pg.evaluate("()=>JSON.stringify((JSON.parse(localStorage.getItem('tutor.v1.fc'))||{}).life)")
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    for (w, h, mob, tag) in [(1180, 700, True, "truck"), (390, 844, True, "phone"), (1366, 768, False, "laptop")]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob); ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(500)
        pg.click(".tab[data-tab=cards]"); pg.wait_for_timeout(250)
        if pg.locator(".fcsbtn[data-sec='%s'][data-mode='all']" % CH).count() == 0: CH = pg.evaluate("()=>document.querySelector('.fcsbtn[data-mode=all]:not([disabled])').dataset.sec")
        pg.evaluate("(s)=>document.querySelector(\".fcsbtn[data-sec='\"+s+\"'][data-mode='all']\").click()", CH); pg.wait_for_timeout(300)
        p0, f0, l0 = pos(pg), cur(pg), life(pg)
        check(tag + ": arrows show on the question side", pg.is_visible("#fcPrev") and pg.is_visible("#fcNext"))
        bx = pg.evaluate("()=>{var r=document.getElementById('fcNext').getBoundingClientRect();return [r.width,r.height]}")
        check(tag + ": arrows are big tap targets", bx[0] >= 60 and bx[1] < 120 and bx[1] >= 48, bx)
        ib = pg.evaluate("()=>document.getElementById('fcImp').getBoundingClientRect().height")
        if mob: check(tag + ": Important button still big", ib >= 44, ib)
        pg.click("#fcNext"); pg.wait_for_timeout(150)
        check(tag + ": Next shows another card, position +1", cur(pg) != f0 and pos(pg) == (p0[0] + 1, p0[1]), (pos(pg), p0))
        pg.click("#fcPrev"); pg.wait_for_timeout(150)
        check(tag + ": Prev comes back", cur(pg) == f0 and pos(pg) == p0)
        pg.click("#fcPrev"); pg.wait_for_timeout(150)
        check(tag + ": Prev on the first card wraps to the last", pos(pg) == (p0[1], p0[1]), pos(pg))
        pg.click("#fcNext"); pg.wait_for_timeout(150)
        if not mob:
            pg.focus("body"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(150)
            check(tag + ": → on the question side skips", pos(pg) == (p0[0] + 1, p0[1]))
            pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(150)
            check(tag + ": ← on the question side goes back", cur(pg) == f0)
        check(tag + ": skipping records nothing", life(pg) == l0, (life(pg), l0))
        pg.click("#fcCard"); pg.wait_for_timeout(150)
        check(tag + ": arrows hide once flipped", not pg.is_visible("#fcPrev") and not pg.is_visible("#fcNext"))
        if not mob:
            pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200)
            check(tag + ": → on the answer side is still Got it", '"got":1' in life(pg), life(pg))
        else:
            pg.click("#fcGot"); pg.wait_for_timeout(200); check(tag + ": Got it still grades", '"got":1' in life(pg), life(pg))
        check(tag + ": after a grade the position moves on", pos(pg) == (p0[0] + 1, p0[1]), pos(pg))
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v5911-%s-skip.png" % tag))
        check(tag + ": no page errors", not errs, errs); ctx.close()
    b.close()
finally:
    srv.shutdown()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
