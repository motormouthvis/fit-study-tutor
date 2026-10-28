# MBA Study Tutor (Bill's hands-free voice tutor) - v5.3

**v5.3:** the flash card study screen fits the window (truck screen, phones, laptops) with no scrolling. See "v5.3" at the bottom.

**v5.2:** flash card progress can sync across devices (Settings > "Sync flash cards across my devices"). See "v5.2" at the bottom.

**v5.1:** Flash Cards is now a top tab (Learn - Quiz - Flash Cards - My Stats) that opens on a list of **sections**, and Chapter 1 of the accounting book is built in. See "v5.1" at the bottom, including **Adding a chapter**.


**v4.5 fix:** in desktop Read mode the article box could extend about 50 px below the bottom of the window, so the last line of a part or topic could never be scrolled fully into view. The box height is now worked out from the space actually left in the window (recalculated on layout changes, window resize and font load), the article has bottom padding and scroll-padding, and ↑/↓/PgUp/PgDn scrolling stops exactly at the real bottom. `tests/e2e_v45.py` checks every topic and the 12 tallest parts at 1366x768 and 1440x900.


**v4.4 change:** keyboard controls in desktop Read mode. ← / → move to the previous / next part (the statements panel follows), Shift+← / → move to the previous / next topic, ↑ / ↓ scroll the article smoothly about three lines, and PgUp / PgDn scroll a page. The keys only work in desktop Read mode on the Learn screen, never while typing in a field or with the menu or a popup open, so the Flash Cards arrow keys are unaffected. A small hint line sits next to "Listen from here". Tests: `tests/e2e_v44.py`.


**v4.3 change:** the first item in the menu is **"Install on my Phone or Computer"** (also in Settings). If the browser offers its own install prompt (`beforeinstallprompt`), tapping the item opens it. If the app is already running installed (display-mode standalone), it says "Already installed ✓". Otherwise a short popup shows steps for the detected platform (Android Chrome, Samsung Internet, iPhone Safari, desktop Chrome or Edge, Mac Safari). The manifest now has an `id` and no portrait lock, so desktop installs work properly. `tests/e2e_v43.py` checks the label and position, the prompt / installed / steps paths for each platform, and Chrome's own installability report (no errors).


**v4.2 change: Flash Cards** (menu > Flash Cards). `flashcards.js` holds 331 hand-written cards (BUS 5601: 170 cards over 14 topics; BUS 5421: 161 cards over the 8 syllabus weeks, which map to 14 topics following Froeb) and 48 generated Statement Analysis cards: 12 fictional companies across different industries, some healthy and some distressed, each with a compact balance sheet (plus an income statement when needed), asking for current, quick, working capital, D/E, ROA, ROE, margins and interest coverage. The back shows the answer, the working and a plain-English meaning. Tap, click or Space flips; Got it / Missed (G/M or the arrow keys; R stars, N skips). Missed cards go to the end of the session (v5.7.2; was 3 cards later) and are marked Restudy (the star toggles it). Filters: All, course, topic, Statement Analysis, Restudy only, Unseen; shuffle on/off. Progress is saved in localStorage (`tutor.v1.fc`), and lifetime numbers appear in My Stats. Tests: `tests/flashcards.test.js` (balanced statements, answers recomputed from the printed tables, hand-checked formulas, queue logic) and `tests/e2e_v42.py` (desktop 1440 and phone 390).


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

## v5.2 - sync flash card progress across devices
- Before v5.2 every device kept its own results in its browser storage (`localStorage`), so results studied on the laptop never showed on the phone. v5.1 itself saved correctly (checked on the live site, phone and desktop, including the v5.0 import upgrade path).
- **Settings > Sync flash cards across my devices.** First device: **Turn on sync (make a new code)**, then **Copy code**. Each other device: paste the code in "Already have a code?" and tap **Use this code**. Results already on that device are merged in, not lost.
- What syncs: per-card results (right/wrong, counts, last answer, Restudy star), section history, My cards, improved cards (and deletes / resets). Nothing else (quiz log, settings) syncs.
- How: the Worker `fit-tutor-ask` has `GET/PUT /progress/<code>` (same origin check; 400 KB cap; one write per code every 2 s, 400 writes per code per day; KV key is a SHA-256 of the code). Storage is the free-plan KV namespace `SYNC_KV`. The merge rules live in `sync-merge.js` and are shared by the app and the Worker: newest change per card wins (each result has an update time), history is a union by session id, deletes win over older edits. The app syncs on load, about 20 s after you stop grading (at most every 90 s while you keep going), when the app is hidden or shown again, and when the connection comes back. Offline grading is kept on the device and sent later.
- KV reads can lag up to about a minute between far-apart places; tap **Sync now** if a device looks behind.
- Tests: `tests/sync.test.js` (merge rules), `worker/test/sync.test.js` (endpoints), `tests/e2e_v52.py` (two devices: turn on, enter code, offline then online, same card on both, My cards add/delete, turn off).

## v5.3 - compact flash card study screen
- One compact row: "‹ Sections", the section name (once, cut off with ... if long; full name on hover) with a one-line session/lifetime summary under it, and Shuffle. On phones the name and summary sit on one short block under the two buttons.
- The "Which cards" dropdown is gone from the study screen (pick cards from the sections list). The READY bar, the key list and extra header spacing are hidden only while studying.
- The card fills the space between the top row and Got it / Missed; if a card is long its text shrinks just enough to fit. Wide screens show Statement Analysis answers beside the tables.
- Test: `tests/e2e_v53.py` (1180x700 truck size, 1280x720, 390x844, 1366x768; long answer and a statement card).

## v5.9.13 - one "?" card button with voice, and the Cybertruck microphone fix
- **One button per card side.** The old "?" (Ask Grok) and "..." (menu) are replaced by a single "?" on both the question side and the answer side. It opens the **card helper** (a bottom sheet on phones, a side panel on wide screens; the card stays visible).
- **Talk, type or tap.** The helper has one big Talk button (one tap = one short listen, never an automatic restart), a type box with the same phrases, and a visible button for every function: Explain, Improve, Make another card like it, Create a brand new card, Important, Restudy, Flip, Previous, Skip, Got it, Missed it, Reset to original (improved cards) and Delete (your own cards; asks twice).
- **Voice phrases:** "explain this card", "improve this card" (then say what to change) or "improve it, make it shorter", "make another card like this", "create a new card about working capital" (or just "create a new card", then say the topic), "mark important", "restudy", "flip", "got it", "missed it", "skip"/"next", "previous", "reset to original", "delete this card" (say it twice), "close", "what can I say". The phrases live in `cardvoice.js` (unit-tested).
- **His words are feedback, never card text.** What you say or type for Improve / Create goes to Grok as a note. If Grok pastes it into the card anyway, a warning shows and Save is switched off (new cards: a whole sentence of 6+ words, or any 8-word run, counts; a short topic like "working capital" may appear in the question). Editing the draft so the words are gone switches Save back on.
- **Microphone fixes for the Cybertruck browser** (`micsupport.js`): the speech API and the raw microphone are detected separately; listening starts only from a tap; every failure (not-allowed, service-not-allowed, no-speech, audio-capture, network, never started) becomes one plain sentence plus a **Try again** button, and a retry after a block asks for the mic itself from that tap so the car's permission screen can appear. No auto-restart loops. No MediaRecorder/transcription path was added (the app has none, and no paid service was added).
- **Menu > Test microphone** reports: speech API present, microphone permission, whether the mic opens, a live audio level (4 seconds), and a one-tap speech-to-text test, with a copyable report. This is the way to see what the real car supports: Tesla's browser (QtWebEngine) only allows the cabin microphone since software 2026.26 on AMD cars, and Web Speech API support there is undocumented, so it could not be verified without a car.
- New card: Froeb Ch 5 "IRR by trial and error" ($100 for $50 a year over 5 years), right after the IRR worked example. Ch 5 is now 42 cards (see the v5.9.10 section for the chapter details).
- Tests: `tests/cardvoice.test.js`, `tests/micsupport.test.js`, `tests/e2e_v5913.py`; `e2e_v48/v49/v51/v52/v59` updated for the single button.

## v5.9.11 - skip arrows on flash cards
On the question side of a flash card (before it is flipped), big **◀** and **▶** buttons (either side of Missed / Got it) move to the previous or next card without grading it: no Got it / Missed is recorded, stats, Restudy stars and the pass are unchanged. They stay within the current section, mode (missed / restudy / important) and shuffle order, and "Card N of M" follows along. The deck loops: Next on the last card goes to the first, Prev on the first goes to the last (buttons are disabled when only one card is left). The arrows hide once the card is flipped, so Got it / Missed are unchanged.
Keys: on the question side, ← / → now skip (before, they did nothing there, because grading needs the answer showing). On the answer side, → = Got it and ← = Missed exactly as before. N still skips forward. Logic: `Flash.skip(queue, dir)`; tests in `tests/flashcards.test.js` and `tests/e2e_v5911.py`.

## v5.9.10 - Froeb Chapter 5
BUS 5421 Froeb **Chapter 5, "Investment Decisions: Look Ahead and Reason Back"**: 42 cards in our own words, each answer ending in the section and page reference from the notes, e.g. "(Ch 5, sect 5.2, p. 51)". The chapter opening (apartment WACC example) cites "(Ch 5, overview)" because no page is known. Ids are `froeb-ch05-<slug>`. By section: overview 3, 5.1 5, 5.2 7, 5.3 6, 5.4 6, 5.5 3, 5.6 12. Eight cards are tagged "; summary" and together cover all seven "Summary of Main Points".
Concepts the deck already had were not repeated (NPV and IRR definitions, future and present value, rule of 72, WACC definition, payback, contribution margin, break-even quantity formula, break-even price, avoidable cost, shutdown rule and its derivation, sunk cost, fixed vs sunk, accounting vs economic profit, generic hold-up). Chapter 5 adds the angles those cards do not have: the apartment, pension, A vs B, IRR, Nissan, Deere and printer numbers, and the chapter's traps.
No wiring is needed: the chapter list is built from `books-data.js`, and Chapter 5 sorts between Chapters 4 and 6. Froeb is now Ch 1: 23, Ch 2: 25, Ch 3: 33, Ch 4: 40, Ch 5: 42, Ch 6: 3 = 166 cards, and the deck is 695 built-in cards.

## v5.9.9 - five Froeb Chapter 4 vocab cards
After `froeb-ch04-ac-rising-mc-above`: `avoidable-cost`, `average-variable-cost`, `break-even-price`, `short-run-vs-long-run-avoidable`, `shutdown-rule-short-vs-long-run` (from the Entry and Shutdown Decisions lecture). Other vocab terms already had cards, so none were duplicated. Chapter 4 becomes 37 cards, Froeb 121, the deck 650 built-in cards.
Then three more lecture cards at the end: `break-even-quantity-formula`, `shutdown-rule-derivation`, `average-avoidable-cost`. Chapter 4 becomes 40 cards, Froeb 124, the deck 653 built-in cards. The key-price table was already covered by `break-even-price`, `average-variable-cost` and `shutdown-rule-short-vs-long-run`.

## v5.9.8 - one more Froeb Chapter 4 card
`froeb-ch04-ac-rising-mc-above`, last in Chapter 4: average cost rising means marginal cost is **above** average cost, which is not the same as marginal cost rising. Chapter 4 becomes 32 cards, Froeb 116, the deck 645 built-in cards.

## v5.9.7 - Froeb Chapter 4
BUS 5421 Froeb **Chapter 4, "Extent (How Much) Decisions"**: 31 cards (the Card 42 to Card 72 set), written in our own words from the chapter, with each answer ending in the section or page reference from the notes, e.g. "(Ch 4, sect 4.2, pp. 39-40)". No textbook text is quoted, so these carry a section reference rather than a page quote. Ids are `froeb-ch04-<slug>`.

The chapter needs no wiring: `sectionList()` builds the Books and chapters list from `books-data.js`, so Chapter 4 arrives with its own section, its Right / Wrong / Restudy / Important counts and all four study buttons (Study all, Study missed, Study restudy, Study important), exactly like Chapters 1 to 3. Froeb is now Ch 1: 23, Ch 2: 25, Ch 3: 33, Ch 4: 31, Ch 6: 3, and the whole deck is 644 built-in cards.

## v5.9.6 - Mute means the microphone, so noise cannot stop a lesson
Bill listens on his phone in noisy places and the lesson kept stopping. Three things were doing it, and all three were the microphone, not the audio:
- **Mute meant the wrong thing.** The Mute pill called the tutor's own mute, which *stops the tutor talking* and leaves the microphone open to catch the unmute phrase. It also froze every on-screen button except Stop. The one thing it did not do was stop the app listening.
- **Half-heard noise could stop the lesson.** `heard()` checked for a mute command *before* it checked whether the phrase was finished, so an interim transcript of background noise - "mood", "paws", "moot" - cancelled the audio. Other noise parsed as a command (next, repeat, stop) does the same.
- **On some Android phones opening the microphone pauses the audio**, which the app then has to detect and work around.

Now: **&#127908; Mute the mic** switches the microphone off. The recognizer session is closed and nothing restarts it, nothing heard can reach the tutor (the engine refuses too), the lesson plays straight through with no listening gaps, and every on-screen button still works by tap. The button turns red and reads **&#128263; Mic off &ndash; tap to listen**, the status line says "Microphone off, so noise cannot stop the lesson", and the setting is saved: it survives topic changes, starting a new session and a reload. Voice cannot undo it, by design, so the way back is the button.
Separately, a mute spoken by voice now needs a finished phrase rather than an interim guess, so half-heard noise no longer stops a lesson even with the microphone on. Recognizer errors (no-speech, audio-capture, network, aborted) never touched playback and there is now a test that says so.
Tests: `tests/engine.test.js` (mic off ignores everything, buttons and auto-advance keep working, the setting is remembered, no interim mute, no listening gap) and `python3 tests/e2e_v596.py` (the real screen: tap, recognizer closed and never restarted, audio keeps playing, buttons, reload, tap back on).

## v5.9.5 - Froeb Chapter 3 problem 3-1: opportunity cost is profit given up
One card in BUS 5421 Froeb **Chapter 3** (`froeb-ch03-opp-cost-profit-given-up`) for the free-Springsteen-ticket problem, where the easy wrong answer is $80, the price of the U2 ticket. The answer leads with "$20, not $80", shows $100 - $80 = $20, and quotes the book: "The opportunity cost of an alternative is what you give up to pursue it," and the cost of the alternative you choose is "the forgone opportunity to earn profit from the other." (p. 29). Chapter 3 goes from 32 cards to 33.

The card is **not** pre-marked Important: that star is per-device study progress (`tutor.v1.fc`, key `imp`) rather than card data, and it syncs, so a built-in default would fight the user's own star. Tap **&#9734; Important** on the card once and it sticks on every synced device.

## v5.9.4 - every point of Froeb Chapter 3's Summary of Main Points
Eight more cards in BUS 5421 Froeb **Chapter 3**, one per point of the chapter's "Summary of Main Points", with the book's sentences as the answers and no paraphrase. The page the summary sits on is not known, so these carry **no page reference**, unlike the rest of the chapter; the unit test that insists on a page ref knows about them. Ids are `froeb-ch03-ch3-summary-1` to `-8`. Chapter 3 goes from 24 cards to 32 and nothing existing was changed.

## v5.9.3 - Froeb Chapter 3 cost cards
Four cards added to BUS 5421 Froeb **Chapter 3** (Benefits, Costs, and Decisions), question and answer word for word from the textbook with the page numbers as given: explicit costs (what the book calls accounting costs, p. 28), implicit costs (p. 28), the relevant costs and benefits of a decision (p. 30), and accounting profit versus economic loss (p. 29). Chapter 3 goes from 20 cards to 24; nothing existing was changed or removed, and the new ids sit alongside the older `implicit-costs`, `accounting-costs` and `relevant-costs-and-benefits-the-general-rule` cards rather than replacing them.

## v5.9.2 - a question in the Improve box is feedback, not words to paste on the card
Bill typed "begin with what decision? im confused" on the Froeb Ch 3 "begin with the decision" card. Grok did not explain anything: it pasted his words on top of the old answer.

Why: v5.9.1 introduced the note as "Bill has told you exactly what he wants" and then said "make the change he asked for, make it clearly visible". That reads fine for an order ("make it shorter") and badly for a question or a complaint, where the only visible change the model can see to make is to put the words themselves on the card. Replayed against the live proxy, the v5.9.1 wrapper did exactly that on one of two tries, and pasted the front of the card into the back on the other.

The fix, in two parts:
- **The note is framed as feedback.** The wrapper now says the note may be an order, a question, or just "I'm confused", that it is always feedback about the card and never text to put in the card, and that a question or confusion means the card is at fault: add one short plain sentence spelling out whatever the card assumed he knew, in this card's own example. A hard rule forbids copying, quoting or paraphrasing any of his words into the card, and quoted textbook wording keeps its quotation marks.
- **A safety net on the device.** The app compares the answer with the note on words alone (case, punctuation and spacing ignored). If the note, or a run of eight words from it, turns up in the new card, the app silently asks Grok again with an extra rule saying its last answer broke rule 1. If the second answer still parrots the note, the preview shows a red warning, the After panel is labelled "not safe to save", and **Save is switched off** so a card made of Bill's own words can never be saved.

Measured on Bill's card and note, calling the live proxy: v5.9.1 parroted the note (1 of 2 tries, and mangled the card on the other); v5.9.2 parroted it 0 times in 6 tries and every answer added the missing explanation ("decide whether to keep or drop the product"), keeping the textbook quote and (p. 33). Grok still occasionally drops the quotation marks around the quote while keeping its words, which the Before / After preview lets you catch.

## v5.9.1 - Grok actually does what you asked
Bill asked Grok to "name the opportunity cost explicitly and keep the book's wording" on a Froeb Ch 3 card. Grok named the opportunity cost but rewrote the book's sentence, i.e. it did half the job and then did its usual rewrite.

What was wrong (measured against the live proxy, not guessed):
- v5.9 put the instruction **after** the card inside `partText`, and the deployed Worker wraps that whole field as `The card: """ ... """`. So the instruction arrived dressed as card text. In one test the model copied words out of the instruction into the answer, which is exactly that mistake.
- The deployed Worker's own task line says "Rewrite it to be clearer and more accurate", and its system prompt fixes the shape of a card ("a short question or term", "under 500 characters"). Nothing told the model that Bill's instruction beats those defaults, so a standing order to reword silently won over "keep the book's wording".
- The instruction box also capped at 300 characters, so a long instruction was cut off without saying so.

The fix (client side, so it works with the Worker that is already deployed): the instruction now goes **first**, before any card text, as the point of the request; it says plainly that this is not a general rewrite, that every other sentence must be reproduced word for word, and that the instruction outranks any default rule about how a card should look, including length. The card follows, labelled as card text rather than an instruction. The box now holds 600 characters.

Measured on Bill's card with his instruction, calling the live proxy: v5.9 kept the book's sentence 0 times out of 2; v5.9.1 kept it 2 times out of 2, and named the opportunity cost both times.

`worker/src/index.js` carries the same precedence for whenever it is next deployed (`cd worker && npx wrangler deploy`, needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`). **A redeploy is not required** - the fix was verified against the Worker running today.

## v5.9 - Important cards, and telling Grok what to improve
- **Important star.** Every flash card has a **&#9734; Important** button next to **&#9734; Restudy** (keyboard: `I`). Tap or click it to mark the card; tap again to unmark. Important is Bill's own star: a miss never sets it (a miss still sets Restudy and sends the card to the end of the session, as before).
- **Study important.** Each section on the Flash Cards list now shows an **Important** count and a fourth button, **Study important**. The "All cards" section gives the same button across every section at once. The finished-session screen offers "Important only" too, and "Important only" is in the which-cards dropdown.
- Where it is saved: in the same per-card progress as Right / Wrong / Restudy (`tutor.v1.fc`, key `imp`), so it syncs across devices through the existing sync code with no change to the Worker. Old saved progress loads unchanged (no `imp` = not important).
- **Improve with Grok now asks what you want.** The &#8943; menu > Improve opens a box: type the instruction, or tap **&#127908; Talk** and say it (browser speech recognition, live transcript in the box so you can fix the words before sending; if the browser has no speech recognition the box is typing-only and says so). Five one-tap suggestions ("Make it shorter and clearer", "Add a short worked example", ...) fill the box for you.
- Grok replies with a **Before / After preview**: **Save (replace the card)**, **Cancel**, **Try again**, or open "Not right? Tell Grok what else to change" to refine again - each new instruction works from the version Grok just produced, so changes build up.
- The same type-or-talk box is on **Make more cards like this** (instruction optional) and on **Create a new card**.
- Why the old Improve worked badly: it sent a fixed "rewrite this to be clearer" prompt with no way to say what was wrong, and the Worker's card rules ("a short question or term", "under 500 characters") flattened the exam-style cards into generic definitions. The app now sends the card, Bill's instruction and a house-style line ("keep quoted textbook wording and page references exactly") in `partText`, which the deployed Worker already forwards - so this works **without redeploying the Worker**. `worker/src/index.js` has matching prompt changes that make it a little better still if the Worker is ever redeployed (`cd worker && npx wrangler deploy`); nothing breaks if it is not.
- New cards, question and answer word for word from the textbook (no page ref, because the wording is quoted exactly as given). BUS 5421 Froeb **Chapter 1**: "What is a price floor?" and "What is a price ceiling?" (Chapter 1 defined neither term before). BUS 5421 Froeb **Chapter 2**: "Does the Government Create Wealth?", "What is the one lesson of economics?", "What is the opposite of a tax, and what does it do to wealth?" and "How do taxes destroy wealth?". Nothing was replaced: the Chapter 2 card that asks which of a rent cap and a minimum wage is the ceiling and which the floor is still there, because it asks you to apply the terms rather than define them. Froeb now has 23 cards in Ch 1, 25 in Ch 2, 20 in Ch 3 and 3 in Ch 6.
- Tests: `tests/flashcards.test.js` (the new cards word for word, Important set/clear/counts/filters, old progress and sync merge), `worker/test/worker.test.js` (the instruction reaches the model) and `python3 tests/e2e_v59.py` (desktop and phone: the star, Study important, missed-to-the-end, the whole Improve flow with Grok stubbed, talk-to-type, and a browser with no speech recognition). `tests/e2e_v49.py` and `tests/e2e_v51.py` were updated for the new flow and the current card counts.
- Still stale from older versions (they were already failing before v5.9): `tests/e2e_v42.py` checks the pre-v5.7.2 rule that a missed card comes back 3 cards later.

## v5.4
- Each flash card deck remembers where you are (per section and mode) and resumes at the next card, even on another device with the same sync code. Shows "Card 26 of 80", a finished-deck screen (Start over / Study missed), and a Start over button on the study row. Tests: tests/e2e_v54.py.
