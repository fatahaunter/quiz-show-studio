import { describe, expect, it } from 'vitest';
import { generalKnowledge } from '../data/templates';
import { CSV_EXAMPLE, gameFromCsv, gameToCsv, parseCsv } from './csv';

describe('csv', () => {
  it('parses quotes, commas, embedded newlines and CRLF', () => {
    expect(parseCsv('a,"b,c","d ""x""\ny"\r\n1,2,3')).toEqual([['a', 'b,c', 'd "x"\ny'], ['1', '2', '3']]);
  });

  it('imports the bundled example', () => {
    const r = gameFromCsv(CSV_EXAMPLE, 'Ex');
    expect(r.errors).toEqual([]);
    expect(r.game!.categories.map((c) => c.name)).toEqual(['Science', 'Geography']);
    expect(r.game!.categories[0].questions[1].alts).toEqual(['H2O', 'Aqua']);
    expect(r.game!.categories[1].questions[0].dailyDouble).toBe(true);
  });

  it('round-trips an exported game', () => {
    const g = generalKnowledge();
    const r = gameFromCsv(gameToCsv(g), g.title);
    expect(r.errors).toEqual([]);
    expect(r.game!.categories.map((c) => c.questions.map((q) => [q.clue, q.answer, q.value]))).toEqual(
      g.categories.map((c) => c.questions.map((q) => [q.clue, q.answer, q.value])),
    );
  });

  it('neutralises formula injection on export and restores it on import', () => {
    const g = generalKnowledge();
    g.categories[0].questions[0].answer = '=HYPERLINK("http://x")';
    const csv = gameToCsv(g);
    expect(csv).toContain(`'=HYPERLINK`);
    expect(gameFromCsv(csv, 't').game!.categories[0].questions[0].answer).toBe('=HYPERLINK("http://x")');
  });

  it('reports every bad row instead of skipping silently', () => {
    const r = gameFromCsv('category,value,clue,answer\nA,abc,c,a\nA,100,,a\n,100,c,a\nA,100,c,', 't');
    expect(r.game).toBeUndefined();
    expect(r.errors).toHaveLength(4);
  });

  it('rejects files missing required columns', () => {
    expect(gameFromCsv('foo,bar\n1,2', 't').errors[0]).toMatch(/Missing required column/);
  });
});
