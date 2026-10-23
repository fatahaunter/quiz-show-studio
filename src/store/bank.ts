import { del, get, keys, set } from 'idb-keyval';
import { CATEGORY_COLORS, DEFAULT_RULES, SCHEMA_VERSION, uid, type Game } from '../types';
import { parseCsv } from './csv';
import { gameFromTxt, looksFlat } from './txt';

/**
 * A question bank holds any number of categories and clues (hundreds or thousands).
 * Boards are generated from it on demand, so one big import keeps producing fresh games.
 */
export interface BankQuestion {
  clue: string;
  answer: string;
  alts: string[];
  value: number; // difficulty hint; only the ordering matters
}
export interface BankCategory {
  name: string;
  questions: BankQuestion[];
}
export interface Bank {
  id: string;
  title: string;
  categories: BankCategory[];
  updatedAt: number;
}

export const BANK_LIMIT = 50_000;

export const BULK_EXAMPLE = `Title: Big Question Bank

// ---- FORMAT A (flat, easiest for spreadsheets or copy/paste) ----
// One clue per line:   Category | Clue | Answer | Other accepted answers | Difficulty
// The last two parts are optional. Difficulty is a number (bigger = harder); if you leave it off,
// the order of the lines is used (put easier clues first). Use one style per category:
// either give every line in a category a difficulty, or none of them.
// Lines starting with # or // are comments. Optional first line "Format: flat" forces this layout.
// No limit on categories or clues. Use \\| for a literal | character.

Science | This planet is known as the Red Planet. | Mars
Science | H2O is the chemical formula for this liquid. | Water | H2O; Aqua
Science | This force keeps planets in orbit around the Sun. | Gravity
Science | This gas makes up about 78% of Earth's atmosphere. | Nitrogen
Science | Organelles known as the powerhouse of the cell. | Mitochondria | Mitochondrion
Geography | The largest ocean on Earth. | Pacific Ocean | Pacific
Geography | The capital city of Japan. | Tokyo
Geography | This river flows through Cairo, Egypt. | The Nile | Nile; Nile River
Geography | The smallest country in the world by area. | Vatican City
Geography | This mountain range separates Europe from Asia. | Ural Mountains | Urals
Music | This instrument has black and white keys. | Piano | | 1
Music | A six-string instrument that is often strummed. | Guitar | | 2
Music | A standard violin has this many strings. | Four | 4 | 3
Music | He composed the Fur Elise piano piece. | Beethoven | | 4
Music | Austrian child prodigy who composed The Magic Flute. | Mozart | | 5

// ---- FORMAT B (grouped): if your file has # lines it is read this way instead ----
//   # Science
//   This planet is known as the Red Planet. | Mars
//   400: H2O is the chemical formula for this liquid. | Water | H2O; Aqua
`;

const splitBars = (s: string) => s.split(/(?<!\\)\|/).map((p) => p.replace(/\\\|/g, '|').trim());
const alts = (s: string | undefined) => (s ?? '').split(';').map((x) => x.trim()).filter(Boolean).slice(0, 10);

export interface BankResult {
  bank?: Bank;
  errors: string[];
  warnings: string[];
}

function finish(title: string, byCat: Map<string, BankCategory>, errors: string[], warnings: string[]): BankResult {
  if (errors.length) return { errors, warnings };
  const categories = [...byCat.values()].filter((c) => c.questions.length > 0);
  const total = categories.reduce((n, c) => n + c.questions.length, 0);
  if (total === 0) return { errors: ['No clues found.'], warnings };
  if (total > BANK_LIMIT) return { errors: [`That is ${total} clues; the limit per bank is ${BANK_LIMIT}. Split it into several files.`], warnings };
  const thin = categories.filter((c) => c.questions.length < 5).length;
  if (thin) warnings.push(`${thin} categor${thin === 1 ? 'y has' : 'ies have'} fewer than 5 clues and can't be used on a standard 5-row board.`);
  return { bank: { id: uid(), title, categories, updatedAt: Date.now() }, errors, warnings };
}

/** Flat `Category | Clue | Answer | Alts | Difficulty` or grouped `# Category` lines (auto-detected). */
export function bankFromText(text: string, fallbackTitle: string): BankResult {
  const src = text.replace(/^\uFEFF/, '');
  const grouped = /^\s*#\s*(?!final\b)\S/im.test(src) && !looksFlat(src);
  if (grouped) {
    const r = gameFromTxt(src, fallbackTitle, { cats: Infinity, clues: Infinity });
    if (!r.game) return { errors: r.errors, warnings: r.warnings };
    const byCat = new Map<string, BankCategory>();
    for (const c of r.game.categories) byCat.set(c.name.toLowerCase(), { name: c.name, questions: c.questions.map((q) => ({ clue: q.clue, answer: q.answer, alts: q.alts, value: q.value })) });
    return finish(r.game.title, byCat, [], r.warnings.filter((w) => !/longest category/.test(w)));
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const byCat = new Map<string, BankCategory>();
  const seen = new Set<string>();
  let title = '';
  src.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) return; // comments
    if (/^format\s*:/i.test(line)) return;
    const t = /^title\s*:\s*(.+)$/i.exec(line);
    if (t && byCat.size === 0) return void (title = t[1].trim().slice(0, 100));
    const [cat = '', clue = '', answer = '', alt = '', diff = ''] = splitBars(line);
    if (!clue || !answer || !cat) return void errors.push(`Line ${n}: expected  Category | Clue | Answer  (got ${splitBars(line).filter(Boolean).length} part${splitBars(line).filter(Boolean).length === 1 ? '' : 's'}).`);
    if (diff && !Number.isFinite(Number(diff))) return void errors.push(`Line ${n}: difficulty "${diff}" is not a number.`);
    const key = `${cat.toLowerCase()}|${clue.toLowerCase()}`;
    if (seen.has(key)) warnings.push(`Line ${n}: duplicate clue in "${cat}" (kept).`);
    seen.add(key);
    let c = byCat.get(cat.toLowerCase());
    if (!c) byCat.set(cat.toLowerCase(), (c = { name: cat.slice(0, 60), questions: [] }));
    c.questions.push({ clue: clue.slice(0, 1000), answer: answer.slice(0, 300), alts: alts(alt), value: diff ? Number(diff) : c.questions.length + 1 });
    if (errors.length > 50) return;
  });
  if (errors.length > 50) errors.splice(50, errors.length, `…and more. Fix the first ones and re-import.`);
  for (const c of byCat.values()) c.questions.sort((a, b) => a.value - b.value);
  return finish(title || fallbackTitle, byCat, errors, warnings);
}

/** CSV with columns category,clue,answer and optional alternates,value (same header names as the board CSV). */
export function bankFromCsv(text: string, fallbackTitle: string): BankResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { errors: ['The file has no data rows.'], warnings: [] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  const [ci, qi, ai, li, vi] = [col('category'), col('clue'), col('answer'), col('alternates'), col('value')];
  if (ci < 0 || qi < 0 || ai < 0) return { errors: ['Missing required column(s): category, clue, answer.'], warnings: [] };
  const errors: string[] = [];
  const byCat = new Map<string, BankCategory>();
  rows.slice(1).forEach((r, i) => {
    const cat = (r[ci] ?? '').trim(), clue = (r[qi] ?? '').trim(), answer = (r[ai] ?? '').trim();
    if (!cat || !clue || !answer) return void (errors.length < 50 && errors.push(`Row ${i + 2}: category, clue and answer are all required.`));
    let c = byCat.get(cat.toLowerCase());
    if (!c) byCat.set(cat.toLowerCase(), (c = { name: cat.slice(0, 60), questions: [] }));
    const v = vi >= 0 && r[vi]?.trim() && Number.isFinite(Number(r[vi])) ? Number(r[vi]) : c.questions.length + 1;
    c.questions.push({ clue: clue.slice(0, 1000), answer: answer.slice(0, 300), alts: alts(li >= 0 ? r[li] : ''), value: v });
  });
  for (const c of byCat.values()) c.questions.sort((a, b) => a.value - b.value);
  return finish(fallbackTitle, byCat, errors, []);
}

export interface BuildOptions {
  categories: string[]; // names to use, in board order
  rows: number;
  step: number; // point step: row i is worth (i+1)*step
  dailyDoubles: number; // how many random clues become Daily Doubles
  rng?: () => number;
}

/** Categories that have enough clues for the requested number of rows. */
export const usable = (b: Bank, rows: number) => b.categories.filter((c) => c.questions.length >= rows);

/** One random clue per difficulty bucket, easiest first (the logic behind each board column). */
export function drawClues(c: BankCategory, rows: number, rng: () => number = Math.random): BankQuestion[] {
  const sorted = [...c.questions].sort((x, y) => x.value - y.value);
  return Array.from({ length: rows }, (_, r) => {
    const lo = Math.floor((r * sorted.length) / rows);
    const hi = Math.max(lo + 1, Math.floor(((r + 1) * sorted.length) / rows));
    return sorted[lo + Math.floor(rng() * (hi - lo))];
  });
}

/**
 * Builds a board. Each category's clues are ordered by difficulty and split into `rows` equal
 * buckets; one random clue is drawn from each bucket, so every row has the right difficulty
 * and repeated builds from the same bank produce different games.
 */
export function buildGame(b: Bank, o: BuildOptions): Game {
  const rng = o.rng ?? Math.random;
  const cats = o.categories.map((name) => b.categories.find((c) => c.name === name)).filter(Boolean) as BankCategory[];
  if (cats.length === 0) throw new Error('Pick at least one category.');
  for (const c of cats) if (c.questions.length < o.rows) throw new Error(`"${c.name}" has only ${c.questions.length} clues.`);
  const game: Game = {
    schema: SCHEMA_VERSION,
    id: uid(),
    title: `${b.title} — ${new Date().toLocaleDateString()}`,
    description: `Generated from the "${b.title}" question bank.`,
    rules: { ...DEFAULT_RULES },
    updatedAt: Date.now(),
    categories: cats.map((c, ci) => {
      const picks = drawClues(c, o.rows, rng);
      return {
        id: uid(),
        name: c.name,
        color: CATEGORY_COLORS[ci % CATEGORY_COLORS.length],
        questions: picks.map((q, r) => ({ id: uid(), clue: q.clue, answer: q.answer, alts: [...q.alts], value: (r + 1) * o.step, dailyDouble: false })),
      };
    }),
  };
  const cells = game.categories.flatMap((c, ci) => c.questions.map((_, qi) => [ci, qi] as const)).filter(([, qi]) => qi > 0); // not the cheapest row
  for (let k = 0; k < Math.min(o.dailyDoubles, cells.length); k++) {
    const [ci, qi] = cells.splice(Math.floor(rng() * cells.length), 1)[0];
    game.categories[ci].questions[qi].dailyDouble = true;
  }
  return game;
}

/** Random pick of `n` usable category names. */
export function randomCategories(b: Bank, n: number, rows: number, rng: () => number = Math.random) {
  const pool = usable(b, rows).map((c) => c.name);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// ---- storage ----
const KEY = (id: string) => `bank:${id}`;
export async function listBanks(): Promise<Bank[]> {
  const ks = (await keys()).filter((k) => typeof k === 'string' && k.startsWith('bank:'));
  return ((await Promise.all(ks.map((k) => get<Bank>(k)))).filter(Boolean) as Bank[]).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const saveBank = (b: Bank) => set(KEY(b.id), b);
export const deleteBank = (id: string) => del(KEY(id));
export const bankSize = (b: Bank) => b.categories.reduce((n, c) => n + c.questions.length, 0);
