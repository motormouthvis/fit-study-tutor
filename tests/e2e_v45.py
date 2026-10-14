"""v4.5: desktop Read mode - the end of every part and of the article can be scrolled fully into view. Run: python3 tests/e2e_v45.py"""
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
# visible bottom = lowest of: article box bottom, window bottom, top of any fixed element covering the bottom of the screen
VIS = """(()=>{const a=document.getElementById('rText'),r=a.getBoundingClientRect();let vb=Math.min(r.bottom,innerHeight);
  for(const el of document.querySelectorAll('body *')){const cs=getComputedStyle(el);if((cs.position==='fixed'||cs.position==='sticky')&&el.offsetParent!==null&&cs.visibility!=='hidden'){const b=el.getBoundingClientRect();if(b.height>0&&b.width>0&&b.bottom>=innerHeight-2&&b.top>r.top&&b.top<vb&&b.left<r.right&&b.right>r.left)vb=b.top;}}
  return {top:r.top,vb:vb,bot:r.bottom,vh:innerHeight}})()"""
LASTLINE = """(i=>{const a=document.getElementById('rText'),p=a.children[i];const rg=document.createRange();rg.selectNodeContents(p);const rs=rg.getClientRects();const l=rs[rs.length-1];return {top:l.top,bottom:l.bottom}})"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    for W, H in [(1366, 768), (1440, 900)]:
        ctx = b.new_context(viewport={"width": W, "height": H}); ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(500)
        pg.click("[data-view=read]"); pg.mouse.move(700, 500); pg.wait_for_timeout(900)
        topics = pg.evaluate("Bank.TOPICS.map(t=>t.key)")
        # tallest parts across all topics
        heights = []
        for tk in topics:
            pg.click(f"#lessonList .trw[data-topic={tk}]"); pg.mouse.move(700, 500); pg.wait_for_timeout(120)
            hs = pg.evaluate("[...document.getElementById('rText').children].map(p=>p.getBoundingClientRect().height)")
            heights += [(h, tk, i) for i, h in enumerate(hs)]
        heights.sort(reverse=True); tall = heights[:12]
        bad_box, bad_end, bad_part, bad_keys = [], [], [], []
        for tk in topics:
            pg.click(f"#lessonList .trw[data-topic={tk}]"); pg.mouse.move(700, 500); pg.wait_for_timeout(150)
            v = pg.evaluate(VIS)
            if v["bot"] > v["vh"] + 0.5: bad_box.append((tk, v))
            # keyboard: ↓ until it stops; the article's last line must be fully visible
            pg.evaluate("document.getElementById('rText').scrollTop=0")
            last = -1
            for _ in range(400):
                pg.keyboard.press("PageDown"); pg.wait_for_timeout(550)
                st = pg.evaluate("document.getElementById('rText').scrollTop")
                if st == last: break
                last = st
            pg.wait_for_timeout(450)
            n = pg.evaluate("document.getElementById('rText').children.length")
            ll = pg.evaluate(LASTLINE + f"({n-1})"); v = pg.evaluate(VIS)
            atbottom = pg.evaluate("(a=>Math.abs(a.scrollHeight-a.clientHeight-a.scrollTop)<=1)(document.getElementById('rText'))")
            if not (ll["bottom"] <= v["vb"] - 2 and atbottom): bad_end.append((tk, ll, v, atbottom))
        check(f"{W}x{H}: article box ends inside the window for all {len(topics)} topics", not bad_box, bad_box[:2])
        check(f"{W}x{H}: PgDn reaches the true bottom and the article's last line is fully visible (all topics)", not bad_end, bad_end[:2])
        for h, tk, i in tall:
            pg.click(f"#lessonList .trw[data-topic={tk}]"); pg.mouse.move(700, 500); pg.wait_for_timeout(120)
            # go to the part with the keyboard, then scroll down with ↓ until its last line shows (or bottom reached)
            for _ in range(i): pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(40)
            pg.wait_for_timeout(400)
            ok = False
            for _ in range(80):
                ll = pg.evaluate(LASTLINE + f"({i})"); v = pg.evaluate(VIS)
                if ll["bottom"] <= v["vb"] - 2 and ll["top"] >= v["top"]: ok = True; break
                before = pg.evaluate("document.getElementById('rText').scrollTop")
                pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(260)
                if pg.evaluate("document.getElementById('rText').scrollTop") == before: break
            if not ok: bad_part.append((tk, i, round(h), ll, v))
        check(f"{W}x{H}: the 12 tallest parts can each be scrolled until their last line is fully visible (↓)", not bad_part, bad_part[:2])
        # with the top rows shown (mouse at top) the bottom is still clear
        pg.mouse.move(700, 10); pg.wait_for_timeout(450); v = pg.evaluate(VIS)
        check(f"{W}x{H}: with the top rows shown, article bottom still inside the window", v["bot"] <= v["vh"] + 0.5, v)
        pg.mouse.move(700, 500); pg.wait_for_timeout(1300)
        pg.click(f"#lessonList .trw[data-topic={tall[0][1]}]"); pg.mouse.move(700, 500); pg.wait_for_timeout(150)
        pg.evaluate("(a=>a.scrollTop=a.scrollHeight)(document.getElementById('rText'))"); pg.wait_for_timeout(200)
        pg.screenshot(path=os.path.join(ROOT, "tests", f"shot-v45-bottom-{W}.png"))
        check(f"{W}x{H}: no JS errors", not errs, errs); ctx.close()
    b.close()
print("\nFAILED: " + (", ".join(fails) if fails else "none"))
sys.exit(1 if fails else 0)
