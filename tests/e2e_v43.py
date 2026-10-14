"""v4.3: 'Install on my Phone or Computer' menu item + installability. Run: python3 tests/e2e_v43.py"""
import os, sys, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"   # 127.0.0.1 counts as a secure origin
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
LABEL = "Install on my Phone or Computer"
UA = {"android": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
      "ios": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "edge": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
      "chrome": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}
STANDALONE = "(()=>{const o=window.matchMedia.bind(window);window.matchMedia=q=>q.includes('display-mode: standalone')?{matches:true,media:q,addEventListener(){},addListener(){}}:o(q);})();"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    def newpage(w=1440, h=900, mobile=False, ua=None, extra=None):
        kw = dict(viewport={"width": w, "height": h}, has_touch=mobile, is_mobile=mobile)
        if ua: kw["user_agent"] = ua
        ctx = b.new_context(**kw); ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        if extra: ctx.add_init_script(extra)
        pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(600); return ctx, pg
    def open_menu(pg): pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])")

    ctx, pg = newpage()
    check("v4.x label", "v4." in pg.inner_text("#ver"))
    open_menu(pg)
    check("menu item label is exact", pg.inner_text("#btnInstall").strip() == LABEL, pg.inner_text("#btnInstall"))
    check("install item is visible without an install event", pg.is_visible("#btnInstall"))
    first = pg.evaluate("[...document.querySelectorAll('#menu .sheetbox button')].filter(b=>b.offsetParent&&b.id!=='menuClose')[0].id")
    check("install item is the first item in the menu", first == "btnInstall", first)
    check("only one element with id btnInstall", pg.evaluate("document.querySelectorAll('#btnInstall').length") == 1)
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v43-menu.png"))
    pg.click("#btnInstall"); pg.wait_for_timeout(150)
    check("no prompt available -> steps popup", pg.is_visible("#installSheet") and pg.is_hidden("#menu"))
    t = pg.inner_text("#instBody"); check("desktop Chrome steps: address-bar install icon / ⋮ > Install", "install icon" in t and "address bar" in t and "Install" in t and pg.get_attribute("#instPlat", "data-plat") == "chrome", t)
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v43-steps-desktop.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(100); check("Escape closes popup", pg.is_hidden("#installSheet"))
    # manifest + service worker installability
    m = pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
    sizes = {i["sizes"] for i in m["icons"]}
    check("manifest: name, short_name, start_url, scope, id, display standalone", all(m.get(k) for k in ["name", "short_name", "start_url", "scope", "id"]) and m["display"] == "standalone", m)
    check("manifest: 192 and 512 icons + maskable", "192x192" in sizes and "512x512" in sizes and any(i.get("purpose") == "maskable" for i in m["icons"]))
    ok_icons = all(pg.evaluate(f"fetch('{i['src']}').then(r=>r.ok)") for i in m["icons"]); check("manifest icons load", ok_icons)
    pg.wait_for_function("navigator.serviceWorker.controller !== null || true"); pg.reload(); pg.wait_for_timeout(800)
    check("service worker active and controlling the page", pg.evaluate("navigator.serviceWorker.controller ? navigator.serviceWorker.controller.state : null") == "activated")
    check("SW has a fetch handler that serves offline (start_url cached)", pg.evaluate("caches.keys().then(ks=>caches.open(ks.find(k=>/^study-tutor-v4/.test(k)))).then(c=>c.match('index.html')).then(r=>!!r)"))
    cdp = ctx.new_cdp_session(pg)
    errs = [e for e in cdp.send("Page.getInstallabilityErrors")["installabilityErrors"] if e["errorId"] != "in-incognito"]
    check("Chrome reports no installability errors (throwaway test profile aside)", errs == [], errs)
    try:
        man = cdp.send("Page.getAppManifest"); check("Chrome parsed the manifest without errors", not man.get("errors"), man.get("errors"))
    except Exception as e: check("Chrome parsed the manifest", False, e)
    # simulated beforeinstallprompt -> native prompt
    pg.evaluate("""(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});window.__prompted=0;e.prompt=()=>{window.__prompted++;return Promise.resolve();};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e);})()""")
    open_menu(pg); pg.click("#btnInstall"); pg.wait_for_timeout(150)
    check("beforeinstallprompt available -> native prompt triggered (no popup)", pg.evaluate("window.__prompted") == 1 and pg.is_hidden("#installSheet"))
    pg.click("[data-tab=lessons]"); open_menu(pg); pg.click("#btnInstall"); pg.wait_for_timeout(150)
    check("prompt is single-use; next click falls back to steps", pg.evaluate("window.__prompted") == 1 and pg.is_visible("#installSheet"))
    pg.click("#instClose")
    check("no JS errors (desktop)", not pg.errs, pg.errs); ctx.close()

    ctx, pg = newpage(extra=STANDALONE); open_menu(pg); pg.click("#btnInstall"); pg.wait_for_timeout(150)
    check("already installed (standalone) -> 'Already installed ✓'", "Already installed ✓" in pg.inner_text("#installSheet"), pg.inner_text("#installSheet"))
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v43-installed.png")); ctx.close()

    for plat, w, mob, want in [("android", 390, True, ["⋮", "Install app", "Add to Home screen"]), ("ios", 390, True, ["Share", "Add to Home Screen"]), ("edge", 1366, False, ["address bar", "Install"])]:
        ctx, pg = newpage(w, 844, mob, UA[plat]); open_menu(pg)
        check(plat + ": menu label exact", pg.inner_text("#btnInstall").strip() == LABEL)
        pg.click("#btnInstall"); pg.wait_for_timeout(150); t = pg.inner_text("#instBody")
        check(plat + ": platform-specific steps", pg.get_attribute("#instPlat", "data-plat") == plat and all(x in t for x in want), t)
        if plat == "ios": pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v43-steps-iphone.png"))
        if plat == "android": pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v43-steps-android.png"))
        check(plat + ": popup fits the screen", pg.evaluate("document.documentElement.scrollWidth") <= w)
        check(plat + ": no JS errors", not pg.errs, pg.errs); ctx.close()
    ctx, pg = newpage(390, 844, True, UA["android"]); open_menu(pg)
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v43-menu-phone.png")); ctx.close()
    b.close()
    # real (non-incognito) profile: Chrome's own installability verdict must be clean
    import tempfile
    pc = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    pg = pc.new_page(); pg.goto(URL); pg.wait_for_timeout(800); pg.reload(); pg.wait_for_timeout(800)
    errs = pc.new_cdp_session(pg).send("Page.getInstallabilityErrors")["installabilityErrors"]
    check("persistent profile: Chrome says the app is installable (no errors)", errs == [], errs); pc.close()
print("\nFAILED: " + (", ".join(fails) if fails else "none"))
sys.exit(1 if fails else 0)
