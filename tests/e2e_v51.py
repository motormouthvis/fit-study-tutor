"""v5.1: Flash Cards top tab + sections view (counts, Study all/missed/restudy, history), book chapter cards, old progress carries over.
Run: python3 tests/e2e_v51.py"""
import os, sys, json
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
CH = "book:wt16-ch01"
TITLE = "Course 5601 - Book: Financial & Managerial Accounting, Chapter 1: Introduction to Accounting and Business"
def sec(pg, sid): return pg.locator(".fcsec[data-secid='%s']" % sid)
def nums(pg, sid):
    return pg.evaluate("""(sid)=>{var e=document.querySelector(".fcsec[data-secid='"+sid+"']");var o={};['right','wrong','restudy','unseen','total'].forEach(function(k){o[k]=+e.querySelector('.n.'+k+' b').textContent});return o}""", sid)
def btn(pg, sid, mode): return pg.locator(".fcsbtn[data-sec='%s'][data-mode='%s']" % (sid, mode))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    for (w, h, mobile, tag) in [(1440, 900, False, "desktop"), (390, 844, True, "phone")]:
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=mobile, is_mobile=mobile); ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(500)
        # OLD v5.0 saved progress (no lastOk, no hist) + an old import of the Chapter 1 file as My cards + an improved override
        pg.evaluate("""localStorage.setItem('tutor.v1.fc', JSON.stringify({cards:{'balance-6':{seen:3,got:1,miss:2,restudy:true},'balance-1':{seen:1,got:1,miss:0},'my-ch1-01-account-payable':{seen:2,got:2,miss:0}}, life:{got:4,miss:2}, sessions:3}));
          localStorage.setItem('tutor.v1.mycards', JSON.stringify({cards:[{id:'my-ch1-01-account-payable',topic:'mine',f:'In one sentence, say what "Account payable" means.',b:'x',ai:false},{id:'my-zz-1',topic:'balance',f:'Own card',b:'Own back',ai:true}], over:{'balance-4':{f:'MY OWN FRONT', b:'MY OWN BACK'}}}));""")
        pg.reload(); pg.wait_for_timeout(500)
        check(tag + ": v5.1 label", "v5." in pg.inner_text("#ver"))
        tabs = pg.evaluate("Array.from(document.querySelectorAll('.tabs .tab')).map(t=>t.textContent.trim())")
        check(tag + ": top tabs read Learn - Quiz - Flash Cards - My Stats", tabs == ["Learn", "Quiz", "Flash Cards", "My Stats"], tabs)
        pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])")
        check(tag + ": menu no longer duplicates Flash Cards", pg.locator("#menu [data-goto=cards]").count() == 0 and pg.locator("#mCards").count() == 0)
        pg.click("#menuClose"); pg.wait_for_timeout(100)
        # tab fits on screen
        r = pg.evaluate("(function(){var t=document.querySelector('.tab[data-tab=cards]').getBoundingClientRect();return [t.left,t.right,document.documentElement.scrollWidth]})()")
        check(tag + ": Flash Cards tab fits, no sideways scroll", r[0] >= 0 and r[1] <= w and r[2] <= w + 1, r)
        pg.click(".tab[data-tab=cards]"); pg.wait_for_timeout(300)
        check(tag + ": Flash Cards tab opens the sections first (no card showing)", pg.is_visible("#fcSections") and not pg.is_visible("#fcCard") and pg.locator(".fcsec").count() >= 30, pg.locator(".fcsec").count())
        check(tag + ": Flash Cards tab is highlighted", "active" in pg.get_attribute(".tab[data-tab=cards]", "class"))
        # the Chapter 1 section: name, counts, 3 buttons
        s = sec(pg, CH)
        check(tag + ": Chapter 1 section has the full title", s.locator(".fcsectitle").inner_text() == TITLE, s.locator(".fcsectitle").inner_text())
        n = nums(pg, CH); check(tag + ": Chapter 1 has 82 cards (1 already seen via the merged old import)", n == {"right": 1, "wrong": 0, "restudy": 0, "unseen": 81, "total": 82}, n)
        check(tag + ": Study all enabled; Study missed and Study restudy disabled with a 0 count", btn(pg, CH, "all").is_enabled() and btn(pg, CH, "wrong").is_disabled() and btn(pg, CH, "restudy").is_disabled() and "0 cards" in btn(pg, CH, "wrong").inner_text() and "82 cards" in btn(pg, CH, "all").inner_text())
        # old progress carried over: balance topic counts; and the old imported card migrated to the built-in one (no duplicates)
        nb = nums(pg, "topic:balance")
        check(tag + ": old scores carry over into the topic section (balance-6 wrong+restudy, balance-1 right; plus my own card)", nb["wrong"] == 1 and nb["right"] == 1 and nb["restudy"] == 1 and nb["total"] == 17, nb)
        check(tag + ": earlier imported Chapter 1 copy was merged (no duplicate, its score moved to the built-in card)", n["total"] == 82 and pg.evaluate("JSON.parse(localStorage.getItem('tutor.v1.mycards')).cards.length") == 1 and pg.evaluate("JSON.parse(localStorage.getItem('tutor.v1.fc')).cards['wt16-ch01-account-payable'].seen") == 2)
        check(tag + ": improved card override still applies", pg.evaluate("Flash.ALL.find(c=>c.id==='balance-4').f") == "MY OWN FRONT")
        sa = nums(pg, "sa"); check(tag + ": Statement Analysis section has 48 cards", sa["total"] == 48, sa)
        check(tag + ": My cards (AI) section counts the saved card", nums(pg, "mine")["total"] == 1)
        total_all = nums(pg, "all")["total"]; check(tag + ": All cards = every built-in card + 1 my card", total_all == 601, total_all)
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v51-%s-sections.png" % tag))
        # topic groups
        check(tag + ": topic groups exist for both courses", pg.locator("details.fcgroup[data-g=t5601]").count() == 1 and pg.locator("details.fcgroup[data-g=t5421]").count() == 1)
        # Study all on Chapter 1: do a session: got, missed, got
        btn(pg, CH, "all").click(); pg.wait_for_timeout(300)
        check(tag + ": Study all opens the card view for that chapter", pg.is_visible("#fcCard") and not pg.is_visible("#fcSections") and TITLE in pg.inner_text("#fcSecName"), pg.inner_text("#fcSecName"))
        check(tag + ": session has the 82 chapter cards", pg.evaluate("window.__fc.queue.length") == 82 and pg.evaluate("window.__fc.queue.every(i=>i.indexOf('wt16-ch01-')===0)"))
        for got in (True, False, True):
            pg.keyboard.press("Space"); pg.wait_for_timeout(60); pg.keyboard.press("g" if got else "m"); pg.wait_for_timeout(80)
        check(tag + ": Space / G / M still work", "2 got, 1 missed" in pg.inner_text("#fcScore"), pg.inner_text("#fcScore"))
        pg.click("#fcBackSec"); pg.wait_for_timeout(200)
        n = nums(pg, CH); check(tag + ": counts updated after the session (3 right, 1 wrong, 1 restudy, 78 unseen)", n == {"right": 3, "wrong": 1, "restudy": 1, "unseen": 78, "total": 82}, n)
        check(tag + ": Continue button offers the open session", pg.is_visible("#fcResume"))
        check(tag + ": Study missed and Study restudy now enabled with counts", btn(pg, CH, "wrong").is_enabled() and "1 card" in btn(pg, CH, "wrong").inner_text() and btn(pg, CH, "restudy").is_enabled())
        # history: collapsed by default, expands with one session
        hd = sec(pg, CH).locator("details.fchist")
        check(tag + ": history is collapsed by default", hd.evaluate("e=>!e.open") and "History (1 session)" in hd.locator("summary").inner_text(), hd.locator("summary").inner_text())
        hd.locator("summary").click(); pg.wait_for_timeout(100)
        row = hd.locator("table tr").nth(1).inner_text().replace("\t", " ")
        check(tag + ": history expands and lists date, cards, studied 3, right 2, wrong 1", hd.evaluate("e=>e.open") and " 3 " in (" " + row + " ") and "All" in row and row.split()[-2:] == ["2", "1"], row)
        # Study missed: only the wrong card
        btn(pg, CH, "wrong").click(); pg.wait_for_timeout(250)
        check(tag + ": Study missed shows only the missed card", pg.evaluate("window.__fc.queue.length") == 1 and "Study missed" in pg.inner_text("#fcSecName"))
        pg.keyboard.press("Space"); pg.keyboard.press("g"); pg.wait_for_timeout(150)
        check(tag + ": session done screen has a way back to the sections", pg.is_visible("#fcToSec"))
        pg.click("#fcToSec"); pg.wait_for_timeout(200)
        n = nums(pg, CH); check(tag + ": the corrected card moved from Wrong to Right (4 right, 0 wrong), Restudy stays 1", n["right"] == 4 and n["wrong"] == 0 and n["restudy"] == 1, n)
        check(tag + ": Study missed disabled again", btn(pg, CH, "wrong").is_disabled())
        # Study restudy
        btn(pg, CH, "restudy").click(); pg.wait_for_timeout(250)
        check(tag + ": Study restudy shows the starred card", pg.evaluate("window.__fc.queue.length") == 1 and "Study restudy" in pg.inner_text("#fcSecName"))
        # keys and ? and menu AI items still work in the study view
        check(tag + ": ? button and card ... menu present", pg.locator("#fcFront .askq").count() >= 1 and pg.locator("#fcFront .fcmorebtn").count() == 1)
        pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])"); pg.click("#mImprove"); pg.wait_for_timeout(400)
        check(tag + ": menu Improve keeps the open study view and opens the AI sheet", pg.is_visible("#fcAi") and pg.is_visible("#fcCard"))
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        # tapping the tab again returns to sections
        pg.click(".tab[data-tab=cards]"); pg.wait_for_timeout(200)
        check(tag + ": tapping the Flash Cards tab again goes back to the sections", pg.is_visible("#fcSections") and not pg.is_visible("#fcCard"))
        # keys do nothing on the sections list
        pg.keyboard.press("g"); pg.keyboard.press("Space"); pg.wait_for_timeout(100)
        lg = pg.evaluate("JSON.parse(localStorage.getItem('tutor.v1.fc')).life.got"); pg.keyboard.press("g"); pg.keyboard.press("Space"); pg.wait_for_timeout(100)
        check(tag + ": card keys are ignored on the sections list", pg.evaluate("JSON.parse(localStorage.getItem('tutor.v1.fc')).life.got") == lg and pg.is_visible("#fcSections"))
        # a topic section + the old dropdown still work
        check(tag + ": topic groups start collapsed", pg.evaluate("!document.querySelector('details.fcgroup[data-g=t5601]').open"))
        pg.locator("details.fcgroup[data-g=t5601] > summary").click(); pg.wait_for_timeout(100)
        btn(pg, "topic:balance", "wrong").click(); pg.wait_for_timeout(250)
        check(tag + ": topic section Study missed works", pg.evaluate("window.__fc.queue.join()") == "balance-6", pg.evaluate("window.__fc.queue.join()"))
        pg.evaluate("v=>{var s=document.getElementById('fcFilter');s.value=v;s.dispatchEvent(new Event('change'))}", "restudy"); pg.wait_for_timeout(200)
        check(tag + ": the Which-cards dropdown still works in the study view", pg.evaluate("window.__fc.filter") == "restudy")
        # My Stats shortcut goes to the sections
        pg.click(".tab[data-tab=progress]"); pg.wait_for_timeout(200); pg.click("#fcGoStats"); pg.wait_for_timeout(200)
        check(tag + ": My Stats > Open flash cards lands on the sections", pg.is_visible("#fcSections"))
        # persistence + export/import
        pg.reload(); pg.wait_for_timeout(500); pg.click(".tab[data-tab=cards]"); pg.wait_for_timeout(300)
        n = nums(pg, CH); check(tag + ": progress survives a reload", n["right"] == 4 and n["unseen"] == 78, n)
        check(tag + ": history survives a reload", pg.evaluate("JSON.parse(localStorage.getItem('tutor.v1.fc')).hist['book:wt16-ch01'].length") >= 2)
        if mobile:
            ov = pg.evaluate("document.documentElement.scrollWidth"); check("phone: no sideways scroll on the sections list", ov <= 391, ov)
            bb = pg.evaluate("(function(){var b=document.querySelector(\".fcsec[data-secid='%s'] .fcsecbtns\").getBoundingClientRect();return [b.left,b.right]})()" % CH); check("phone: the 3 buttons fit the screen", bb[0] >= 0 and bb[1] <= 391, bb)
        check(tag + ": Statement Analysis section has no Improve (kind statement)", pg.evaluate("Flash.ALL.find(c=>c.id.indexOf('sa-')===0).kind") == "statement")
        # screenshot, Chapter 1 at the top
        pg.evaluate("document.querySelector(\".fcsec[data-secid='%s']\").scrollIntoView({block:'start'})" % CH); pg.wait_for_timeout(150)
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v51-%s-chapter.png" % tag))
        check(tag + ": no JS errors", not errs, errs); ctx.close()
    b.close()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
