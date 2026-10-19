"""v5.3: the flash card study screen fits the window (truck screen, phones, laptops): card front, revealed back and grade buttons visible with no scrolling.
Run: python3 tests/e2e_v53.py"""
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
LONG = "found-2"   # the longest built-in text card
INSIDE = """(sels)=>{var H=innerHeight,W=innerWidth,out={};sels.forEach(function(s){var e=document.querySelector(s);if(!e){out[s]='missing';return}var r=e.getBoundingClientRect();out[s]=(r.top>=-1&&r.bottom<=H+1&&r.left>=-1&&r.right<=W+1&&r.height>0)?'ok':[Math.round(r.top),Math.round(r.bottom),H];});out.scrollY=scrollY;return out}"""
SIZES = [(1180, 700, True, "truck"), (1280, 720, False, "1280x720"), (390, 844, True, "phone"), (1366, 768, False, "laptop")]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    for (w, h, touch, tag) in SIZES:
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=(tag == "phone")); ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(500)
        check(tag + ": v5.3", "v5.3" in pg.inner_text("#ver"))
        pg.click(".tab[data-tab=cards]"); pg.wait_for_timeout(250)
        pg.click(".fcsbtn[data-sec='all'][data-mode=all]"); pg.wait_for_timeout(300)
        # put the longest card first, plus a long improved back (as an AI-improved card could be)
        pg.evaluate("""(id)=>{var c=Flash.ALL.find(x=>x.id===id); c.b=c.b+'\\nExample: '+'A longer worked example that keeps going to make this answer long, like an improved card. '.repeat(3);
          window.__fc.queue=[id].concat(window.__fc.queue.filter(x=>x!==id)); window.__fc.flipped=false;}""", LONG)
        pg.click("#fcStar"); pg.click("#fcStar"); pg.wait_for_timeout(200)
        check(tag + ": the section name shows once (no Which-cards dropdown on the study screen)", not pg.is_visible("#fcFilter") and pg.locator("#fcSecName").count() == 1)
        check(tag + ": Sections and Shuffle on one row; name + stats beside them (phone: one short block below)", pg.evaluate("(function(){var a=document.getElementById('fcBackSec').getBoundingClientRect(),b=document.getElementById('fcShuffle').getBoundingClientRect(),c=document.getElementById('fcScore').getBoundingClientRect(),hd=document.querySelector('.fchead').getBoundingClientRect();return Math.abs(a.top-b.top)<4 && (innerWidth<=640 ? hd.height<125 : c.top<a.bottom)})()"))
        check(tag + ": READY status bar hidden on the study screen", not pg.is_visible("#statusBanner"))
        r = pg.evaluate(INSIDE, ["#fcFront", "#fcCard", "#fcGot", "#fcMissed", "#fcBackSec"])
        check(tag + ": front of the card and buttons visible without scrolling", all(v == "ok" for k, v in r.items() if k != "scrollY") and r["scrollY"] == 0, r)
        pg.click("#fcCard"); pg.wait_for_timeout(250)
        r = pg.evaluate(INSIDE, ["#fcFront", "#fcBack", "#fcCard", "#fcGot", "#fcMissed"])
        fits = pg.evaluate("(function(){var c=document.getElementById('fcCard');return [c.scrollHeight,c.clientHeight,getComputedStyle(document.querySelector('#fcBack')).zoom]})()")
        check(tag + ": long back answer: front, back and Got it / Missed all visible, nothing cut off", all(v == "ok" for k, v in r.items() if k != "scrollY") and r["scrollY"] == 0 and fits[0] <= fits[1] + 1, [r, fits])
        zoom = float(fits[2] or 1); check(tag + ": text still readable (not shrunk below 55%)", zoom >= 0.55, zoom)
        check(tag + ": card uses most of the screen height", pg.evaluate("document.getElementById('fcCard').getBoundingClientRect().height") > h * 0.45)
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v53-%s-study-back.png" % tag))
        pg.keyboard.press("g") if tag != "phone" else pg.click("#fcGot"); pg.wait_for_timeout(200)
        r = pg.evaluate(INSIDE, ["#fcFront", "#fcGot"]); check(tag + ": next card also fits", all(v == "ok" for k, v in r.items() if k != "scrollY"), r)
        # a Statement Analysis card (tables) flipped
        pg.click("#fcBackSec"); pg.wait_for_timeout(200); pg.click("details.fcgroup[data-g=other] > summary") if not pg.is_visible(".fcsbtn[data-sec='sa'][data-mode=all]") else None
        pg.click(".fcsbtn[data-sec='sa'][data-mode=all]"); pg.wait_for_timeout(250)
        pg.evaluate("window.__fc.queue=['sa-1-roe'].concat(window.__fc.queue.filter(x=>x!=='sa-1-roe'))"); pg.click("#fcStar"); pg.click("#fcStar"); pg.click("#fcCard"); pg.wait_for_timeout(250)
        r = pg.evaluate(INSIDE, ["#fcGot", "#fcMissed", "#fcCard"]); check(tag + ": statement card: grade buttons still on screen", all(v == "ok" for k, v in r.items() if k != "scrollY"), r)
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v53-%s-statement-back.png" % tag))
        # leaving the study screen restores the normal layout
        pg.click(".tab[data-tab=lessons]"); pg.wait_for_timeout(200)
        check(tag + ": READY bar is back outside the study screen", pg.is_visible("#statusBanner") and not pg.evaluate("document.body.classList.contains('fcstudy')"))
        check(tag + ": no JS errors", not errs, errs); ctx.close()
    b.close()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
