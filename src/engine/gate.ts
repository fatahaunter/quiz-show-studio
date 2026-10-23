import type { GameState } from './game';

/**
 * Anti-spam gate in front of the engine's `buzz` action.
 * Pressing while a clue is open but the host has NOT armed the buzzer locks that player out of
 * buzzing for `penaltyMs`. Buzzes during the lockout are dropped. Buzzes after a winner exists or
 * after the clue resolves are not penalised (those are just slow taps).
 */
export function createBuzzGate(penaltyMs: number, clock: () => number = Date.now) {
  const until = new Map<string, number>();
  return {
    /** true = pass the buzz on to the engine; false = ignore it. */
    admit(playerId: string, s: GameState | null | undefined): boolean {
      const now = clock();
      if ((until.get(playerId) ?? 0) > now) return false;
      if (s?.phase === 'clue' && (s.current?.buzzer === 'disabled' || s.current?.buzzer === 'countdown')) until.set(playerId, now + penaltyMs);
      return true;
    },
    remaining(playerId: string) {
      return Math.max(0, (until.get(playerId) ?? 0) - clock());
    },
  };
}
