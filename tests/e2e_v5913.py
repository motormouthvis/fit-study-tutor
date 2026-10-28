"""v5.9.13: ONE "?" button per card side that opens the card helper (explain / improve / make another / create, plus every
card action) by voice, by typing, or by visible buttons, and the microphone fixes for the Cybertruck browser
(separate speech-API / mic detection, plain-English errors with a Try again button, no restart loops, Menu > Test microphone).
Grok is stubbed at the network layer, so this test makes no real API calls.
Run: python3 tests/e2e_v5913.py"""
import os, sys, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, FAKE_REC
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv, PORT = serve(ROOT); URL = f"http://127.0.0.1:{PORT}/index.html"
CHROME = next((p for p in ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome", "/usr/bin/chromium"] if os.path.exists(p)), None)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))
    if not cond: fails.append(name)
PRESET = "if(!localStorage.getItem('tutor.v1.settings'))localStorage.setItem('tutor.v1.settings', JSON.stringify({schema:2, soundOk:true, introCount:5}));"
CH2 = "book:froeb-ch02"
asked = []
reply = {"cards": [{"front": "Improved front?", "back": "Improved back."}]}
# a speech recognizer that fails with a given error code every time it is started
def ERR_REC(code):
    return """(() => { window.__recStarts = 0;
  class R { constructor(){ this.onresult=null; this.onend=null; this.onstart=null; this.onerror=null; }
    start(){ window.__recStarts++; setTimeout(()=>{ this.onstart&&this.onstart(); setTimeout(()=>{ this.onerror&&this.onerror({error:'CODE'}); setTimeout(()=>this.onend&&this.onend(),5); },10); },5); }
    abort(){} stop(){} }
  window.webkitSpeechRecognition = R; window.SpeechRecognition = R; })();""".replace("CODE", code)
NOSTART_REC = """(() => { window.__recStarts = 0; class R { start(){ window.__recStarts++; } abort(){} stop(){} }
  window.webkitSpeechRecognition = R; window.SpeechRecognition = R; })();"""
NOSR = "delete window.SpeechRecognition; delete window.webkitSpeechRecognition;"

def device(b, w, h, mob, rec=FAKE_REC, extra=None):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob)
    ctx.add_init_script(rec); ctx.add_init_script(PRESET)
    if extra: ctx.add_init_script(extra)
    def grok(route):
        asked.append(json.loads(route.request.post_data))
        route.fulfill(status=200, content_type="application/json", body=json.dumps(reply))
    ctx.route("**/ask", grok)
    pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(500)
    return ctx, pg
def study(pg, sid=CH2):
    pg.click(".tab[data-tab=cards]"); pg.wait_for_timeout(250)
    pg.click(".fcsbtn[data-sec='%s'][data-mode='all']" % sid); pg.wait_for_timeout(250)
def say(pg, text):
    """tap the big Talk button and 'speak' one phrase"""
    pg.click("#cpTalk"); pg.wait_for_function("window.__recActive()", timeout=3000); pg.evaluate("(t)=>window.__hear([t])", text); pg.wait_for_timeout(300)
def opened(pg): return pg.is_visible("#cardPanel .sheetbox")
def fc(pg, expr): return pg.evaluate("()=>window.__fc." + expr)
def status(pg): return pg.inner_text("#cpStatus")
def stat(pg, key): return pg.evaluate("()=>{var c=window.__fc.st.cards[window.__fc.queue[0]]||{};return !!c['%s']}" % key)

try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
    for (w, h, mob, tag) in [(1280, 800, False, "desktop"), (390, 844, True, "phone")]:
        ctx, A = device(b, w, h, mob); study(A)
        T = (lambda s: A.tap(s)) if mob else (lambda s: A.click(s))
        # ---- one button per side, nothing else ----
        check(tag + ": exactly one ? button on the question side, no ... menu, no separate Ask ?", A.locator("#fcFront .fcinfo").count() == 1 and A.locator("#fcFront .fcmorebtn, #fcFront .askq").count() == 0)
        check(tag + ": the old ... menu element is gone", A.locator("#fcMore").count() == 0)
        check(tag + ": skip arrows still there", A.is_visible("#fcPrev") and A.is_visible("#fcNext"))
        first = fc(A, "queue[0]")
        T("#fcFront .fcinfo"); A.wait_for_timeout(200)
        check(tag + ": ? opens the card helper; card not flipped", opened(A) and fc(A, "flipped") is False)
        bb = A.evaluate("()=>{var r=document.querySelector('#cardPanel .sheetbox').getBoundingClientRect();return [r.left,r.right,r.top,r.bottom]}")
        check(tag + ": helper fits the screen", bb[0] >= -1 and bb[1] <= w + 1 and bb[3] <= h + 1, bb)
        ids = ["cpTalk", "cpType", "fcmExplain", "fcmImprove", "fcmExpand", "fcmCreate", "cpImp", "cpStar", "cpFlip", "cpPrev", "cpNext", "cpGot", "cpMissed"]
        check(tag + ": every function has a visible control", all(A.is_visible("#" + i) for i in ids), [i for i in ids if not A.is_visible("#" + i)])
        A.screenshot(path=os.path.join(ROOT, "tests", "shot-v5913-%s-helper.png" % tag))
        # ---- voice: card actions ----
        say(A, "flip"); check(tag + ": voice 'flip' shows the answer", fc(A, "flipped") is True and "answer" in status(A).lower(), status(A))
        check(tag + ": the panel stays open and the Heard line shows what it heard", opened(A) and "flip" in A.inner_text("#cpHeard").lower())
        say(A, "mark important"); check(tag + ": voice 'mark important'", stat(A, "imp"))
        say(A, "restudy"); check(tag + ": voice 'restudy'", stat(A, "restudy"))
        say(A, "got it"); A.wait_for_timeout(200)
        check(tag + ": voice 'got it' grades the card right and moves on", fc(A, "queue[0]") != first and fc(A, "st.cards['%s'].got" % first) == 1, fc(A, "queue[0]"))
        second = fc(A, "queue[0]")
        say(A, "skip"); check(tag + ": voice 'skip' goes next without a grade", fc(A, "queue[0]") != second and not fc(A, "st.cards['%s']" % second))
        say(A, "previous"); check(tag + ": voice 'previous' comes back", fc(A, "queue[0]") == second)
        say(A, "flip"); say(A, "missed it"); check(tag + ": voice 'missed it'", fc(A, "st.cards['%s'].miss" % second) == 1 and fc(A, "queue[0]") != second)
        say(A, "got it"); check(tag + ": 'got it' before flipping is refused politely", "flip the card first" in status(A).lower(), status(A))
        say(A, "purple elephant"); check(tag + ": unknown phrase: says so, does nothing", "did not understand" in status(A), status(A))
        say(A, "what can i say"); check(tag + ": 'help' lists the phrases", "improve" in status(A).lower() and "create" in status(A).lower(), status(A))
        # ---- buttons do the same ----
        q = fc(A, "queue[0]")
        T("#cpFlip"); check(tag + ": Flip button", fc(A, "flipped") is True)
        T("#cpImp"); check(tag + ": Important button", stat(A, "imp"))
        T("#cpStar"); check(tag + ": Restudy button", stat(A, "restudy"))
        T("#cpGot"); A.wait_for_timeout(150); check(tag + ": Got it button", fc(A, "queue[0]") != q)
        n0 = fc(A, "queue[0]"); T("#cpNext"); check(tag + ": Skip button", fc(A, "queue[0]") != n0)
        T("#cpPrev"); check(tag + ": Previous button", fc(A, "queue[0]") == n0)
        # typed phrase
        A.fill("#cpType", "flip"); A.keyboard.press("Enter"); A.wait_for_timeout(150); check(tag + ": typing a phrase works the same as saying it", fc(A, "flipped") is True)
        # the back side has the one button too, and it opens the same helper
        T("#cpClose"); A.wait_for_timeout(150); check(tag + ": Close closes it", not opened(A))
        check(tag + ": answer side: one ? button, nothing else", A.locator("#fcBack .fcinfo").count() == 1 and A.locator("#fcBack .fcmorebtn, #fcBack .askq").count() == 0 and A.is_visible("#fcBack .fcinfo"))
        T("#fcBack .fcinfo"); A.wait_for_timeout(200); check(tag + ": the answer-side ? opens the helper (answer side showing)", opened(A) and "answer side" in A.inner_text("#cpCardLine"))
        # ---- explain by voice ----
        say(A, "explain this card"); A.wait_for_timeout(500)
        check(tag + ": voice 'explain this card' opens Ask Grok on this card", A.is_visible("#askPanel") and not opened(A))
        if mob: A.tap("#askClose")
        else: A.keyboard.press("Escape")
        A.wait_for_timeout(250)
        # ---- improve by voice: his words are feedback, not card text ----
        T("#fcFront .fcinfo"); A.wait_for_timeout(150) if not opened(A) else None
        if not opened(A): T("#fcBack .fcinfo"); A.wait_for_timeout(150)
        n = len(asked); say(A, "improve this card")
        check(tag + ": 'improve this card' (no detail) asks what to change, without calling Grok yet", len(asked) == n and "what should change" in status(A).lower() and A.is_visible("#cpCancel"), status(A))
        say(A, "make the question harder"); A.wait_for_selector(".aicol.new", timeout=10000)
        check(tag + ": the spoken note goes to Grok as the instruction", asked[-1].get("kind") == "improve" and "make the question harder" in asked[-1].get("partText", ""), json.dumps(asked[-1])[:300])
        check(tag + ": Save is enabled for a clean result", A.is_enabled("#aiSave"))
        T("#aiDiscard"); A.wait_for_timeout(250)
        # ---- improve by voice with the note in the same sentence ----
        T("#fcFront .fcinfo") if A.is_visible("#fcFront .fcinfo") else T("#fcBack .fcinfo"); A.wait_for_timeout(150)
        say(A, "improve it, make it shorter"); A.wait_for_selector(".aicol.new", timeout=10000)
        check(tag + ": 'improve it, make it shorter' runs straight away with that note", asked[-1].get("kind") == "improve" and "make it shorter" in asked[-1].get("partText", ""), json.dumps(asked[-1])[:200])
        # echo: Grok pastes his words into the card -> Save blocked
        saved_reply = reply; reply = {"cards": [{"front": "Front", "back": "Ok so please make it shorter and also add the one sentence about the decision"}]}
        T("#aiDiscard"); A.wait_for_timeout(250)
        T("#fcFront .fcinfo") if A.is_visible("#fcFront .fcinfo") else T("#fcBack .fcinfo"); A.wait_for_timeout(150)
        say(A, "improve it, please make it shorter and also add the one sentence about the decision"); A.wait_for_selector("#aiSave", timeout=10000); A.wait_for_timeout(300)
        check(tag + ": his words pasted into the card -> warning shown and Save is blocked", A.is_disabled("#aiSave") and "copied your note" in A.inner_text("#fcAiBody").lower(), A.inner_text("#fcAiBody")[:200])
        reply = saved_reply
        T("#aiDiscard"); A.wait_for_timeout(250)
        # ---- make another like it ----
        T("#fcFront .fcinfo") if A.is_visible("#fcFront .fcinfo") else T("#fcBack .fcinfo"); A.wait_for_timeout(150)
        reply = {"cards": [{"front": "New A?", "back": "New A back."}, {"front": "New B?", "back": "New B back."}]}
        say(A, "make another card like this"); A.wait_for_selector(".aipick", timeout=10000)
        check(tag + ": 'make another card like this' asks Grok for similar cards and shows them to tick", asked[-1].get("kind") == "expand" and A.locator(".aipick").count() == 2)
        T("#aiDiscard") if A.is_visible("#aiDiscard") else A.keyboard.press("Escape"); A.wait_for_timeout(250)
        # ---- create from scratch ----
        T("#fcFront .fcinfo") if A.is_visible("#fcFront .fcinfo") else T("#fcBack .fcinfo"); A.wait_for_timeout(150)
        reply = {"cards": [{"front": "What is working capital?", "back": "Current assets minus current liabilities."}]}
        say(A, "create a brand new flash card")
        check(tag + ": 'create a brand new flash card' asks what it should cover", "what should the new card cover" in status(A).lower(), status(A))
        say(A, "working capital"); A.wait_for_selector("#aiF", timeout=10000)
        check(tag + ": the spoken topic goes to Grok as the prompt", asked[-1].get("kind") == "create" and "working capital" in json.dumps(asked[-1]))
        check(tag + ": the draft is editable front/back and Save is on", A.input_value("#aiF").startswith("What is working capital") and A.is_enabled("#aiSave"))
        my0 = A.evaluate("()=>Flash.filterCards('mine').length"); T("#aiSave"); A.wait_for_timeout(400)
        check(tag + ": Save adds it to My cards", A.evaluate("()=>Flash.filterCards('mine').length") == my0 + 1)
        # create with the topic in the sentence + echo block
        T("#fcFront .fcinfo") if A.is_visible("#fcFront .fcinfo") else T("#fcBack .fcinfo"); A.wait_for_timeout(150)
        long = "create a new card about how a company can be profitable on paper and still run out of cash"
        reply = {"cards": [{"front": "A company can be profitable on paper and still run out of cash", "back": "Yes, because profit is not cash."}]}
        say(A, long); A.wait_for_selector("#aiSave", timeout=10000); A.wait_for_timeout(300)
        check(tag + ": new-card draft that pastes his sentence is blocked from saving", A.is_disabled("#aiSave") and "copied your request" in A.inner_text("#fcAiBody").lower(), A.inner_text("#fcAiBody")[:160])
        A.fill("#aiF", "Why can a profitable company run out of cash?"); A.wait_for_timeout(150)
        check(tag + ": editing his words out of the draft switches Save back on", A.is_enabled("#aiSave"))
        A.fill("#aiF", long); A.wait_for_timeout(150); check(tag + ": typing them back in switches it off again", A.is_disabled("#aiSave"))
        T("#aiDiscard"); A.wait_for_timeout(250)
        check(tag + ": no JS errors", not A.errs, A.errs); ctx.close()

    # ---- buttons without voice: the three AI buttons open the usual sheets ----
    ctx, A = device(b, 1280, 800, False); study(A)
    A.click("#fcFront .fcinfo"); A.click("#fcmImprove"); A.wait_for_selector("#aiInstr", timeout=4000)
    check("Improve button opens the Improve sheet with its own Talk and instruction box", A.is_visible("#aiInstrMic") and not opened(A))
    A.click("#aiCancel"); A.wait_for_timeout(200)
    A.click("#fcFront .fcinfo"); A.fill("#cpType", "explain it like I'm five"); A.click("#fcmImprove"); A.wait_for_selector(".aicol.new", timeout=10000)
    check("typing a note then tapping Improve runs it with that note", "explain it like I'm five" in json.dumps(asked[-1]))
    A.click("#aiDiscard"); A.wait_for_timeout(200)
    # ---- Reset and Delete on a card of his own ----
    A.click("#fcFront .fcinfo"); A.click("#fcmCreate"); A.wait_for_selector("#aiPrompt", timeout=4000)
    reply = {"cards": [{"front": "Own card front?", "back": "Own card back."}]}
    A.fill("#aiPrompt", "gross margin"); A.click("#aiDraft"); A.wait_for_selector("#aiF", timeout=10000); A.click("#aiSave"); A.wait_for_timeout(400)
    A.evaluate("document.getElementById('fcFilter').value='mine'; document.getElementById('fcFilter').dispatchEvent(new Event('change'))"); A.wait_for_timeout(300)
    cur = A.evaluate("()=>window.__fc.queue[0]"); check("the new card is current (My cards)", "Own card front" in A.inner_text("#fcFront"))
    A.click("#fcFront .fcinfo"); A.wait_for_timeout(150)
    check("Delete shows on his own card, Reset does not (not improved)", A.is_visible("#fcmDelete") and A.is_hidden("#fcmReset"))
    A.click("#fcmDelete"); check("Delete asks to tap again (not deleted yet)", "again" in A.inner_text("#fcmDelete").lower() and A.evaluate("()=>Flash.filterCards('mine').some(function(c){return c.id==='%s'})" % cur))
    A.click("#fcmDelete"); A.wait_for_timeout(300)
    check("second tap deletes it", not A.evaluate("()=>Flash.filterCards('mine').some(function(c){return c.id==='%s'})" % cur))
    check("no JS errors", not A.errs, A.errs); ctx.close()

    # ---- the microphone: every failure is a plain sentence + a Try again button, with no restart loop ----
    for code, word in [("not-allowed", "blocked the microphone"), ("service-not-allowed", "switched off"), ("no-speech", "did not hear anything"), ("audio-capture", "no microphone"), ("network", "internet")]:
        ctx, A = device(b, 1280, 800, False, rec=ERR_REC(code)); study(A); A.click("#fcFront .fcinfo"); A.click("#cpTalk"); A.wait_for_timeout(700)
        check("mic error '%s': plain-English message" % code, word in status(A).lower() and code not in status(A), status(A))
        check("mic error '%s': Try again button shown, not listening, no automatic restart" % code, A.is_visible("#cpRetry") and A.evaluate("window.__recStarts") == 1 and A.get_attribute("#cpTalk", "aria-pressed") == "false")
        A.wait_for_timeout(1500); check("mic error '%s': still one start after 1.5 s (no loop)" % code, A.evaluate("window.__recStarts") == 1)
        A.fill("#cpType", "flip"); A.keyboard.press("Enter"); A.wait_for_timeout(150)
        check("mic error '%s': the type box and buttons still work" % code, A.evaluate("()=>window.__fc.flipped") is True)
        A.click("#cpRetry"); A.wait_for_timeout(500); check("mic error '%s': Try again starts listening again from the tap" % code, A.evaluate("window.__recStarts") >= 2)
        ctx.close()
    # a browser whose recognizer never opens (some in-car browsers): says so after a few seconds instead of waiting forever
    ctx, A = device(b, 1280, 800, False, rec=NOSTART_REC); study(A); A.click("#fcFront .fcinfo"); A.click("#cpTalk"); A.wait_for_timeout(1000)
    check("never-starting mic: shows 'Opening the microphone' while it waits", "opening the microphone" in status(A).lower(), status(A))
    A.wait_for_timeout(8500)
    check("never-starting mic: gives up with a plain message and Try again", "did not start" in status(A).lower() and A.is_visible("#cpRetry"), status(A))
    ctx.close()
    # no speech API at all
    ctx, A = device(b, 1280, 800, False, rec=NOSR); study(A); A.click("#fcFront .fcinfo"); A.wait_for_timeout(200)
    check("no speech API: Talk button says so and is off", A.is_disabled("#cpTalk") and "not available" in A.inner_text("#cpTalk").lower() and "can't listen" in status(A).lower(), [A.inner_text("#cpTalk"), status(A)])
    A.fill("#cpType", "mark important"); A.keyboard.press("Enter"); A.wait_for_timeout(150)
    check("no speech API: typing still does every action", A.evaluate("()=>!!window.__fc.st.cards[window.__fc.queue[0]].imp"))
    ctx.close()

    # ---- Menu > Test microphone ----
    ctx, A = device(b, 1280, 800, False); A.click("#btnMenu"); A.wait_for_selector("#menu:not([hidden])")
    check("Menu has a Test microphone button", A.is_visible("#btnMicTest"))
    A.click("#btnMicTest"); A.wait_for_timeout(300)
    rep = A.inner_text("#mtReport")
    check("report shows speech API present, permission and getUserMedia", "Speech API: yes" in rep and "Permission:" in rep and "getUserMedia: yes" in rep, rep)
    A.click("#mtMic"); A.wait_for_function("document.getElementById('mtReport').textContent.indexOf('Mic opened: yes')>=0", timeout=8000)
    check("Check the microphone opens the mic and starts the level meter", "Mic opened: yes" in A.inner_text("#mtReport"))
    A.wait_for_function("document.getElementById('mtReport').textContent.indexOf('Audio level: not tested')<0", timeout=9000)
    check("audio level is reported after 4 seconds", "Audio level:" in A.inner_text("#mtReport") and "peak" in A.inner_text("#mtReport"), A.inner_text("#mtReport"))
    A.click("#mtSpeech"); A.wait_for_function("window.__recActive()", timeout=3000); A.evaluate("window.__hear(['testing one two'])"); A.wait_for_timeout(300)
    check("speech-to-text test reports what it heard", "heard “testing one two”" in A.inner_text("#mtReport") and "Voice works" in A.inner_text("#mtVerdict"), A.inner_text("#mtReport"))
    A.screenshot(path=os.path.join(ROOT, "tests", "shot-v5913-mictest.png"))
    A.click("#mtClose"); A.wait_for_timeout(150); check("closes", A.is_hidden("#micTest")); ctx.close()
    ctx, A = device(b, 1280, 800, False, rec=NOSR); A.click("#btnMenu"); A.click("#btnMicTest"); A.wait_for_timeout(300)
    check("Test microphone with no speech API says NO and explains", "Speech API: NO" in A.inner_text("#mtReport") and "no speech-to-text" in A.inner_text("#mtVerdict").lower() or "can't listen" in A.inner_text("#mtVerdict").lower(), A.inner_text("#mtVerdict"))
    ctx.close()
    b.close()
except Exception as e:
    import traceback; traceback.print_exc(); fails.append("exception: %s" % e)
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
