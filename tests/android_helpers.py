import sys, json
sys.path.insert(0, "/workspace/fst-discuss/tests")
from playwright.sync_api import sync_playwright
from common import serve
from android_rec import ANDROID_REC, ANDROID_UA
srv, PORT = serve("/workspace/fst-discuss"); URL = "http://127.0.0.1:%d/index.html" % PORT
PRESET = "if(!localStorage.getItem('tutor.v1.settings'))localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
asked = []
def say(A, t, mode="final"):
    A.tap("#cpTalk"); A.wait_for_function("window.__recActive()", timeout=3000); A.evaluate("([t,m])=>window.__say(t,m)", [t, mode]); A.wait_for_timeout(500)
def grok_route(reply):
    def grok(route):
        asked.append(json.loads(route.request.post_data)); route.fulfill(status=200, content_type="application/json", body=json.dumps(reply))
    return grok
def st(A, l):
    r = [A.is_visible("#cardPanel .sheetbox"), A.is_visible("#fcAi .sheetbox"), A.inner_text("#cpStatus")[:60], len(asked), A.logs]
    print(l, "| panel, ai, status, asked, errs:", r)
CHROME = "/usr/bin/google-chrome"
ARGS = []
def newctx(p, w=412, h=915, reply=None):
    b = p.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True, user_agent=ANDROID_UA)
    ctx.add_init_script(ANDROID_REC); ctx.add_init_script(PRESET)
    ctx.route("**/ask", grok_route(reply or {"cards": [{"front": "F?", "back": "B."}]}))
    return b, ctx
def start(p, w=412, h=915, reply=None):
    b, ctx = newctx(p, w, h, reply)
    A = ctx.new_page(); A.logs = []; A.on("pageerror", lambda e: A.logs.append(str(e)))
    A.goto(URL); A.wait_for_timeout(400)
    A.click(".tab[data-tab=cards]"); A.wait_for_timeout(200)
    A.click(".fcsbtn[data-sec='book:froeb-ch02'][data-mode='all']"); A.wait_for_timeout(200)
    A.tap("#fcFront .fcinfo"); A.wait_for_timeout(200)
    return b, A
