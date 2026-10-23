import { useEffect, useState } from 'react';
import { COUNTDOWN_STEP_MS, COUNTDOWN_FROM } from '../net/protocol';
import { sfx } from '../sound';

/** Quick visual 3-2-1. Purely cosmetic: the host's timer decides when the buzzer really opens. */
export default function Countdown({ className = '' }: { className?: string }) {
  const [n, setN] = useState(COUNTDOWN_FROM);

  useEffect(() => {
    sfx.tick();
    const t = setInterval(() => {
      setN((x) => {
        if (x <= 1) return 1;
        sfx.tick();
        return x - 1;
      });
    }, COUNTDOWN_STEP_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <span className={`countdown ${className}`} key={n} aria-live="assertive" aria-label={`${n}`}>
      {n}
    </span>
  );
}
