import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getBroker, parseBroker } from '../net/broker';
import type { PlayerView } from '../engine/game';
import { PlayerLink, type LinkStatus } from '../net/player';
import { BUZZ_PENALTY_MS, normalizeCode } from '../net/protocol';
import Countdown from '../components/Countdown';
import FinalTimer from '../components/FinalTimer';
import { sfx, unlockAudio } from '../sound';
import { PLAYER_COLORS, uid } from '../types';
import { useWakeLock } from '../wakelock';

const TOKEN_KEY = 'qss:player-token';
const PROFILE_KEY = 'qss:player-profile';

function token() {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) { t = uid() + uid() + uid(); localStorage.setItem(TOKEN_KEY, t); }
    return t;
  } catch { return uid() + uid() + uid(); }
}

export default function Join() {
  const { code: paramCode } = useParams();
  const nav = useNavigate();
  const [search] = useSearchParams();
  const profile = (() => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); } catch { return {}; } })();
  const [code, setCode] = useState(normalizeCode(paramCode ?? ''));
  const [name, setName] = useState<string>(profile.name ?? '');
  const [color, setColor] = useState<string>(profile.color ?? PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<LinkStatus>('connecting');
  const [view, setView] = useState<PlayerView | null>(null);
  const [sent, setSent] = useState<string | null>(null); // qid we already buzzed on
  const link = useRef<PlayerLink | null>(null);
  const [draft, setDraft] = useState('');
  const coolUntil = useRef(0);
  const [cooling, setCooling] = useState(false);
  useWakeLock();
  const viewRef = useRef<PlayerView | null>(null);
  viewRef.current = view;

  useEffect(() => () => link.current?.stop(), []);

  function connect() {
    if (code.length !== 5 || !name.trim()) return;
    unlockAudio();
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: name.trim(), color })); } catch { /* ignore */ }
    setError('');
    setJoined(true);
    link.current?.stop();
    const l = new PlayerLink(code, { token: token(), name: name.trim(), color }, {
      onView: (v) => {
        const p = viewRef.current;
        if (v.buzzer === 'armed' && p?.buzzer !== 'armed') { sfx.armed(); navigator.vibrate?.(60); }
        if (v.youWon && !p?.youWon) { sfx.correct(); navigator.vibrate?.([80, 40, 80]); }
        if (v.youLocked && !p?.youLocked) sfx.wrong();
        setView(v);
      },
      onStatus: setStatus,
      onError: (_c, m) => { setError(m); setJoined(false); l.stop(); },
    }, parseBroker(search.get('b') ?? '') ?? getBroker()); // the host's QR code carries a custom server if one is set
    link.current = l;
    l.start();
  }

  const armed = view?.buzzer === 'armed' && !view.youLocked;
  const canBuzz = armed && !!view?.qid && sent !== view.qid;

  function penalize(ms: number) {
    coolUntil.current = Date.now() + ms;
    setCooling(true);
    setTimeout(() => Date.now() >= coolUntil.current && setCooling(false), ms + 20);
  }

  function buzz() {
    if (!view || view.phase !== 'clue' || view.youWon || view.youLocked) return;
    if (Date.now() < coolUntil.current) return; // still in the delay
    if (view.buzzer === 'armed' && view.qid) {
      if (!canBuzz) return; // already sent for this question
      setSent(view.qid); // one tap per question from this device; the host decides who was first
      navigator.vibrate?.(30);
      link.current?.buzz(view.qid);
    } else if ((view.buzzer === 'disabled' || view.buzzer === 'countdown') && view.qid) {
      // Too early: the host enforces the same delay, this just shows it.
      link.current?.buzz(view.qid);
      penalize(BUZZ_PENALTY_MS);
      sfx.wrong();
      navigator.vibrate?.([40, 30, 40]);
    }
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); buzz(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // a new armed window (after a reopen) allows a fresh tap
  useEffect(() => { if (view?.buzzer !== 'armed') setSent(null); }, [view?.buzzer]);

  const fin = view?.phase === 'final' ? view.final : undefined;
  if (joined && fin) {
    return (
      <div className="buzz-page" style={{ justifyContent: 'flex-start' }}>
        <div className="pill"><span className={`dot${status === 'online' ? ' on' : ''}`} /> {status === 'online' ? 'Connected' : 'Reconnecting\u2026'}</div>
        <h1>Final round</h1>
        <div className="state">{fin.category}</div>
        <div className="card" style={{ width: '100%', maxWidth: 480, textAlign: 'left' }}>
          {!fin.eligible ? (
            <p>Final round is for players with a positive score. Watch the big screen!</p>
          ) : fin.stage === 'wager' ? (
            <>
              <label htmlFor="wg">Your wager (0&ndash;{fin.maxWager})</label>
              <input id="wg" type="number" inputMode="numeric" min={0} max={fin.maxWager} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn primary big" style={{ width: '100%', marginTop: 12 }} disabled={draft === '' || Number(draft) < 0 || Number(draft) > fin.maxWager} onClick={() => { link.current?.wager(Number(draft)); }}>Lock wager</button>
              {fin.wager != null && <p className="ok" role="status">Wager locked: {fin.wager}. You can change it until the host shows the clue.</p>}
            </>
          ) : fin.stage === 'clue' ? (
            <>
              {fin.deadline && <div style={{ textAlign: 'center' }}><FinalTimer deadline={fin.deadline} sentAt={fin.sentAt} className="bigtimer" /></div>}
              <p style={{ fontSize: '1.2rem' }}>{fin.clue}</p>
              <label htmlFor="fa">Your answer</label>
              <input id="fa" type="text" maxLength={200} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn primary big" style={{ width: '100%', marginTop: 12 }} disabled={!draft.trim()} onClick={() => link.current?.answer(draft)}>Submit answer</button>
              {fin.answer && <p className="ok" role="status">Submitted: {fin.answer}</p>}
            </>
          ) : (
            <p>Answers are being revealed on the big screen.</p>
          )}
        </div>
        <div className="muted">{view?.you.score} pts</div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="page" style={{ maxWidth: 460 }}>
        <h1>Join a game</h1>
        <div className="card">
          <label htmlFor="code">Room code</label>
          <input id="code" type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" value={code} maxLength={5} onChange={(e) => setCode(normalizeCode(e.target.value))} style={{ fontSize: '2rem', letterSpacing: '0.3em', textAlign: 'center' }} />
          <label htmlFor="name">Your name</label>
          <input id="name" type="text" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          <label>Pick a colour</label>
          <div className="row" role="radiogroup" aria-label="Colour">
            {PLAYER_COLORS.map((c) => (
              <button key={c} role="radio" aria-checked={c === color} aria-label={c} onClick={() => setColor(c)} className="avatar" style={{ background: c, width: 44, height: 44, border: c === color ? '4px solid #fff' : '4px solid transparent', cursor: 'pointer' }}>{c === color ? name[0]?.toUpperCase() ?? '' : ''}</button>
            ))}
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn primary big grow" disabled={code.length !== 5 || !name.trim()} onClick={connect}>Join</button>
            <button className="btn big" onClick={() => nav('/')}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  const mode = !view ? 'wait' : view.phase === 'finished' ? 'done' : view.youLocked && view.buzzer !== 'none' ? 'locked' : view.youWon ? 'won' : cooling ? 'cool' : view.buzzer === 'countdown' ? 'count' : armed ? (canBuzz ? 'armed' : 'sent') : 'off';
  const label = { wait: 'Joining…', done: 'Game over', locked: 'LOCKED OUT', won: 'YOU BUZZED!', armed: 'BUZZ!', sent: 'SENT', off: 'WAIT', cool: 'TOO EARLY', count: 'GET READY' }[mode];
  const hint = !view ? 'Connecting to the host…'
    : view.phase === 'lobby' ? 'You are in. Waiting for the host to start.'
    : view.phase === 'board' ? 'Waiting for the next clue.'
    : view.phase === 'finished' ? 'Thanks for playing!'
    : mode === 'count' ? 'Get ready…'
    : cooling ? 'You tapped before the host opened the buzzer. Wait a moment.'
    : view.youWon ? 'Answer out loud — the host will judge it.'
    : view.winnerName ? `${view.winnerName} buzzed first.`
    : view.youLocked ? 'You missed this one. Wait for the next clue.'
    : view.buzzer === 'armed' ? (canBuzz ? 'Tap now!' : 'Buzz sent — waiting for the host.')
    : view.buzzer === 'resolved' ? 'Clue finished.' : 'Buzzers are off until the host opens them. Tapping early adds a delay.';

  return (
    <div className="buzz-page">
      <div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
        <span className="pill"><span className={`dot${status === 'online' ? ' on' : ''}`} /> {status === 'online' ? 'Connected' : status === 'reconnecting' ? 'Reconnecting…' : status === 'failed' ? 'Disconnected' : 'Connecting…'}</span>
        <span className="pill">Room {code}</span>
      </div>
      <div>
        <div className="avatar" style={{ background: color, width: 72, height: 72, fontSize: '2rem', margin: '0 auto 6px' }}>{name[0]?.toUpperCase()}</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{name}</div>
        <div className="muted" style={{ fontSize: '1.2rem' }}>{view ? `${view.you.score} pts` : ''}</div>
      </div>
      <button className={`buzzer ${mode === 'count' ? 'counting' : ''} ${mode === 'armed' ? 'armed' : mode === 'won' ? 'won' : mode === 'locked' || mode === 'cool' ? 'locked' : ''}`} disabled={mode === 'wait' || mode === 'done'} onPointerDown={(e) => { e.preventDefault(); buzz(); }} aria-label={label}>
        {mode === 'count' ? <Countdown /> : label}
      </button>
      <div>
        <div role="status" style={{ fontSize: '1.1rem' }}>{hint}</div>
        {view && view.standings.length > 0 && (
          <div className="muted" style={{ marginTop: 6 }}>{view.standings.slice(0, 3).map((s, i) => `${i + 1}. ${s.name} ${s.score}`).join('  ·  ')}</div>
        )}
      </div>
    </div>
  );
}
