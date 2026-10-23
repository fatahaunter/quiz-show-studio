import type { PeerJSOption } from 'peerjs';

/**
 * Signaling ("broker") server used to introduce a phone to the host. By default the free public
 * PeerJS server. A custom one lets you play with no internet at all, e.g. `npx peerjs --port 9000`
 * running on the host PC, with everyone on the same Wi-Fi.
 */
export interface Broker {
  host: string;
  port: number;
  secure: boolean;
}

const KEY = 'qss:broker';

export function parseBroker(s: string): Broker | null {
  // host:port or host:port:s (s = secure / https). Host may be an IPv4 address or a name.
  const m = /^([A-Za-z0-9.-]+):(\d{2,5})(?::(s))?$/.exec(s.trim());
  if (!m) return null;
  const port = Number(m[2]);
  return port > 0 && port < 65536 ? { host: m[1], port, secure: m[3] === 's' } : null;
}

export const formatBroker = (b: Broker) => `${b.host}:${b.port}${b.secure ? ':s' : ''}`;

export function getBroker(): Broker | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseBroker(raw) : null;
  } catch {
    return null;
  }
}

export function setBroker(b: Broker | null) {
  try {
    if (b) localStorage.setItem(KEY, formatBroker(b));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Options for `new Peer(...)`; undefined means the public server. */
export const peerOptions = (b: Broker | null = getBroker()): PeerJSOption | undefined =>
  b ? { host: b.host, port: b.port, secure: b.secure, path: '/', key: 'peerjs' } : undefined;
