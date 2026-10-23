import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { loadPrefs, savePrefs, type Prefs } from './store/storage';
import Home from './pages/Home';
import { formatBroker, getBroker, parseBroker, setBroker } from './net/broker';
import { getSite, normalizeSite, setSite } from './net/site';

const Editor = lazy(() => import('./pages/Editor'));
const Host = lazy(() => import('./pages/Host'));
const Present = lazy(() => import('./pages/Present'));
const Join = lazy(() => import('./pages/Join'));
const Print = lazy(() => import('./pages/Print'));
const History = lazy(() => import('./pages/History'));

function applyPrefs(p: Prefs) {
  const r = document.documentElement;
  r.dataset.theme = p.theme;
  r.classList.toggle('reduce-motion', p.reduceMotion);
}

function Connection() {
  const [site, setSiteText] = useState(getSite() ?? '');
  const [broker, setBrokerText] = useState(getBroker() ? formatBroker(getBroker()!) : '');
  const [msg, setMsg] = useState('');
  function save() {
    const s = site.trim() ? normalizeSite(site) : null;
    const b = broker.trim() ? parseBroker(broker) : null;
    if (site.trim() && !s) return setMsg('The website address must start with https:// (or http://).');
    if (broker.trim() && !b) return setMsg('Server must look like 192.168.1.20:9000 (add :s for https/wss).');
    setSite(s);
    setBroker(b);
    setMsg('Saved.');
  }
  return (
    <div className="card" style={{ maxWidth: 520, marginTop: 16 }}>
      <h3>Connection</h3>
      <label htmlFor="site">Your website address (for the QR code and join link)</label>
      <input id="site" type="text" placeholder="https://example.com/quiz/" value={site} onChange={(e) => setSiteText(e.target.value)} />
      <p className="muted">Only needed in the desktop or phone app. In a browser the current address is used.</p>
      <label htmlFor="broker">Custom connection server (optional)</label>
      <input id="broker" type="text" placeholder="192.168.1.20:9000" value={broker} onChange={(e) => setBrokerText(e.target.value)} />
      <p className="muted">Leave empty to use the free public PeerJS server. To play with no internet, run <code>npx peerjs --port 9000</code> on the host PC and enter its Wi-Fi address here; the QR code carries it to players.</p>
      <div className="row"><button className="btn primary" onClick={save}>Save</button><span role="status" className={msg === 'Saved.' ? 'ok' : 'err'}>{msg}</span></div>
    </div>
  );
}

function Settings({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  const up = (patch: Partial<Prefs>) => setPrefs({ ...prefs, ...patch });
  return (
    <div className="page">
      <h1>Settings</h1>
      <div className="card" style={{ maxWidth: 520 }}>
        <label htmlFor="theme">Theme</label>
        <select id="theme" value={prefs.theme} onChange={(e) => up({ theme: e.target.value as Prefs['theme'] })}>
          <option value="neon">Neon Quiz Arena</option>
          <option value="classic">Classic Quiz Show</option>
          <option value="minimal">Minimal Competition</option>
        </select>
        <label><input type="checkbox" checked={prefs.sound} onChange={(e) => up({ sound: e.target.checked })} /> Sound effects</label>
        <label htmlFor="vol">Volume</label>
        <input id="vol" type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => up({ volume: Number(e.target.value) })} />
        <label><input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => up({ reduceMotion: e.target.checked })} /> Reduce motion</label>
        <p className="muted">Settings are stored on this device only.</p>
      </div>
      <Connection />
    </div>
  );
}

function Help() {
  return (
    <div className="page">
      <h1>How to play</h1>
      <div className="card">
        <ol>
          <li>Pick a game on the home page (or build one with <b>Create</b>) and press <b>Host</b>.</li>
          <li>Players open the join link (or scan the QR code) on their phones and enter the room code.</li>
          <li>On the host screen press <b>Start game</b>, pick a clue, then <b>Arm buzzer</b>. Phones cannot buzz until you arm it.</li>
          <li>Judge the winner with <b>Correct</b> / <b>Incorrect</b> (keys <kbd>Y</kbd> / <kbd>N</kbd>). Wrong answers lock that player out for the clue.</li>
          <li>For a second screen, press <b>Open presentation window</b> and drag it to the TV; press <b>F11</b> there for full screen.</li>
        </ol>
        <p className="muted">No phones? Add <b>local players</b> on the host screen and buzz with number keys 1&ndash;8.</p>
      </div>
    </div>
  );
}

export default function App() {
  const [prefs, setPrefsState] = useState(loadPrefs);
  const loc = useLocation();
  useEffect(() => applyPrefs(prefs), [prefs]);
  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    savePrefs(p);
  };
  // The presentation and phone screens are chrome-free.
  const bare = loc.pathname.startsWith('/present') || loc.pathname.startsWith('/join');

  return (
    <>
      {!bare && (
        <nav className="nav" aria-label="Main">
          <NavLink to="/" className="brand">QUIZ SHOW STUDIO</NavLink>
          <NavLink to="/" end className="link">Home</NavLink>
          <NavLink to="/join" className="link">Join</NavLink>
          <NavLink to="/history" className="link">Scores</NavLink>
          <NavLink to="/help" className="link">Help</NavLink>
          <NavLink to="/settings" className="link">Settings</NavLink>
        </nav>
      )}
      <Suspense fallback={<div className="page muted">Loading&hellip;</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/edit/:id" element={<Editor />} />
          <Route path="/host/:gameId" element={<Host />} />
          <Route path="/print/:id" element={<Print />} />
          <Route path="/history" element={<History />} />
          <Route path="/present" element={<Present />} />
          <Route path="/join/:code?" element={<Join />} />
          <Route path="/help" element={<Help />} />
          <Route path="/settings" element={<Settings prefs={prefs} setPrefs={setPrefs} />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </>
  );
}
