"""v4.8: Ask Grok on flash cards ("?" on front and back). Local Worker + fake xAI. Run: python3 tests/e2e_v48.py"""
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
    FCST = "JSON.parse(localStorage.getItem('tutor.v1.fc')||'null')"
    def to_cards(pg):
        pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])"); pg.click("#menu [data-goto=cards]"); pg.wait_for_timeout(300)
    for (w, h, mobile, tag) in [(1440, 900, False, "desktop"), (390, 844, True, "phone")]:
        ctx, pg = newpage(w, h, mobile, ask=f"http://127.0.0.1:{W1}")
        to_cards(pg)
        check(tag + ": v4.8 label", pg.inner_text("#ver")[:2] in ("v4", "v5"))
        check(tag + ": ? on the card front", pg.is_visible("#fcFront > .askq"))
        cid = pg.evaluate("window.__fc.queue[0]"); n0 = len(SEEN)
        if mobile: pg.tap("#fcFront > .askq")
        else: pg.click("#fcFront > .askq")
        pg.wait_for_selector("#askLog .askmsg.ai:not(.streaming)", timeout=10000)
        check(tag + ": tapping ? does not flip the card", pg.evaluate("window.__fc.flipped") is False and pg.is_hidden("#fcBack"))
        body = SEEN[-1]["body"] if len(SEEN) > n0 else {}
        first = body.get("messages", [{}, {}])[1].get("content", "")
        c = pg.evaluate("(function(id){return Flash.ALL.find(function(x){return x.id===id})})('%s')" % cid)
        fr = (c.get("q") or c.get("f") or "")[:30]; bk = (c.get("answer") or c.get("b") or "")[:30]
        check(tag + ": sends the card front + back with 'explain in more depth' instruction", "Explain this card in more depth, in plain English, for an MBA beginner" in first and fr in first and bk in first, first[:300])
        check(tag + ": answer shown with card header", "current ratio" in pg.inner_text("#askLog").lower() and pg.inner_text("#askPart").startswith("Flash card"))
        # shortcuts inert while open
        q0 = pg.evaluate("window.__fc.queue.slice(0,3)"); st0 = pg.evaluate(FCST)
        if not mobile:
            pg.click("#askInput"); pg.keyboard.press("Space"); pg.keyboard.type("g m r n"); pg.keyboard.press("ArrowRight")
            pg.evaluate("document.activeElement.blur()"); pg.keyboard.press("Space"); pg.keyboard.press("g"); pg.keyboard.press("ArrowLeft"); pg.keyboard.press("r")
        check(tag + ": card shortcuts do nothing while the chat is open", pg.evaluate("window.__fc.flipped") is False and pg.evaluate("window.__fc.queue.slice(0,3)") == q0 and pg.evaluate(FCST) == st0)
        pg.fill("#askInput", "Can you give a second example?"); pg.click("#askSend")
        pg.wait_for_function("document.querySelectorAll('#askLog .askmsg.ai:not(.streaming)').length >= 2", timeout=10000)
        msgs = SEEN[-1]["body"]["messages"]
        check(tag + ": follow-up works (history sent)", [m["role"] for m in msgs] == ["system", "user", "assistant", "user"] and "card in more depth" in msgs[1]["content"])
        check(tag + ": follow-up counter", "5 follow-ups left" in pg.inner_text("#askLeft"))
        if mobile:
            bb = pg.evaluate("(function(){var r=document.querySelector('#askPanel .askbox').getBoundingClientRect();return [r.left,r.right,r.bottom]})()")
            check("phone: bottom sheet fits 390px", bb[0] >= -1 and bb[1] <= 391 and bb[2] <= 845, bb)
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v48-%s-card-chat.png" % tag))
        if mobile: pg.tap("#askClose")
        else: pg.keyboard.press("Escape")
        pg.wait_for_timeout(200); check(tag + ": closes; card still unflipped", pg.is_hidden("#askPanel") and pg.evaluate("window.__fc.flipped") is False)
        # back face
        if mobile: pg.tap("#fcCard .fcq")
        else: pg.keyboard.press("Space")
        pg.wait_for_timeout(200)
        check(tag + ": ? on the card back too", pg.is_visible("#fcBack > .askq"))
        n1 = len(SEEN)
        if mobile: pg.tap("#fcBack > .askq")
        else: pg.click("#fcBack > .askq")
        pg.wait_for_timeout(500)
        check(tag + ": back ? opens the same card chat (history kept, no new request)", pg.is_visible("#askPanel") and len(SEEN) == n1 and pg.evaluate("window.__fc.flipped") is True and pg.evaluate("window.__fc.queue.slice(0,3)") == q0)
        k = pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('tutor.v1.ask')||'{}'))")
        check(tag + ": stored on the device under card:<id>", ("card:" + cid) in k, k)
        if mobile: pg.tap("#askClose")
        else: pg.keyboard.press("Escape")
        if not mobile:
            pg.keyboard.press("g"); pg.wait_for_timeout(200)
            check("desktop: shortcuts work again after closing", pg.evaluate("window.__fc.queue[0]") != cid)
        check(tag + ": no JS errors", not pg.errs, pg.errs); ctx.close()
    b.close()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
