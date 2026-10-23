import { useConfirm } from '../components/Confirm';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { isNative } from '../native';
import { createBuzzGate } from '../engine/gate';
import Countdown from '../components/Countdown';
import FinalPanel from '../components/FinalPanel';
import Screen from '../components/Screen';
import { useWakeLock } from '../wakelock';
import { resultFromState, saveResult } from '../store/history';
import Avatar from '../components/Avatar';
import { clueCategory, clueOf, createState, finalMode, totalQuestions, maxWager, playerView, publicView, reduce, standings, type Action, type GameState } from '../engine/game';
import { HostLink } from '../net/host';
import { formatBroker, getBroker } from '../net/broker';
import { publicBase } from '../net/site';
import { COUNTDOWN_FROM, COUNTDOWN_STEP_MS, BUZZ_PENALTY_MS, makeRoomCode, PRESENT_CHANNEL, PUBLIC_KEY } from '../net/protocol';
import { sfx, unlockAudio } from '../sound';
import { clearSession, loadGame, loadSession, saveSession } from '../store/storage';
import { MAX_CATEGORIES, MIN_CATEGORIES, PLAYER_COLORS, uid } from '../types';
import { Link } from 'react-router-dom';

const MAX_PLAYERS = 20;

export default function Host() {
  const [ask, dialog] = useConfirm();
  const { gameId } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState<GameState | null>(null);
  const [code, setCode] = useState('');
  const [net, setNet] = useState<'connecting' | 'open' | 'error'>('connecting');
  const [netDetail, setNetDetail] = useState('');
  const [locked, setLocked] = useState(false);
  const [qr, setQr] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [wager, setWager] = useState('');
  const [localName, setLocalName] = useState('');
  const [audioOn, setAudioOn] = useState(false);

  const st = useRef<GameState | null>(null);
  const tokens = useRef<Record<string, string>>({});
  const lockedRef = useRef(false);
  const link = useRef<HostLink | null>(null);
  const chan = useRef<BroadcastChannel | null>(null);
  const codeRef = useRef('');
  const gate = useRef(createBuzzGate(BUZZ_PENALTY_MS));
  const joinInfo = useRef<{ code: string; url?: string; qr?: string } | undefined>(undefined);
  useWakeLock();
  lockedRef.current = locked;
  codeRef.current = code;

  const dispatch = useCallback((a: Action) => {
    if (!st.current) return;
    const next = reduce(st.current, a);
    if (next === st.current) return;
    const prev = st.current;
    st.current = next;
    setState(next);
    // sound cues on the host machine
    if (a.t === 'judge') (next.events.length > prev.events.length && next.events[next.events.length - 1].delta > 0 ? sfx.correct : sfx.wrong)();
    else if (a.t === 'buzz') sfx.buzz();
    else if (a.t === 'arm' && next.current?.buzzer === 'armed') sfx.armed();
    else if (a.t === 'select') (next.current?.dd ? sfx.dailyDouble : sfx.reveal)();
    else if (a.t === 'finalJudge') (next.events[next.events.length - 1]?.delta > 0 ? sfx.correct : sfx.wrong)();
    if (next.phase === 'finished' && prev.phase !== 'finished') {
      sfx.win();
      saveResult(resultFromState(next, `${codeRef.current}-${next.events.length}-${next.used.length}`));
    }
  }, []);

  /**
   * Every buzz (phone or keyboard) enters here. The buzzer only works while the host has armed it.
   * Pressing while it is still closed is penalised, so mashing the button before the host opens it
   * costs that player a short delay. Order among legitimate buzzes is decided by the engine.
   */
  const tryBuzz = useCallback((pid: string, qid: string) => {
    if (gate.current.admit(pid, st.current)) dispatch({ t: 'buzz', playerId: pid, qid });
  }, [dispatch]);

  // ---- bootstrap: resume a saved session or start a new one ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = loadSession();
      if (gameId === 'resume' || (saved && saved.state.game.id === gameId && saved.state.phase !== 'finished')) {
        if (!saved) return nav('/');
        // everyone is considered offline until their phone re-announces itself
        const s = { ...saved.state, players: saved.state.players.map((p) => ({ ...p, connected: !!p.local })) };
        tokens.current = saved.tokens;
        setLocked(saved.locked);
        st.current = s;
        setState(s);
        setCode(saved.code);
        return;
      }
      const g = await loadGame(gameId!);
      if (cancelled) return;
      if (!g) return nav('/');
      const c = makeRoomCode();
      st.current = createState(g);
      tokens.current = {};
      setState(st.current);
      setCode(c);
    })();
    return () => { cancelled = true; };
  }, [gameId, nav]);

  // ---- networking ----
  useEffect(() => {
    if (!code) return;
    const l = new HostLink(code, {
      onHello(token, name, color, avatar) {
        const s = st.current!;
        const known = tokens.current[token];
        if (known && s.players.some((p) => p.id === known)) {
          if (avatar !== s.players.find((p) => p.id === known)?.avatar) dispatch({ t: 'setAvatar', id: known, avatar });
          return { playerId: known };
        }
        if (lockedRef.current) return { error: 'room-locked', message: 'The host has locked this room.' };
        if (s.players.length >= MAX_PLAYERS) return { error: 'room-full', message: 'This room is full.' };
        if (s.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return { error: 'name-taken', message: 'That name is taken — pick another.' };
        const id = uid();
        tokens.current[token] = id;
        dispatch({ t: 'addPlayer', player: { id, name, color, avatar } });
        return { playerId: id };
      },
      onBuzz: (pid, qid) => tryBuzz(pid, qid),
      onWager: (pid, amount) => dispatch({ t: 'finalWager', playerId: pid, amount }),
      onAnswer: (pid, text) => {
        const dl = st.current?.final?.deadline;
        if (dl && Date.now() > dl + 1500) return; // time is up (1.5s grace for network delay)
        dispatch({ t: 'finalAnswer', playerId: pid, text });
      },
      onConnection: (pid, connected) => dispatch({ t: 'setConnected', id: pid, connected }),
      onStatus(s, d) { setNet(s); setNetDetail(d ?? ''); },
    });
    link.current = l;
    l.start();
    return () => { l.stop(); link.current = null; };
  }, [code, dispatch, tryBuzz]);

  // ---- QR ----
  const broker = getBroker();
  // The public web address of the app, so phones can open it. Inside the desktop/phone app the page origin is private (app://), so use the hosted site instead if one is set.
  const base = publicBase();
  const joinUrl = code && base ? `${base}#/join/${code}${broker ? `?b=${formatBroker(broker)}` : ''}` : '';
  useEffect(() => {
    if (joinUrl) QRCode.toDataURL(joinUrl, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(''));
  }, [joinUrl]);
  joinInfo.current = { code, url: joinUrl || undefined, qr: qr || undefined };

  // ---- fan-out on every state change: persistence, presentation window, phones ----
  useEffect(() => {
    if (!state || !code) return;
    saveSession({ code, state, tokens: tokens.current, locked });
    const pv = publicView(state, joinInfo.current);
    try { localStorage.setItem(PUBLIC_KEY, JSON.stringify(pv)); } catch { /* too large; BroadcastChannel still works */ }
    chan.current?.postMessage(pv);
    for (const p of state.players) {
      if (p.local) continue;
      const v = playerView(state, p.id);
      if (v) link.current?.send(p.id, v);
    }
  }, [state, code, locked, net, qr, joinUrl]);

  useEffect(() => {
    const bc = new BroadcastChannel(PRESENT_CHANNEL);
    chan.current = bc;
    bc.onmessage = (e) => { if (e.data === 'hello' && st.current) bc.postMessage(publicView(st.current, joinInfo.current)); };
    return () => bc.close();
  }, []);

  // ---- 3-2-1: the buzzer really opens when the countdown ends ----
  const counting = state?.current?.buzzer === 'countdown';
  useEffect(() => {
    if (!counting) return;
    const t = setTimeout(() => dispatch({ t: 'arm' }), COUNTDOWN_FROM * COUNTDOWN_STEP_MS);
    return () => clearTimeout(t);
  }, [counting, state?.current?.qid, dispatch]);

  // ---- Final round: end the answer stage automatically when the timer runs out ----
  const finalDeadline = state?.final?.stage === 'clue' ? state.final.deadline : undefined;
  useEffect(() => {
    if (!finalDeadline) return;
    const t = setTimeout(() => dispatch({ t: 'finalAdvance' }), Math.max(0, finalDeadline - Date.now()) + 1500);
    return () => clearTimeout(t);
  }, [finalDeadline, dispatch]);

  // ---- optional auto-close of the buzz window ----
  const armed = state?.current?.buzzer === 'armed';
  const qid = state?.current?.qid;
  const windowSec = state?.game.rules.buzzWindowSec ?? 0;
  useEffect(() => {
    if (!armed || !windowSec) return;
    const t = setTimeout(() => dispatch({ t: 'disarm' }), windowSec * 1000);
    return () => clearTimeout(t);
  }, [armed, windowSec, qid, dispatch]);

  // ---- keyboard: local pass-and-play buzzers + host shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = st.current;
      if (!s?.current) return;
      const local = s.players.find((p) => p.local && p.key === e.key);
      if (local) return tryBuzz(local.id, s.current.qid);
      const k = e.key.toLowerCase();
      if (k === 'y') dispatch({ t: 'judge', correct: true });
      else if (k === 'n') dispatch({ t: 'judge', correct: false });
      else if (k === 'enter') dispatch({ t: s.current.buzzer === 'armed' || s.current.buzzer === 'countdown' ? 'disarm' : 'countdown' });
      else if (k === 's') dispatch({ t: 'showAnswer' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, tryBuzz]);

  if (!state) return <div className="page muted">Loading&hellip;</div>;
  const ncat = state.game.categories.length;
  if (state.phase === 'lobby' && (ncat < MIN_CATEGORIES || ncat > MAX_CATEGORIES)) {
    return (
      <div className="page">
        <div className="card">
          <h2>This board can't be hosted yet</h2>
          <p>A game needs {MIN_CATEGORIES} to {MAX_CATEGORIES} categories and this one has {ncat}.</p>
          <Link className="btn primary" to={`/edit/${state.game.id}`}>Open the editor</Link>
        </div>
      </div>
    );
  }

  const c = state.current;
  const q = c ? clueOf(state, c) : undefined;
  const winner = state.players.find((p) => p.id === c?.winnerId);
  const pv = publicView(state, joinInfo.current);
  const chooser = state.players.find((p) => p.id === state.chooserId);

  function addLocal() {
    const name = localName.trim().slice(0, 20);
    if (!name) return;
    const used = new Set(state!.players.filter((p) => p.local).map((p) => p.key));
    const key = '12345678'.split('').find((k) => !used.has(k));
    if (!key) return;
    dispatch({ t: 'addPlayer', player: { id: uid(), name, color: PLAYER_COLORS[state!.players.length % 8], local: true, key } });
    setLocalName('');
  }

  async function newSession() {
    if (!await ask('Discard this session and start a fresh lobby? Scores will be lost.')) return;
    clearSession();
    nav('/');
  }

  return (
    <div className="page wide">
      {dialog}
      {!audioOn && (
        <div className="card row" style={{ marginBottom: 12 }}>
          <span className="grow">Sound effects need one click to enable in your browser.</span>
          <button className="btn gold" onClick={() => { unlockAudio(); setAudioOn(true); sfx.armed(); }}>Enable audio</button>
        </div>
      )}

      {state.phase === 'lobby' ? (
      <div className="card row" style={{ marginBottom: 14 }}>
        <div>
          <div className="muted">Room code</div>
          <div className="code" aria-label={`Room code ${code.split('').join(' ')}`}>{code}</div>
          <span className="pill"><span className={`dot${net === 'open' ? ' on' : ''}`} /> {net === 'open' ? 'Room online' : net === 'connecting' ? 'Connecting…' : `Connection problem (${netDetail || 'unknown'})`}</span>
        </div>
        {qr && <img src={qr} alt={`QR code for ${joinUrl}`} width={130} height={130} style={{ borderRadius: 8, background: '#fff' }} />}
        <div className="grow">
          <div className="muted">Players open</div>
          {joinUrl ? <div style={{ wordBreak: 'break-all' }}><b>{joinUrl}</b></div> : <div><b>Open the Quiz Show Studio app, tap Join, and type the code.</b> <span className="muted">(Set your website address in Settings to get a QR code and link.)</span></div>}
          <div className="row" style={{ marginTop: 8 }}>
            {!isNative() && <button className="btn small" onClick={() => window.open('#/present', 'qss-present', 'popup,width=1280,height=720')}>Open presentation window</button>}
            <button className="btn small" onClick={() => setFullscreen(true)}>Show on this screen</button>
            <button className="btn small" onClick={() => setLocked(!locked)}>{locked ? 'Unlock room' : 'Lock room'}</button>
            <button className="btn small bad" onClick={newSession}>End session</button>
          </div>
        </div>
      </div>
      ) : (
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="pill"><span className={`dot${net === 'open' ? ' on' : ''}`} /> {net === 'open' ? 'Room online' : net === 'connecting' ? 'Connecting…' : `Connection problem (${netDetail || 'unknown'})`}</span>
          <span className="grow" />
          {!isNative() && <button className="btn small" onClick={() => window.open('#/present', 'qss-present', 'popup,width=1280,height=720')}>Open presentation window</button>}
          <button className="btn small" onClick={() => setFullscreen(true)}>Show on this screen</button>
          <button className="btn small" onClick={() => setLocked(!locked)}>{locked ? 'Unlock room' : 'Lock room'}</button>
          <button className="btn small bad" onClick={newSession}>End session</button>
        </div>
      )}

      <div className="hostgrid">
        <div>
          {state.phase === 'lobby' && (
            <div className="card">
              <h2>Lobby</h2>
              <p className="muted">Waiting for players. Phones join with the code above. {state.players.length} joined.</p>
              <button className="btn primary big" disabled={state.players.length === 0} onClick={() => { unlockAudio(); dispatch({ t: 'start' }); }}>Start game</button>
            </div>
          )}

          {state.phase === 'board' && (
            <div className="card">
              <div className="row">
                <h2 className="grow">Pick a clue {chooser && <span className="muted">&mdash; {chooser.name} has control</span>}</h2>
                {state.game.final && !state.final && (
                  <button className={`btn ${state.used.length >= totalQuestions(state.game) ? 'primary big' : ''}`} disabled={!state.game.final.clue.trim() || !state.game.final.answer.trim()} title={!state.game.final.clue.trim() ? 'Fill in the Final clue and answer in the editor first' : undefined} onClick={async () => { if (state.used.length >= totalQuestions(state.game) || await ask('Skip the remaining clues and go to the Final round?')) dispatch({ t: 'startFinal' }); }}>Start Final round</button>
                )}
              </div>
              <div style={{ fontSize: '0.8rem' }}>
                <Screen embedded v={pv} onPick={(cat, idx) => dispatch({ t: 'select', cat, idx })} />
              </div>
            </div>
          )}

          {state.phase === 'clue' && c && q && (
            <div className="card">
              <div className="row">
                <h2 className="grow" style={{ margin: 0 }}>{c.final ? `FINAL QUESTION · ${clueCategory(state, c)}` : clueCategory(state, c)} &middot; {q.value}{c.dd ? ' · DAILY DOUBLE' : ''}</h2>
                <span className="pill">Buzzer: <b>{c.buzzer.toUpperCase()}</b></span>
              </div>
              <p style={{ fontSize: '1.3rem' }}>{q.clue || <i className="muted">(blank clue)</i>}</p>
              <div className="notes">
                <div className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1 }}>Host only &mdash; players and the presentation screen cannot see this</div>
                <b>Answer:</b> {q.answer}
                {q.alts.length > 0 && <div className="muted">Also accept: {q.alts.join(', ')}</div>}
                {q.hostNotes && <div className="muted">Notes: {q.hostNotes}</div>}
              </div>

              {c.dd && c.wager === undefined && chooser && (
                <div className="row">
                  <span>{chooser.name}'s wager (max {maxWager(state, chooser.id)}):</span>
                  <input type="number" min={0} value={wager} onChange={(e) => setWager(e.target.value)} style={{ width: 120 }} aria-label="Wager" />
                  <button className="btn gold" onClick={() => { dispatch({ t: 'setWager', amount: Number(wager) }); setWager(''); }}>Lock wager</button>
                </div>
              )}

              {winner && c.buzzer === 'awarded' && (
                <p style={{ fontSize: '1.4rem' }}>&#9654; <b style={{ color: winner.color }}>{winner.name}</b> {c.dd ? `(wagered ${c.wager})` : 'buzzed in'}</p>
              )}

              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn good big" disabled={c.buzzer !== 'awarded'} onClick={() => dispatch({ t: 'judge', correct: true })}>Correct <kbd>Y</kbd></button>
                <button className="btn bad big" disabled={c.buzzer !== 'awarded'} onClick={() => dispatch({ t: 'judge', correct: false })}>Incorrect <kbd>N</kbd></button>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                {c.buzzer === 'armed' || c.buzzer === 'countdown' ? (
                  <button className="btn big" onClick={() => dispatch({ t: 'disarm' })}>{c.buzzer === 'countdown' ? <>Opening in <Countdown /> &mdash; cancel</> : <>Disable buzzer</>} <kbd>Enter</kbd></button>
                ) : (
                  <button className="btn primary big" disabled={c.dd || c.buzzer !== 'disabled' || c.answerShown} onClick={() => dispatch({ t: 'countdown' })}>
                    {Object.keys(c.lockedOut).length ? 'Reopen buzzer' : 'Arm buzzer'} <kbd>Enter</kbd>
                  </button>
                )}
                <button className="btn" disabled={c.answerShown} onClick={() => dispatch({ t: 'showAnswer' })}>Reveal answer <kbd>S</kbd></button>
                <button className="btn" disabled={c.buzzer === 'resolved'} onClick={async () => { if (await ask('Skip this clue? Nobody scores.')) dispatch({ t: 'skip' }); }}>Skip</button>
                <button className="btn gold" disabled={c.buzzer !== 'resolved'} onClick={() => dispatch({ t: 'close' })}>Back to board</button>
              </div>
              <p className="muted">Phones cannot buzz until you arm the buzzer. Locked out: {c.lockedOut.map((id) => state.players.find((p) => p.id === id)?.name).join(', ') || 'nobody'}.</p>
            </div>
          )}

          {state.phase === 'final' && <FinalPanel state={state} dispatch={dispatch} />}

          {state.phase === 'finished' && (
            <div className="card">
              <h2>Final standings</h2>
              <ol>{standings(state).map((p) => <li key={p.id} style={{ fontSize: '1.3rem' }}>{p.name} &mdash; {p.score}</li>)}</ol>
              <div className="row">
                <button className="btn primary" onClick={async () => { if (await ask('Reset scores and play this board again?')) dispatch({ t: 'reset' }); }}>Play again (reset scores)</button>
                <button className="btn" onClick={() => { clearSession(); nav('/'); }}>Back to home</button>
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 14 }}>
            <h3>Activity log</h3>
            <div style={{ maxHeight: 160, overflow: 'auto' }}>
              {[...state.log].reverse().map((l, i) => <div key={i} className="muted">{l}</div>)}
              {state.log.length === 0 && <span className="muted">Nothing yet.</span>}
            </div>
          </div>
        </div>

        <aside className="card" aria-label="Players">
          <h3>Players ({state.players.length}/{MAX_PLAYERS})</h3>
          {state.players.length === 0 && <p className="muted">Nobody yet. Share the code, or add a local player below.</p>}
          {state.players.map((p) => (
            <div className="player-row" key={p.id}>
              <Avatar name={p.name} color={p.color} src={p.avatar} />
              <div className="grow">
                <div><b>{p.name}</b> {p.local && <span className="pill">key {p.key}</span>} {state.chooserId === p.id && <span className="pill">control</span>}</div>
                <div className="muted"><span className={`dot${p.connected ? ' on' : ''}`} /> {p.connected ? 'online' : 'offline'} &middot; {p.score}</div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn small" aria-label={`Add 100 to ${p.name}`} onClick={() => dispatch({ t: 'adjust', playerId: p.id, delta: 100, reason: 'Host adjustment' })}>+</button>
                <button className="btn small" aria-label={`Subtract 100 from ${p.name}`} onClick={() => dispatch({ t: 'adjust', playerId: p.id, delta: -100, reason: 'Host adjustment' })}>&minus;</button>
                <button className="btn small" aria-label={`Give control to ${p.name}`} title="Give control" onClick={() => dispatch({ t: 'setChooser', id: p.id })}>&#9733;</button>
                <button className="btn small bad" aria-label={`Remove ${p.name}`} onClick={async () => { if (await ask(`Remove ${p.name}?`)) { link.current?.kick(p.id); dispatch({ t: 'removePlayer', id: p.id }); } }}>&times;</button>
              </div>
            </div>
          ))}
          <label htmlFor="local">Add local player (buzz with number keys)</label>
          <div className="row">
            <input id="local" type="text" value={localName} maxLength={20} onChange={(e) => setLocalName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLocal()} style={{ flex: 1 }} />
            <button className="btn" onClick={addLocal}>Add</button>
          </div>
        </aside>
      </div>

      {fullscreen && (
        <div className="overlay" role="dialog" aria-label="Presentation">
          <button className="btn small close" onClick={() => setFullscreen(false)}>Close (Esc)</button>
          <FullscreenEscape onClose={() => setFullscreen(false)} />
          <Screen v={pv} />
        </div>
      )}
    </div>
  );
}

function FullscreenEscape({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('keydown', k);
      if (document.fullscreenElement) void document.exitFullscreen();
    };
  }, [onClose]);
  return null;
}
