import { describe, expect, it } from 'vitest';
import { generalKnowledge } from '../data/templates';
import { createState, reduce, type GameState } from './game';
import { createBuzzGate } from './gate';

function clueOpen(): GameState {
  let s = createState(generalKnowledge());
  s = reduce(s, { t: 'addPlayer', player: { id: 'a', name: 'A', color: '#fff' } });
  s = reduce(s, { t: 'addPlayer', player: { id: 'b', name: 'B', color: '#fff' } });
  s = reduce(s, { t: 'start' });
  return reduce(s, { t: 'select', cat: 0, idx: 0 });
}

describe('buzz gate', () => {
  it('penalises buzzing before the host arms, then drops buzzes until the delay passes', () => {
    let t = 1000;
    const gate = createBuzzGate(1500, () => t);
    const closed = clueOpen();
    expect(gate.admit('a', closed)).toBe(true); // passed on (engine ignores it) but now penalised
    t += 1000;
    expect(gate.admit('a', closed)).toBe(false);
    const armed = reduce(closed, { t: 'arm' });
    expect(gate.admit('a', armed)).toBe(false); // still inside the delay even though the buzzer is open
    expect(gate.admit('b', armed)).toBe(true); // other players unaffected
    t += 600;
    expect(gate.admit('a', armed)).toBe(true); // delay over
  });

  it('does not penalise taps when armed, after a winner, or between clues', () => {
    const gate = createBuzzGate(1500, () => 0);
    const armed = reduce(clueOpen(), { t: 'arm' });
    expect(gate.admit('a', armed)).toBe(true);
    const won = reduce(armed, { t: 'buzz', playerId: 'b', qid: armed.current!.qid });
    expect(gate.admit('a', won)).toBe(true);
    expect(gate.admit('a', won)).toBe(true);
    expect(gate.remaining('a')).toBe(0);
  });

  it('engine still ignores an early buzz even though the gate passes it', () => {
    const gate = createBuzzGate(1500, () => 0);
    const s = clueOpen();
    expect(gate.admit('a', s)).toBe(true);
    expect(reduce(s, { t: 'buzz', playerId: 'a', qid: s.current!.qid }).current!.buzzer).toBe('disabled');
  });
});

describe('buzz gate during countdown', () => {
  it('penalises taps made during the 3-2-1', () => {
    let t = 0;
    const gate = createBuzzGate(1500, () => t);
    const s = reduce(clueOpen(), { t: 'countdown' });
    expect(gate.admit('a', s)).toBe(true);
    t = 1000;
    expect(gate.admit('a', reduce(s, { t: 'arm' }))).toBe(false); // opened, but still serving the delay
  });
});
