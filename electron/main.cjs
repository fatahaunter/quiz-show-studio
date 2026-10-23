// Desktop shell for Quiz Show Studio. Loads the built web app (dist/) through a private app:// scheme
// so it runs as a secure context (wake lock, crypto, etc.) without any web server.
const { app, BrowserWindow, Menu, protocol, net, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const HOME = 'app://quiz/index.html';

// Portable mode: keep games, scores and settings in ./data next to the program so the whole
// folder can be copied between PCs or a USB stick. Falls back to the normal profile folder if
// that location is read-only (e.g. installed under Program Files).
if (app.isPackaged) {
  const data = path.join(path.dirname(process.execPath), 'data');
  try {
    fs.mkdirSync(data, { recursive: true });
    fs.accessSync(data, fs.constants.W_OK);
    app.setPath('userData', data);
  } catch {
    /* use default */
  }
}

// WebRTC normally hides this PC's LAN address behind a random ".local" name that many phones cannot
// resolve. For a same-Wi-Fi party game, expose the real address so phones connect directly.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit(); // a second copy would fight over the same data folder
}

let main = null;

function webPrefs() {
  return { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false };
}

function createMain() {
  main = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#080d22',
    title: 'Quiz Show Studio',
    autoHideMenuBar: true,
    show: false,
    webPreferences: webPrefs(),
  });
  main.once('ready-to-show', () => main.show());
  main.loadURL(HOME);
  main.on('closed', () => {
    main = null;
    app.quit(); // closing the host window ends the program, popups included
  });
  hookWindow(main);
}

/** Shared behaviour for every window: popups, navigation lock, external links, shortcuts. */
function hookWindow(win) {
  const wc = win.webContents;

  // "Open presentation window" uses window.open. Allow our own pages only; send web links to the browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('app://')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 720,
          backgroundColor: '#080d22',
          autoHideMenuBar: true,
          title: 'Quiz Show Studio — Presentation',
          webPreferences: webPrefs(),
        },
      };
    }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  wc.on('did-create-window', (child) => {
    // Put the presentation on a second monitor when one is connected, and go full screen there.
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const other = displays.find((d) => d.id !== primary.id);
    if (other) {
      child.setBounds(other.bounds);
      child.setFullScreen(true);
    }
    hookWindow(child);
  });

  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  // F11 full screen, Esc leaves it, Ctrl +/-/0 zoom.
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false);
    } else if (input.control && (input.key === '=' || input.key === '+')) {
      wc.setZoomLevel(wc.getZoomLevel() + 0.5);
      e.preventDefault();
    } else if (input.control && input.key === '-') {
      wc.setZoomLevel(wc.getZoomLevel() - 0.5);
      e.preventDefault();
    } else if (input.control && input.key === '0') {
      wc.setZoomLevel(0);
      e.preventDefault();
    }
  });
}

function serveDist() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(DIST, rel));
    // never serve anything outside dist/ (path traversal)
    if (file !== DIST && !file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

app.whenReady().then(() => {
  serveDist();

  // Only what the app needs: full screen for the presentation, wake lock to keep the screen on.
  const allowed = new Set(['fullscreen', 'screen-wake-lock', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'togglefullscreen' },
          { type: 'separator' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'resetZoom' },
          ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }]),
        ],
      },
    ]),
  );

  createMain();
});

app.on('second-instance', () => {
  if (main) {
    if (main.isMinimized()) main.restore();
    main.focus();
  }
});

app.on('window-all-closed', () => app.quit());
