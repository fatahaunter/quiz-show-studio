// Builds a portable Windows folder: release/Quiz Show Studio-win32-x64/  (no installer, no install step).
//   npm run package:win                 rebuild in place (your ./data folder is preserved)
//   npm run package:win -- --staging    build into release/staging instead, leaving a running copy alone
import { packager } from '@electron/packager';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const staging = process.argv.includes('--staging');
const base = staging ? join('release', 'staging') : 'release';
const target = join(base, 'Quiz Show Studio-win32-x64');

// The portable app keeps games and scores in <folder>/data. Rebuilding replaces the whole folder,
// so set that data aside first and put it back afterwards.
let saved = null;
const liveData = join(target, 'data');
if (existsSync(liveData)) {
  saved = mkdtempSync(join(tmpdir(), 'qss-data-'));
  cpSync(liveData, saved, { recursive: true });
}

let out;
try {
  [out] = await packager({
    dir: '.',
    name: 'Quiz Show Studio',
    platform: 'win32',
    arch: 'x64',
    out: base,
    overwrite: true,
    prune: false,
    icon: 'build/icon.ico',
    asar: false,
    // ship only the built app and the shell; leave source, tests and tooling behind
    ignore: [/^\/(src|docs|scripts|release|android|ios|build|node_modules|\.git.*|tsconfig\.json|vite\.config\.ts|index\.html|package-lock\.json|capacitor\.config\.ts|README\.md|jeopardy_.*\.txt)(\/|$)/],
    appCopyright: 'Quiz Show Studio',
    // the app is English-only: drop the other Chromium language packs (~40 MB)
    afterExtract: [
      // packager versions differ: the hook gets either (buildPath, ...) or a context object
      async (ctx) => {
        const buildPath = typeof ctx === 'string' ? ctx : ctx.buildPath;
        const dir = join(buildPath, 'locales');
        if (existsSync(dir)) for (const f of readdirSync(dir)) if (f !== 'en-US.pak') rmSync(join(dir, f));
      },
    ],
  });
} catch (e) {
  if (e && e.code === 'EBUSY') {
    console.error('\nThe output folder is in use. Close Quiz Show Studio and run this again (your data is untouched),');
    console.error('or build next to it with:  npm run package:win -- --staging');
    process.exit(1);
  }
  throw e;
}

if (saved) {
  cpSync(saved, join(out, 'data'), { recursive: true });
  rmSync(saved, { recursive: true, force: true });
}

writeFileSync(
  join(out, 'READ ME FIRST.txt'),
  `Quiz Show Studio (portable)\r\n\r\n` +
    `Double-click "Quiz Show Studio.exe". Nothing is installed.\r\n` +
    `Your games, scores and settings are saved in the "data" folder next to the program,\r\n` +
    `so you can copy this whole folder to another PC or a USB stick and keep everything.\r\n\r\n` +
    `Hosting: players join from phones with the room code. This PC needs an internet connection\r\n` +
    `for the first handshake (the free PeerJS broker). Press F11 for full screen.\r\n` +
    `If a second monitor is connected, "Open presentation window" fills it automatically.\r\n`,
);
if (existsSync('README.md')) cpSync('README.md', join(out, 'README (developer notes).md'));
console.log('Packaged to', out);
