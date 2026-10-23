import { useEffect, useMemo, useState } from 'react';
import { bankSize, drawClues, listBanks, type Bank, type BankQuestion } from '../store/bank';

const SHOW = 200;
interface Row { key: string; cat: string; q: BankQuestion }

/**
 * Browse an imported question bank from inside the editor and pull in exactly what you want:
 * a whole category (a random clue per row), hand-picked clues as a new category,
 * or one clue into the cell that is selected on the board.
 */
export default function BankPicker({ rows, hasCell, canAddCategory, initialBankId, onClose, onAddCategory, onFillCell }: {
  rows: number;
  hasCell: boolean;
  canAddCategory: boolean;
  initialBankId?: string;
  onClose: () => void;
  onAddCategory: (name: string, questions: BankQuestion[]) => void;
  onFillCell: (q: BankQuestion) => void;
}) {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [bankId, setBankId] = useState(initialBankId ?? '');
  const [cat, setCat] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Row[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    void listBanks().then((b) => {
      setBanks(b);
      setBankId((cur) => (b.some((x) => x.id === cur) ? cur : b[0]?.id ?? ''));
    });
  }, []);

  const bank = banks?.find((b) => b.id === bankId);
  const term = search.trim().toLowerCase();

  const list: Row[] = useMemo(() => {
    if (!bank) return [];
    const out: Row[] = [];
    for (const c of bank.categories) {
      if (!term && c.name !== cat) continue;
      const sorted = [...c.questions].sort((a, b) => a.value - b.value);
      sorted.forEach((q, i) => {
        if (out.length >= SHOW + 1) return;
        if (term && ![c.name, q.clue, q.answer, ...q.alts].some((x) => x.toLowerCase().includes(term))) return;
        out.push({ key: `${c.name}\u0000${i}`, cat: c.name, q });
      });
    }
    return out;
  }, [bank, cat, term]);

  const cats = useMemo(() => (bank?.categories ?? []).filter((c) => !term || c.name.toLowerCase().includes(term)), [bank, term]);
  const isPicked = (k: string) => picked.some((p) => p.key === k);
  const toggle = (r: Row) => setPicked((p) => (p.some((x) => x.key === r.key) ? p.filter((x) => x.key !== r.key) : [...p, r]));
  const switchBank = (id: string) => { setBankId(id); setCat(''); setPicked([]); setNote(''); };
  const catOfPicks = picked.length && picked.every((p) => p.cat === picked[0].cat) ? picked[0].cat : '';
  const catName = name.trim() || catOfPicks || 'Mixed';

  const flash = (m: string) => setNote(m);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal" style={{ maxWidth: 860 }} role="dialog" aria-modal="true" aria-label="Add questions from a bank" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 className="grow" style={{ margin: 0 }}>Add from a question bank</h3>
          <button className="btn small" onClick={onClose}>Done</button>
        </div>

        {banks === null ? (
          <p className="muted">Loading&hellip;</p>
        ) : banks.length === 0 ? (
          <p className="muted">No question banks yet. On the home page use <b>Import text / CSV / JSON</b> to add a file of questions, then come back.</p>
        ) : (
          <>
            <div className="row" style={{ marginTop: 10 }}>
              <select aria-label="Question bank" value={bankId} onChange={(e) => switchBank(e.target.value)} style={{ width: 'auto' }}>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.title} ({bankSize(b).toLocaleString()})</option>)}
              </select>
              <input type="text" className="grow" aria-label="Search the bank" placeholder="Search categories, clues and answers…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) 1fr', gap: 12, marginTop: 10 }}>
              <div style={{ maxHeight: 340, overflow: 'auto' }} aria-label="Categories">
                {cats.slice(0, 300).map((c) => (
                  <button key={c.name} className={`btn small${cat === c.name && !term ? ' primary' : ''}`} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 6, marginBottom: 3 }} onClick={() => { setSearch(''); setCat(c.name); }}>
                    <span style={{ textAlign: 'left' }}>{c.name}</span><span className="muted">{c.questions.length}</span>
                  </button>
                ))}
                {cats.length === 0 && <p className="muted">No categories match.</p>}
              </div>

              <div>
                <div className="row" style={{ marginBottom: 6 }}>
                  <b className="grow">{term ? `Matches for “${search.trim()}”` : cat || 'Choose a category'}</b>
                  {!term && cat && (
                    <button className="btn small" disabled={!canAddCategory || (bank?.categories.find((c) => c.name === cat)?.questions.length ?? 0) < 1} onClick={() => {
                      const c = bank!.categories.find((x) => x.name === cat)!;
                      onAddCategory(c.name, drawClues(c, rows));
                      flash(`Added “${c.name}” with a random clue per row.`);
                    }}>Add whole category ({rows} random)</button>
                  )}
                </div>
                <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--line, #ffffff22)', borderRadius: 8, padding: 6 }}>
                  {list.slice(0, SHOW).map((r) => (
                    <label key={r.key} style={{ display: 'flex', gap: 8, margin: '3px 0', color: 'var(--text)', alignItems: 'flex-start' }}>
                      <input type="checkbox" checked={isPicked(r.key)} onChange={() => toggle(r)} />
                      <span className="grow">
                        {term && <span className="muted">[{r.cat}] </span>}{r.q.clue}
                        <br /><span className="muted">&rarr; {r.q.answer}</span>
                      </span>
                    </label>
                  ))}
                  {list.length > SHOW && <p className="muted">Showing the first {SHOW}. Narrow the search.</p>}
                  {list.length === 0 && <p className="muted">{term ? 'Nothing matches.' : 'Pick a category on the left, or search above.'}</p>}
                </div>
              </div>
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <b>{picked.length} picked</b>
              <input type="text" aria-label="New category name" placeholder={catOfPicks || 'Mixed'} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={{ width: 180 }} />
              <button className="btn primary" disabled={!canAddCategory || picked.length === 0 || picked.length > rows} onClick={() => {
                onAddCategory(catName, picked.map((p) => p.q));
                setPicked([]);
                setName('');
                flash(`Added category “${catName}”.`);
              }}>Add as new category</button>
              <button className="btn" disabled={!hasCell || picked.length !== 1} title={hasCell ? '' : 'Select a cell on the board first'} onClick={() => {
                onFillCell(picked[0].q);
                setPicked([]);
                flash('Filled the selected cell.');
              }}>Put in selected cell</button>
              {picked.length > 0 && <button className="btn small" onClick={() => setPicked([])}>Clear</button>}
            </div>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              {picked.length > rows ? `The board has ${rows} rows, so a category holds at most ${rows} clues. Untick some.` : `Picked clues fill a category from the top row down (the board has ${rows} rows); missing rows stay blank. Tip: pick in easy-to-hard order.`}
              {!canAddCategory && ' The board already has the maximum number of categories, so you can only fill cells.'}
              {!hasCell && ' To fill one cell, close this, click the cell on the board, then reopen.'}
            </p>
            {note && <p className="ok" role="status" style={{ margin: '6px 0 0' }}>{note}</p>}
          </>
        )}
      </div>
    </div>
  );
}
