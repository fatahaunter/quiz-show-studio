import { useMemo, useState } from 'react';
import { buildGame, randomCategories, usable, type Bank } from '../store/bank';
import { MAX_CATEGORIES, MIN_CATEGORIES, type Game } from '../types';

const MAX_CATS = MAX_CATEGORIES;

/** Pick categories (or let chance decide) and generate a board from a question bank. */
export default function BankBuilder({ bank, onCancel, onBuild }: { bank: Bank; onCancel: () => void; onBuild: (g: Game) => void }) {
  const [rows, setRows] = useState(5);
  const [step, setStep] = useState(200);
  const [dd, setDd] = useState(1);
  const [count, setCount] = useState(5);
  const [filter, setFilter] = useState('');
  const pool = useMemo(() => usable(bank, rows), [bank, rows]);
  const [picked, setPicked] = useState<string[]>(() => randomCategories(bank, 5, 5));
  const [err, setErr] = useState('');

  const valid = picked.filter((n) => pool.some((c) => c.name === n));
  const shown = pool.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const toggle = (n: string) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= MAX_CATS ? p : [...p, n]));

  function build() {
    try {
      onBuild(buildGame(bank, { categories: valid, rows, step, dailyDoubles: dd }));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="card modal" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-label="Build a game from this bank" onClick={(e) => e.stopPropagation()}>
        <h3>Build a game from &ldquo;{bank.title}&rdquo;</h3>
        <div className="row">
          <label style={{ margin: 0 }}>Rows <input type="number" min={3} max={10} value={rows} style={{ width: 70 }} onChange={(e) => setRows(Math.min(10, Math.max(3, Number(e.target.value) || 5)))} /></label>
          <label style={{ margin: 0 }}>Points step <input type="number" min={50} step={50} value={step} style={{ width: 90 }} onChange={(e) => setStep(Math.max(50, Number(e.target.value) || 200))} /></label>
          <label style={{ margin: 0 }}>Daily Doubles <input type="number" min={0} max={5} value={dd} style={{ width: 70 }} onChange={(e) => setDd(Math.min(5, Math.max(0, Number(e.target.value) || 0)))} /></label>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <b className="grow">{valid.length} chosen (pick {MIN_CATEGORIES} to {MAX_CATS})</b>
          <label style={{ margin: 0 }}>Random <input type="number" min={MIN_CATEGORIES} max={MAX_CATS} value={count} style={{ width: 60 }} onChange={(e) => setCount(Math.min(MAX_CATS, Math.max(MIN_CATEGORIES, Number(e.target.value) || MIN_CATEGORIES)))} /></label>
          <button className="btn small" onClick={() => setPicked(randomCategories(bank, count, rows))}>Pick {count} at random</button>
        </div>
        <input type="text" aria-label="Filter categories" placeholder={`Filter ${pool.length} usable categories…`} value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginTop: 8 }} />
        <div style={{ maxHeight: 220, overflow: 'auto', margin: '8px 0' }}>
          {shown.slice(0, 300).map((c) => (
            <label key={c.name} style={{ display: 'flex', gap: 8, margin: '2px 0', color: 'var(--text)' }}>
              <input type="checkbox" checked={picked.includes(c.name)} disabled={!picked.includes(c.name) && picked.length >= MAX_CATS} onChange={() => toggle(c.name)} />
              <span className="grow">{c.name}</span>
              <span className="muted">{c.questions.length}</span>
            </label>
          ))}
          {shown.length > 300 && <p className="muted">Showing 300 of {shown.length}. Use the filter.</p>}
          {pool.length === 0 && <p className="err">No category has {rows} or more clues. Lower the number of rows.</p>}
        </div>
        {bank.categories.length > pool.length && <p className="muted">{bank.categories.length - pool.length} categories have fewer than {rows} clues and are hidden.</p>}
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={valid.length < MIN_CATEGORIES} onClick={build}>Build game</button>
        </div>
      </div>
    </div>
  );
}
