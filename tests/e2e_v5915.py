"""v5.9.15: discuss a card (typed or spoken, on phone and computer; the button stays visible where the microphone does not work).
Grok (the Ask Worker) is mocked at the network layer, speechSynthesis and the recognizer are fakes: no real API calls, no money.
Run: python3 tests/e2e_v5915.py"""
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
TTS = r"""(() => { window.__spoken = []; class U { constructor(t){ this.text=t; } } window.SpeechSynthesisUtterance = U;
  const synth = { speaking:false, paused:false, getVoices(){ return []; }, addEventListener(){}, cancel(){}, pause(){}, resume(){},
    speak(u){ window.__spoken.push(u.text); setTimeout(()=>{ u.onstart && u.onstart(); u.onend && u.onend(); }, 20); } };
  Object.defineProperty(window,'speechSynthesis',{value:synth}); })();"""
NOSR = "delete window.SpeechRecognition; delete window.webkitSpeechRecognition;"
CH2 = "book:froeb-ch02"
class Net:
    def __init__(s): s.chat = []; s.json = []; s.mode = "ok"; s.card_reply = {"cards": [{"front": "Improved front?", "back": "Improved back."}]}
net = Net()
def sse(text): return "".join("data: " + json.dumps({"choices": [{"delta": {"content": w}}]}) + "\n\n" for w in [text[:len(text)//2], text[len(text)//2:]]) + "data: [DONE]\n\n"
def grok(route):
    body = json.loads(route.request.post_data)
    if body.get("kind") in ("improve", "expand", "create"):
        net.json.append(body); return route.fulfill(status=200, content_type="application/json", body=json.dumps(net.card_reply))
    net.chat.append(body)
    if net.mode == "429": return route.fulfill(status=429, content_type="application/json", body=json.dumps({"error": "rate_limited", "scope": "hour", "retryAfter": 1800}))
    n = len(net.chat)
    route.fulfill(status=200, content_type="text/event-stream", body=sse("Reply number %d. The fixed lease cost is already spent, so only marginal cost counts." % n))
def device(b, w, h, mob, rec=FAKE_REC, extra=None, ctx=None):
    ctx = ctx or b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob)
    ctx.add_init_script(rec); ctx.add_init_script(PRESET); ctx.add_init_script(TTS)
    if extra: ctx.add_init_script(extra)
    ctx.route("**/ask", grok)
    pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.click(".tab[data-tab=cards]"); pg.wait_for_timeout(250)
    pg.click(".fcsbtn[data-sec='%s'][data-mode='all']" % CH2); pg.wait_for_timeout(250)
    return ctx, pg
def helper(pg): pg.evaluate("window.__cp.open()"); pg.wait_for_timeout(150)
def st(pg): return pg.evaluate("window.__cp.state()")
def typeit(pg, t): pg.fill("#cpType", t); pg.click("#cpGo"); pg.wait_for_timeout(500)
def spoken(pg): return pg.evaluate("window.__spoken")
def hear(pg, t): pg.click("#cpTalk"); pg.wait_for_function("window.__recActive()", timeout=3000); pg.evaluate("(t)=>window.__hear([t])", t); pg.wait_for_timeout(600)

try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox"])
    for (w, h, mob, tag) in [(1280, 800, False, "desktop"), (390, 844, True, "phone")]:
        net.chat.clear(); net.json.clear(); net.mode = "ok"
        ctx, A = device(b, w, h, mob); helper(A)
        check(tag + ": the helper has a Discuss this card button", A.is_visible("#fcmDiscuss"))
        n0 = len(net.chat)
        A.click("#fcmDiscuss"); A.wait_for_timeout(250)
        check(tag + ": opening the discussion shows the thread, nothing is sent yet (no spend)", A.is_visible("#cpDisc") and st(A)["disc"] and len(net.chat) == n0)
        check(tag + ": the main card buttons are tucked away while discussing, Back restores them", not A.is_visible("#fcmExplain"))
        # typed turn: reply shown + spoken, payload carries the card and the turn
        typeit(A, "why does the lease not count in the shutdown price")
        log = A.inner_text("#dsLog")
        check(tag + ": my typed turn and Grok's reply are in the thread", "why does the lease not count" in log and "Reply number 1" in log, log[:200])
        check(tag + ": Grok's reply is spoken", len(spoken(A)) == 1 and "Reply number 1" in spoken(A)[0], spoken(A))
        pl = net.chat[-1]
        check(tag + ": the payload reuses the Ask format with the card text and the turn", pl["kind"] == "card" and "Front:" in pl["partText"] and pl["messages"][-1] == {"role": "user", "content": "why does the lease not count in the shutdown price"} and len(json.dumps(pl)) < 40000)
        typeit(A, "so the five dollars is all that matters")
        pl = net.chat[-1]
        check(tag + ": the next turn sends the earlier turns too (user, assistant, user)", [m["role"] for m in pl["messages"]] == ["user", "assistant", "user"], pl["messages"])
        # mute
        A.click("#dsMute"); A.wait_for_timeout(150); k = len(spoken(A))
        typeit(A, "and what about startup")
        check(tag + ": muted: the reply shows as text but is not spoken", "Reply number 3" in A.inner_text("#dsLog") and len(spoken(A)) == k)
        check(tag + ": mute is remembered", A.evaluate("localStorage.getItem('tutor.v1.dsmute')") == "true" and st(A)["mute"])
        A.reload(); A.wait_for_timeout(500); A.click(".tab[data-tab=cards]"); A.wait_for_timeout(200); A.click(".fcsbtn[data-sec='%s'][data-mode='all']" % CH2); A.wait_for_timeout(250); helper(A)
        A.click("#fcmDiscuss"); A.wait_for_timeout(200)
        check(tag + ": still muted after a reload", "muted" in A.inner_text("#dsMute"))
        A.click("#dsMute"); A.wait_for_timeout(100)
        check(tag + ": unmute works", "on" in A.inner_text("#dsMute") and A.evaluate("localStorage.getItem('tutor.v1.dsmute')") == "false")
        # voice turn through the mock recognizer: one tap = one listen
        s0 = A.evaluate("window.__recStarts"); c0 = len(net.chat)
        hear(A, "what is a shutdown price")
        check(tag + ": a voice turn is sent as a chat turn and answered", len(net.chat) == c0 + 1 and net.chat[-1]["messages"][-1]["content"] == "what is a shutdown price" and "Reply number" in A.inner_text("#dsLog"))
        check(tag + ": one tap made one listen (no restart without Keep talking)", A.evaluate("window.__recStarts") == s0 + 1)
        # Keep talking: listens again after the spoken reply
        A.click("#dsKeep"); A.wait_for_timeout(300)
        check(tag + ": Keep talking on starts a listen", st(A)["keep"] and A.evaluate("window.__recActive()"))
        s1 = A.evaluate("window.__recStarts"); A.evaluate("(t)=>window.__hear([t])", "and what about the lease"); A.wait_for_timeout(900)
        check(tag + ": after the reply is spoken it listens again", A.evaluate("window.__recStarts") == s1 + 1 and A.evaluate("window.__recActive()"), A.evaluate("window.__recStarts"))
        A.click("#dsKeep"); A.wait_for_timeout(200)
        check(tag + ": Keep talking off stops listening", not st(A)["keep"] and not A.evaluate("window.__recActive()"))
        # improve from the discussion: his words are the note, Save stays blocked if they come back
        net.card_reply = {"cards": [{"front": "Why is the lease ignored?", "back": "Because and what about the lease is the question, and it is sunk in the short run."}]}
        j0 = len(net.json); A.fill("#cpType", ""); A.evaluate("window.__cp.handle('improve this card, add an example')"); A.wait_for_timeout(900)
        check(tag + ": improve from the discussion runs the existing improve flow", len(net.json) == j0 + 2 or len(net.json) == j0 + 1, len(net.json) - j0)
        body = net.json[-1]
        check(tag + ": the discussion is passed as the note, with his words and the command words", "NOTE FROM BILL" in body["partText"] and "what is a shutdown price" in body["partText"] and "add an example" in body["partText"], body["partText"][:300])
        check(tag + ": Grok's reply text is not in the note, only as context", "CONTEXT:" in body["partText"])
        check(tag + ": his words came back in the new card: Save is blocked", A.is_visible("#fcAi .sheetbox") and A.is_disabled("#aiSave"), A.inner_text("#fcAi")[:200])
        A.click("#aiDiscard") if A.is_visible("#aiDiscard") else None; A.wait_for_timeout(200)
        # clean card: Save allowed
        helper(A); A.click("#fcmDiscuss"); A.wait_for_timeout(150)
        net.card_reply = {"cards": [{"front": "Why is a sunk lease ignored in the shutdown price?", "back": "The lease is paid either way, so only the avoidable cost, marginal cost, matters."}]}
        A.evaluate("window.__cp.handle('make another card like it')"); A.wait_for_timeout(900)
        check(tag + ": make another from the discussion uses the expand flow with the note", net.json[-1]["kind"] == "expand" and "NOTE FROM BILL" in net.json[-1]["partText"])
        check(tag + ": a clean result can be saved", not A.is_disabled("#aiSave") if A.is_visible("#aiSave") else A.is_visible("#fcAi .sheetbox"))
        ctx.close()
        check(tag + ": no page errors", not A.errs, A.errs)
    # questions that contain 'change' stay in the conversation (not mistaken for Improve)
    net.chat.clear(); net.json.clear()
    ctx, A = device(b, 1280, 800, False); helper(A); A.click("#fcmDiscuss"); A.wait_for_timeout(150)
    A.evaluate("window.__cp.handle('why would the price change if the lease is fixed')"); A.wait_for_timeout(500)
    check("a question with 'change' in it is a chat turn, not Improve", len(net.chat) == 1 and not net.json and A.is_visible("#cpDisc"))
    A.evaluate("window.__cp.handle('create a new card about working capital')"); A.wait_for_timeout(700)
    check("create a new card from inside the thread runs Create with the topic as the prompt", net.json and net.json[-1]["kind"] == "create" and "working capital" in net.json[-1]["prompt"], net.json[-1:] )
    ctx.close()
    # server limit: plain message, words go back in the box, buttons still work
    net.mode = "429"; ctx, A = device(b, 390, 844, True); helper(A); A.click("#fcmDiscuss"); A.wait_for_timeout(150)
    typeit(A, "does this still work")
    m = A.inner_text("#dsLog")
    check("429 from the Worker: plain message, nothing broken", "lot of Grok questions" in m and A.input_value("#cpType") == "does this still work" and A.is_visible("#cpDisc"), m[:200])
    ctx.close(); net.mode = "ok"
    # no microphone (the Cybertruck): the button is still there, voice says so, typing still works
    for (w, h, mob, tag) in [(1280, 800, False, "no-mic desktop-size"), (390, 844, True, "no-mic phone-size")]:
        net.chat.clear()
        ctx, A = device(b, w, h, mob, rec=NOSR); helper(A)
        check(tag + ": the Discuss button is still visible", A.is_visible("#fcmDiscuss") and A.is_enabled("#fcmDiscuss"))
        check(tag + ": the card button is still on the card", A.is_visible("#fcFront .fcinfo"))
        A.click("#fcmDiscuss"); A.wait_for_timeout(150)
        check(tag + ": voice is plainly marked unavailable", "not available" in A.inner_text("#cpTalk").lower() and A.is_disabled("#cpTalk"))
        A.click("#dsKeep"); A.wait_for_timeout(150)
        check(tag + ": Keep talking says it needs voice and stays off", not st(A)["keep"] and "not available" in A.inner_text("#cpStatus"))
        typeit(A, "typed question without a microphone")
        check(tag + ": typed discussion still works", "Reply number 1" in A.inner_text("#dsLog") and len(net.chat) == 1)
        ctx.close()
    # voice phrases open it
    ctx, A = device(b, 390, 844, True); helper(A)
    hear(A, "let's talk about this card"); check("voice phrase opens the discussion", st(A)["disc"] and A.is_visible("#cpDisc"))
    hear(A, "done"); check("'done' leaves the discussion, back to the helper", not st(A)["disc"] and A.is_visible("#fcmExplain"))
    A.evaluate("window.__cp.handle('talk about this card, why is it six dollars')"); A.wait_for_timeout(600)
    check("a question spoken with the phrase is sent as the first turn", st(A)["disc"] and net.chat[-1]["messages"][-1]["content"] == "why is it six dollars")
    ctx.close(); b.close()
except Exception as e:
    import traceback; traceback.print_exc(); fails.append("exception: %s" % e)
print("FAILED:", fails or "none")
sys.exit(1 if fails else 0)
