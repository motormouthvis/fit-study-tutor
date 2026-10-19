"""v4.9: AI flash cards - Improve / Expand / Create, My cards, reset, delete, export/import. Local Worker + fake xAI. Run: python3 tests/e2e_v49.py"""
import os, sys, json, time, threading, subprocess, http.server, socketserver
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC, goto, open_cards
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
        if body.get("stream") is False:
            u = body["messages"][1]["content"]
            if "TASK: IMPROVE" in u: out = '{"cards":[{"front":"IMPROVED FRONT","back":"IMPROVED BACK with the arithmetic shown."}]}'
            elif "TASK: EXPAND" in u: out = json.dumps({"cards": [{"front": "Expanded Q%d" % i, "back": "Expanded A%d" % i} for i in range(1, 5)]})
            elif "garbage" in u: out = "I am sorry, here is a poem instead."
            elif "fenced" in u: out = "Sure!\n```json\n" + '{"cards":[{"front":"Fenced Q","back":"Fenced A"}]}' + "\n```"
            else: out = json.dumps({"cards": [{"front": "Created: " + u.split("about: ")[1].split("\n")[0], "back": "Drafted answer."}]})
            raw = json.dumps({"choices": [{"message": {"content": out}}]}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw); return
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
W1 = free_port(); wk = start_worker(W1, f"http://127.0.0.1:{xs.server_address[1]}/v1/chat/completions", {"PER_HOUR": "500", "PER_DAY": "1000"})
def cfg(url): return "window.ASK_CONFIG = { url: %s };" % json.dumps(url)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    def newpage(w, h, mobile=False, ask=""):
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=mobile, is_mobile=mobile)
        ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
        ctx.route("**/ask-config.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=cfg(ask)))
        ctx.route("**/sw.js", lambda r: r.fulfill(status=404, body=""))  # keep the route override effective
        pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)));  pg.goto(URL); pg.wait_for_timeout(500); return ctx, pg

    MYC = "JSON.parse(localStorage.getItem('tutor.v1.mycards')||'{\"cards\":[],\"over\":{}}')"
    def to_cards(pg):
        open_cards(pg); pg.wait_for_timeout(300)
    for (w, h, mobile, tag) in [(1440, 900, False, "desktop"), (390, 844, True, "phone")]:
        T = lambda sel: pg.tap(sel) if mobile else pg.click(sel)
        ctx, pg = newpage(w, h, mobile, ask=f"http://127.0.0.1:{W1}")
        to_cards(pg)
        check(tag + ": v4.9 label", pg.inner_text("#ver")[:2] in ("v4", "v5"))
        # make sure we're on a text card in a real topic
        pg.evaluate("window.__fc.queue = Flash.ALL.filter(c=>c.topic==='liquidity').map(c=>c.id); document.getElementById('fcFilter').value='topic:liquidity'; document.getElementById('fcFilter').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(300)
        cid = pg.evaluate("window.__fc.queue[0]"); q0 = pg.evaluate("window.__fc.queue.slice(0,3)")
        check(tag + ": small ... button on the card next to the ?", pg.is_visible("#fcFront > .fcmorebtn") and pg.is_visible("#fcFront > .askq"))
        pb = pg.evaluate("(function(){var a=document.querySelector('#fcFront > .askq').getBoundingClientRect(),b=document.querySelector('#fcFront > .fcmorebtn').getBoundingClientRect();return [a.right,b.left,Math.abs(a.top-b.top)]})()")
        check(tag + ": ... sits right next to the ? (same row)", pb[2] < 12 and pb[1] > pb[0] - 2 and pb[1] - pb[0] < 80, pb)
        T("#fcFront > .fcmorebtn"); pg.wait_for_timeout(200)
        check(tag + ": ... opens a small menu; card not flipped", pg.is_visible("#fcMore") and pg.evaluate("window.__fc.flipped") is False)
        mb = pg.evaluate("(function(){var r=document.getElementById('fcMore').getBoundingClientRect();return [r.left,r.right,r.top,r.bottom]})()")
        check(tag + ": menu fits the screen", mb[0] >= 0 and mb[1] <= w and mb[2] >= 0 and mb[3] <= h, mb)
        items = [pg.inner_text(x).strip() for x in ("#fcmImprove", "#fcmExpand", "#fcmCreate")]
        check(tag + ": Improve / Expand / Create in the menu", "Improve" in items[0] and "more cards" in items[1] and "Create" in items[2], items)
        check(tag + ": no Reset / Delete on a plain original card", pg.is_hidden("#fcmReset") and pg.is_hidden("#fcmDelete"))
        if not mobile:
            pg.keyboard.press("g"); pg.keyboard.press("ArrowRight")
        check(tag + ": card keys inert while the menu is open", pg.evaluate("window.__fc.queue.slice(0,3)") == q0)
        pg.keyboard.press("Escape"); check(tag + ": Escape closes the menu", pg.is_hidden("#fcMore"))
        # ---- IMPROVE ----
        before = pg.inner_text("#fcFront"); n0 = len(SEEN)
        T("#fcFront > .fcmorebtn"); T("#fcmImprove"); pg.wait_for_selector(".aicol.new", timeout=10000)
        j = SEEN[-1]["body"]
        check(tag + ": Improve sends the card to the fixed model in JSON mode", j["model"] == "grok-4.20-0309-non-reasoning" and j.get("stream") is False and "TASK: IMPROVE" in j["messages"][1]["content"] and "Back:" in j["messages"][1]["content"], str(j)[:200])
        check(tag + ": shows Before and After", "before" in pg.inner_text(".aicol").lower() and "IMPROVED FRONT" in pg.inner_text(".aicol.new"))
        if mobile:
            bb = pg.evaluate("(function(){var r=document.querySelector('#fcAi .aibox').getBoundingClientRect();return [r.left,r.right,r.bottom]})()"); check("phone: Improve sheet fits 390px", bb[0] >= -1 and bb[1] <= 391 and bb[2] <= 845, bb)
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v49-%s-improve.png" % tag))
        T("#aiDiscard"); pg.wait_for_timeout(200)
        check(tag + ": Discard changes nothing", pg.inner_text("#fcFront") == before and not pg.evaluate(MYC)["over"])
        T("#fcFront > .fcmorebtn"); T("#fcmImprove"); pg.wait_for_selector(".aicol.new", timeout=10000); T("#aiSave"); pg.wait_for_timeout(300)
        check(tag + ": Save replaces the card on this device", "IMPROVED FRONT" in pg.inner_text("#fcFront") and cid in pg.evaluate(MYC)["over"])
        check(tag + ": 'AI IMPROVED' badge", "AI IMPROVED" in pg.inner_text("#fcTopic"))
        check(tag + ": original deck copy untouched", pg.evaluate("Flash.baseCard('%s').f" % cid) == before.replace("\n", " ").strip() or "IMPROVED" not in pg.evaluate("Flash.baseCard('%s').f" % cid))
        pg.reload(); pg.wait_for_timeout(500); to_cards(pg)
        check(tag + ": improved card persists after reload", cid in pg.evaluate(MYC)["over"] and pg.evaluate("Flash.ALL.find(c=>c.id==='%s').improved" % cid) is True)
        pg.evaluate("window.__fc.queue = ['%s'].concat(Flash.ALL.filter(c=>c.topic==='liquidity' && c.id!=='%s').map(c=>c.id)); window.__fc.flipped=false" % (cid, cid)); pg.evaluate("document.getElementById('fcFilter').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(300)
        pg.evaluate("window.__fc.queue = ['%s'].concat(window.__fc.queue.filter(i=>i!=='%s'))" % (cid, cid)); pg.evaluate("document.getElementById('fcCard').click()"); pg.evaluate("document.getElementById('fcCard').click()")
        T("#fcFront > .fcmorebtn"); pg.wait_for_timeout(150)
        check(tag + ": Reset to original appears for an improved card", pg.is_visible("#fcmReset"))
        T("#fcmReset"); pg.wait_for_timeout(300)
        check(tag + ": Reset to original restores the card", cid not in pg.evaluate(MYC)["over"] and "IMPROVED" not in pg.inner_text("#fcFront"))
        # ---- EXPAND ----
        T("#fcFront > .fcmorebtn"); T("#fcmExpand"); pg.wait_for_selector(".aipick", timeout=10000)
        check(tag + ": Expand sends TASK: EXPAND", "TASK: EXPAND" in SEEN[-1]["body"]["messages"][1]["content"])
        check(tag + ": Expand previews 4 cards, all ticked", pg.locator(".aipick").count() == 4 and pg.locator(".aipick input:checked").count() == 4)
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v49-%s-expand.png" % tag))
        pg.locator(".aipick input").nth(1).uncheck(); pg.wait_for_timeout(100)
        check(tag + ": button counts the ticked cards", "Save 3 cards" in pg.inner_text("#aiSave"))
        T("#aiSave"); pg.wait_for_timeout(400)
        my = pg.evaluate(MYC)["cards"]
        check(tag + ": 3 chosen cards saved as My cards (AI), same topic", len(my) == 3 and all(c["topic"] == "liquidity" and c["ai"] for c in my) and not any(c["f"] == "Expanded Q2" for c in my), my)
        check(tag + ": new cards queued right after this one", pg.evaluate("window.__fc.queue.slice(1,4)") == [c["id"] for c in my])
        # step to a new card, check badge + scoring
        pg.evaluate("document.getElementById('fcCard').click()"); pg.keyboard.press("g") if not mobile else pg.tap("#fcGot"); pg.wait_for_timeout(200)
        check(tag + ": AI badge on a saved card, and it can be scored", "AI" in pg.inner_text("#fcTopic") and "My card" in pg.inner_text("#fcTopic"))
        mid = my[0]["id"]
        pg.evaluate("window.__fc.queue = ['%s'].concat(window.__fc.queue.filter(i=>i!=='%s')); window.__fc.flipped=false" % (mid, mid)); pg.evaluate("document.getElementById('fcCard').click()")
        T("#fcGot"); pg.wait_for_timeout(200)
        st = pg.evaluate("JSON.parse(localStorage.getItem('tutor.v1.fc'))")
        check(tag + ": scoring works on My cards", st["cards"].get(mid, {}).get("got") == 1, st["cards"].get(mid))
        pg.evaluate("window.__fc.queue = ['%s'].concat(window.__fc.queue.filter(i=>i!=='%s')); window.__fc.flipped=false" % (mid, mid)); pg.evaluate("document.getElementById('fcStar').click()"); pg.wait_for_timeout(100)
        check(tag + ": Restudy works on My cards + restudy filter includes them", pg.evaluate("Flash.filterCards('restudy', window.__fc.st).some(c=>c.id==='%s')" % mid))
        check(tag + ": My cards filter + topic filter + stats include them", pg.evaluate("Flash.filterCards('mine').length") == 3 and pg.evaluate("Flash.filterCards('topic:liquidity').filter(c=>c.custom).length") == 3 and pg.evaluate("Flash.stats(window.__fc.st).byCourse.mine===undefined") is True)
        # ---- CREATE (from the main menu) ----
        pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])"); check(tag + ": main menu has Create / Improve / Expand / Export / Import", all(pg.is_visible(x) for x in ("#mCreate", "#mImprove", "#mExpand", "#mExport", "#mImport")))
        T("#mCreate"); pg.wait_for_selector("#aiPrompt", timeout=5000)
        T("#aiDraft"); pg.wait_for_timeout(150)
        check(tag + ": empty topic is refused politely", "Type a topic" in pg.inner_text("#fcAiBody"))
        pg.fill("#aiPrompt", "what is working capital"); pg.select_option("#aiTopic", "liquidity"); T("#aiDraft"); pg.wait_for_selector("#aiF", timeout=10000)
        check(tag + ": Create sends the typed topic", "TASK: CREATE" in SEEN[-1]["body"]["messages"][1]["content"] and "what is working capital" in SEEN[-1]["body"]["messages"][1]["content"])
        check(tag + ": draft is editable", "Created: what is working capital" in pg.input_value("#aiF"))
        pg.fill("#aiF", "Working capital (my words)"); pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v49-%s-create.png" % tag)); T("#aiSave"); pg.wait_for_timeout(400)
        my = pg.evaluate(MYC)["cards"]; nc = [c for c in my if c["f"] == "Working capital (my words)"]
        check(tag + ": created card saved with the hand edit, in the chosen topic", len(nc) == 1 and nc[0]["topic"] == "liquidity" and nc[0]["ai"] is True, my)
        # bad JSON fallback + fenced JSON
        pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])"); T("#mCreate"); pg.wait_for_selector("#aiPrompt"); pg.fill("#aiPrompt", "garbage please"); T("#aiDraft")
        pg.wait_for_selector(".aierr", timeout=10000)
        check(tag + ": bad JSON from Grok -> friendly message + Try again, nothing saved", "not in the right format" in pg.inner_text(".aierr") and pg.is_visible("#aiDraft") and pg.input_value("#aiPrompt") == "garbage please" and len(pg.evaluate(MYC)["cards"]) == len(my))
        T("#fcAiClose"); pg.wait_for_timeout(200)
        pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])"); T("#mCreate"); pg.wait_for_selector("#aiPrompt"); pg.fill("#aiPrompt", "fenced answer"); T("#aiDraft"); pg.wait_for_selector("#aiF", timeout=10000)
        check(tag + ": JSON wrapped in code fences is still accepted", pg.input_value("#aiF") == "Fenced Q"); T("#aiDiscard")
        # ---- delete ----
        pg.evaluate("document.getElementById('fcFilter').value='mine'; document.getElementById('fcFilter').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(300)
        n_mine = pg.evaluate("window.__fc.queue.length"); check(tag + ": My cards filter lists the saved cards", n_mine == 4, n_mine)
        pg.screenshot(path=os.path.join(ROOT, "tests", "shot-v49-%s-mycards.png" % tag))
        T("#fcFront > .fcmorebtn"); check(tag + ": Delete offered on a custom card", pg.is_visible("#fcmDelete"))
        T("#fcmDelete"); check(tag + ": delete asks to tap again", "again" in pg.inner_text("#fcmDelete").lower() and len(pg.evaluate(MYC)["cards"]) == 4)
        T("#fcmDelete"); pg.wait_for_timeout(300)
        check(tag + ": custom card deleted", len(pg.evaluate(MYC)["cards"]) == 3 and pg.evaluate("window.__fc.queue.length") == 3)
        # ---- export / import ----
        with pg.expect_download() as dl:
            pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])"); T("#mExport")
        path = dl.value.path(); exp = json.load(open(path))
        check(tag + ": export is JSON with the cards", dl.value.suggested_filename == "my-flash-cards.json" and exp["kind"] == "my-cards" and len(exp["cards"]) == 3, str(exp)[:200])
        pg.evaluate("localStorage.removeItem('tutor.v1.mycards')"); pg.reload(); pg.wait_for_timeout(500); to_cards(pg)
        check(tag + ": after a cleared cache the cards are gone", len(pg.evaluate(MYC)["cards"]) == 0 and pg.evaluate("Flash.ALL.filter(c=>c.custom).length") == 0)
        pg.click("#btnMenu"); pg.wait_for_selector("#menu:not([hidden])")
        pg.set_input_files("#fcImportFile", path); pg.wait_for_timeout(500)
        check(tag + ": import restores the cards", len(pg.evaluate(MYC)["cards"]) == 3 and pg.evaluate("Flash.ALL.filter(c=>c.custom).length") == 3 and "Imported 3" in pg.inner_text("#fcImpMsg"), pg.inner_text("#fcImpMsg"))
        bad = pg.evaluate("window.__mycImport('{nope')"); bad2 = pg.evaluate("window.__mycImport('{\"hello\":1}')"); evil = pg.evaluate("window.__mycImport(JSON.stringify({cards:[{id:'my-evil-1',topic:'x',f:'<img src=x onerror=alert(1)>',b:'ok'},{id:'../../bad',f:'a',b:'b'}]}))")
        check(tag + ": bad / foreign import files are rejected safely", "err" in bad and "err" in bad2 and evil["added"] == 1 and evil["skipped"] == 1, (bad, bad2, evil))
        pg.evaluate("window.__fc.queue=['my-evil-1']"); pg.evaluate("window.__fc.flipped=false"); pg.evaluate("document.getElementById('fcFilter').value='mine'; document.getElementById('fcFilter').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(300)
        check(tag + ": imported text is shown as text, never as HTML", pg.locator("#fcCard img").count() == 0)
        check(tag + ": no JS errors", not pg.errs, pg.errs); ctx.close()
    # statement cards: Improve hidden
    ctx, pg = newpage(1440, 900, False, ask=f"http://127.0.0.1:{W1}"); to_cards(pg)
    pg.evaluate("document.getElementById('fcFilter').value='sa'; document.getElementById('fcFilter').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(300)
    pg.click("#fcFront > .fcmorebtn"); check("Statement Analysis cards: Improve hidden (generated arithmetic), Expand still there", pg.is_hidden("#fcmImprove") and pg.is_visible("#fcmExpand"))
    # coming soon (no worker url)
    ctx.close(); ctx, pg = newpage(1440, 900, False, ask=""); to_cards(pg); pg.click("#fcFront > .fcmorebtn"); pg.click("#fcmExpand"); pg.wait_for_selector(".aierr", timeout=5000)
    check("no Worker address: friendly message, no crash", "not switched on" in pg.inner_text(".aierr"))
    b.close()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
