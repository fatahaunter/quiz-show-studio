import { CATEGORY_COLORS, DEFAULT_RULES, SCHEMA_VERSION, uid, type Category, type FinalClue, type Game } from '../types';
import type { CsvResult } from './csv';

/** The format, shown to users as the downloadable template. */
export const TXT_EXAMPLE = `Title: My Trivia Night

// Lines starting with // are ignored.
// A line starting with # starts a new category.
// Clue lines look like:   value: clue | answer | other accepted answers (optional)
// Put a * after the value to make it a Daily Double.
// Leave the value off and it is filled in for you (200, 400, 600...).

# Science
200: This planet is known as the Red Planet. | Mars
400: H2O is the chemical formula for this liquid. | Water | H2O; Aqua
600: This force keeps planets in orbit around the Sun. | Gravity
800*: This gas makes up about 78% of Earth's atmosphere. | Nitrogen
1000: Organelles known as the powerhouse of the cell. | Mitochondria | Mitochondrion

# Geography
The largest ocean on Earth. | Pacific Ocean | Pacific
The capital city of Japan. | Tokyo
This river flows through Cairo, Egypt. | The Nile | Nile; Nile River
The smallest country in the world by area. | Vatican City
This mountain range separates Europe from Asia. | Ural Mountains | Urals

// Optional Final round (one clue):
# Final: World Capitals
This city is the capital of Australia. | Canberra
`;

const splitBars = (s: string) => s.split(/(?<!\\)\|/).map((p) => p.replace(/\\\|/g, '|').trim());

/**
 * Is this the flat `Category | Clue | Answer | ...` layout rather than `# Category` groups?
 * A flat file repeats its first column (the category) on many lines; grouped files start every
 * line with a unique clue. `#` lines in a flat file are just comments. An explicit
 * `Format: flat` or `Format: grouped` line overrides the guess.
 */
export function looksFlat(text: string): boolean {
  if (/^\s*format\s*:\s*flat\s*$/im.test(text)) return true;
  if (/^\s*format\s*:\s*grouped\s*$/im.test(text)) return false;
  const seen = new Set<string>();
  let data = 0;
  let repeats = 0;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#') || /^title\s*:/i.test(line)) continue;
    const parts = splitBars(line);
    if (parts.length < 3) continue;
    data++;
    const key = parts[0].toLowerCase();
    if (seen.has(key)) repeats++;
    else seen.add(key);
  }
  return data > 0 && repeats * 2 >= data;
}

export interface Limits {
  cats: number;
  clues: number;
}

export function gameFromTxt(text: string, fallbackTitle: string, limits: Limits = { cats: 10, clues: 10 }): CsvResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (looksFlat(text)) return { errors: ['This file lists one clue per line as  Category | Clue | Answer. Import it as a question bank.'], warnings };
  if (!/^\s*#\s*(?!final\b)\S/im.test(text.replace(/^﻿/, '')))
    return { errors: ['No categories found. Start each category with a line like  # Science  (download the text template for an example).'], warnings };
  let title = '';
  const cats: Category[] = [];
  let cur: Category | null = null;
  let final: FinalClue | undefined;
  let inFinal = false;
  const seen = new Set<string>();
  // explicit value per question, or null to auto-assign
  const explicit = new Map<string, number | null>();

  text
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .forEach((raw, i) => {
      const n = i + 1;
      const line = raw.trim();
      if (!line || line.startsWith('//')) return;

      const t = /^title\s*:\s*(.+)$/i.exec(line);
      if (t && cats.length === 0 && !inFinal) return void (title = t[1].trim().slice(0, 100));

      const f = /^#\s*final\s*(?::\s*(.*))?$/i.exec(line);
      if (f) {
        if (final) warnings.push(`Line ${n}: more than one Final section; the last one is used.`);
        inFinal = true;
        final = { category: (f[1] ?? '').trim().slice(0, 60) || 'Final Round', clue: '', answer: '', alts: [] };
        cur = null;
        return;
      }

      const c = /^#\s*(.+)$/.exec(line);
      if (c) {
        inFinal = false;
        if (cats.length >= limits.cats) return void errors.push(`Line ${n}: more than ${limits.cats} categories.`);
        cur = { id: uid(), name: c[1].trim().slice(0, 60), color: CATEGORY_COLORS[cats.length % 8], questions: [] };
        cats.push(cur);
        return;
      }

      // clue line
      let value: number | null = null;
      let dd = false;
      let body = line;
      const v = /^(\d+)(\*)?\s*:\s*(.*)$/.exec(line);
      if (v) {
        value = Number(v[1]);
        dd = !!v[2];
        body = v[3];
      }
      const [clue = '', answer = '', alts = ''] = splitBars(body);
      if (!clue) return void errors.push(`Line ${n}: the clue is empty.`);
      if (!answer) return void errors.push(`Line ${n}: no answer. Write it as  clue | answer`);
      if (value !== null && value > 1_000_000) return void errors.push(`Line ${n}: value ${value} is too large.`);

      if (inFinal) {
        if (final!.clue) warnings.push(`Line ${n}: the Final round takes one clue; extra lines are ignored.`);
        else final = { ...final!, clue: clue.slice(0, 1000), answer: answer.slice(0, 300), alts: alts.split(';').map((x) => x.trim()).filter(Boolean).slice(0, 10) };
        return;
      }
      if (!cur) return void errors.push(`Line ${n}: this clue is before any category. Start with a line like  # Science`);
      if (cur.questions.length >= limits.clues) return void errors.push(`Line ${n}: more than ${limits.clues} clues in "${cur.name}".`);

      const key = `${cur.name.toLowerCase()}|${clue.toLowerCase()}`;
      if (seen.has(key)) warnings.push(`Line ${n}: duplicate clue in "${cur.name}".`);
      seen.add(key);
      const q = {
        id: uid(),
        clue: clue.slice(0, 1000),
        answer: answer.slice(0, 300),
        alts: alts.split(';').map((x) => x.trim()).filter(Boolean).slice(0, 10),
        value: 0,
        dailyDouble: dd,
      };
      cur.questions.push(q);
      explicit.set(q.id, value);
    });

  if (errors.length) return { errors, warnings };
  if (cats.length === 0) return { errors: ['No categories found. Start a category with a line like  # Science'], warnings };
  for (const c of cats) {
    if (c.questions.length === 0) warnings.push(`Category "${c.name}" has no clues and was removed.`);
    c.questions.forEach((q, idx) => (q.value = explicit.get(q.id) ?? (idx + 1) * 200));
    c.questions.sort((a, b) => a.value - b.value);
  }
  const kept = cats.filter((c) => c.questions.length > 0);
  if (kept.length === 0) return { errors: ['No clues found.'], warnings };
  const len = Math.max(...kept.map((c) => c.questions.length));
  kept.forEach((c) => c.questions.length !== len && warnings.push(`"${c.name}" has ${c.questions.length} clues but the longest category has ${len}.`));
  if (final && (!final.clue || !final.answer)) {
    warnings.push('The Final section has no clue line, so the Final round was left out.');
    final = undefined;
  }
  return {
    game: { schema: SCHEMA_VERSION, id: uid(), title: title || fallbackTitle, description: 'Imported from text', rules: { ...DEFAULT_RULES }, categories: kept, final, updatedAt: Date.now() },
    errors,
    warnings,
  };
}

const flat = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\|/g, '\\|');

export function gameToTxt(g: Game): string {
  const out = [`Title: ${flat(g.title)}`, ''];
  for (const c of g.categories) {
    out.push(`# ${flat(c.name)}`);
    for (const q of c.questions) out.push(`${q.value}${q.dailyDouble ? '*' : ''}: ${[flat(q.clue), flat(q.answer), ...(q.alts.length ? [q.alts.map(flat).join('; ')] : [])].join(' | ')}`);
    out.push('');
  }
  if (g.final) out.push(`# Final: ${flat(g.final.category)}`, [flat(g.final.clue), flat(g.final.answer), ...(g.final.alts.length ? [g.final.alts.map(flat).join('; ')] : [])].join(' | '), '');
  return out.join('\n');
}
