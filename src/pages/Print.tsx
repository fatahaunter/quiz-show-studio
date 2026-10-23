import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { loadGame } from '../store/storage';
import type { Game } from '../types';

/** Printable clue sheet (for players) and host answer key. */
export default function Print() {
  const { id } = useParams();
  const [g, setG] = useState<Game | null | undefined>(undefined);
  useEffect(() => void loadGame(id!).then((x) => setG(x ?? null)), [id]);
  if (g === undefined) return <div className="page muted">Loading&hellip;</div>;
  if (g === null) return <div className="page">Game not found.</div>;

  return (
    <div className="page print">
      <div className="row noprint" style={{ marginBottom: 16 }}>
        <button className="btn primary" onClick={() => window.print()}>Print</button>
        <span className="muted">Page 1 is the host answer key; page 2 lists the clues without answers.</span>
      </div>

      <section>
        <h1>{g.title} &mdash; Host answer key</h1>
        {g.categories.map((c) => (
          <div key={c.id} className="print-cat">
            <h3>{c.name}</h3>
            <table>
              <tbody>
                {c.questions.map((q) => (
                  <tr key={q.id}>
                    <td className="v">{q.value}{q.dailyDouble ? ' DD' : ''}</td>
                    <td>{q.clue}</td>
                    <td><b>{q.answer}</b>{q.alts.length > 0 && <span className="muted"> ({q.alts.join(', ')})</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {g.final && (
          <div className="print-cat">
            <h3>Final &mdash; {g.final.category}</h3>
            <p>{g.final.clue} &rarr; <b>{g.final.answer}</b></p>
          </div>
        )}
      </section>

      <section className="pagebreak">
        <h1>{g.title} &mdash; Clues</h1>
        {g.categories.map((c) => (
          <div key={c.id} className="print-cat">
            <h3>{c.name}</h3>
            <ol>{c.questions.map((q) => <li key={q.id}>({q.value}) {q.clue}</li>)}</ol>
          </div>
        ))}
      </section>
    </div>
  );
}
