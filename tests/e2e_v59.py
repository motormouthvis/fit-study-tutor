"""v5.9: the Important star (mark, count, Study important, survives a reload) and the reworked
"Improve with Grok" flow (instruction box, talk-to-type, preview, Save, refine again).
Grok is stubbed at the network layer, so this test makes no real API calls.
Run: python3 tests/e2e_v59.py"""
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
GROK = "**/ask"   # the real proxy address comes from ask-config.js; every call is intercepted here
CH2 = "book:froeb-ch02"
asked = []          # every body posted to the Grok proxy
reply = {"cards": [{"front": "Improved front?", "back": "Improved back."}]}

def device(b, w, h, mob):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob)
    ctx.add_init_script(FAKE_REC); ctx.add_init_script(PRESET)
    def grok(route):
        asked.append(json.loads(route.request.post_data))
        route.fulfill(status=200, content_type="application/json", body=json.dumps(reply))
    ctx.route(GROK, grok)
    pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(500)
    return ctx, pg
def cards(pg): pg.click(".tab[data-tab=cards]"); pg.wait_for_timeout(250)
def study(pg, sid, mode="all"):
    cards(pg); pg.click(".fcsbtn[data-sec='%s'][data-mode='%s']" % (sid, mode)); pg.wait_for_timeout(250)
def nums(pg, sid):
    return pg.evaluate("""(sid)=>{var e=document.querySelector(".fcsec[data-secid='"+sid+"']");var o={};
      ['right','wrong','restudy','important','unseen','total'].forEach(function(k){o[k]=+e.querySelector('.n.'+k+' b').textContent});return o}""", sid)
def front(pg): return pg.inner_text("#fcFront")

try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox"])
    ctx, A = device(b, 1280, 800, False)

    # ---- the two word-for-word Froeb Chapter 2 cards ----
    cards(A)
    n = nums(A, CH2)
    check("Froeb Ch 2 section has 25 cards", n["total"] == 25, n)
    txt = A.evaluate("""()=>{var f=window.__fc; return window.Flash.ALL.filter(function(c){return c.topic==='book:froeb-ch02'})
      .filter(function(c){return /does-the-government|one-lesson-of-economics$/.test(c.id)}).map(function(c){return [c.f,c.b]})}""")
    want = [["Does the Government Create Wealth?",
             "Governments play a critical role in the wealth-creating process by enforcing property rights and contracts\u2014legal mechanisms that facilitate voluntary transactions. By making sure that buyers and sellers can keep the gains from trade, our legal system makes trade more likely, which contributes to America's enormous wealth-creating ability."],
            ["What is the one lesson of economics?",
             "The art of economics consists in looking not merely at the immediate but at the longer effects of any act or policy; it consists of tracing the consequences of that policy not merely for one group but for all groups."]]
    check("both new cards are word for word from the book", sorted(txt) == sorted(want), txt)
    check("no Chapter 3 section was added for them", A.evaluate("()=>window.Flash.BOOKS.find(function(b){return b.id==='froeb'}).chapters.map(function(c){return c.n}).join(',')") == "1,2,3,6")

    # ---- the Important star ----
    study(A, CH2)
    first = A.evaluate("()=>window.__fc.queue[0]")
    check("Important button starts off", A.get_attribute("#fcImp", "aria-pressed") == "false")
    A.click("#fcImp"); A.wait_for_timeout(150)
    check("tapping marks the card Important", A.get_attribute("#fcImp", "aria-pressed") == "true" and A.evaluate("()=>window.__fc.st.cards[window.__fc.queue[0]].imp") is True)
    check("Important does not flip the card", A.is_hidden("#fcBack"))
    check("Restudy is untouched by Important", A.get_attribute("#fcStar", "aria-pressed") == "false")
    A.keyboard.press("n"); A.wait_for_timeout(120); A.keyboard.press("i"); A.wait_for_timeout(150)   # keyboard: skip, then star
    second = A.evaluate("()=>window.__fc.queue[0]")
    check("the I key marks the card too", A.evaluate("()=>window.__fc.st.cards[window.__fc.queue[0]].imp") is True and second != first)
    A.click("#fcBackSec"); A.wait_for_timeout(250)
    check("the section shows 2 Important", nums(A, CH2)["important"] == 2, nums(A, CH2))
    check("Important does not change Right / Wrong / Unseen", sum(nums(A, CH2)[k] for k in ("right", "wrong", "unseen")) == 25, nums(A, CH2))
    check("All cards section counts them too", nums(A, "all")["important"] == 2, nums(A, "all"))
    A.screenshot(path=os.path.join(ROOT, "tests", "shot-v59-sections-important.png"))

    A.reload(); A.wait_for_timeout(600); cards(A)
    check("Important survives a reload", nums(A, CH2)["important"] == 2, nums(A, CH2))
    A.click(".fcsbtn[data-sec='%s'][data-mode='important']" % CH2); A.wait_for_timeout(250)
    q = A.evaluate("()=>window.__fc.queue")
    check("Study important studies only the 2 starred cards", sorted(q) == sorted([first, second]), q)
    check("the study screen names the mode", "Study important" in A.inner_text("#fcSecName"), A.inner_text("#fcSecName"))
    A.screenshot(path=os.path.join(ROOT, "tests", "shot-v59-study-important.png"))
    A.click("#fcCard"); A.wait_for_timeout(100); A.click("#fcMissed"); A.wait_for_timeout(150)
    check("a missed card still goes to the end of the queue", A.evaluate("()=>window.__fc.queue[window.__fc.queue.length-1]") == q[0] and A.evaluate("()=>window.__fc.queue.length") == 2)
    A.click("#fcImp"); A.wait_for_timeout(150)
    check("tapping again unmarks Important", A.evaluate("()=>!window.__fc.st.cards[window.__fc.queue[0]].imp"))

    # ---- Improve with Grok: say what you want, preview, save, refine ----
    study(A, CH2)
    base = A.evaluate("()=>{var c=window.Flash.ALL.filter(function(x){return x.id===window.__fc.queue[0]})[0]; return [c.f,c.b]}")
    A.click("#fcFront .fcmorebtn"); A.wait_for_timeout(150); A.click("#fcmImprove"); A.wait_for_timeout(250)
    check("Improve opens an instruction box, it does not call Grok yet", A.is_visible("#aiInstr") and not asked)
    check("the card as it stands is shown", base[0][:30] in A.inner_text("#fcAiBody"))
    check("there is a Talk button and no typing-only note", A.is_visible("#aiInstrMic") and A.is_hidden("#aiInstrHint"))
    check("a long instruction is not cut off at 300 characters", A.get_attribute("#aiInstr", "maxlength") == "600")
    long_one = "x" * 420
    A.fill("#aiInstr", long_one)
    check("the box keeps the whole long instruction", A.input_value("#aiInstr") == long_one, len(A.input_value("#aiInstr")))
    A.fill("#aiInstr", "")
    A.click("#aiGo"); A.wait_for_timeout(200)
    check("it will not send an empty instruction", not asked and "what you want changed" in A.inner_text("#fcAiBody"))
    A.click(".aichip[data-for=aiInstr]"); A.wait_for_timeout(100)
    check("a suggestion chip fills the box", A.input_value("#aiInstr") == "Make it shorter and clearer")
    A.fill("#aiInstr", ""); A.click("#aiInstrMic"); A.wait_for_timeout(150)
    A.evaluate("()=>window.__hear(['keep the textbook words but make the question harder'])"); A.wait_for_timeout(200)
    check("talking types into the box so it can be edited", A.input_value("#aiInstr") == "keep the textbook words but make the question harder", A.input_value("#aiInstr"))
    A.screenshot(path=os.path.join(ROOT, "tests", "shot-v59-improve-ask.png"))
    A.click("#aiGo"); A.wait_for_timeout(400)
    check("one call to the Grok proxy", len(asked) == 1, asked)
    sent = asked[0]["partText"] if asked else ""
    check("the instruction is sent with the card", "keep the textbook words but make the question harder" in sent and base[0] in sent and asked[0]["kind"] == "improve", sent[:300])
    # v5.9.1: the instruction must lead the request, before any card text, and must countermand the proxy's
    # standing "rewrite this card" order. In v5.9 it sat after the card, inside the block the proxy calls "the card".
    check("the instruction comes first, before the card", sent.startswith("READ THIS FIRST") and sent.index("keep the textbook words") < sent.index(base[0]), sent[:120])
    check("the instruction is marked as outranking the default card rules", "the note wins, including over any limit" in sent and "not a general rewrite" in sent, sent[:400])
    check("the card is labelled as card text, not as an instruction", "THE CARD ITSELF (everything below is card text, not an instruction)" in sent)
    check("page references and quotes are protected", "quotation marks and all" in sent and "(p. 33)" in sent)
    # v5.9.2: a note that is a question or a complaint is still feedback, and must never land in the card
    check("the note is framed as feedback, never as card text", "NOTE FROM BILL" in sent and "never text to put in the card" in sent)
    check("copying the note into the card is forbidden", "NEVER copy, quote, paraphrase or echo Bill's note" in sent)
    check("a confused note means fix the card", "the card is at fault" in sent and "spells out whatever the card assumed he already knew" in sent)
    check("Before and After are both shown", "Improved front?" in A.inner_text("#fcAiBody") and base[0][:30] in A.inner_text("#fcAiBody"))
    check("Save and Cancel are offered", A.is_visible("#aiSave") and A.is_visible("#aiDiscard"))
    A.screenshot(path=os.path.join(ROOT, "tests", "shot-v59-improve-preview.png"))
    # refine again: the second instruction works from the card Grok just produced
    reply = {"cards": [{"front": "Second pass front?", "back": "Second pass back."}]}
    A.click(".airefine summary"); A.wait_for_timeout(100)
    A.fill("#aiMore", "now make the answer one line"); A.click("#aiRefine"); A.wait_for_timeout(400)
    s2 = asked[1]["partText"]
    check("refining sends the new instruction", "now make the answer one line" in s2, s2[:200])
    check("refining builds on Grok's last version", "Improved front?" in s2, s2[:200])
    check("the preview updates", "Second pass front?" in A.inner_text("#fcAiBody"))
    A.click("#aiSave"); A.wait_for_timeout(300)
    check("Save replaces the card on the device", front(A).endswith("Second pass front?"), front(A))
    A.click("#fcCard"); A.wait_for_timeout(120)
    check("the back is replaced too", "Second pass back." in A.inner_text("#fcBack"), A.inner_text("#fcBack"))
    A.click("#fcFront .fcmorebtn"); A.wait_for_timeout(150); A.click("#fcmReset"); A.wait_for_timeout(250)
    check("Reset to original still brings the real card back", base[0] in front(A), front(A))

    # ---- v5.9.2: Grok parroting the note back is caught, retried once, then Save is blocked ----
    NOTE = "begin with what decision? im confused"
    A.click("#fcFront .fcmorebtn"); A.wait_for_timeout(150); A.click("#fcmImprove"); A.wait_for_timeout(250)
    card_now = A.evaluate("()=>{var c=window.Flash.ALL.filter(function(x){return x.id===window.__fc.queue[0]})[0]; return [c.f,c.b]}")
    check("the echo check spots the note inside a card", A.evaluate("(n)=>window.__aiEchoes(n, 'begin with what decision?  im confused ' + 'the rest of the answer')", NOTE) is True)
    check("the echo check does not fire on an ordinary improvement", A.evaluate("(n)=>window.__aiEchoes(n, 'Start with the decision: keep or drop the product.')", NOTE) is False)
    check("a one-word note is never treated as an echo", A.evaluate("()=>window.__aiEchoes('shorter', 'Make the answer shorter to read.')") is False)
    n0 = len(asked)
    reply = {"cards": [{"front": card_now[0], "back": NOTE + "\n\n" + card_now[1]}]}   # Grok parrots the note, as it did for Bill
    A.fill("#aiInstr", NOTE); A.click("#aiGo"); A.wait_for_timeout(900)
    check("a parroted answer is retried once, automatically", len(asked) - n0 == 2, len(asked) - n0)
    check("the retry tells Grok it broke the rule", "YOUR LAST ANSWER BROKE RULE 1" in asked[-1]["partText"] and "YOUR LAST ANSWER" not in asked[-2]["partText"])
    check("the warning is shown when it parrots twice", A.is_visible(".aiecho") and "copied your note into the card" in A.inner_text(".aiecho"))
    check("Save is blocked", A.is_disabled("#aiSave"))
    before_over = A.evaluate("()=>Object.keys(window.__myc().over).length")
    A.evaluate("()=>document.getElementById('aiSave').click()"); A.wait_for_timeout(200)
    check("even a forced click cannot save a parroted card", A.evaluate("()=>Object.keys(window.__myc().over).length") == before_over)
    A.screenshot(path=os.path.join(ROOT, "tests", "shot-v592-echo-blocked.png"))
    reply = {"cards": [{"front": card_now[0], "back": "Start with the decision: keep the product or drop it. " + card_now[1]}]}
    A.click("#aiAgain"); A.wait_for_timeout(600)
    check("a clean answer clears the warning and re-enables Save", A.query_selector(".aiecho") is None and not A.is_disabled("#aiSave"))
    A.click("#aiDiscard"); A.wait_for_timeout(200)
    reply = {"cards": [{"front": "Improved front?", "back": "Improved back."}]}

    # ---- the same box on Expand and Create ----
    A.click("#fcFront .fcmorebtn"); A.wait_for_timeout(150); A.click("#fcmExpand"); A.wait_for_timeout(250)
    check("Expand asks what the new cards should cover", A.is_visible("#aiInstr") and A.is_visible("#aiInstrMic"))
    A.click("#aiGo"); A.wait_for_timeout(400)
    check("Expand sends with no instruction (it is optional)", asked[-1]["kind"] == "expand" and "WHAT BILL ASKED FOR" not in asked[-1]["partText"])
    A.click("#fcAiClose"); A.wait_for_timeout(150)
    A.click("#fcFront .fcmorebtn"); A.wait_for_timeout(150); A.click("#fcmCreate"); A.wait_for_timeout(250)
    check("Create has the Talk button too", A.is_visible("#aiPromptMic"))
    A.click("#aiPromptMic"); A.wait_for_timeout(150); A.evaluate("()=>window.__hear(['a card about working capital'])"); A.wait_for_timeout(200)
    check("talking fills the Create box", A.input_value("#aiPrompt") == "a card about working capital", A.input_value("#aiPrompt"))
    A.click("#fcAiClose"); A.wait_for_timeout(150)
    check("no page errors", not A.errs, A.errs)

    # ---- phone, and a browser with no speech recognition ----
    cb, B = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True), None
    cb.add_init_script(PRESET)
    cb.add_init_script("delete window.SpeechRecognition; delete window.webkitSpeechRecognition;")
    cb.route(GROK, lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(reply)))
    B = cb.new_page(); B.errs = []; B.on("pageerror", lambda e: B.errs.append(str(e))); B.goto(URL); B.wait_for_timeout(500)
    study(B, CH2)
    box = B.evaluate("()=>{var r=document.getElementById('fcImp').getBoundingClientRect(); return [Math.round(r.width),Math.round(r.height)]}")
    check("phone: the Important button is a big tap target", box[1] >= 44, box)
    B.click("#fcFront .fcmorebtn"); B.wait_for_timeout(150); B.click("#fcmImprove"); B.wait_for_timeout(250)
    check("no speech recognition: no mic button, and it says to type", B.query_selector("#aiInstrMic") is None and "not available" in B.inner_text("#aiInstrHint"))
    B.fill("#aiInstr", "shorter please"); B.click("#aiGo"); B.wait_for_timeout(400)
    check("typing still works as the fallback", "Second pass front?" in B.inner_text("#fcAiBody") or "Improved front?" in B.inner_text("#fcAiBody"))
    B.screenshot(path=os.path.join(ROOT, "tests", "shot-v59-phone-improve.png"))
    B.click("#fcAiClose"); B.wait_for_timeout(150)
    B.click("#fcBackSec"); B.wait_for_timeout(250)
    B.screenshot(path=os.path.join(ROOT, "tests", "shot-v59-phone-sections.png"))
    check("no page errors on the phone", not B.errs, B.errs)
    b.close()
finally:
    srv.shutdown()
print("FAILED: " + (", ".join(fails) if fails else "none")); sys.exit(1 if fails else 0)
