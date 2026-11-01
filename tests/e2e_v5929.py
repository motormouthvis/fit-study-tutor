# v5.9.29: the ? card helper, Important and Restudy must work in phone full screen and on desktop
import sys
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8093/index.html"
ok = True
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for name, vp, m in [("phone", {"width": 390, "height": 844}, True), ("desktop", {"width": 1366, "height": 768}, False)]:
        pg = b.new_page(viewport=vp, is_mobile=m, has_touch=m)
        pg.goto(URL); pg.wait_for_timeout(1500)
        pg.evaluate("document.querySelector('[data-tab=cards]').click()"); pg.wait_for_timeout(400)
        pg.locator("#fcSections button").first.click(); pg.wait_for_timeout(600)
        imp0 = pg.get_attribute("#fcImp", "aria-pressed"); pg.click("#fcImp"); imp1 = pg.get_attribute("#fcImp", "aria-pressed")
        st0 = pg.get_attribute("#fcStar", "aria-pressed"); pg.click("#fcStar"); st1 = pg.get_attribute("#fcStar", "aria-pressed")
        pg.locator("#fcFront .fcinfo").click(); pg.wait_for_timeout(400)
        # the panel's own box must be the topmost element at its centre (not covered by the card view)
        top = pg.evaluate("(function(){var r=document.querySelector('#cardPanel .sheetbox').getBoundingClientRect();var e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!(e&&e.closest('#cardPanel'));})()")
        res = imp0 != imp1 and st0 != st1 and top
        print(name, "important", imp0, "->", imp1, "restudy", st0, "->", st1, "helper on top", top, "OK" if res else "FAIL")
        ok = ok and res
    b.close()
sys.exit(0 if ok else 1)
