import type { CSSProperties } from 'react';
import type { PublicView } from '../engine/game';
import Countdown from './Countdown';
import FinalTimer from './FinalTimer';

export function ScoreBar({ v }: { v: PublicView }) {
  const win = v.clue?.winnerId;
  return (
    <div className="scorebar" aria-label="Scores">
      {v.players.map((p) => (
        <div
          key={p.id}
          className={`score${p.id === win ? ' win' : ''}${v.chooserId === p.id && v.phase === 'board' ? ' chooser' : ''}${v.clue?.lockedOut.includes(p.id) ? ' out' : ''}${p.connected ? '' : ' off'}`}
          style={{ '--c': p.color } as CSSProperties}
        >
          <div className="n">{p.name}</div>
          <div className={`v${p.score < 0 ? ' neg' : ''}`}>{p.score}</div>
        </div>
      ))}
    </div>
  );
}

/** The public face of the game. It only ever receives a PublicView, so it cannot leak unrevealed answers. */
export default function Screen({ v, onPick }: { v: PublicView; onPick?: (cat: number, idx: number) => void }) {
  const rows = Math.max(0, ...v.board.map((c) => c.cells.length));
  const winner = v.players.find((p) => p.id === v.clue?.winnerId);
  const c = v.clue;
  const top = [...v.players].sort((a, b) => b.score - a.score);

  return (
    <div className="screen">
      <div className="title">{v.title}</div>

      {v.phase === 'lobby' && (
        <div className="clue">
          <div className="text">Waiting for the host to start&hellip;</div>
          <div className="state">{v.players.length} player{v.players.length === 1 ? '' : 's'} joined</div>
        </div>
      )}

      {v.phase === 'board' && (
        <div className="board" style={{ gridTemplateColumns: `repeat(${v.board.length}, 1fr)`, gridTemplateRows: `auto repeat(${rows}, 1fr)` }}>
          {v.board.map((cat, ci) => (
            <div key={'h' + ci} className="head" style={{ '--c': cat.color } as CSSProperties}>
              {cat.name}
            </div>
          ))}
          {Array.from({ length: rows }).flatMap((_, r) =>
            v.board.map((cat, ci) => {
              const cell = cat.cells[r];
              return (
                <button key={`${ci}-${r}`} className="cell" disabled={!cell || cell.used || !onPick} onClick={() => onPick?.(ci, r)} aria-label={cell ? `${cat.name} ${cell.value}` : 'empty'}>
                  {cell && !cell.used ? cell.value : ''}
                </button>
              );
            }),
          )}
        </div>
      )}

      {v.phase === 'clue' && c && (
        <div className="clue" key={c.text + c.dd}>
          {c.dd && <div className="state won">DAILY DOUBLE{c.wager !== undefined ? ` — wager ${c.wager}` : ''}</div>}
          {c.text ? <div className="text">{c.text}</div> : <div className="text">Place your wager</div>}
          {c.image && <img src={c.image} alt="" />}
          {c.answer && <div className="answer">{c.answer}</div>}
          {c.explanation && <div className="muted">{c.explanation}</div>}
          {c.buzzer === 'countdown' && <div className="state">Get ready&hellip; <Countdown className="big" /></div>}
          {c.buzzer === 'armed' && <div className="state armed">BUZZ IN NOW!</div>}
          {c.buzzer === 'awarded' && winner && <div className="state won">{winner.name} buzzed in</div>}
          {c.buzzer === 'disabled' && !c.dd && <div className="state">Buzzers are off &mdash; wait for the host</div>}
        </div>
      )}

      {v.phase === 'final' && v.final && (
        <div className="clue" key={v.final.stage}>
          <div className="state won">FINAL ROUND &mdash; {v.final.category}</div>
          {v.final.stage === 'wager' && <div className="text">Place your wagers</div>}
          {v.final.stage !== 'wager' && v.final.clue && <div className="text">{v.final.clue}</div>}
          {v.final.stage === 'clue' && v.final.deadline && <div className="state"><FinalTimer deadline={v.final.deadline} sentAt={v.final.sentAt} className="bigtimer" /></div>}
          {v.final.stage !== 'reveal' && (
            <div className="state">
              {v.final.stage === 'wager' ? 'Wagers locked' : 'Answers in'}: {v.final.submitted.length}
            </div>
          )}
          {v.final.stage === 'reveal' && v.final.answer && <div className="answer">{v.final.answer}</div>}
          {v.final.stage === 'reveal' && (
            <div className="scorebar">
              {v.final.revealed.map((r) => {
                const p = v.players.find((x) => x.id === r.id);
                return (
                  <div key={r.id} className="score" style={{ '--c': p?.color ?? '#fff', borderColor: r.correct === undefined ? undefined : r.correct ? 'var(--ok)' : 'var(--bad)' } as CSSProperties}>
                    <div className="n">{p?.name}</div>
                    <div style={{ fontSize: 'clamp(1rem, 2vw, 2.2rem)' }}>{r.answer}</div>
                    <div className="muted">wagered {r.wager}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {v.phase === 'finished' && (
        <div className="podium">
          {top.slice(0, 3).map((p, i) => (
            <div key={p.id} className="step" style={{ '--c': p.color, paddingTop: `${(3 - i) * 4}vw` } as CSSProperties}>
              <div className="muted">#{i + 1}</div>
              <div style={{ fontSize: '2vw', fontWeight: 800 }}>{p.name}</div>
              <div className="score"><div className="v">{p.score}</div></div>
            </div>
          ))}
        </div>
      )}

      <ScoreBar v={v} />
    </div>
  );
}
