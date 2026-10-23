import Peer, { type DataConnection } from 'peerjs';
import type { PlayerView } from '../engine/game';
import { peerOptions } from './broker';
import { parseClientMsg, peerIdFor, type HostMsg } from './protocol';

export interface HostLinkEvents {
  /** A (re)connecting phone presented a token. Return the player id it maps to, or an error. */
  onHello(token: string, name: string, color: string): { playerId: string } | { error: 'name-taken' | 'room-locked' | 'room-full'; message: string };
  onBuzz(playerId: string, qid: string): void;
  onWager(playerId: string, amount: number): void;
  onAnswer(playerId: string, text: string): void;
  onConnection(playerId: string, connected: boolean): void;
  onStatus(status: 'connecting' | 'open' | 'error', detail?: string): void;
}

/** Runs in the host's browser. The host is the only authority; phones just send intents. */
export class HostLink {
  private peer?: Peer;
  private conns = new Map<string, DataConnection>(); // playerId -> connection
  private byConn = new Map<DataConnection, string>();
  private closed = false;

  constructor(private code: string, private ev: HostLinkEvents) {}

  start(attempt = 0) {
    this.ev.onStatus('connecting');
    const peer = new Peer(peerIdFor(this.code), peerOptions());
    this.peer = peer;
    peer.on('open', () => this.ev.onStatus('open'));
    peer.on('connection', (c) => this.accept(c));
    peer.on('disconnected', () => {
      if (!this.closed && !peer.destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      // After a host refresh the broker may still hold the old id for a few seconds.
      if (err.type === 'unavailable-id' && attempt < 8 && !this.closed) {
        peer.destroy();
        setTimeout(() => !this.closed && this.start(attempt + 1), 2000);
      } else this.ev.onStatus('error', err.type);
    });
  }

  private accept(c: DataConnection) {
    c.on('data', (raw) => {
      const msg = parseClientMsg(raw);
      if (!msg) return c.send({ k: 'error', code: 'bad-request', message: 'Bad message' } satisfies HostMsg);
      if (msg.k === 'hello') {
        const res = this.ev.onHello(msg.token, msg.name, msg.color);
        if ('error' in res) {
          c.send({ k: 'error', code: res.error, message: res.message } satisfies HostMsg);
          return;
        }
        const old = this.conns.get(res.playerId);
        if (old && old !== c) {
          this.byConn.delete(old);
          old.close();
        }
        this.conns.set(res.playerId, c);
        this.byConn.set(c, res.playerId);
        c.send({ k: 'joined' } satisfies HostMsg);
        this.ev.onConnection(res.playerId, true);
        return;
      }
      const pid = this.byConn.get(c); // identity comes from the connection, never from the payload
      if (!pid) return;
      if (msg.k === 'buzz') this.ev.onBuzz(pid, msg.qid);
      else if (msg.k === 'wager') this.ev.onWager(pid, msg.amount);
      else if (msg.k === 'answer') this.ev.onAnswer(pid, msg.text);
    });
    const gone = () => {
      const pid = this.byConn.get(c);
      if (!pid) return;
      this.byConn.delete(c);
      if (this.conns.get(pid) === c) {
        this.conns.delete(pid);
        this.ev.onConnection(pid, false);
      }
    };
    c.on('close', gone);
    c.on('error', gone);
  }

  send(playerId: string, view: PlayerView) {
    const c = this.conns.get(playerId);
    if (c?.open) c.send({ k: 'view', view } satisfies HostMsg);
  }

  kick(playerId: string) {
    const c = this.conns.get(playerId);
    if (c?.open) c.send({ k: 'error', code: 'kicked', message: 'You were removed by the host.' } satisfies HostMsg);
    setTimeout(() => c?.close(), 200);
    this.conns.delete(playerId);
    if (c) this.byConn.delete(c);
  }

  stop() {
    this.closed = true;
    this.peer?.destroy();
  }
}
