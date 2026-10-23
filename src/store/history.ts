import type { GameState } from '../engine/game';

export interface GameResult {
  id: string;
  at: number;
  title: string;
  standings: { name: string; score: number }[];
  stats: { name: string; correct: number; incorrect: number }[];
}

export interface PlayerTotals {
  name: string;
  games: number;
  wins: number;
  points: number;
  best: number;
  correct: number;
  incorrect: number;
}

const KEY = 'qss:history';

export function loadHistory(): GameResult[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Built purely from the append-only score event log, so stats can't drift from what actually happened. */
export function resultFromState(s: GameState, id: string): GameResult {
  const stats = s.players.map((p) => {
    const ev = s.events.filter((e) => e.playerId === p.id);
    return {
      name: p.name,
      correct: ev.filter((e) => e.kind === 'correct' || (e.kind === 'final' && e.delta > 0)).length,
      incorrect: ev.filter((e) => e.kind === 'incorrect' || (e.kind === 'final' && e.delta < 0)).length,
    };
  });
  return {
    id,
    at: Date.now(),
    title: s.game.title,
    standings: [...s.players].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, score: p.score })),
    stats,
  };
}

/** Idempotent: re-saving the same session id replaces the earlier record. */
export function saveResult(r: GameResult) {
  try {
    const all = loadHistory().filter((x) => x.id !== r.id);
    localStorage.setItem(KEY, JSON.stringify([r, ...all].slice(0, 200)));
  } catch {
    /* storage full or blocked */
  }
}

export const clearHistory = () => localStorage.removeItem(KEY);

export function totals(history: GameResult[]): PlayerTotals[] {
  const m = new Map<string, PlayerTotals>();
  for (const g of history) {
    const top = g.standings[0]?.score;
    for (const st of g.standings) {
      const key = st.name.toLowerCase();
      const t = m.get(key) ?? { name: st.name, games: 0, wins: 0, points: 0, best: -Infinity, correct: 0, incorrect: 0 };
      t.games++;
      t.points += st.score;
      t.best = Math.max(t.best, st.score);
      if (st.score === top && g.standings.length > 1) t.wins++;
      const x = g.stats.find((y) => y.name === st.name);
      t.correct += x?.correct ?? 0;
      t.incorrect += x?.incorrect ?? 0;
      m.set(key, t);
    }
  }
  return [...m.values()].sort((a, b) => b.wins - a.wins || b.points - a.points);
}
