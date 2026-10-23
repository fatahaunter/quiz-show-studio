import { useConfirm } from '../components/Confirm';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import BankPicker from '../components/BankPicker';
import { downloadText, exportGameJson, loadGame, saveGame } from '../store/storage';
import { isNative } from '../native';
import { gameToCsv } from '../store/csv';
import { gameToTxt } from '../store/txt';
import { CATEGORY_COLORS, MAX_CATEGORIES, MIN_CATEGORIES, uid, type FinalMode, type Game, type Question } from '../types';
import { topValue } from '../engine/game';

type Sel = { c: number; q: number } | null;
type Save = 'saved' | 'saving' | 'unsaved' | 'error';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const incomplete = (q: Question) => !q.clue.trim() || !q.answer.trim();

async function downscale(file: File, max = 900): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.82);
}

export default function Editor() {
  const [ask, dialog] = useConfirm();
  const { id } = useParams();
  const nav = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [save, setSave] = useState<Save>('saved');
  const [preview, setPreview] = useState(false);
  const [imgErr, setImgErr] = useState('');
  const undo = useRef<Game[]>([]);
  const redo = useRef<Game[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef<Game | null>(null);
  const lastEdit = useRef({ key: '', at: 0 });
  const clip = useRef<Question | null>(null);
  const [search, setSearch] = useState('');
  const [params, setParams] = useSearchParams();
  const [picker, setPicker] = useState(() => params.has('bank'));

  useEffect(() => {
    loadGame(id!).then((g) => {
      if (!g) return nav('/');
      latest.current = g;
      setGame(g);
    });
  }, [id, nav]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!latest.current) return;
    setSave('saving');
    try {
      await saveGame(latest.current);
      setSave('saved');
    } catch {
      setSave('error');
    }
  }, []);

  const commit = useCallback(
    (fn: (g: Game) => void, opts: { history?: boolean; key?: string } = {}) => {
      const cur = latest.current;
      if (!cur) return;
      // Typing in the same field within 1.5s is one undo step, not one per keystroke.
      const now = Date.now();
      const burst = !!opts.key && lastEdit.current.key === opts.key && now - lastEdit.current.at < 1500;
      lastEdit.current = { key: opts.key ?? '', at: now };
      if (opts.history !== false && !burst) {
        undo.current = [...undo.current.slice(-99), cur];
        redo.current = [];
      }
      const next = clone(cur);
      fn(next);
      latest.current = next;
      setGame(next);
      setSave('unsaved');
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );

  const step = useCallback(
    (from: typeof undo, to: typeof undo) => {
      const prev = from.current.pop();
      if (!prev || !latest.current) return;
      to.current.push(latest.current);
      latest.current = prev;
      setGame(prev);
      setSave('unsaved');
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );

  // Don't lose work when navigating away or closing the tab.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === 'unsaved' || save === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);
  useEffect(() => () => void flush(), [flush]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); step(undo, redo); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); step(redo, undo); }
      else if (k === 's') { e.preventDefault(); void flush(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, flush]);

  if (!game) return <div className="page muted">Loading&hellip;</div>;

  const rows = Math.max(0, ...game.categories.map((c) => c.questions.length));
  const q = sel ? game.categories[sel.c]?.questions[sel.q] : undefined;
  const problems = game.categories.flatMap((c) => c.questions).filter(incomplete).length;
  const newQ = (value: number): Question => ({ id: uid(), clue: '', answer: '', alts: [], value });

  const setQ = (patch: Partial<Question>) =>
    sel && commit((g) => Object.assign(g.categories[sel.c].questions[sel.q], patch), { key: `q:${q?.id}:${Object.keys(patch).join()}` });
  const matches = (cq: Question, cname: string) => {
    const t = search.trim().toLowerCase();
    return !t || [cq.clue, cq.answer, cname, ...cq.alts].some((x) => x.toLowerCase().includes(t));
  };

  return (
    <div className="page">
      {dialog}
      {picker && (
        <BankPicker
          rows={rows}
          canAddCategory={game.categories.length < MAX_CATEGORIES}
          hasCell={!!q}
          initialBankId={params.get('bank') ?? undefined}
          onClose={() => { setPicker(false); if (params.has('bank')) setParams({}, { replace: true }); }}
          onFillCell={(bq) => setQ({ clue: bq.clue, answer: bq.answer, alts: [...bq.alts] })}
          onAddCategory={(name, qs) => commit((g) => {
            g.categories.push({
              id: uid(),
              name: name.slice(0, 60),
              color: CATEGORY_COLORS[g.categories.length % 8],
              questions: Array.from({ length: rows }, (_, i) => {
                const v = g.categories[0]?.questions[i]?.value ?? (i + 1) * 200;
                const bq = qs[i];
                return bq ? { id: uid(), clue: bq.clue, answer: bq.answer, alts: [...bq.alts], value: v } : newQ(v);
              }),
            });
          })}
        />
      )}
      <div className="row" style={{ marginBottom: 12 }}>
        <input type="text" aria-label="Game title" value={game.title} style={{ maxWidth: 360, fontWeight: 700 }} onChange={(e) => commit((g) => { g.title = e.target.value; }, { key: 'title' })} />
        <span className={`saved ${save === 'error' ? 'err' : save === 'saved' ? 'ok' : 'muted'}`} role="status">
          {{ saved: 'All changes saved', saving: 'Saving…', unsaved: 'Unsaved changes', error: 'Save failed — storage full?' }[save]}
        </span>
        <span className="grow" />
        <button className="btn small" disabled={!undo.current.length} onClick={() => step(undo, redo)}>Undo</button>
        <button className="btn small" disabled={!redo.current.length} onClick={() => step(redo, undo)}>Redo</button>
        <input type="text" aria-label="Search clues" placeholder="Search clues…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 160 }} />
        <button className="btn small" onClick={flush}>Save</button>
        <button className="btn small" onClick={() => downloadText(`${game.title.replace(/[^\w-]+/g, '_')}.csv`, gameToCsv(game), 'text/csv')}>Export CSV</button>
        <button className="btn small" onClick={() => downloadText(`${game.title.replace(/[^\w-]+/g, '_')}.txt`, gameToTxt(game), 'text/plain')}>Export text</button>
        {!isNative() && <Link className="btn small" to={`/print/${game.id}`} target="_blank">Print sheets</Link>}
        <button className="btn small" onClick={() => downloadText(`${game.title.replace(/[^\w-]+/g, '_')}.json`, exportGameJson(game))}>Export JSON</button>
        {game.categories.length >= MIN_CATEGORIES && game.categories.length <= MAX_CATEGORIES
          ? <Link className="btn primary" to={`/host/${game.id}`} onClick={() => void flush()}>Host this game</Link>
          : <button className="btn primary" disabled title={`Needs ${MIN_CATEGORIES}-${MAX_CATEGORIES} categories`}>Host this game</button>}
      </div>

      {(game.categories.length < MIN_CATEGORIES || game.categories.length > MAX_CATEGORIES) && (
        <p className="err" role="alert">A game needs {MIN_CATEGORIES} to {MAX_CATEGORIES} categories; this one has {game.categories.length}. {game.categories.length < MIN_CATEGORIES ? 'Add more with + Category.' : 'Delete some.'}</p>
      )}
      {problems > 0 && <p className="err" role="alert">{problems} clue{problems === 1 ? '' : 's'} missing text or an answer (dashed red). They can still be hosted but will be blank.</p>}

      <div className="editor">
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="board" style={{ gridTemplateColumns: `70px repeat(${game.categories.length}, minmax(110px, 1fr))` }}>
            <div />
            {game.categories.map((c, ci) => (
              <div key={c.id} style={{ '--c': c.color } as CSSProperties}>
                <input type="text" aria-label={`Category ${ci + 1} name`} value={c.name} onChange={(e) => commit((g) => { g.categories[ci].name = e.target.value; }, { key: `cat:${ci}` })} style={{ fontFamily: 'var(--display)', textAlign: 'center', borderBottom: `4px solid ${c.color}`, textTransform: 'uppercase' }} />
                <div className="row" style={{ justifyContent: 'center', gap: 4, marginTop: 4 }}>
                  <input type="color" aria-label="Category colour" value={c.color} onChange={(e) => commit((g) => { g.categories[ci].color = e.target.value; })} style={{ width: 28, height: 24, padding: 0, border: 0, background: 'none' }} />
                  <button className="btn small" aria-label="Move left" disabled={ci === 0} onClick={() => commit((g) => { g.categories.splice(ci - 1, 0, g.categories.splice(ci, 1)[0]); setSel(null); })}>&larr;</button>
                  <button className="btn small" aria-label="Move right" disabled={ci === game.categories.length - 1} onClick={() => commit((g) => { g.categories.splice(ci + 1, 0, g.categories.splice(ci, 1)[0]); setSel(null); })}>&rarr;</button>
                  <button className="btn small" aria-label="Duplicate category" disabled={game.categories.length >= MAX_CATEGORIES} onClick={() => commit((g) => { const d = clone(g.categories[ci]); d.id = uid(); d.questions.forEach((x) => (x.id = uid())); g.categories.splice(ci + 1, 0, d); })}>&#10064;</button>
                  <button className="btn small bad" aria-label="Delete category" disabled={game.categories.length <= MIN_CATEGORIES} onClick={async () => { if (await ask(`Delete category "${c.name}"?`)) { commit((g) => { g.categories.splice(ci, 1); }); setSel(null); } }}>&times;</button>
                </div>
              </div>
            ))}
            {Array.from({ length: rows }).flatMap((_, r) => [
              <div key={'v' + r} className="rowhead" style={{ display: 'grid', placeItems: 'center' }}>
                <input type="number" aria-label={`Value for row ${r + 1}`} value={game.categories[0]?.questions[r]?.value ?? 0} min={0} step={100}
                  onChange={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); commit((g) => g.categories.forEach((c) => c.questions[r] && (c.questions[r].value = v))); }} />
              </div>,
              ...game.categories.map((c, ci) => {
                const cq = c.questions[r];
                if (!cq) return <div key={`${ci}-${r}`} />;
                return (
                  <button key={cq.id} style={{ opacity: matches(cq, c.name) ? 1 : 0.2 }} className={`cell${incomplete(cq) ? ' bad' : ''}${sel?.c === ci && sel.q === r ? ' sel' : ''}`} onClick={() => { setSel({ c: ci, q: r }); setPreview(false); }}>
                    {cq.value}
                    {cq.dailyDouble && <span className="dd">DD</span>}
                  </button>
                );
              }),
            ])}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn small" disabled={game.categories.length >= MAX_CATEGORIES} onClick={() => commit((g) => { g.categories.push({ id: uid(), name: `Category ${g.categories.length + 1}`, color: CATEGORY_COLORS[g.categories.length % 8], questions: Array.from({ length: rows }, (_, i) => newQ(g.categories[0]?.questions[i]?.value ?? (i + 1) * 200)) }); })}>+ Category</button>
            <button className="btn small" disabled={game.categories.length >= MAX_CATEGORIES} onClick={() => setPicker(true)}>+ From question bank</button>
            <span className="muted">{game.categories.length} of {MIN_CATEGORIES}&ndash;{MAX_CATEGORIES} categories</span>
            <button className="btn small" disabled={rows >= 10} onClick={() => commit((g) => { const base = (g.categories[0]?.questions[rows - 1]?.value ?? 0) + 200; g.categories.forEach((c) => c.questions.push(newQ(base))); })}>+ Row</button>
            <button className="btn small bad" disabled={rows <= 1} onClick={async () => { if (await ask('Delete the last row of clues in every category?')) { commit((g) => g.categories.forEach((c) => c.questions.pop())); setSel(null); } }}>&minus; Row</button>
          </div>

          <h3 style={{ marginTop: 20 }}>Final round</h3>
          <label style={{ margin: 0 }}>
            <input type="checkbox" checked={!!game.final} onChange={(e) => commit((g) => { g.final = e.target.checked ? { category: 'Final Round', clue: '', answer: '', alts: [] } : undefined; })} /> Include a Final round (wagers, private answers)
          </label>
          {game.final && (
            <>
              <label htmlFor="fmode">Final style</label>
              <select id="fmode" value={game.final.mode ?? 'wager'} onChange={(e) => commit((g) => { g.final!.mode = e.target.value as FinalMode; })}>
                <option value="wager">Wager final: everyone wagers, types an answer, answers revealed one by one</option>
                <option value="typed">Everyone types an answer (no wagers), revealed one by one</option>
                <option value="normal">Normal question: buzzer like any other clue</option>
              </select>
              {(game.final.mode ?? 'wager') !== 'wager' && (
                <>
                  <label htmlFor="fval">Points for the final {(game.final.mode ?? 'wager') === 'normal' ? 'question' : 'answer'} (right = +, wrong = &minus; if wrong answers cost points)</label>
                  <input id="fval" type="number" min={0} step={100} value={game.final.value ?? topValue(game)} style={{ width: 120 }} onChange={(e) => commit((g) => { g.final!.value = Math.max(0, Math.round(Number(e.target.value) || 0)); }, { key: 'fval' })} />
                </>
              )}
              <label htmlFor="fcat">Final category</label>
              <input id="fcat" type="text" value={game.final.category} maxLength={60} onChange={(e) => commit((g) => { g.final!.category = e.target.value; }, { key: 'fcat' })} />
              <label htmlFor="fclue">Final clue</label>
              <textarea id="fclue" value={game.final.clue} maxLength={1000} onChange={(e) => commit((g) => { g.final!.clue = e.target.value; }, { key: 'fclue' })} />
              <label htmlFor="fans">Final answer</label>
              <input id="fans" type="text" value={game.final.answer} maxLength={300} onChange={(e) => commit((g) => { g.final!.answer = e.target.value; }, { key: 'fans' })} />
              {(game.final.mode ?? 'wager') !== 'normal' && (<>
              <label htmlFor="fsecs">Answer time in seconds (0 = host ends it manually)</label>
              <input id="fsecs" type="number" min={0} max={300} value={game.rules.finalSeconds ?? 30} style={{ width: 100 }} onChange={(e) => commit((g) => { g.rules.finalSeconds = Math.min(300, Math.max(0, Math.round(Number(e.target.value) || 0))); }, { key: 'fsecs' })} />
              </>)}
              {(!game.final.clue.trim() || !game.final.answer.trim()) && <p className="err">Add a Final clue and answer, or the Final round can't be started.</p>}
              <label htmlFor="falts">Also accept (comma separated)</label>
              <input id="falts" type="text" value={game.final.alts.join(', ')} onChange={(e) => commit((g) => { g.final!.alts = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); }, { key: 'falts' })} />
            </>
          )}

          <h3 style={{ marginTop: 20 }}>Rules</h3>
          <div className="row">
            {([['wrongPenalty', 'Deduct points for wrong answers'], ['allowRebuzz', 'Others may re-buzz after a wrong answer'], ['allowNegative', 'Allow negative scores']] as const).map(([k, label]) => (
              <label key={k} style={{ margin: 0 }}><input type="checkbox" checked={game.rules[k]} onChange={(e) => commit((g) => { g.rules[k] = e.target.checked; })} /> {label}</label>
            ))}
            <label style={{ margin: 0 }}>Auto-close buzzer after (sec, 0 = never)
              <input type="number" min={0} max={60} value={game.rules.buzzWindowSec} style={{ width: 80, marginLeft: 6 }} onChange={(e) => commit((g) => { g.rules.buzzWindowSec = Math.min(60, Math.max(0, Number(e.target.value) || 0)); })} />
            </label>
          </div>
        </div>

        <aside className="card" aria-label="Clue editor">
          {!q || !sel ? (
            <p className="muted">Select a clue on the board to edit it.</p>
          ) : (
            <>
              <h3>{game.categories[sel.c].name} &middot; {q.value}</h3>
              <div className="row">
                <button className="btn small" onClick={() => { clip.current = clone(q); }}>Copy</button>
                <button className="btn small" onClick={() => { const c = clip.current; if (c) setQ({ clue: c.clue, answer: c.answer, alts: [...c.alts], image: c.image, explanation: c.explanation, hostNotes: c.hostNotes, dailyDouble: c.dailyDouble }); }}>Paste</button>
                <button className={`btn small${preview ? '' : ' primary'}`} onClick={() => setPreview(false)}>Edit</button>
                <button className={`btn small${preview ? ' primary' : ''}`} onClick={() => setPreview(true)}>Preview</button>
              </div>
              {preview ? (
                <div className="clue" style={{ minHeight: 260, background: 'var(--page)', borderRadius: 12, padding: 12 }}>
                  <div className="text" style={{ fontSize: '1.5rem' }}>{q.clue || '(no clue text)'}</div>
                  {q.image && <img src={q.image} alt="" style={{ maxHeight: 140 }} />}
                  <div className="answer" style={{ fontSize: '1.1rem' }}>{q.answer}</div>
                </div>
              ) : (
                <>
                  <label htmlFor="clue">Clue (shown to everyone)</label>
                  <textarea id="clue" value={q.clue} maxLength={1000} onChange={(e) => setQ({ clue: e.target.value })} />
                  <label htmlFor="ans">Answer (host only until revealed)</label>
                  <input id="ans" type="text" value={q.answer} maxLength={300} onChange={(e) => setQ({ answer: e.target.value })} />
                  <label htmlFor="alts">Also accept (comma separated)</label>
                  <input id="alts" type="text" value={q.alts.join(', ')} onChange={(e) => setQ({ alts: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                  <label htmlFor="expl">Explanation (shown with the answer)</label>
                  <input id="expl" type="text" value={q.explanation ?? ''} maxLength={500} onChange={(e) => setQ({ explanation: e.target.value || undefined })} />
                  <label htmlFor="notes">Host-only notes</label>
                  <input id="notes" type="text" value={q.hostNotes ?? ''} maxLength={500} onChange={(e) => setQ({ hostNotes: e.target.value || undefined })} />
                  <label><input type="checkbox" checked={!!q.dailyDouble} onChange={(e) => setQ({ dailyDouble: e.target.checked })} /> Daily Double</label>
                  <label>Image (optional)</label>
                  {q.image && <img src={q.image} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />}
                  <div className="row">
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Upload image" onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      if (f.size > 8_000_000) return setImgErr('Image is over 8 MB.');
                      try { setImgErr(''); setQ({ image: await downscale(f) }); } catch { setImgErr('Could not read that image.'); }
                    }} />
                    {q.image && <button className="btn small" onClick={() => setQ({ image: undefined })}>Remove</button>}
                  </div>
                  {imgErr && <p className="err">{imgErr}</p>}
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
