import { del, get, keys, set } from 'idb-keyval';
import { isNative, shareFile } from '../native';
import { DEFAULT_RULES, SCHEMA_VERSION, uid, type Game } from '../types';
import type { GameState } from '../engine/game';

// Games live in IndexedDB (room for images); small session/preferences data lives in localStorage.
const GAME_KEY = (id: string) => `game:${id}`;

export async function listGames(): Promise<Game[]> {
  const ks = (await keys()).filter((k) => typeof k === 'string' && k.startsWith('game:'));
  const games = (await Promise.all(ks.map((k) => get<Game>(k)))).filter(Boolean) as Game[];
  return games.sort((a, b) => b.updatedAt - a.updatedAt);
}
export const loadGame = (id: string) => get<Game>(GAME_KEY(id));
export const saveGame = (g: Game) => set(GAME_KEY(g.id), { ...g, updatedAt: Date.now() });
export const deleteGame = (id: string) => del(GAME_KEY(id));

export async function duplicateGame(id: string): Promise<Game | undefined> {
  const g = await loadGame(id);
  if (!g) return;
  const copy: Game = JSON.parse(JSON.stringify(g));
  copy.id = uid();
  copy.title = `${g.title} (copy)`;
  copy.categories.forEach((c) => {
    c.id = uid();
    c.questions.forEach((q) => (q.id = uid()));
  });
  await saveGame(copy);
  return copy;
}

// ---- Import / export (versioned) ----

export function exportGameJson(g: Game) {
  return JSON.stringify({ format: 'quiz-show-studio', ...g, schema: SCHEMA_VERSION }, null, 2);
}

export function downloadText(name: string, text: string, mime = 'application/json') {
  if (isNative()) {
    void shareFile(name, text).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Validates untrusted JSON and returns a clean Game or a list of human-readable problems. */
export function parseGameJson(text: string): { game?: Game; errors: string[] } {
  const errors: string[] = [];
  let d: any;
  try {
    d = JSON.parse(text);
  } catch {
    return { errors: ['File is not valid JSON.'] };
  }
  if (!d || typeof d !== 'object') return { errors: ['File does not contain a game.'] };
  if (typeof d.schema !== 'number' || d.schema > SCHEMA_VERSION)
    errors.push(`Unsupported schema version ${String(d.schema)} (this app supports up to ${SCHEMA_VERSION}).`);
  if (!Array.isArray(d.categories) || d.categories.length === 0) errors.push('Game has no categories.');
  else if (d.categories.length > 8) errors.push(`Game has ${d.categories.length} categories; the maximum is 8.`);
  if (errors.length) return { errors };
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const game: Game = {
    schema: SCHEMA_VERSION,
    id: uid(),
    title: str(d.title, 100) || 'Imported game',
    description: str(d.description, 500),
    updatedAt: Date.now(),
    rules: {
      wrongPenalty: d.rules?.wrongPenalty !== false,
      allowRebuzz: d.rules?.allowRebuzz !== false,
      allowNegative: d.rules?.allowNegative !== false,
      buzzWindowSec: Math.min(60, Math.max(0, Number(d.rules?.buzzWindowSec) || DEFAULT_RULES.buzzWindowSec)),
      finalSeconds: Number.isFinite(Number(d.rules?.finalSeconds)) ? Math.min(300, Math.max(0, Math.round(Number(d.rules.finalSeconds)))) : 30,
    },
    final:
      d.final && typeof d.final === 'object' && str(d.final.clue, 1000) && str(d.final.answer, 300)
        ? {
            category: str(d.final.category, 60) || 'Final Round',
            clue: str(d.final.clue, 1000),
            answer: str(d.final.answer, 300),
            alts: Array.isArray(d.final.alts) ? d.final.alts.slice(0, 10).map((x: unknown) => str(x, 300)).filter(Boolean) : [],
            mode: d.final.mode === 'typed' || d.final.mode === 'normal' ? d.final.mode : 'wager',
            value: Number.isFinite(Number(d.final.value)) && Number(d.final.value) >= 0 ? Math.round(Number(d.final.value)) : undefined,
          }
        : undefined,
    categories: d.categories.slice(0, 8).map((c: any, ci: number) => {
      if (!Array.isArray(c?.questions)) errors.push(`Category ${ci + 1} has no questions list.`);
      return {
        id: uid(),
        name: str(c?.name, 60) || `Category ${ci + 1}`,
        color: /^#[0-9a-fA-F]{6}$/.test(c?.color) ? c.color : '#3B82F6',
        questions: (Array.isArray(c?.questions) ? c.questions : []).slice(0, 12).map((q: any, qi: number) => {
          const value = Number(q?.value);
          if (!Number.isFinite(value) || value < 0) errors.push(`"${str(c?.name, 60)}" question ${qi + 1}: invalid value.`);
          if (!str(q?.answer, 300)) errors.push(`"${str(c?.name, 60)}" question ${qi + 1}: missing answer.`);
          const image = typeof q?.image === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(q.image) ? q.image : undefined;
          return {
            id: uid(),
            clue: str(q?.clue, 1000),
            answer: str(q?.answer, 300),
            alts: Array.isArray(q?.alts) ? q.alts.slice(0, 10).map((x: unknown) => str(x, 300)).filter(Boolean) : [],
            value: Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0,
            image,
            explanation: str(q?.explanation, 500) || undefined,
            hostNotes: str(q?.hostNotes, 500) || undefined,
            dailyDouble: !!q?.dailyDouble,
          };
        }),
      };
    }),
  };
  return errors.length ? { errors } : { game, errors };
}

// ---- Host session persistence (survives refresh) ----

const SESSION = 'qss:host-session';
export interface SavedSession {
  code: string;
  state: GameState;
  tokens: Record<string, string>; // player token -> player id
  locked: boolean;
}
export function saveSession(s: SavedSession) {
  try {
    localStorage.setItem(SESSION, JSON.stringify(s));
  } catch {
    /* quota exceeded: images make this big; the in-memory game continues regardless */
  }
}
export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}
export const clearSession = () => localStorage.removeItem(SESSION);

// ---- Preferences ----

export interface Prefs {
  theme: 'neon' | 'classic' | 'minimal';
  reduceMotion: boolean;
  sound: boolean;
  volume: number;
}
const PREFS = 'qss:prefs';
export const defaultPrefs: Prefs = { theme: 'neon', reduceMotion: false, sound: true, volume: 0.6 };
export function loadPrefs(): Prefs {
  try {
    return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(PREFS) || '{}') };
  } catch {
    return defaultPrefs;
  }
}
export const savePrefs = (p: Prefs) => {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    /* ignore */
  }
};
