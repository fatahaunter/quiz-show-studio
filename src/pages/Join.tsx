import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getBroker, parseBroker } from '../net/broker';
import type { PlayerView } from '../engine/game';
import { PlayerLink, type LinkStatus } from '../net/player';
import { BUZZ_PENALTY_MS, normalizeCode } from '../net/protocol';
import Avatar from '../components/Avatar';
import Countdown from '../components/Countdown';
import { EMOJI_AVATARS, emojiAvatar, fileToAvatar, isAvatar } from '../avatar';
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
  const [avatar, setAvatar] = useState<string | undefined>(isAvatar(profile.avatar) ? profile.avatar : undefined);
  const [avatarErr, setAvatarErr] = useState('');
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
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: name.trim(), color, avatar })); } catch { /* ignore */ }
    // The buzzer is built for landscape. Fullscreen (needs this tap) lets Android browsers lock it that way.
    try { void document.documentElement.requestFullscreen?.().then(() => (screen.orientation as any)?.lock?.('landscape')).catch(() => {}); } catch { /* not supported */ }
    setError('');
    setJoined(true);
    link.current?.stop();
    const l = new PlayerLink(code, { token: token(), name: name.trim(), color, avatar }, {
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
  const showRoom = !view || view.phase === 'lobby'; // the room code is only useful until the game starts
  const hintRotate = <div className="rotate-hint" role="note">Turn your phone sideways for the best view.</div>;

  if (joined && fin) {
    const typed = fin.mode === 'typed';
    return (
      <div className="buzz-page final-page">
        {hintRotate}
        <div className="bp-left">
          <div className="pill"><span className={`dot${status === 'online' ? ' on' : ''}`} /> {status === 'online' ? 'Connected' : 'Reconnecting…'}</div>
          <h1>Final round</h1>
          <div className="state">{fin.category}</div>
          <Avatar name={name} color={color} src={avatar} size={64} />
          <div className="muted">{view?.you.score} pts</div>
        </div>
        <div className="card bp-card">
          {!fin.eligible ? (
            <p>Final round is for players with a positive score. Watch the big screen!</p>
          ) : fin.stage === 'wager' && typed ? (
            <p style={{ fontSize: '1.3rem' }}>Get ready &mdash; everyone answers, worth {fin.value} points. The clue is coming up on the big screen.</p>
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
              {fin.answer && <p className="ok" role="status">Submitted: {fin.answer}. You can change it until time is up.</p>}
            </>
          ) : (
            <p>Answers are being revealed on the big screen.</p>
          )}
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="page join-form" style={{ maxWidth: 760 }}>
        <h1>Join a game</h1>
        <div className="card">
          <div className="join-cols">
            <div>
              <label htmlFor="code">Room code</label>
              <input id="code" type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" value={code} maxLength={5} onChange={(e) => setCode(normalizeCode(e.target.value))} style={{ fontSize: '2rem', letterSpacing: '0.3em', textAlign: 'center' }} />
              <label htmlFor="name">Your name</label>
              <input id="name" type="text" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
              <label>Pick a colour</label>
              <div className="row" role="radiogroup" aria-label="Colour">
                {PLAYER_COLORS.map((c) => (
                  <button key={c} role="radio" aria-checked={c === color} aria-label={c} onClick={() => setColor(c)} className="avatar" style={{ background: c, width: 40, height: 40, border: c === color ? '4px solid #fff' : '4px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            </div>
            <div>
              <label>Profile picture</label>
              <div className="row">
                <Avatar name={name || '?'} color={color} src={avatar} size={84} />
                <div className="grow">
                  <label className="btn" style={{ display: 'inline-flex', margin: 0, cursor: 'pointer', color: 'var(--text)' }}>
                    Choose photo
                    <input type="file" accept="image/*" hidden aria-label="Choose a profile photo" onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      try { setAvatarErr(''); setAvatar(await fileToAvatar(f)); } catch { setAvatarErr('Could not use that image. Try another.'); }
                    }} />
                  </label>{' '}
                  {avatar && <button className="btn small" onClick={() => setAvatar(undefined)}>Remove</button>}
                </div>
              </div>
              <div className="row" style={{ gap: 6, marginTop: 8 }} aria-label="Or pick an emoji">
                {EMOJI_AVATARS.map((em) => (
                  <button key={em} className="btn small" style={{ fontSize: '1.3rem', padding: '0 6px', minHeight: 38 }} aria-label={`Use ${em}`} onClick={() => { try { setAvatarErr(''); setAvatar(emojiAvatar(em, color)); } catch { setAvatarErr('Could not make that picture.'); } }}>{em}</button>
                ))}
              </div>
              {avatarErr && <p className="err" role="alert">{avatarErr}</p>}
              <p className="muted" style={{ margin: '8px 0 0' }}>Shown under your score on the big screen.</p>
            </div>
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
      {mode === 'count' && (
        <div className="cd-full" role="status" aria-label="Buzzers opening" onPointerDown={(e) => { e.preventDefault(); buzz(); }}>
          <Countdown className="fill" />
        </div>
      )}
      {hintRotate}
      <div className="bp-top">
        <span className="pill"><span className={`dot${status === 'online' ? ' on' : ''}`} /> {status === 'online' ? 'Connected' : status === 'reconnecting' ? 'Reconnecting…' : status === 'failed' ? 'Disconnected' : 'Connecting…'}</span>
        {showRoom && <span className="pill">Room {code}</span>}
      </div>
      <div className="bp-left">
        <Avatar name={name} color={color} src={avatar} size={88} className="me" />
        <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{name}</div>
        <div className="muted" style={{ fontSize: '1.4rem' }}>{view ? `${view.you.score} pts` : ''}</div>
      </div>
      <button className={`buzzer ${mode === 'armed' ? 'armed' : mode === 'won' ? 'won' : mode === 'locked' || mode === 'cool' ? 'locked' : ''}`} disabled={mode === 'wait' || mode === 'done'} onPointerDown={(e) => { e.preventDefault(); buzz(); }} aria-label={label}>
        {label}
      </button>
      <div className="bp-right">
        <div role="status" style={{ fontSize: '1.1rem' }}>{hint}</div>
        {view && view.standings.length > 0 && (
          <div className="muted" style={{ marginTop: 6 }}>{view.standings.slice(0, 3).map((s, i) => `${i + 1}. ${s.name} ${s.score}`).join('  ·  ')}</div>
        )}
      </div>
    </div>
  );
}
