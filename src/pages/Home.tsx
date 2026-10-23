import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BankBuilder from '../components/BankBuilder';
import { useConfirm } from '../components/Confirm';
import { seedBuiltinBanks } from '../data/builtinBanks';
import { TEMPLATES, blankGame } from '../data/templates';
import { BULK_EXAMPLE, bankFromCsv, bankFromText, bankSize, deleteBank, listBanks, saveBank, usable, type Bank } from '../store/bank';
import { CSV_EXAMPLE, gameFromCsv } from '../store/csv';
import { deleteGame, downloadText, duplicateGame, listGames, loadSession, parseGameJson, saveGame } from '../store/storage';
import { TXT_EXAMPLE, gameFromTxt } from '../store/txt';
import type { Game } from '../types';

/** What an uploaded file can become. A small, well-formed file can be either; a big one only a bank. */
interface Pending {
  game?: Game;
  bank?: Bank;
  warnings: string[];
  note?: string;
}

export default function Home() {
  const [ask, dialog] = useConfirm();
  const [games, setGames] = useState<Game[] | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [msg, setMsg] = useState<string[]>([]);
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [building, setBuilding] = useState<Bank | null>(null);
  const [tpl, setTpl] = useState('0');
  const session = loadSession();

  const refresh = () => {
    void listGames().then(setGames);
    void listBanks().then(setBanks);
  };
  useEffect(() => {
    refresh();
    // first launch: add the question bank that ships with the app, then show it
    void seedBuiltinBanks().then((added) => added && refresh()).catch(() => {});
  }, []);

  async function create(make: () => Game, query = '') {
    const g = make();
    await saveGame(g);
    nav(`/edit/${g.id}${query}`);
  }

  async function importFile(f?: File) {
    if (!f) return;
    if (f.size > 20_000_000) return setMsg(['File is larger than 20 MB.']);
    const text = await f.text();
    const base = f.name.replace(/\.[^.]+$/, '') || 'Imported';
    setMsg([]);
    setPending(null);

    if (/\.txt$/i.test(f.name) || f.type === 'text/plain') {
      const g = gameFromTxt(text, base);
      const b = bankFromText(text, base);
      if (!g.game && !b.bank) return setMsg(b.errors.length ? b.errors : g.errors);
      return setPending({
        game: g.game,
        bank: b.bank,
        warnings: g.game ? g.warnings : b.warnings,
        note: g.game ? undefined : 'Too big or not laid out as one board, so it can be saved as a question bank.',
      });
    }
    if (/\.csv$/i.test(f.name) || f.type === 'text/csv') {
      const g = gameFromCsv(text, base);
      const b = bankFromCsv(text, base);
      if (!g.game && !b.bank) return setMsg(g.errors.length ? g.errors : b.errors);
      return setPending({ game: g.game, bank: b.bank, warnings: g.game ? g.warnings : b.warnings, note: g.game ? undefined : 'Saved as a question bank.' });
    }
    const { game, errors } = parseGameJson(text);
    if (!game) return setMsg(errors);
    setPending({ game, warnings: [] });
  }

  const clueCount = (g: Game) => g.categories.reduce((n, c) => n + c.questions.length, 0);
  const title = pending?.game?.title ?? pending?.bank?.title ?? '';

  return (
    <div className="page">
      {dialog}
      {building && (
        <BankBuilder
          bank={building}
          onCancel={() => setBuilding(null)}
          onBuild={async (g) => {
            await saveGame(g);
            nav(`/edit/${g.id}`);
          }}
        />
      )}

      <section className="hero">
        <h1>Host the show.<br />Win the buzzer.</h1>
        <p className="muted" style={{ maxWidth: 560 }}>
          Build a Jeopardy-style board, share a room code, and let everyone buzz in from their phones. The host controls when buzzers open.
        </p>
        <div className="row">
          {games && games[0] && <Link className="btn primary big" to={`/host/${games[0].id}`}>Host a Game</Link>}
          <Link className="btn big" to="/join">Join a Game</Link>
          {session && <Link className="btn gold big" to="/host/resume">Resume last session ({session.code})</Link>}
        </div>
      </section>

      <div className="row" style={{ marginBottom: 12 }}>
        <h2 className="grow" style={{ margin: 0 }}>My Games</h2>
        <select aria-label="Template" value={tpl} onChange={(e) => setTpl(e.target.value)} style={{ width: 'auto' }}>
          {TEMPLATES.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
        </select>
        <button className="btn primary" onClick={() => create(TEMPLATES[Number(tpl)].make)}>+ New game</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import text / CSV / JSON</button>
        <button className="btn small" onClick={() => downloadText('quiz-template.txt', TXT_EXAMPLE, 'text/plain')}>Text template</button>
        <button className="btn small" onClick={() => downloadText('quiz-bulk-template.txt', BULK_EXAMPLE, 'text/plain')}>Bulk template</button>
        <button className="btn small" onClick={() => downloadText('quiz-template.csv', CSV_EXAMPLE, 'text/csv')}>CSV template</button>
        <input ref={fileRef} type="file" accept="text/plain,.txt,application/json,.json,text/csv,.csv" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {pending && (
        <div className="card" role="dialog" aria-label="Import preview" style={{ marginBottom: 12 }}>
          <h3>Import &ldquo;{title}&rdquo;?</h3>
          <p className="muted">
            {pending.game && (
              <>As a game: {pending.game.categories.length} categories, {clueCount(pending.game)} clues{pending.game.final ? ', with a Final round' : ''}.<br /></>
            )}
            {pending.bank && (
              <>As a question bank: {pending.bank.categories.length} categories, {bankSize(pending.bank)} clues ({usable(pending.bank, 5).length} usable on a 5-row board).<br /></>
            )}
            {pending.note}
          </p>
          {pending.warnings.length > 0 && <ul className="err">{pending.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}</ul>}
          <div className="row">
            {pending.game && (
              <button className="btn primary" onClick={async () => { await saveGame(pending.game!); setPending(null); refresh(); }}>Import as one game</button>
            )}
            {pending.bank && (
              <button className={`btn ${pending.game ? '' : 'primary'}`} onClick={async () => { await saveBank(pending.bank!); setPending(null); refresh(); }}>Save as question bank</button>
            )}
            <button className="btn" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}

      {msg.length > 0 && (
        <div className="card err" role="alert" style={{ marginBottom: 12 }}>
          <b>Import failed:</b>
          <ul>{msg.slice(0, 12).map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      {games === null ? (
        <p className="muted">Loading&hellip;</p>
      ) : games.length === 0 ? (
        <div className="card">
          <h3>No games yet</h3>
          <p className="muted">Start from the General Knowledge template to be playing in a minute, or build a blank board.</p>
          <button className="btn primary" onClick={() => create(TEMPLATES[0].make)}>Create General Knowledge game</button>
        </div>
      ) : (
        <div className="grid">
          {games.map((g) => (
            <div className="card" key={g.id}>
              <h3>{g.title}</h3>
              <p className="muted">
                {g.categories.length} categories &middot; {clueCount(g)} clues
                <br />Edited {new Date(g.updatedAt).toLocaleString()}
              </p>
              <div className="row">
                <Link className="btn primary" to={`/host/${g.id}`}>Host</Link>
                <Link className="btn" to={`/edit/${g.id}`}>Edit</Link>
                <button className="btn" onClick={async () => { await duplicateGame(g.id); refresh(); }}>Duplicate</button>
                <button className="btn bad" onClick={async () => { if (await ask(`Delete "${g.title}"? This cannot be undone.`)) { await deleteGame(g.id); refresh(); } }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {banks.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>Question banks</h2>
          <p className="muted">Big pools of questions. Build a fresh random board, or start blank and pick categories and clues by hand. You can also add from a bank at any time inside the editor (+ From question bank).</p>
          <div className="grid">
            {banks.map((b) => (
              <div className="card" key={b.id}>
                <h3>{b.title}</h3>
                <p className="muted">{b.categories.length} categories &middot; {bankSize(b).toLocaleString()} clues</p>
                <div className="row">
                  <button className="btn primary" onClick={() => setBuilding(b)}>Build a game</button>
                  <button className="btn" title="Start with a blank board and choose each category and clue yourself" onClick={() => create(blankGame, `?bank=${b.id}`)}>Pick by hand</button>
                  <button className="btn bad" onClick={async () => { if (await ask(`Delete the bank "${b.title}"? Games already built from it are kept.`)) { await deleteBank(b.id); refresh(); } }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
