import { useEffect } from 'react';

/** Keeps the screen on while mounted (phones sleeping mid-game drop the buzzer). No-op where unsupported. */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let dead = false;
    const acquire = async () => {
      try {
        if (!dead && document.visibilityState === 'visible') lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        /* denied or unsupported */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      dead = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, []);
}
