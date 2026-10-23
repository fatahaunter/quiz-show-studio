import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bankFromText, buildGame, randomCategories, usable } from './bank';
import { gameFromTxt, looksFlat } from './txt';

const bundled = readFileSync('src/data/question-bank-2000.txt', 'utf8');

describe('the bundled 2,000-question bank', () => {
  const r = bankFromText(bundled, 'x');

  it('imports cleanly: every clue present, real categories, nothing mangled', () => {
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    const total = r.bank!.categories.reduce((n, c) => n + c.questions.length, 0);
    expect(total).toBe(2000);
    expect(r.bank!.categories).toHaveLength(23);
    expect(r.bank!.title).toBe('Jeopardy Question Bank — 2,000 Questions');
    // regression: the "# ..." header lines must not become categories
    expect(r.bank!.categories.some((c) => /imported as|review clues|difficulty/i.test(c.name))).toBe(false);
    for (const c of r.bank!.categories) for (const q of c.questions) {
      expect(q.clue.length).toBeGreaterThan(5);
      expect(q.answer.length).toBeGreaterThan(0);
    }
  });

  it('is detected as flat and refused as a single board', () => {
    expect(looksFlat(bundled)).toBe(true);
    expect(gameFromTxt(bundled, 'x').game).toBeUndefined();
  });

  it('builds a full, distinct 5x5 board', () => {
    const cats = randomCategories(r.bank!, 5, 5);
    expect(cats).toHaveLength(5);
    const g = buildGame(r.bank!, { categories: cats, rows: 5, step: 200, dailyDoubles: 1 });
    expect(g.categories.flatMap((c) => c.questions)).toHaveLength(25);
    expect(new Set(g.categories.flatMap((c) => c.questions.map((q) => q.clue))).size).toBe(25);
    expect(usable(r.bank!, 5).length).toBe(23);
  });
});

describe('flat vs grouped detection', () => {
  it('treats # lines as comments in a flat file, even a tiny one', () => {
    const t = '# Category | Clue | Answer\n# note\nA | q1 | a1\nA | q2 | a2\nB | q3 | a3\nB | q4 | a4';
    expect(looksFlat(t)).toBe(true);
    const b = bankFromText(t, 'x');
    expect(b.errors).toEqual([]);
    expect(b.bank!.categories.map((c) => [c.name, c.questions.length])).toEqual([['A', 2], ['B', 2]]);
    expect(gameFromTxt(t, 'x').game).toBeUndefined();
  });

  it('keeps real grouped files grouped', () => {
    const t = '# Science\nWhat is red? | Mars | Planet\nWhat is wet? | Water | H2O\n# Geo\nCapital? | Tokyo';
    expect(looksFlat(t)).toBe(false);
    expect(gameFromTxt(t, 'x').game!.categories.map((c) => c.name)).toEqual(['Science', 'Geo']);
  });

  it('honours an explicit Format line', () => {
    expect(looksFlat('Format: flat\n# A\nq | a | b')).toBe(true);
    expect(looksFlat('Format: grouped\nA | q | a\nA | q2 | a2\nA | q3 | a3')).toBe(false);
  });
});
