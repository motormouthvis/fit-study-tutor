"""v5.0: reworded flash cards render clearly (task label + labeled answer parts), desktop + phone; ids/scores/improved cards preserved; SA prompts.
Run: python3 tests/e2e_v50.py"""
import os, sys, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC, open_cards
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "if(!localStorage.getItem('tutor.v1.settings'))localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    for (w, h, mobile, tag) in [(1440, 900, False, "desktop"), (390, 844, True, "phone")]:
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=mobile, is_mobile=mobile); ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(500)
        # seed: a score + restudy mark on prepaid expense (balance-6), and a user-improved override on balance-4
        pg.evaluate("""localStorage.setItem('tutor.v1.fc', JSON.stringify({cards:{'balance-6':{seen:2,got:1,miss:1,restudy:true}}, life:{got:1,miss:1}, sessions:1}));
          localStorage.setItem('tutor.v1.mycards', JSON.stringify({cards:[], over:{'balance-4':{f:'MY OWN FRONT', b:'MY OWN BACK'}}}));""")
        pg.reload(); pg.wait_for_timeout(500)
        check(tag + ": v5.0 label", "v5.1" in pg.inner_text("#ver"))
        open_cards(pg); pg.wait_for_timeout(300)
        def show(id_):
            pg.evaluate("document.getElementById('fcFilter').value='topic:balance'; document.getElementById('fcFilter').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(200)
            pg.evaluate("window.__fc.queue=['%s'].concat(window.__fc.queue.filter(i=>i!=='%s')); window.__fc.flipped=false" % (id_, id_)); pg.evaluate("document.getElementById('fcStar').click();document.getElementById('fcStar').click()"); pg.wait_for_timeout(150)
        show("balance-6")
        front = pg.inner_text("#fcFront")
        check(tag + ": prepaid expense card tells you exactly what to produce", "Define: prepaid expense" in front and "journal entries" in front, front)
        check(tag + ": task label is highlighted", pg.locator("#fcFront .fctask").inner_text().startswith("Define"))
        pg.evaluate("document.getElementById('fcCard').click()"); pg.wait_for_timeout(200)
        back = pg.inner_text("#fcBack")
        check(tag + ": back is a labeled answer with a balanced example entry", "Definition" in back and "Example entry" in back and "Dr Prepaid insurance 12,000 / Cr Cash 12,000" in back, back)
        check(tag + ": answer labels are highlighted", pg.locator("#fcBack .fclab").count() >= 2)
        if mobile:
            ov = pg.evaluate("document.documentElement.scrollWidth"); check("phone: no sideways scroll on the longest card", ov <= 391, ov)
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v50-%s-prepaid-back.png" % tag))
        # ids stable: score + restudy preserved
        st = pg.evaluate("JSON.parse(localStorage.getItem('tutor.v1.fc'))")["cards"]["balance-6"]
        check(tag + ": score and Restudy mark on the same card id preserved", st["got"] == 1 and st["miss"] == 1 and st["restudy"] is True and pg.evaluate("Flash.ALL.find(c=>c.id==='balance-6').custom") is None, st)
        # user-improved card overrides the reworded one
        pg.evaluate("document.getElementById('fcFilter').value='topic:balance'; document.getElementById('fcFilter').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(200)
        pg.evaluate("window.__fc.queue=['balance-4'].concat(window.__fc.queue.filter(i=>i!=='balance-4')); window.__fc.flipped=false"); pg.evaluate("document.getElementById('fcCard').click();document.getElementById('fcCard').click()"); pg.wait_for_timeout(150)
        check(tag + ": a card the user improved still shows the user's version", "MY OWN FRONT" in pg.inner_text("#fcFront") and "AI IMPROVED" in pg.inner_text("#fcTopic"))
        # the longest front/back in the deck fit
        lf = pg.evaluate("Flash.CARDS.slice().sort((a,b)=>b.f.length-a.f.length)[0].id"); lb = pg.evaluate("Flash.CARDS.slice().sort((a,b)=>b.b.length-a.b.length)[0].id")
        pg.evaluate("document.getElementById('fcFilter').value='all'; document.getElementById('fcFilter').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(200)
        pg.evaluate("window.__fc.queue=['%s','%s'].concat(window.__fc.queue); window.__fc.flipped=true; document.getElementById('fcFront').scrollIntoView()" % (lb, lf)); pg.evaluate("document.getElementById('fcCard').click();document.getElementById('fcCard').click()"); pg.wait_for_timeout(200)
        r = pg.evaluate("(function(){var c=document.getElementById('fcCard').getBoundingClientRect();return [c.left,c.right,document.documentElement.scrollWidth]})()")
        check(tag + ": longest card stays inside the screen", r[0] >= -1 and r[1] <= w + 1 and r[2] <= w + 1, r)
        # statement analysis prompt
        pg.evaluate("document.getElementById('fcFilter').value='sa'; document.getElementById('fcFilter').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(250)
        pt = pg.inner_text("#fcFront")
        check(tag + ": Statement Analysis prompt says what to calculate", "Calculate" in pt and "then say what it tells you" in pt, pt[:200])
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v50-%s-statement.png" % tag))
        check(tag + ": no JS errors", not errs, errs); ctx.close()
    b.close()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
