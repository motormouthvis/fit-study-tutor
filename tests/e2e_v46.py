"""v4.6: Ask Grok. '?' on each part (Read + Listen), chat panel (desktop side panel, phone sheet), streaming, follow-ups, history, coming-soon.
Uses a local copy of the Worker (worker/local-server.mjs) and a fake xAI. REAL=1 also asks the real xAI API one cheap question.
Run: python3 tests/e2e_v46.py"""
import os, sys, json, time, threading, subprocess, http.server, socketserver
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC, goto
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); APP = f"http://127.0.0.1:{PORT}"; URL = APP + "/index.html"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "if(!localStorage.getItem('tutor.v1.settings'))localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
# ---- fake xAI: streams 3 chunks slowly, records requests ----
SEEN = []
class X(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        SEEN.append({"auth": self.headers.get("Authorization", "")[:7], "body": body})
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        n = len([m for m in body["messages"] if m["role"] == "user"])
        for w in (["The **current ratio** ", "compares what you have ", "to what you owe soon.\n\nExample: a shop with $2 for every $1 due."] if n == 1 else ["Follow-up answer ", "number %d." % n]):
            self.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": w}}]}) + "\n\n").encode()); self.wfile.flush(); time.sleep(0.35)
        self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
socketserver.TCPServer.allow_reuse_address = True
xs = socketserver.ThreadingTCPServer(("127.0.0.1", 0), X); threading.Thread(target=xs.serve_forever, daemon=True).start()
def free_port():
    import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); n = s.getsockname()[1]; s.close(); return n
def start_worker(port, xai_url=None, extra=None):
    e = dict(os.environ, PORT=str(port), ALLOWED_ORIGINS=APP); e.update(extra or {})
    if xai_url: e["XAI_URL"] = xai_url; e["XAI_API_KEY"] = "fake-key-for-tests"
    pr = subprocess.Popen(["node", os.path.join(ROOT, "worker", "local-server.mjs")], env=e, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    pr.stdout.readline(); import atexit; atexit.register(pr.terminate); return pr
W1 = free_port(); wk = start_worker(W1, f"http://127.0.0.1:{xs.server_address[1]}/v1/chat/completions", {"PER_HOUR": "6"})
def cfg(url): return "window.ASK_CONFIG = { url: %s };" % json.dumps(url)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    def newpage(w, h, mobile=False, ask=""):
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=mobile, is_mobile=mobile)
        ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        ctx.route("**/ask-config.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=cfg(ask)))
        ctx.route("**/sw.js", lambda r: r.fulfill(status=404, body=""))  # keep the route override effective
        pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)));  pg.goto(URL); pg.wait_for_timeout(500); return ctx, pg
    # ---------- coming soon (no Worker address yet) ----------
    ctx, pg = newpage(1440, 900, ask="")
    check("v4.6+ label", pg.inner_text("#ver")[:2] in ("v4", "v5"))
    pg.click("[data-view=read]"); pg.mouse.move(700, 500); pg.wait_for_timeout(900)
    n = pg.evaluate("document.querySelectorAll('#rText p').length"); q = pg.evaluate("document.querySelectorAll('#rText p > .askq').length")
    check("Read mode: a circled ? on every part", n > 0 and q == n, (n, q))
    pg.click("#rText p:nth-child(2) .askq"); pg.wait_for_timeout(200)
    check("? opens the panel (and does not move the part)", pg.is_visible("#askPanel") and pg.evaluate("window.__stmtState.focus.si") == 0)
    check("coming-soon note, input disabled", "coming soon" in pg.inner_text("#askLog").lower() and pg.is_disabled("#askInput"))
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v46-coming-soon.png"))
    pg.click("#askClose"); check("close", pg.is_hidden("#askPanel")); ctx.close()
    # ---------- working (local Worker + fake xAI) ----------
    ctx, pg = newpage(1440, 900, ask=f"http://127.0.0.1:{W1}")
    pg.click("[data-view=read]"); pg.mouse.move(700, 500); pg.wait_for_timeout(900)
    pg.click("#lessonList .trw[data-topic=liquidity]"); pg.mouse.move(700, 500); pg.wait_for_timeout(200)
    part = pg.evaluate("__tutor.readSegs('liquidity')[1]")
    pg.click("#rText p:nth-child(2) .askq"); pg.wait_for_timeout(500)
    mid = pg.inner_text("#askLog")
    check("answer streams in (partial text while still arriving)", "current ratio" in mid and "Example" not in mid, mid)
    pg.wait_for_selector("#askLog .askmsg.ai:not(.streaming)", timeout=8000); pg.wait_for_timeout(200)
    full = pg.inner_text("#askLog"); check("full answer shown, bold rendered", "Example: a shop" in full and pg.locator("#askLog .askmsg.ai b").count() >= 1, full)
    req = SEEN[-1]["body"]
    check("Worker sent the part text + 'explain further, plain English, MBA beginner' with the fixed model", part[:60] in req["messages"][1]["content"] and "plain English, for an MBA beginner" in req["messages"][1]["content"] and req["model"] == "grok-4.20-0309-non-reasoning" and req["stream"] is True, req["messages"][1]["content"][:200])
    check("key added by the Worker, not the browser", SEEN[-1]["auth"] == "Bearer ")
    box = pg.locator("#askPanel .askbox").bounding_box()
    check("desktop: side panel on the right, full height", box["x"] > 900 and box["height"] > 880, box)
    check("desktop: page content shifts left so nothing is hidden behind the panel", pg.locator("#learnWrap").bounding_box()["x"] + pg.locator("#learnWrap").bounding_box()["width"] <= box["x"] + 2)
    check("follow-up counter", "6 follow-ups left" in pg.inner_text("#askLeft"))
    pg.fill("#askInput", "Why is under 1 bad?"); pg.keyboard.press("Enter")
    pg.wait_for_function("document.querySelectorAll('#askLog .askmsg.ai:not(.streaming)').length>=2", timeout=8000)
    req = SEEN[-1]["body"]; roles = [m["role"] for m in req["messages"]]
    check("follow-up sends the history (system, part, answer, question)", roles == ["system", "user", "assistant", "user"] and req["messages"][3]["content"] == "Why is under 1 bad?", roles)
    check("follow-up shown", "Why is under 1 bad?" in pg.inner_text("#askLog") and "Follow-up answer" in pg.inner_text("#askLog"))
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(100)
    check("arrow keys don't move the reader while typing in the chat", pg.evaluate("window.__stmtState.focus.si") == 0)
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v46-desktop-chat.png"))
    pg.click("#askClose"); pg.reload(); pg.wait_for_timeout(600)
    pg.click("#lessonList .trw[data-topic=liquidity]"); pg.mouse.move(700, 500); pg.wait_for_timeout(200)
    before = len(SEEN); pg.click("#rText p:nth-child(2) .askq"); pg.wait_for_timeout(400)
    check("history kept on the device after reload (no new request)", "Why is under 1 bad?" in pg.inner_text("#askLog") and len(SEEN) == before)
    st = pg.evaluate("JSON.parse(localStorage.getItem('tutor.v1.ask'))"); check("stored under topic:part", "liquidity:1" in st and len(st["liquidity:1"]["msgs"]) == 4)
    # rate limit (PER_HOUR=6 on this local worker): 2 used; use up the rest
    pg.click("#askClose")
    for i in range(3, 8):
        pg.click(f"#rText p:nth-child({i}) .askq"); pg.wait_for_function("!window.__ask.busy", timeout=8000); pg.wait_for_timeout(100); pg.click("#askClose")
    pg.click("#rText p:nth-child(8) .askq"); pg.wait_for_function("!window.__ask.busy", timeout=8000); pg.wait_for_timeout(100)
    check("rate limit message is friendly (minutes)", "minutes" in pg.inner_text("#askLog") and pg.is_visible("#askRetry"), pg.inner_text("#askLog"))
    check("no JS errors (desktop)", not pg.errs, pg.errs); ctx.close()
    # ---------- Listen mode + phone sheet ----------
    W2 = free_port(); wk2 = start_worker(W2, f"http://127.0.0.1:{xs.server_address[1]}/v1/chat/completions")
    ctx, pg = newpage(390, 844, True, ask=f"http://127.0.0.1:{W2}")
    check("phone Listen: no ? before a lesson is playing", pg.is_hidden("#lAsk"))
    pg.evaluate("__tutor.start({lesson:'leverage'})")
    try: pg.wait_for_selector('#lAsk:not([hidden])', timeout=5000)
    except Exception: pass
    try: pg.wait_for_selector("#lAsk", state="visible", timeout=15000); ok=True
    except Exception: ok=False
    check("phone Listen: ? on the current part", ok)
    pg.tap("#lAsk"); pg.wait_for_selector("#askLog .askmsg.ai:not(.streaming)", timeout=8000)
    req = SEEN[-1]["body"]; check("Listen ? sends the part being played", pg.evaluate("__tutor.snapshot().lesson.text")[:50] in req["messages"][1]["content"])
    bx = pg.locator("#askPanel .askbox").bounding_box()
    check("phone: bottom sheet, full width, fits 390px", bx["x"] <= 1 and bx["width"] >= 385 and bx["y"] + bx["height"] >= 840 and pg.evaluate("document.documentElement.scrollWidth") <= 390, bx)
    check("audio paused while asking", pg.evaluate("__tutor.snapshot().audioPaused || !__tutor.snapshot().speaking"))
    pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v46-phone-chat.png"))
    check("no JS errors (phone)", not pg.errs, pg.errs); ctx.close()
    # ---------- origin check through the real HTTP stack ----------
    import urllib.request
    try:
        urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{W1}/ask", data=b'{"partText":"x"}', headers={"Origin": "https://evil.example", "Content-Type": "application/json"})); code = 200
    except urllib.error.HTTPError as e: code = e.code
    check("Worker refuses other origins (403)", code == 403, code)
    # ---------- optional: real xAI, one cheap question ----------
    if os.environ.get("REAL") == "1":
        W3 = free_port(); wk3 = start_worker(W3)
        ctx, pg = newpage(1440, 900, ask=f"http://127.0.0.1:{W3}")
        pg.click("[data-view=read]"); pg.mouse.move(700, 500); pg.wait_for_timeout(900)
        pg.click("#lessonList .trw[data-topic=liquidity]"); pg.mouse.move(700, 500); pg.wait_for_timeout(200)
        t0 = time.time(); pg.click("#rText p:nth-child(2) .askq")
        pg.wait_for_selector("#askLog .askmsg.ai:not(.streaming)", timeout=60000); dt = time.time() - t0
        ans = pg.inner_text("#askLog .askmsg.ai")
        check("REAL xAI: answer received through the Worker code (%.1fs, %d chars)" % (dt, len(ans)), len(ans) > 200 and "ratio" in ans.lower(), ans[:200])
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v46-real-grok.png")); print("REAL answer preview:", ans[:300].replace("\n", " "))
        ctx.close(); wk3.terminate()
    b.close()
wk.terminate(); wk2.terminate()
print("\nFAILED: " + (", ".join(fails) if fails else "none"))
sys.exit(1 if fails else 0)
