# Quiz Show Studio

A static, client-side Jeopardy-style trivia game. No backend: build the site and drop `dist/` on any web host.

## Apps (desktop, Android, iPhone)

See **docs/APPS.md**. Portable Windows folder: `npm run package:win` -> `release/Quiz Show Studio-win32-x64/` (double-click the exe, no install, data kept beside it). Android APK: `npm run android:apk` -> `release/QuizShowStudio.apk`. The iOS project is in `ios/` but needs a Mac with Xcode to build.

## Run / build / deploy

    npm install
    npm run dev        # http://localhost:5173
    npm test           # engine unit tests
    npm run build      # typecheck + production build into dist/

`dist/` uses relative asset paths and hash routing (`#/...`), so it works from the site root or any sub-folder.
**HTTPS is required** on the live site (phones' WebRTC, clipboard, fullscreen and audio need a secure context).

## Game setup

- **Boards have 4 to 8 categories.** The editor, importers and bank builder enforce it.
- **Final round styles** (Editor > Final round > Final style): *Wager final* (classic: wager, type an answer, revealed one by one), *Everyone types an answer* (no wagers, flat points, revealed one by one) or *Normal question* (buzzer like any clue).
- **Profile pictures:** players pick a photo or emoji when joining; it shows beside their score along the bottom of the big screen.
- **Layout:** the big screen is a fixed 16:9 stage; phones are laid out for landscape (the Android and iOS apps are locked to landscape). The room code and QR show only in the lobby.

## How it works

- **Storage:** games live in the host browser's IndexedDB; preferences and the live session in localStorage. Export JSON to back up or move games between browsers. Clearing site data deletes games.
- **Multiplayer:** the host browser is the server. Phones connect to it peer-to-peer (WebRTC via PeerJS). The free public PeerJS broker (0.peerjs.com) is used only for the initial handshake; no account or key. Room code = `qss-<CODE>` peer id.
- **3-2-1 countdown:** *Arm buzzer* first shows a quick 3-2-1 (0.5 s per number, on the host, presentation screen and phones with tick sounds); the buzzer really opens when it ends, and buzzes during it count as too early. Timing is `COUNTDOWN_*` in `src/net/protocol.ts`.
- **Spam delay:** pressing the buzzer before the host arms it locks that player out for 1.5 s (enforced on the host by `src/engine/gate.ts`; the phone shows the same wait). Space buzzes on keyboards.
- **Buzzer:** the host must press *Arm buzzer*; before that the engine ignores buzzes and phone buttons are disabled. The first buzz the host machine *receives* wins (`src/engine/game.ts`, action `buzz`); client timestamps are never used. Network latency still affects fairness between players.
- **Answer secrecy:** phones get a `PlayerView` (no clue text, no answers). The presentation window gets a `PublicView` (answer only after reveal). Only the host controller holds the full game.
- **Recovery:** the host session is saved on every change. Refresh the host page (or use *Resume last session* on Home) and the same room code comes back; phones auto-reconnect and receive the current state.
- **Second screen:** *Open presentation window* (same browser, uses BroadcastChannel) — drag to the TV, F11. *Show on this screen* is the single-screen fallback.
- **No phones?** Add local players on the host page and buzz with keys 1-8.

## Host shortcuts
Enter arm/disarm, Y correct, N incorrect, S reveal answer.

## Layout
    src/engine   pure game state machine + tests (buzzer, scoring, daily double, views)
    src/net      PeerJS host/player links, validated message protocol
    src/store    IndexedDB games, JSON import/export, session + prefs
    src/pages    Home, Editor, Host, Present, Join
    src/components/Screen.tsx   shared presentation renderer

## Implemented
- **Editor:** categories, rows, values, colours, reorder, duplicate, search, copy/paste a clue, undo/redo (typing coalesced), autosave, image upload, preview, rules, Final-round clue.
- **Included question bank:** `Jeopardy Question Bank - 2,000 Questions` (23 categories) ships inside every build and is added to Question banks on first launch (source: `src/data/question-bank-2000.txt`). Deleting it does not bring it back; re-import the .txt to restore.
- **Bulk import / question banks:** import hundreds or thousands of clues at once (flat `Category | Clue | Answer | Alts | Difficulty` lines, or `# Category` groups, or CSV). Big files are saved as a *question bank*; *Build a game* then draws a fresh random board (pick categories or random, choose rows, point step, Daily Doubles). Download the *Bulk template* on Home (`src/store/bank.ts`).
- **Plain-text import:** one clue per line, `value: clue | answer | other answers`; `# Category` starts a category, `*` after the value = Daily Double, `# Final: Name` adds a Final clue. Download the *Text template* on Home for a worked example (`src/store/txt.ts`). Export text from the editor to round-trip.
- **Import/export:** JSON (validated, versioned), CSV with a downloadable template and a preview step that reports every bad row, printable host answer key + clue sheet (`#/print/<id>`).
- **Templates:** General Knowledge, World Tour, Science & Tech, Family Night (original clues, each with a Final), and a blank board.
- **Live game:** host controller, lobby with QR + room code, room lock, phone join + buzzer, local keyboard players, host-armed buzzer with lockouts and optional auto-close, scoring with an append-only event log, Daily Doubles with wagers.
- **Final round (Final Jeopardy):** enable it per game in the editor (blank boards include one to fill in). Wagers capped at the player's score, private phone answers, a visible answer timer (default 30 s, set per game, 0 = host ends it manually; auto-ends on the host), lowest-score-first reveal, host judging, standings.
- **Scoreboard page:** results saved locally when a game finishes; all-time leaderboard (games, wins, win rate, points, best, accuracy) computed from the event log.
- **Quality of life:** non-blocking confirm dialogs (a native `confirm()` freezes the host while players buzz), screen wake-lock on host and phones, 3 themes, synthesized sound effects, reduced motion, refresh recovery.

## Not implemented (yet)
Accounts/avatars/achievements/shared community library/admin (need a backend), teams, audio/video clues, custom sound uploads, more themes, desktop wrapper, browser end-to-end tests. 

## Known limitations / bugs
- Peer-to-peer can fail on strict corporate/cellular NATs (no TURN server configured). Wi-Fi on the same network is the most reliable. A custom connection server (Settings > Connection) allows fully offline LAN play.
- Depends on the public PeerJS broker being up; it can be self-hosted (`peerjs-server`) and passed to `new Peer(..., {host, port})` in `src/net/*.ts`.
- The host tab must stay open (browsers may throttle a hidden/background tab; keep it visible or use the presentation window for the TV).
- Images are stored as downscaled data URLs; the session snapshot in localStorage may exceed quota with many images (the live game still works, but refresh-recovery may not).
- Tested: engine unit tests (28 pass: engine incl. Final round, CSV), typecheck, production build, and a manual browser run (host + local players, phone join/buzz over WebRTC in a second tab, host refresh recovery). Also manually tested: a full Final round with a local player and a phone tab, and the in-app confirm dialog. Not tested: real phones, Firefox/Safari, presentation window, CSV/JSON import UI, image upload, printing.
