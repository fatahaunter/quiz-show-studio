import { useEffect, useRef, useState } from 'react';
import Screen from '../components/Screen';
import type { PublicView } from '../engine/game';
import { sfx, unlockAudio } from '../sound';
import { PRESENT_CHANNEL, PUBLIC_KEY } from '../net/protocol';

/** Second-screen view. Receives only the public projection of the game from the host window. */
export default function Present() {
  const [v, setV] = useState<PublicView | null>(() => {
    try { return JSON.parse(localStorage.getItem(PUBLIC_KEY) || 'null'); } catch { return null; }
  });
  const prev = useRef<PublicView | null>(v);

  useEffect(() => {
    const bc = new BroadcastChannel(PRESENT_CHANNEL);
    bc.onmessage = (e) => { if (e.data && typeof e.data === 'object') setV(e.data as PublicView); };
    bc.postMessage('hello'); // ask the host window for the current state
    return () => bc.close();
  }, []);

  // Audience-facing cues on the presentation machine.
  useEffect(() => {
    const p = prev.current?.clue, n = v?.clue;
    if (n && n.buzzer === 'armed' && p?.buzzer !== 'armed') sfx.armed();
    if (n && n.buzzer === 'awarded' && p?.buzzer !== 'awarded') sfx.buzz();
    prev.current = v;
  }, [v]);

  return (
    <div onClick={unlockAudio}>
      {v ? <Screen v={v} /> : (
        <div className="screen"><div className="clue"><div className="text">Waiting for the host&hellip;</div>
          <div className="muted">Open this window from the host page (Open presentation window).</div></div></div>
      )}
    </div>
  );
}
