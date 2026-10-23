import { CATEGORY_COLORS, DEFAULT_RULES, SCHEMA_VERSION, uid, type Game } from '../types';

export const CSV_HEADER = ['category', 'value', 'clue', 'answer', 'alternates', 'daily_double', 'explanation'];

export const CSV_EXAMPLE = [
  CSV_HEADER.join(','),
  'Science,200,This planet is known as the Red Planet.,Mars,,no,',
  'Science,400,H2O is the formula for this liquid.,Water,"H2O; Aqua",no,Two hydrogen atoms and one oxygen atom.',
  'Geography,200,The capital of Japan.,Tokyo,,yes,',
  'Geography,400,The river that flows through Cairo.,The Nile,"Nile; Nile River",no,',
].join('\n');

/** RFC-4180 style parser: quoted fields, escaped quotes, embedded newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const esc = (v: string) => {
  // neutralise spreadsheet formula injection, then quote if needed
  let s = /^[=+@]/.test(v) || /^-(?!\d+(\.\d+)?$)/.test(v) ? `'${v}` : v;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};
const unesc = (v: string) => v.replace(/^'(?=[=+@-])/, '').trim();

export function gameToCsv(g: Game): string {
  const lines = [CSV_HEADER.join(',')];
  for (const c of g.categories)
    for (const q of c.questions)
      lines.push([c.name, String(q.value), q.clue, q.answer, q.alts.join('; '), q.dailyDouble ? 'yes' : 'no', q.explanation ?? ''].map(esc).join(','));
  return lines.join('\n');
}

export interface CsvResult {
  game?: Game;
  errors: string[];
  warnings: string[];
}

export function gameFromCsv(text: string, title: string): CsvResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows = parseCsv(text);
  if (rows.length < 2) return { errors: ['The file has no data rows.'], warnings };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const idx = { cat: col('category'), val: col('value'), clue: col('clue'), ans: col('answer'), alt: col('alternates'), dd: col('daily_double'), ex: col('explanation') };
  for (const k of ['cat', 'val', 'clue', 'ans'] as const)
    if (idx[k] < 0) errors.push(`Missing required column "${{ cat: 'category', val: 'value', clue: 'clue', ans: 'answer' }[k]}".`);
  if (errors.length) return { errors, warnings };

  const byCat = new Map<string, Game['categories'][number]>();
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (j: number) => (j >= 0 ? unesc(r[j] ?? '') : '');
    const cat = get(idx.cat);
    const clue = get(idx.clue);
    const answer = get(idx.ans);
    const value = Number(get(idx.val));
    if (!cat) return void errors.push(`Row ${line}: missing category.`);
    if (!clue) return void errors.push(`Row ${line}: missing clue.`);
    if (!answer) return void errors.push(`Row ${line}: missing answer.`);
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return void errors.push(`Row ${line}: "${get(idx.val)}" is not a valid value.`);
    const key = `${cat.toLowerCase()}|${clue.toLowerCase()}`;
    if (seen.has(key)) warnings.push(`Row ${line}: duplicate clue in "${cat}".`);
    seen.add(key);
    let c = byCat.get(cat.toLowerCase());
    if (!c) {
      if (byCat.size >= 8) return void errors.push(`Row ${line}: more than 8 categories.`);
      c = { id: uid(), name: cat.slice(0, 60), color: CATEGORY_COLORS[byCat.size % 8], questions: [] };
      byCat.set(cat.toLowerCase(), c);
    }
    if (c.questions.length >= 10) return void errors.push(`Row ${line}: more than 10 clues in "${cat}".`);
    c.questions.push({
      id: uid(),
      clue: clue.slice(0, 1000),
      answer: answer.slice(0, 300),
      alts: get(idx.alt).split(';').map((x) => x.trim()).filter(Boolean).slice(0, 10),
      value: Math.round(value),
      explanation: get(idx.ex).slice(0, 500) || undefined,
      dailyDouble: /^(y|yes|true|1)$/i.test(get(idx.dd)),
    });
  });
  if (errors.length) return { errors, warnings };
  const categories = [...byCat.values()];
  categories.forEach((c) => c.questions.sort((a, b) => a.value - b.value));
  const len = Math.max(...categories.map((c) => c.questions.length));
  categories.forEach((c) => c.questions.length !== len && warnings.push(`"${c.name}" has ${c.questions.length} clues but the longest category has ${len}.`));
  return {
    game: { schema: SCHEMA_VERSION, id: uid(), title, description: 'Imported from CSV', rules: { ...DEFAULT_RULES }, categories, updatedAt: Date.now() },
    errors,
    warnings,
  };
}
