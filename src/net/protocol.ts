import type { PlayerView } from '../engine/game';

export const PEER_PREFIX = 'qss-';
// Unambiguous characters only (no 0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 3-2-1 shown before the buzzer opens. The host opens it after COUNTDOWN_FROM * COUNTDOWN_STEP_MS. */
export const COUNTDOWN_FROM = 3;
export const COUNTDOWN_STEP_MS = 500;

/** Tapping before the host arms the buzzer locks that player out of buzzing for this long. */
export const BUZZ_PENALTY_MS = 1500;

export const makeRoomCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ALPHABET[b % ALPHABET.length]).join('');

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
export const peerIdFor = (code: string) => PEER_PREFIX + code;

/** Player -> host */
export type ClientMsg =
  | { k: 'hello'; token: string; name: string; color: string }
  | { k: 'buzz'; qid: string }
  | { k: 'wager'; amount: number }
  | { k: 'answer'; text: string };

/** Host -> player */
export type HostMsg =
  | { k: 'view'; view: PlayerView }
  | { k: 'joined' }
  | { k: 'error'; code: 'name-taken' | 'room-locked' | 'room-full' | 'bad-request' | 'kicked'; message: string };

/** Defensive parsing: data channels carry arbitrary JSON from arbitrary browsers. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.k === 'buzz' && typeof m.qid === 'string' && m.qid.length < 64) return { k: 'buzz', qid: m.qid };
  if (m.k === 'wager' && typeof m.amount === 'number' && Number.isFinite(m.amount)) return { k: 'wager', amount: m.amount };
  if (m.k === 'answer' && typeof m.text === 'string') return { k: 'answer', text: m.text.slice(0, 200) };
  if (m.k === 'hello' && typeof m.token === 'string' && typeof m.name === 'string' && typeof m.color === 'string') {
    const name = m.name.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name || m.token.length < 8 || m.token.length > 64 || !/^#[0-9a-fA-F]{6}$/.test(m.color)) return null;
    return { k: 'hello', token: m.token, name, color: m.color };
  }
  return null;
}

export const PRESENT_CHANNEL = "qss-present";
export const PUBLIC_KEY = "qss:public";
