# Hosting Quiz Show Studio on a website

The site is 100% static: `npm run build` produces `dist/` (about 600 KB, no server code, no database).
Everything is relative (`base: './'`) and uses hash routes (`/#/host/...`), so it works at the site root
or any sub-folder (`https://example.com/quiz/`) with no rewrite rules.

## Requirements
- Serve over **HTTPS** (browsers limit wake-lock, clipboard and other APIs on plain http).
- Serve `index.html` and the `assets/` folder next to it. Nothing else is needed.
- Multiplayer uses WebRTC through the free public PeerJS broker (0.peerjs.com) plus public STUN servers.
  Hosts and players need internet access. Some strict school/corporate networks block WebRTC; for those,
  run your own broker (see docs/APPS.md, "Same Wi-Fi, no internet").
- No cookies, accounts or analytics. All games live in each visitor's own browser (IndexedDB/localStorage).

## Deploy
1. `npm install` then `npm run build` (or use the prebuilt `release/quiz-show-studio-web.zip`).
2. Upload the *contents* of `dist/` to the folder you want (e.g. `public_html/quiz/`).
3. Open `https://yoursite/quiz/` and test: create a game, Host, open the Join link on a phone.
4. Optional: Settings > Connection > "Your website address" is only needed inside the desktop/phone apps.

Caching tip: `assets/*` filenames are content-hashed, so cache them for a year; keep `index.html` uncached.

## Prompt to give Claude on the website's project
Copy everything in the block below.

```
I have a finished static web app called "Quiz Show Studio" (Jeopardy-style trivia: host screen,
phone buzzers over WebRTC/PeerJS, editor, question banks). It is already built; I need it added to
this website and hosted at <PATH, e.g. /quiz/ or a subdomain>.

What I'm giving you: either the zip `quiz-show-studio-web.zip` (the contents of its Vite `dist/`
folder) or the source repo at <PATH/URL> to build with `npm install && npm run build`.

Facts about the app:
- Pure static files: index.html + assets/. No backend, database or env vars.
- Vite base is './' and routing is HashRouter, so it works from any sub-path with no rewrites.
- Must be served over HTTPS.
- Multiplayer uses the public PeerJS broker (0.peerjs.com, wss) and public STUN servers, so the
  site's Content-Security-Policy (if any) must allow: connect-src wss://0.peerjs.com https://0.peerjs.com
  and stun UDP; plus inline styles/scripts as Vite emits them and `blob:`/`data:` images.
- Nothing is stored server-side; each visitor's games stay in their browser.

Please:
1. Look at how this site is built and deployed (framework, host, CI, existing nav) before changing anything.
2. Put the app at <PATH> without breaking existing pages or routing. If the site is an SPA or has a
   catch-all rewrite, make sure <PATH>/index.html and <PATH>/assets/* are served as real files.
3. Set cache headers: long-lived immutable for assets/*, no-cache for index.html.
4. Add a link to it from the site's navigation or home page (ask me where/what label).
5. Check the CSP/headers allow the PeerJS broker as above.
6. Verify in a real browser: home page loads with the bundled 2,000-question bank, creating a game,
   Host shows a 5-letter room code and QR, and the join link opens on a second tab/phone and can buzz.
7. Tell me exactly what you changed and anything I must do (DNS, uploads, deploy command).
Don't commit or deploy until you've shown me the plan.
```
