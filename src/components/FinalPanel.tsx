import { useState } from 'react';
import type { Action, GameState } from '../engine/game';
import FinalTimer from './FinalTimer';

/** Host controls for the Final round. Shows private wagers/answers only here, never on the public screen. */
export default function FinalPanel({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const f = state.final;
  const fc = state.game.final;
  const [local, setLocal] = useState<Record<string, string>>({});
  if (!f || !fc) return null;
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?';
  const nextHidden = f.order.find((id) => !f.revealed.includes(id));
  const allJudged = f.order.every((id) => id in f.judged);

  return (
    <div className="card">
      <div className="row">
        <h2 className="grow" style={{ margin: 0 }}>Final round &middot; {fc.category}</h2>
        <span className="pill">Stage: <b>{f.stage.toUpperCase()}</b></span>
      </div>

      {f.stage !== 'wager' && <p style={{ fontSize: '1.3rem' }}>{fc.clue}</p>}
      {f.stage === 'clue' && f.deadline && <p>Time left: <FinalTimer deadline={f.deadline} /></p>}
      <div className="notes">
        <b>Answer:</b> {fc.answer}
        {fc.alts.length > 0 && <div className="muted">Also accept: {fc.alts.join(', ')}</div>}
      </div>

      {f.stage !== 'reveal' && (
        <>
          <p className="muted">
            {f.stage === 'wager' ? 'Players lock a wager on their phones (max = their score). Local players are entered below.' : 'Players type an answer on their phones. Local players are entered below.'}
          </p>
          {f.eligible.map((id) => {
            const p = state.players.find((x) => x.id === id)!;
            const done = f.stage === 'wager' ? id in f.wagers : id in f.answers;
            return (
              <div className="player-row" key={id}>
                <span className="avatar" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>
                <div className="grow">
                  <b>{p.name}</b> <span className="muted">({p.score})</span>{' '}
                  <span className={done ? 'ok' : 'muted'}>{done ? (f.stage === 'wager' ? `wager ${f.wagers[id]} locked` : 'answered') : p.connected || p.local ? 'waiting' : 'offline'}</span>
                </div>
                {p.local && (
                  <div className="row" style={{ gap: 4 }}>
                    <input
                      type={f.stage === 'wager' ? 'number' : 'text'}
                      min={0}
                      max={p.score}
                      aria-label={`${p.name} ${f.stage === 'wager' ? 'wager' : 'answer'}`}
                      value={local[id] ?? ''}
                      onChange={(e) => setLocal({ ...local, [id]: e.target.value })}
                      style={{ width: 150 }}
                    />
                    <button
                      className="btn small"
                      onClick={() => {
                        const v = local[id] ?? '';
                        dispatch(f.stage === 'wager' ? { t: 'finalWager', playerId: id, amount: Number(v) } : { t: 'finalAnswer', playerId: id, text: v });
                      }}
                    >
                      Set
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button className="btn primary big" onClick={() => {
            const secs = state.game.rules.finalSeconds ?? 30;
            dispatch({ t: 'finalAdvance', deadline: f.stage === 'wager' && secs > 0 ? Date.now() + secs * 1000 : undefined });
          }}>
            {f.stage === 'wager'
              ? `Show clue${(state.game.rules.finalSeconds ?? 30) > 0 ? ` & start ${state.game.rules.finalSeconds ?? 30}s timer` : ''}`
              : 'End answers now — start reveal'}
          </button>
        </>
      )}

      {f.stage === 'reveal' && (
        <>
          {f.order.map((id) => {
            const shown = f.revealed.includes(id);
            return (
              <div className="player-row" key={id}>
                <div className="grow">
                  <b>{name(id)}</b> <span className="muted">wager {f.wagers[id] ?? 0}</span>
                  <div>Answer: <b>{f.answers[id] ?? "(no answer)"}</b></div>
                  {!shown && <span className="muted">Hidden from the audience</span>}
                </div>
                {id in f.judged ? (
                  <span className={f.judged[id] ? 'ok' : 'err'}>{f.judged[id] ? 'Correct' : 'Incorrect'}</span>
                ) : (
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn small good" disabled={!shown} onClick={() => dispatch({ t: 'finalJudge', playerId: id, correct: true })}>Correct</button>
                    <button className="btn small bad" disabled={!shown} onClick={() => dispatch({ t: 'finalJudge', playerId: id, correct: false })}>Incorrect</button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn gold big" disabled={!nextHidden} onClick={() => dispatch({ t: 'finalReveal' })}>
              Reveal {nextHidden ? name(nextHidden) : 'next'}
            </button>
            <button className="btn primary big" disabled={!allJudged} onClick={() => dispatch({ t: 'finalFinish' })}>Finish &amp; show standings</button>
          </div>
        </>
      )}
    </div>
  );
}
