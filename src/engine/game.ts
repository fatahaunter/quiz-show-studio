import type { Game, Question } from '../types';

export type Phase = 'lobby' | 'board' | 'clue' | 'final' | 'finished';
/** disabled: nobody can buzz. armed: host opened the window. awarded: a winner was picked. resolved: question over. */
export type BuzzerState = 'disabled' | 'countdown' | 'armed' | 'awarded' | 'resolved';

export interface Player {
  id: string;
  name: string;
  color: string;
  score: number;
  connected: boolean;
  local?: boolean; // pass-and-play player driven from the host keyboard
  key?: string;
}

export interface ScoreEvent {
  n: number;
  playerId: string;
  delta: number;
  reason: string;
  kind: 'correct' | 'incorrect' | 'manual' | 'final';
  qid?: string;
  at: number;
}

export interface Current {
  qid: string;
  cat: number;
  idx: number;
  buzzer: BuzzerState;
  winnerId?: string;
  lockedOut: string[];
  answerShown: boolean;
  dd: boolean;
  wager?: number;
  buzzSeq: number; // incremented on every accepted buzz for deterministic ordering
}

export interface FinalState {
  stage: 'wager' | 'clue' | 'reveal';
  deadline?: number; // epoch ms when answers close (host clock); set when the clue stage starts
  eligible: string[];
  order: string[]; // reveal order: lowest score first
  wagers: Record<string, number>;
  answers: Record<string, string>;
  revealed: string[];
  judged: Record<string, boolean>;
}

export interface GameState {
  v: 1;
  game: Game;
  phase: Phase;
  players: Player[];
  used: string[];
  current?: Current;
  final?: FinalState;
  chooserId?: string;
  events: ScoreEvent[]; // append-only; corrections are compensating events
  log: string[];
  nextEvent: number;
}

export type Action =
  | { t: 'addPlayer'; player: Omit<Player, 'score' | 'connected'> }
  | { t: 'removePlayer'; id: string }
  | { t: 'setConnected'; id: string; connected: boolean }
  | { t: 'start' }
  | { t: 'select'; cat: number; idx: number }
  | { t: 'setWager'; amount: number }
  | { t: 'countdown' }
  | { t: 'arm' }
  | { t: 'disarm' }
  | { t: 'buzz'; playerId: string; qid: string }
  | { t: 'judge'; correct: boolean }
  | { t: 'showAnswer' }
  | { t: 'skip' }
  | { t: 'close' }
  | { t: 'adjust'; playerId: string; delta: number; reason: string }
  | { t: 'setChooser'; id: string }
  | { t: 'startFinal' }
  | { t: 'finalWager'; playerId: string; amount: number }
  | { t: 'finalAnswer'; playerId: string; text: string }
  | { t: 'finalAdvance'; deadline?: number }
  | { t: 'finalReveal' }
  | { t: 'finalJudge'; playerId: string; correct: boolean }
  | { t: 'finalFinish' }
  | { t: 'reset' };

export function createState(game: Game): GameState {
  return { v: 1, game, phase: 'lobby', players: [], used: [], events: [], log: [], nextEvent: 1 };
}

export const questionAt = (g: Game, cat: number, idx: number): Question | undefined => g.categories[cat]?.questions[idx];

export function totalQuestions(g: Game) {
  return g.categories.reduce((n, c) => n + c.questions.length, 0);
}

export function maxWager(s: GameState, playerId: string) {
  const p = s.players.find((x) => x.id === playerId);
  const top = Math.max(0, ...s.game.categories.flatMap((c) => c.questions.map((q) => q.value)));
  return Math.max(top, p?.score ?? 0);
}

function addScore(s: GameState, playerId: string, delta: number, reason: string, kind: ScoreEvent['kind'], qid?: string): GameState {
  const p = s.players.find((x) => x.id === playerId);
  if (!p || !Number.isFinite(delta) || delta === 0) return s;
  let applied = delta;
  if (!s.game.rules.allowNegative && p.score + delta < 0) applied = -p.score;
  if (applied === 0) return s;
  return {
    ...s,
    players: s.players.map((x) => (x.id === playerId ? { ...x, score: x.score + applied } : x)),
    events: [...s.events, { n: s.nextEvent, playerId, delta: applied, reason, kind, qid, at: Date.now() }],
    nextEvent: s.nextEvent + 1,
  };
}

const log = (s: GameState, msg: string): GameState => ({ ...s, log: [...s.log.slice(-199), msg] });
const pname = (s: GameState, id?: string) => s.players.find((p) => p.id === id)?.name ?? 'Unknown';

function eligible(s: GameState, c: Current) {
  return s.players.filter((p) => p.connected && !c.lockedOut.includes(p.id));
}

export function reduce(s: GameState, a: Action): GameState {
  const c = s.current;
  switch (a.t) {
    case 'addPlayer': {
      if (s.players.some((p) => p.id === a.player.id)) return s;
      if (s.players.some((p) => p.name.trim().toLowerCase() === a.player.name.trim().toLowerCase())) return s;
      const next = { ...s, players: [...s.players, { ...a.player, score: 0, connected: true }] };
      return { ...next, chooserId: next.chooserId ?? a.player.id };
    }
    case 'removePlayer': {
      const players = s.players.filter((p) => p.id !== a.id);
      const chooserId = s.chooserId === a.id ? players[0]?.id : s.chooserId;
      let cur = c;
      if (cur) {
        const wasWinner = cur.winnerId === a.id;
        cur = {
          ...cur,
          lockedOut: cur.lockedOut.filter((x) => x !== a.id),
          winnerId: wasWinner ? undefined : cur.winnerId,
          buzzer: wasWinner && cur.buzzer === 'awarded' ? 'disabled' : cur.buzzer,
        };
      }
      return { ...s, players, chooserId, current: cur };
    }
    case 'setConnected':
      return { ...s, players: s.players.map((p) => (p.id === a.id ? { ...p, connected: a.connected } : p)) };
    case 'start':
      if (s.phase !== 'lobby' || s.players.length === 0) return s;
      return log({ ...s, phase: 'board' }, 'Game started');
    case 'select': {
      if (s.phase !== 'board') return s;
      const q = questionAt(s.game, a.cat, a.idx);
      if (!q || s.used.includes(q.id)) return s;
      const dd = !!q.dailyDouble && !!s.chooserId;
      return {
        ...s,
        phase: 'clue',
        current: { qid: q.id, cat: a.cat, idx: a.idx, buzzer: 'disabled', lockedOut: [], answerShown: false, dd, buzzSeq: 0 },
      };
    }
    case 'setWager': {
      if (!c || !c.dd || c.wager !== undefined || !s.chooserId) return s;
      const amount = Math.floor(a.amount);
      if (!(amount >= 0) || amount > maxWager(s, s.chooserId)) return s;
      return { ...s, current: { ...c, wager: amount, winnerId: s.chooserId, buzzer: 'awarded', buzzSeq: 1 } };
    }
    case 'countdown': {
      // Starts the visual 3-2-1. Still closed: buzzes are rejected until the host's timer sends `arm`.
      if (!c || c.dd || c.buzzer !== 'disabled' || c.answerShown) return s;
      if (eligible(s, c).length === 0) return s;
      return { ...s, current: { ...c, buzzer: 'countdown' } };
    }
    case 'arm': {
      if (!c || c.dd || (c.buzzer !== 'disabled' && c.buzzer !== 'countdown') || c.answerShown) return s;
      if (eligible(s, c).length === 0) return s;
      return { ...s, current: { ...c, buzzer: 'armed' } };
    }
    case 'disarm':
      if (!c || (c.buzzer !== 'armed' && c.buzzer !== 'countdown')) return s;
      return { ...s, current: { ...c, buzzer: 'disabled' } };
    case 'buzz': {
      // The only place buzzer order is decided: first accepted call wins, regardless of any client clock.
      if (!c || c.buzzer !== 'armed' || a.qid !== c.qid) return s;
      const p = s.players.find((x) => x.id === a.playerId);
      if (!p || !p.connected || c.lockedOut.includes(p.id)) return s;
      return log({ ...s, current: { ...c, buzzer: 'awarded', winnerId: p.id, buzzSeq: c.buzzSeq + 1 } }, `${p.name} buzzed in`);
    }
    case 'judge': {
      if (!c || c.buzzer !== 'awarded' || !c.winnerId) return s;
      const q = questionAt(s.game, c.cat, c.idx)!;
      const amount = c.dd ? c.wager ?? 0 : q.value;
      const who = c.winnerId;
      if (a.correct) {
        let n = addScore(s, who, amount, `Correct: ${q.clue.slice(0, 40)}`, 'correct', c.qid);
        n = log(n, `${pname(s, who)} answered correctly (+${amount})`);
        return { ...n, chooserId: who, used: [...n.used, c.qid], current: { ...c, buzzer: 'resolved', answerShown: true } };
      }
      const penalty = c.dd || s.game.rules.wrongPenalty ? amount : 0;
      let n = addScore(s, who, -penalty, `Incorrect: ${q.clue.slice(0, 40)}`, 'incorrect', c.qid);
      n = log(n, `${pname(s, who)} answered incorrectly${penalty ? ` (-${penalty})` : ''}`);
      const next: Current = { ...c, lockedOut: [...c.lockedOut, who], winnerId: undefined, buzzer: 'disabled' };
      const canRetry = !c.dd && s.game.rules.allowRebuzz && eligible(n, next).length > 0;
      if (canRetry) return { ...n, current: next };
      return { ...n, used: [...n.used, c.qid], current: { ...next, buzzer: 'resolved', answerShown: true } };
    }
    case 'showAnswer':
      if (!c) return s;
      return { ...s, current: { ...c, answerShown: true } };
    case 'skip': {
      if (!c || c.buzzer === 'resolved') return s;
      return log(
        { ...s, used: [...s.used, c.qid], current: { ...c, buzzer: 'resolved', answerShown: true, winnerId: undefined } },
        'Question skipped',
      );
    }
    case 'close': {
      if (!c || c.buzzer !== 'resolved') return s;
      const done = s.used.length >= totalQuestions(s.game);
      const finished = done && !(s.game.final && !s.final);
      return { ...s, phase: finished ? 'finished' : 'board', current: undefined };
    }
    case 'adjust': {
      const n = addScore(s, a.playerId, Math.trunc(a.delta), a.reason || 'Manual adjustment', 'manual', s.current?.qid);
      return n === s ? s : log(n, `${pname(s, a.playerId)} ${a.delta > 0 ? '+' : ''}${a.delta} (${a.reason || 'manual'})`);
    }
    case 'setChooser':
      return s.players.some((p) => p.id === a.id) ? { ...s, chooserId: a.id } : s;
    case 'startFinal': {
      if (s.phase !== 'board' || !s.game.final || s.final) return s;
      const eligible = s.players.filter((p) => p.score > 0).map((p) => p.id);
      if (eligible.length === 0) return log({ ...s, phase: 'finished' }, 'No player has a positive score: final round skipped');
      const order = [...eligible].sort((x, y) => s.players.find((p) => p.id === x)!.score - s.players.find((p) => p.id === y)!.score);
      return log({ ...s, phase: 'final', final: { stage: 'wager', eligible, order, wagers: {}, answers: {}, revealed: [], judged: {} } }, 'Final round');
    }
    case 'finalWager': {
      const f = s.final;
      const p = s.players.find((x) => x.id === a.playerId);
      if (s.phase !== 'final' || !f || f.stage !== 'wager' || !p || !f.eligible.includes(p.id)) return s;
      const amount = Math.floor(a.amount);
      if (!Number.isFinite(amount) || amount < 0 || amount > p.score) return s;
      return { ...s, final: { ...f, wagers: { ...f.wagers, [p.id]: amount } } };
    }
    case 'finalAnswer': {
      const f = s.final;
      if (s.phase !== 'final' || !f || f.stage !== 'clue' || !f.eligible.includes(a.playerId)) return s;
      const text = a.text.replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!text) return s;
      return { ...s, final: { ...f, answers: { ...f.answers, [a.playerId]: text } } };
    }
    case 'finalAdvance': {
      const f = s.final;
      if (s.phase !== 'final' || !f) return s;
      if (f.stage === 'wager') {
        const wagers = { ...f.wagers };
        for (const id of f.eligible) wagers[id] ??= 0;
        return { ...s, final: { ...f, stage: 'clue', wagers, deadline: a.deadline } };
      }
      if (f.stage === 'clue') return { ...s, final: { ...f, stage: 'reveal' } };
      return s;
    }
    case 'finalReveal': {
      const f = s.final;
      if (s.phase !== 'final' || !f || f.stage !== 'reveal') return s;
      const next = f.order.find((id) => !f.revealed.includes(id));
      return next ? { ...s, final: { ...f, revealed: [...f.revealed, next] } } : s;
    }
    case 'finalJudge': {
      const f = s.final;
      if (s.phase !== 'final' || !f || f.stage !== 'reveal' || !f.revealed.includes(a.playerId) || a.playerId in f.judged) return s;
      const w = f.wagers[a.playerId] ?? 0;
      const n = addScore(s, a.playerId, a.correct ? w : -w, `Final round ${a.correct ? 'correct' : 'incorrect'}`, 'final');
      return log({ ...n, final: { ...f, judged: { ...f.judged, [a.playerId]: a.correct } } }, `${pname(s, a.playerId)} final: ${a.correct ? '+' : '-'}${w}`);
    }
    case 'finalFinish': {
      const f = s.final;
      if (s.phase !== 'final' || !f || f.stage !== 'reveal' || !f.order.every((id) => id in f.judged)) return s;
      return { ...s, phase: 'finished' };
    }
    case 'reset':
      return { ...createState(s.game), players: s.players.map((p) => ({ ...p, score: 0 })), chooserId: s.players[0]?.id };
  }
}

export function standings(s: GameState) {
  return [...s.players].sort((a, b) => b.score - a.score);
}

// ---- Views: what each audience may see. The answer key never leaves the host controls. ----

export interface PublicView {
  title: string;
  phase: Phase;
  players: Pick<Player, 'id' | 'name' | 'color' | 'score' | 'connected'>[];
  chooserId?: string;
  board: { name: string; color: string; cells: { value: number; used: boolean }[] }[];
  final?: {
    stage: 'wager' | 'clue' | 'reveal';
    category: string;
    clue?: string;
    answer?: string;
    deadline?: number;
    sentAt: number;
    submitted: string[];
    revealed: { id: string; answer: string; wager: number; correct?: boolean }[];
  };
  clue?: {
    text: string;
    image?: string;
    buzzer: BuzzerState;
    winnerId?: string;
    lockedOut: string[];
    dd: boolean;
    wager?: number;
    value: number;
    answer?: string; // only once answerShown
    explanation?: string;
  };
}

export function publicView(s: GameState): PublicView {
  const c = s.current;
  const q = c ? questionAt(s.game, c.cat, c.idx) : undefined;
  const ddHidden = !!c?.dd && c.wager === undefined;
  return {
    title: s.game.title,
    phase: s.phase,
    players: s.players.map(({ id, name, color, score, connected }) => ({ id, name, color, score, connected })),
    chooserId: s.chooserId,
    final: pubFinal(s),
    board: s.game.categories.map((cat) => ({
      name: cat.name,
      color: cat.color,
      cells: cat.questions.map((x) => ({ value: x.value, used: s.used.includes(x.id) })),
    })),
    clue:
      c && q
        ? {
            text: ddHidden ? '' : q.clue,
            image: ddHidden ? undefined : q.image,
            buzzer: c.buzzer,
            winnerId: c.winnerId,
            lockedOut: c.lockedOut,
            dd: c.dd,
            wager: c.wager,
            value: q.value,
            answer: c.answerShown ? q.answer : undefined,
            explanation: c.answerShown ? q.explanation : undefined,
          }
        : undefined,
  };
}

function pubFinal(s: GameState): PublicView['final'] {
  const f = s.final;
  const fc = s.game.final;
  if (!f || !fc) return undefined;
  return {
    stage: f.stage,
    category: fc.category,
    clue: f.stage === 'wager' ? undefined : fc.clue,
    answer: f.stage === 'reveal' ? fc.answer : undefined,
    deadline: f.stage === 'clue' ? f.deadline : undefined,
    sentAt: Date.now(),
    submitted: f.stage === 'wager' ? Object.keys(f.wagers) : f.stage === 'clue' ? Object.keys(f.answers) : [],
    revealed: f.revealed.map((id) => ({ id, answer: f.answers[id] ?? '(no answer)', wager: f.wagers[id] ?? 0, correct: f.judged[id] })),
  };
}

/** Minimal payload for a phone: no clue text, no answers. */
export interface PlayerView {
  phase: Phase;
  title: string;
  you: { id: string; name: string; color: string; score: number };
  buzzer: BuzzerState | 'none';
  qid?: string;
  youWon: boolean;
  youLocked: boolean;
  winnerName?: string;
  final?: { stage: 'wager' | 'clue' | 'reveal'; category: string; clue?: string; deadline?: number; sentAt: number; eligible: boolean; maxWager: number; wager?: number; answer?: string };
  standings: { name: string; score: number; color: string }[];
}

export function playerView(s: GameState, playerId: string): PlayerView | undefined {
  const me = s.players.find((p) => p.id === playerId);
  if (!me) return undefined;
  const c = s.current;
  return {
    phase: s.phase,
    title: s.game.title,
    you: { id: me.id, name: me.name, color: me.color, score: me.score },
    buzzer: c ? c.buzzer : 'none',
    qid: c?.qid,
    youWon: c?.winnerId === me.id,
    youLocked: !!c?.lockedOut.includes(me.id),
    winnerName: c?.winnerId ? pname(s, c.winnerId) : undefined,
    final:
      s.final && s.game.final
        ? {
            stage: s.final.stage,
            category: s.game.final.category,
            clue: s.final.stage === 'wager' ? undefined : s.game.final.clue,
            deadline: s.final.stage === 'clue' ? s.final.deadline : undefined,
            sentAt: Date.now(),
            eligible: s.final.eligible.includes(me.id),
            maxWager: Math.max(0, me.score),
            wager: s.final.wagers[me.id],
            answer: s.final.answers[me.id],
          }
        : undefined,
    standings: standings(s).map(({ name, score, color }) => ({ name, score, color })),
  };
}
