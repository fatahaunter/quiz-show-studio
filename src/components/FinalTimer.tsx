import { useEffect, useMemo, useState } from 'react';

/**
 * Countdown to a host-set deadline. `sentAt` is the host's clock when the view was built, so we
 * measure against the host's clock instead of trusting this device's.
 */
export default function FinalTimer({ deadline, sentAt, className = '' }: { deadline: number; sentAt?: number; className?: string }) {
  const offset = useMemo(() => (sentAt === undefined ? 0 : sentAt - Date.now()), [deadline, sentAt]);
  const left = () => Math.max(0, Math.ceil((deadline - (Date.now() + offset)) / 1000));
  const [s, setS] = useState(left);
  useEffect(() => {
    setS(left());
    const t = setInterval(() => setS(left()), 200);
    return () => clearInterval(t);
  }, [deadline, offset]);
  return (
    <span className={`ftimer${s <= 5 ? ' low' : ''} ${className}`} role="timer" aria-label={`${s} seconds left`}>
      {s}s
    </span>
  );
}
