# A speech recognizer that behaves like Chrome on Android: start() -> onstart/onaudiostart; interim results while he talks;
# the FINAL result is only delivered after a pause (or stop()), and stop() really fires onend (abort() fires onerror 'aborted' then onend).
ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
ANDROID_REC = r"""
(() => {
  window.__recStarts = 0; let cur = null;
  class R { constructor(){ this.onresult=null; this.onend=null; this.onstart=null; this.onerror=null; this.onaudiostart=null; this._t=''; this._ended=false; }
    start(){ window.__recStarts++; cur=this; setTimeout(()=>{ this.onstart&&this.onstart(); this.onaudiostart&&this.onaudiostart(); },5); }
    _end(){ if(this._ended) return; this._ended=true; if(cur===this) cur=null; setTimeout(()=>this.onend&&this.onend(),10); }
    stop(){ if(this._ended) return; const t=this._t; this._t=''; if(t){ this._emit(t,true); } this._end(); }
    abort(){ if(this._ended) return; this._t=''; this.onerror&&this.onerror({error:'aborted'}); this._end(); }
    _emit(t, fin){ const res=[{transcript:t,confidence:.9}]; res.isFinal=fin; this.onresult&&this.onresult({resultIndex:0, results:[res]}); } }
  window.webkitSpeechRecognition = R; window.SpeechRecognition = R;
  // __say(text, mode): mode 'final' = interim words, then final result, then end; 'stopfinal' = interim only, final arrives when stop() is called
  window.__recActive = () => !!cur;
  window.__say = (t, mode) => { const r=cur; if(!r) return false; r._emit(t.split(' ').slice(0,2).join(' '), false); r._emit(t, false);
    if(mode==='stopfinal'){ r._t=t; return true; } r._emit(t,true); r._end(); return true; };
  Object.defineProperty(navigator,'wakeLock',{value:{request(){ return Promise.resolve({release(){}, addEventListener(){}}); }}});
})();
"""
