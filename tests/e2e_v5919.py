# v5.9.19: wake lock is held on the flashcards screen (no voice session), and re-acquired after release.
import sys, threading, http.server, socketserver, functools, os
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H=functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
H.log_message=lambda *a: None
srv=socketserver.TCPServer(("127.0.0.1",0),H); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
INIT="""(()=>{window.__wake=0;window.__locks=[];Object.defineProperty(navigator,'wakeLock',{value:{request(){window.__wake++;const l={released:false,_h:[],addEventListener(e,f){this._h.push(f)},release(){this.released=true;this._h.forEach(f=>f())}};window.__locks.push(l);return Promise.resolve(l);}}});})();"""
ok=True
with sync_playwright() as p:
  b=p.chromium.launch(executable_path="/usr/bin/google-chrome",headless=True,args=["--no-sandbox"]); pg=b.new_page(); pg.add_init_script(INIT)
  pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(800)
  n=pg.evaluate("__wake"); print("acquired on load without session:", n); ok&= n>=1
  pg.evaluate("__locks[__locks.length-1].release()"); pg.wait_for_timeout(100)
  pg.mouse.click(5,5); pg.wait_for_timeout(300)
  m=pg.evaluate("__wake"); print("re-acquired after release on tap:", m); ok&= m>n
  b.close()
srv.shutdown(); print("PASS" if ok else "FAIL"); sys.exit(0 if ok else 1)
