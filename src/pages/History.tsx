import { useConfirm } from '../components/Confirm';
import { useState } from 'react';
import { clearHistory, loadHistory, totals } from '../store/history';

export default function History() {
  const [ask, dialog] = useConfirm();
  const [h, setH] = useState(loadHistory);
  const t = totals(h);
  return (
    <div className="page">
      {dialog}
      <div className="row">
        <h1 className="grow">Scoreboard &amp; history</h1>
        {h.length > 0 && <button className="btn bad" onClick={async () => { if (await ask('Delete all saved game results on this device?')) { clearHistory(); setH([]); } }}>Clear</button>}
      </div>
      {h.length === 0 ? (
        <div className="card"><p className="muted">Finished games show up here with all-time player stats. Everything is calculated from real game results stored in this browser.</p></div>
      ) : (
        <>
          <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
            <h2>All-time leaderboard</h2>
            <table className="tbl">
              <thead><tr><th>Player</th><th>Games</th><th>Wins</th><th>Win rate</th><th>Points</th><th>Best</th><th>Accuracy</th></tr></thead>
              <tbody>
                {t.map((p) => (
                  <tr key={p.name}>
                    <td><b>{p.name}</b></td><td>{p.games}</td><td>{p.wins}</td><td>{Math.round((p.wins / p.games) * 100)}%</td><td>{p.points}</td><td>{p.best}</td>
                    <td>{p.correct + p.incorrect ? `${Math.round((p.correct / (p.correct + p.incorrect)) * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Players are matched by name. A &ldquo;win&rdquo; is finishing first in a game with at least two players.</p>
          </div>
          <h2>Recent games</h2>
          <div className="grid">
            {h.slice(0, 30).map((g) => (
              <div className="card" key={g.id}>
                <h3>{g.title}</h3>
                <div className="muted">{new Date(g.at).toLocaleString()}</div>
                <ol>{g.standings.map((s) => <li key={s.name}>{s.name} &mdash; {s.score}</li>)}</ol>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
