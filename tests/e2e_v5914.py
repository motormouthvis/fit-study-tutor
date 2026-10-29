"""v5.9.14: the card helper must never end a voice turn silently on a phone."""
import sys
from playwright.sync_api import sync_playwright
import android_helpers as K

fails = []
def check(name, ok):
    print(("PASS " if ok else "FAIL ") + name)
    if not ok: fails.append(name)

with sync_playwright() as p:
    # 1. improve by voice: the note is sent and the sheet shows it (the whole phone flow, Android recognizer, soft keyboard height)
    b, A = K.start(p)
    K.say(A, "improve this card")
    check("pending prompt is showing", "What should change" in A.inner_text("#cpStatus"))
    check("phone: soft keyboard is not forced open in the pending step", A.evaluate("document.activeElement && document.activeElement.id") != "cpType")
    A.set_viewport_size({"width": 412, "height": 520}); A.wait_for_timeout(300)
    K.say(A, "make the question harder")
    A.wait_for_timeout(600)
    check("note reaches the Worker", len(K.asked) == 1 and "make the question harder" in str(K.asked[0]))
    check("panel closed, AI sheet open", (not A.is_visible("#cardPanel .sheetbox")) and A.is_visible("#fcAi .sheetbox"))
    check("sheet shows what was asked and the result", "make the question harder" in A.inner_text("#fcAi") and "AFTER" in A.inner_text("#fcAi"))
    check("the last event is logged for diagnosis", "card helper" in A.evaluate("document.getElementById('dbgLine').textContent"))
    b.close()
    # 2. the card goes away while the helper waits for the note: say so, never close silently
    b, A = K.start(p)
    K.say(A, "improve this card")
    A.evaluate("document.querySelector('.tab[data-tab=cards]').click()"); A.wait_for_timeout(300)
    K.asked.clear()
    A.evaluate("window.__cp.handle('make the question harder')"); A.wait_for_timeout(400)
    txt = A.evaluate("document.getElementById('cpStatus').textContent") 
    check("no card: a visible explanation (not silence)", "no longer showing" in txt or "No card" in txt)
    check("no card: nothing was sent", len(K.asked) == 0)
    b.close()
print("FAILED:", fails or "none")
sys.exit(1 if fails else 0)
