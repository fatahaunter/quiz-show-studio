import { describe, expect, it } from 'vitest';
import { BULK_EXAMPLE, buildGame, bankFromCsv, bankFromText, randomCategories, usable } from './bank';

const big = (cats: number, per: number) =>
  Array.from({ length: cats }, (_, c) => Array.from({ length: per }, (_, q) => `Cat${c} | Clue ${c}-${q} | Ans ${c}-${q}`).join('\n')).join('\n');

describe('bulk import', () => {
  it('parses the bundled flat example', () => {
    const r = bankFromText(BULK_EXAMPLE, 'x');
    expect(r.errors).toEqual([]);
    expect(r.bank!.title).toBe('Big Question Bank');
    expect(r.bank!.categories.map((c) => [c.name, c.questions.length])).toEqual([['Science', 5], ['Geography', 5], ['Music', 5]]);
    const sci = r.bank!.categories[0].questions;
    expect(sci.find((q) => q.answer === 'Water')!.alts).toEqual(['H2O', 'Aqua']);
    expect(sci.map((q) => q.answer)).toEqual(['Mars', 'Water', 'Gravity', 'Nitrogen', 'Mitochondria']); // file order
    expect(r.bank!.categories[2].questions.map((q) => q.answer)).toEqual(['Piano', 'Guitar', 'Four', 'Beethoven', 'Mozart']); // explicit difficulty
    expect(r.bank!.categories[2].questions[2].alts).toEqual(['4']);
  });

  it('handles thousands of clues quickly', () => {
    const t0 = Date.now();
    const r = bankFromText(big(100, 100), 'x');
    expect(r.errors).toEqual([]);
    expect(r.bank!.categories).toHaveLength(100);
    expect(r.bank!.categories[0].questions).toHaveLength(100);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('groups categories case-insensitively and supports escaped pipes', () => {
    const r = bankFromText('Sci | a \\| b | x\nsci | c | y', 'x');
    expect(r.bank!.categories).toHaveLength(1);
    expect(r.bank!.categories[0].questions[0].clue).toBe('a | b');
  });

  it('reads the grouped # format with no limits', () => {
    const t = '# A\n' + Array.from({ length: 40 }, (_, i) => `clue ${i} | ans ${i}`).join('\n');
    const r = bankFromText(t, 'x');
    expect(r.errors).toEqual([]);
    expect(r.bank!.categories[0].questions).toHaveLength(40);
  });

  it('reports bad lines with numbers, capped', () => {
    const r = bankFromText('A | only clue\nB | c | a | | notnum\n' + Array.from({ length: 80 }, () => 'bad').join('\n'), 'x');
    expect(r.bank).toBeUndefined();
    expect(r.errors[0]).toMatch(/^Line 1:/);
    expect(r.errors[1]).toMatch(/^Line 2: difficulty/);
    expect(r.errors.length).toBeLessThanOrEqual(52);
  });

  it('imports CSV banks', () => {
    const r = bankFromCsv('category,clue,answer,alternates,value\nA,q1,a1,x; y,200\nA,q0,a0,,100\nB,q,a,,', 't');
    expect(r.errors).toEqual([]);
    expect(r.bank!.categories[0].questions.map((q) => q.answer)).toEqual(['a0', 'a1']);
    expect(r.bank!.categories[0].questions[1].alts).toEqual(['x', 'y']);
  });
});

describe('building a board from a bank', () => {
  const bank = bankFromText(big(12, 30), 'Bank').bank!;
  const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

  it('draws one clue per difficulty bucket, with values (row+1)*step', () => {
    const g = buildGame(bank, { categories: ['Cat3', 'Cat7'], rows: 5, step: 200, dailyDoubles: 0, rng: seeded(1) });
    expect(g.categories.map((c) => c.name)).toEqual(['Cat3', 'Cat7']);
    expect(g.categories[0].questions.map((q) => q.value)).toEqual([200, 400, 600, 800, 1000]);
    // bucket r covers sorted indexes [6r, 6r+6): clue number must fall inside it
    g.categories[0].questions.forEach((q, r) => {
      const n = Number(q.clue.split('-')[1]);
      expect(n).toBeGreaterThanOrEqual(r * 6);
      expect(n).toBeLessThan(r * 6 + 6);
    });
  });

  it('produces different boards on repeated builds and never repeats a clue within a board', () => {
    const a = buildGame(bank, { categories: ['Cat0'], rows: 5, step: 100, dailyDoubles: 0, rng: seeded(1) });
    const b = buildGame(bank, { categories: ['Cat0'], rows: 5, step: 100, dailyDoubles: 0, rng: seeded(99) });
    expect(a.categories[0].questions.map((q) => q.clue)).not.toEqual(b.categories[0].questions.map((q) => q.clue));
    expect(new Set(a.categories[0].questions.map((q) => q.clue)).size).toBe(5);
  });

  it('places the requested Daily Doubles, never on the cheapest row', () => {
    const g = buildGame(bank, { categories: bank.categories.slice(0, 5).map((c) => c.name), rows: 5, step: 200, dailyDoubles: 2, rng: seeded(7) });
    const dds = g.categories.flatMap((c) => c.questions.map((q, i) => (q.dailyDouble ? i : -1)).filter((i) => i >= 0));
    expect(dds).toHaveLength(2);
    expect(dds.every((i) => i > 0)).toBe(true);
  });

  it('rejects categories that are too small and picks only usable ones at random', () => {
    const small = bankFromText('Tiny | a | b\n' + big(3, 6), 'S').bank!;
    expect(usable(small, 5).map((c) => c.name)).toEqual(['Cat0', 'Cat1', 'Cat2']);
    expect(() => buildGame(small, { categories: ['Tiny'], rows: 5, step: 200, dailyDoubles: 0 })).toThrow(/only 1 clues/);
    expect(randomCategories(small, 10, 5).sort()).toEqual(['Cat0', 'Cat1', 'Cat2']);
  });
});

import { drawClues } from './bank';
describe('drawClues', () => {
  it('returns one clue per row, easiest bucket first', () => {
    const c = { name: 'X', questions: Array.from({ length: 20 }, (_, i) => ({ clue: `c${i}`, answer: 'a', alts: [], value: i + 1 })) };
    const d = drawClues(c, 5, () => 0);
    expect(d.map((q) => q.clue)).toEqual(['c0', 'c4', 'c8', 'c12', 'c16']);
  });
});
