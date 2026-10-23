import Peer, { type DataConnection } from 'peerjs';
import type { PlayerView } from '../engine/game';
import { peerOptions, type Broker } from './broker';
import { peerIdFor, type ClientMsg, type HostMsg } from './protocol';

export type LinkStatus = 'connecting' | 'online' | 'reconnecting' | 'failed';

export interface PlayerLinkEvents {
  onView(v: PlayerView): void;
  onStatus(s: LinkStatus): void;
  onError(code: string, message: string): void;
}

/** Phone side. Reconnects automatically; the host re-sends the full authorised view on every (re)join. */
export class PlayerLink {
  private peer?: Peer;
  private conn?: DataConnection;
  private stopped = false;
  private retry?: ReturnType<typeof setTimeout>;
  private fatal = false;

  constructor(
    private code: string,
    private me: { token: string; name: string; color: string },
    private ev: PlayerLinkEvents,
    private broker: Broker | null = null,
  ) {}

  start() {
    this.ev.onStatus('connecting');
    const opts = peerOptions(this.broker);
    this.peer = opts ? new Peer(opts) : new Peer();
    this.peer.on('open', () => this.dial());
    this.peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') {
        this.ev.onError('no-room', 'Room not found. Check the code, and make sure the host has the game open.');
        this.fatal = true;
        this.ev.onStatus('failed');
      } else this.scheduleRetry();
    });
    this.peer.on('disconnected', () => this.peer?.reconnect());
  }

  private dial() {
    if (this.stopped || this.fatal) return;
    const c = this.peer!.connect(peerIdFor(this.code), { reliable: true });
    this.conn = c;
    c.on('open', () => c.send({ k: 'hello', ...this.me } satisfies ClientMsg));
    c.on('data', (raw) => {
      const m = raw as HostMsg;
      if (m.k === 'view') {
        this.ev.onStatus('online');
        this.ev.onView(m.view);
      } else if (m.k === 'error') {
        this.fatal = true;
        this.ev.onError(m.code, m.message);
        this.ev.onStatus('failed');
      }
    });
    c.on('close', () => this.scheduleRetry());
    c.on('error', () => this.scheduleRetry());
  }

  private scheduleRetry() {
    if (this.stopped || this.fatal) return;
    this.ev.onStatus('reconnecting');
    clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      if (this.stopped || this.fatal) return;
      if (this.peer && !this.peer.destroyed && !this.peer.disconnected) this.dial();
      else {
        this.peer?.destroy();
        this.start();
      }
    }, 1500);
  }

  buzz(qid: string) {
    if (this.conn?.open) this.conn.send({ k: 'buzz', qid } satisfies ClientMsg);
  }

  wager(amount: number) {
    if (this.conn?.open) this.conn.send({ k: 'wager', amount } satisfies ClientMsg);
  }

  answer(text: string) {
    if (this.conn?.open) this.conn.send({ k: 'answer', text } satisfies ClientMsg);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    this.peer?.destroy();
  }
}
