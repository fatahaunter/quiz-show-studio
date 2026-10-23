import { describe, expect, it } from 'vitest';
import { generalKnowledge } from '../data/templates';
import { gameFromTxt, gameToTxt, TXT_EXAMPLE } from './txt';

describe('text import', () => {
  it('imports the bundled example (title, values, DD, alts, auto values, final)', () => {
    const r = gameFromTxt(TXT_EXAMPLE, 'x');
    expect(r.errors).toEqual([]);
    const g = r.game!;
    expect(g.title).toBe('My Trivia Night');
    expect(g.categories.map((c) => c.name)).toEqual(['Science', 'Geography']);
    expect(g.categories[0].questions.map((q) => q.value)).toEqual([200, 400, 600, 800, 1000]);
    expect(g.categories[0].questions[3].dailyDouble).toBe(true);
    expect(g.categories[0].questions[1].alts).toEqual(['H2O', 'Aqua']);
    expect(g.categories[1].questions.map((q) => q.value)).toEqual([200, 400, 600, 800, 1000]); // auto
    expect(g.final).toMatchObject({ category: 'World Capitals', answer: 'Canberra' });
    expect(r.warnings).toEqual([]);
  });

  it('round-trips an exported game, including pipes and the final round', () => {
    const g = generalKnowledge();
    g.categories[0].questions[0].clue = 'Either/or | pipe test';
    const r = gameFromTxt(gameToTxt(g), 'x');
    expect(r.errors).toEqual([]);
    expect(r.game!.categories.map((c) => c.questions.map((q) => [q.clue, q.answer, q.value, q.alts, !!q.dailyDouble]))).toEqual(
      g.categories.map((c) => c.questions.map((q) => [q.clue, q.answer, q.value, q.alts, !!q.dailyDouble])),
    );
    expect(r.game!.final!.answer).toBe(g.final!.answer);
  });

  it('does not mistake a clue that starts with a number for a value', () => {
    const r = gameFromTxt('# A\n1984 was the year of this book. | Nineteen Eighty-Four', 'x');
    expect(r.game!.categories[0].questions[0]).toMatchObject({ clue: '1984 was the year of this book.', value: 200 });
  });

  it('handles CRLF, a BOM and comments', () => {
    const r = gameFromTxt('﻿// hi\r\n# A\r\n100: q | a\r\n', 'fallback');
    expect(r.game!.title).toBe('fallback');
    expect(r.game!.categories[0].questions).toHaveLength(1);
  });

  it('reports line numbers for every problem', () => {
    const r = gameFromTxt('100: before any category | a\n# A\n100: no answer\n200: | a\n99999999: big | a', 'x');
    expect(r.game).toBeUndefined();
    expect(r.errors).toHaveLength(4);
    expect(r.errors[0]).toMatch(/^Line 1:/);
    expect(r.errors[1]).toMatch(/^Line 3:/);
  });

  it('rejects files with no categories', () => {
    expect(gameFromTxt('just some words', 'x').errors[0]).toMatch(/No categories/);
  });

  it('warns about uneven categories and drops an empty Final', () => {
    const r = gameFromTxt('# A\nq1 | a\nq2 | a\n# B\nq | a\n# Final\n', 'x');
    expect(r.warnings.some((w) => /has 1 clues/.test(w))).toBe(true);
    expect(r.game!.final).toBeUndefined();
  });
});
