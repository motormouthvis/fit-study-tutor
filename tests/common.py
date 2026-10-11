import http.server, socketserver, threading, functools, os
def serve(root):
    H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    H.log_message = lambda *a, **k: None
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]

# fake microphone (speech recognition) that tests can speak into
FAKE_REC = r"""
(() => {
  window.__recStarts = 0; let cur = null;
  class R { constructor(){ this.onresult=null; this.onend=null; this.onstart=null; this.onerror=null; }
    start(){ window.__recStarts++; cur=this; setTimeout(()=>this.onstart&&this.onstart(),5); }
    abort(){ if(cur===this) cur=null; } stop(){ this.abort(); } }
  window.webkitSpeechRecognition = R; window.SpeechRecognition = R;
  window.__hear = (alts, fin=true, end=true) => { if(!cur) return false; const r = cur;
    const res = alts.map(t=>({transcript:t,confidence:.9})); res.isFinal = fin;
    r.onresult && r.onresult({ resultIndex:0, results:[res] });
    if (end && fin) { cur = null; setTimeout(()=>r.onend&&r.onend(), 5); } return true; };
  window.__recActive = () => !!cur;
  Object.defineProperty(navigator,'wakeLock',{value:{request(){ return Promise.resolve({release(){}, addEventListener(){}}); }}});
})();
"""
# speechSynthesis the way Android Chrome was observed to behave: speak() "finishes" (or errors) immediately
def BROKEN_TTS(mode):
    return r"""
(() => {
  window.__ttsCalls = 0; class U { constructor(t){ this.text=t; } } window.SpeechSynthesisUtterance = U;
  const synth = { speaking:false, paused:false, getVoices(){ return []; }, addEventListener(){}, cancel(){}, pause(){}, resume(){},
    speak(u){ window.__ttsCalls++; setTimeout(()=>{ MODE }, 0); } };
  Object.defineProperty(window,'speechSynthesis',{value:synth});
})();
""".replace("MODE", "u.onerror && u.onerror({error:'synthesis-failed'});" if mode == "error" else "u.onend && u.onend();")
