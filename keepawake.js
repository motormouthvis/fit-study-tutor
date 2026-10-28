/* keepawake.js (v5.9.12): keeps the phone screen on. No dependencies.
   1) Screen Wake Lock API when the browser has it; it is re-requested every time the browser lets go of it
      (tab hidden then visible, focus, pageshow, resume, first tap, audio starting, a 30 s safety check).
   2) NoSleep-style fallback: a 1-pixel, muted, looping, silent video that is played after a tap. Used when the
      Wake Lock API does not exist, or when it refused (the video is a second way to hold the screen).
   Works in the browser (window.KeepAwake) and in node tests (module.exports). All browser objects are passed in. */
(function (root) {
  "use strict";
  var WEBM = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIrEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggIV7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAn0AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIStio17J1wWycgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QdzWUA4JCwgRC6gRCagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAzc3PWY8CLY8WIStio17J1wWxnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAyLjAwMDAwMDAwMAAfQ7Z17eeBAKOjgQAAgBACAJ0BKhAAEAAARwiFhYiFhIgCAgAMDWAA/v+rUICjlYEB9ACxAQABEBAAGAAYWC/0AAgAAKOVgQPoALEBAAEQEAAYABhYL/QACAAAo5WBBdwAsQEAARAQABgAGFgv9AAIAAAcU7trkbuPs4EAt4r3gQHxggGj8IED";
  var MP4 = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANgbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAot0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAABAAAABAAAAAAIDbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABrm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAW5zdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADABA8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAukAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAEAAAgAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAKGN0dHMAAAAAAAAAAwAAAAEAAEAAAAAAAQAAgAAAAAACAAAgAAAAABxzdHNjAAAAAAAAAAEAAAABAAAABAAAAAEAAAAkc3RzegAAAAAAAAAAAAAABAAAAsUAAAAMAAAADAAAAAwAAAAUc3RjbwAAAAAAAAABAAADkAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjEuNy4xMDMAAAAIZnJlZQAAAvFtZGF0AAACrQYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTIgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAQZYiEABX//vfJ78Cm69vfgQAAAAhBmiNsQS/+4AAAAAhBnkF4gn+cgQAAAAgBnmJqQS+hgA==";

  function explain(err) {
    var n = err && err.name;
    if (n === "NotAllowedError") return "Your phone refused to keep the screen on. Battery Saver or a low battery usually causes this. Turn Battery Saver off, then tap the screen once.";
    if (n === "SecurityError") return "This page is not secure, so the browser will not keep the screen on.";
    return "The browser could not keep the screen on" + (err && err.message ? " (" + err.message + ")" : "") + ".";
  }

  // o: { nav, doc, win, getEnabled(), onChange(state), safetyMs (0 = off), now() }
  function create(o) {
    var nav = o.nav, doc = o.doc, win = o.win, now = o.now || function () { return Date.now(); };
    var sentinel = null, pending = null, video = null, mode = "none", note = "", needTap = false, recent = [];
    function wanted() { return !!(o.getEnabled && o.getEnabled()); }
    function visible() { return !doc || doc.visibilityState !== "hidden"; }
    function hasLock() { return !!(nav && nav.wakeLock && typeof nav.wakeLock.request === "function"); }
    function state() { return { enabled: wanted(), active: mode !== "none", mode: mode, needTap: needTap, note: note, supported: hasLock() || !!(doc && doc.createElement) }; }
    function emit() { if (o.onChange) { try { o.onChange(state()); } catch (e) {} } }

    function stopVideo() { if (video) { try { video.pause(); } catch (e) {} } if (mode === "video") mode = "none"; }
    function ensureVideo() {
      if (video || !doc || !doc.createElement) return video;
      var v = doc.createElement("video");
      v.setAttribute("playsinline", ""); v.setAttribute("muted", ""); v.setAttribute("loop", ""); v.setAttribute("aria-hidden", "true"); v.setAttribute("tabindex", "-1");
      v.muted = true; v.loop = true; v.playsInline = true; v.title = "";
      if (v.style) v.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
      [[WEBM, "video/webm"], [MP4, "video/mp4"]].forEach(function (p) { var s = doc.createElement("source"); s.src = p[0]; s.type = p[1]; v.appendChild(s); });
      v.addEventListener("pause", function () { if (mode === "video") { mode = "none"; emit(); } });
      (doc.body || doc.documentElement).appendChild(v);
      video = v; return v;
    }
    function startVideo() {
      var v = ensureVideo(); if (!v) return Promise.resolve();
      var p; try { p = v.play(); } catch (e) { p = Promise.reject(e); }
      return Promise.resolve(p).then(function () {
        if (!wanted()) { stopVideo(); return; }
        if (mode !== "wakelock") { mode = "video"; needTap = false; if (!note || /tap/i.test(note)) note = ""; emit(); }
      }, function () {
        if (mode !== "wakelock") { mode = "none"; needTap = true; note = "Tap the screen once and I will keep it on."; emit(); }
      });
    }

    function acquire() {
      if (!wanted()) { release(); return Promise.resolve(state()); }
      if (!visible()) return Promise.resolve(state());
      if (sentinel) return Promise.resolve(state());
      if (!hasLock()) return startVideo().then(state);
      if (pending) return pending;
      var req; try { req = nav.wakeLock.request("screen"); } catch (e) { req = Promise.reject(e); }
      pending = Promise.resolve(req).then(function (l) {
        pending = null;
        if (!wanted()) { try { l.release(); } catch (e) {} return state(); }
        sentinel = l; mode = "wakelock"; note = ""; needTap = false; stopVideo(); mode = "wakelock";
        l.addEventListener("release", function () {
          if (sentinel !== l) return;
          sentinel = null; if (mode === "wakelock") mode = "none"; emit();
          // the browser (or Android) let go of it: take it back right away, but never in a tight loop
          var t = now(); recent = recent.filter(function (x) { return t - x < 5000; });
          if (wanted() && visible() && recent.length < 3) { recent.push(t); acquire(); }
        });
        emit(); return state();
      }, function (err) {
        pending = null; note = explain(err); needTap = err && err.name === "NotAllowedError";
        if (mode === "wakelock") mode = "none";
        emit();
        return startVideo().then(function () { if (mode === "video") { note = ""; needTap = false; emit(); } return state(); });
      });
      return pending;
    }
    function release() {
      var l = sentinel; sentinel = null; if (l) { try { l.release(); } catch (e) {} }
      stopVideo(); mode = "none"; needTap = false; note = ""; emit();
    }
    // setEnabled: call after the user flips the switch
    function sync() { return wanted() ? acquire() : (release(), Promise.resolve(state())); }

    function onVis() { if (visible()) acquire(); }
    function onGesture() { if (wanted() && visible() && mode === "none") acquire(); }
    if (doc && doc.addEventListener) {
      doc.addEventListener("visibilitychange", onVis);
      doc.addEventListener("resume", onVis);
      ["pointerdown", "touchend", "click", "keydown"].forEach(function (n) { doc.addEventListener(n, onGesture, true); });
    }
    if (win && win.addEventListener) { win.addEventListener("focus", onVis); win.addEventListener("pageshow", onVis); }
    var timer = null, ms = o.safetyMs === undefined ? 30000 : o.safetyMs;
    if (ms > 0 && win && win.setInterval) timer = win.setInterval(function () { if (wanted() && visible() && mode === "none") acquire(); }, ms);
    return { acquire: acquire, release: release, sync: sync, kick: function () { return acquire(); }, state: state, explain: explain, _stop: function () { if (timer) win.clearInterval(timer); } };
  }

  function label(st) {
    if (!st.enabled) return "Always on: Off";
    if (st.active) return "Always on: On";
    return st.needTap ? "Always on: tap screen" : "Always on: On (waiting)";
  }
  var api = { create: create, label: label, explain: explain };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.KeepAwake = api;
})(typeof window !== "undefined" ? window : this);
