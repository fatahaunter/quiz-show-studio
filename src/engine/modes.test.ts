import { describe, expect, it } from 'vitest';
import { generalKnowledge } from '../data/templates';
import { createState, finalValue, playerView, publicView, reduce, type Action, type GameState } from './game';
import { parseClientMsg } from '../net/protocol';
import { parseGameJson, exportGameJson } from '../store/storage';
import { gameFromTxt } from '../store/txt';
import { MAX_CATEGORIES, MIN_CATEGORIES, type FinalMode } from '../types';

const run = (s: GameState, ...as: Action[]) => as.reduce(reduce, s);
const AVATAR = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

function ready(mode: FinalMode | undefined, scores: number[] = [800, 400, 0], value?: number) {
  const g = generalKnowledge();
  g.final = { ...g.final!, mode, value };
  let s = createState(g);
  scores.forEach((sc, i) => {
    s = reduce(s, { t: 'addPlayer', player: { id: 'p' + i, name: 'P' + i, color: '#fff' } });
    if (sc) s = reduce(s, { t: 'adjust', playerId: 'p' + i, delta: sc, reason: 'setup' });
  });
  return reduce(s, { t: 'start' });
}

describe('final: wager (classic, the default)', () => {
  it('only players with points take part and wagers are required', () => {
    const s = run(ready(undefined), { t: 'startFinal' });
    expect(s.final!.mode).toBe('wager');
    expect([...s.final!.eligible].sort()).toEqual(['p0', 'p1']); // p2 has 0 points
    const w = reduce(s, { t: 'finalWager', playerId: 'p0', amount: 500 });
    expect(w.final!.wagers.p0).toBe(500);
    expect(reduce(s, { t: 'finalWager', playerId: 'p0', amount: 9999 })).toBe(s); // cannot wager more than the score
  });
});

describe('final: everyone types an answer', () => {
  const start = () => run(ready('typed', [800, 400, 0], 600), { t: 'startFinal' });

  it('includes every player, whatever their score, and takes no wagers', () => {
    const s = start();
    expect(s.phase).toBe('final');
    expect(s.final!.eligible.sort()).toEqual(['p0', 'p1', 'p2']);
    expect(reduce(s, { t: 'finalWager', playerId: 'p0', amount: 100 })).toBe(s);
  });

  it('plays for the flat value, reveals one by one, and judges', () => {
    let s = run(start(), { t: 'finalAdvance' });
    expect(s.final!.stage).toBe('clue');
    expect(s.final!.wagers).toEqual({ p0: 600, p1: 600, p2: 600 });
    s = run(s, { t: 'finalAnswer', playerId: 'p0', text: 'a' }, { t: 'finalAnswer', playerId: 'p2', text: 'b' }, { t: 'finalAdvance' });
    expect(s.final!.stage).toBe('reveal');
    expect(pubOf(s).revealed).toHaveLength(0); // nothing shown until the host reveals it
    s = run(s, { t: 'finalReveal' });
    expect(pubOf(s).revealed.map((r) => r.id)).toEqual(['p2']); // lowest score first
    s = run(s, { t: 'finalJudge', playerId: 'p2', correct: true });
    expect(s.players.find((p) => p.id === 'p2')!.score).toBe(600);
  });

  it('a wrong answer costs the value only when wrong answers cost points', () => {
    const wrong = (penalty: boolean) => {
      let s = start();
      s = { ...s, game: { ...s.game, rules: { ...s.game.rules, wrongPenalty: penalty } } };
      s = run(s, { t: 'finalAdvance' }, { t: 'finalAdvance' }, { t: 'finalReveal' }, { t: 'finalReveal' }, { t: 'finalReveal' }, { t: 'finalJudge', playerId: 'p0', correct: false });
      return s.players.find((p) => p.id === 'p0')!.score;
    };
    expect(wrong(true)).toBe(800 - 600);
    expect(wrong(false)).toBe(800);
  });

  it('defaults the value to the top clue value', () => {
    expect(finalValue(ready('typed').game)).toBe(1000);
  });
});

describe('final: normal question', () => {
  it('is played like a clue: buzzer, host judges, then the game ends', () => {
    let s = run(ready('normal', [0, 0, 0], 500), { t: 'startFinal' });
    expect(s.phase).toBe('clue');
    expect(s.current!.final).toBe(true);
    const pv = publicView(s);
    expect(pv.clue!.final).toBe(true);
    expect(pv.clue!.value).toBe(500);
    expect(pv.clue!.answer).toBeUndefined(); // the answer stays hidden
    s = run(s, { t: 'arm' }, { t: 'buzz', playerId: 'p1', qid: 'final' }, { t: 'judge', correct: true });
    expect(s.players.find((p) => p.id === 'p1')!.score).toBe(500);
    expect(s.current!.buzzer).toBe('resolved');
    s = reduce(s, { t: 'close' });
    expect(s.phase).toBe('finished');
  });

  it('can be played again only once', () => {
    const s = run(ready('normal'), { t: 'startFinal' });
    expect(reduce(s, { t: 'startFinal' })).toBe(s);
  });

  it('still gives the phones no clue text before reveal', () => {
    const s = run(ready('normal'), { t: 'startFinal' });
    expect(JSON.stringify(playerView(s, 'p0'))).not.toContain(s.game.final!.answer);
  });
});

const pubOf = (s: GameState) => publicView(s).final!;

describe('profile pictures', () => {
  it('travel with the hello message, and bad ones are dropped', () => {
    const hello = { k: 'hello', token: 'abcdefgh1234', name: 'Sam', color: '#3B82F6' };
    expect(parseClientMsg({ ...hello, avatar: AVATAR })).toMatchObject({ avatar: AVATAR });
    expect(parseClientMsg({ ...hello, avatar: 'javascript:alert(1)' })).toMatchObject({ avatar: undefined });
    expect(parseClientMsg({ ...hello, avatar: 'data:image/svg+xml;base64,AAAA' })).toMatchObject({ avatar: undefined });
    expect(parseClientMsg({ ...hello, avatar: 'data:image/jpeg;base64,' + 'A'.repeat(40_000) })).toMatchObject({ avatar: undefined });
  });

  it('show up in the public view and can be changed', () => {
    let s = createState(generalKnowledge());
    s = reduce(s, { t: 'addPlayer', player: { id: 'a', name: 'A', color: '#fff', avatar: AVATAR } });
    expect(publicView(s).players[0].avatar).toBe(AVATAR);
    s = reduce(s, { t: 'setAvatar', id: 'a', avatar: undefined });
    expect(publicView(s).players[0].avatar).toBeUndefined();
  });
});

describe('room code on the public screen', () => {
  it('is shown in the lobby only', () => {
    let s = createState(generalKnowledge());
    s = reduce(s, { t: 'addPlayer', player: { id: 'a', name: 'A', color: '#fff' } });
    const join = { code: 'ABCDE' };
    expect(publicView(s, join).join).toEqual(join);
    expect(publicView(reduce(s, { t: 'start' }), join).join).toBeUndefined();
  });
});

describe('4 to 8 categories', () => {
  const json = (n: number) => {
    const g = generalKnowledge();
    g.categories = Array.from({ length: n }, (_, i) => ({ ...g.categories[i % g.categories.length], id: 'c' + i }));
    return exportGameJson(g);
  };
  it('limits are 4 and 8', () => {
    expect([MIN_CATEGORIES, MAX_CATEGORIES]).toEqual([4, 8]);
  });
  it('rejects a JSON game with more than 8 categories and accepts 8', () => {
    expect(parseGameJson(json(9)).errors.join()).toMatch(/maximum is 8/);
    expect(parseGameJson(json(8)).game!.categories).toHaveLength(8);
  });
  it('rejects a text file with a ninth category', () => {
    const txt = Array.from({ length: 9 }, (_, i) => `# Cat ${i}\nClue ${i} | Answer ${i}`).join('\n');
    expect(gameFromTxt(txt, 'x').errors.join()).toMatch(/more than 8 categories/);
  });
  it('keeps the final style through JSON export and import', () => {
    const g = generalKnowledge();
    g.final = { ...g.final!, mode: 'typed', value: 700 };
    expect(parseGameJson(exportGameJson(g)).game!.final).toMatchObject({ mode: 'typed', value: 700 });
  });
});
