# MBA Study Tutor (Bill's hands-free voice tutor) - v3

**v3 change (simplified screen):** ONE main screen (Learn) with a big PLAY/PAUSE button, back 10 s, forward 10 s, a speed chip (tap to cycle 0.8x, 1x, 1.25x, 1.5x), a progress bar for the current clip, overall progress (topic x of 24, part y of z, topics ticked off, time left), a small Mute toggle and the tap-to-jump topic list. Everything else is behind the **Menu** button (previous/next topic, repeat, explain simpler, quiz me on this, stop session, restart microphone, test sound, gym mode, answer log and export, settings, voice commands and help, About and diagnostics). Three tabs only: Learn, Quiz, My Stats. The status banner is one slim line. If speech recognition keeps failing (Chrome reports a "network" error, as on Bill's phone) the app stops retrying after three tries, shows one calm line "Voice commands unavailable (no connection) - use the buttons" and keeps everything else working; Menu > Restart microphone (or coming back online) tries again.

**v2 change:** sound now comes from pre-recorded MP3 clips (edge-tts voice en-US-AndrewNeural) played through a normal `<audio>` element, not the phone's text-to-speech (which silently failed on Bill's Android and made lessons race ahead). A lesson only moves on after a clip *really* finished playing; any failure stops with a red "I couldn't play sound. Tap TEST SOUND" message.

A single web page (no server, no accounts, no cost) that quizzes you by voice, teaches you out loud, logs every answer on your phone, and finds your weak spots.
Covers BUS 5601 (accounting and finance basics) and BUS 5421 (managerial economics).

## Files
- `index.html`, `style.css`, `app.js`: the screens and the phone glue (speech, mic, screen-awake)
- `engine.js`: all the logic (grading, mute, commands, adaptive question choice, lessons). Tested.
- `questions.js`: 217 questions in 24 topics + 18 "endless" number-problem generators, and the topic lessons
- `lessons-data.js`: the Episode 1 audio script cut into short spoken lesson parts (made by `build_lessons.py`)
- `manifest.webmanifest`, `sw.js`, `icons/`: lets Chrome install it as an app and run it offline
- `audio/` (1,536 small MP3 clips, ~31 MB) and `audio-manifest.js` (clip key -> length): every fixed sentence the tutor can say. Built by `tools/build-audio-plan.js` (lists every sentence by running the real tutor) and `tools/gen_audio.py` (edge-tts, 32 kbps mono). Clip file name = `clipKey(text)` from `engine.js`.
- `tests/`: `engine.test.js` (63 logic tests incl. audio-coverage checks), `e2e.py` + `e2e_audio.py` + `e2e_v3.py` (simple-screen, menu, +/-10 s, mic-network-error tests; headless Chrome, real audio playback, fake microphone), `repro_v1_bug.py` (reproduces the v1 bug on the old commit)

## How to use it (on the phone, in Chrome)
1. Open the web address once (needs internet the first time). Chrome will ask for the microphone: tap Allow.
2. Menu (three dots) > Add to Home screen / Install app. After that it opens like an app and the questions work offline.
3. Plug the phone in, put in earbuds, tap the big green **PLAY** on the Learn screen (or open the Quiz tab and tap **START QUIZ**). The first time you get a **sound check** (beep, then my voice, then "Did you hear that? Yes / No"). Keep the screen on. **Test sound** is in the Menu (and appears in the red message if sound fails). It is also on the screen if something seems silent. The tiny grey line at the bottom (tap it) is a diagnostics line: last event, audio state, microphone state, last phrase heard.
4. Answer out loud: "B", or "forty percent", or "balance sheet". For "explain" questions, talk for as long as you like, then say "done".
5. **Mute:** tap the big **PAUSE** (stops the audio instantly) or the small **Mute** toggle, or say "mute" / "pause" (also catches "mood", "moot", "paws"). I ignore everything you say, including what you say to other people. **Unmute:** say "resume tutor" (changeable in Settings) or just "unmute", or tap the green UNMUTE. **PAUSE AUDIO** (yellow) only freezes the audio in place; tap RESUME or say "resume".
6. **Gym mode** (Menu) makes the screen nearly black with one huge MUTE/UNMUTE button.

### Voice commands
mute / pause, resume tutor, stop, repeat, skip, next, explain, explain differently (or simpler), I don't know, done, I was right / I was wrong, A B C D,
teach me [topic], back, repeat that topic, previous topic, next topic, slower, faster, quiz me (on accounting / economics / my weak areas / a topic), how am I doing, help.
(The Help tab in the app lists them all.)

### Lessons
The Learn screen lists the 24 topics. Tap one (or say "teach me balance sheet"). Each topic plays in short parts straight from your audio script. Say "back" to hear the last part again, "repeat that topic" to restart, "previous topic" / "next topic" to move, "slower", and "explain simpler" for plain-words versions. When a topic finishes I wait a few seconds and move on; say "quiz me" to practice that topic.

### Your answers
Every answer is saved on the phone (question, topic, subject, what you said, right/wrong, time). Menu > Answer log and export: Download CSV, Download JSON, or Copy to clipboard. The My Stats tab shows strong/weak topics (recent answers count most). Wrong answers get a spoken explanation, a short lesson with an example, then a similar follow-up question. Questions you miss come back sooner; ones you know come back less often.

## Honest limits (phone browsers)
- Chrome on Android **stops listening when the screen locks or you switch apps**. The app keeps the screen awake (Wake Lock) and shows a warning if it was interrupted. Best setup: plugged in, screen on (dark Gym mode), earbuds. Speaking sometimes continues with the screen off, but not reliably, and listening will not.
- Listening needs **internet** (Chrome sends audio to Google). Offline you can still read and tap.
- Chrome may make a small **beep/tone** each time the microphone restarts.
- **Mute is software:** in Quiet mode the microphone stays open only to catch the unmute phrase (everything else is thrown away, never shown or saved). Settings has "Full off" if you prefer the mic completely off while muted (then tap UNMUTE).
- **Voice while audio plays:** by default the mic stays open while a clip plays, so "mute" / "pause" / "back" / "next" work while I talk (best with earbuds; on the phone speaker turn Settings > "Listen while I talk" off). Some Android phones pause audio when the mic opens; if that happens the app detects it, turns that setting off by itself, shows a message, and leaves a 3-second quiet gap after each lesson part for voice commands. The big MUTE / PAUSE button always works instantly. This phone-specific behaviour could not be tested on a real phone.
- Spoken free-form answers are graded by **keywords** (approximate). Tap or say "I was right/wrong" to overrule.
- The random number problems ("endless" generators) are not recorded; they use the phone's built-in voice as a backup. If that fails you get the red message and the question is still on screen.
- Audio is fetched the first time each clip plays and then cached on the phone (Settings > "Save all audio for offline" saves all ~31 MB at once).

## Hosting (needs HTTPS for the microphone)
Any static host works; upload this folder as-is. Examples: GitHub Pages, Cloudflare Pages, Netlify (drag the folder onto app.netlify.com/drop).
Test locally: `python3 -m http.server 8080` then open http://localhost:8080 (localhost counts as secure).

## Tests
`npm test` (or `node --test tests/engine.test.js`) and `python3 tests/e2e.py` (needs Playwright + Chrome).
When you change any file, bump `VERSION` in `sw.js` (and `APP_VERSION` in `app.js`) so phones pick up the update. After changing any spoken text: `node tools/build-audio-plan.js && /workspace/ttsenv/bin/python tools/gen_audio.py` (only new clips are generated; the unit tests fail if any spoken sentence has no clip). `python3 tests/repro_v1_bug.py` reproduces the old bug against git commit 4b76680.
