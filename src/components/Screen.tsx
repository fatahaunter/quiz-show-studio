import type { CSSProperties } from 'react';
import type { PublicView } from '../engine/game';
import Avatar from './Avatar';
import Countdown from './Countdown';
import FinalTimer from './FinalTimer';

/** Players along the bottom of the screen: picture, name and score. Shrinks as the room fills up. */
export function PlayersBar({ v }: { v: PublicView }) {
  const win = v.clue?.winnerId;
  const n = v.players.length;
  const scale = n <= 6 ? 1 : n <= 10 ? 0.78 : n <= 14 ? 0.62 : 0.5;
  return (
    <div className="players" aria-label="Players" style={{ '--ps': scale } as CSSProperties}>
      {v.players.map((p) => (
        <div
          key={p.id}
          className={`pcard${p.id === win ? ' win' : ''}${v.chooserId === p.id && v.phase === 'board' ? ' chooser' : ''}${v.clue?.lockedOut.includes(p.id) ? ' out' : ''}${p.connected ? '' : ' off'}`}
          style={{ '--c': p.color } as CSSProperties}
        >
          <Avatar name={p.name} color={p.color} src={p.avatar} size="calc(var(--ps) * 5.4cqw)" />
          <div className="pt">
            <div className="n">{p.name}</div>
            <div className={`v${p.score < 0 ? ' neg' : ''}`}>{p.score}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The public face of the game, drawn on a fixed 16:9 stage so it is always wide (never tall and
 * skinny) and scales to any window. It only ever receives a PublicView, so it cannot leak answers.
 * `embedded` sizes it to its container (host page); otherwise it fills the window.
 */
export default function Screen({ v, onPick, embedded = false }: { v: PublicView; onPick?: (cat: number, idx: number) => void; embedded?: boolean }) {
  const rows = Math.max(0, ...v.board.map((c) => c.cells.length));
  const winner = v.players.find((p) => p.id === v.clue?.winnerId);
  const c = v.clue;
  const top = [...v.players].sort((a, b) => b.score - a.score);
  const ncat = v.board.length;
  const boardFont = ncat <= 5 ? 2.5 : ncat <= 6 ? 2.2 : ncat <= 7 ? 2 : 1.8; // cqw

  return (
    <div className={`screen${embedded ? ' embedded' : ''}`}>
      <div className="stage">
        <div className="title">{v.title}</div>

        {v.phase === 'lobby' && (
          <div className="clue">
            {v.join ? (
              <div className="joinbox">
                <div>
                  <div className="state">Join on your phone</div>
                  <div className="roomcode" aria-label={`Room code ${v.join.code.split('').join(' ')}`}>{v.join.code}</div>
                  {v.join.url && <div className="joinurl">{v.join.url.replace(/^https?:\/\//, '').replace(/\?.*$/, '')}</div>}
                </div>
                {v.join.qr && <img className="qr" src={v.join.qr} alt="QR code to join" />}
              </div>
            ) : (
              <div className="text">Waiting for the host to start&hellip;</div>
            )}
            <div className="state">{v.players.length} player{v.players.length === 1 ? '' : 's'} joined</div>
          </div>
        )}

        {v.phase === 'board' && (
          <div className="board" style={{ fontSize: `${boardFont}cqw`, gridTemplateColumns: `repeat(${ncat}, 1fr)`, gridTemplateRows: `auto repeat(${rows}, 1fr)` }}>
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
            {c.final && <div className="state won">FINAL QUESTION &mdash; {c.category}</div>}
            {c.dd && <div className="state won">DAILY DOUBLE{c.wager !== undefined ? ` — wager ${c.wager}` : ''}</div>}
            {c.text ? <div className="text">{c.text}</div> : <div className="text">Place your wager</div>}
            {c.image && <img src={c.image} alt="" />}
            {c.answer && <div className="answer">{c.answer}</div>}
            {c.explanation && <div className="muted">{c.explanation}</div>}
            {c.buzzer === 'armed' && <div className="state armed">BUZZ IN NOW!</div>}
            {c.buzzer === 'awarded' && winner && <div className="state won">{winner.name} buzzed in</div>}
            {c.buzzer === 'disabled' && !c.dd && <div className="state">Buzzers are off &mdash; wait for the host</div>}
          </div>
        )}

        {v.phase === 'final' && v.final && (
          <div className="clue" key={v.final.stage}>
            <div className="state won">FINAL ROUND &mdash; {v.final.category}</div>
            {v.final.stage === 'wager' && <div className="text">{v.final.mode === 'typed' ? 'Get ready to type your answer' : 'Place your wagers'}</div>}
            {v.final.stage !== 'wager' && v.final.clue && <div className="text">{v.final.clue}</div>}
            {v.final.stage === 'clue' && v.final.deadline && <div className="state"><FinalTimer deadline={v.final.deadline} sentAt={v.final.sentAt} className="bigtimer" /></div>}
            {v.final.stage !== 'reveal' && v.final.mode === 'wager' && v.final.stage === 'wager' && <div className="state">Wagers locked: {v.final.submitted.length}</div>}
            {v.final.stage === 'clue' && <div className="state">Answers in: {v.final.submitted.length}</div>}
            {v.final.stage === 'reveal' && v.final.answer && <div className="answer">{v.final.answer}</div>}
            {v.final.stage === 'reveal' && (
              <div className="reveals">
                {v.final.revealed.map((r) => {
                  const p = v.players.find((x) => x.id === r.id);
                  return (
                    <div key={r.id} className="rcard" style={{ '--c': p?.color ?? '#fff', borderColor: r.correct === undefined ? undefined : r.correct ? 'var(--ok)' : 'var(--bad)' } as CSSProperties}>
                      {p && <Avatar name={p.name} color={p.color} src={p.avatar} size="4cqw" />}
                      <div>
                        <div className="n">{p?.name}</div>
                        <div className="ra">{r.answer}</div>
                        <div className="muted">{v.final?.mode === 'wager' ? `wagered ${r.wager}` : `worth ${r.wager}`}</div>
                      </div>
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
              <div key={p.id} className="step" style={{ '--c': p.color, paddingTop: `${(3 - i) * 2.4}cqw` } as CSSProperties}>
                <div className="muted">#{i + 1}</div>
                <Avatar name={p.name} color={p.color} src={p.avatar} size="8cqw" className="mid" />
                <div className="pn">{p.name}</div>
                <div className="pv">{p.score}</div>
              </div>
            ))}
          </div>
        )}

        <PlayersBar v={v} />

        {c?.buzzer === 'countdown' && v.phase === 'clue' && (
          <div className="cd-overlay" role="status" aria-label="Buzzers opening">
            <Countdown className="fill" />
            <div className="cd-label">GET READY</div>
          </div>
        )}
      </div>
    </div>
  );
}
