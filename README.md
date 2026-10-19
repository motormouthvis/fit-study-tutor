# MBA Study Tutor (Bill's hands-free voice tutor) - v5.1

**v5.1:** Flash Cards is now a top tab (Learn - Quiz - Flash Cards - My Stats) that opens on a list of **sections**, and Chapter 1 of the accounting book is built in. See "v5.1" at the bottom, including **Adding a chapter**.


**v4.5 fix:** in desktop Read mode the article box could extend about 50 px below the bottom of the window, so the last line of a part or topic could never be scrolled fully into view. The box height is now worked out from the space actually left in the window (recalculated on layout changes, window resize and font load), the article has bottom padding and scroll-padding, and ↑/↓/PgUp/PgDn scrolling stops exactly at the real bottom. `tests/e2e_v45.py` checks every topic and the 12 tallest parts at 1366x768 and 1440x900.


**v4.4 change:** keyboard controls in desktop Read mode. ← / → move to the previous / next part (the statements panel follows), Shift+← / → move to the previous / next topic, ↑ / ↓ scroll the article smoothly about three lines, and PgUp / PgDn scroll a page. The keys only work in desktop Read mode on the Learn screen, never while typing in a field or with the menu or a popup open, so the Flash Cards arrow keys are unaffected. A small hint line sits next to "Listen from here". Tests: `tests/e2e_v44.py`.


**v4.3 change:** the first item in the menu is **"Install on my Phone or Computer"** (also in Settings). If the browser offers its own install prompt (`beforeinstallprompt`), tapping the item opens it. If the app is already running installed (display-mode standalone), it says "Already installed ✓". Otherwise a short popup shows steps for the detected platform (Android Chrome, Samsung Internet, iPhone Safari, desktop Chrome or Edge, Mac Safari). The manifest now has an `id` and no portrait lock, so desktop installs work properly. `tests/e2e_v43.py` checks the label and position, the prompt / installed / steps paths for each platform, and Chrome's own installability report (no errors).


**v4.2 change: Flash Cards** (menu > Flash Cards). `flashcards.js` holds 331 hand-written cards (BUS 5601: 170 cards over 14 topics; BUS 5421: 161 cards over the 8 syllabus weeks, which map to 14 topics following Froeb) and 48 generated Statement Analysis cards: 12 fictional companies across different industries, some healthy and some distressed, each with a compact balance sheet (plus an income statement when needed), asking for current, quick, working capital, D/E, ROA, ROE, margins and interest coverage. The back shows the answer, the working and a plain-English meaning. Tap, click or Space flips; Got it / Missed (G/M or the arrow keys; R stars, N skips). Missed cards come back 3 cards later and are marked Restudy (the star toggles it). Filters: All, course, topic, Statement Analysis, Restudy only, Unseen; shuffle on/off. Progress is saved in localStorage (`tutor.v1.fc`), and lifetime numbers appear in My Stats. Tests: `tests/flashcards.test.js` (balanced statements, answers recomputed from the printed tables, hand-checked formulas, queue logic) and `tests/e2e_v42.py` (desktop 1440 and phone 390).


**v4.1 change:** desktop Read mode hides the top rows (header, status line, tabs, Read/Listen toggle) so the article and statements use the full height; they slide back when the mouse is within ~40 px of the top edge or keyboard focus (Tab) enters them, and slide away shortly after. A sticky nav sits at the top of the reading area: "<- topic ->" and "<- Part N of M: part title ->". Statement linking fixed and audited: every accounting lesson part has a checked tab (explicit per-part links in `statements.js` PART_LINKS where the keyword rules were weak, e.g. the cash-flow intro, retained earnings, the Altman total); the tab and highlights update on every part/topic change (nav, click, or audio). Listen mode and the phone are unchanged.

**v4 change (desktop + sample statements):** the app detects phone/tablet vs desktop (screen width under 820 px, or a touch-only screen with a coarse pointer and no mouse = phone/tablet; Settings > Screen type overrides it). On a desktop the Learn screen gets a **Listen / Read** toggle: Listen is the v3 audio player; Read shows the whole topic as a large-print article, you move part by part at your own pace (or click any paragraph), "Listen from here" starts the audio at that part, and while audio plays the playing paragraph is highlighted (read-along). **Sample statements** (`statements.js`) for Skyline Avionics, the made-up company in the audio script: balance sheet, income statement and cash flow statement for 2024-2026 (2026 = the script's numbers exactly), each with common-size % columns, plus a ratios table (current, quick, working capital, debt-to-equity, times interest earned, margins, ROA, ROE, turnovers, Altman Z). Each lesson part is linked to the lines it talks about (e.g. the current-ratio part highlights total current assets and total current liabilities). Desktop shows the statements beside the lesson (drag the divider to resize); phone shows them in a bottom sheet from a small Statements button (only during an accounting lesson) or Menu > Show statements. The phone screen is otherwise unchanged from v3. `tests/statements.test.js` checks the arithmetic (assets = liabilities + equity, net income ties to retained earnings, cash flow ties to cash, every subtotal, every ratio).

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
- `tests/`: `engine.test.js` (63 logic tests incl. audio-coverage checks), `e2e.py` + `e2e_audio.py` + `e2e_v41.py` (auto-hiding header, sticky nav, correct tab for all 112 accounting parts), `e2e_v4.py` (desktop 1440 px / phone 390 px), `e2e_v3.py` (simple-screen, menu, +/-10 s, mic-network-error tests; headless Chrome, real audio playback, fake microphone), `repro_v1_bug.py` (reproduces the v1 bug on the old commit)

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

## v4.6 — Ask Grok
A circled **?** on each part (Read and Listen) opens a chat (side panel on desktop, bottom sheet on phone)
that explains the part in plain English for an MBA beginner, streams the answer and allows 6 follow-ups.
Conversations are kept on the device. Calls go through the Cloudflare Worker in `worker/` (see worker/README.md);
until `ask-config.js` has its URL, the panel shows "coming soon". Tests: `python3 tests/e2e_v46.py` (REAL=1 for one real question).

## v4.7 — Ask Grok live
Worker `fit-tutor-ask` deployed at https://fit-tutor-ask.motormouthvis.workers.dev (KV rate limit, key stored as a Worker secret).

## v4.8 — Ask Grok on flash cards
A circled **?** on the front and back of each flash card opens the same chat, asking Grok to explain the card (front + back) in more depth.
It does not flip the card, and card shortcuts are paused while the chat is open. Test: `python3 tests/e2e_v48.py`.

## v4.9 — AI flash cards
A small **⋯** menu next to the **?** on each card: **Improve** (Grok rewrites the card; Before/After; Save or Discard), **Expand** (3–5 related cards; tick the ones to keep) and **Create a new card** (type a topic; edit the draft; Save). Also in ☰ → "My flash cards (AI)".
Saved cards are "My cards" (AI badge), kept in localStorage (`tutor.v1.mycards`), and count in every filter, score, Restudy and the stats. Improved cards override the original on this device (**Reset to original** in the ⋯ menu); custom cards can be deleted.
☰ → **Export my cards / Import my cards** saves and restores them as `my-flash-cards.json`.
The Worker has JSON modes `kind: improve | expand | create` (same model, caps and rate limits); the app validates the JSON again and falls back to a friendly message on bad output.
Statement Analysis cards have no Improve (their numbers are generated and checked). Test: `python3 tests/e2e_v49.py`.

## v5.0 — clearer flash cards
All 331 course cards re-worded (ids unchanged, so scores, Restudy marks and your improved cards carry over). Every front now says exactly what to produce ("Define: prepaid expense, ... then give the journal entries ...", "Cash ratio: write the formula and say what a high vs low number tells you", "Calculate: ...", "Compare: ..."); every back is a labeled model answer (Definition / Formula / Example entry / Example / What it tells you / Answer / Working). Accounting term cards include a tiny balanced example journal entry. Statement Analysis prompts now say what to calculate and to say what it tells you.
Text lives in `cards-v50.js` (id -> [front, back]); the original wording is kept in `tests/cards-v4-originals.json`, and a unit test checks that every original number survived and every example entry balances. Test: `python3 tests/e2e_v50.py`.

## v5.1 - Flash Cards tab, sections, books and chapters
- **Top tabs:** Learn - Quiz - Flash Cards - My Stats. The menu no longer has a Flash Cards item (the menu keeps the AI card actions: Create / Improve / Expand / Export / Import).
- **Sections first:** tapping Flash Cards shows sections. Each section shows its name and **Right / Wrong / Restudy / Unseen / Total**, with three buttons: **Study all**, **Study missed**, **Study restudy** (a button is greyed out with "0 cards" when nothing fits). Right = the last answer on the card was Got it; Wrong = the last answer was Missed; Restudy = starred cards (a miss stars a card automatically). Old saved progress (no "last answer") counts as Wrong when misses > gots.
- **Sections:** All cards; one per book chapter (e.g. "Course 5601 - Book: Financial & Managerial Accounting, Chapter 1: Introduction to Accounting and Business"); one per course topic (BUS 5601 and BUS 5421, in collapsed groups); Statement Analysis; My cards (AI). A card can be in more than one section (a My card saved under a topic shows in both).
- **History:** each section has a collapsed "History" list: one line per study session (date, which button, cards studied, right, wrong), newest first, last 20 kept. Saved in `tutor.v1.fc` under `hist`.
- **Study view:** same as before (flip, Got it / Missed, G/M/arrows, R, N, ?, the ... menu), plus an "All sections" button and the section name at the top. "Continue" on the sections list resumes an open session. The Which-cards dropdown is still there.
- **Chapter 1** (80 key-term cards) is in `books-data.js`. If you had imported the earlier my-ch1 file, the app merges those copies into the built-in cards and keeps their scores.
- **Progress carries over:** card ids did not change; saved scores, Restudy stars, My cards, improved cards and export/import all work as in v5.0.
- Tests: `tests/e2e_v51.py` (tabs, sections, counts, buttons, history, old progress, desktop and phone) and new unit tests in `tests/flashcards.test.js`.

### Adding a chapter (one file: `books-data.js`)
1. Open `books-data.js`. Find the book (or add a new book object: `id` short and never changed, `course` "acct" for BUS 5601 or "econ" for BUS 5421, `courseNo` "5601"/"5421", `title`).
2. Add a chapter to its `chapters` list: `{ n: 2, title: "Basic Accounting Systems", cards: [ ... ] }`.
3. Each card is one line: `["short-unique-slug", "Front: say what to produce", "Back: short model answer in our own words"]`. The card id becomes `<book id>-ch<NN>-<slug>`, so keep slugs unique within the chapter and never rename one after Bill has studied it (the score follows the id).
4. The chapter appears under "Books and chapters" automatically, titled "Course <courseNo> - Book: <title>, Chapter <n>: <chapter title>". Nothing else needs editing.
5. Run `npm test` (checks unique ids and no empty text), bump `VERSION` in `sw.js` and `APP_VERSION` in `app.js`, then commit and push.
