import { describe, expect, it } from 'vitest';
import { generalKnowledge } from '../data/templates';
import { createState, playerView, publicView, reduce, type Action, type GameState } from './game';

const run = (s: GameState, ...as: Action[]) => as.reduce(reduce, s);
const add = (id: string): Action => ({ t: 'addPlayer', player: { id, name: id.toUpperCase(), color: '#fff' } });

function started(n = 3) {
  let s = createState(generalKnowledge());
  for (let i = 0; i < n; i++) s = reduce(s, add('p' + i));
  return reduce(s, { t: 'start' });
}
const open = (s: GameState, cat = 0, idx = 0) => reduce(s, { t: 'select', cat, idx });

describe('buzzer', () => {
  it('ignores buzzes while disabled', () => {
    const s = open(started());
    const t = reduce(s, { t: 'buzz', playerId: 'p0', qid: s.current!.qid });
    expect(t.current!.buzzer).toBe('disabled');
    expect(t.current!.winnerId).toBeUndefined();
  });

  it('first accepted buzz wins; later ones are ignored', () => {
    const s = run(open(started()), { t: 'arm' });
    const qid = s.current!.qid;
    const t = run(s, { t: 'buzz', playerId: 'p1', qid }, { t: 'buzz', playerId: 'p0', qid }, { t: 'buzz', playerId: 'p1', qid });
    expect(t.current!.winnerId).toBe('p1');
    expect(t.current!.buzzSeq).toBe(1);
  });

  it('rejects stale question ids and unknown players', () => {
    const s = run(open(started()), { t: 'arm' });
    expect(reduce(s, { t: 'buzz', playerId: 'p0', qid: 'old' }).current!.buzzer).toBe('armed');
    expect(reduce(s, { t: 'buzz', playerId: 'nobody', qid: s.current!.qid }).current!.buzzer).toBe('armed');
  });

  it('cannot be armed outside a clue or twice', () => {
    const lobbyBoard = started();
    expect(reduce(lobbyBoard, { t: 'arm' })).toBe(lobbyBoard);
    const s = run(open(started()), { t: 'arm' });
    expect(reduce(s, { t: 'arm' })).toBe(s);
  });

  it('wrong answer locks the player out and lets others re-buzz after re-arming', () => {
    const base = run(open(started()), { t: 'arm' });
    const qid = base.current!.qid;
    let s = run(base, { t: 'buzz', playerId: 'p0', qid }, { t: 'judge', correct: false });
    expect(s.current!.buzzer).toBe('disabled');
    expect(s.players[0].score).toBe(-200);
    s = run(s, { t: 'arm' });
    expect(reduce(s, { t: 'buzz', playerId: 'p0', qid }).current!.buzzer).toBe('armed'); // locked out
    s = reduce(s, { t: 'buzz', playerId: 'p2', qid });
    expect(s.current!.winnerId).toBe('p2');
  });

  it('resolves when every eligible player has failed', () => {
    let s = run(open(started(2)), { t: 'arm' });
    const qid = s.current!.qid;
    s = run(s, { t: 'buzz', playerId: 'p0', qid }, { t: 'judge', correct: false }, { t: 'arm' }, { t: 'buzz', playerId: 'p1', qid }, { t: 'judge', correct: false });
    expect(s.current!.buzzer).toBe('resolved');
    expect(s.current!.answerShown).toBe(true);
    expect(s.used).toContain(qid);
  });

  it('disconnected players cannot buzz', () => {
    let s = run(open(started()), { t: 'arm' }, { t: 'setConnected', id: 'p0', connected: false });
    s = reduce(s, { t: 'buzz', playerId: 'p0', qid: s.current!.qid });
    expect(s.current!.buzzer).toBe('armed');
  });
});

describe('scoring', () => {
  it('correct answer awards value, marks used and gives control to the winner', () => {
    let s = run(open(started(), 0, 1), { t: 'arm' });
    s = run(s, { t: 'buzz', playerId: 'p2', qid: s.current!.qid }, { t: 'judge', correct: true });
    expect(s.players.find((p) => p.id === 'p2')!.score).toBe(400);
    expect(s.chooserId).toBe('p2');
    s = reduce(s, { t: 'close' });
    expect(s.phase).toBe('board');
    expect(reduce(s, { t: 'select', cat: 0, idx: 1 })).toBe(s); // already used
  });

  it('no-penalty rule skips deductions', () => {
    const st = started();
    const s0 = { ...st, game: { ...st.game, rules: { ...st.game.rules, wrongPenalty: false } } };
    let s = run(open(s0), { t: 'arm' });
    s = run(s, { t: 'buzz', playerId: 'p0', qid: s.current!.qid }, { t: 'judge', correct: false });
    expect(s.players[0].score).toBe(0);
  });

  it('score floor when negatives are disallowed', () => {
    const st = started();
    const s0 = { ...st, game: { ...st.game, rules: { ...st.game.rules, allowNegative: false } } };
    const s = reduce(s0, { t: 'adjust', playerId: 'p0', delta: -500, reason: 'x' });
    expect(s.players[0].score).toBe(0);
  });

  it('manual adjustments append events and corrections never erase history', () => {
    let s = reduce(started(), { t: 'adjust', playerId: 'p0', delta: 300, reason: 'bonus' });
    s = reduce(s, { t: 'adjust', playerId: 'p0', delta: -300, reason: 'oops' });
    expect(s.players[0].score).toBe(0);
    expect(s.events.map((e) => e.delta)).toEqual([300, -300]);
    expect(s.events.map((e) => e.n)).toEqual([1, 2]);
  });

  it('event history sums to current scores', () => {
    let s = run(open(started()), { t: 'arm' });
    s = run(s, { t: 'buzz', playerId: 'p1', qid: s.current!.qid }, { t: 'judge', correct: true }, { t: 'close' }, { t: 'adjust', playerId: 'p0', delta: 50, reason: 'r' });
    for (const p of s.players) expect(s.events.filter((e) => e.playerId === p.id).reduce((n, e) => n + e.delta, 0)).toBe(p.score);
  });
});

describe('daily double', () => {
  const ddState = () => {
    const s = started();
    return { ...s, chooserId: 'p1' as string | undefined };
  };

  it('requires a wager, caps it, and pays the wager on success', () => {
    let s = open(ddState(), 3, 3);
    expect(s.current!.dd).toBe(true);
    expect(publicView(s).clue!.text).toBe(''); // clue hidden until wager
    expect(reduce(s, { t: 'arm' })).toBe(s); // no buzzing on a daily double
    expect(reduce(s, { t: 'setWager', amount: 999999 })).toBe(s);
    s = run(s, { t: 'setWager', amount: 500 });
    expect(s.current!.winnerId).toBe('p1');
    s = reduce(s, { t: 'judge', correct: true });
    expect(s.players.find((p) => p.id === 'p1')!.score).toBe(500);
  });

  it('deducts the wager on failure and resolves with no rebuzz', () => {
    let s = run(open(ddState(), 3, 3), { t: 'setWager', amount: 300 }, { t: 'judge', correct: false });
    expect(s.players.find((p) => p.id === 'p1')!.score).toBe(-300);
    expect(s.current!.buzzer).toBe('resolved');
  });
});

describe('views never leak', () => {
  it('player view contains no clue or answer; public view hides answer until shown', () => {
    let s = run(open(started()), { t: 'arm' });
    const pv = JSON.stringify(playerView(s, 'p0'));
    expect(pv).not.toContain('Mars');
    expect(pv).not.toContain('Red Planet');
    expect(publicView(s).clue!.answer).toBeUndefined();
    s = reduce(s, { t: 'showAnswer' });
    expect(publicView(s).clue!.answer).toBe('Mars');
  });
});

describe('game flow', () => {
  it('cannot start empty and finishes when the board is exhausted', () => {
    expect(reduce(createState(generalKnowledge()), { t: 'start' }).phase).toBe('lobby');
    let s = started(1);
    s = { ...s, game: { ...s.game, final: undefined } };
    for (let c = 0; c < 5; c++) for (let q = 0; q < 5; q++) s = run(s, { t: 'select', cat: c, idx: q }, { t: 'skip' }, { t: 'close' });
    expect(s.phase).toBe('finished');
  });

  it('rejects duplicate player names', () => {
    let s = reduce(createState(generalKnowledge()), add('a'));
    s = reduce(s, { t: 'addPlayer', player: { id: 'b', name: 'a', color: '#000' } });
    expect(s.players).toHaveLength(1);
  });

  it('removing the buzzer winner reopens the question', () => {
    let s = run(open(started()), { t: 'arm' });
    s = run(s, { t: 'buzz', playerId: 'p0', qid: s.current!.qid }, { t: 'removePlayer', id: 'p0' });
    expect(s.current!.buzzer).toBe('disabled');
    expect(s.current!.winnerId).toBeUndefined();
  });
});

describe('final round', () => {
  const exhaust = (s0: GameState) => {
    let s = s0;
    for (let c = 0; c < 5; c++) for (let q = 0; q < 5; q++) s = run(s, { t: 'select', cat: c, idx: q }, { t: 'skip' }, { t: 'close' });
    return s;
  };
  const withScores = () =>
    run(started(3), { t: 'adjust', playerId: 'p0', delta: 1000, reason: 'x' }, { t: 'adjust', playerId: 'p1', delta: 400, reason: 'x' });

  it('board does not finish while a final round remains; only positive scores qualify', () => {
    const s = exhaust(withScores());
    expect(s.phase).toBe('board');
    const f = reduce(s, { t: 'startFinal' });
    expect(f.phase).toBe('final');
    expect(f.final!.eligible.sort()).toEqual(['p0', 'p1']);
    expect(f.final!.order).toEqual(['p1', 'p0']); // lowest first
  });

  it('wagers are capped by score and hidden from the public view until revealed', () => {
    let s = run(withScores(), { t: 'startFinal' });
    expect(s.phase).toBe('final');
    expect(reduce(s, { t: 'finalWager', playerId: 'p1', amount: 401 })).toBe(s);
    expect(reduce(s, { t: 'finalWager', playerId: 'p2', amount: 0 })).toBe(s); // ineligible
    s = run(s, { t: 'finalWager', playerId: 'p0', amount: 700 }, { t: 'finalAdvance' });
    expect(s.final!.stage).toBe('clue');
    expect(s.final!.wagers.p1).toBe(0); // missing wager defaults to 0
    expect(reduce(s, { t: 'finalWager', playerId: 'p0', amount: 1 })).toBe(s); // too late
    s = run(s, { t: 'finalAnswer', playerId: 'p0', text: '  Iron  ' });
    expect(publicView(s).final!.revealed).toEqual([]);
    expect(JSON.stringify(publicView(s))).not.toContain('Iron');
    expect(publicView(s).final!.answer).toBeUndefined();
    expect(playerView(s, 'p1')!.final!.answer).toBeUndefined(); // other players never see it
    expect(playerView(s, 'p0')!.final!.answer).toBe('Iron');
  });

  it('reveals lowest first, scores wagers and finishes after everyone is judged', () => {
    let s = run(
      withScores(),
      { t: 'startFinal' },
      { t: 'finalWager', playerId: 'p0', amount: 1000 },
      { t: 'finalWager', playerId: 'p1', amount: 400 },
      { t: 'finalAdvance' },
      { t: 'finalAnswer', playerId: 'p0', text: 'iron' },
      { t: 'finalAdvance' },
    );
    expect(reduce(s, { t: 'finalJudge', playerId: 'p1', correct: true })).toBe(s); // not revealed yet
    s = run(s, { t: 'finalReveal' });
    expect(publicView(s).final!.revealed.map((r) => r.id)).toEqual(['p1']);
    expect(publicView(s).final!.revealed[0].answer).toBe('(no answer)');
    s = run(s, { t: 'finalJudge', playerId: 'p1', correct: false });
    expect(reduce(s, { t: 'finalJudge', playerId: 'p1', correct: true })).toBe(s); // no double judging
    expect(reduce(s, { t: 'finalFinish' })).toBe(s); // p0 still pending
    s = run(s, { t: 'finalReveal' }, { t: 'finalJudge', playerId: 'p0', correct: true }, { t: 'finalFinish' });
    expect(s.phase).toBe('finished');
    expect(s.players.find((p) => p.id === 'p0')!.score).toBe(2000);
    expect(s.players.find((p) => p.id === 'p1')!.score).toBe(0);
    for (const p of s.players) expect(s.events.filter((e) => e.playerId === p.id).reduce((n, e) => n + e.delta, 0)).toBe(p.score);
  });

  it('is skipped when nobody has a positive score', () => {
    expect(reduce(started(2), { t: 'startFinal' }).phase).toBe('finished');
  });
});

describe('countdown before arming', () => {
  it('rejects buzzes during the 3-2-1, then accepts them once armed', () => {
    const s0 = open(started());
    const qid = s0.current!.qid;
    const s1 = reduce(s0, { t: 'countdown' });
    expect(s1.current!.buzzer).toBe('countdown');
    expect(reduce(s1, { t: 'buzz', playerId: 'p0', qid })).toBe(s1);
    const s2 = reduce(s1, { t: 'arm' });
    expect(s2.current!.buzzer).toBe('armed');
    expect(reduce(s2, { t: 'buzz', playerId: 'p0', qid }).current!.winnerId).toBe('p0');
  });

  it('can be cancelled, cannot start twice, and is not available on a daily double', () => {
    const s1 = reduce(open(started()), { t: 'countdown' });
    expect(reduce(s1, { t: 'countdown' })).toBe(s1);
    expect(reduce(s1, { t: 'disarm' }).current!.buzzer).toBe('disabled');
    const dd = open({ ...started(), chooserId: 'p1' }, 3, 3);
    expect(reduce(dd, { t: 'countdown' })).toBe(dd);
  });

  it('a stale arm after the host cancelled does nothing harmful', () => {
    // cancel -> disabled, then the old timer fires `arm`; the host re-checks via the countdown flag,
    // and even if it fires, the engine only opens a closed buzzer (never one that has a winner).
    let s = open(started());
    const qid = s.current!.qid;
    s = run(s, { t: 'arm' }, { t: 'buzz', playerId: 'p0', qid });
    expect(reduce(s, { t: 'arm' })).toBe(s);
  });
});

describe('final round timer', () => {
  const base = () =>
    run(started(2), { t: 'adjust', playerId: 'p0', delta: 500, reason: 'x' }, { t: 'startFinal' }, { t: 'finalWager', playerId: 'p0', amount: 100 });

  it('stores the deadline only once the clue stage starts and exposes it only then', () => {
    const w = base();
    expect(publicView(w).final!.deadline).toBeUndefined();
    const c = reduce(w, { t: 'finalAdvance', deadline: 123456 });
    expect(c.final!.stage).toBe('clue');
    expect(publicView(c).final!.deadline).toBe(123456);
    expect(playerView(c, 'p0')!.final!.deadline).toBe(123456);
    expect(typeof publicView(c).final!.sentAt).toBe('number');
    const r = reduce(c, { t: 'finalAdvance' });
    expect(publicView(r).final!.deadline).toBeUndefined();
  });

  it('works without a deadline (manual mode)', () => {
    const c = reduce(base(), { t: 'finalAdvance' });
    expect(c.final!.stage).toBe('clue');
    expect(c.final!.deadline).toBeUndefined();
  });
});
